export type JordanianHoliday = {
  date: string;
  day: number;
  month: number;
  monthNameAr: string;
  monthNameEn: string;
  titleAr: string;
  titleEn: string;
  type: "fixed" | "lunar";
};

const JORDAN_MONTHS_AR = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];
const JORDAN_MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const FIXED_JORDANIAN_HOLIDAYS = [
  { month: 1, day: 1, titleAr: "رأس السنة الميلادية", titleEn: "New Year's Day" },
  { month: 5, day: 1, titleAr: "عيد العمال", titleEn: "Labour Day" },
  { month: 5, day: 25, titleAr: "عيد الاستقلال", titleEn: "Independence Day" },
];

const LUNAR_JORDANIAN_HOLIDAYS: Record<number, { eidFitr: string; eidAdha: string }> = {
  2024: { eidFitr: "2024-04-10", eidAdha: "2024-06-16" },
  2025: { eidFitr: "2025-03-30", eidAdha: "2025-06-06" },
  2026: { eidFitr: "2026-03-20", eidAdha: "2026-05-27" },
  2027: { eidFitr: "2027-03-09", eidAdha: "2027-05-16" },
  2028: { eidFitr: "2028-02-27", eidAdha: "2028-05-05" },
};

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildHoliday(date: string, day: number, month: number, titleAr: string, titleEn: string, type: "fixed" | "lunar"): JordanianHoliday {
  return { date, day, month, monthNameAr: JORDAN_MONTHS_AR[month - 1], monthNameEn: JORDAN_MONTHS_EN[month - 1], titleAr, titleEn, type };
}

export function jordanianHolidayOn(dateISO: string): JordanianHoliday | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const fixed = FIXED_JORDANIAN_HOLIDAYS.find((item) => item.month === month && item.day === day);
  if (fixed) return buildHoliday(dateISO, day, month, fixed.titleAr, fixed.titleEn, "fixed");
  const lunar = LUNAR_JORDANIAN_HOLIDAYS[year];
  if (!lunar) return null;
  if (lunar.eidFitr === dateISO) return buildHoliday(dateISO, day, month, "عيد الفطر", "Eid al-Fitr", "lunar");
  if (lunar.eidAdha === dateISO) return buildHoliday(dateISO, day, month, "عيد الأضحى", "Eid al-Adha", "lunar");
  return null;
}

export function jordanianHolidaysForMonth(year: number, month: number): JordanianHoliday[] {
  const holidays: JordanianHoliday[] = [];
  for (const item of FIXED_JORDANIAN_HOLIDAYS) {
    if (item.month === month) {
      holidays.push(buildHoliday(isoDate(year, month, item.day), item.day, item.month, item.titleAr, item.titleEn, "fixed"));
    }
  }
  const lunar = LUNAR_JORDANIAN_HOLIDAYS[year];
  if (lunar) {
    for (const dateISO of [lunar.eidFitr, lunar.eidAdha]) {
      const holiday = jordanianHolidayOn(dateISO);
      if (holiday && holiday.month === month) holidays.push(holiday);
    }
  }
  return holidays.sort((a, b) => a.day - b.day);
}

export function upcomingJordanianHolidays(fromISO: string, daysAhead = 7): Array<JordanianHoliday & { daysAway: number }> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromISO);
  if (!match) return [];
  const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  const upcoming: Array<JordanianHoliday & { daysAway: number }> = [];
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + offset, 12));
    const dateISO = isoDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
    const holiday = jordanianHolidayOn(dateISO);
    if (holiday) upcoming.push({ ...holiday, daysAway: offset });
  }
  return upcoming;
}