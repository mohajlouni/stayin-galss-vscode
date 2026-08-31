import { type LunarPhase, daysInMonth, hijriForDate, lunarPhaseForDate } from "./lunar-helper";

/** Per-day lunar record for the 2026 snapshot (Gregorian dates, UTC noon reference). */
export type LunarDayRecord = {
  date: string;
  phase: LunarPhase;
  hijriDay: number;
  hijriMonth: number;
  hijriYear: number;
};

function keyFor(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildYear(year: number): Record<string, LunarDayRecord> {
  const records: Record<string, LunarDayRecord> = {};
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= daysInMonth(year, month); day += 1) {
      const hijri = hijriForDate(year, month, day);
      records[keyFor(year, month, day)] = { date: keyFor(year, month, day), phase: lunarPhaseForDate(year, month, day), hijriDay: hijri.day, hijriMonth: hijri.month, hijriYear: hijri.year };
    }
  }
  return records;
}

/** Authoritative 2026 lunar snapshot keyed by "YYYY-MM-DD" (used by the calendar panel). */
export const LUNAR_DATES_2026: Record<string, LunarDayRecord> = buildYear(2026);

export function lookupLunar2026(dateKey: string): LunarDayRecord | undefined {
  return LUNAR_DATES_2026[dateKey];
}