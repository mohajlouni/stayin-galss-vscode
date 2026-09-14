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

  it("pads the grid so the 1st lands in its Saturday-first weekday column", () => {
    // سبتمبر 2026 يبدأ يوم الثلاثاء؛ فمع بداية أسبوع على السبت تقع بداية الشهر في العمود الرابع (فهرس 3).
    const grid = gregorianMonthGrid(2026, 9);
    expect(grid.slice(0, 3)).toEqual([null, null, null]);
    expect(grid[3]).toBe("2026-09-01");
  });

  it("keeps every date under its true weekday column when the week starts on Saturday", () => {
    for (const month of [1, 3, 8, 9, 12]) {
      gregorianMonthGrid(2026, month).forEach((date, index) => {
        if (!date) return;
        // بترقيم getDay يكون السبت 6؛ فهرس التسمية ببداية أسبوع السبت هو (getDay + 1) % 7.
        const saturdayFirstIndex = (new Date(`${date}T12:00:00Z`).getUTCDay() + 1) % 7;
        expect(index % 7).toBe(saturdayFirstIndex);
      });
    }
  });
});
