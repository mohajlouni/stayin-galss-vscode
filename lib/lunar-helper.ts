/** Lunar calendar helpers: phase codes, names, icons, glow colors, calendar grid, Arabic hijri day numbers. */

export const LUNAR_PHASE_ORDER = ["new", "waxing-crescent", "first-quarter", "waxing-gibbous", "full", "waning-gibbous", "last-quarter", "waning-crescent"] as const;
export type LunarPhase = (typeof LUNAR_PHASE_ORDER)[number];

/** Phase display names [ar, en]. */
export const LUNAR_PHASE_NAMES: Record<LunarPhase, [string, string]> = {
  "new": ["محاق", "New moon"],
  "waxing-crescent": ["هلال متزايد", "Waxing crescent"],
  "first-quarter": ["تربيع أول", "First quarter"],
  "waxing-gibbous": ["أحدب متزايد", "Waxing gibbous"],
  "full": ["بدر", "Full moon"],
  "waning-gibbous": ["أحدب متناقص", "Waning gibbous"],
  "last-quarter": ["تربيع أخير", "Last quarter"],
  "waning-crescent": ["هلال متناقص", "Waning crescent"],
};

/** MaterialIcons glyph per phase (dark → full). */
export const LUNAR_PHASE_ICONS: Record<LunarPhase, string> = {
  "new": "brightness-2",
  "waxing-crescent": "brightness-3",
  "first-quarter": "brightness-5",
  "waxing-gibbous": "brightness-6",
  "full": "brightness-7",
  "waning-gibbous": "brightness-6",
  "last-quarter": "brightness-5",
  "waning-crescent": "brightness-3",
};

/** Glow / accent color per phase (brightness rises toward full moon). */
export const LUNAR_PHASE_COLORS: Record<LunarPhase, string> = {
  "new": "#475569",
  "waxing-crescent": "#8B9BB4",
  "first-quarter": "#C6D2E4",
  "waxing-gibbous": "#E7EDF7",
  "full": "#FFD98A",
  "waning-gibbous": "#E7EDF7",
  "last-quarter": "#C6D2E4",
  "waning-crescent": "#8B9BB4",
};

/** Mean synodic month (days). */
export const SYNODIC_MONTH_DAYS = 29.530588853;
/** Julian Date (UTC noon) of the reference new moon on 2000-01-06 18:14 UTC. */
export const NEW_MOON_EPOCH_JD = 2451550.76;

/** Julian Day (at 0h UT) for a proleptic Gregorian date — Meeus integer formula. */
export function julianDay(year: number, month: number, day: number) {
  const y = month <= 2 ? year - 1 : year;
  const m = month <= 2 ? month + 12 : month;
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

/** Age of the moon in days since the reference new moon, normalized to [0, SYNODIC_MONTH_DAYS). */
export function moonAgeDays(year: number, month: number, day: number) {
  const age = (julianDay(year, month, day) - NEW_MOON_EPOCH_JD) % SYNODIC_MONTH_DAYS;
  return ((age % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
}

/** Fractional moon phase in [0, 1): 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
export function lunarPhaseFraction(year: number, month: number, day: number) {
  return moonAgeDays(year, month, day) / SYNODIC_MONTH_DAYS;
}

/**
 * Human-friendly tip for the current lunar phase (labels full moon and new/waning
 * crescent outdoor-lighting nights). Returns undefined for the other phases.
 */
export function lunarPhaseInsight(phase: LunarPhase, language: "ar" | "en"): { label: string; detail: string } | undefined {
  if (phase === "full") return language === "ar"
    ? { label: "ليلة مضيئة", detail: "مثالية للإقامة الخارجية والفعاليات — إضاءة قمرية كاملة." }
    : { label: "Bright night", detail: "Ideal for outdoor stays and events — full moonlight." };
  if (phase === "new" || phase === "waning-crescent") return language === "ar"
    ? { label: "إضاءة قمرية خافتة", detail: "يُنصح بتفعيل إضاءة النيون الخارجية." }
    : { label: "Dim moonlight", detail: "Outdoor neon lighting is recommended." };
  return undefined;
}

/**
 * Spring-tide strength in [0, 1] for a Gregorian date: peaks near new moon (0)
 * and full moon (0.5), ebbing at the quarters. 1 = strongest spring tide.
 */
export function lunarTideStrength(year: number, month: number, day: number) {
  const fraction = lunarPhaseFraction(year, month, day);
  const distance = Math.min(Math.abs(fraction), Math.abs(fraction - 1), Math.abs(fraction - 0.5));
  return Math.max(0, 1 - distance / 0.25);
}

const PHASE_BOUNDARIES = [1 / 16, 3 / 16, 5 / 16, 7 / 16, 9 / 16, 11 / 16, 13 / 16, 15 / 16];

/** Buckets the phase fraction into one of the eight named phases. */
export function lunarPhaseForFraction(fraction: number): LunarPhase {
  const bound = PHASE_BOUNDARIES.findIndex((limit) => fraction < limit);
  return LUNAR_PHASE_ORDER[bound === -1 ? 0 : bound];
}

/** Named lunar phase for a Gregorian date. */
export function lunarPhaseForDate(year: number, month: number, day: number): LunarPhase {
  return lunarPhaseForFraction(lunarPhaseFraction(year, month, day));
}

/** Rata Die fixed day count (= 1 for proleptic Gregorian 0001-01-01). */
export function fixedDay(year: number, month: number, day: number) {
  return Math.floor(julianDay(year, month, day)) - 1721425;
}

/** Islamic calendar epoch (R.D. of 1 Muharram 1 AH). */
export const ISLAMIC_EPOCH_FIXED = 227015;

/** Arithmetic (tabular Islamic / Kuwaiti-style civil) hijri date for a Gregorian date. */
export function hijriForDate(year: number, month: number, day: number) {
  const fixed = fixedDay(year, month, day);
  const islamicYear = Math.max(1, Math.floor((30 * (fixed - ISLAMIC_EPOCH_FIXED) + 10646) / 10631));
  const startOfYear = ISLAMIC_EPOCH_FIXED + Math.floor((10631 * islamicYear - 10646) / 30);
  const dayOfYear = fixed - startOfYear;
  const islamicMonth = Math.min(12, Math.floor(dayOfYear / 29.5) + 1);
  const islamicDay = dayOfYear - Math.floor((islamicMonth - 1) * 29.5) + 1;
  return { year: islamicYear, month: islamicMonth, day: Math.max(1, islamicDay) };
}

export const HIJRI_MONTH_NAMES: [string, string][] = [
  ["محرم", "Muharram"],
  ["صفر", "Safar"],
  ["ربيع الأول", "Rabi I"],
  ["ربيع الثاني", "Rabi II"],
  ["جمادى الأولى", "Jumada I"],
  ["جمادى الآخرة", "Jumada II"],
  ["رجب", "Rajab"],
  ["شعبان", "Sha'ban"],
  ["رمضان", "Ramadan"],
  ["شوال", "Shawwal"],
  ["ذو القعدة", "Dhu al-Qi'dah"],
  ["ذو الحجة", "Dhu al-Hijjah"],
];

export function hijriMonthLabel(monthIndex: number, language: "ar" | "en") {
  const label = HIJRI_MONTH_NAMES[Math.max(0, Math.min(11, monthIndex - 1))];
  return label ? label[language === "ar" ? 0 : 1] : language === "ar" ? "—" : "—";
}

const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** Renders an integer with Arabic-Indic (٠-٩) digits, defaulting to Western digits for non-numeric input. */
export function toArabicDigits(value: number | string) {
  return String(value).replace(/[0-9]/g, (digit) => ARABIC_DIGITS[Number(digit)]);
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** 1-based index of the weekday the month starts on, in JS getDay() terms (0 = Sunday). */
export function firstWeekday(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

export type DayCell = { day: number; blank: boolean };

/** Builds a calendar grid for a Gregorian month. Leading cells pad the week starting on `weekStartsOn` (getDay(): 6 = Saturday). */
export function monthGrid(year: number, month: number, weekStartsOn = 6): DayCell[] {
  const total = daysInMonth(year, month);
  const leading = (firstWeekday(year, month) - weekStartsOn + 7) % 7;
  return [...Array<DayCell>(leading).fill({ day: 0, blank: true }), ...Array.from({ length: total }, (_, index) => ({ day: index + 1, blank: false }))];
}

const FULL_WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const FULL_WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_WEEKDAY_AR = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const SHORT_WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday labels starting from Saturday (getDay index 6 → … → 5). */
export function weekdayLabels(language: "ar" | "en", short = false) {
  const full = language === "ar" ? FULL_WEEKDAY_AR : FULL_WEEKDAY_EN;
  const shortList = language === "ar" ? SHORT_WEEKDAY_AR : SHORT_WEEKDAY_EN;
  const source = short ? shortList : full;
  return [6, 0, 1, 2, 3, 4, 5].map((index) => source[index]);
}

export function isToday(dateKey: string, todayKey = new Date().toISOString().slice(0, 10)) {
  return dateKey === todayKey;
}