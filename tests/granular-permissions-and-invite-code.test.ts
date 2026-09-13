import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildInviteCode, matchesInviteCode, normalizeInviteCode } from "../lib/invite-code";
import { GRANULAR_PERMISSIONS, OPERATIONAL_PERMISSION_COUNT, capabilitiesForPreset, capabilitiesForRole, capabilitiesToPermissions } from "../lib/permissions";
import { GUEST_PERMISSIONS, MANAGER_PERMISSIONS, STAFF_PERMISSIONS } from "../shared/workspace-permissions";

const addUserModal = readFileSync(resolve(process.cwd(), "components/users/AddUserModal.tsx"), "utf8");
const permissionsLib = readFileSync(resolve(process.cwd(), "lib/permissions.ts"), "utf8");
const userMgmt = readFileSync(resolve(process.cwd(), "app/user-management.tsx"), "utf8");
const claim = readFileSync(resolve(process.cwd(), "app/auth/claim-staff-account.tsx"), "utf8");
const staffDirectory = readFileSync(resolve(process.cwd(), "lib/staff-directory.ts"), "utf8");

describe("invite linking code (رمز الدعوة والربط)", () => {
  it("يبني رمزًا ثابتًا من 6 أرقام (491-820) من رقم الهاتف مهما كانت صيغة الإدخال", () => {
    const local = buildInviteCode("0791234567");
    expect(local).toMatch(/^\d{3}-\d{3}$/);
    expect(buildInviteCode("+962791234567")).toBe(local);
    expect(buildInviteCode("0791234567")).toBe(local);
    expect(normalizeInviteCode(local ?? "")).toHaveLength(6);
    expect(matchesInviteCode("0791234567", buildInviteCode("0791234567"))).toBe(true);
    expect(matchesInviteCode("0791234567", "000000")).toBe(false);
    expect(matchesInviteCode("123", "111111")).toBe(false);
    expect(buildInviteCode("0770000000")).not.toBe(local);
    expect(buildInviteCode("12345")).toBeNull();
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
  it("AddUserModal يعرض حقولًا عالية التباين + هاتف LTR ببادئة دولة + رمز ربط قابل للنسخ", () => {
    expect(addUserModal).toContain('borderColor: focused === "name" ? ORANGE : FIELD_BORDER');
    expect(addUserModal).toContain("#F97316");
    expect(addUserModal).toContain('"#334155"');
    expect(addUserModal).toContain('borderColor: focused === "phone" ? ORANGE : FIELD_BORDER');
    expect(addUserModal).toContain("+962");
    expect(addUserModal).toContain('writingDirection: "ltr"');
    expect(addUserModal).toContain("رمز الدعوة والربط");
    expect(addUserModal).toContain("نسخ الرمز");
    expect(addUserModal).toContain("حارس / شفت");
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

  it("user-management يخزّن رمز الربط ويعرضه بنسخ من بطاقات الفريق والمنتسبين", () => {
    expect(userMgmt).toContain("inviteCode");
    expect(userMgmt).toContain("inviteCode: inviteCode ?? undefined");
    expect(userMgmt).toContain("buildInviteCode(phone)");
    expect(userMgmt).toContain("buildInviteCode(member.phone)");
    expect(staffDirectory).toContain("inviteCode?: string");
  });

  it("verifies the linking code during claim (تفعيل الحساب مرتبط برمز الدعوة)", () => {
    expect(claim).toContain("رمز الدعوة والربط (6 أرقام)");
    expect(claim).toContain("matchesInviteCode(phone, code)");
    expect(claim).toContain("buildInviteCode(matched?.phone)");
    expect(claim).toContain('textAlign: "left", writingDirection: "ltr"');
  });
});