import { type Chalet, type NotificationRecipient, type WeatherCurrent, type WeatherDaily, type WeatherLog } from "./booking-model";

/** Cold-night heating threshold in degrees Celsius. */
export const COLD_NIGHT_TEMP_C = 18;
/** High-wind trigger in km/h. */
export const HIGH_WIND_KMH = 35;
/** Rain-probability trigger in percent. */
export const HIGH_RAIN_PERCENT = 60;
/** Forecast cache TTL used by the widget (6 hours). */
export const WEATHER_REFRESH_MS = 6 * 60 * 60 * 1000;

/** Optional per-workspace overrides applied by the weather engine. */
export type WeatherOptions = {
  enabled?: boolean;
  coldPoolThresholdC?: number;
  recipients?: Partial<Record<NotificationRecipient, boolean>>;
};

const DAILY_FIELDS = "weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max,uv_index_max";

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function clampProbability(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isoDate(pivot: Date) {
  return `${pivot.getUTCFullYear()}-${String(pivot.getUTCMonth() + 1).padStart(2, "0")}-${String(pivot.getUTCDate()).padStart(2, "0")}`;
}

function parseDateOnly(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Local calendar date (YYYY-MM-DD) at the given instant. */
export function localDateOnly(reference = new Date().toISOString()) {
  const date = new Date(reference);
  return isoDate(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
}

/** Returns the next calendar day (YYYY-MM-DD) after the reference instant. */
export function nextDateOnly(reference = new Date().toISOString()) {
  const pivot = parseDateOnly(localDateOnly(reference));
  pivot.setUTCDate(pivot.getUTCDate() + 1);
  return isoDate(pivot);
}

/** Builds the Open-Meteo forecast endpoint for a chalet's coordinates. */
export function buildOpenMeteoUrl(latitude: number, longitude: number) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: DAILY_FIELDS,
    current_weather: "true",
    timezone: "auto",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

type OpenMeteoDaily = {
  time?: unknown;
  weathercode?: unknown;
  temperature_2m_max?: unknown;
  temperature_2m_min?: unknown;
  wind_speed_10m_max?: unknown;
  precipitation_probability_max?: unknown;
  uv_index_max?: unknown;
};

/** Maps the raw daily arrays into normalized daily records (max 7 entries). */
export function parseOpenMeteoDaily(payload: unknown): WeatherDaily[] {
  if (!payload || typeof payload !== "object") return [];
  const daily = (payload as { daily?: unknown }).daily;
  if (!daily || typeof daily !== "object") return [];
  const data = daily as OpenMeteoDaily;
  const times = Array.isArray(data.time) ? data.time : [];
  const at = (values: unknown): ((index: number) => number | undefined) => {
    const list = Array.isArray(values) ? values : [];
    return (index: number) => {
      const value = list[index];
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    };
  };
  return times.flatMap((entry, index) => {
    if (typeof entry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry)) return [];
    const temperatureMax = at(data.temperature_2m_max)(index);
    const temperatureMin = at(data.temperature_2m_min)(index);
    if (temperatureMax === undefined && temperatureMin === undefined) return [];
    const min = temperatureMin ?? temperatureMax ?? 0;
    const max = temperatureMax ?? temperatureMin ?? 0;
    const weatherCode = at(data.weathercode)(index);
    return [{
      date: entry,
      temperatureMax: round1(max),
      temperatureMin: round1(Math.min(min, max)),
      windSpeedMax: round1(at(data.wind_speed_10m_max)(index) ?? 0),
      precipitationProbabilityMax: clampProbability(at(data.precipitation_probability_max)(index) ?? 0),
      uvIndexMax: Math.max(0, Math.round(at(data.uv_index_max)(index) ?? 0)),
      weatherCode: Number.isInteger(weatherCode) ? weatherCode! : 0,
    } satisfies WeatherDaily];
  }).slice(0, 7);
}

/** Parses the current_weather block when the API provides it. */
export function parseOpenMeteoCurrent(payload: unknown): WeatherCurrent | undefined {
  const current = (payload as { current_weather?: unknown } | undefined)?.current_weather;
  if (!current || typeof current !== "object") return undefined;
  const item = current as { temperature?: unknown; windspeed?: unknown; weathercode?: unknown };
  const temperature = typeof item.temperature === "number" && Number.isFinite(item.temperature) ? item.temperature : undefined;
  if (temperature === undefined) return undefined;
  const windSpeed = typeof item.windspeed === "number" && Number.isFinite(item.windspeed) ? item.windspeed : 0;
  const weatherCode = typeof item.weathercode === "number" && Number.isInteger(item.weathercode) ? item.weathercode : 0;
  return { temperature: round1(temperature), windSpeed: round1(windSpeed), weatherCode };
}

/** Assembles a persisted weather snapshot from the Open-Meteo response. */
export function buildWeatherLog(id: string, chaletId: string, latitude: number, longitude: number, payload: unknown, fetchedAt = new Date().toISOString()): WeatherLog {
  return { id, chaletId, fetchedAt, latitude, longitude, current: parseOpenMeteoCurrent(payload), daily: parseOpenMeteoDaily(payload), generatedAt: fetchedAt };
}

/** True when the cached log is older than the refresh window (or absent). */
export function shouldRefreshWeather(log: WeatherLog | undefined, now = Date.now()) {
  if (!log) return true;
  return now - new Date(log.fetchedAt).getTime() > WEATHER_REFRESH_MS;
}

export type WeatherAdvisoryKind = "cold_pool_heating" | "wind_rain_safety";
export type WeatherAdvisory = { kind: WeatherAdvisoryKind; date: string; message: string; recipients: NotificationRecipient[] };

/** The earliest upcoming night whose forecast minimum is below the heating point. */
export function findColdNight(log: WeatherLog, reference?: string, coldThreshold: number = COLD_NIGHT_TEMP_C) {
  const base = reference ?? log.generatedAt;
  const candidates = [nextDateOnly(base), nextDateOnly(nextDateOnly(base))];
  return log.daily.find((day) => candidates.includes(day.date) && day.temperatureMin < coldThreshold);
}

/** The earliest upcoming day with wind or rain above the safety thresholds. */
export function findWindRainRisk(log: WeatherLog) {
  return log.daily.find((day) => day.windSpeedMax >= HIGH_WIND_KMH || day.precipitationProbabilityMax > HIGH_RAIN_PERCENT);
}

/** Operational advisory messages derived from the forecast and the chalet profile. */
export function buildWeatherAdvisories(log: WeatherLog, chalet: Pick<Chalet, "id" | "name" | "hasHeatedPool">, language: "ar" | "en" = "ar", options: WeatherOptions = {}): WeatherAdvisory[] {
  if (options.enabled === false) return [];
  const advisories: WeatherAdvisory[] = [];
  const coldThreshold = options.coldPoolThresholdC ?? COLD_NIGHT_TEMP_C;
  if (chalet.hasHeatedPool !== false) {
    const coldNight = findColdNight(log, undefined, coldThreshold);
    if (coldNight) {
      advisories.push({
        kind: "cold_pool_heating",
        date: coldNight.date,
        message: language === "ar" ? "تنبيه: انخفاض متوقع في درجات الحرارة ليلاً — يرجى تشغيل تدفئة المسبح وتجهيز الغطاء الحراري" : "Alert: expected overnight temperature drop — please turn on the pool heater and prep the thermal cover",
        recipients: ["guard"],
      });
    }
  }
  const risk = findWindRainRisk(log);
  if (risk) {
    advisories.push({
      kind: "wind_rain_safety",
      date: risk.date,
      message: language === "ar" ? "تنبيه: رياح قوية أو أمطار متوقعة — يرجى تثبيت المظلات الخارجية وجدولة تنظيف إضافي للمسبح قبل وصول الضيوف" : "Alert: strong wind or rain expected — secure outdoor umbrellas and schedule extra pool skim cleaning before guest arrival",
      recipients: ["guard", "manager", "owner"],
    });
  }
  if (options.recipients) {
    return advisories.filter((advisory) => advisory.recipients.some((recipient) => options.recipients?.[recipient] !== false));
  }
  return advisories;
}

export type WeatherRecommendation = { kind: "clear" | "cold_pool" | "storm_secure"; label: string; tone: "info" | "warning" | "danger" };

/** Automated recommendation tag shown by the widget. */
export function weatherRecommendation(log: WeatherLog, chalet: Pick<Chalet, "id" | "name" | "hasHeatedPool">, language: "ar" | "en" = "ar", coldThreshold: number = COLD_NIGHT_TEMP_C): WeatherRecommendation {
  if (chalet.hasHeatedPool !== false && findColdNight(log, undefined, coldThreshold)) {
    return { kind: "cold_pool", tone: "danger", label: language === "ar" ? "تفعيل تدفئة المسبح" : "Pool heating due" };
  }
  if (findWindRainRisk(log)) {
    return { kind: "storm_secure", tone: "warning", label: language === "ar" ? "تأمين المظلات الخارجية" : "Secure outdoor fixtures" };
  }
  return { kind: "clear", tone: "info", label: language === "ar" ? "مناسب لأنشطة التنظيف والجرد" : "Good for cleaning & inventory" };
}

/** True when heating should be enabled before the upcoming night. */
export function poolHeatingNeeded(log: WeatherLog, chalet: Pick<Chalet, "hasHeatedPool">, coldThreshold: number = COLD_NIGHT_TEMP_C) {
  return chalet.hasHeatedPool !== false && Boolean(findColdNight(log, undefined, coldThreshold));
}

/** Human label for the pool heating readiness chip. */
export function poolHeatingLabel(log: WeatherLog, chalet: Pick<Chalet, "hasHeatedPool">, language: "ar" | "en" = "ar", coldThreshold: number = COLD_NIGHT_TEMP_C) {
  if (chalet.hasHeatedPool === false) return language === "ar" ? "بلا تدفئة للمسبح" : "No pool heater";
  if (poolHeatingNeeded(log, chalet, coldThreshold)) return language === "ar" ? "تحضير التدفئة ليلاً" : "Heat prep needed tonight";
  return language === "ar" ? "لا حاجة للتدفئة" : "No heating needed";
}

/** Arabic/English label for a WMO weather code group. */
export function weatherCodeLabel(code: number, language: "ar" | "en" = "ar"): string {
  const clouds = "غائم جزئيًا";
  if (code === 0) return language === "ar" ? "صحو" : "Clear";
  if (code === 1) return language === "ar" ? "صحو غالبًا" : "Mostly clear";
  if (code === 2) return language === "ar" ? clouds : "Partly cloudy";
  if (code === 3) return language === "ar" ? "غائم" : "Overcast";
  if (code === 45 || code === 48) return language === "ar" ? "ضباب" : "Fog";
  if (code >= 51 && code <= 57) return language === "ar" ? "رذاذ" : "Drizzle";
  if (code >= 61 && code <= 67) return language === "ar" ? "أمطار" : "Rain";
  if (code >= 71 && code <= 77) return language === "ar" ? "ثلوج" : "Snow";
  if (code >= 80 && code <= 82) return language === "ar" ? "زخات مطر" : "Rain showers";
  if (code >= 85 && code <= 86) return language === "ar" ? "زخات ثلج" : "Snow showers";
  if (code >= 95) return language === "ar" ? "عواصف رعدية" : "Thunderstorm";
  return language === "ar" ? "غير محددة" : "Unknown";
}

/** Icon name (MaterialIcons) matching a weather code group. */
export function weatherIconName(code: number): "sunny" | "partly-cloudy-day" | "cloud" | "rainy" | "snowing" | "thunderstorm" | "foggy" {
  if (code === 0 || code === 1) return "sunny";
  if (code === 2) return "partly-cloudy-day";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "foggy";
  if (code >= 51 && code <= 67) return "rainy";
  if (code >= 71 && code <= 86) return "snowing";
  if (code >= 95) return "thunderstorm";
  return "cloud";
}