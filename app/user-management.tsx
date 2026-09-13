import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ViewStyle } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import AddUserModal, { type AddUserRole } from "@/components/users/AddUserModal";
import { startOAuthLogin } from "@/constants/oauth";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { findOnbookByPhone, hasDuplicatePhone, normalizeUid, phoneKey, suggestOnbookUid, validateOnbookEntry, type OnbookStaff, type OnbookStaffRole } from "@/lib/staff-directory";
import { useOnbookStaff } from "@/lib/staff-directory-store";
import { capabilitiesForRole, type GranularCapability } from "@/lib/permissions";
import { trpc } from "@/lib/trpc";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { PERMISSION_KEYS, WORKSPACE_ROLE_LABELS, hasAllWorkspacePermissions, normalizeWorkspacePermissions, permissionsForPreset, type PermissionKey, type PermissionPreset, type WorkspacePermissions } from "@/shared/workspace-permissions";
import * as Clipboard from "expo-clipboard";

type TeamMember = { id: number; userId: number | null; displayName: string; phone: string; role: "owner" | "admin" | "staff" | "guest" | "caretaker"; status?: "active" | "pending" | "disabled"; permissions: WorkspacePermissions; cliqAlias?: string | null; bankDetails?: string | null; commissionRate?: string | null; commissionType?: "percent" | "fixed" | null; allowDirectCollection?: boolean; userCode: string | null };

type InviteRole = "admin" | "staff" | "caretaker" | "guest";

type UnifiedEntry = {
  key: string;
  kind: "member" | "onbook" | "invitation";
  name: string;
  roleLabel: string;
  roleBadge: string;
  role?: OnbookStaffRole;
  phone: string;
  appActive: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onbookUid?: string;
  invitationId?: number;
  inviteRole?: InviteRole;
  /** الصلاحيات الأولية المعروفة (عضو pending / دعوة) لإعادة الصك عند نسخ الرمز بلا فقدان الإعدادات. */
  permissionsRaw?: unknown;
};

const permissionLabels: Record<PermissionKey, { ar: string; en: string; icon: React.ComponentProps<typeof MaterialIcons>["name"] }> = {
  view_financial_reports: { ar: "عرض التقارير المالية والأرباح", en: "View financial reports and profits", icon: "bar-chart" },
  manage_payments: { ar: "إضافة وتعديل الدفعات", en: "Add and edit payments", icon: "payments" },
  refund_security_deposits: { ar: "استرداد مبالغ التأمين", en: "Refund security deposits", icon: "security" },
  create_bookings: { ar: "إضافة حجز جديد", en: "Create bookings", icon: "add-circle-outline" },
  edit_bookings: { ar: "تعديل الحجوزات والأسعار", en: "Edit bookings and prices", icon: "edit-calendar" },
  cancel_delete_bookings: { ar: "إلغاء وحذف الحجوزات", en: "Cancel and delete bookings", icon: "event-busy" },
  view_audit_logs: { ar: "عرض سجل الإجراءات", en: "View action log", icon: "history" },
};

export default function UserManagementScreen() {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { isAuthenticated, loading, isManager, isOwner, role, refetchWorkspace } = useWorkspaceAccess();
  const overview = trpc.workspace.overview.useQuery(undefined, { enabled: isAuthenticated && isManager, retry: false });
  const invite = trpc.workspace.inviteEmployee.useMutation();
  const refreshInvite = trpc.workspace.refreshInvitationCode.useMutation();
  const revoke = trpc.workspace.revokeInvitation.useMutation();
  const updateInvitation = trpc.workspace.updateInvitation.useMutation();
  const deleteStaffMember = trpc.workspace.deleteStaffMember.useMutation();
  const bootstrapOwner = trpc.workspace.bootstrapOwner.useMutation();
  const updateMemberPermissions = trpc.workspace.updateMemberPermissions.useMutation();
  const updateMemberCollectionProfile = trpc.workspace.updateMemberCollectionProfile.useMutation();
  const requestOwnershipTransfer = trpc.workspace.requestOwnershipTransfer.useMutation();
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [memberPermissions, setMemberPermissions] = useState<WorkspacePermissions>(permissionsForPreset("employee"));
  const [memberPermissionsOpen, setMemberPermissionsOpen] = useState(true);
  const [memberCliqAlias, setMemberCliqAlias] = useState("");
  const [memberBankDetails, setMemberBankDetails] = useState("");
  const [memberCommissionRate, setMemberCommissionRate] = useState("");
  const [memberCommissionType, setMemberCommissionType] = useState<"percent" | "fixed">("percent");
  const [memberAllowDirectCollection, setMemberAllowDirectCollection] = useState(false);
  const [transferTarget, setTransferTarget] = useState<TeamMember | null>(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [transferOpen, setTransferOpen] = useState(false);
const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const align = isRTL ? "right" : "left";
   const row = isRTL ? "row-reverse" : "row";
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [editingOnbook, setEditingOnbook] = useState<{ uid: string; name: string; phone: string; role: AddUserRole; caps: readonly GranularCapability[] } | null>(null);
  const [editingInvitation, setEditingInvitation] = useState<{ uid: string; name: string; phone: string; role: AddUserRole; caps: readonly GranularCapability[] } | null>(null);
  const { staff: onbookStaff, ready: onbookReady, commit } = useOnbookStaff();
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const notify = (text: string, tone: "success" | "error" = "success") => {
    if (Platform.OS === "web") {
      setToast({ text, tone });
      return;
    }
    Alert.alert(tone === "success" ? (language === "ar" ? "تم" : "Done") : (language === "ar" ? "تعذر الإكمال" : "Something went wrong"), text);
  };

  const [confirmState, setConfirmState] = useState<{ title: string; body: string; confirmLabel: string; onConfirm: () => void } | null>(null);

  const confirmDialog = (titleAr: string, titleEn: string, ar: string, en: string, actionLabel: string, onConfirm: () => void) => {
    setConfirmState({ title: language === "ar" ? titleAr : titleEn, body: language === "ar" ? ar : en, confirmLabel: actionLabel, onConfirm });
  };

  useEffect(() => {
    if (!editingMember) return;
    setMemberPermissions(normalizeWorkspacePermissions(editingMember.permissions, hasAllWorkspacePermissions(editingMember.permissions) ? "manager" : "employee"));
    setMemberPermissionsOpen(true);
    setMemberCliqAlias(editingMember.cliqAlias ?? "");
    setMemberBankDetails(editingMember.bankDetails ?? "");
    setMemberCommissionRate(editingMember.commissionRate ?? "");
    setMemberCommissionType(editingMember.commissionType === "fixed" ? "fixed" : "percent");
    setMemberAllowDirectCollection(editingMember.allowDirectCollection === true);
  }, [editingMember]);

  const runInvite = async (employeeName: string, phoneNumber: string, role: InviteRole, permissions: WorkspacePermissions): Promise<{ pin: string } | null> => {
    if (employeeName.trim().length < 2 || phoneNumber.trim().length < 6) {
      Alert.alert(language === "ar" ? "بيانات ناقصة" : "Missing details", language === "ar" ? "أدخل اسم الموظف ورقم هاتفه بشكل صحيح." : "Enter the employee name and phone number.");
      return null;
    }
    try {
      const result = await invite.mutateAsync({ employeeName: employeeName.trim(), phone: phoneNumber.trim(), role, permissions });
      await overview.refetch();
      return { pin: result.pin };
    } catch {
      Alert.alert(language === "ar" ? "تعذر إنشاء الدعوة" : "Could not create invitation", language === "ar" ? "حاول مرة أخرى." : "Please try again.");
      return null;
    }
  };
  const inviteFromAddModal = async (employeeName: string, phoneNumber: string, role: AddUserRole, permissions: WorkspacePermissions) => {
    const inviteRole: InviteRole = role === "mini-admin" ? "admin" : role === "guard" ? "guest" : "staff";
    return runInvite(employeeName, phoneNumber, inviteRole, permissions);
  };
  const submitUnifiedTeamMember = async ({ name, phone, role, permissions }: { name: string; phone: string; role: AddUserRole; permissions: WorkspacePermissions }): Promise<string | null> => {
    const preset: PermissionPreset = role === "mini-admin" ? "mini-admin" : role === "guard" ? "guard" : "staff";
    const presetName = (p: PermissionPreset) => p === "guard" ? (language === "ar" ? "حارس" : "Guard") : p === "mini-admin" ? (language === "ar" ? "مدير تشغيلي" : "Operational manager") : (language === "ar" ? "موظف حجوزات" : "Booking staff");
    const membersData = overview.data?.members ?? [];
    const byPhone = membersData.find((item) => item.status === "active" && phoneKey(item.phone) === phoneKey(phone));
    if (byPhone) {
      if (byPhone.role === "owner") {
        Alert.alert(language === "ar" ? "المالك الأساسي محمي" : "Primary owner protected", language === "ar" ? "رقم الهاتف هذا ملك المالك الأساسي وليس عضوًا جديدًا." : "This phone belongs to the primary owner, not a new member.");
        return null;
      }
      try {
        await updateMemberPermissions.mutateAsync({ memberId: byPhone.id, permissions });
        await overview.refetch();
        Alert.alert(language === "ar" ? "✓ تم ربط العضو بالمنشأة" : "✓ Member linked", language === "ar" ? `«${byPhone.displayName}» مسجل مسبقًا برقم الهاتف — رُبط مباشرة برتبة «${presetName(preset)}».` : `"${byPhone.displayName}" is already registered — linked directly as ${presetName(preset)}.`);
        return null;
      } catch {
        return language === "ar" ? "تعذر ربط العضو المسجل. حاول مرة أخرى." : "Could not link the registered member. Try again.";
      }
    }
    const existingOnbook = findOnbookByPhone(onbookStaff, phone);
    if (!existingOnbook) {
      const issue = validateOnbookEntry({ name, phone }, membersData.map((item) => item.phone), onbookStaff);
      if (issue === "phone") return language === "ar" ? "أدخل رقم هاتف صحيحًا (6 أرقام على الأقل)." : "Enter a valid phone number (at least 6 digits).";
      if (issue === "name") return language === "ar" ? "أدخل اسم العضو (حرفان على الأقل)." : "Enter the member's name (at least 2 characters).";
      if (issue === "duplicate-phone") return language === "ar" ? "رقم الهاتف مستخدم مسبقًا في التطبيق أو سجل الفريق." : "This phone is already used by an app member or another team record.";
      const uid = suggestOnbookUid(role === "guard" ? "guard" : "staff", [...membersData.map((item) => item.userCode).filter((code): code is string => Boolean(code)), ...onbookStaff.map((item) => item.uid)]);
      const entry: OnbookStaff = { uid, name: name.trim(), phone: phone.trim(), role: role === "guard" ? "guard" : "staff", createdAt: new Date().toISOString() };
      await commit([...onbookStaff, entry]);
    } else {
      await commit(onbookStaff.map((item) => item.uid === existingOnbook.uid ? { ...item, name: name.trim(), role: role === "guard" ? "guard" : "staff" } : item));
    }
    const outcome = await inviteFromAddModal(name, phone, role, permissions);
    if (outcome?.pin) {
      copyInviteLink(outcome.pin, phone.trim());
      notify(language === "ar" ? `أُضيف «${name}» وأُنشئ رمز دعوة صالح 15 دقيقة: ${outcome.pin}` : `"${name}" was added. Invitation code (valid 15 min): ${outcome.pin}`);
    }
    return null;
  };
  const activateOwnerWorkspace = async () => {
    try { await bootstrapOwner.mutateAsync(); await refetchWorkspace(); } catch { Alert.alert(language === "ar" ? "تعذر إنشاء المساحة" : "Could not create workspace", language === "ar" ? "حاول مرة أخرى." : "Please try again."); }
  };
  const saveMemberPermissions = async () => {
    if (!editingMember || editingMember.role === "owner") return;
    const commissionRate = memberCommissionRate.trim() === "" ? undefined : Number(memberCommissionRate);
    if (commissionRate !== undefined && (!Number.isFinite(commissionRate) || commissionRate < 0)) {
      Alert.alert(language === "ar" ? "عمولة غير صحيحة" : "Invalid commission", language === "ar" ? "أدخل قيمة عمولة موجبة أو اترك الحقل فارغًا." : "Enter a non-negative commission or leave it empty.");
      return;
    }
    try {
      await updateMemberPermissions.mutateAsync({ memberId: editingMember.id, permissions: memberPermissions });
      await updateMemberCollectionProfile.mutateAsync({ memberId: editingMember.id, cliqAlias: memberCliqAlias.trim() || undefined, bankDetails: memberBankDetails.trim() || undefined, commissionRate, commissionType: memberCommissionType, allowDirectCollection: memberAllowDirectCollection });
      setEditingMember(null);
      await overview.refetch();
      Alert.alert(language === "ar" ? "تم حفظ الصلاحيات" : "Permissions saved", language === "ar" ? `تم تحديث صلاحيات ${editingMember.displayName}.` : `${editingMember.displayName}'s permissions were updated.`);
    } catch {
      Alert.alert(language === "ar" ? "تعذر الحفظ" : "Could not save", language === "ar" ? "حاول مرة أخرى." : "Please try again.");
    }
  };
  const cancelOwnershipHold = () => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; setTransferProgress(0); };
  const beginOwnershipHold = () => {
    if (!transferTarget || requestOwnershipTransfer.isPending) return;
    setTransferProgress(1);
    holdTimer.current = setTimeout(() => {
      setTransferProgress(3);
      holdTimer.current = null;
      void requestOwnershipTransfer.mutateAsync({ targetMemberId: transferTarget.id, holdConfirmed: true }).then((result) => Alert.alert(language === "ar" ? "تم تسجيل طلب النقل" : "Transfer request recorded", result.message)).catch(() => Alert.alert(language === "ar" ? "تعذر تسجيل الطلب" : "Could not record request", language === "ar" ? "تأكد من قناة التحقق الخارجية ثم حاول مجددًا." : "Verify the external verification channel, then retry."));
    }, 3000);
  };

  const lookupUserCode = (code: string): { name: string; phone: string } | null => {
    const key = normalizeUid(code);
    if (!key) return null;
    const member = (overview.data?.members ?? []).find((item) => item.userCode && normalizeUid(item.userCode) === key);
    if (member) return { name: member.displayName, phone: member.phone ?? "" };
    const onbook = onbookStaff.find((item) => normalizeUid(item.uid) === key);
    return onbook ? { name: onbook.name, phone: onbook.phone } : null;
  };
  const copyInviteLink = (code: string, phone: string) => {
    void Clipboard.setStringAsync(code);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 1600);
  };
  const inviteRoleForCopy = (entry: UnifiedEntry): InviteRole => {
    if (entry.inviteRole) return entry.inviteRole;
    if (entry.role === "guard") return "guest";
    return "staff";
  };
  const permissionsForCopy = (entry: UnifiedEntry): WorkspacePermissions => {
    const inviteRole = inviteRoleForCopy(entry);
    const fallback: PermissionPreset = inviteRole === "admin" ? "manager" : inviteRole === "guest" ? "guest" : inviteRole === "caretaker" ? "caretaker" : "employee";
    return normalizeWorkspacePermissions(entry.permissionsRaw, fallback);
  };
  const mintInviteCode = async (entry: UnifiedEntry): Promise<{ pin: string } | null> => {
    try {
      const result = await refreshInvite.mutateAsync({ phone: entry.phone, employeeName: entry.name, role: inviteRoleForCopy(entry), permissions: permissionsForCopy(entry) });
      await overview.refetch();
      return { pin: result.pin };
    } catch {
      return null;
    }
  };
  const handleCopyInvite = async (entry: UnifiedEntry) => {
    const minted = await mintInviteCode(entry);
    if (!minted) {
      notify(language === "ar" ? "تعذر إنشاء رمز دعوة جديد. حاول مرة أخرى." : "Could not create a new invitation code. Try again.", "error");
      return;
    }
    copyInviteLink(minted.pin, entry.phone);
    notify(language === "ar" ? `رمز الدعوة الجديد لـ «${entry.name}»: ${minted.pin} — يصحّ 15 دقيقة.` : `New invitation code for "${entry.name}": ${minted.pin} — valid for 15 minutes.`);
  };
  const handleLongCopyInvite = async (entry: UnifiedEntry) => {
    const minted = await mintInviteCode(entry);
    if (!minted) {
      notify(language === "ar" ? "تعذر إنشاء رمز دعوة جديد. حاول مرة أخرى." : "Could not create a new invitation code. Try again.", "error");
      return;
    }
    const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
    if (!origin) {
      copyInviteLink(minted.pin, entry.phone);
      notify(language === "ar" ? `رمز الدعوة الجديد: ${minted.pin}` : `New invitation code: ${minted.pin}`);
      return;
    }
    const link = `${origin}/workspace-hub?phone=${encodeURIComponent(phoneKey(entry.phone) ?? entry.phone)}&code=${minted.pin}`;
    void Clipboard.setStringAsync(link);
    setCopiedPhone(entry.phone);
    setTimeout(() => setCopiedPhone(null), 1600);
    notify(language === "ar" ? "نُسخ رابط انضمام مباشر — يفتح محور المنشأة ويملأ الهاتف والرمز تلقائيًا." : "Join link copied — opens the workspace hub with phone and code pre-filled.");
  };
  const runDeleteInvitation = async (entry: UnifiedEntry) => {
    let serverOk = true;
    try {
      if (entry.invitationId) await revoke.mutateAsync({ invitationId: entry.invitationId });
    } catch {
      serverOk = false;
    }
    try {
      if (entry.phone) await commit(onbookStaff.filter((item) => phoneKey(item.phone) !== phoneKey(entry.phone)));
      await overview.refetch();
      notify(serverOk ? (language === "ar" ? `حُذفت دعوة «${entry.name}» نهائيًا من الخادم وسجل المتصفح.` : `"${entry.name}"'s invitation was deleted from the server and local record.`) : (language === "ar" ? "حُذفت الدعوة محليًا بعد تعذر مزامنة الخادم." : "Invitation removed locally; server sync failed."));
    } catch {
      notify(language === "ar" ? "تعذر حذف الدعوة. حاول مرة أخرى." : "Could not delete the invitation. Please try again.", "error");
    }
  };
  const confirmDeleteInvitation = (entry: UnifiedEntry) => {
    confirmDialog(language === "ar" ? "حذف الدعوة" : "Delete invitation", language === "ar" ? "حذف الدعوة" : "Delete invitation", language === "ar" ? `هل تريد حذف دعوة «${entry.name}» نهائيًا؟ ستُحذف من الخادم ومن سجل المتصفح المحلي.` : `Delete "${entry.name}"'s invitation permanently? It will be removed from the server and the local record.`, language === "ar" ? `هل تريد حذف دعوة «${entry.name}» نهائيًا؟ ستُحذف من الخادم ومن سجل المتصفح المحلي.` : `Delete "${entry.name}"'s invitation permanently? It will be removed from the server and the local record.`, language === "ar" ? "حذف" : "Delete", () => void runDeleteInvitation(entry));
  };
  const confirmRemoveOnbook = (entry: { name: string; onbookUid?: string; phone?: string }) => {
    confirmDialog(language === "ar" ? "حذف عضو من فريق العمل" : "Delete team member", language === "ar" ? "حذف عضو من فريق العمل" : "Delete team member", language === "ar" ? `هل أنت متأكد من حذف هذا العضو؟ («${entry.name}») سيُحذف سجلُه المحلي وتُلغى الدعوة المعلقة على رقمه.` : `Are you sure you want to delete this member? ("${entry.name}") The local record will be purged and any pending invite on the number will be revoked.`, language === "ar" ? `هل أنت متأكد من حذف هذا العضو؟ («${entry.name}») سيُحذف سجلُه المحلي وتُلغى الدعوة المعلقة على رقمه.` : `Are you sure you want to delete this member? ("${entry.name}") The local record will be purged and any pending invite on the number will be revoked.`, language === "ar" ? "حذف" : "Delete", () => void runRemoveOnbook(entry));
  };
  const runRemoveOnbook = async (entry: { name: string; onbookUid?: string; phone?: string }) => {
    try {
      if (entry.phone) {
        try {
          await deleteStaffMember.mutateAsync({ phone: entry.phone });
        } catch {
          notify(language === "ar" ? "تعذرت مزامنة الحذف مع الخادم." : "Could not sync the deletion with the server.", "error");
        }
      }
      if (entry.onbookUid) {
        await commit(onbookStaff.filter((item) => item.uid !== entry.onbookUid));
      }
      if (entry.phone) {
        await commit(onbookStaff.filter((item) => phoneKey(item.phone) !== phoneKey(entry.phone)));
      }
      await overview.refetch();
      notify(language === "ar" ? "تم حذف العضو والدعوة نهائياً من النظام." : "The member and their invitation were permanently deleted.");
    } catch {
      notify(language === "ar" ? "تعذر الحذف. حاول مرة أخرى." : "Could not delete. Please try again.", "error");
    }
  };
  const handleDeleteStaff = (entry: UnifiedEntry) => {
    if (entry.onDelete) entry.onDelete();
  };
  const handleEditStaff = (entry: UnifiedEntry) => {
    if (entry.onEdit) entry.onEdit();
  };
  const openEditInvitation = (entry: UnifiedEntry) => {
    const role: AddUserRole = entry.inviteRole === "admin" ? "mini-admin" : entry.inviteRole === "caretaker" ? "guard" : "staff";
    setEditingInvitation({ uid: String(entry.invitationId ?? ""), name: entry.name, phone: entry.phone, role, caps: capabilitiesForRole(role) });
  };
  const saveEditedInvitation = async (entry: { uid: string; name: string; phone: string; role: AddUserRole; permissions: WorkspacePermissions }): Promise<string | null> => {
    const invitationId = Number(entry.uid);
    if (!Number.isInteger(invitationId) || invitationId <= 0) return language === "ar" ? "دعوة غير صالحة." : "Invalid invitation.";
    if (entry.name.trim().length < 2 || phoneKey(entry.phone).length < 6) return language === "ar" ? "أدخل اسم العضو ورقم هاتفه بشكل صحيح." : "Enter the member's name and phone number.";
    const inviteRole: "admin" | "staff" | "caretaker" | "guest" = entry.role === "mini-admin" ? "admin" : entry.role === "guard" ? "caretaker" : "staff";
    try {
      await updateInvitation.mutateAsync({ invitationId, employeeName: entry.name.trim(), phone: entry.phone.trim(), role: inviteRole, permissions: entry.permissions });
      await overview.refetch();
      notify(language === "ar" ? "حُدِّثت بيانات الدعوة." : "Invitation details updated.");
      return null;
    } catch {
      return language === "ar" ? "تعذر تحديث الدعوة. حاول مرة أخرى." : "Could not update the invitation. Please try again.";
    }
  };
  const openEditOnbook = (entry: UnifiedEntry) => {
    const role: AddUserRole = entry.role === "guard" ? "guard" : "staff";
    setEditingOnbook({ uid: entry.onbookUid ?? "", name: entry.name, phone: entry.phone, role, caps: capabilitiesForRole(role) });
  };
  const saveEditedOnbook = async (entry: { uid: string; name: string; phone: string; role: AddUserRole; permissions: WorkspacePermissions }): Promise<string | null> => {
    const membersData = overview.data?.members ?? [];
    if (entry.name.trim().length < 2 || phoneKey(entry.phone).length < 6) return language === "ar" ? "أدخل اسم العضو ورقم هاتفه بشكل صحيح." : "Enter the member's name and phone number.";
    if (hasDuplicatePhone(membersData.map((item) => item.phone), onbookStaff, entry.phone, entry.uid)) return language === "ar" ? "رقم الهاتف مستخدم مسبقًا في التطبيق أو سجل الفريق." : "This phone is already used by an app member or another team record.";
    try {
      const existing = onbookStaff.find((item) => item.uid === entry.uid);
      const changedPhone = !existing || phoneKey(existing.phone) !== phoneKey(entry.phone);
      const inviteRole: "admin" | "staff" | "guest" = entry.role === "mini-admin" ? "admin" : entry.role === "guard" ? "guest" : "staff";
      if (changedPhone) {
        const oldInvitations = (overview.data?.invitations ?? []).filter((invitation) => !invitation.usedAt && !invitation.revokedAt && phoneKey(invitation.phone) === phoneKey(existing ? existing.phone : ""));
        await invite.mutateAsync({ employeeName: entry.name.trim(), phone: entry.phone.trim(), role: inviteRole, permissions: entry.permissions });
        for (const invitation of oldInvitations) await revoke.mutateAsync({ invitationId: invitation.id });
      }
      await commit(onbookStaff.map((item) => item.uid === entry.uid ? { ...item, name: entry.name.trim(), phone: entry.phone.trim(), role: entry.role === "guard" ? "guard" : "staff" } : item));
      await overview.refetch();
      notify(language === "ar" ? "حُفظت التعديلات على بيانات العضو." : "Member details were saved.");
      return null;
    } catch {
      return language === "ar" ? "تعذر حفظ التعديلات. حاول مرة أخرى." : "Could not save the changes. Please try again.";
    }
  };
  const parseInvitePermissions = (raw: unknown): unknown => {
    if (!raw) return undefined;
    if (typeof raw === "object") return raw;
    try { return JSON.parse(String(raw)) as unknown; } catch { return undefined; }
  };
  const unifiedTeam: UnifiedEntry[] = (() => {
    const rows: UnifiedEntry[] = [];
    const memberPhoneKeys = new Set<string>((overview.data?.members ?? []).filter((item) => item.status !== "disabled").map((item) => phoneKey(item.phone ?? "")));
    const memberRowKeys = new Set<string>();
    const memberBadge = (role: TeamMember["role"]): string => role === "owner" ? (language === "ar" ? "المالك" : "Owner") : role === "admin" ? (language === "ar" ? "مدير تشغيلي" : "Manager") : role === "guest" ? (language === "ar" ? "ضيف" : "Guest") : role === "caretaker" ? (language === "ar" ? "حارس / مشرف" : "Caretaker") : (language === "ar" ? "موظف" : "Staff");
    const roleForInvite = (serverRole: TeamMember["role"]): InviteRole => serverRole === "admin" ? "admin" : serverRole === "caretaker" ? "caretaker" : serverRole === "guest" ? "guest" : "staff";
    (overview.data?.members ?? []).filter((item) => item.status !== "disabled").forEach((rawMember) => {
      const memberKey = phoneKey(rawMember.phone ?? "");
      if (memberKey && memberRowKeys.has(memberKey)) return;
      if (memberKey) memberRowKeys.add(memberKey);
      const member = { ...rawMember, permissions: normalizeWorkspacePermissions(rawMember.permissions, rawMember.role === "owner" || rawMember.role === "admin" ? "manager" : rawMember.role === "guest" ? "guest" : "employee") } as TeamMember;
      const owner = member.role === "owner";
      const appActive = member.status === "active";
      const fullAccess = owner || member.role === "admin" || hasAllWorkspacePermissions(member.permissions);
      rows.push({
        key: `member:${member.id}`,
        kind: "member",
        name: member.displayName,
        roleLabel: owner ? (language === "ar" ? "المالك الأساسي — محمي وغير قابل للتعديل" : "Primary owner — protected") : `${WORKSPACE_ROLE_LABELS[member.role].ar}${fullAccess ? (language === "ar" ? " · صلاحية كاملة" : " · Full access") : ""}`,
        roleBadge: memberBadge(member.role),
        phone: member.phone ?? "",
        appActive,
        inviteRole: appActive ? undefined : roleForInvite(member.role),
        permissionsRaw: appActive ? undefined : rawMember.permissions,
        onEdit: owner ? undefined : () => setEditingMember(member),
        onDelete: owner ? undefined : () => confirmRemoveOnbook({ name: member.displayName, phone: member.phone ?? "" }),
      });
    });
    const onbookPhoneKeys = new Set<string>();
    onbookStaff.forEach((entry) => {
      const onbookKey = phoneKey(entry.phone);
      if (!onbookKey || onbookPhoneKeys.has(onbookKey)) return;
      if (memberPhoneKeys.has(onbookKey)) return;
      onbookPhoneKeys.add(onbookKey);
      const card: UnifiedEntry = {
        key: `onbook:${entry.uid}`,
        kind: "onbook",
        name: entry.name,
        roleLabel: entry.role === "guard" ? (language === "ar" ? "حارس ميداني" : "Field guard") : (language === "ar" ? "موظف / محاسب" : "Staff / accountant"),
        roleBadge: entry.role === "guard" ? (language === "ar" ? "حارس" : "Guard") : (language === "ar" ? "موظف" : "Staff"),
        role: entry.role,
        phone: entry.phone,
        appActive: false,
        inviteRole: entry.role === "guard" ? "guest" : "staff",
        onEdit: () => openEditOnbook(card),
        onDelete: () => confirmRemoveOnbook(entry),
        onbookUid: entry.uid,
      };
      rows.push(card);
    });
    (overview.data?.invitations ?? []).filter((entry) => !entry.usedAt && !entry.revokedAt).forEach((entry) => {
      if (onbookPhoneKeys.has(phoneKey(entry.phone)) || memberPhoneKeys.has(phoneKey(entry.phone))) return;
      const card: UnifiedEntry = {
        key: `inv:${entry.id}`,
        kind: "invitation",
        name: entry.employeeName,
        roleLabel: language === "ar" ? "بانتظار الانضمام" : "Awaiting join",
        roleBadge: language === "ar" ? "دعوة" : "Invite",
        phone: entry.phone,
        appActive: false,
        invitationId: entry.id,
        inviteRole: (entry.role ?? "staff") as InviteRole,
        permissionsRaw: parseInvitePermissions(entry.permissions),
        onEdit: () => openEditInvitation(card),
        onDelete: () => confirmDeleteInvitation(card),
      };
      rows.push(card);
    });
    const rank: Record<UnifiedEntry["kind"], number> = { member: 0, invitation: 1, onbook: 2 };
    return rows.sort((a, b) => (rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name, language === "ar" ? "ar" : "en")));
  })();

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <SubScreenHeader title={language === "ar" ? "إدارة المستخدمين" : "User management"} />
    {!isAuthenticated ? <AccessCard colors={colors} align={align} title={language === "ar" ? "تسجيل الدخول مطلوب" : "Sign-in required"} detail={language === "ar" ? "سجّل الدخول أولًا لتنشئ مساحة المنشأة أو تنضم إليها كموظف." : "Sign in to create your business workspace or join it as an employee."} actionLabel={language === "ar" ? "تسجيل الدخول" : "Sign in"} onPress={() => void startOAuthLogin()} /> : loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 36 }} /> : isManager ? <>
      <View style={[styles.addEmployeeRow, { flexDirection: row }]}><Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align, marginTop: 0, marginBottom: 0 }]}>{language === "ar" ? "فريق العمل" : "Team"}</Text><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إضافة عضو للفريق" : "Add team member"} onPress={() => setAddUserOpen(true)} style={({ pressed }) => [styles.addEmployee, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="person-add" size={18} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "إضافة عضو للفريق" : "Add team member"}</Text></Pressable></View>
      {overview.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : unifiedTeam.length === 0 ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: align }}>{language === "ar" ? "لا أعضاء بعد — أضف أول عضو من زر الإضافة أعلاه." : "No team members yet — add the first member above."}</Text></View> : unifiedTeam.map((entry) => <MemberRow key={entry.key} entry={entry} copied={copiedPhone === entry.phone} onCopyLink={!entry.appActive ? () => void handleCopyInvite(entry) : undefined} onLongCopyLink={!entry.appActive ? () => void handleLongCopyInvite(entry) : undefined} onEdit={entry.onEdit ? () => handleEditStaff(entry) : undefined} onDelete={entry.onDelete ? () => handleDeleteStaff(entry) : undefined} language={language} isRTL={isRTL} colors={colors} />)}
      {isOwner ? <View style={[styles.transferCard, { backgroundColor: colors.primary + "0D", borderColor: colors.primary + "66" }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "خيارات الملكية المتقدمة (نقل ملكية المنشأة)" : "Advanced ownership options (transfer facility ownership)"} onPress={() => setTransferOpen((value) => !value)} style={({ pressed }) => [styles.transferHeader, { flexDirection: row, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="verified-user" size={17} color={colors.primary} /><Text style={[styles.flex, { color: colors.foreground, fontSize: 12.5, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "🛡️ خيارات الملكية المتقدمة (نقل ملكية المنشأة)" : "🛡️ Advanced ownership options (transfer facility ownership)"}</Text><MaterialIcons name={transferOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={20} color={colors.muted} /></Pressable>{transferOpen ? <><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 5, textAlign: align }}>{language === "ar" ? "لا ينقل هذا الإجراء الملكية مباشرة. اختر عضوًا ثم اضغط باستمرار 3 ثوانٍ لتسجيل طلب يرسل إلى القناة الموثقة لإتمام OTP الخارجي." : "This does not transfer ownership directly. Select a member and hold for 3 seconds to request verified external OTP."}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.transferTargets, { flexDirection: row }]}>{overview.data?.members.filter((item) => item.role !== "owner" && item.status === "active").map((item) => <Pressable key={item.id} onPress={() => setTransferTarget({ ...item, permissions: normalizeWorkspacePermissions(item.permissions, item.role === "admin" ? "manager" : item.role === "guest" ? "guest" : "employee") } as TeamMember)} style={[styles.transferTarget, { borderColor: transferTarget?.id === item.id ? colors.primary : colors.border, backgroundColor: transferTarget?.id === item.id ? colors.primary + "18" : colors.surface }]}><Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 11 }}>{item.displayName}</Text><Text style={{ color: colors.muted, fontSize: 9, marginTop: 2 }}>{WORKSPACE_ROLE_LABELS[item.role].ar}</Text></Pressable>)}</ScrollView><Pressable disabled={!transferTarget || requestOwnershipTransfer.isPending} onPressIn={beginOwnershipHold} onPressOut={cancelOwnershipHold} style={[styles.holdButton, { backgroundColor: colors.primary, opacity: !transferTarget || requestOwnershipTransfer.isPending ? 0.45 : 1 }]}><MaterialIcons name="verified-user" size={19} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{transferProgress ? (language === "ar" ? `استمر بالضغط… ${transferProgress}/3` : `Keep holding… ${transferProgress}/3`) : (language === "ar" ? "اضغط 3 ثوانٍ لطلب نقل الملكية" : "Hold 3 seconds to request transfer")}</Text></Pressable></> : null}</View> : null}    </> : role === "staff" || role === "guest" ? <AccessCard colors={colors} align={align} title={language === "ar" ? (role === "guest" ? "حساب ضيف مفعّل" : "حساب موظف مفعّل") : (role === "guest" ? "Guest account active" : "Staff account active")} detail={language === "ar" ? (role === "guest" ? "تم تفعيل وصولك المحدود إلى المنشأة." : "تُطبّق صلاحياتك التي حددها المدير على المهام اليومية والتقارير والسجل.") : (role === "guest" ? "Your limited property access is active." : "Your manager-defined permissions apply to daily tasks, reports, and activity log.")} /> : <><AccessCard colors={colors} align={align} title={language === "ar" ? "بدء إعداد المنشأة" : "Set up your business workspace"} detail={language === "ar" ? "أنشئ مساحة المنشأة مرة واحدة لتفتح كل الأدوات. الموظفون يفعّلون دعواتهم عبر محور المنشأة." : "Create the workspace once to unlock every tool. Employees activate their invites through the workspace hub."} actionLabel={language === "ar" ? "أنا المالك — إنشاء المساحة" : "I am the owner — create workspace"} onPress={() => void activateOwnerWorkspace()} /><Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "بدء إعداد المنشأة" : "Set up your business workspace"}</Text><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: align }}>{language === "ar" ? "مرّت بيانات الدعوة إلى محور المنشأة — سجّل الدخول هناك وادخل برمز الدعوة عند الحاجة." : "Invitation activation now lives in the workspace hub — sign in there and enter your invite code when needed."}</Text></View></>}
  </ScrollView>
  <EmployeePermissionsModal visible={Boolean(editingMember)} title={editingMember ? (language === "ar" ? `صلاحيات وتحصل ${editingMember.displayName}` : `${editingMember.displayName}'s permissions`) : ""} language={language} isRTL={isRTL} colors={colors} permissions={memberPermissions} onPermissionsChange={setMemberPermissions} permissionsOpen={memberPermissionsOpen} onPermissionsOpenChange={setMemberPermissionsOpen} primaryLabel={language === "ar" ? "حفظ الإعدادات" : "Save settings"} primaryIcon="save" isPending={updateMemberPermissions.isPending || updateMemberCollectionProfile.isPending} onClose={() => setEditingMember(null)} onSubmit={() => void saveMemberPermissions()} lockPermissions={editingMember?.role === "owner"} cliqAlias={memberCliqAlias} onCliqAliasChange={setMemberCliqAlias} bankDetails={memberBankDetails} onBankDetailsChange={setMemberBankDetails} commissionRate={memberCommissionRate} onCommissionRateChange={setMemberCommissionRate} commissionType={memberCommissionType} onCommissionTypeChange={setMemberCommissionType} allowDirectCollection={memberAllowDirectCollection} onAllowDirectCollectionChange={setMemberAllowDirectCollection} />
  <AddUserModal visible={addUserOpen || Boolean(editingOnbook) || Boolean(editingInvitation)} language={language} isRTL={isRTL} colors={colors} editInitial={editingOnbook ?? editingInvitation} onUpdate={editingOnbook ? saveEditedOnbook : editingInvitation ? saveEditedInvitation : undefined} onClose={() => { setAddUserOpen(false); setEditingOnbook(null); setEditingInvitation(null); }} onSubmit={submitUnifiedTeamMember} lookupUserCode={lookupUserCode} />
  <ConfirmDeleteDialog visible={confirmState !== null} title={confirmState?.title ?? ""} body={confirmState?.body ?? ""} confirmLabel={confirmState?.confirmLabel ?? ""} language={language} isRTL={isRTL} onCancel={() => setConfirmState(null)} onConfirm={() => { if (!confirmState) return; const action = confirmState.onConfirm; setConfirmState(null); void action(); }} />
    {toast ? <View pointerEvents="none" style={[styles.toastWrap, { backgroundColor: toast.tone === "success" ? colors.success : colors.error, flexDirection: row }]}><MaterialIcons name={toast.tone === "success" ? "check-circle" : "error"} size={15} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 12.5 }}>{toast.text}</Text></View> : null}
  </ScreenContainer>;
}

function EmployeePermissionsModal({ visible, title, language, isRTL, colors, name, phone, onNameChange, onPhoneChange, preset, onPresetChange, permissions, onPermissionsChange, permissionsOpen, onPermissionsOpenChange, primaryLabel, primaryIcon, isPending, onClose, onSubmit, lockPermissions = false, cliqAlias, onCliqAliasChange, bankDetails, onBankDetailsChange, commissionRate, onCommissionRateChange, commissionType, onCommissionTypeChange, allowDirectCollection, onAllowDirectCollectionChange }: { visible: boolean; title: string; language: "ar" | "en"; isRTL: boolean; colors: ReturnType<typeof useColors>; name?: string; phone?: string; onNameChange?: (value: string) => void; onPhoneChange?: (value: string) => void; preset?: PermissionPreset; onPresetChange?: (preset: PermissionPreset) => void; permissions: WorkspacePermissions; onPermissionsChange: (permissions: WorkspacePermissions) => void; permissionsOpen: boolean; onPermissionsOpenChange: (value: boolean) => void; primaryLabel: string; primaryIcon: React.ComponentProps<typeof MaterialIcons>["name"]; isPending: boolean; onClose: () => void; onSubmit: () => void; lockPermissions?: boolean; cliqAlias?: string; onCliqAliasChange?: (value: string) => void; bankDetails?: string; onBankDetailsChange?: (value: string) => void; commissionRate?: string; onCommissionRateChange?: (value: string) => void; commissionType?: "percent" | "fixed"; onCommissionTypeChange?: (value: "percent" | "fixed") => void; allowDirectCollection?: boolean; onAllowDirectCollectionChange?: (value: boolean) => void }) {
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const togglePermission = (key: PermissionKey) => onPermissionsChange({ ...permissions, [key]: !permissions[key] });
  const Switch = ({ value, onValueChange, disabled = false }: { value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean; trackColor?: unknown; thumbColor?: string }) => <AppToggle value={value} onValueChange={onValueChange} disabled={disabled} isRTL={isRTL} activeColor={colors.success} inactiveColor={colors.border} accessibilityLabel={language === "ar" ? "تبديل الصلاحية" : "Toggle permission"} />;
  return <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.modalHeader, { flexDirection: row }]}><Text style={[styles.modalTitle, { color: colors.foreground, textAlign: align }]}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={onClose} style={[styles.modalClose, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>{onNameChange ? <><TextInput value={name} onChangeText={onNameChange} placeholder={language === "ar" ? "اسم الموظف" : "Employee name"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><TextInput value={phone} onChangeText={onPhoneChange} keyboardType="phone-pad" placeholder={language === "ar" ? "رقم الهاتف" : "Phone number"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /></> : null}{onPresetChange ? <View style={styles.presetSection}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "الدور التشغيلي" : "Operational role"}</Text><View style={[styles.presetRow, { flexDirection: row }]}><PresetButton active={preset === "mini-admin"} icon="admin-panel-settings" label={language === "ar" ? "مدير تشغيلي" : "Mini-admin"} color={colors.success} onPress={() => onPresetChange("mini-admin")} /><PresetButton active={preset === "staff"} icon="badge" label={language === "ar" ? "موظف حجوزات" : "Booking staff"} color={colors.primary} onPress={() => onPresetChange("staff")} /><PresetButton active={preset === "guard"} icon="security" label={language === "ar" ? "حارس" : "Guard"} color={colors.warning} onPress={() => onPresetChange("guard")} /></View></View> : null}<Pressable accessibilityRole="button" accessibilityState={{ expanded: permissionsOpen }} onPress={() => onPermissionsOpenChange(!permissionsOpen)} style={[styles.permissionsToggle, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}><View style={[styles.permissionsToggleIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="tune" size={18} color={colors.primary} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تخصيص الصلاحيات" : "Customize permissions"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? `${PERMISSION_KEYS.filter((key) => permissions[key]).length} من ${PERMISSION_KEYS.length} صلاحيات مفعّلة` : `${PERMISSION_KEYS.filter((key) => permissions[key]).length} of ${PERMISSION_KEYS.length} enabled`}</Text></View><MaterialIcons name={permissionsOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={22} color={colors.muted} /></Pressable>{permissionsOpen ? <View style={[styles.permissionsList, { borderColor: colors.border }]}>{PERMISSION_KEYS.map((key) => <View key={key} style={[styles.permissionRow, { borderBottomColor: colors.border, flexDirection: row }]}><View style={[styles.permissionIcon, { backgroundColor: permissions[key] ? colors.success + "18" : colors.surfaceMuted }]}><MaterialIcons name={permissionLabels[key].icon} size={17} color={permissions[key] ? colors.success : colors.muted} /></View><Text style={[styles.permissionLabel, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? permissionLabels[key].ar : permissionLabels[key].en}</Text><Switch value={permissions[key]} onValueChange={() => togglePermission(key)} disabled={lockPermissions} /></View>)}</View> : null}{onCliqAliasChange && onBankDetailsChange && onCommissionRateChange && onCommissionTypeChange && onAllowDirectCollectionChange ? <CollectionProfileFields colors={colors} language={language} row={row} align={align} cliqAlias={cliqAlias ?? ""} onCliqAliasChange={onCliqAliasChange} bankDetails={bankDetails ?? ""} onBankDetailsChange={onBankDetailsChange} commissionRate={commissionRate ?? ""} onCommissionRateChange={onCommissionRateChange} commissionType={commissionType ?? "percent"} onCommissionTypeChange={onCommissionTypeChange} allowDirectCollection={allowDirectCollection === true} onAllowDirectCollectionChange={onAllowDirectCollectionChange} /> : null}</ScrollView><Pressable disabled={isPending || lockPermissions} onPress={onSubmit} style={({ pressed }) => [styles.modalPrimary, { backgroundColor: lockPermissions ? colors.muted : colors.primary, opacity: pressed || isPending ? 0.66 : 1 }]}><MaterialIcons name={lockPermissions ? "lock" : primaryIcon} size={18} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{lockPermissions ? (language === "ar" ? "صلاحيات المالك الأساسي محمية" : "Primary owner access is protected") : primaryLabel}</Text></Pressable></View></View></Modal>;
}

function PresetButton({ active, icon, label, color, onPress }: { active: boolean; icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; color: string; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.presetButton, { backgroundColor: active ? color + "18" : "transparent", borderColor: active ? color : color + "35", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={icon} size={17} color={color} /><Text style={{ color, fontSize: 11, fontWeight: "900" }}>{label}</Text></Pressable>; }

function CollectionProfileFields({ colors, language, row, align, cliqAlias, onCliqAliasChange, bankDetails, onBankDetailsChange, commissionRate, onCommissionRateChange, commissionType, onCommissionTypeChange, allowDirectCollection, onAllowDirectCollectionChange }: { colors: ReturnType<typeof useColors>; language: "ar" | "en"; row: "row" | "row-reverse"; align: "left" | "right"; cliqAlias: string; onCliqAliasChange: (value: string) => void; bankDetails: string; onBankDetailsChange: (value: string) => void; commissionRate: string; onCommissionRateChange: (value: string) => void; commissionType: "percent" | "fixed"; onCommissionTypeChange: (value: "percent" | "fixed") => void; allowDirectCollection: boolean; onAllowDirectCollectionChange: (value: boolean) => void }) {
  const [commissionOpen, setCommissionOpen] = useState(false);
  return <View style={[styles.collectionSection, { backgroundColor: colors.primary + "0C", borderColor: colors.primary + "40" }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إعداد نظام العمولات" : "Commission scheme"} onPress={() => setCommissionOpen((value) => !value)} style={({ pressed }) => [styles.collectionTitleRow, { flexDirection: row, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="account-balance-wallet" size={18} color={colors.primary} /><Text style={[styles.flex, { color: colors.foreground, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "التحصيل والعمولة" : "Collections and commission"}</Text>{commissionRate.trim() !== "" ? <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "800" }}>{commissionRate} {commissionType === "percent" ? "%" : language === "ar" ? "د.أ" : "JOD"}</Text> : null}<MaterialIcons name={commissionOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={20} color={colors.muted} /></Pressable><View style={[styles.collectionToggle, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 12, textAlign: align }}>{language === "ar" ? "السماح بالتحصيل المباشر" : "Allow direct collection"}</Text><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2, textAlign: align }}>{language === "ar" ? "يظهر هذا الموظف كحساب مستفيد عند الدفع." : "This member appears as a payment recipient."}</Text></View><AppToggle value={allowDirectCollection} onValueChange={onAllowDirectCollectionChange} isRTL={row === "row-reverse"} activeColor={colors.success} inactiveColor={colors.border} accessibilityLabel={language === "ar" ? "السماح بالتحصيل المباشر" : "Allow direct collection"} /></View><TextInput value={cliqAlias} onChangeText={onCliqAliasChange} placeholder={language === "ar" ? "اسم أو رقم CliQ للموظف" : "Staff CliQ alias or phone"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><TextInput value={bankDetails} onChangeText={onBankDetailsChange} multiline placeholder={language === "ar" ? "IBAN أو بيانات الحساب البنكي" : "IBAN or bank-account details"} placeholderTextColor={colors.muted} style={[styles.collectionTextarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />{commissionOpen ? <><View style={{ marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.primary + "33", paddingTop: 10 }}><Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 12, textAlign: align }}>{language === "ar" ? "نظام العمولات والحوافز (اختياري)" : "Commission & incentive scheme (optional)"}</Text><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3, textAlign: align }}>{language === "ar" ? "تُحتسب قيمة العمولة تلقائيًا على دفعات التحصيل لهذا الموظف عند إتمام الحجز، وتُقاص ضمن تسوية العهدة." : "Commission is accrued automatically on this member's collection payments at booking completion and is netted within float settlement."}</Text><View style={[styles.commissionTypeRow, { flexDirection: row }]}><Pressable onPress={() => onCommissionTypeChange("fixed")} style={({ pressed }) => [styles.commissionTypeChip, { backgroundColor: commissionType === "fixed" ? colors.primary + "14" : colors.surface, borderColor: commissionType === "fixed" ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="currency-exchange" size={19} color={commissionType === "fixed" ? colors.primary : colors.muted} /><View style={styles.flex}><Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 11, fontWeight: "800", textAlign: align }}>{language === "ar" ? "مبلغ ثابت لكل حجز" : "Fixed per booking"}</Text><Text style={{ color: colors.muted, fontSize: 9, marginTop: 2, textAlign: align }}>{language === "ar" ? "مثلًا 1 د.أ عن كل حجز" : "e.g. 1 JOD per booking"}</Text></View></Pressable><Pressable onPress={() => onCommissionTypeChange("percent")} style={({ pressed }) => [styles.commissionTypeChip, { backgroundColor: commissionType === "percent" ? colors.primary + "14" : colors.surface, borderColor: commissionType === "percent" ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="percent" size={19} color={commissionType === "percent" ? colors.primary : colors.muted} /><View style={styles.flex}><Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 11, fontWeight: "800", textAlign: align }}>{language === "ar" ? "نسبة من قيمة التحصيل" : "Percent of collected"}</Text><Text style={{ color: colors.muted, fontSize: 9, marginTop: 2, textAlign: align }}>{language === "ar" ? "مثلًا 2.5% من كل دفعة" : "e.g. 2.5% of each payment"}</Text></View></Pressable></View><View style={[styles.commissionAmountRow, { flexDirection: row, marginTop: 9 }]}><TextInput value={commissionRate} onChangeText={onCommissionRateChange} keyboardType="decimal-pad" placeholder={language === "ar" ? "قيمة العمولة" : "Commission rate"} placeholderTextColor={colors.muted} style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><View style={[styles.commissionUnitBadge, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "40" }]}><Text style={{ color: colors.primary, fontWeight: "900" }}>{commissionType === "percent" ? "%" : language === "ar" ? "د.أ" : "JOD"}</Text></View></View><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 8, textAlign: align }}>{language === "ar" ? "تُحسب فقط على الدفعات التي يُسند تحصيلها لهذا الموظف." : "Calculated only on payments routed to this member."}</Text></View></> : null}</View>;
}

function AccessCard({ colors, align, title, detail, actionLabel, onPress }: { colors: ReturnType<typeof useColors>; align: "left" | "right"; title: string; detail: string; actionLabel?: string; onPress?: () => void }) { return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 20 }]}><MaterialIcons name="lock" size={27} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900", marginTop: 12, textAlign: align }}>{title}</Text><Text style={{ color: colors.muted, lineHeight: 20, marginTop: 7, textAlign: align }}>{detail}</Text>{actionLabel && onPress ? <Pressable onPress={onPress} style={[styles.primary, { backgroundColor: colors.primary }]}><Text style={{ color: colors.background, fontWeight: "900" }}>{actionLabel}</Text></Pressable> : null}</View>; }

function MemberRow({ entry, copied, onCopyLink, onLongCopyLink, onEdit, onDelete, language, isRTL, colors }: { entry: UnifiedEntry; copied: boolean; onCopyLink?: () => void; onLongCopyLink?: () => void; onEdit?: () => void; onDelete?: () => void; language: "ar" | "en"; isRTL: boolean; colors: ReturnType<typeof useColors> }) {
  const { width } = useWindowDimensions();
  const compact = width < 768;
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const icon = entry.kind === "invitation" ? "schedule" : entry.role === "guard" ? "security" : entry.role === "staff" ? "work-outline" : entry.appActive ? "smartphone" : "badge";
  const iconBg = entry.kind === "invitation" ? colors.warning + "18" : entry.appActive ? colors.success + "18" : "#0EA5E9" + "18";
  const iconColor = entry.kind === "invitation" ? colors.warning : entry.appActive ? colors.success : "#0EA5E9";
  const displayPhone = phoneKey(entry.phone);
  const hasActions = Boolean(onCopyLink || onDelete || onEdit);
  const phoneNode = displayPhone ? <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10.5, fontFamily: "monospace", writingDirection: "ltr", textAlign: "left" }}>{displayPhone}</Text> : null;
  const actionChips = hasActions ? <View style={compact ? styles.actionBar : styles.memberActions}>
    {onEdit ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تعديل بيانات العضو" : "Edit member details"} onPress={(event) => { event?.stopPropagation?.(); onEdit(); }} style={({ pressed }) => [styles.memberAction, { borderColor: colors.sky + "66", backgroundColor: colors.sky + "12", flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="edit" size={12} color="#0284C7" /><Text style={{ color: "#0284C7", fontSize: 9.5, fontWeight: "900" }}>{language === "ar" ? "✏️ تعديل" : "✏️ Edit"}</Text></Pressable> : null}
    {onCopyLink ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "نسخ كود الدعوة" : "Copy invitation code"} onLongPress={(event) => { event?.stopPropagation?.(); onLongCopyLink?.(); }} delayLongPress={500} onPress={(event) => { event?.stopPropagation?.(); onCopyLink(); }} style={({ pressed }) => [styles.memberAction, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "12", flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="content-copy" size={12} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 9.5, fontWeight: "900" }}>{copied ? (language === "ar" ? "✓ تم النسخ" : "✓ Copied") : (language === "ar" ? "📋 نسخ كود الدعوة" : "📋 Copy invite code")}</Text></Pressable> : null}
    {onDelete ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حذف العضو" : "Delete member"} onPress={(event) => { event?.stopPropagation?.(); onDelete(); }} style={({ pressed }) => [styles.memberAction, styles.dangerAction, { borderColor: colors.error + "55", backgroundColor: colors.error + "12", flexDirection: row, opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="delete-outline" size={13} color={colors.error} /><Text style={{ color: colors.error, fontSize: 9.5, fontWeight: "900" }}>{language === "ar" ? "🗑️ حذف" : "🗑️ Delete"}</Text></Pressable> : null}
  </View> : null;
  return (
    <View style={[styles.member, { backgroundColor: colors.surface, borderColor: entry.kind === "invitation" ? colors.warning + "66" : entry.appActive ? colors.border : "#94A3B8" + "55", flexDirection: compact ? "column" : "row", alignItems: compact ? "stretch" : "center", gap: compact ? 10 : 12, marginTop: 8, width: "100%" }]}>
      <View style={[styles.memberMain, { flexDirection: row, minWidth: 0, alignItems: "center" }]}>
        <View style={[styles.memberIcon, { backgroundColor: iconBg }]}><MaterialIcons name={icon} size={20} color={iconColor} /></View>
        <View style={[styles.flex, { gap: 6 }]}>
          <View style={{ flexDirection: row, alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: "900", fontSize: 13, textAlign: align, flexShrink: 1 }}>{entry.name}</Text>
            <View style={[styles.rolePill, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "50", flexDirection: row }]}><MaterialIcons name="badge" size={10} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 9, fontWeight: "900" }}>{entry.roleBadge}</Text></View>
            <View style={[styles.statusPill, { backgroundColor: entry.appActive ? colors.success + "14" : colors.warning + "14", borderColor: entry.appActive ? colors.success + "55" : colors.warning + "55", flexDirection: row }]}><MaterialIcons name={entry.appActive ? "check-circle" : "schedule"} size={11} color={entry.appActive ? colors.success : colors.warning} /><Text style={{ color: entry.appActive ? colors.success : colors.warning, fontSize: 9, fontWeight: "900" }}>{entry.appActive ? (language === "ar" ? "نشط" : "Active") : (language === "ar" ? "بانتظار انضمام العضو" : "Awaiting member join")}</Text></View>
          </View>
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10.5, textAlign: align }}>{entry.roleLabel}</Text>
        </View>
      </View>
      {compact ? (
        <>
          {phoneNode ? <View style={{ width: "100%", alignItems: isRTL ? "flex-end" : "flex-start" }}>{phoneNode}</View> : null}
          {actionChips}
        </>
      ) : (
        <View style={[styles.memberTrailing, { alignItems: isRTL ? "flex-start" : "flex-end" }]}>
          {phoneNode}
          {actionChips}
        </View>
      )}
    </View>
  );
}

function ConfirmDeleteDialog({ visible, title, body, confirmLabel, language, isRTL, onCancel, onConfirm }: { visible: boolean; title: string; body: string; confirmLabel: string; language: "ar" | "en"; isRTL: boolean; onCancel: () => void; onConfirm: () => void }) {
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const backdropStyle: ViewStyle = Platform.OS === "web"
    ? { ...styles.confirmBackdrop, backdropFilter: "blur(6px)" } as ViewStyle
    : { ...styles.confirmBackdrop };
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}><View style={backdropStyle}><View style={styles.confirmCard}><View style={[styles.confirmHeader, { flexDirection: row }]}><View style={[styles.memberIcon, { backgroundColor: "#E11D48" + "18", flexDirection: row }]}><MaterialIcons name="delete-outline" size={20} color="#F43F5E" /></View><View style={styles.flex}><Text style={[styles.confirmTitle, { textAlign: align }]}>{title}</Text><Text style={[styles.confirmSubtitle, { textAlign: align }]}>{language === "ar" ? "إجراء غير قابل للتراجع" : "This action cannot be undone"}</Text></View></View><Text style={[styles.confirmBody, { textAlign: align }]}>{body}</Text><View style={[styles.confirmActions, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إلغاء" : "Cancel"} onPress={onCancel} style={[styles.confirmButton, { backgroundColor: "#1E293B", borderWidth: 1, borderColor: "#334155" }]}><Text style={{ color: "#CBD5E1", fontWeight: "700", fontSize: 13 }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تأكيد الحذف" : "Confirm deletion"} onPress={onConfirm} style={[styles.confirmButton, { backgroundColor: "#E11D48" }]}><MaterialIcons name="delete-outline" size={16} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 13 }}>{confirmLabel}</Text></Pressable></View></View></View></Modal>;
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 44 }, backButton: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 10 }, sectionTitle: { fontSize: 15, fontWeight: "900", marginTop: 20, marginBottom: 8 }, addEmployeeRow: { alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 19 }, addEmployee: { minHeight: 39, borderRadius: 11, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }, card: { borderWidth: 1, borderRadius: 18, padding: 14 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, marginBottom: 10 }, primary: { minHeight: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 4 }, transferCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 14 },
    transferHeader: { alignItems: "center", gap: 8, minHeight: 40 }, transferTargets: { gap: 8, paddingVertical: 11 }, transferTarget: { minWidth: 108, borderWidth: 1, borderRadius: 12, padding: 9, alignItems: "center" }, holdButton: { minHeight: 47, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, member: { borderWidth: 1, borderRadius: 16, padding: 12, alignItems: "center", gap: 10, marginTop: 8 },
    memberMain: { flex: 1, minWidth: 0, alignItems: "center", gap: 10 },
    memberTrailing: { flexShrink: 0, gap: 6 }, memberIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" }, statusPill: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, alignItems: "center", gap: 4 }, rolePill: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, alignItems: "center", gap: 4 }, memberActions: { gap: 7, marginTop: 9 }, actionBar: { flexDirection: "row", flexWrap: "wrap", columnGap: 8, rowGap: 8, alignItems: "center", width: "100%" }, memberActionRow: { flexWrap: "wrap", gap: 7 }, memberAction: { minHeight: 32, borderRadius: 9, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", gap: 5 },
    dangerAction: { minHeight: 32 }, inviteRevoke: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(2, 12, 10, 0.72)", justifyContent: "flex-end", padding: 12 }, confirmBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.72)", alignItems: "center", justifyContent: "center", padding: 20 }, confirmCard: { width: "100%", maxWidth: 448, borderWidth: 1, borderRadius: 16, padding: 24, backgroundColor: "#0F172A", borderColor: "#1E293B" }, confirmHeader: { alignItems: "center", gap: 8 }, confirmTitle: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: "900", color: "#F8FAFC" }, confirmSubtitle: { color: "#94A3B8", fontSize: 11, lineHeight: 16, marginTop: 2 }, confirmBody: { color: "#CBD5E1", fontSize: 13, lineHeight: 20, marginTop: 10 }, confirmActions: { flexDirection: "row", gap: 10, marginTop: 20 }, confirmButton: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }, toastWrap: { position: "absolute", top: 14, alignSelf: "center", zIndex: 50, borderRadius: 30, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center", gap: 6 } as const, modalCard: { maxHeight: "92%", borderWidth: 1, borderRadius: 24, padding: 15 }, modalHeader: { alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 12 }, modalTitle: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: "900" }, modalClose: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, modalContent: { paddingBottom: 10 }, presetSection: { marginTop: 3, marginBottom: 13 }, presetRow: { gap: 8, marginTop: 8 }, presetButton: { flex: 1, minHeight: 43, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, paddingHorizontal: 7 }, permissionsToggle: { minHeight: 58, borderWidth: 1, borderRadius: 14, alignItems: "center", gap: 9, paddingHorizontal: 11 }, permissionsToggleIcon: { width: 33, height: 33, borderRadius: 10, alignItems: "center", justifyContent: "center" }, permissionsList: { borderWidth: 1, borderRadius: 14, marginTop: 8, overflow: "hidden" }, permissionRow: { minHeight: 54, alignItems: "center", gap: 9, paddingHorizontal: 11, borderBottomWidth: StyleSheet.hairlineWidth }, permissionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 }, permissionLabel: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17 }, collectionSection: { borderWidth: 1, borderRadius: 15, padding: 11, marginTop: 12 }, collectionTitleRow: { alignItems: "center", gap: 8 }, collectionToggle: { borderWidth: 1, borderRadius: 13, padding: 10, alignItems: "center", gap: 9, marginTop: 10 }, commissionTypeRow: { gap: 8, marginTop: 9 }, commissionTypeChip: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 9, minHeight: 62, alignItems: "center", gap: 8, paddingHorizontal: 8 }, commissionAmountRow: { alignItems: "center", gap: 8 }, commissionUnitBadge: { minWidth: 46, height: 40, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }, collectionTextarea: { minHeight: 68, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingTop: 9, marginBottom: 10, textAlignVertical: "top" }, commissionRow: { gap: 8, alignItems: "center" }, commissionKind: { minHeight: 48, minWidth: 92, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 9 }, modalPrimary: { minHeight: 49, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, marginTop: 10 },
});
