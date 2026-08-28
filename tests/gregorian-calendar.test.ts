import { describe, expect, it } from "vitest";
import { GREGORIAN_MONTHS, gregorianMonthGrid, gregorianMonthLabel, moveGregorianMonth } from "../lib/gregorian-calendar";

describe("Gregorian calendar", () => {
  it("uses Gregorian month names and numeric month labels", () => {
    expect(gregorianMonthLabel(2026, 1)).toBe("1 - يناير 2026");
    expect(gregorianMonthLabel(2026, 8)).toBe("8 - أغسطس 2026");
    expect(GREGORIAN_MONTHS[11]).toBe("ديسمبر");
  });

  it("moves forward and backward across months", () => {
    expect(moveGregorianMonth(2026, 1, 1)).toEqual({ year: 2026, month: 2 });
    expect(moveGregorianMonth(2026, 2, 1)).toEqual({ year: 2026, month: 3 });
    expect(moveGregorianMonth(2026, 3, -1)).toEqual({ year: 2026, month: 2 });
    expect(moveGregorianMonth(2026, 2, -1)).toEqual({ year: 2026, month: 1 });
  });

  it("creates stable Gregorian ISO days without timezone shifts", () => {
    const january = gregorianMonthGrid(2026, 1).filter(Boolean) as string[];
    const february = gregorianMonthGrid(2026, 2).filter(Boolean) as string[];
    const march = gregorianMonthGrid(2026, 3).filter(Boolean) as string[];
    expect(january[0]).toBe("2026-01-01");
    expect(january.at(-1)).toBe("2026-01-31");
    expect(february[0]).toBe("2026-02-01");
    expect(february.at(-1)).toBe("2026-02-28");
    expect(march[0]).toBe("2026-03-01");
    expect(march.at(-1)).toBe("2026-03-31");
  });

  it("uses a stable six-row grid for short and long months", () => {
    expect(gregorianMonthGrid(2026, 2)).toHaveLength(42);
    expect(gregorianMonthGrid(2026, 8)).toHaveLength(42);
    expect(gregorianMonthGrid(2026, 9)).toHaveLength(42);
    expect(gregorianMonthGrid(2026, 9).filter(Boolean)).toHaveLength(30);
  });
});
