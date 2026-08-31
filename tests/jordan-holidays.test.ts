import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_DEVICE_SETTINGS, normalizeAppData } from "../lib/booking-model";
import { WEEKDAY_LABELS, normalizeWeekdayFormat } from "../lib/gregorian-calendar";
import { jordanianHolidayOn, jordanianHolidaysForMonth, upcomingJordanianHolidays } from "../lib/jordan-holidays";

const source = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

describe("configurable weekday labels", () => {
  it("provides the four weekday label formats with a fixed Sunday-first order", () => {
    expect(WEEKDAY_LABELS["ar-short"]).toEqual(["سب", "أح", "إث", "ثلا", "أرب", "خم", "جم"]);
    expect(WEEKDAY_LABELS["ar-letter"]).toEqual(["س", "ح", "ن", "ث", "ر", "خ", "ج"]);
    expect(WEEKDAY_LABELS["en-short"]).toEqual(["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(WEEKDAY_LABELS["en-letter"]).toEqual(["S", "S", "M", "T", "W", "T", "F"]);
    expect(WEEKDAY_LABELS["ar-short"]).toHaveLength(7);
  });

  it("normalizes saved weekday formats and falls back to Arabic short labels", () => {
    expect(normalizeWeekdayFormat("en-letter")).toBe("en-letter");
    expect(normalizeWeekdayFormat("unknown")).toBe("ar-short");
  });

  it("defaults the device to Arabic short weekday labels", () => {
    expect(DEFAULT_DEVICE_SETTINGS.weekdayFormat).toBe("ar-short");
  });

  it("migrates a saved weekday format through the app data normalizer", () => {
    const migrated = normalizeAppData({ settings: { device: { weekdayFormat: "en-short" } } as never });
    expect(migrated.settings.device?.weekdayFormat).toBe("en-short");
    const legacy = normalizeAppData({ settings: { device: { timeFormat: "24h" } } as never });
    expect(legacy.settings.device?.weekdayFormat).toBe("ar-short");
  });

  it("wires the reactive weekday labels into the calendar and settings", () => {
    const calendar = source("app/(tabs)/calendar.tsx");
    const settings = source("app/(tabs)/settings.tsx");
    const preferences = source("lib/app-preferences.tsx");
    expect(calendar).toContain("WEEKDAY_LABELS[deviceSettings.weekdayFormat]");
    expect(calendar).not.toContain("day.slice(0, 3)");
    expect(settings).toContain("تفضيلات العرض والتقويم");
    expect(settings).toContain("updateDeviceSettings({ weekdayFormat: choice.value })");
    expect(preferences).toContain("normalizeWeekdayFormat(settings.device?.weekdayFormat)");
  });
});

describe("Jordanian public holidays", () => {
  it("recognizes the fixed national holidays by date", () => {
    const independence = jordanianHolidayOn("2026-05-25");
    expect(independence?.titleAr).toBe("عيد الاستقلال");
    expect(independence?.monthNameAr).toBe("أيار");
    expect(independence?.type).toBe("fixed");
    expect(jordanianHolidayOn("2026-05-01")?.titleAr).toBe("عيد العمال");
    expect(jordanianHolidayOn("2026-01-01")?.titleAr).toBe("رأس السنة الميلادية");
    expect(jordanianHolidayOn("2026-05-02")).toBeNull();
  });

  it("recognizes the lunar Eid dates seeded for the current and nearby years", () => {
    const adha = jordanianHolidayOn("2026-05-27");
    expect(adha?.titleAr).toBe("عيد الأضحى");
    expect(adha?.type).toBe("lunar");
    expect(jordanianHolidayOn("2026-03-20")?.titleAr).toBe("عيد الفطر");
  });

  it("lists a month's holidays sorted by day including fixed and lunar events", () => {
    const may = jordanianHolidaysForMonth(2026, 5);
    expect(may.map((holiday) => holiday.day)).toEqual([1, 25, 27]);
    expect(may[1].titleAr).toBe("عيد الاستقلال");
  });

  it("detects upcoming holidays within a week from a given date", () => {
    const upcoming = upcomingJordanianHolidays("2026-05-22", 7);
    const dates = upcoming.map((holiday) => `${holiday.date}:${holiday.daysAway}`);
    expect(dates).toContain("2026-05-25:3");
    expect(dates).toContain("2026-05-27:5");
  });

  it("renders the holiday indicator, frosted summary card, and task center trigger", () => {
    const calendar = source("app/(tabs)/calendar.tsx");
    const panel = source("components/daily-operations-panel.tsx");
    const index = source("app/(tabs)/index.tsx");
    expect(calendar).toContain("jordanianHolidaysForMonth(year, month)");
    expect(calendar).toContain("🇯🇴");
    expect(calendar).toContain("أعياد ومناسبات رسمية");
    expect(panel).toContain("onHolidayPricingPress?.(");
    expect(panel).toContain("تسعيرة العطلات");
    expect(index).toContain("upcomingJordanianHolidays(today, 7)");
    expect(index).toContain("holidayPricing");
  });
});