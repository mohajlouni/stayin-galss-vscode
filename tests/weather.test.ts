import { describe, expect, it } from "vitest";

import { type WeatherLog } from "../lib/booking-model";
import { buildOpenMeteoUrl, buildWeatherAdvisories, buildWeatherLog, COLD_NIGHT_TEMP_C, findColdNight, findWindRainRisk, HIGH_RAIN_PERCENT, HIGH_WIND_KMH, parseOpenMeteoCurrent, parseOpenMeteoDaily, poolHeatingLabel, poolHeatingNeeded, shouldRefreshWeather, weatherCodeLabel, weatherIconName, weatherRecommendation, WEATHER_REFRESH_MS } from "../lib/weather";

function log(overrides: Partial<WeatherLog> = {}): WeatherLog {
  return {
    id: "w-1",
    chaletId: "c-1",
    fetchedAt: "2026-08-30T06:00:00.000Z",
    latitude: 32.36,
    longitude: 36.01,
    current: { temperature: 26, windSpeed: 12, weatherCode: 1 },
    daily: [
      { date: "2026-08-31", temperatureMax: 32, temperatureMin: 24, windSpeedMax: 14, precipitationProbabilityMax: 10, uvIndexMax: 7, weatherCode: 1 },
      { date: "2026-09-01", temperatureMax: 28, temperatureMin: 17, windSpeedMax: 42, precipitationProbabilityMax: 70, uvIndexMax: 4, weatherCode: 80 },
      { date: "2026-09-02", temperatureMax: 30, temperatureMin: 21, windSpeedMax: 10, precipitationProbabilityMax: 20, uvIndexMax: 5, weatherCode: 2 },
      { date: "2026-09-03", temperatureMax: 31, temperatureMin: 22, windSpeedMax: 9, precipitationProbabilityMax: 5, uvIndexMax: 6, weatherCode: 0 },
      { date: "2026-09-04", temperatureMax: 29, temperatureMin: 19, windSpeedMax: 8, precipitationProbabilityMax: 0, uvIndexMax: 4, weatherCode: 3 },
      { date: "2026-09-05", temperatureMax: 27, temperatureMin: 16, windSpeedMax: 11, precipitationProbabilityMax: 30, uvIndexMax: 2, weatherCode: 61 },
      { date: "2026-09-06", temperatureMax: 26, temperatureMin: 15, windSpeedMax: 12, precipitationProbabilityMax: 40, uvIndexMax: 1, weatherCode: 95 },
    ],
    generatedAt: "2026-08-30T06:00:00.000Z",
    ...overrides,
  };
}

const chalet = { id: "c-1", name: "النوح", hasHeatedPool: true };

describe("weather client", () => {
  it("builds the Open-Meteo endpoint with coordinates and forecast fields", () => {
    const url = buildOpenMeteoUrl(32.36, 36.01);
    expect(url).toContain("api.open-meteo.com/v1/forecast");
    expect(url).toContain("latitude=32.36");
    expect(url).toContain("longitude=36.01");
    expect(url).toContain("current_weather=true");
    expect(url).toContain("timezone=auto");
    expect(url).toContain("daily=weather_code");
  });

  it("normalizes the daily arrays, clips to 7 days and clamps values", () => {
    const payload = {
      daily: {
        time: ["2026-09-01", "2026-09-02", "bad-date", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"],
        temperature_2m_max: [30, 28, 31, 32, 33, 27, 26, 25, 24, 23],
        temperature_2m_min: [18, 16, 20, 19, 18, 17, 16, 15, 14, 13],
        precipitation_probability_max: [10, 120, 8, -5, 40, 60, 70, 80, 90, 100],
        uv_index_max: [4, 2, 9, 7, 6, 5, 4, 3, 2, 1],
      },
    };
    const daily = parseOpenMeteoDaily(payload);
    expect(daily).toHaveLength(7);
    expect(daily[0].date).toBe("2026-09-01");
    expect(daily[1].date).toBe("2026-09-02");
    expect(daily.some((day) => day.date === "bad-date")).toBe(false);
    expect(daily[1].precipitationProbabilityMax).toBe(100);
    expect(daily[1].uvIndexMax).toBe(2);
    expect(daily.every((day) => day.temperatureMin <= day.temperatureMax)).toBe(true);
  });

  it("parses current weather and tolerates a missing block", () => {
    expect(parseOpenMeteoCurrent({ current_weather: { temperature: 24.3, windspeed: 8 } })).toEqual({ temperature: 24.3, windSpeed: 8, weatherCode: 0 });
    expect(parseOpenMeteoCurrent({})).toBeUndefined();
    expect(parseOpenMeteoCurrent({ current_weather: { temperature: "warm" } })).toBeUndefined();
  });

  it("assembles a weather log snapshot", () => {
    const snapshot = buildWeatherLog("w-9", "c-4", 30, 35, { current_weather: { temperature: 20 }, daily: { time: ["2026-09-02"], temperature_2m_max: [25] } }, "2026-08-30T10:00:00.000Z");
    expect(snapshot.id).toBe("w-9");
    expect(snapshot.chaletId).toBe("c-4");
    expect(snapshot.fetchedAt).toBe("2026-08-30T10:00:00.000Z");
    expect(snapshot.daily[0].date).toBe("2026-09-02");
  });

  it("refreshes when stale or missing", () => {
    expect(shouldRefreshWeather(undefined)).toBe(true);
    const now = new Date("2026-08-30T12:00:00Z").getTime();
    expect(shouldRefreshWeather(log({ fetchedAt: new Date(now - 1000).toISOString() }), now)).toBe(false);
    expect(shouldRefreshWeather(log({ fetchedAt: new Date(now - WEATHER_REFRESH_MS - 1000).toISOString() }), now)).toBe(true);
  });
});

describe("weather advisories", () => {
  it("flags the earliest cold night below the heating point", () => {
    const night = findColdNight(log(), "2026-08-30T12:00:00Z");
    expect(night?.date).toBe("2026-09-01");
    expect(night?.temperatureMin).toBeLessThan(COLD_NIGHT_TEMP_C);
  });

  it("flags the earliest wind or rain risk day", () => {
    const risk = findWindRainRisk(log());
    expect(risk?.date).toBe("2026-09-01");
    const calm = log({ daily: log().daily.map((day) => ({ ...day, windSpeedMax: 5, precipitationProbabilityMax: 5 })) });
    expect(findWindRainRisk(calm)).toBeUndefined();
  });

  it("builds advisories with the right recipients and suppresses pool heating without a heater", () => {
    const advisories = buildWeatherAdvisories(log(), chalet, "ar");
    const cold = advisories.find((item) => item.kind === "cold_pool_heating");
    const risk = advisories.find((item) => item.kind === "wind_rain_safety");
    expect(cold).toBeDefined();
    expect(cold?.recipients).toEqual(["guard"]);
    expect(risk).toBeDefined();
    expect(risk?.recipients).toEqual(["guard", "manager", "owner"]);
    const withoutHeater = buildWeatherAdvisories(log(), { ...chalet, hasHeatedPool: false });
    expect(withoutHeater.some((item) => item.kind === "cold_pool_heating")).toBe(false);
    const waveCalm = buildWeatherAdvisories(log({ daily: log().daily.map((day) => ({ ...day, temperatureMin: 22, windSpeedMax: 5, precipitationProbabilityMax: 5 })) }), chalet, "en");
    expect(waveCalm).toEqual([]);
  });

  it("prioritizes the recommendation tags", () => {
    expect(weatherRecommendation(log(), chalet, "ar").kind).toBe("cold_pool");
    const nowarm = log({ daily: log().daily.map((day) => ({ ...day, temperatureMin: 22, windSpeedMax: 42, precipitationProbabilityMax: 70 })) });
    expect(weatherRecommendation(nowarm, chalet, "en").kind).toBe("storm_secure");
    expect(weatherRecommendation(log({ daily: [] }), chalet).kind).toBe("clear");
  });

  it("exposes pool heating decisions and labels", () => {
    expect(poolHeatingNeeded(log(), chalet)).toBe(true);
    expect(poolHeatingLabel(log(), chalet, "ar")).toContain("تدفئة");
    expect(poolHeatingLabel(log(), { ...chalet, hasHeatedPool: false }, "ar")).toContain("بلا");
    expect(poolHeatingLabel(log({ daily: [] }), chalet, "en")).toBe("No heating needed");
  });
});

describe("weather code presentation", () => {
  it("labels WMO code groups", () => {
    expect(weatherCodeLabel(0, "ar")).toBe("صحو");
    expect(weatherCodeLabel(61, "en")).toBe("Rain");
    expect(weatherCodeLabel(95, "en")).toBe("Thunderstorm");
  });

  it("maps code groups to material icons", () => {
    expect(weatherIconName(0)).toBe("sunny");
    expect(weatherIconName(2)).toBe("partly-cloudy-day");
    expect(weatherIconName(61)).toBe("rainy");
    expect(weatherIconName(95)).toBe("thunderstorm");
    expect(weatherIconName(999)).toBe("thunderstorm");
  });
});