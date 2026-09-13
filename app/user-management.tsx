import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import AddUserModal, { type AddUserRole } from "@/components/users/AddUserModal";
import { startOAuthLogin } from "@/constants/oauth";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { findOnbookByPhone, normalizeUid, phoneKey, suggestOnbookUid, validateOnbookEntry, type OnbookStaff } from "@/lib/staff-directory";
import { useOnbookStaff } from "@/lib/staff-directory-store";
import { buildInviteCode } from "@/lib/invite-code";
import { trpc } from "@/lib/trpc";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { PERMISSION_KEYS, WORKSPACE_ROLE_LABELS, hasAllWorkspacePermissions, normalizeWorkspacePermissions, permissionsForPreset, type PermissionKey, type PermissionPreset, type WorkspacePermissions } from "@/shared/workspace-permissions";
import * as Clipboard from "expo-clipboard";

type TeamMember = { id: number; userId: number; displayName: string; phone: string; role: "owner" | "admin" | "staff" | "guest"; permissions: WorkspacePermissions; cliqAlias?: string | null; bankDetails?: string | null; commissionRate?: string | null; commissionType?: "percent" | "fixed" | null; allowDirectCollection?: boolean; userCode: string | null };

type UnifiedEntry = {
  key: string;
  kind: "member" | "onbook" | "invitation";
  name: string;
  roleLabel: string;
  phone: string;
  appActive: boolean;
  inviteCode?: string;
  onPress?: () => void;
  onActivate?: () => void;
  invitationId?: number;
  inviteRole?: "admin" | "staff" | "caretaker" | "guest";
  invitePermissions?: unknown;
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
  const revoke = trpc.workspace.revokeInvitation.useMutation();
  const accept = trpc.workspace.acceptInvitation.useMutation();
  const bootstrapOwner = trpc.workspace.bootstrapOwner.useMutation();
  const updateMemberPermissions = trpc.workspace.updateMemberPermissions.useMutation();
  const updateMemberCollectionProfile = trpc.workspace.updateMemberCollectionProfile.useMutation();
  const requestOwnershipTransfer = trpc.workspace.requestOwnershipTransfer.useMutation();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
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
   const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
   const [copiedMemberId, setCopiedMemberId] = useState<number | null>(null);
   const align = isRTL ? "right" : "left";
   const row = isRTL ? "row-reverse" : "row";
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const { staff: onbookStaff, ready: onbookReady, commit } = useOnbookStaff();

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

  const runInvite = async (employeeName: string, phoneNumber: string, role: "admin" | "staff" | "guest", permissions: WorkspacePermissions): Promise<boolean> => {
    if (employeeName.trim().length < 2 || phoneNumber.trim().length < 6) {
      Alert.alert(language === "ar" ? "بيانات ناقصة" : "Missing details", language === "ar" ? "أدخل اسم الموظف ورقم هاتفه بشكل صحيح." : "Enter the employee name and phone number.");
      return false;
    }
    try {
      await invite.mutateAsync({ employeeName: employeeName.trim(), phone: phoneNumber.trim(), role, permissions });
      await overview.refetch();
      return true;
    } catch {
      Alert.alert(language === "ar" ? "تعذر إنشاء الدعوة" : "Could not create invitation", language === "ar" ? "حاول مرة أخرى." : "Please try again.");
      return false;
    }
  };
  const inviteFromAddModal = async (employeeName: string, phoneNumber: string, role: AddUserRole, permissions: WorkspacePermissions) => {
    const inviteRole: "admin" | "staff" | "guest" = role === "mini-admin" ? "admin" : role === "guard" ? "guest" : "staff";
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
    const inviteCode = buildInviteCode(phone);
    const existingOnbook = findOnbookByPhone(onbookStaff, phone);
    if (!existingOnbook) {
      const issue = validateOnbookEntry({ name, phone }, membersData.map((item) => item.phone), onbookStaff);
      if (issue === "phone") return language === "ar" ? "أدخل رقم هاتف صحيحًا (6 أرقام على الأقل)." : "Enter a valid phone number (at least 6 digits).";
      if (issue === "name") return language === "ar" ? "أدخل اسم العضو (حرفان على الأقل)." : "Enter the member's name (at least 2 characters).";
      if (issue === "duplicate-phone") return language === "ar" ? "رقم الهاتف مستخدم مسبقًا في التطبيق أو سجل الفريق." : "This phone is already used by an app member or another team record.";
      const uid = suggestOnbookUid(role === "guard" ? "guard" : "staff", [...membersData.map((item) => item.userCode).filter((code): code is string => Boolean(code)), ...onbookStaff.map((item) => item.uid)]);
      const entry: OnbookStaff = { uid, name: name.trim(), phone: phone.trim(), role: role === "guard" ? "guard" : "staff", inviteCode: inviteCode ?? undefined, isAppUser: false, createdAt: new Date().toISOString() };
      await commit([...onbookStaff, entry]);
    } else {
      await commit(onbookStaff.map((item) => item.uid === existingOnbook.uid ? { ...item, name: name.trim(), role: role === "guard" ? "guard" : "staff", inviteCode: item.inviteCode ?? inviteCode ?? undefined } : item));
    }
    await inviteFromAddModal(name, phone, role, permissions);
    return null;
  };
  const acceptInvite = async () => {
    if (phone.trim().length < 6 || !/^\d{6}$/.test(pin)) {
      Alert.alert(language === "ar" ? "رمز غير صالح" : "Invalid code", language === "ar" ? "أدخل رقم الهاتف ورمز الدعوة المكون من 6 أرقام." : "Enter the phone number and six-digit invitation code.");
      return;
    }
    try {
      await accept.mutateAsync({ phone: phone.trim(), pin });
      await refetchWorkspace();
      Alert.alert(language === "ar" ? "تم التفعيل" : "Activated", language === "ar" ? "تم ربط حسابك كموظف بنجاح." : "Your employee account is now linked.");
    } catch {
      Alert.alert(language === "ar" ? "دعوة غير صالحة" : "Invalid invitation", language === "ar" ? "تحقق من الهاتف والرمز أو اطلب دعوة جديدة." : "Check the phone and code or request a new invitation.");
    }
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
    void Clipboard.setStringAsync(`#${code}`);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 1600);
  };
  const resendInvitation = async (entry: UnifiedEntry) => {
    if (entry.kind !== "invitation" || !entry.invitationId) return;
    try {
      await invite.mutateAsync({ employeeName: entry.name, phone: entry.phone, role: entry.inviteRole ?? "staff", permissions: normalizeWorkspacePermissions(entry.invitePermissions, entry.inviteRole === "admin" ? "manager" : entry.inviteRole === "guest" ? "guest" : "employee") });
      await overview.refetch();
      Alert.alert(language === "ar" ? "إعادة إرسال الدعوة" : "Invitation re-sent", language === "ar" ? `أُرسلت دعوة جديدة إلى «${entry.name}». عند التفعيل ينسخ المالك رابط الدعوة أو يقرأ رمز الربط.` : `A new invitation was sent to "${entry.name}". On activation, share the invite link or read the linking code.`);
    } catch {
      Alert.alert(language === "ar" ? "تعذر إعادة الإرسال" : "Could not re-send", language === "ar" ? "حاول مرة أخرى." : "Please try again.");
    }
  };
  const revokeInvitation = async (entry: UnifiedEntry) => {
    if (entry.kind !== "invitation" || !entry.invitationId) return;
    try {
      await revoke.mutateAsync({ invitationId: entry.invitationId });
      await overview.refetch();
    } catch {
      Alert.alert(language === "ar" ? "تعذر إلغاء الدعوة" : "Could not revoke", language === "ar" ? "حاول مرة أخرى." : "Please try again.");
    }
  };
  const parseInvitePermissions = (raw: unknown): unknown => {
    if (!raw) return undefined;
    if (typeof raw === "object") return raw;
    try { return JSON.parse(String(raw)) as unknown; } catch { return undefined; }
  };
  const unifiedTeam: UnifiedEntry[] = (() => {
    const rows: UnifiedEntry[] = [];
    (overview.data?.members ?? []).forEach((rawMember) => {
      const member = { ...rawMember, permissions: normalizeWorkspacePermissions(rawMember.permissions, rawMember.role === "owner" || rawMember.role === "admin" ? "manager" : rawMember.role === "guest" ? "guest" : "employee") } as TeamMember;
      const owner = member.role === "owner";
      const fullAccess = owner || member.role === "admin" || hasAllWorkspacePermissions(member.permissions);
      rows.push({
        key: `member:${member.id}`,
        kind: "member",
        name: member.displayName,
        roleLabel: owner ? (language === "ar" ? "المالك الأساسي — محمي وغير قابل للتعديل" : "Primary owner — protected") : `${WORKSPACE_ROLE_LABELS[member.role].ar}${fullAccess ? (language === "ar" ? " · صلاحية كاملة" : " · Full access") : ""}`,
        phone: member.phone ?? "",
        appActive: true,
        onPress: owner ? () => Alert.alert(language === "ar" ? "المالك الأساسي محمي" : "Primary owner protected", language === "ar" ? "لا يمكن حذف المالك الأساسي أو خفض دوره أو تعديل صلاحياته." : "The primary owner cannot be deleted, demoted, or edited.") : () => setEditingMember(member),
      });
    });
    onbookStaff.forEach((entry) => {
      rows.push({
        key: `onbook:${entry.uid}`,
        kind: entry.isAppUser ? "member" : "onbook",
        name: entry.name,
        roleLabel: entry.role === "guard" ? (language === "ar" ? "حارس ميداني" : "Field guard") : (language === "ar" ? "موظف / محاسب" : "Staff / accountant"),
        phone: entry.phone,
        appActive: entry.isAppUser,
        inviteCode: buildInviteCode(entry.phone) ?? undefined,
        onActivate: entry.isAppUser ? undefined : () => router.push(`/auth/claim-staff-account?phone=${encodeURIComponent(entry.phone)}&uid=${encodeURIComponent(entry.uid)}` as never),
      });
    });
    (overview.data?.invitations ?? []).filter((entry) => !entry.usedAt && !entry.revokedAt).forEach((entry) => {
      rows.push({
        key: `inv:${entry.id}`,
        kind: "invitation",
        name: entry.employeeName,
        roleLabel: language === "ar" ? "بانتظار التفعيل" : "Awaiting activation",
        phone: entry.phone,
        appActive: false,
        inviteCode: buildInviteCode(entry.phone) ?? undefined,
        invitationId: entry.id,
        inviteRole: (entry.role ?? "staff") as "admin" | "staff" | "caretaker" | "guest",
        invitePermissions: parseInvitePermissions(entry.permissions),
      });
    });
    const rank: Record<UnifiedEntry["kind"], number> = { member: 0, invitation: 1, onbook: 2 };
    return rows.sort((a, b) => (rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name, language === "ar" ? "ar" : "en")));
  })();

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <SubScreenHeader title={language === "ar" ? "إدارة المستخدمين" : "User management"} />
    {!isAuthenticated ? <AccessCard colors={colors} align={align} title={language === "ar" ? "تسجيل الدخول مطلوب" : "Sign-in required"} detail={language === "ar" ? "سجّل الدخول أولًا لتنشئ مساحة المنشأة أو تنضم إليها كموظف." : "Sign in to create your business workspace or join it as an employee."} actionLabel={language === "ar" ? "تسجيل الدخول" : "Sign in"} onPress={() => void startOAuthLogin()} /> : loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 36 }} /> : isManager ? <>
      <View style={[styles.addEmployeeRow, { flexDirection: row }]}><Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align, marginTop: 0, marginBottom: 0 }]}>{language === "ar" ? "فريق العمل" : "Team"}</Text><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إضافة عضو للفريق" : "Add team member"} onPress={() => setAddUserOpen(true)} style={({ pressed }) => [styles.addEmployee, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="person-add" size={18} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "إضافة عضو للفريق" : "Add team member"}</Text></Pressable></View>
      {overview.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : unifiedTeam.length === 0 ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: align }}>{language === "ar" ? "لا أعضاء بعد — أضف أول عضو من زر الإضافة أعلاه." : "No team members yet — add the first member above."}</Text></View> : unifiedTeam.map((entry) => <MemberRow key={entry.key} entry={entry} copied={copiedPhone === entry.phone} onCopyLink={entry.inviteCode ? () => copyInviteLink(entry.inviteCode!, entry.phone) : undefined} onResend={entry.kind === "invitation" ? () => void resendInvitation(entry) : undefined} onRevoke={entry.kind === "invitation" ? () => void revokeInvitation(entry) : undefined} language={language} isRTL={isRTL} colors={colors} />)}
      {isOwner ? <View style={[styles.transferCard, { backgroundColor: colors.primary + "0D", borderColor: colors.primary + "66" }]}><Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: align }}>{language === "ar" ? "نقل ملكية المنشأة" : "Transfer facility ownership"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 5, textAlign: align }}>{language === "ar" ? "لا ينقل هذا الإجراء الملكية مباشرة. اختر عضوًا ثم اضغط باستمرار 3 ثوانٍ لتسجيل طلب يرسل إلى القناة الموثقة لإتمام OTP الخارجي." : "This does not transfer ownership directly. Select a member and hold for 3 seconds to request verified external OTP."}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.transferTargets, { flexDirection: row }]}>{overview.data?.members.filter((item) => item.role !== "owner" && item.status === "active").map((item) => <Pressable key={item.id} onPress={() => setTransferTarget({ ...item, permissions: normalizeWorkspacePermissions(item.permissions, item.role === "admin" ? "manager" : item.role === "guest" ? "guest" : "employee") } as TeamMember)} style={[styles.transferTarget, { borderColor: transferTarget?.id === item.id ? colors.primary : colors.border, backgroundColor: transferTarget?.id === item.id ? colors.primary + "18" : colors.surface }]}><Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 11 }}>{item.displayName}</Text><Text style={{ color: colors.muted, fontSize: 9, marginTop: 2 }}>{WORKSPACE_ROLE_LABELS[item.role].ar}</Text></Pressable>)}</ScrollView><Pressable disabled={!transferTarget || requestOwnershipTransfer.isPending} onPressIn={beginOwnershipHold} onPressOut={cancelOwnershipHold} style={[styles.holdButton, { backgroundColor: colors.primary, opacity: !transferTarget || requestOwnershipTransfer.isPending ? 0.45 : 1 }]}><MaterialIcons name="verified-user" size={19} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{transferProgress ? (language === "ar" ? `استمر بالضغط… ${transferProgress}/3` : `Keep holding… ${transferProgress}/3`) : (language === "ar" ? "اضغط 3 ثوانٍ لطلب نقل الملكية" : "Hold 3 seconds to request transfer")}</Text></Pressable></View> : null}    </> : role === "staff" || role === "guest" ? <AccessCard colors={colors} align={align} title={language === "ar" ? (role === "guest" ? "حساب ضيف مفعّل" : "حساب موظف مفعّل") : (role === "guest" ? "Guest account active" : "Staff account active")} detail={language === "ar" ? (role === "guest" ? "تم تفعيل وصولك المحدود إلى المنشأة." : "تُطبّق صلاحياتك التي حددها المدير على المهام اليومية والتقارير والسجل.") : (role === "guest" ? "Your limited property access is active." : "Your manager-defined permissions apply to daily tasks, reports, and activity log.")} /> : <><AccessCard colors={colors} align={align} title={language === "ar" ? "بدء إعداد المنشأة" : "Set up your business workspace"} detail={language === "ar" ? "إذا كنت المالك، أنشئ مساحة المنشأة مرة واحدة. إذا كنت موظفًا، استخدم بيانات دعوتك أدناه." : "If you are the owner, create the workspace once. If you are an employee, activate your invitation below."} actionLabel={language === "ar" ? "أنا المالك — إنشاء المساحة" : "I am the owner — create workspace"} onPress={() => void activateOwnerWorkspace()} /><Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "تفعيل دعوة الموظف" : "Activate employee invitation"}</Text><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder={language === "ar" ? "رقم الهاتف المدعو" : "Invited phone number"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={6} placeholder={language === "ar" ? "رمز الدعوة من 6 أرقام" : "Six-digit invitation code"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><Pressable onPress={() => void acceptInvite()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.success, opacity: pressed || accept.isPending ? 0.66 : 1 }]}><MaterialIcons name="verified-user" size={18} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{language === "ar" ? "تفعيل الحساب" : "Activate account"}</Text></Pressable></View></>}
  </ScrollView>
  <EmployeePermissionsModal visible={Boolean(editingMember)} title={editingMember ? (language === "ar" ? `صلاحيات وتحصل ${editingMember.displayName}` : `${editingMember.displayName}'s permissions`) : ""} language={language} isRTL={isRTL} colors={colors} permissions={memberPermissions} onPermissionsChange={setMemberPermissions} permissionsOpen={memberPermissionsOpen} onPermissionsOpenChange={setMemberPermissionsOpen} primaryLabel={language === "ar" ? "حفظ الإعدادات" : "Save settings"} primaryIcon="save" isPending={updateMemberPermissions.isPending || updateMemberCollectionProfile.isPending} onClose={() => setEditingMember(null)} onSubmit={() => void saveMemberPermissions()} lockPermissions={editingMember?.role === "owner"} cliqAlias={memberCliqAlias} onCliqAliasChange={setMemberCliqAlias} bankDetails={memberBankDetails} onBankDetailsChange={setMemberBankDetails} commissionRate={memberCommissionRate} onCommissionRateChange={setMemberCommissionRate} commissionType={memberCommissionType} onCommissionTypeChange={setMemberCommissionType} allowDirectCollection={memberAllowDirectCollection} onAllowDirectCollectionChange={setMemberAllowDirectCollection} />
  <AddUserModal visible={addUserOpen} language={language} isRTL={isRTL} colors={colors} onClose={() => setAddUserOpen(false)} onSubmit={submitUnifiedTeamMember} lookupUserCode={lookupUserCode} />
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
  return <View style={[styles.collectionSection, { backgroundColor: colors.primary + "0C", borderColor: colors.primary + "40" }]}><View style={[styles.collectionTitleRow, { flexDirection: row }]}><MaterialIcons name="account-balance-wallet" size={18} color={colors.primary} /><Text style={[styles.flex, { color: colors.foreground, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "التحصيل والعمولة" : "Collections and commission"}</Text></View><View style={[styles.collectionToggle, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 12, textAlign: align }}>{language === "ar" ? "السماح بالتحصيل المباشر" : "Allow direct collection"}</Text><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2, textAlign: align }}>{language === "ar" ? "يظهر هذا الموظف كحساب مستفيد عند الدفع." : "This member appears as a payment recipient."}</Text></View><AppToggle value={allowDirectCollection} onValueChange={onAllowDirectCollectionChange} isRTL={row === "row-reverse"} activeColor={colors.success} inactiveColor={colors.border} accessibilityLabel={language === "ar" ? "السماح بالتحصيل المباشر" : "Allow direct collection"} /></View><TextInput value={cliqAlias} onChangeText={onCliqAliasChange} placeholder={language === "ar" ? "اسم أو رقم CliQ للموظف" : "Staff CliQ alias or phone"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><TextInput value={bankDetails} onChangeText={onBankDetailsChange} multiline placeholder={language === "ar" ? "IBAN أو بيانات الحساب البنكي" : "IBAN or bank-account details"} placeholderTextColor={colors.muted} style={[styles.collectionTextarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><View style={[styles.commissionRow, { flexDirection: row }]}><View style={styles.flex}><TextInput value={commissionRate} onChangeText={onCommissionRateChange} keyboardType="decimal-pad" placeholder={language === "ar" ? "قيمة العمولة" : "Commission rate"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, textAlign: align, marginBottom: 0 }]} /></View><Pressable onPress={() => onCommissionTypeChange(commissionType === "percent" ? "fixed" : "percent")} style={({ pressed }) => [styles.commissionKind, { backgroundColor: colors.surface, borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: colors.primary, fontWeight: "900" }}>{commissionType === "percent" ? "% نسبة" : language === "ar" ? "مبلغ ثابت" : "Fixed"}</Text></Pressable></View><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 6, textAlign: align }}>{language === "ar" ? "تُحسب فقط على الدفعات التي يُسند تحصيلها لهذا الموظف." : "Calculated only on payments routed to this member."}</Text></View>;
}

function AccessCard({ colors, align, title, detail, actionLabel, onPress }: { colors: ReturnType<typeof useColors>; align: "left" | "right"; title: string; detail: string; actionLabel?: string; onPress?: () => void }) { return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 20 }]}><MaterialIcons name="lock" size={27} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900", marginTop: 12, textAlign: align }}>{title}</Text><Text style={{ color: colors.muted, lineHeight: 20, marginTop: 7, textAlign: align }}>{detail}</Text>{actionLabel && onPress ? <Pressable onPress={onPress} style={[styles.primary, { backgroundColor: colors.primary }]}><Text style={{ color: colors.background, fontWeight: "900" }}>{actionLabel}</Text></Pressable> : null}</View>; }

function MemberRow({ entry, copied, onCopyLink, onResend, onRevoke, language, isRTL, colors }: { entry: UnifiedEntry; copied: boolean; onCopyLink?: () => void; onResend?: () => void; onRevoke?: () => void; language: "ar" | "en"; isRTL: boolean; colors: ReturnType<typeof useColors> }) {
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const pending = !entry.appActive;
  const icon = entry.kind === "invitation" || (pending && !entry.onActivate) ? "schedule" : pending ? "badge" : entry.appActive ? "smartphone" : "badge";
  const iconBg = entry.kind === "invitation" ? colors.warning + "18" : entry.appActive ? colors.success + "18" : "#0EA5E9" + "18";
  const iconColor = entry.kind === "invitation" ? colors.warning : entry.appActive ? colors.success : "#0EA5E9";
  return (
    <Pressable accessibilityRole="button" disabled={!entry.onPress} onPress={entry.onPress} accessibilityLabel={entry.onPress ? `${language === "ar" ? "تعديل" : "Edit"} ${entry.name}` : entry.name} style={({ pressed }) => [styles.member, { backgroundColor: colors.surface, borderColor: entry.kind === "invitation" ? colors.warning + "66" : entry.appActive ? colors.border : "#94A3B8" + "55", flexDirection: row, marginTop: 8, opacity: !entry.onPress ? 1 : pressed ? 0.72 : 1 }]}>
      <View style={[styles.memberIcon, { backgroundColor: iconBg }]}><MaterialIcons name={icon} size={20} color={iconColor} /></View>
      <View style={styles.flex}>
        <View style={{ flexDirection: row, alignItems: "center", gap: 7 }}>
          <Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: "900", textAlign: align, flexShrink: 1 }}>{entry.name}</Text>
          <View style={[styles.statusPill, { backgroundColor: entry.appActive ? colors.success + "14" : colors.warning + "14", borderColor: entry.appActive ? colors.success + "55" : colors.warning + "55", flexDirection: row }]}><MaterialIcons name={entry.appActive ? "check-circle" : pending ? "schedule" : "schedule"} size={11} color={entry.appActive ? colors.success : colors.warning} /><Text style={{ color: entry.appActive ? colors.success : colors.warning, fontSize: 9.5, fontWeight: "900" }}>{entry.appActive ? (language === "ar" ? "نشط على التطبيق" : "Active on app") : (language === "ar" ? "بانتظار تفعيل التطبيق" : "Awaiting app activation")}</Text></View>
        </View>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{entry.roleLabel}{entry.phone ? ` · ${entry.phone}` : ""}</Text>
        {pending ? <View style={[styles.memberActions, { flexDirection: "column" }]}>
          <View style={[styles.memberActionRow, { flexDirection: row }]}>
            {onCopyLink ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "نسخ رابط الدعوة" : "Copy invite link"} onPress={onCopyLink} style={({ pressed }) => [styles.memberAction, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "12", flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="content-copy" size={13} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 10.5, fontWeight: "900" }}>{copied ? (language === "ar" ? "✓ تم النسخ" : "✓ Copied") : (language === "ar" ? "📋 نسخ رابط الدعوة" : "📋 Copy invite link")}</Text></Pressable> : null}
            {onResend ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إعادة إرسال الدعوة" : "Re-send invitation"} onPress={onResend} style={({ pressed }) => [styles.memberAction, { borderColor: colors.primary + "55", backgroundColor: colors.surfaceMuted + "3A", flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="refresh" size={13} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 10.5, fontWeight: "900" }}>{language === "ar" ? "🔄 إعادة إرسال" : "🔄 Re-send"}</Text></Pressable> : null}
            {onRevoke ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إلغاء الدعوة" : "Revoke invitation"} onPress={onRevoke} style={({ pressed }) => [styles.memberAction, { borderColor: colors.error + "45", backgroundColor: colors.error + "10", flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="close" size={13} color={colors.error} /><Text style={{ color: colors.error, fontSize: 10.5, fontWeight: "900" }}>{language === "ar" ? "إلغاء" : "Revoke"}</Text></Pressable> : null}
          </View>
          {entry.onActivate ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تفعيل حساب التطبيق" : "Activate app account"} onPress={entry.onActivate} style={({ pressed }) => [styles.memberAction, { borderColor: "#0EA5E9" + "66", backgroundColor: "#0EA5E9" + "12", flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="smartphone" size={13} color="#0EA5E9" /><Text style={{ color: "#0EA5E9", fontSize: 10.5, fontWeight: "900" }}>{language === "ar" ? "تفعيل حساب التطبيق" : "Activate app account"}</Text></Pressable> : null}
        </View> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 44 }, backButton: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 10 }, sectionTitle: { fontSize: 15, fontWeight: "900", marginTop: 20, marginBottom: 8 }, addEmployeeRow: { alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 19 }, addEmployee: { minHeight: 39, borderRadius: 11, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }, card: { borderWidth: 1, borderRadius: 18, padding: 14 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, marginBottom: 10 }, primary: { minHeight: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 4 }, transferCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 14 }, transferTargets: { gap: 8, paddingVertical: 11 }, transferTarget: { minWidth: 108, borderWidth: 1, borderRadius: 12, padding: 9, alignItems: "center" }, holdButton: { minHeight: 47, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, member: { borderWidth: 1, borderRadius: 16, padding: 12, alignItems: "center", gap: 10, marginTop: 8 }, memberIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" }, statusPill: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, alignItems: "center", gap: 4 }, memberActions: { gap: 7, marginTop: 9 }, memberActionRow: { flexWrap: "wrap", gap: 7 }, memberAction: { minHeight: 32, borderRadius: 9, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", gap: 5 }, inviteRevoke: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(2, 12, 10, 0.72)", justifyContent: "flex-end", padding: 12 }, modalCard: { maxHeight: "92%", borderWidth: 1, borderRadius: 24, padding: 15 }, modalHeader: { alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 12 }, modalTitle: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: "900" }, modalClose: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, modalContent: { paddingBottom: 10 }, presetSection: { marginTop: 3, marginBottom: 13 }, presetRow: { gap: 8, marginTop: 8 }, presetButton: { flex: 1, minHeight: 43, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, paddingHorizontal: 7 }, permissionsToggle: { minHeight: 58, borderWidth: 1, borderRadius: 14, alignItems: "center", gap: 9, paddingHorizontal: 11 }, permissionsToggleIcon: { width: 33, height: 33, borderRadius: 10, alignItems: "center", justifyContent: "center" }, permissionsList: { borderWidth: 1, borderRadius: 14, marginTop: 8, overflow: "hidden" }, permissionRow: { minHeight: 54, alignItems: "center", gap: 9, paddingHorizontal: 11, borderBottomWidth: StyleSheet.hairlineWidth }, permissionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 }, permissionLabel: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17 }, collectionSection: { borderWidth: 1, borderRadius: 15, padding: 11, marginTop: 12 }, collectionTitleRow: { alignItems: "center", gap: 8 }, collectionToggle: { borderWidth: 1, borderRadius: 13, padding: 10, alignItems: "center", gap: 9, marginTop: 10 }, collectionTextarea: { minHeight: 68, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingTop: 9, marginBottom: 10, textAlignVertical: "top" }, commissionRow: { gap: 8, alignItems: "center" }, commissionKind: { minHeight: 48, minWidth: 92, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 9 }, modalPrimary: { minHeight: 49, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, marginTop: 10 },
});
