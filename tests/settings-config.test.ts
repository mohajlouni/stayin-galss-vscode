import { describe, expect, it } from "vitest";

import { DEFAULT_CONTRACT_POLICY_CONFIG, DEFAULT_DEVICE_SETTINGS, DEFAULT_HOLIDAY_PRICING_CONFIG, DEFAULT_LOYALTY_PROGRAM_CONFIG, DEFAULT_SETTINGS, DEFAULT_UTILITY_TRACKING_CONFIG, DEFAULT_WEATHER_ADVISORY_CONFIG, configuredRateForDate, effectiveContractPolicy, effectiveHolidayPricing, effectiveLoyaltyProgram, effectiveUtilityTracking, effectiveWeatherAdvisory, type Settings, type WeatherLog } from "../lib/booking-model";
import { pointsEarned, pointsValueJod, redemptionForSubtotal } from "../lib/loyalty";
import { computeUtilityCost } from "../lib/utility-readings";
import { buildWeatherAdvisories, findColdNight } from "../lib/weather";

describe("settings config defaults & overrides", () => {
  it("exposes default configs for every engine", () => {
    expect(DEFAULT_UTILITY_TRACKING_CONFIG.enabled).toBe(true);
    expect(DEFAULT_UTILITY_TRACKING_CONFIG.rates.electricity).toBe(0.12);
    expect(DEFAULT_UTILITY_TRACKING_CONFIG.thresholds.electricity).toBe(200);
    expect(DEFAULT_LOYALTY_PROGRAM_CONFIG).toMatchObject({ pointsPerJod: 10, jodPerPoint: 0.1, silverMinStays: 3, goldMinStays: 6, platinumMinStays: 10 });
    expect(DEFAULT_HOLIDAY_PRICING_CONFIG).toEqual({ enabled: false, upliftPercent: 20 });
    expect(DEFAULT_CONTRACT_POLICY_CONFIG).toEqual({ requireSignature: true, defaultDepositAmount: 30 });
    expect(DEFAULT_WEATHER_ADVISORY_CONFIG).toMatchObject({ enabled: true, coldPoolThresholdC: 18 });
    expect(DEFAULT_DEVICE_SETTINGS.guardReminderLeadMinutes).toBe(120);
  });

  it("merges partial settings overrides into canonical configs", () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, utilityTracking: { rates: { electricity: 0.2 } }, loyaltyProgram: { pointsPerJod: 5 }, holidayPricing: { enabled: true, upliftPercent: 40 }, contractPolicy: { defaultDepositAmount: 50 }, weatherAdvisory: { coldPoolThresholdC: 21 } };
    expect(effectiveUtilityTracking(settings).rates).toMatchObject({ electricity: 0.2, water: 0.75, gas_fuel: 0.9 });
    expect(effectiveLoyaltyProgram(settings).pointsPerJod).toBe(5);
    expect(effectiveHolidayPricing(settings)).toEqual({ enabled: true, upliftPercent: 40 });
    expect(effectiveContractPolicy(settings).defaultDepositAmount).toBe(50);
    expect(effectiveWeatherAdvisory(settings).coldPoolThresholdC).toBe(21);
  });

  it("clamps invalid negative values instead of breaking", () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, weatherAdvisory: { coldPoolThresholdC: -5 }, loyaltyProgram: { pointsPerJod: -2 }, utilityTracking: { thresholds: { electricity: -1 } } };
    expect(effectiveWeatherAdvisory(settings).coldPoolThresholdC).toBe(18);
    expect(effectiveLoyaltyProgram(settings).pointsPerJod).toBe(10);
    expect(effectiveUtilityTracking(settings).thresholds.electricity).toBe(200);
  });
});

describe("holiday pricing engine", () => {
  const holidaySettings: Settings = { ...DEFAULT_SETTINGS, periodPricing: { morning: { weekdayPrice: 100, weekendPrice: 100 }, evening: { weekdayPrice: 100, weekendPrice: 100 }, "24h": { weekdayPrice: 100, weekendPrice: 100 } } };

  it("applies no uplift by default", () => {
    expect(configuredRateForDate("morning", "2026-03-20", holidaySettings)).toBe(100);
  });

  it("applies the configured percent uplift on Jordanian holidays", () => {
    const enabled: Settings = { ...holidaySettings, holidayPricing: { enabled: true, upliftPercent: 20 } };
    expect(configuredRateForDate("morning", "2026-03-20", enabled)).toBe(120);
  });

  it("keeps regular dates unchanged and lets special rules win", () => {
    const enabled: Settings = { ...holidaySettings, holidayPricing: { enabled: true, upliftPercent: 50 } };
    expect(configuredRateForDate("morning", "2026-08-10", enabled)).toBe(100);
    expect(configuredRateForDate("morning", "2026-03-20", enabled, undefined, [{ id: "r1", name: "عرفة", startDate: "2026-03-20", endDate: "2026-03-20", price: 500, kind: "occasion", createdAt: "2026-01-01T00:00:00Z" }])).toBe(500);
  });
});

describe("weather advisory config", () => {
  const coldLog: WeatherLog = { id: "w-1", chaletId: "c-1", fetchedAt: "2026-08-27T12:00:00Z", latitude: 0, longitude: 0, current: { temperature: 20, windSpeed: 5, weatherCode: 2 }, daily: [{ date: "2026-08-28", temperatureMax: 21, temperatureMin: 15, windSpeedMax: 10, precipitationProbabilityMax: 10, uvIndexMax: 5, weatherCode: 2 }], generatedAt: "2026-08-27T12:00:00Z" };
  const chalet = { id: "c-1", name: "شاليه", hasHeatedPool: true };

  it("findColdNight honors a custom threshold", () => {
    expect(Boolean(findColdNight(coldLog))).toBe(true);
    expect(findColdNight(coldLog, undefined, 10)).toBeUndefined();
  });

  it("returns no advisories when the engine is disabled", () => {
    expect(buildWeatherAdvisories(coldLog, chalet, "ar", { enabled: false })).toEqual([]);
  });

  it("filters advisories by recipient opt-outs", () => {
    const advisories = buildWeatherAdvisories(coldLog, chalet, "ar", { recipients: { guard: false, manager: false, owner: false } });
    expect(advisories.some((advisory) => advisory.kind === "cold_pool_heating")).toBe(false);
  });
});

describe("loyalty program config", () => {
  it("earns points using a configured rate", () => {
    expect(pointsEarned(100, "bronze", { ...DEFAULT_LOYALTY_PROGRAM_CONFIG, pointsPerJod: 5 })).toBe(20);
    expect(pointsEarned(1000, "platinum", { ...DEFAULT_LOYALTY_PROGRAM_CONFIG, pointsPerJod: 100 })).toBe(20);
  });

  it("redeems using a configured cashback value", () => {
    const config = { ...DEFAULT_LOYALTY_PROGRAM_CONFIG, jodPerPoint: 0.2 };
    expect(redemptionForSubtotal(100, 10, config)).toEqual({ points: 50, amount: 10 });
    expect(pointsValueJod(50, config)).toBe(10);
  });
});

describe("utility tracking config", () => {
  it("bills with the configured rate and flags with the configured cap", () => {
    const cost = computeUtilityCost("electricity", 100, 350, { unitRate: 0.2, threshold: 100 });
    expect(cost).toEqual({ consumedUnits: 250, unitRate: 0.2, totalCost: 50, isExcessive: true });
    const normal = computeUtilityCost("electricity", 100, 150, { unitRate: 0.1, threshold: 999 });
    expect(normal.isExcessive).toBe(false);
  });
});