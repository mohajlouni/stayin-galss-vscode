const GREGORIAN_MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const GREGORIAN_MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const GREGORIAN_MONTHS = GREGORIAN_MONTHS_AR;

export function gregorianMonthLabel(year: number, month: number, language: "ar" | "en" = "ar") {
  const months = language === "ar" ? GREGORIAN_MONTHS_AR : GREGORIAN_MONTHS_EN;
  return `${month} - ${months[month - 1]} ${year}`;
}

export function moveGregorianMonth(year: number, month: number, delta: number) {
  const value = new Date(Date.UTC(year, month - 1 + delta, 1, 12));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
}

export function gregorianMonthGrid(year: number, month: number) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const toISO = (day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const days = [...Array.from({ length: firstDay }, () => null as string | null), ...Array.from({ length: daysInMonth }, (_, index) => toISO(index + 1))];
  return [...days, ...Array.from({ length: 42 - days.length }, () => null as string | null)];
}
