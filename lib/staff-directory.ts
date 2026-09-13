import { nextCodeForRole, type UserIdentityRole } from "@/lib/user-code";

/** المسار الثاني للهوية (Track B): موظف/حارس ميداني على الكتاب محليًا بدون حساب تطبيق.
 *  يُخزَّن في ذاكرة الجهاز (إعدادات موثقة محليًا) يديره المالك، ويمكنه لاحقًا
 *  تفعيل حسابه عبر /auth/claim-staff-account فيرتفع إلى مستخدم تطبيق (Track A).
 */

export type OnbookStaffRole = "staff" | "guard";

export type OnbookStaff = {
  uid: string;
  name: string;
  phone: string;
  role: OnbookStaffRole;
  email?: string;
  isAppUser: boolean;
  createdAt?: string;
  /** حساب التطبيق المرتبط (auth_uid) بعد تفعيل المنتسب عبر رمز التحقق. */
  authUid?: string;
};

export const ONBOOK_ROLE_TO_IDENTITY: Record<OnbookStaffRole, Exclude<UserIdentityRole, "internal">> = {
  staff: "staff",
  guard: "guard",
};

/** يوحّد رقم الهاتف إلى صيغة أردنية محلية قابلة للمقارنة (0791234567 ← 0791234567، +962791234567 ← 0791234567). */
export function phoneKey(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("00962") && digits.length === 14) return `0${digits.slice(5)}`;
  if (digits.startsWith("962") && digits.length === 12) return `0${digits.slice(3)}`;
  return digits;
}

/** يوحّد معرّف المستخدم: يزيل # وآخر الحروف الكبيرة والمسافات. */
export function normalizeUid(uid: string | null | undefined): string {
  return String(uid ?? "").trim().toUpperCase().replace(/^#/, "").trim();
}

/** يقترح المعرّف التالي في مسار المنتسبين من تسلسلات S/G (يدمج أكواد أعضاء التطبيق الحالية). */
export function suggestOnbookUid(role: OnbookStaffRole, takenCodes: ReadonlyArray<string | null | undefined>): string {
  return nextCodeForRole(ONBOOK_ROLE_TO_IDENTITY[role], takenCodes);
}

export function findOnbookByUid(staff: ReadonlyArray<OnbookStaff>, uid: string | null | undefined): OnbookStaff | undefined {
  const key = normalizeUid(uid);
  if (!key) return undefined;
  return staff.find((entry) => normalizeUid(entry.uid) === key);
}

export function findOnbookByPhone(staff: ReadonlyArray<OnbookStaff>, phone: string | null | undefined): OnbookStaff | undefined {
  const key = phoneKey(phone);
  if (!key) return undefined;
  return staff.find((entry) => phoneKey(entry.phone) === key);
}

/** صلاحية فريدة مضبوطة: يطابق المنتسب فقط عندما يتطابق الهاتف والمعرّف معًا (لا أحدهما فقط). */
export function claimMatches(entry: OnbookStaff, phone: string | null | undefined, uid: string | null | undefined): boolean {
  const phoneMatch = Boolean(phoneKey(phone)) && phoneKey(entry.phone) === phoneKey(phone);
  const uidMatch = Boolean(normalizeUid(uid)) && normalizeUid(entry.uid) === normalizeUid(uid);
  return phoneMatch && uidMatch;
}

export function hasDuplicatePhone(knownMemberPhones: ReadonlyArray<string | null | undefined>, existingStaff: ReadonlyArray<OnbookStaff>, phone: string | null | undefined, excludeUid?: string): boolean {
  const key = phoneKey(phone);
  if (!key) return false;
  if (knownMemberPhones.some((memberPhone) => phoneKey(memberPhone) === key)) return true;
  return existingStaff.some((entry) => entry.uid !== excludeUid && phoneKey(entry.phone) === key);
}

export type OnbookValidationIssue = "name" | "phone" | "duplicate-phone";

/** يتحقق من سلامة إدخال منتسب جديد: الاسم، رقم الهاتف، وعدم تكرار الهاتف مع أعضاء التطبيق أو المنتسبين الآخرين. */
export function validateOnbookEntry(entry: { name: string; phone: string }, knownMemberPhones: ReadonlyArray<string | null | undefined>, existingStaff: ReadonlyArray<OnbookStaff>, excludeUid?: string): OnbookValidationIssue | null {
  if (entry.name.trim().length < 2) return "name";
  if (phoneKey(entry.phone).length < 6) return "phone";
  if (hasDuplicatePhone(knownMemberPhones, existingStaff, entry.phone, excludeUid)) return "duplicate-phone";
  return null;
}

/** يصفّي القائمة المخزنة من البيانات غير الموثوقة ويُبقي العناصر الصالحة فقط. */
export function normalizeOnbookStaff(value: unknown): OnbookStaff[] {
  if (!Array.isArray(value)) return [];
  const seenPhones = new Set<string>();
  const seenUids = new Set<string>();
  const out: OnbookStaff[] = [];
  for (const item of value as OnbookStaff[]) {
    if (!item || typeof item !== "object") continue;
    const uid = normalizeUid(item.uid);
    const name = String(item.name ?? "").trim().slice(0, 120);
    const phone = String(item.phone ?? "").replace(/\D/g, "").slice(0, 20);
    const role: OnbookStaffRole = item.role === "guard" ? "guard" : "staff";
    if (!uid || !name || phone.length < 6 || seenUids.has(uid) || seenPhones.has(phone)) continue;
    seenUids.add(uid);
    seenPhones.add(phone);
    out.push({
      uid,
      name,
      phone,
      role,
      email: typeof item.email === "string" && item.email.trim() ? item.email.trim().slice(0, 120) : undefined,
      isAppUser: item.isAppUser === true,
      createdAt: typeof item.createdAt === "string" ? item.createdAt.slice(0, 40) : undefined,
      ...(typeof item.authUid === "string" && item.authUid.trim() ? { authUid: item.authUid.trim().slice(0, 80) } : {}),
    });
  }
  return out;
}