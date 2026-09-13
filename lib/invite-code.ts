import { phoneKey } from "@/lib/staff-directory";

const HASH_SALT = "#STAFF-LINK-";

function hashDigits(digits: string): number {
  let hash = 0;
  for (let i = 0; i < digits.length; i += 1) {
    hash = (hash * 31 + digits.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** يبني رمز دعوة/ربط ثابتًا من 6 أرقام (491-820) من رقم الهاتف بحيث يُعاد توليده على أي جهاز للمطابقة عند تفعيل الحساب. */
export function buildInviteCode(phone: string | null | undefined): string | null {
  const key = phoneKey(phone);
  if (key.length < 6) return null;
  const six = String(100000 + (hashDigits(key + HASH_SALT) % 900000));
  return `${six.slice(0, 3)}-${six.slice(3)}`;
}

export function normalizeInviteCode(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

export function matchesInviteCode(phone: string | null | undefined, value: string | null | undefined): boolean {
  const expected = buildInviteCode(phone);
  if (!expected) return false;
  return normalizeInviteCode(value) === expected.replace("-", "");
}