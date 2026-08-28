const arabicDigits: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };
const E164 = /^\+[1-9]\d{7,14}$/;

export type CountryDialingCode = { iso: string; nameAr: string; nameEn: string; code: string };
export const COUNTRY_DIALING_CODES: CountryDialingCode[] = [
  { iso: "JO", nameAr: "الأردن", nameEn: "Jordan", code: "+962" },
  { iso: "SA", nameAr: "السعودية", nameEn: "Saudi Arabia", code: "+966" },
  { iso: "AE", nameAr: "الإمارات", nameEn: "UAE", code: "+971" },
  { iso: "KW", nameAr: "الكويت", nameEn: "Kuwait", code: "+965" },
  { iso: "QA", nameAr: "قطر", nameEn: "Qatar", code: "+974" },
  { iso: "OM", nameAr: "عُمان", nameEn: "Oman", code: "+968" },
  { iso: "BH", nameAr: "البحرين", nameEn: "Bahrain", code: "+973" },
  { iso: "EG", nameAr: "مصر", nameEn: "Egypt", code: "+20" },
  { iso: "PS", nameAr: "فلسطين", nameEn: "Palestine", code: "+970" },
  { iso: "IQ", nameAr: "العراق", nameEn: "Iraq", code: "+964" },
  { iso: "TR", nameAr: "تركيا", nameEn: "Türkiye", code: "+90" },
  { iso: "US", nameAr: "الولايات المتحدة وكندا", nameEn: "United States / Canada", code: "+1" },
  { iso: "GB", nameAr: "المملكة المتحدة", nameEn: "United Kingdom", code: "+44" },
];
export const DEFAULT_COUNTRY_DIALING_CODE = COUNTRY_DIALING_CODES[0];

export type NormalizedPhone = { value: string | null; error: "invalid" | null };

/** Normalizes E.164 inputs; national numbers use the selected country dialing code. */
export function normalizeInternationalPhone(input: string | null | undefined, countryCode = DEFAULT_COUNTRY_DIALING_CODE.code): NormalizedPhone {
  const raw = (input ?? "").trim();
  if (!raw) return { value: null, error: null };
  let cleaned = Array.from(raw).map((character) => arabicDigits[character] ?? character).join("").replace(/[\s().-]/g, "");
  if (cleaned.startsWith("00")) cleaned = `+${cleaned.slice(2)}`;
  if (!cleaned.startsWith("+")) cleaned = `${countryCode}${cleaned.startsWith("0") ? cleaned.slice(1) : cleaned}`;
  return E164.test(cleaned) ? { value: cleaned, error: null } : { value: null, error: "invalid" };
}

export function countryForInternationalPhone(phone: string | null | undefined) {
  const value = phone ?? "";
  return [...COUNTRY_DIALING_CODES].sort((a, b) => b.code.length - a.code.length).find((country) => value.startsWith(country.code)) ?? DEFAULT_COUNTRY_DIALING_CODE;
}

export function formatInternationalPhoneHint() { return "+962 79 000 0000"; }
