/** مخطّط الترقيم الذكي لمعرّفات الحسابات حسب الأدوار (Role-based ID Sequences).
 *
 *  - السوبر أدمن:        #U1000 (ثابت، حصري).
 *  - فريق التجربة/التطوير الداخلي: #U1001 – #U1010 (نطاق محجوز يُمنح يدويًا ولا يُوزَّع آليًا).
 *  - الملاك (Owners):     #U1011 فما فوق (بادئة U).
 *  - الموظفون (Staff):    #S2001 فما فوق (بادئة S).
 *  - الحراس (Guards):     #G5001 فما فوق (بادئة G).
 */

export type UserIdentityRole = "super-admin" | "internal" | "owner" | "staff" | "guard";

export const SUPER_ADMIN_USER_CODE = 1000;
export const RESERVED_USER_CODE_START = 1001;
export const RESERVED_USER_CODE_END = 1010;

export const OWNER_CODE_START = 1011;
export const STAFF_CODE_START = 2001;
export const GUARD_CODE_START = 5001;

export type RoleCodeSequence = { prefix: string; start: number };

export const ROLE_CODE_SEQ: Record<"owner" | "staff" | "guard", RoleCodeSequence> = {
  owner: { prefix: "U", start: OWNER_CODE_START },
  staff: { prefix: "S", start: STAFF_CODE_START },
  guard: { prefix: "G", start: GUARD_CODE_START },
};

/** رمز الفترة في رقم الحجز الذكي: M صباحي / N مسائي · سهرة / D يوم كامل / S عدة أيام / C مناسبة · تصوير / X فترة مخصصة. */
export const SHIFT_CODE_MAP: Record<string, string> = {
  morning: "M",
  evening: "N",
  "24h": "D",
  "multi-day": "S",
  overnight: "S",
  full_day: "D",
  event: "C",
  custom: "X",
  other: "X",
};

export function formatUserCode(prefix: string, value: number | string): string {
  return `${prefix}${value}`;
}

export function parseUserCode(code: string | null | undefined): { prefix: string; num: number } | null {
  if (!code) return null;
  const match = /^([A-Z])(\d+)$/i.exec(code.trim());
  if (!match) return null;
  const num = Number(match[2]);
  return Number.isInteger(num) ? { prefix: match[1].toUpperCase(), num } : null;
}

/** توافق مع الاستخدام السابق: يعيد الجزء الرقمي لرموز U فقط. */
export function parseUserCodeNumber(code: string | null | undefined): number | null {
  const parsed = parseUserCode(code);
  return parsed && parsed.prefix === "U" ? parsed.num : null;
}

/** يستنتج دور الهوية العالمي من أدوار عضوية المستخدم في المنشآت.
 *  تُمنح الأولوية: مالك > موظف/مدير > حارس. */
export function identityRoleFromMemberRoles(roles: readonly string[]): "owner" | "staff" | "guard" {
  const set = new Set(roles);
  if (set.has("owner")) return "owner";
  if (set.has("admin") || set.has("staff")) return "staff";
  return "guard";
}

export function resolveIdentityRole(options: { isSuperAdmin: boolean; memberRoles?: readonly string[] }): UserIdentityRole {
  if (options.isSuperAdmin) return "super-admin";
  return identityRoleFromMemberRoles(options.memberRoles ?? []);
}

/** يحسب الكود التالي ضمن تسلسل الدور، متجاهلًا النطاق المحجوز U1001–U1010. */
export function nextCodeForRole(role: Exclude<UserIdentityRole, "internal">, existingCodes: ReadonlyArray<string | null | undefined>): string {
  if (role === "super-admin") return formatUserCode("U", SUPER_ADMIN_USER_CODE);
  const seq = ROLE_CODE_SEQ[role];
  const taken = new Set(
    existingCodes
      .map(parseUserCode)
      .filter((entry): entry is { prefix: string; num: number } => Boolean(entry))
      .filter((entry) => entry.prefix === seq.prefix && entry.num >= seq.start)
      .map((entry) => entry.num),
  );
  let candidate = seq.start;
  while (taken.has(candidate)) candidate += 1;
  return formatUserCode(seq.prefix, candidate);
}

/** متوافق مع الاسم السابق: يستدعي nextCodeForRole لتصنيف المالك/الموظف/الحارس. */
export function nextUserCode(existingCodes: number[], isSuperAdmin = false): number {
  const role: UserIdentityRole = isSuperAdmin ? "super-admin" : "owner";
  const code = nextCodeForRole(role, existingCodes.map((num) => `U${num}`));
  return parseUserCodeNumber(code) ?? OWNER_CODE_START;
}
