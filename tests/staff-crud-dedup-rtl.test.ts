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

  it("opens an in-app dark confirmation dialog instead of the browser-native window.confirm", () => {
    expect(userManagementSource).toContain("const confirmDialog = (titleAr: string, titleEn: string, ar: string, en: string, actionLabel: string, onConfirm: () => void) => {");
    expect(userManagementSource).toContain("setConfirmState({ title: language === \"ar\" ? titleAr : titleEn, body: language === \"ar\" ? ar : en, confirmLabel: actionLabel, onConfirm });");
    expect(userManagementSource).not.toContain("window.confirm");
    expect(userManagementSource).toContain("function ConfirmDeleteDialog({ visible, title, body, confirmLabel, language, isRTL, onCancel, onConfirm }");
    expect(userManagementSource).toContain("backdropFilter: \"blur(6px)\"");
    expect(userManagementSource).toContain("confirmCard: { width: \"100%\", maxWidth: 448, borderWidth: 1, borderRadius: 16, padding: 24, backgroundColor: \"#0F172A\", borderColor: \"#1E293B\" }");
    expect(userManagementSource).toContain("backgroundColor: \"#1E293B\", borderWidth: 1, borderColor: \"#334155\"");
    expect(userManagementSource).toContain("backgroundColor: \"#E11D48\"");
    expect(userManagementSource).toContain("visible={confirmState !== null}");
    expect(userManagementSource).toContain("const action = confirmState.onConfirm; setConfirmState(null); void action();");
    expect(userManagementSource).toContain("const notify = (text: string, tone: \"success\" | \"error\" = \"success\") => {");
    expect(userManagementSource).toContain("toastWrap");
    expect(userManagementSource).toContain("Platform.OS === \"web\"");
  });

  it("stacks member cards vertically on compact screens so nothing overlaps", () => {
    expect(userManagementSource).toContain("const { width } = useWindowDimensions();");
    expect(userManagementSource).toContain("const compact = width < 768;");
    expect(userManagementSource).toContain("flexDirection: compact ? \"column\" : \"row\"");
    expect(userManagementSource).toContain("alignItems: compact ? \"stretch\" : \"center\"");
    expect(userManagementSource).toContain("style={compact ? styles.actionBar : styles.memberActions}");
    expect(userManagementSource).toContain("actionBar: { flexDirection: \"row\", flexWrap: \"wrap\", columnGap: 8, rowGap: 8, alignItems: \"center\", width: \"100%\" }");
    expect(userManagementSource).toContain("writingDirection: \"ltr\"");
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
    expect(userManagementSource).toContain("editInitial={editingOnbook ?? editingInvitation}");
  });

  it("saves edited onbook records and re-invites on phone change", () => {
    expect(userManagementSource).toContain("saveEditedOnbook");
    expect(userManagementSource).toContain("phoneKey(invitation.phone) === phoneKey(existing ? existing.phone : \"\")");
    expect(userManagementSource).toContain("\"تعذر حفظ التعديلات. حاول مرة أخرى.\"");
  });

  it("reuses the unified modal in edit mode with save labeling", () => {
    expect(addUserModalSource).toContain("\"حفظ التعديلات\"");
    expect(addUserModalSource).toContain("(onUpdate ? await onUpdate({ uid: editInitial!.uid, ...payload }) : null)");
    expect(userManagementSource).toContain("onUpdate={editingOnbook ? saveEditedOnbook : editingInvitation ? saveEditedInvitation : undefined}");
    expect(userManagementSource).toContain("visible={addUserOpen || Boolean(editingOnbook) || Boolean(editingInvitation)}");
  });

  it("asks for confirmation before deleting an onbook member", () => {
    expect(userManagementSource).toContain("هل أنت متأكد من حذف هذا العضو؟");
    expect(userManagementSource).toContain("deleteStaffMember.mutateAsync({ phone: entry.phone })");
    expect(userManagementSource).toContain("تم حذف العضو والدعوة نهائياً من النظام");
    expect(userManagementSource).not.toContain("phoneKey(invitation.phone) === phoneKey(entry.phone ?? \"\")");
    expect(userManagementSource).toContain("setConfirmState({ title: language === \"ar\" ? titleAr : titleEn");
    expect(userManagementSource).not.toContain("style: \"destructive\" as const");
    expect(userManagementSource).not.toContain("Alert.alert(language === \"ar\" ? titleAr : titleEn");
  });

  it("deletes staff by phone on the backend: pending invitations revoked and members disabled", () => {
    const dbSource = readFileSync(path.join(process.cwd(), "server/db.ts"), "utf8");
    const routerSource = readFileSync(path.join(process.cwd(), "server/routers.ts"), "utf8");
    expect(dbSource).toContain("export async function deleteWorkspaceStaffByPhone");
    expect(dbSource).toContain("eq(workspaceInvitations.phone, input.phone)");
    expect(dbSource).toContain("ne(workspaceMembers.role, \"owner\")");
    expect(dbSource).toContain("return { invitationsRevoked: pendingInvitations.length, membersDisabled: activeMembers.length }");
    expect(dbSource).toContain("action: \"invitation-revoked\"");
    expect(routerSource).toContain("deleteStaffMember: protectedProcedure");
    expect(routerSource).toContain("db.deleteWorkspaceStaffByPhone({ workspaceId: summary.member.workspaceId, phone: input.phone, actorUserId: ctx.user.id })");
  });

  it("lets invited members be resent, revoked, and reactivated directly from the card", () => {
    expect(userManagementSource).toContain("\"🔄 إعادة إرسال\"");
    expect(userManagementSource).toContain("accessibilityLabel={language === \"ar\" ? \"إلغاء الدعوة\" : \"Revoke invitation\"}");
    expect(userManagementSource).toContain("const revokeInvitation = async (entry: UnifiedEntry) => {");
  });

  it("deletes a pending invitation from BOTH the backend and the local onbook record", () => {
    expect(userManagementSource).toContain("const runDeleteInvitation = async (entry: UnifiedEntry) => {");
    expect(userManagementSource).toContain("await revoke.mutateAsync({ invitationId: entry.invitationId })");
    expect(userManagementSource).toContain("commit(onbookStaff.filter((item) => phoneKey(item.phone) !== phoneKey(entry.phone)))");
    expect(userManagementSource).toContain("const confirmDeleteInvitation = (entry: UnifiedEntry) => {");
    expect(userManagementSource).toContain("onDelete: () => confirmDeleteInvitation(card)");
    expect(userManagementSource).not.toContain("if (entry.kind === \"invitation\") return;");
  });

  it("lets the owner edit a pending invitation's name, phone, role, and permissions server-side", () => {
    expect(userManagementSource).toContain("const openEditInvitation = (entry: UnifiedEntry) => {");
    expect(userManagementSource).toContain("const saveEditedInvitation = async (entry: { uid: string; name: string; phone: string; role: AddUserRole; permissions: WorkspacePermissions }): Promise<string | null> => {");
    expect(userManagementSource).toContain("updateInvitation.mutateAsync({ invitationId,");
    expect(userManagementSource).toContain("onEdit: () => openEditInvitation(card)");
  });

  it("exposes the updateInvitation and staff-directory purge procedures on the server", () => {
    const dbSource = readFileSync(path.join(process.cwd(), "server/db.ts"), "utf8");
    const routerSource = readFileSync(path.join(process.cwd(), "server/routers.ts"), "utf8");
    const storeSource = readFileSync(path.join(process.cwd(), "lib/booking-store.tsx"), "utf8");
    expect(routerSource).toContain("updateInvitation: protectedProcedure");
    expect(dbSource).toContain("export async function updateWorkspaceInvitation");
    expect(dbSource).toContain("action: \"invitation-updated\"");
    expect(dbSource).toContain("\"staff\", \"units\", \"workspace\"");
    expect(storeSource).toContain("\"analytics\" | \"staff\" | \"units\" | \"workspace\"");
  });

  it("renders member cards as a plain container View so action buttons are not nested interactive elements", () => {
    expect(userManagementSource).toContain("function MemberRow({ entry, copied, onCopyLink, onResend, onRevoke, onEdit, onDelete, language, isRTL, colors }");
    expect(userManagementSource).toContain("<View style={[styles.member, { backgroundColor: colors.surface,");
    expect(userManagementSource).not.toContain("accessibilityRole=\"button\" disabled={!entry.onPress} onPress={entry.onPress}");
    expect(userManagementSource).not.toContain("onPress={entry.onPress}");
  });

  it("stops propagation on every per-member action button", () => {
    expect(userManagementSource).toContain("event?.stopPropagation?.(); onEdit();");
    expect(userManagementSource).toContain("event?.stopPropagation?.(); onCopyLink();");
    expect(userManagementSource).toContain("event?.stopPropagation?.(); onResend();");
    expect(userManagementSource).toContain("event?.stopPropagation?.(); onRevoke();");
    expect(userManagementSource).toContain("event?.stopPropagation?.(); entry.onActivate?.();");
    expect(userManagementSource).toContain("event?.stopPropagation?.(); onDelete();");
  });
});