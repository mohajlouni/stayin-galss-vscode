import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const addUserModal = readFileSync(resolve(process.cwd(), "components/users/AddUserModal.tsx"), "utf8");
const userMgmt = readFileSync(resolve(process.cwd(), "app/user-management.tsx"), "utf8");
const claim = readFileSync(resolve(process.cwd(), "app/auth/claim-staff-account.tsx"), "utf8");
const payment = readFileSync(resolve(process.cwd(), "app/payment-methods.tsx"), "utf8");

describe("unified staff registration (توحيد تسجيل الفريق)", () => {
  it("يوفّر زر واحد موحد لإضافة العضو من إدارة المستخدمين", () => {
    expect(userMgmt).toContain("إضافة عضو للفريق");
    expect(userMgmt).toContain("onPress={() => setAddUserOpen(true)}");
    expect(userMgmt).not.toContain("openInvite");
    expect(userMgmt).not.toContain("إضافة موظف");
  });

  it("مسار الكتاب: حقلان فقط + قسيمة المعرّف الميداني #S", () => {
    expect(addUserModal).toContain('AddUserPreset = "staff" | "mini-admin" | "guard"');
    expect(addUserModal).toContain("الصلاحية المسبقة");
    expect(addUserModal).toContain("المعرّف الميداني (غير قابل للتعديل)");
    expect(addUserModal).toContain(">#{previewUid}</Text>");
    expect(addUserModal).toContain('suggestOnbookUid("staff", takenUidCodes)');
    expect(addUserModal).not.toContain("البريد الإلكتروني (اختياري)");
    expect(addUserModal).not.toContain("الدور الميداني");
  });

  it("مطالبة الهاتف أولًا مع ربط العهود وحساب التطبيق", () => {
    expect(claim).toContain("findOnbookByPhone");
    expect(claim).toContain("تم العثور على سجل مالي وعهد سابقة مرتبطة برقمك، هل ترغب بربط حسابك؟");
    expect(claim).toContain("authUid: user?.id ? String(user.id) : undefined");
  });

  it("نافذة الدفع: بحث أعضاء التطبيق، شارة المعرف الميداني، وبطاقات مدمجة", () => {
    expect(payment).toContain("بحث في أعضاء التطبيق");
    expect(payment).toContain("المعرّف الميداني المقترح");
    expect(payment).toContain(">#{floatDraft.onbookUid || onbookSuggestedUid}</Text>");
    expect(payment).toContain("styles.compactChannelCard");
    expect(payment).toContain("styles.compactChannelAction");
  });

  it("يرتّب كيانات الحساب: حارس، موظف، ثم المالك/الخزينة المركزية", () => {
    const guardIndex = payment.indexOf('{ id: "guard", icon: "security"');
    const staffIndex = payment.indexOf('{ id: "staff", icon: "badge"');
    const ownerIndex = payment.indexOf('{ id: "owner", icon: "account-balance"');
    expect(guardIndex).toBeGreaterThan(0);
    expect(staffIndex).toBeGreaterThan(guardIndex);
    expect(ownerIndex).toBeGreaterThan(staffIndex);
    expect(payment).toContain('ar: "المالك / الخزينة المركزية"');
  });
});