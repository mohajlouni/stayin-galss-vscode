import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { GRANULAR_PERMISSIONS, OPERATIONAL_PERMISSION_COUNT, capabilitiesForPreset, capabilitiesForRole, capabilitiesToPermissions } from "../lib/permissions";
import { GUEST_PERMISSIONS, MANAGER_PERMISSIONS, STAFF_PERMISSIONS } from "../shared/workspace-permissions";

const addUserModal = readFileSync(resolve(process.cwd(), "components/users/AddUserModal.tsx"), "utf8");
const permissionsLib = readFileSync(resolve(process.cwd(), "lib/permissions.ts"), "utf8");
const userMgmt = readFileSync(resolve(process.cwd(), "app/user-management.tsx"), "utf8");
const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
const staffDirectory = readFileSync(resolve(process.cwd(), "lib/staff-directory.ts"), "utf8");

describe("invitation pins (رمز دعوة خادمي 6 أرقام)", () => {
  it("يولّد الخادم رمزًا من 6 أرقام بصيغة xxx-xxx بمدة صلاحية 15 دقيقة", () => {
    expect(routers).toContain("randomInt(0, 1_000_000)");
    expect(routers).toContain("15 * 60 * 1000");
    expect(dbSource).toContain("const pinHash = (pin: string) =>");
    expect(dbSource).toContain("pinHash: pinHash(input.pin)");
  });

  it("يضيف الدعوة/إعادة الإصدار عبر addWorkspaceStaff ويصدر رمزًا جديدًا عبر refreshInvitationCode", () => {
    expect(routers).toContain("refreshInvitationCode");
    expect(routers).toContain("addWorkspaceStaff");
    expect(routers).toContain("workspaceInviteRoleSchema");
    expect(routers).toContain("workspacePermissionsSchema");
  });
});

describe("granular permissions engine (محرك الصلاحيات التفصيلي)", () => {
  it("يوفّر 7 صلاحيات تشغيلية قابلة للتفعيل بالتفصيل", () => {
    expect(OPERATIONAL_PERMISSION_COUNT).toBe(7);
    expect(GRANULAR_PERMISSIONS.map((perm) => perm.ar)).toEqual([
      "عرض وإدارة الحجوزات",
      "استلام الكاش وتحصيل العهد",
      "تطبيق الخصومات وتعديل الأسعار",
      "تسجيل المصروفات من العهدة",
      "إدارة الصيانة والنظافة",
      "الاطلاع على هواتف وبيانات العملاء",
      "الاطلاع على التقارير المالية والأرباح",
    ]);
  });

  it("تُرجِم الصلاحيات الموصى بها لكل رتبة إلى الصلاحيات التنفيذية المتطابقة", () => {
    expect(capabilitiesToPermissions(capabilitiesForRole("mini-admin"))).toEqual(MANAGER_PERMISSIONS);
    expect(capabilitiesToPermissions(capabilitiesForRole("staff"))).toEqual(STAFF_PERMISSIONS);
    expect(capabilitiesToPermissions(capabilitiesForRole("guard"))).toEqual(GUEST_PERMISSIONS);
    expect(capabilitiesForRole("guard")).toHaveLength(0);
    expect(capabilitiesForRole("staff")).toHaveLength(6);
    expect(capabilitiesForPreset("employee")).toHaveLength(0);
    expect(capabilitiesForPreset("mini-admin")).toHaveLength(7);
    expect(capabilitiesToPermissions(["discounts_rates"])).toMatchObject({ edit_bookings: true, manage_payments: true, create_bookings: false, view_financial_reports: false });
  });
});

describe("granular permissions UI (واجهة الصلاحيات التفصيلية)", () => {
  it("AddUserModal يعرض حقولًا عالية التباين + هاتف LTR بدون بادئة ثابتة + تحقق اختياري من معرّف المستخدم", () => {
    expect(addUserModal).toContain('borderColor: focused === "name" ? ORANGE : FIELD_BORDER');
    expect(addUserModal).toContain("#F97316");
    expect(addUserModal).toContain('"#334155"');
    expect(addUserModal).toContain('borderColor: focused === "phone" ? ORANGE : FIELD_BORDER');
    expect(addUserModal).toContain('writingDirection: "ltr"');
    expect(addUserModal).not.toContain("prefixPill");
    expect(addUserModal).toContain("مثال: 079xxxxxxx أو مع رمز البلد (+962 / 00962)");
    expect(addUserModal).toContain("تم التحقق");
    expect(addUserModal).toContain('ar: "حارس"');
  });

  it("AddUserModal يجعل الهاتف والمعرّف جنبًا إلى جنب مع تحويل تلقائي للرقم", () => {
    expect(addUserModal).toContain("styles.fieldsRow");
    expect(addUserModal).toContain("styles.fieldCol");
    expect(addUserModal).toContain("flexDirection: row");
    expect(addUserModal).toContain("setPhone(normalizePhoneInput(text))");
    expect(addUserModal).toContain("phone: normalizePhoneInput(phone)");
    expect(addUserModal).not.toContain("07XXXXXXXX");
  });

  it("AddUserModal يوفر درج تخصيص الصلاحيات (X من 7 مفعلة) مع القوائم السبع", () => {
    expect(addUserModal).toContain("تخصيص الصلاحيات (");
    expect(addUserModal).toContain("مفعلة");
    expect(addUserModal).toContain("capabilitiesToPermissions(caps)");
    for (const perm of GRANULAR_PERMISSIONS) {
      expect(permissionsLib).toContain(perm.ar);
      expect(addUserModal).toContain("perm.ar");
      expect(addUserModal).toContain("perm.key");
    }
  });

  it("user-management يخزّن رمز الدعوة الخادمي ويعرضه على بطاقات الفريق لنسخه (بدون buildInviteCode المحلي)", () => {
    expect(userMgmt).toContain("mintInviteCode");
    expect(userMgmt).toContain("refreshInvite");
    expect(userMgmt).toContain("copyInviteLink");
    expect(userMgmt).toContain("handleCopyInvite");
    expect(userMgmt).toContain("handleLongCopyInvite");
    expect(userMgmt).toContain("نسخ كود الدعوة");
    expect(userMgmt).toContain("/workspace-hub?phone=");
    expect(userMgmt).not.toContain("buildInviteCode(phone)");
    expect(staffDirectory).not.toContain("inviteCode?: string");
  });
});