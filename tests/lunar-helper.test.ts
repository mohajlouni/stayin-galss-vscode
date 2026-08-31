import { describe, expect, it } from "vitest";

import { LUNAR_DATES_2026, lookupLunar2026 } from "../lib/lunar-dates.2026";
import {
  LUNAR_PHASE_NAMES,
  daysInMonth,
  firstWeekday,
  hijriForDate,
  hijriMonthLabel,
  isToday,
  julianDay,
  lunarPhaseForDate,
  lunarPhaseForFraction,
  monthGrid,
  toArabicDigits,
  weekdayLabels,
} from "../lib/lunar-helper";

describe("lunar phase astronomy", () => {
  it("buckets phase fractions into the eight named phases", () => {
    expect(lunarPhaseForFraction(0.0)).toBe("new");
    expect(lunarPhaseForFraction(0.02)).toBe("new");
    expect(lunarPhaseForFraction(0.1)).toBe("waxing-crescent");
    expect(lunarPhaseForFraction(0.25)).toBe("first-quarter");
    expect(lunarPhaseForFraction(0.4)).toBe("waxing-gibbous");
    expect(lunarPhaseForFraction(0.5)).toBe("full");
    expect(lunarPhaseForFraction(0.66)).toBe("waning-gibbous");
    expect(lunarPhaseForFraction(0.75)).toBe("last-quarter");
    expect(lunarPhaseForFraction(0.9)).toBe("waning-crescent");
    expect(lunarPhaseForFraction(0.98)).toBe("new");
  });

  it("matches the well-known 2026 new moons and full moon", () => {
    expect(lunarPhaseForDate(2026, 1, 18)).toBe("new");
    expect(lunarPhaseForDate(2026, 8, 13)).toBe("new");
    expect(lunarPhaseForDate(2026, 9, 14)).toBe("new");
    expect(lunarPhaseForDate(2026, 8, 27)).toBe("full");
  });

  it("exposes a display name for every phase in Arabic and English", () => {
    expect(LUNAR_PHASE_NAMES.full[0]).toBe("بدر");
    expect(LUNAR_PHASE_NAMES.full[1]).toBe("Full moon");
    expect(LUNAR_PHASE_NAMES["waxing-crescent"][0]).toBe("هلال متزايد");
  });

  it("computes a sane Julian day for the 2000 epoch", () => {
    expect(julianDay(2000, 1, 1)).toBe(2451544.5);
  });
});

describe("hijri (arithmetic Islamic calendar)", () => {
  it("anchors well-known Ramadan and Eid dates", () => {
    expect(hijriForDate(2024, 3, 11)).toEqual({ year: 1445, month: 9, day: 1 });
    expect(hijriForDate(2025, 3, 1)).toEqual({ year: 1446, month: 9, day: 1 });
    expect(hijriForDate(2026, 2, 18)).toEqual({ year: 1447, month: 9, day: 1 });
    expect(hijriForDate(2025, 3, 30)).toEqual({ year: 1446, month: 9, day: 30 });
  });

  it("treats 1 Muharram 1 AH as the civil epoch", () => {
    expect(hijriForDate(622, 7, 19)).toEqual({ year: 1, month: 1, day: 1 });
  });

  it("labels hijri months in both languages", () => {
    expect(hijriMonthLabel(9, "ar")).toBe("رمضان");
    expect(hijriMonthLabel(9, "en")).toBe("Ramadan");
    expect(hijriMonthLabel(0, "ar")).toBe("محرم");
  });
});

describe("2026 lunar snapshot", () => {
  it("covers every day of 2026", () => {
    expect(Object.keys(LUNAR_DATES_2026).length).toBe(365);
  });

  it("defaults to the same phase as the live computation", () => {
    const record = lookupLunar2026("2026-08-27");
    expect(record?.phase).toBe("full");
    expect(record?.hijriDay).toBe(hijriForDate(2026, 8, 27).day);
  });

  it("returns undefined for dates outside the snapshot", () => {
    expect(lookupLunar2026("2025-12-31")).toBeUndefined();
  });
});

describe("arabic day numbers", () => {
  it("renders 1-30 with Arabic-Indic digits", () => {
    expect(toArabicDigits(1)).toBe("١");
    expect(toArabicDigits(15)).toBe("١٥");
    expect(toArabicDigits(30)).toBe("٣٠");
    expect(toArabicDigits(2026)).toBe("٢٠٢٦");
  });
});

describe("calendar grid helpers", () => {
  it("counts days correctly including leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 9)).toBe(30);
  });

  it("builds a saturday-first grid with leading blanks", () => {
    const grid = monthGrid(2026, 9);
    expect(grid.length).toBe(3 + 30);
    expect(grid.filter((cell) => cell.blank).length).toBe(3);
    expect(grid.map((cell) => (cell.blank ? 0 : cell.day)).slice(0, 6)).toEqual([0, 0, 0, 1, 2, 3]);
    expect(firstWeekday(2026, 9)).toBe(2);
  });

  it("orders weekday labels starting from Saturday", () => {
    expect(weekdayLabels("ar", true)).toEqual(["سبت", "أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"]);
    expect(weekdayLabels("en")[0]).toBe("Saturday");
    expect(weekdayLabels("en")[6]).toBe("Friday");
  });

  it("detects today by string key", () => {
    expect(isToday("2026-08-31", "2026-08-31")).toBe(true);
    expect(isToday("2026-08-30", "2026-08-31")).toBe(false);
  });
});