import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const addUserModal = readFileSync(resolve(process.cwd(), "components/users/AddUserModal.tsx"), "utf8");
const userMgmt = readFileSync(resolve(process.cwd(), "app/user-management.tsx"), "utf8");
const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("unified team directory (قائمة فريق العمل الموحدة)", () => {
  it("يدمج الأعضاء والمنتسبين والدعوات في قائمة واحدة تبدأ بأعضاء التطبيق", () => {
    expect(userMgmt).toContain("const unifiedTeam");
    expect(userMgmt).toContain('kind: "member"');
    expect(userMgmt).toContain('kind: "onbook"');
    expect(userMgmt).toContain('kind: "invitation"');
    expect(userMgmt).toContain("const appActive = member.status === \"active\";");
    expect(userMgmt).toContain("!entry.usedAt && !entry.revokedAt");
    expect(userMgmt).toContain("unifiedTeam.map((entry) => <MemberRow");
  });

  it("يعرض شارات حالة النشاط بدل التقسيم القديم (لا منتسبون على الكتاب ولا تطبيق مفعّل)", () => {
    expect(userMgmt).toContain("\"نشط\"");
    expect(userMgmt).toContain("\"بانتظار انضمام العضو\"");
    expect(userMgmt).not.toContain("نشط على التطبيق");
    expect(userMgmt).not.toContain("تطبيق مفعّل");
    expect(userMgmt).not.toContain("المنتسبون الميدانيون (على الكتاب)");
    expect(userMgmt).not.toContain("generatedInvite");
    expect(userMgmt).not.toContain("رمز OTP");
    expect(userMgmt).not.toContain("رمز الربط (6 أرقام)");
  });

  it("يوفر لأصحاب الدعوى المعلقة: نسخ كود دعوة خادمي + رابط انضمام مباشر, بلا إعادة إرسال أو تفعيل محلي", () => {
    expect(userMgmt).toContain("const mintInviteCode = async");
    expect(userMgmt).toContain("trpc.workspace.refreshInvitationCode.useMutation()");
    expect(userMgmt).toContain("const handleLongCopyInvite = async");
    expect(userMgmt).toContain("نسخ كود الدعوة");
    expect(userMgmt).toContain("/workspace-hub?phone=");
    expect(userMgmt).not.toContain("إعادة إرسال");
    expect(userMgmt).not.toContain("تفعيل حساب التطبيق");
    expect(userMgmt).not.toContain("claim-staff-account");
  });

  it("المالك الأساسي محمي والنقر على الأعضاء يفتح تحرير الصلاحيات", () => {
    expect(userMgmt).toContain("المالك الأساسي محمي");
    expect(userMgmt).toContain("setEditingMember(member)");
    expect(userMgmt).toContain("lookupUserCode={lookupUserCode}");
  });

  it("بطاقة نقل الملكية في أسفل القسم وليست في القائمة", () => {
    const transferIndex = userMgmt.indexOf("نقل ملكية المنشأة");
    const listIndex = userMgmt.indexOf("unifiedTeam.map");
    expect(transferIndex).toBeGreaterThan(listIndex);
    expect(userMgmt).toContain("اضغط 3 ثوانٍ لطلب نقل الملكية");
  });
});

describe("optional user ID verification (التحقق الاختياري من المعرّف)", () => {
  it("AddUserModal يستقبل lookupUserCode ويعرض حقلاً اختياريًا للمعرّف", () => {
    expect(addUserModal).toContain("lookupUserCode");
    expect(addUserModal).toContain('{ name: string; phone: string } | null');
    expect(addUserModal).toContain("المعرّف الشخصي (اختياري للتأكيد)");
    expect(addUserModal).toContain("#U1024");
  });

  it("يعرض حالات التحقق الثلاث ويحجب الإرسال عند عدم التطابق", () => {
    expect(addUserModal).toContain("تم التحقق: الحساب مطابق");
    expect(addUserModal).toContain("لا يتطابق مع هذا المعرّف");
    expect(addUserModal).toContain("لا يوجد حساب مسجل بهذا المعرّف");
    expect(addUserModal).toContain("التحقق من الهوية فشل");
    expect(addUserModal).toContain("verification.state !== ");
  });

  it("لا يرتبط المعرّف بنموذج الإرسال (يبقى { name, phone, role, permissions })", () => {
    expect(addUserModal).not.toContain("userCode in entry");
    expect(addUserModal).not.toContain("رمز الدعوة والربط");
    expect(addUserModal).not.toContain("نسخ الرمز");
    expect(addUserModal).not.toContain("نموذج من 4 حقول");
  });
});

describe("staff removal (إزالة عضو من فريق العمل)", () => {
  it("يوفر إجراء removeMember على الخادم: إزالة ناعمة + سجل نشاط", () => {
    expect(db).toContain("export async function removeWorkspaceMember");
    expect(db).toContain('status: "disabled"');
    expect(db).toContain('action: "employee-removed"');
    expect(routers).toContain("removeMember: protectedProcedure");
    expect(routers).toContain("Primary owner is immutable");
  });

  it("يعرض رسالة تأكيد بالحذف ولا يسمح بمسح المالك الأساسي", () => {
    expect(userMgmt).toContain("هل أنت متأكد من حذف هذا العضو؟ («");
    expect(userMgmt).toContain("سيُحذف سجلُه المحلي وتُلغى الدعوة المعلقة على رقمه.");
    expect(userMgmt).toContain("onDelete: owner ? undefined : () => confirmRemoveOnbook({ name: member.displayName, phone: member.phone ?? \"\" })");
  });

  it("يرشح الأعضاء المعطَّلين من القائمة الموحدة", () => {
    expect(userMgmt).toContain('.filter((item) => item.status !== "disabled")');
  });
});

describe("advanced ownership accordion (خيارات الملكية المتقدمة)", () => {
  it("بطاقة نقل الملكية قابلة للطي وتبقى في أسفل القسم", () => {
    const transferIndex = userMgmt.indexOf("نقل ملكية المنشأة");
    const listIndex = userMgmt.indexOf("unifiedTeam.map");
    expect(transferIndex).toBeGreaterThan(listIndex);
    expect(userMgmt).toContain("🛡️ خيارات الملكية المتقدمة (نقل ملكية المنشأة)");
    expect(userMgmt).toContain("const [transferOpen, setTransferOpen] = useState(false)");
    expect(userMgmt).toContain("{transferOpen ? <>");
    expect(userMgmt).toContain("اضغط 3 ثوانٍ لطلب نقل الملكية");
  });
});