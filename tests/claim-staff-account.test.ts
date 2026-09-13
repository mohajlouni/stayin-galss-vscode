import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const claim = readFileSync(resolve(process.cwd(), "app/auth/claim-staff-account.tsx"), "utf8");
const userMgmt = readFileSync(resolve(process.cwd(), "app/user-management.tsx"), "utf8");
const addUserModal = readFileSync(resolve(process.cwd(), "components/users/AddUserModal.tsx"), "utf8");

describe("claim staff account (تفعيل حساب التطبيق للمنتسبين على الكتاب)", () => {
  it("يعرض تدفق المطابقة المضبوطة ثم رمز التحقق المحلي السداسي", () => {
    expect(claim).toContain("تفعيل حساب التطبيق (Claim)");
    expect(claim).toContain("رمز التحقق المحلي (6 أرقام)");
    expect(claim).toContain("claimMatches");
    expect(claim).toContain("from \"@/lib/staff-directory\"");
    expect(claim).toContain("useOnbookStaff");
    expect(claim).toContain("from \"@/lib/staff-directory-store\"");
    expect(claim).toContain("maxLength={6}");
  });

  it("يرفع المنتسب المطابق إلى حساب تطبيق ثم يعود إلى إدارة المستخدمين", () => {
    expect(claim).toContain("isAppUser: true");
    expect(claim).toContain('router.replace("/user-management")');
  });

  it("يعرض بطاقة دعوة الانضمام للمنشأة عند تطابق رقم الهاتف", () => {
    expect(claim).toContain("دعوة للانضمام إلى منشأة StayIn - إدارة الوحدات والعهد");
  });
});

describe("user management on-book section (قسم المنتسبين الميدانيين)", () => {
  it("يربط زر التفعيل بمسار المطالبة محملًا بالهاتف والمعرّف", () => {
    expect(userMgmt).toContain("المنتسبون الميدانيون (على الكتاب)");
    expect(userMgmt).toContain("تفعيل حساب التطبيق");
    expect(userMgmt).toContain("router.push(`/auth/claim-staff-account?phone=${encodeURIComponent(member.phone)}&uid=${encodeURIComponent(member.uid)}` as never)");
    expect(userMgmt).toContain("تطبيق مفعّل");
  });

  it("يفتح نافذة إضافة العضو بنمط منتسب على الكتاب", () => {
    expect(userMgmt).toContain("إضافة عضو");
  });
});

describe("AddUserModal (نموذج إضافة العضو الموحد)", () => {
  it("يوفّر نموذجًا من 3 حقول بدون تبويبات أو معرّفات داخلية", () => {
    expect(addUserModal).toContain('AddUserRole = "staff" | "mini-admin" | "guard"');
    expect(addUserModal).toContain("إضافة عضو للفريق");
    expect(addUserModal).toContain("اسم الموظف / العضو");
    expect(addUserModal).toContain("رقم الهاتف للتواصل");
    expect(addUserModal).toContain("الدور / الصلاحية");
    expect(addUserModal).toContain("حفظ وإرسال الدعوة");
    expect(addUserModal).not.toContain("AddUserTrack");
    expect(addUserModal).not.toContain("AddUserPreset");
    expect(addUserModal).not.toContain("منتسب على الكتاب");
    expect(addUserModal).not.toContain("مستخدم تطبيق");
    expect(addUserModal).not.toContain("المعرّف الميداني (غير قابل للتعديل)");
    expect(addUserModal).not.toContain("onInviteAppUser");
    expect(addUserModal).not.toContain("onAddOnbookStaff");
  });
});