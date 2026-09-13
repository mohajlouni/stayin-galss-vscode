import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { GRANULAR_PERMISSIONS } from "../lib/permissions";
import { PERMISSION_KEYS } from "../shared/workspace-permissions";

const payment = readFileSync("app/payment-methods.tsx", "utf8");
const addUserModal = readFileSync("components/users/AddUserModal.tsx", "utf8");

describe("نقطة التحصيل: تعبئة فريق المسؤولين والإضافة السريعة", () => {
  it("يعرض اختيار المسؤول كل أعضاء الفريق (الخزينة + المستخدمين + سجل العهدة) مع الرتبة والهاتف", () => {
    expect(payment).toContain("الخزينة المركزية / المالك");
    expect(payment).toContain("...selectableMembers.map((member): TeamEntry");
    expect(payment).toContain("roleLabel: memberRoleLabel(member.role, language)");
    expect(payment).toContain("...onbookStaff.map((entry): TeamEntry");
    expect(payment).toContain("roleLabel: onbookRoleLabel(entry.role, language)");
    expect(payment).toContain("${option.phone} (${option.roleLabel})");
    expect(payment).toContain("const memberRoleLabel = (role: WorkspaceAccessRole, language:");
  });

  it("يوفر زر الإضافة السريعة داخل القائمة ويفتح نافذة إضافة العضو دون فقدان السياق", () => {
    expect(payment).toContain("➕ إضافة عضو / موظف جديد للفريق");
    expect(payment).toContain("setTeamPickerOpen(false); setAddUserOpen(true);");
    expect(payment).toContain("import AddUserModal, { type AddUserRole } from \"@/components/users/AddUserModal\"");
    expect(payment).toContain("<AddUserModal visible={addUserOpen}");
    expect(payment).toContain("onSubmit={quickAddTeamMember}");
    expect(addUserModal).toContain("onSubmit: (entry: { name: string; phone: string; role: AddUserRole; permissions: WorkspacePermissions })");
  });

  it("يربط العضو الجديد بسجل الفريق والدعوة تلقائيًا، ويختاره افتراضيًا في نقطة التحصيل", () => {
    expect(payment).toContain("const inviteRole: \"admin\" | \"staff\" | \"guest\" = role === \"mini-admin\"");
    expect(payment).toContain("inviteEmployee.mutateAsync");
    expect(payment).toContain("updateMemberPermissions.mutateAsync({ memberId: byPhone.id, permissions })");
    expect(payment).toContain("suggestOnbookUid(");
    expect(payment).toContain("validateOnbookEntry({ name, phone }");
    expect(payment).toContain("buildInviteCode(phone)");
    expect(payment).toContain("applyPersonChoice({ key: \"onbook:\" + newUid");
    expect(payment).toContain("commit([...onbookStaff, entry])");
  });

  it("يستبعد العمولة التحفيزية كليًا من إعدادات نقطة التحصيل", () => {
    for (const forbidden of ["عمولة تحفيزية", "isCommissionEnabled", "commissionType", "commissionValue", "نوع العمولة", "قيمة العمولة", "ident:commission", "FIXED_PER_BOOKING"]) {
      expect(payment).not.toContain(forbidden);
    }
    expect(payment).toContain("سقف الكاش");
    expect(payment).toContain("حساب الاستلام الافتراضي");
  });

  it("يحسّن تباين الإطارات وتوجه الحقول الرقمية والهواتف يسارًا (LTR)", () => {
    expect(payment).toContain("const FIELD_BORDER = \"#334155\"");
    expect(payment).toContain("const FIELD_BG = \"rgba(15, 23, 42, 0.8)\"");
    expect(payment).toContain("const FIELD_FOCUS = \"#F97316\"");
    expect(payment).toContain("focusedField === \"ceiling\" ? FIELD_FOCUS");
    expect(payment).toContain("focusedField === \"label\" ? FIELD_FOCUS");
    expect(payment).toContain('writingDirection: "ltr", textAlign: "left"');
    expect(payment).toContain("writingDirection: field.mono ? \"ltr\" : undefined, textAlign: field.mono ? \"left\" : align");
    expect(payment).toContain("styles.pickerTrigger, { backgroundColor: FIELD_BG, borderColor: FIELD_BORDER");
    expect(payment).toContain("styles.pickerRow, { backgroundColor: selected ? colors.primary + \"1A\" : FIELD_BG");
  });

  it("يحافظ على مربعات الصلاحيات السبعة لمنظومة أدوار إضافة العضو", () => {
    expect(GRANULAR_PERMISSIONS.length).toBe(7);
    expect(PERMISSION_KEYS).toContain("manage_payments");
    expect(addUserModal).toContain("تخصيص الصلاحيات (");
  });
});