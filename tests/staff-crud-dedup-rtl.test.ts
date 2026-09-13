import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const userManagementSource = readFileSync(path.join(process.cwd(), "app/user-management.tsx"), "utf8");
const addUserModalSource = readFileSync(path.join(process.cwd(), "components/users/AddUserModal.tsx"), "utf8");

describe.sequential("Team directory: staff CRUD, card consolidation, strict RTL alignment", () => {
  it("dedupes to a single card per phone: member keys, onbook keys, invitation skip", () => {
    expect(userManagementSource).toContain("const memberPhoneKeys = new Set<string>((overview.data?.members ?? []).filter((item) => item.status !== \"disabled\").map((item) => phoneKey(item.phone ?? \"\")))");
    expect(userManagementSource).toContain("const memberRowKeys = new Set<string>();");
    expect(userManagementSource).toContain("if (memberKey && memberRowKeys.has(memberKey)) return;");
    expect(userManagementSource).toContain("if (!onbookKey || onbookPhoneKeys.has(onbookKey)) return;");
    expect(userManagementSource).toContain("onbookPhoneKeys.add(onbookKey)");
    expect(userManagementSource).toContain("if (onbookPhoneKeys.has(phoneKey(entry.phone)) || memberPhoneKeys.has(phoneKey(entry.phone))) return;");
  });

  it("rebuilds invitation and member rows with a role badge", () => {
    expect(userManagementSource).toContain("roleBadge:");
    expect(userManagementSource).toContain("role?: OnbookStaffRole;");
    expect(userManagementSource).toContain("memberBadge(member.role)");
  });

  it("exposes edit and delete entry points on the unified card", () => {
    expect(userManagementSource).toContain("onEdit?: () => void;");
    expect(userManagementSource).toContain("onEdit: owner ? undefined : () => setEditingMember(member)");
    expect(userManagementSource).toContain("onEdit: () => openEditOnbook(card)");
    expect(userManagementSource).toContain("key: `onbook:${entry.uid}`");
  });

  it("renders role pill and labeled actions in the card", () => {
    expect(userManagementSource).toContain("rolePill");
    expect(userManagementSource).toContain("entry.roleBadge");
    expect(userManagementSource).toContain("\"✏️ تعديل\"");
    expect(userManagementSource).toContain("\"📋 نسخ الرابط\"");
    expect(userManagementSource).toContain("\"🗑️ حذف\"");
    expect(userManagementSource).toContain("accessibilityLabel={language === \"ar\" ? \"حذف العضو\" : \"Delete member\"}");
  });

  it("routes card actions through explicit named handlers", () => {
    expect(userManagementSource).toContain("const handleCopyInvite = (entry: UnifiedEntry) => {");
    expect(userManagementSource).toContain("const handleEditStaff = (entry: UnifiedEntry) => {");
    expect(userManagementSource).toContain("const handleDeleteStaff = (entry: UnifiedEntry) => {");
    expect(userManagementSource).toContain("const handleRevokeInvitation = (entry: UnifiedEntry) => {");
    expect(userManagementSource).toContain("onCopyLink={entry.inviteCode ? () => handleCopyInvite(entry) : undefined}");
    expect(userManagementSource).toContain("onEdit={entry.onEdit ? () => handleEditStaff(entry) : undefined}");
    expect(userManagementSource).toContain("onDelete={entry.onDelete ? () => handleDeleteStaff(entry) : undefined}");
    expect(userManagementSource).toContain("onRevoke={entry.kind === \"invitation\" ? () => handleRevokeInvitation(entry) : undefined}");
  });

  it("provides a web-safe confirmation dialog and a success toast", () => {
    expect(userManagementSource).toContain("const confirmDialog = (titleAr: string, titleEn: string, ar: string, en: string, actionLabel: string, onConfirm: () => void) => {");
    expect(userManagementSource).toContain("window.confirm");
    expect(userManagementSource).toContain("const notify = (text: string, tone: \"success\" | \"error\" = \"success\") => {");
    expect(userManagementSource).toContain("toastWrap");
    expect(userManagementSource).toContain("Platform.OS === \"web\"");
  });

  it("keeps the app-status and invite-link accessibility pins", () => {
    expect(userManagementSource).toContain("\"نشط على التطبيق\"");
    expect(userManagementSource).toContain("\"بانتظار تفعيل التطبيق\"");
    expect(userManagementSource).toContain("accessibilityLabel={language === \"ar\" ? \"نسخ رابط الدعوة\" : \"Copy invite link\"}");
    expect(userManagementSource).toContain("accessibilityLabel={language === \"ar\" ? \"تفعيل حساب التطبيق\" : \"Activate app account\"}");
    expect(userManagementSource).not.toContain("رمزه برمجيًا مخصص (داخل نطاق مربعات الإدخال)");
  });

  it("keeps the LTR phone start-side placement", () => {
    expect(userManagementSource).toContain("writingDirection: \"ltr\", textAlign: \"left\"");
    expect(userManagementSource).toContain("const row = isRTL ? \"row-reverse\" : \"row\";");
  });

  it("signals the legacy status headers are gone from the directory", () => {
    expect(userManagementSource).not.toContain("تطبيق مفعّل");
    expect(userManagementSource).not.toContain("المنتسبون الميدانيون (على الكتاب)");
    expect(userManagementSource).not.toContain("generatedInvite");
    expect(userManagementSource).not.toContain("رمز OTP");
  });

  it("opens the edit modal with prefilled onbook data and updated permissions", () => {
    expect(userManagementSource).toContain("const [editingOnbook, setEditingOnbook] = useState");
    expect(userManagementSource).toContain("openEditOnbook");
    expect(userManagementSource).toContain("caps: capabilitiesForRole(role)");
    expect(userManagementSource).toContain("editInitial={editingOnbook}");
  });

  it("saves edited onbook records and re-invites on phone change", () => {
    expect(userManagementSource).toContain("saveEditedOnbook");
    expect(userManagementSource).toContain("phoneKey(invitation.phone) === phoneKey(existing ? existing.phone : \"\")");
    expect(userManagementSource).toContain("\"تعذر حفظ التعديلات. حاول مرة أخرى.\"");
  });

  it("reuses the unified modal in edit mode with save labeling", () => {
    expect(addUserModalSource).toContain("\"حفظ التعديلات\"");
    expect(addUserModalSource).toContain("(onUpdate ? await onUpdate({ uid: editInitial!.uid, ...payload }) : null)");
    expect(userManagementSource).toContain("onUpdate={editingOnbook ? saveEditedOnbook : undefined}");
    expect(userManagementSource).toContain("visible={addUserOpen || Boolean(editingOnbook)}");
  });

  it("asks for confirmation before deleting an onbook member", () => {
    expect(userManagementSource).toContain("هل أنت متأكد من حذف هذا العضو؟");
    expect(userManagementSource).toContain("phoneKey(invitation.phone) === phoneKey(entry.phone ?? \"\")");
    expect(userManagementSource).toContain("حُذف «");
    expect(userManagementSource).toContain("style: \"destructive\" as const");
  });

  it("lets invited members be resent, revoked, and reactivated directly from the card", () => {
    expect(userManagementSource).toContain("\"🔄 إعادة إرسال\"");
    expect(userManagementSource).toContain("accessibilityLabel={language === \"ar\" ? \"إلغاء الدعوة\" : \"Revoke invitation\"}");
    expect(userManagementSource).toContain("const revokeInvitation = async (entry: UnifiedEntry) => {");
  });
});