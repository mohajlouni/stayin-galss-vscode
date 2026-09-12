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

describe("AddUserModal (المسار المزدوج للإضافة)", () => {
  it("يدعم تبويبي مستخدم التطبيق ومنتسب الكتاب", () => {
    expect(addUserModal).toContain('AddUserTrack = "app" | "onbook"');
    expect(addUserModal).toContain("منتسب على الكتاب");
    expect(addUserModal).toContain("onInviteAppUser");
    expect(addUserModal).toContain("onAddOnbookStaff");
  });

  it("يستخدم بادئة السماء الزرقاء في الهوية المحلية", () => {
    expect(addUserModal).toContain('("#0EA5E9" + "1A")');
  });
});