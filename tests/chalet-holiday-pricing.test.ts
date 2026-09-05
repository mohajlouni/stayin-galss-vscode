import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { configuredRateForDate, DEFAULT_SETTINGS, normalizeChaletShifts, type Chalet } from "../lib/booking-model";

const HOLIDAY = "2026-03-20";
const NORMAL = "2026-03-18";

describe("holiday per-shift pricing", () => {
  it("uses the shift holidayPrice automatically on a Jordanian holiday", () => {
    const chalet: Chalet = {
      id: "c-1",
      name: "النخلة",
      color: "#A56DD1",
      createdAt: "2026-01-01",
      shifts: [{ id: "s1", name: "المساء", startTime: "17:00", endTime: "23:00", weekdayPrice: 50, weekendPrice: 90, holidayPrice: 150, isActive: true, color: "#A56DD1" }],
    };
    expect(configuredRateForDate("morning", HOLIDAY, DEFAULT_SETTINGS, chalet, [], "s1")).toBe(150);
    expect(configuredRateForDate("morning", NORMAL, DEFAULT_SETTINGS, chalet, [], "s1")).toBe(50);
  });

  it("falls back to weekday/weekend when the shift has no holidayPrice", () => {
    const chalet: Chalet = {
      id: "c-1",
      name: "النخلة",
      color: "#A56DD1",
      createdAt: "2026-01-01",
      shifts: [{ id: "s1", name: "المساء", startTime: "17:00", endTime: "23:00", weekdayPrice: 60, weekendPrice: 100, isActive: true, color: "#A56DD1" }],
    };
    expect(configuredRateForDate("morning", NORMAL, DEFAULT_SETTINGS, chalet, [], "s1")).toBe(60);
    expect(configuredRateForDate("morning", HOLIDAY, DEFAULT_SETTINGS, chalet, [], "s1")).toBe(100);
  });

  it("preserves holidayPrice through shift normalization", () => {
    const shifts = normalizeChaletShifts([{ id: "s9", name: "السهرة", startTime: "20:00", endTime: "02:00", weekdayPrice: 40, weekendPrice: 70, holidayPrice: 120, isActive: true }]);
    expect(shifts[0]?.holidayPrice).toBe(120);
  });
});

describe("chalet profile holiday & wheel picker markers", () => {
  const source = readFileSync("app/chalet-profile.tsx", "utf8");

  it("renders the compact shift header and three inline price fields", () => {
    expect(source).toContain("سعر العطلة");
    expect(source).toContain("سعر نهاية الأسبوع");
    expect(source.indexOf("سعر وسط الأسبوع")).toBeLessThan(source.indexOf("سعر نهاية الأسبوع"));
    expect(source).toContain("shiftColorDot");
    expect(source).toContain("togglePill");
    expect(source).toContain("timeButton");
  });

  it("replaces manual time typing with a wheel time picker", () => {
    expect(source).toContain("DateTimePicker");
    expect(source).toContain('mode="time"');
    expect(source).toContain("timePicker");
  });
});
