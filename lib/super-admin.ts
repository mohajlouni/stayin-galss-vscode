import { parseUserCode, SUPER_ADMIN_USER_CODE } from "@/lib/user-code";

export const SUPER_ADMIN_EMAIL = "moh.ajlouni.90@gmail.com";

const SUPER_ADMIN_PHONE_DIGITS = new Set(["797402940", "962797402940"]);

function toPhoneDigits(phone: string | null | undefined): string {
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
  return !!digits && SUPER_ADMIN_PHONE_DIGITS.has(digits);
}

export type SuperAdminUserShape = {
  isSuperAdmin?: boolean;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  userCode?: string | null;
};

/**
 * Client-side super-admin detection that never depends on the workspace routing
 * response. Mirrors the server's Master Identity so an authenticated super admin
 * is always sent to /admin/master-control even if the routing query fails or
 * the backend is momentarily unreachable.
 */
export function isSuperAdminUser(user: SuperAdminUserShape | null | undefined): boolean {
  if (!user) return false;
  if (user.isSuperAdmin === true) return true;
  if (user.role === "super_admin") return true;
  if (typeof user.email === "string" && user.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL) return true;
  if (isSuperAdminPhone(user.phone)) return true;
  const parsed = parseUserCode(user.userCode);
  return parsed !== null && parsed.prefix === "U" && parsed.num === SUPER_ADMIN_USER_CODE;
}