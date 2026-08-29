/** Master Identity: مصدر واحد موثوق لهوية السوبر أدمن على المنصة. */

export const SUPER_ADMIN_EMAIL = "moh.ajlouni.90@gmail.com";

const SUPER_ADMIN_PHONE_DIGITS = new Set(["797402940", "962797402940"]);

/**
 * Normalizes any phone shape (Arabic digits, +962, 00, local 079) into plain
 * digits with leading zeros trimmed, ready for membership comparison.
 */
export function toPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  const arabicToLatin: Record<string, string> = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  };
  const digits = Array.from(phone)
    .map((character) => arabicToLatin[character] ?? character)
    .join("")
    .replace(/\D/g, "");
  return digits.replace(/^0+/, "");
}

export function isSuperAdminPhone(phone: string | null | undefined): boolean {
  const digits = toPhoneDigits(phone);
  if (!digits) return false;
  return SUPER_ADMIN_PHONE_DIGITS.has(digits);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export type SuperAdminCandidate = {
  openId?: string | null;
  phone?: string | null;
  email?: string | null;
};

/** هل هذه الهوية هي السوبر أدمن؟ (openId مخصص، أو الهاتف، أو البريد الرسمي). */
export function matchesSuperAdminIdentity(identity: SuperAdminCandidate, ownerOpenId: string): boolean {
  if (identity.openId && ownerOpenId && identity.openId === ownerOpenId) return true;
  if (isSuperAdminPhone(identity.phone)) return true;
  if (isSuperAdminEmail(identity.email)) return true;
  return false;
}