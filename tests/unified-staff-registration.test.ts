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

  it("نموذج موحد من 3 حقول بدون تبويبات أو أرقام هوية ظاهرة", () => {
    expect(addUserModal).toContain('AddUserRole = "staff" | "mini-admin" | "guard"');
    expect(addUserModal).toContain("اسم الموظف / العضو");
    expect(addUserModal).toContain("رقم الهاتف للتواصل");
    expect(addUserModal).toContain("الدور / الصلاحية");
    expect(addUserModal).toContain("حارس");
    expect(addUserModal).toContain("موظف حجوزات");
    expect(addUserModal).toContain("مدير تشغيلي");
    expect(addUserModal).toContain("حفظ وإرسال الدعوة");
    expect(addUserModal).not.toContain("AddUserTrack");
    expect(addUserModal).not.toContain('suggestOnbookUid("staff", takenUidCodes)');
    expect(addUserModal).not.toContain(">`#{")
    expect(addUserModal).not.toContain("المعرّف الميداني (غير قابل للتعديل)");
    expect(addUserModal).not.toContain("البريد الإلكتروني (اختياري)");
    expect(addUserModal).not.toContain("الدور الميداني");
  });

  it("الربط الخلفي برقم الهاتف: يربط العضو المسجل أو يفوّض الدعوة + التسجيل المحلي", () => {
    expect(userMgmt).toContain("submitUnifiedTeamMember");
    expect(userMgmt).toContain("phoneKey(item.phone) === phoneKey(phone)");
    expect(userMgmt).toContain("updateMemberPermissions.mutateAsync({ memberId: byPhone.id");
    expect(userMgmt).toContain("findOnbookByPhone(onbookStaff, phone)");
    expect(userMgmt).toContain("inviteFromAddModal(name, phone, preset)");
    expect(userMgmt).toContain("<AddUserModal visible={addUserOpen}");
  });

  it("مطالبة الهاتف أولًا مع ربط العهود وحساب التطبيق", () => {
    expect(claim).toContain("findOnbookByPhone");
    expect(claim).toContain("تم العثور على سجل مالي وعهد سابقة مرتبطة برقمك، هل ترغب بربط حسابك؟");
    expect(claim).toContain("authUid: user?.id ? String(user.id) : undefined");
    expect(claim).toContain("دعوة للانضمام إلى منشأة StayIn - إدارة الوحدات والعهد");
  });

  it("نافذة الدفع: بحث موحد بالفريق بدون تبويبات أو رموز داخلية, وبطاقات مدمجة", () => {
    expect(payment).not.toContain("بحث في أعضاء التطبيق");
    expect(payment).not.toContain("المعرّف الميداني المقترح");
    expect(payment).not.toContain("مستخدم تطبيق (App)");
    expect(payment).not.toContain("منتسب على الكتاب (On-book)");
    expect(payment).not.toContain("معرف المستخدم #UID");
    expect(payment).toContain("صاحب العهدة / نقطة التحصيل");
    expect(payment).toContain("const [teamSearch, setTeamSearch]");
    expect(payment).toContain("filteredTeam");
    expect(payment).toContain("phoneKey(item.phone) === phoneKey(floatDraft.phone)");
    expect(payment).toContain("styles.compactChannelCard");
    expect(payment).toContain("styles.compactChannelAction");
    expect(payment).toContain("findOnbookByPhone(onbookStaff, floatDraft.phone)");
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