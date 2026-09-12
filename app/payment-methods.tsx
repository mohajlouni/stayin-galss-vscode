import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { RipplePressable } from "@/components/ripple-pressable";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { normalizeOwnerTreasuryAccounts, normalizeStaffFloatAccounts, type OwnerTreasuryAccount, type OwnerTreasuryKind, type StaffFloatAccount, type StaffFloatChannel, ownerTreasuryAccounts } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { appendPaymentMethodAudit, loadPaymentMethodAudit, PAYMENT_METHOD_AUDIT_LABELS, type PaymentMethodAuditAction, type PaymentMethodAuditEntry } from "@/lib/payment-audit";
import { useI18n } from "@/lib/i18n";
import { findOnbookByPhone, findOnbookByUid, suggestOnbookUid, validateOnbookEntry, type OnbookStaff, type OnbookStaffRole } from "@/lib/staff-directory";
import { useOnbookStaff } from "@/lib/staff-directory-store";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { trpc } from "@/lib/trpc";
import type { WorkspaceAccessRole } from "@/shared/workspace-permissions";

const createId = () => `pm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const createFloatId = () => `float-custody-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const createOwnerAccountId = () => `owner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const MONO_FONT = Platform.select({ ios: "Menlo", default: "monospace" });
const OWNER_KINDS: { id: OwnerTreasuryKind; icon: "bolt" | "account-balance" | "payments" | "point-of-sale"; ar: string; en: string }[] = [
  { id: "cliq", icon: "bolt", ar: "قناة CliQ", en: "CliQ channel" },
  { id: "bank", icon: "account-balance", ar: "حساب بنكي / IBAN", en: "Bank account / IBAN" },
  { id: "vault", icon: "payments", ar: "خزينة الكاش", en: "Cash vault" },
  { id: "other", icon: "point-of-sale", ar: "الدفع الإلكتروني والبطاقات", en: "Cards & e-payment" },
];
const ownerKindMeta = (kind: OwnerTreasuryKind) => OWNER_KINDS.find((item) => item.id === kind) ?? OWNER_KINDS[0];
const ENTITIES: { id: "owner" | "staff" | "guard"; icon: "account-balance" | "badge" | "security"; ar: string; en: string }[] = [
  { id: "owner", icon: "account-balance", ar: "المالك / الخزينة المركزية", en: "Owner / Central treasury" },
  { id: "staff", icon: "badge", ar: "موظف / محاسب", en: "Staff / accountant" },
  { id: "guard", icon: "security", ar: "حارس ميداني", en: "Field guard" },
];
type RegisteredMember = { id: number; userId: number; displayName: string; phone: string | null; role: WorkspaceAccessRole; status: string; userCode: string | null };
type OwnerRow = { key: string; id?: string; kind: OwnerTreasuryKind; label: string; detail: string; provider: string; holderName: string; iban: string; isDefault: boolean; whatsApp: boolean; isActive: boolean };
type FloatDraft = { id?: string; entity: "staff" | "guard"; binding: "app" | "onbook"; onbookUid: string; label: string; uid: string; phone: string; hasOther: boolean; otherNote: string; ceiling: string; isActive: boolean; isDefault: boolean; isCommissionEnabled: boolean; commissionType: "FIXED_PER_BOOKING" | "PERCENTAGE_OF_TOTAL"; commissionValue: string };
const isChannelComplete = (kind: "cash" | "cliq" | "bank" | "other", data: { label?: string; alias?: string; provider?: string; bankName?: string; iban?: string; note?: string }): boolean => {
  if (kind === "cash") return Boolean((data.label ?? "").trim());
  if (kind === "other") return Boolean((data.label ?? "").trim() || (data.note ?? "").trim());
  if (kind === "cliq") return Boolean((data.alias ?? "").trim()) && Boolean((data.provider ?? "").trim());
  return Boolean((data.bankName ?? "").trim()) && (data.iban ?? "").trim().length >= 15;
};

const emptyOwnerRow = (kind: OwnerTreasuryKind): OwnerRow => ({ key: createId(), kind, label: "", detail: "", provider: "", holderName: "", iban: "", isDefault: false, whatsApp: false, isActive: false });

const emptyFloatDraft = (entity: "staff" | "guard"): FloatDraft => ({ entity, binding: "app", onbookUid: "", label: "", uid: "", phone: "", hasOther: false, otherNote: "", ceiling: "", isActive: false, isDefault: false, isCommissionEnabled: false, commissionType: "FIXED_PER_BOOKING", commissionValue: "" });

const onbookRoleLabel = (role: OnbookStaffRole, language: "ar" | "en") => role === "guard" ? (language === "ar" ? "حارس ميداني" : "Field guard") : (language === "ar" ? "موظف / محاسب" : "Staff / accountant");

const ChannelSwitch = ({ value, onValueChange, isRTL, color, inactiveColor, ring, accessibilityLabel, disabled }: { value: boolean; onValueChange: (value: boolean) => void; isRTL: boolean; color: string; inactiveColor: string; ring?: string; accessibilityLabel: string; disabled?: boolean }) => <View style={value && ring ? [styles.switchRing, { backgroundColor: ring }] : undefined}><AppToggle value={value} onValueChange={onValueChange} isRTL={isRTL} activeColor={color} inactiveColor={inactiveColor} accessibilityLabel={accessibilityLabel} disabled={disabled} /></View>;

const mergeOwnerVaults = (accounts: OwnerTreasuryAccount[]): OwnerTreasuryAccount[] => {
  const vaults = accounts.filter((account) => account.kind === "vault");
  if (vaults.length <= 1) return accounts;
  const preferred = vaults.find((account) => account.isDefault === true) ?? vaults.find((account) => account.isActive !== false) ?? vaults.find((account) => (account.detail || "").trim()) ?? vaults[0];
  const pick = <K extends "detail" | "provider" | "holderName" | "iban">(key: K): OwnerTreasuryAccount[K] | undefined => (vaults.find((account) => String(account[key] ?? "").trim()) ?? preferred)[key];
  const merged: OwnerTreasuryAccount = {
    id: preferred.id,
    kind: "vault",
    label: (preferred.label || "").trim() || "بيد المالك / كاش الخزينة المركزية",
    detail: (pick("detail") ?? "").toString().trim().slice(0, 200),
    provider: pick("provider"),
    holderName: pick("holderName"),
    iban: pick("iban"),
    isActive: vaults.some((account) => account.isActive !== false) ? undefined : false,
    isDefault: vaults.some((account) => account.isDefault === true) ? true : undefined,
    whatsApp: vaults.some((account) => account.whatsApp === true) ? true : undefined,
  };
  return [...accounts.filter((account) => account.kind !== "vault"), merged];
};

export default function PaymentMethodsScreen() {
  const { settings, updateSettings } = useBookings();
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const { can, user, isOwner, isSuperAdmin, role } = useWorkspaceAccess();
  const row = isRTL ? "row-reverse" : "row";
  const cardRow = "row-reverse" as const;
  const align = isRTL ? "right" : "left";
  const canManage = can("manage_payments");
  const canViewPaymentAudit = isOwner || isSuperAdmin;
  const [unifiedOpen, setUnifiedOpen] = useState(false);
  const [unifiedEntity, setUnifiedEntity] = useState<"owner" | "staff" | "guard">("owner");
  const [openChannels, setOpenChannels] = useState<Record<string, boolean>>({ cliq: false, bank: false, cash: false, other: false });
  const [ownerVaultRows, setOwnerVaultRows] = useState<OwnerRow[]>([]);
  const [ownerCliqRows, setOwnerCliqRows] = useState<OwnerRow[]>([]);
  const [ownerBankRows, setOwnerBankRows] = useState<OwnerRow[]>([]);
  const [ownerOtherRows, setOwnerOtherRows] = useState<OwnerRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [floatDraft, setFloatDraft] = useState<FloatDraft>(() => emptyFloatDraft("staff"));
  const [floatCliqRows, setFloatCliqRows] = useState<OwnerRow[]>([]);
  const [floatBankRows, setFloatBankRows] = useState<OwnerRow[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ title: string; message: string; confirm: () => void } | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLog, setAuditLog] = useState<PaymentMethodAuditEntry[]>([]);
  const [toolbarToast, setToolbarToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const rowErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [redFields, setRedFields] = useState<ReadonlySet<string>>(new Set());
  const [auditBanner, setAuditBanner] = useState<{ title: string; lines: string[] } | null>(null);
  const auditTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutY = useRef<Record<string, number>>({});
  const sheetScrollRef = useRef<ScrollView>(null);

  const ownerAccounts = mergeOwnerVaults(ownerTreasuryAccounts(settings));
  const activeOwnerCount = ownerAccounts.filter((account) => account.isActive !== false).length;
  const floats = normalizeStaffFloatAccounts(settings.paymentRouting?.staffFloats);
  const activeFloatCount = floats.filter((account) => account.isActive !== false).length;
  const overview = trpc.workspace.overview.useQuery(undefined, { enabled: canManage, retry: false });
  const members = ((overview.data?.members ?? []) as unknown as RegisteredMember[]).filter((member) => member.status === "active");
  const selectableMembers = members.filter((member) => member.role !== "owner" && member.userId !== user?.id);
  const { staff: onbookStaff, ready: onbookReady, commit } = useOnbookStaff();
  const [onbookSearch, setOnbookSearch] = useState("");

  const seedRan = useRef(false);
  const saveOwnerRegistry = async (next: OwnerTreasuryAccount[]) => {
    await updateSettings({ ...settings, paymentRouting: { ...settings.paymentRouting, ownerAccounts: normalizeOwnerTreasuryAccounts(next) } });
  };
  useEffect(() => {
    if (!canManage || seedRan.current || ownerAccounts.length !== 0) return;
    seedRan.current = true;
    void saveOwnerRegistry([
      { id: "owner-seed-vault", kind: "vault", label: "بيد المالك / كاش الخزينة المركزية", detail: "", isActive: true, isDefault: true },
      { id: "owner-seed-cliq", kind: "cliq", label: "CliQ المالك الرئيسي", detail: "", isActive: false },
      { id: "owner-seed-bank", kind: "bank", label: "الحساب البنكي الرئيسي", detail: "", isActive: false },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, ownerAccounts.length]);

  const toggleOpenChannel = (channel: string) => setOpenChannels((value) => ({ ...value, [channel]: !value[channel] }));

  const openOwnerEdit = (account: OwnerTreasuryAccount) => {
    setUnifiedEntity("owner");
    setFloatDraft(emptyFloatDraft("staff"));
    setFloatCliqRows([]);
    setFloatBankRows([]);
    const toRow = (other: OwnerTreasuryAccount): OwnerRow => ({ ...emptyOwnerRow(other.kind), id: other.id, label: other.label, detail: other.kind === "bank" ? (other.iban ?? other.detail) : other.detail, provider: other.provider ?? "", holderName: other.holderName ?? (other.kind !== "vault" ? other.label : ""), iban: other.iban ?? (other.kind === "bank" ? other.detail : ""), isDefault: other.isDefault === true, whatsApp: other.whatsApp === true, isActive: other.isActive !== false });
    const base = toRow(account);
    const siblings = (kind: OwnerTreasuryKind) => ownerAccounts.filter((other) => other.id !== account.id && other.kind === kind).map(toRow);
    setOwnerVaultRows(account.kind === "vault" ? [base] : siblings("vault"));
    setOwnerCliqRows(account.kind === "cliq" ? [base] : siblings("cliq"));
    setOwnerBankRows(account.kind === "bank" ? [base] : siblings("bank"));
    setOwnerOtherRows(account.kind === "other" ? [base] : siblings("other"));
    setEditingAccountId(account.id);
    setOpenChannels({ cliq: account.kind === "cliq", bank: account.kind === "bank", cash: account.kind === "vault", other: account.kind === "other" });
    setUnifiedOpen(true);
  };
  const openFloatCreateFor = (entity: "staff" | "guard") => {
    setUnifiedEntity(entity);
    setEditingAccountId(null);
    setOnbookSearch("");
    setFloatDraft(emptyFloatDraft(entity));
    setFloatCliqRows([]);
    setFloatBankRows([]);
    setOwnerVaultRows([]);
    setOwnerCliqRows([]);
    setOwnerBankRows([]);
    setOwnerOtherRows([]);
    setOpenChannels({ cliq: false, bank: false, cash: false, other: false });
    setUnifiedOpen(true);
  };
  const openFloatCreate = () => openFloatCreateFor("staff");
  const openFloatEdit = (account: StaffFloatAccount) => {
    const entity = account.entity ?? "staff";
    const memberMatch = selectableMembers.find((member) => member.userId === account.memberUserId);
    const linkedOnbook = account.memberUid ? findOnbookByUid(onbookStaff, account.memberUid) : undefined;
    setUnifiedEntity(entity);
    setEditingAccountId(account.id);
    setOnbookSearch("");
    setOwnerVaultRows([]);
    setOwnerCliqRows([]);
    setOwnerBankRows([]);
    setOwnerOtherRows([]);
    const channels = Array.isArray(account.channels) ? account.channels : [];
    const cliqRows = channels.filter((c) => c.kind === "cliq").map((c) => ({ key: createId(), kind: "cliq" as const, label: "", detail: c.alias ?? "", provider: c.provider ?? "", holderName: c.holderName ?? "", iban: "", isDefault: c.isDefault === true, whatsApp: c.whatsApp === true, isActive: c.isActive !== false }));
    const bankRows = channels.filter((c) => c.kind === "bank").map((c) => ({ key: createId(), kind: "bank" as const, label: "", detail: "", provider: c.provider ?? "", holderName: c.holderName ?? "", iban: c.iban ?? "", isDefault: c.isDefault === true, whatsApp: c.whatsApp === true, isActive: c.isActive !== false }));
    setFloatCliqRows(cliqRows.length ? cliqRows : account.cliqAlias ? [{ key: createId(), kind: "cliq" as const, label: "", detail: account.cliqAlias, provider: "", holderName: "", iban: "", isDefault: false, whatsApp: account.whatsApp === true, isActive: true }] : []);
    setFloatBankRows(bankRows.length ? bankRows : account.bankDetails ? [{ key: createId(), kind: "bank" as const, label: "", detail: "", provider: "", holderName: "", iban: account.bankDetails, isDefault: false, whatsApp: account.whatsApp === true, isActive: true }] : []);
    setFloatDraft({ id: account.id, entity, binding: linkedOnbook ? "onbook" : "app", onbookUid: linkedOnbook ? linkedOnbook.uid : "", label: account.label, uid: memberMatch?.userCode ?? account.memberUid ?? "", phone: account.contactPhone ?? "", hasOther: account.hasOther === true, otherNote: ((account.bankDetails ?? "").split("\n").find((line) => line.startsWith("أخرى: ")) ?? "").replace(/^أخرى: /, "").trim(), ceiling: account.maxFloatLimit !== undefined ? String(account.maxFloatLimit) : "", isActive: account.cashActive === true, isDefault: account.isDefault === true, isCommissionEnabled: account.isCommissionEnabled === true, commissionType: account.commissionType ?? "FIXED_PER_BOOKING", commissionValue: account.commissionValue !== undefined ? String(account.commissionValue) : "" });
    const floatCashOpen = account.isActive !== false;
    const floatCliqOpen = floatCliqRows.length > 0 || Boolean(account.cliqAlias);
    const floatBankOpen = floatBankRows.length > 0 || Boolean(account.bankDetails);
    setOpenChannels({ cash: floatCashOpen, cliq: floatCliqOpen, bank: floatBankOpen, other: false });
    setUnifiedOpen(true);
  };

  const saveFloats = async (next: StaffFloatAccount[]) => {
    await updateSettings({ ...settings, paymentRouting: { ...settings.paymentRouting, staffFloats: normalizeStaffFloatAccounts(next) } });
  };
  const saveOwnerEditor = async () => {
    const audit = runSaveAudit();
    if (audit.items.length > 0) { presentAudit(audit); return; }
    const drafts = [...ownerCliqRows, ...ownerBankRows, ...ownerVaultRows, ...ownerOtherRows];
    const rows = drafts.filter((item) => item.label.trim() || item.detail.trim() || item.provider.trim() || item.holderName.trim() || item.iban.trim());
    if (!rows.length) { Alert.alert(language === "ar" ? "أدخل بيانات الحساب أولاً" : "Enter account details first"); return; }
    for (const item of rows) {
      const label = item.kind === "cliq" ? item.holderName.trim() || item.detail.trim() : item.kind === "bank" ? item.holderName.trim() || item.provider.trim() || item.iban.trim() : item.label.trim();
      const duplicate = ownerAccounts.some((account) => account.id !== item.id && account.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase());
      if (duplicate) { Alert.alert(language === "ar" ? "الاسم مستخدم" : "Name already used", language === "ar" ? "اختر اسمًا مختلفًا لحساب الخزينة." : "Choose a different treasury-account nickname."); return; }
    }
    const existingIds = new Set(ownerAccounts.map((account) => account.id));
    const perKindDefault = (list: OwnerTreasuryAccount[]): OwnerTreasuryAccount[] => { const kinds: OwnerTreasuryKind[] = ["vault", "cliq", "bank", "other"]; let out = list; for (const kind of kinds) { const ofKind = out.filter((account) => account.kind === kind && account.isActive !== false); if (ofKind.length && !ofKind.some((account) => account.isDefault === true)) { const fallback = ofKind.find((account) => isOwnerTreasuryComplete(account)) ?? ofKind[0]; out = out.map((account) => account.id === fallback.id ? { ...account, isDefault: true } : account); } } return out; };
    let next = perKindDefault(rows.map((item) => {
      const cliqLabel = item.kind === "cliq" ? (item.holderName.trim() || item.detail.trim()).slice(0, 60) : "";
      const bankLabel = item.kind === "bank" ? (item.holderName.trim() || item.provider.trim() || item.iban.trim()).slice(0, 60) : "";
      return { id: item.id && existingIds.has(item.id) ? item.id : createOwnerAccountId(), kind: item.kind, label: item.kind === "vault" ? item.label.trim().slice(0, 60) : item.kind === "cliq" ? cliqLabel : item.kind === "bank" ? bankLabel : item.label.trim().slice(0, 60), detail: (item.kind === "bank" ? item.iban : item.detail).trim().slice(0, 200), provider: item.provider.trim().slice(0, 60) || undefined, holderName: item.holderName.trim().slice(0, 60) || undefined, iban: item.iban.trim().slice(0, 200) || undefined, isActive: item.isActive === false ? false : undefined, isDefault: item.isDefault || undefined, whatsApp: item.isActive === false ? undefined : (item.whatsApp || undefined) };
    }));
    let merged = mergeOwnerVaults(perKindDefault([...ownerAccounts.filter((account) => !next.some((item) => item.id === account.id)), ...next]));
    try {
      await saveOwnerRegistry(merged);
      pushAudit(isOwnerEdit ? "edit" : "add", rows.map(rowTargetLabel).join("، ") || (language === "ar" ? "حسابات الخزينة" : "Treasury accounts"), language === "ar" ? "حفظ حسابات طرق الدفع وتحديثها" : "Saved & updated payment-method accounts");
      Alert.alert(language === "ar" ? "✓ تم حفظ وتحديث طرق الدفع بنجاح" : "✓ Payment methods saved and updated successfully");
      setEditingAccountId(null);
      setUnifiedOpen(false);
      clearAuditHighlight();
    } catch {
      Alert.alert(language === "ar" ? "فشل الحفظ" : "Save failed", language === "ar" ? "تعذّر حفظ حسابات الخزينة، أعد المحاولة." : "Could not save treasury accounts, please retry.");
    }
  };
  const saveFloatEditor = async () => {
    const audit = runSaveAudit();
    if (audit.items.length > 0) { presentAudit(audit); return; }
    const label = floatDraft.label.trim().slice(0, 120);
    if (!label) { Alert.alert(language === "ar" ? "اسم المستلم / النقطة مطلوب" : "Recipient / collection-point name required"); return; }
    if (!floatDraft.phone.trim()) { Alert.alert(language === "ar" ? "رقم الهاتف مطلوب" : "Phone number required", language === "ar" ? "أدخل رقم هاتف للتواصل مع المستلم." : "Enter a phone number to reach this recipient."); return; }
    const duplicate = floats.some((item) => item.id !== floatDraft.id && item.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase());
    if (duplicate) { Alert.alert(language === "ar" ? "الاسم مستخدم" : "Name already used", language === "ar" ? "اختر اسمًا مختلفًا لنقطة التحصيل." : "Choose a different collection-point name."); return; }
    const uidQuery = floatDraft.uid.trim();
    const matchedMember = selectableMembers.find((member) => member.userCode && member.userCode.trim().toLocaleLowerCase() === uidQuery.toLocaleLowerCase());
    const onbookEntry = floatDraft.binding === "onbook" && floatDraft.onbookUid ? findOnbookByUid(onbookStaff, floatDraft.onbookUid) : undefined;
    let memberUserId: number | undefined;
    let memberName: string | undefined;
    let memberUid: string | undefined;
    if (onbookEntry) { memberName = onbookEntry.name; memberUid = onbookEntry.uid; }
    else if (floatDraft.binding === "onbook") {
      const byPhone = findOnbookByPhone(onbookStaff, floatDraft.phone);
      if (byPhone) { memberName = byPhone.name; memberUid = byPhone.uid; }
      else {
        const membersData = overview.data?.members ?? [];
        const issue = validateOnbookEntry({ name: label, phone: floatDraft.phone }, membersData.map((item) => item.phone), onbookStaff);
        if (issue) { Alert.alert(language === "ar" ? "بيانات المنتسب غير مكتملة" : "On-book staff data incomplete", language === "ar" ? "أدخل اسم المنتسب ورقم هاتف صحيحين في حقول الهوية، أو اختر منتسبًا من القائمة." : "Enter a valid member name and phone in the identity fields, or pick a member from the list."); return; }
        const uid = suggestOnbookUid(floatDraft.entity, [...membersData.map((item) => item.userCode).filter((code): code is string => Boolean(code)), ...onbookStaff.map((item) => item.uid)]);
        const entry: OnbookStaff = { uid, name: label, phone: floatDraft.phone.trim(), role: floatDraft.entity, isAppUser: false, createdAt: new Date().toISOString() };
        await commit([...onbookStaff, entry]);
        memberName = entry.name; memberUid = entry.uid;
      }
    }
    else if (matchedMember) { memberUserId = matchedMember.userId; memberName = matchedMember.displayName; memberUid = matchedMember.userCode ?? undefined; }
    else if (floatEditingId) { const existing = floats.find((item) => item.id === floatEditingId); if (existing?.memberUserId) { memberUserId = existing.memberUserId; memberName = existing.memberName; memberUid = existing.memberUid; } else { memberUid = existing?.memberUid; } }
    const channelRows = [...floatCliqRows, ...floatBankRows];
    const channels: StaffFloatChannel[] = channelRows.filter((item) => item.detail.trim() || item.provider.trim() || item.holderName.trim() || item.iban.trim()).map((item) => { const complete = isChannelRowComplete(item.kind, item); return { kind: (item.kind === "cliq" || item.kind === "bank") ? item.kind : "cliq", alias: (item.kind === "cliq" ? item.detail.trim() : "").slice(0, 160) || undefined, provider: item.provider.trim().slice(0, 60) || undefined, holderName: item.holderName.trim().slice(0, 60) || undefined, iban: (item.kind === "bank" ? item.iban.trim() : "").slice(0, 200) || undefined, isDefault: complete ? (item.isDefault || undefined) : undefined, whatsApp: complete ? (item.whatsApp || undefined) : undefined, isActive: complete ? undefined : false }; });
    const cliqChannels = channels.filter((c) => c.kind === "cliq" && c.isActive !== false);
    const bankChannels = channels.filter((c) => c.kind === "bank" && c.isActive !== false);
    const primaryCliq = cliqChannels.find((c) => c.isDefault) ?? cliqChannels[0];
    const primaryBank = bankChannels.find((c) => c.isDefault) ?? bankChannels[0];
    const mirrorBank = primaryBank ? [`البنك: ${primaryBank.provider ?? ""}`, primaryBank.holderName ? `صاحب: ${primaryBank.holderName}` : "", `IBAN: ${primaryBank.iban ?? ""}`].filter(Boolean).join(" · ").trim() : undefined;
    const otherNote = floatDraft.hasOther && Boolean(floatDraft.otherNote.trim()) ? `أخرى: ${floatDraft.otherNote.trim().slice(0, 240)}` : "";
    const ceilingValue = Number(floatDraft.ceiling.trim());
    const maxFloatLimit = floatDraft.ceiling.trim() && Number.isFinite(ceilingValue) && ceilingValue >= 0 ? Math.round(ceilingValue * 100) / 100 : undefined;
    const existingActive = floatDraft.id ? floats.some((item) => item.id === floatDraft.id && item.isActive !== false) : false;
    const commissionValue = floatDraft.isCommissionEnabled && floatDraft.commissionValue.trim() ? (Number(floatDraft.commissionValue) > 0 ? Math.round(Number(floatDraft.commissionValue) * 100) / 100 : undefined) : undefined;
    const base = { memberName: (memberName ?? "").trim().slice(0, 120) || undefined, memberUserId, memberUid, contactPhone: floatDraft.phone.trim().slice(0, 30) || undefined, cliqAlias: primaryCliq?.alias, bankDetails: (primaryBank || (floatDraft.hasOther && Boolean(floatDraft.otherNote.trim()))) ? [mirrorBank, otherNote].filter(Boolean).join("\n") || undefined : undefined, channels: channels.length ? channels : undefined, maxFloatLimit, isDefault: floatDraft.isDefault || undefined, whatsApp: channels.some((channel) => channel.whatsApp === true) || undefined, entity: floatDraft.entity, cashActive: floatDraft.isActive, hasOther: floatDraft.hasOther || undefined, isActive: floatDraft.id ? existingActive : (floatDraft.isActive || floatDraft.hasOther || channels.some((channel) => channel.isActive !== false)), isCommissionEnabled: floatDraft.isCommissionEnabled || undefined, commissionType: floatDraft.isCommissionEnabled ? floatDraft.commissionType : undefined, commissionValue };
    const primary: StaffFloatAccount = { id: floatDraft.id ?? createFloatId(), label, ...base };
    const all = floatDraft.id ? floats.map((item) => item.id === floatDraft.id ? primary : item) : [...floats, primary];
    try {
      await saveFloats(all);
      pushAudit(isFloatEdit ? "edit" : "add", `${label}${memberName ? ` (${memberName})` : ""}`, language === "ar" ? "حفظ بيانات نقطة التحصيل وتحديثها" : "Saved & updated collection point");
      Alert.alert(language === "ar" ? "✓ تم حفظ وتحديث طرق الدفع بنجاح" : "✓ Payment methods saved and updated successfully");
      setEditingAccountId(null);
      setUnifiedOpen(false);
      clearAuditHighlight();
    } catch {
      Alert.alert(language === "ar" ? "فشل الحفظ" : "Save failed", language === "ar" ? "تعذّر حفظ نقطة التحصيل، أعد المحاولة." : "Could not save the collection point, please retry.");
    }
  };
  const floatEditingId = floatDraft.id ?? null;
  const isChannelRowComplete = (group: "cliq" | "bank" | "vault" | "other", row: OwnerRow): boolean => group === "vault" ? isChannelComplete("cash", { label: row.label }) : group === "cliq" ? isChannelComplete("cliq", { alias: row.detail, provider: row.provider }) : group === "bank" ? isChannelComplete("bank", { bankName: row.provider, iban: row.iban }) : isChannelComplete("other", { label: row.label });
  const isOwnerTreasuryComplete = (account: OwnerTreasuryAccount): boolean => {
    if (account.kind === "cliq") return isChannelComplete("cliq", { alias: account.detail ?? "", provider: account.provider ?? "" });
    if (account.kind === "bank") return isChannelComplete("bank", { bankName: account.provider ?? "", iban: (account.detail || account.iban) ?? "" });
    if (account.kind === "other") return isChannelComplete("other", { label: account.label });
    return isChannelComplete("cash", { label: account.label });
  };
  const isFloatComplete = (account: StaffFloatAccount): boolean => {
    if (!(account.label || "").trim() || !(account.contactPhone || "").trim()) return false;
    const channels = Array.isArray(account.channels) && account.channels.length ? account.channels : [];
    if (!channels.length) return true;
    return channels.every((channel) => channel.isActive === false || (channel.kind === "cliq" ? isChannelComplete("cliq", { alias: channel.alias ?? "", provider: channel.provider ?? "" }) : isChannelComplete("bank", { bankName: channel.provider ?? "", iban: channel.iban ?? "" })));
  };
  const toggleOwnerActive = (account: OwnerTreasuryAccount, nextActive: boolean) => {
    if (nextActive && !isOwnerTreasuryComplete(account)) showToast(language === "ar" ? "تم التفعيل — يرجى إكمال بيانات الحساب عبر زر التعديل أولاً" : "Activated — please complete the account data via the edit button first.");
    pushAudit(nextActive ? "activate" : "deactivate", rowTargetLabel({ key: account.id, kind: account.kind, label: account.label, detail: "", provider: "", holderName: "", iban: "", isDefault: false, whatsApp: false, isActive: true }), nextActive ? (language === "ar" ? "تفعيل القناة والحساب للاستلام في نموذج الحجز" : "Activated channel & account for checkout") : (language === "ar" ? "تعطيل القناة والحساب" : "Deactivated channel & account"));
    void saveOwnerRegistry(ownerAccounts.map((item) => item.id === account.id ? { ...item, isActive: nextActive } : item));
  };
  const removeOwner = (account: OwnerTreasuryAccount) => setPendingDelete({ title: language === "ar" ? "حذف حساب الخزينة" : "Remove treasury account", message: language === "ar" ? `ستُزال «${account.label}» من قنوات الاستلام المتاحة في نموذج الحجز.` : `“${account.label}” will be removed from the checkout receiving channels.`, confirm: () => { pushAudit("delete", `${groupLabel(account.kind)} - ${account.label}`, language === "ar" ? "حذف الحساب من طرق الدفع" : "Removed account from payment methods"); void saveOwnerRegistry(ownerAccounts.filter((item) => item.id !== account.id)); } });
  const toggleFloatActive = (account: StaffFloatAccount, nextActive: boolean) => {
    if (nextActive && !isFloatComplete(account)) { Alert.alert(language === "ar" ? "لا يمكن تفعيل عهدة ناقصة البيانات" : "Incomplete float can't be activated", language === "ar" ? "يرجى إكمال بيانات الحساب عبر زر التعديل أولاً" : "Please complete the account data via the edit button first."); return; }
    pushAudit(nextActive ? "activate" : "deactivate", `${account.label}`, nextActive ? (language === "ar" ? "تفعيل نقطة التحصيل وقنواتها" : "Activated collection point & channels") : (language === "ar" ? "تعطيل نقطة التحصيل وقنواتها" : "Deactivated collection point & channels"));
    void saveFloats(floats.map((item) => item.id === account.id ? { ...item, isActive: nextActive } : item));
  };
  const removeFloat = (account: StaffFloatAccount) => setPendingDelete({ title: language === "ar" ? "حذف نقطة التحصيل" : "Remove collection point", message: language === "ar" ? `ستُحذف «${account.label}» مع بقاء سجل تسوية العُهد السابقة محفوظًا.` : `“${account.label}” will be removed while past custody settlements remain recorded.`, confirm: () => { pushAudit("delete", `${account.label}`, language === "ar" ? "حذف نقطة التحصيل من طرق الدفع" : "Removed collection point from payment methods"); void saveFloats(floats.filter((item) => item.id !== account.id)); } });

const ownerSetDefault = (account: OwnerTreasuryAccount) => {
    if (account.isActive === false) { Alert.alert(language === "ar" ? "لا يمكن تعيين حساب موقوف افتراضيًا" : "Paused account can't be default", language === "ar" ? "فعّل الحساب أولاً ثم عيّنه كافتراضي." : "Activate the account first, then set it as default."); return; }
    pushAudit("default", `${groupLabel(account.kind)} - ${account.label}`, language === "ar" ? "تعيين الحساب كافتراضي لطريقة" : "Set account as method default");
    void saveOwnerRegistry(ownerAccounts.map((item) => item.id === account.id ? { ...item, isDefault: true } : item));
  };
  const floatToggleCash = (account: StaffFloatAccount, nextActive: boolean) => {
    if (nextActive && !isFloatComplete(account)) { Alert.alert(language === "ar" ? "لا يمكن تفعيل نقدية عهدة ناقصة" : "Incomplete float cash can't be activated", language === "ar" ? "أكمل اسم النقطة ورقم الهاتف أولاً." : "Complete the point name and phone number first."); return; }
    pushAudit(nextActive ? "activate" : "deactivate", `كاش - ${account.label}`, nextActive ? (language === "ar" ? "تفعيل استلام النقد في نقطة التحصيل" : "Enabled cash collection at the point") : (language === "ar" ? "تعطيل استلام النقد في نقطة التحصيل" : "Disabled cash collection at the point"));
    void saveFloats(floats.map((item) => item.id === account.id ? { ...item, cashActive: nextActive } : item));
  };
  const floatToggleOther = (account: StaffFloatAccount, nextActive: boolean) => {
    if (nextActive && !isFloatComplete(account)) { Alert.alert(language === "ar" ? "لا يمكن تفعيل قناة عهدة ناقصة" : "Incomplete float channel can't be activated", language === "ar" ? "أكمل اسم النقطة ورقم الهاتف أولاً." : "Complete the point name and phone number first."); return; }
    pushAudit(nextActive ? "activate" : "deactivate", `أخرى - ${account.label}`, nextActive ? (language === "ar" ? "تفعيل قناة الدفع الإلكتروني / الأخرى" : "Enabled e-payment / other channel") : (language === "ar" ? "تعطيل قناة الدفع الإلكتروني / الأخرى" : "Disabled e-payment / other channel"));
    void saveFloats(floats.map((item) => item.id === account.id ? { ...item, hasOther: nextActive } : item));
  };
  const floatToggleChannel = (account: StaffFloatAccount, channel: StaffFloatChannel, nextActive: boolean) => {
    if (nextActive && !(channel.kind === "cliq" ? isChannelComplete("cliq", { alias: channel.alias ?? "", provider: channel.provider ?? "" }) : isChannelComplete("bank", { bankName: channel.provider ?? "", iban: channel.iban ?? "" }))) { Alert.alert(language === "ar" ? "لا يمكن تفعيل قناة ناقصة البيانات" : "Incomplete channel can't be activated", language === "ar" ? "أكمل بيانات القناة عبر زر التعديل أولاً." : "Complete the channel data via the edit button first."); return; }
    pushAudit(nextActive ? "activate" : "deactivate", `${account.label} - ${channel.kind === "cliq" ? (channel.alias ?? "") : (channel.iban ?? "")}`, nextActive ? (language === "ar" ? "تفعيل القناة في نقطة التحصيل" : "Enabled the channel at the collection point") : (language === "ar" ? "تعطيل القناة في نقطة التحصيل" : "Disabled the channel at the collection point"));
    void saveFloats(floats.map((item) => item.id === account.id ? { ...item, channels: (item.channels ?? []).map((entry) => entry === channel ? { ...entry, isActive: nextActive } : entry) } : item));
  };
  const floatSetChannelDefault = (account: StaffFloatAccount, channel: StaffFloatChannel) => {
    pushAudit("default", `${account.label} - ${channel.kind === "cliq" ? (channel.alias ?? "") : (channel.iban ?? "")}`, language === "ar" ? "تعيين القناة كافتراضي لطريقة" : "Set channel as method default");
    void saveFloats(floats.map((item) => item.id === account.id ? { ...item, channels: (item.channels ?? []).map((entry) => entry === channel ? { ...entry, isDefault: true } : { ...entry, isDefault: undefined }) } : item));
  };
  const openOwnerAddFor = (kind: OwnerTreasuryKind) => {
    setUnifiedEntity("owner");
    setEditingAccountId(null);
    setFloatDraft(emptyFloatDraft("staff"));
    setFloatCliqRows([]);
    setFloatBankRows([]);
    setOwnerVaultRows(kind === "vault" ? [{ ...emptyOwnerRow("vault"), isActive: true }] : []);
    setOwnerCliqRows(kind === "cliq" ? [{ ...emptyOwnerRow("cliq"), isActive: true }] : []);
    setOwnerBankRows(kind === "bank" ? [{ ...emptyOwnerRow("bank"), isActive: true }] : []);
    setOwnerOtherRows(kind === "other" ? [{ ...emptyOwnerRow("other"), isActive: true }] : []);
    setOpenChannels({ cliq: kind === "cliq", bank: kind === "bank", cash: kind === "vault", other: kind === "other" });
    setUnifiedOpen(true);
  };
  const openFloatAddOther = (account: StaffFloatAccount) => {
    openFloatEdit(account);
    setFloatDraft((draft) => ({ ...draft, hasOther: true }));
    setOpenChannels({ cash: false, cliq: false, bank: false, other: true });
  };
  const openFloatAddChannel = (account: StaffFloatAccount, kind: "cliq" | "bank") => {
    openFloatEdit(account);
    const fresh = { ...emptyOwnerRow(kind), isActive: true };
    if (kind === "cliq") setFloatCliqRows((current) => [...current, fresh]);
    else setFloatBankRows((current) => [...current, fresh]);
    setOpenChannels({ cash: false, cliq: kind === "cliq", bank: kind === "bank", other: false });
  };
  const ownerDetailLabel = (account: OwnerTreasuryAccount) => {
    if (account.isActive === false) return language === "ar" ? "موقوف — لا يظهر في خيارات الدفع" : "Disabled — hidden from checkout";
    if (!isOwnerTreasuryComplete(account)) return language === "ar" ? "بانتظار الإعداد — يلزم إدخال الاسم المستعار والبنك" : "Awaiting setup — alias and bank required";
    const parts: string[] = [];
    if (account.kind === "cliq") { if (account.detail) parts.push(`Alias: ${account.detail}`); if (account.provider) parts.push(account.provider); }
    else if (account.kind === "bank") { if (account.detail) parts.push(`IBAN: ${account.detail}`); if (account.provider) parts.push(account.provider); }
    else if (account.detail) parts.push(account.detail);
    return parts.length ? parts.join(" · ") : (language === "ar" ? "بانتظار الإعداد" : "Awaiting setup");
  };

  const renderStatusPill = (label: string, color: string, icon?: "star" | "check-circle" | "pause-circle") => <View style={[styles.statusPill, { backgroundColor: color + "12", borderColor: color + "45" }]}>{icon ? <MaterialIcons name={icon} size={11} color={color} /> : null}<Text style={{ color, fontSize: 10, fontWeight: "800" }}>{label}</Text></View>;

  const toggleExpanded = (id: string) => setExpandedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const showToast = (message: string) => { if (toastTimer.current) clearTimeout(toastTimer.current); setToolbarToast(message); toastTimer.current = setTimeout(() => setToolbarToast(null), 2600); };
  const groupLabel = (group: "cliq" | "bank" | "vault" | "other") => group === "cliq" ? "CliQ" : group === "bank" ? "البنكي (IBAN)" : group === "vault" ? "كاش" : "أخرى";
  const rowTargetLabel = (entry: OwnerRow) => `${groupLabel(entry.kind)} - ${entry.label || entry.detail || entry.provider || entry.iban || (entry.kind === "cliq" ? (language === "ar" ? "مسودة CliQ" : "CliQ draft") : entry.kind === "bank" ? (language === "ar" ? "مسودة بنك" : "Bank draft") : entry.kind === "other" ? (language === "ar" ? "مسودة طريقة أخرى" : "Other-method draft") : (language === "ar" ? "مسودة كاش" : "Cash draft"))}`;
  const roleTitle = (value: string) => value === "owner" ? (language === "ar" ? "المالك" : "Owner") : value === "admin" ? (language === "ar" ? "مدير المنشأة" : "Admin") : value === "super_admin" ? (language === "ar" ? "مدير النظام" : "Super admin") : value === "staff" ? (language === "ar" ? "موظف" : "Staff") : value === "caretaker" ? (language === "ar" ? "حارس" : "Caretaker") : (language === "ar" ? "مستخدم" : "User");
  const formatAuditTime = (iso: string) => { const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const pushAudit = (action: PaymentMethodAuditAction, target: string, detail: string) => { void appendPaymentMethodAudit({ action, target, detail, actorName: user?.name ?? "", actorRole: role ?? "" }).then(setAuditLog); };
  const openAudit = () => { void loadPaymentMethodAudit().then(setAuditLog); setAuditOpen(true); };
  const hintRow = (key: string, message: string) => { if (rowErrorTimer.current) clearTimeout(rowErrorTimer.current); setRowErrors((prev) => ({ ...prev, [key]: message })); rowErrorTimer.current = setTimeout(() => setRowErrors((prev) => { if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; }), 5200); };
  const collectMissingTokens = (): string[] => {
    const tokens: string[] = [];
    if (unifiedEntity !== "owner") {
      if (!floatDraft.label.trim()) tokens.push("ident:label");
      if (!floatDraft.phone.trim()) tokens.push("ident:phone");
      if (floatDraft.isActive && floatDraft.ceiling.trim()) { const ceilingNumber = Number(floatDraft.ceiling); if (!Number.isFinite(ceilingNumber) || ceilingNumber < 0) tokens.push("ident:ceiling"); }
      if (floatDraft.isCommissionEnabled && floatDraft.commissionValue.trim()) { const commissionNumber = Number(floatDraft.commissionValue); if (!Number.isFinite(commissionNumber) || commissionNumber <= 0 || (floatDraft.commissionType === "PERCENTAGE_OF_TOTAL" && commissionNumber > 100)) tokens.push("ident:commission"); }
    }
    const scanRow = (row: OwnerRow) => { if (row.isActive === false) return; const group = row.kind; if (group === "vault") { if (!row.label.trim()) tokens.push(`row:vault:${row.key}:label`); } else if (group === "cliq") { if (!row.detail.trim()) tokens.push(`row:cliq:${row.key}:detail`); if (!row.provider.trim()) tokens.push(`row:cliq:${row.key}:provider`); } else if (group === "bank") { if (!row.provider.trim()) tokens.push(`row:bank:${row.key}:provider`); if (!row.iban.trim()) tokens.push(`row:bank:${row.key}:iban`); } else if (group === "other") { if (!row.label.trim()) tokens.push(`row:other:${row.key}:label`); } };
    if (unifiedEntity === "owner") { ownerVaultRows.forEach(scanRow); ownerCliqRows.forEach(scanRow); ownerBankRows.forEach(scanRow); ownerOtherRows.forEach(scanRow); }
    else { floatCliqRows.forEach(scanRow); floatBankRows.forEach(scanRow); if (floatDraft.hasOther && !floatDraft.otherNote.trim()) tokens.push("ident:otherNote"); }
    return tokens;
  };
  const tokenLabel = (token: string) => {
    if (token === "ident:label") return language === "ar" ? "اسم المستلم / النقطة" : "Recipient / collection-point name";
    if (token === "ident:phone") return language === "ar" ? "رقم الهاتف للتواصل" : "Contact phone number";
    if (token === "ident:ceiling") return language === "ar" ? "الحد الأقصى للعهدة النقدية" : "Maximum cash float ceiling";
    if (token === "ident:commission") return language === "ar" ? "قيمة العمولة (أكبر من صفر، ونسبة لا تتجاوز 100%)" : "Commission value (greater than zero; percentage up to 100%)";
    if (token === "ident:otherNote") return language === "ar" ? "وصف القناة الأخرى" : "Custom channel description";
    if (token.endsWith(":label")) return language === "ar" ? "اسم خزينة الكاش" : "Cash vault label";
    if (token.startsWith("row:cliq:")) return token.endsWith(":provider") ? (language === "ar" ? "اسم البنك أو المحفظة" : "Bank / wallet provider") : (language === "ar" ? "الاسم المستعار أو رقم الموبايل" : "Alias / mobile number");
    if (token.startsWith("row:bank:")) return token.endsWith(":provider") ? (language === "ar" ? "اسم البنك" : "Bank name") : (language === "ar" ? "رقم الآيبان الدولي (IBAN)" : "International IBAN / account number");
    if (token.startsWith("row:other:")) return language === "ar" ? "اسم الجهاز / الطريقة" : "Device / method name";
    return language === "ar" ? "بيانات إجبارية" : "Required data";
  };
  const hasCompleteActiveChannel = (): boolean => unifiedEntity === "owner" ? [...ownerVaultRows, ...ownerCliqRows, ...ownerBankRows, ...ownerOtherRows].some((row) => row.isActive !== false && isChannelRowComplete(row.kind, row)) : floatDraft.isActive || (floatDraft.hasOther && Boolean(floatDraft.otherNote.trim())) || [...floatCliqRows, ...floatBankRows].some((row) => row.isActive !== false && isChannelRowComplete(row.kind, row));
  const runSaveAudit = (): { items: string[]; tokens: string[] } => {
    const tokens = collectMissingTokens();
    const items: string[] = tokens.map(tokenLabel);
    if (!hasCompleteActiveChannel()) { items.push(language === "ar" ? "⚠️ يجب تفعيل وإكمال بيانات طريقة دفع واحدة على الأقل" : "⚠️ You must enable and complete at least one payment method"); tokens.push("channel:mandate"); }
    return { items, tokens };
  };
  const missingRed = new Set(collectMissingTokens());
  const scrollToFirstError = (tokens: string[]) => {
    const map = layoutY.current;
    for (const token of tokens) {
      if (token.startsWith("row:")) {
        const parts = token.split(":");
        const group = parts[1];
        const key = parts[2];
        const y = (map["sec-" + group] ?? 0) + (map["row-" + key] ?? 0);
        if (y > 0) { sheetScrollRef.current?.scrollTo({ y: Math.max(0, y - 72), animated: true }); return; }
      } else if (token.startsWith("ident:")) {
        const group = token === "ident:otherNote" ? "other" : "identity";
        const y = map["sec-" + group] ?? 0;
        if (y > 0) { sheetScrollRef.current?.scrollTo({ y: Math.max(0, y - 72), animated: true }); return; }
      }
    }
  };
  const presentAudit = (audit: { items: string[]; tokens: string[] }) => {
    setRedFields(new Set(audit.tokens.filter(Boolean)));
    const identOnlyGaps = audit.tokens.length > 0 && audit.tokens.every((token) => token === "ident:label" || token === "ident:phone");
    const mandateOnly = audit.tokens.includes("channel:mandate") && audit.tokens.every((token) => token === "channel:mandate");
    const title = mandateOnly ? (language === "ar" ? "⚠️ لا يمكن الحفظ — يجب تفعيل وإكمال بيانات طريقة دفع واحدة على الأقل" : "⚠️ Cannot save — you must enable and complete at least one payment method") : identOnlyGaps ? (language === "ar" ? "⚠️ لا يمكن الحفظ — يرجى إدخال اسم المستلم ورقم الهاتف" : "⚠️ Cannot save — enter the recipient name and phone number") : (language === "ar" ? "⚠️ لا يمكن إتمام الحفظ — بيانات غير مكتملة" : "⚠️ Cannot save — incomplete data");
    setAuditBanner({ title, lines: audit.items });
    if (auditTimer.current) clearTimeout(auditTimer.current);
    auditTimer.current = setTimeout(clearAuditHighlight, 10000);
    scrollToFirstError(audit.tokens);
  };
  const clearAuditHighlight = () => { setRedFields(new Set()); setAuditBanner(null); if (auditTimer.current) { clearTimeout(auditTimer.current); auditTimer.current = null; } };

const missingIdLabel = () => language === "ar" ? "⚠️ بدون معرف" : "⚠️ No identifier";
  const renderDrawerStatusPills = (incomplete: boolean, active: boolean, whatsapp: boolean, isDefault: boolean) => <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>{incomplete ? renderStatusPill(language === "ar" ? "⚠️ بيانات غير مكتملة" : "⚠️ Incomplete data", colors.warning) : renderStatusPill(active ? (language === "ar" ? "✓ مفعّل وجاهز" : "✓ Active") : (language === "ar" ? "معطّل" : "Inactive"), active ? colors.success : colors.warning)}{whatsapp ? renderStatusPill(language === "ar" ? "واتساب" : "WhatsApp", "#0EA5E9") : null}{isDefault ? renderStatusPill(language === "ar" ? "افتراضي" : "Default", colors.success, "star") : null}</View>;
  const renderDefaultStar = (onPress: () => void, disabled: boolean, isDefault: boolean, tint: string) => disabled ? <View style={[styles.iconButton, { borderColor: colors.border, opacity: 0.45 }]}><MaterialIcons name={isDefault ? "star" : "star-outline"} size={16} color={colors.muted} /></View> : <Pressable accessibilityRole="radio" accessibilityState={{ checked: isDefault, disabled }} accessibilityLabel={language === "ar" ? "تعيين كافتراضي ★" : "Set as default ★"} onPress={onPress} style={({ pressed }) => [styles.iconButton, { borderColor: isDefault ? tint : colors.border, backgroundColor: isDefault ? tint + "16" : "transparent", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={isDefault ? "star" : "star-outline"} size={16} color={isDefault ? tint : colors.muted} /></Pressable>;
  const renderGroupHeader = (icon: "bolt" | "account-balance" | "payments" | "point-of-sale", tint: string, title: string, subtitle: string, quickLabel?: string, onQuickAdd?: () => void) => <View style={[styles.channelHead, { flexDirection: row }]}><MaterialIcons name={icon} size={19} color={tint} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 1, textAlign: align }}>{subtitle}</Text></View>{quickLabel && onQuickAdd ? <Pressable accessibilityRole="button" accessibilityLabel={quickLabel} onPress={onQuickAdd} style={({ pressed }) => [styles.quickAdd, { backgroundColor: tint + "14", borderColor: tint + "55", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="add" size={14} color={tint} /><Text style={{ color: tint, fontSize: 10.5, fontWeight: "900" }}>{quickLabel}</Text></Pressable> : null}</View>;
  const renderOwnerGroup = (group: "cliq" | "bank" | "vault" | "other") => {
    const rows = ownerAccounts.filter((account) => account.kind === group).slice().sort((a, b) => { const rank = (kind: OwnerTreasuryKind) => kind === "vault" ? 0 : kind === "cliq" ? 1 : 2; return rank(a.kind) - rank(b.kind); });
    const tint = group === "cliq" ? "#0EA5E9" : group === "bank" ? "#6366F1" : group === "vault" ? "#10B981" : "#8B5CF6";
    const mbMeta = group === "cliq" ? { title: language === "ar" ? "الحوالة البنكية عبر CliQ" : "CliQ transfer", sub: language === "ar" ? "كليك للتحويل الفوري" : "Instant CliQ transfers" } : group === "bank" ? { title: language === "ar" ? "الحوالة البنكية (IBAN)" : "Bank transfer (IBAN)", sub: language === "ar" ? "تحويل بنكي محلي ودولي" : "Local & international transfers" } : group === "other" ? { title: language === "ar" ? "الدفع الإلكتروني والبطاقات" : "Cards & e-payment", sub: language === "ar" ? "Visa / POS / محافظ إلكترونية" : "Visa / POS / e-wallets" } : { title: language === "ar" ? "النقد (Cash)" : "Cash", sub: language === "ar" ? "استلام نقدي في الموقع" : "Receive physical cash" };
    const quickAdd = group === "vault" ? undefined : group === "cliq" ? () => openOwnerAddFor("cliq") : group === "bank" ? () => openOwnerAddFor("bank") : () => openOwnerAddFor("other");
    const quickLabel = group === "vault" ? undefined : group === "cliq" ? (language === "ar" ? "+ إضافة حساب CliQ" : "+ Add CliQ account") : group === "bank" ? (language === "ar" ? "+ إضافة حساب بنكي" : "+ Add bank account") : (language === "ar" ? "+ إضافة طريقة أخرى" : "+ Add another method");
    return <View style={[styles.channelCard, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 10 }]}>{renderGroupHeader(group === "cliq" ? "bolt" : group === "bank" ? "account-balance" : group === "other" ? "point-of-sale" : "payments", tint, mbMeta.title, mbMeta.sub, quickLabel, quickAdd)}{rows.length ? rows.map((account) => renderAccountRow(account)) : <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8, textAlign: align, opacity: 0.85 }}>{language === "ar" ? "لا توجد حسابات في هذه القناة بعد — استخدم زر الإضافة." : "No accounts yet in this channel — use the add button."}</Text>}</View>;
  };
  const renderAccountRow = (account: OwnerTreasuryAccount) => {
    const soleActive = account.isActive !== false && activeOwnerCount <= 1;
    const solePrimaryVault = account.kind === "vault" && account.isDefault === true && ownerAccounts.length === 1;
    const kind = ownerKindMeta(account.kind);
    const active = account.isActive !== false;
    const incomplete = !isOwnerTreasuryComplete(account);
    return <View key={account.id} style={[styles.channelRow, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: "column", alignItems: "stretch", marginTop: 8 }]}><View style={[styles.channelRowHead, { flexDirection: cardRow, direction: "ltr" }]}><View style={[styles.channelIcon, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "35" }]}><MaterialIcons name={kind.icon} size={20} color={colors.primary} /></View><View style={styles.flex}><View style={[styles.channelTitleRow, { flexDirection: row }]}><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: align }}>{account.label}</Text>{renderDrawerStatusPills(incomplete, active, account.whatsApp === true, account.isDefault === true)}</View><Text numberOfLines={1} style={{ color: account.isActive !== false ? colors.muted : colors.warning, fontSize: 10.5, fontWeight: "700", marginTop: 3, textAlign: align, fontFamily: MONO_FONT }}>{ownerDetailLabel(account)}</Text></View>{renderDefaultStar(() => ownerSetDefault(account), account.isActive === false, account.isDefault === true, colors.primary)}<Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تعديل حساب الخزينة" : "Edit treasury account"} onPress={() => openOwnerEdit(account)} style={({ pressed }) => [styles.iconButton, { borderColor: colors.primary + "55", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="edit" size={17} color={colors.primary} /></Pressable>{solePrimaryVault ? null : <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حذف الحساب" : "Remove account"} onPress={() => removeOwner(account)} style={({ pressed }) => [styles.iconButton, { borderColor: colors.error + "55", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="delete-outline" size={17} color={colors.error} /></Pressable>}<ChannelSwitch value={active} onValueChange={(value) => toggleOwnerActive(account, value)} isRTL={isRTL} color={active ? colors.success : colors.warning} inactiveColor="#334155" accessibilityLabel={`${language === "ar" ? "تفعيل" : "Enable"} ${account.label}`} /></View></View>;
  };
  const renderFloatCashBlock = (account: StaffFloatAccount) => {
    const active = account.cashActive === true;
    const complete = isFloatComplete(account);
    return <View style={[styles.channelCard, { backgroundColor: colors.background, borderColor: colors.border }]}><View style={[styles.channelHead, { flexDirection: row }]}><MaterialIcons name="payments" size={19} color="#0EA5E9" /><View style={styles.flex}><View style={[styles.channelTitleRow, { flexDirection: row }]}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "النقد (Cash)" : "Cash"}</Text>{renderStatusPill(active ? (complete ? (language === "ar" ? "✓ مكتمل ومفعّل" : "✓ Complete & active") : (language === "ar" ? "⚠️ بانتظار استكمال البيانات" : "⚠️ Awaiting data completion")) : (language === "ar" ? "معطّل" : "Inactive"), active ? colors.success : colors.warning, active ? "check-circle" : undefined)}</View><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 1, textAlign: align }}>{account.maxFloatLimit !== undefined ? `${language === "ar" ? "سقف العهدة" : "Float ceiling"}: ${account.maxFloatLimit}` : (language === "ar" ? "استلام نقدي في الموقع" : "Receive physical cash")}</Text></View><ChannelSwitch value={active} onValueChange={(value) => floatToggleCash(account, value)} isRTL={isRTL} color={active ? colors.success : colors.warning} inactiveColor="#334155" disabled={!complete} accessibilityLabel={`${language === "ar" ? "تفعيل النقد" : "Enable cash"} - ${account.label}`} /></View></View>;
  };
  const renderFloatOtherBlock = (account: StaffFloatAccount) => {
    const active = account.hasOther === true;
    const complete = isFloatComplete(account);
    return <View style={[styles.channelCard, { backgroundColor: colors.background, borderColor: colors.border }]}><View style={[styles.channelHead, { flexDirection: row }]}><MaterialIcons name="point-of-sale" size={19} color="#0EA5E9" /><View style={styles.flex}><View style={[styles.channelTitleRow, { flexDirection: row }]}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "أخرى (Other)" : "Other"}</Text>{renderStatusPill(active ? (complete ? (language === "ar" ? "✓ مكتمل ومفعّل" : "✓ Complete & active") : (language === "ar" ? "⚠️ بانتظار استكمال البيانات" : "⚠️ Awaiting data completion")) : (language === "ar" ? "معطّل" : "Inactive"), active ? colors.success : colors.warning, active ? "check-circle" : undefined)}</View><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 1, textAlign: align }}>{language === "ar" ? "أجهزة POS أو محافظ ثانوية" : "POS terminals or secondary wallets"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إضافة طريقة أخرى" : "Add another method"} onPress={() => openFloatAddOther(account)} style={({ pressed }) => [styles.quickAdd, { backgroundColor: "#0EA5E9" + "14", borderColor: "#0EA5E9" + "55", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="add" size={14} color="#0EA5E9" /><Text style={{ color: "#0EA5E9", fontSize: 10.5, fontWeight: "900" }}>{language === "ar" ? "+ إضافة طريقة أخرى" : "+ Add another method"}</Text></Pressable><ChannelSwitch value={active} onValueChange={(value) => floatToggleOther(account, value)} isRTL={isRTL} color={active ? colors.success : colors.warning} inactiveColor="#334155" disabled={!complete} accessibilityLabel={`${language === "ar" ? "تفعيل" : "Enable"} ${language === "ar" ? "أخرى (Other)" : "Other"} - ${account.label}`} /></View></View>;
  };
  const renderFloatChannelRow = (account: StaffFloatAccount, channel: StaffFloatChannel) => {
    const provider = (channel.provider || "").trim();
    const holder = (channel.holderName || "").trim();
    const idf = ((channel.kind === "cliq" ? channel.alias : channel.iban) || "").trim();
    const isComplete = channel.kind === "cliq" ? isChannelComplete("cliq", { alias: channel.alias ?? "", provider: channel.provider ?? "" }) : isChannelComplete("bank", { bankName: channel.provider ?? "", iban: channel.iban ?? "" });
    const active = channel.isActive !== false;
    const soleActive = active && (account.channels ?? []).filter((c) => c.isActive !== false).length <= 1 && account.cashActive !== true && account.hasOther !== true;
    const title = `${provider || (channel.kind === "cliq" ? "CliQ" : (language === "ar" ? "بنك" : "Bank"))}${idf ? ` • ${idf}` : ` • ${missingIdLabel()}`}${holder ? ` • ${holder}` : channel.kind === "cliq" ? ` • ${language === "ar" ? "بدون اسم" : "No name"}` : ""}`;
    return <View key={`${account.id}-${channel.kind}-${channel.alias || channel.iban || "x"}`} style={[styles.channelRow, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: "column", alignItems: "stretch", marginTop: 8 }]}><View style={[styles.channelRowHead, { flexDirection: cardRow, direction: "ltr" }]}><View style={[styles.channelIcon, { backgroundColor: "#0EA5E9" + "14", borderColor: "#0EA5E9" + "35" }]}><MaterialIcons name={channel.kind === "cliq" ? "bolt" : "account-balance"} size={20} color="#0EA5E9" /></View><View style={styles.flex}><View style={[styles.channelTitleRow, { flexDirection: row }]}><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12.5, fontWeight: "900", textAlign: align, fontFamily: MONO_FONT }}>{title}</Text>{renderDrawerStatusPills(!isComplete, active, channel.whatsApp === true, channel.isDefault === true)}</View></View>{renderDefaultStar(() => floatSetChannelDefault(account, channel), false, channel.isDefault === true, "#0EA5E9")}<Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تعديل القناة" : "Edit channel"} onPress={() => openFloatEdit(account)} style={({ pressed }) => [styles.iconButton, { borderColor: "#0EA5E9" + "55", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="edit" size={17} color="#0EA5E9" /></Pressable><ChannelSwitch value={active} onValueChange={(value) => floatToggleChannel(account, channel, value)} isRTL={isRTL} color={active ? colors.success : colors.warning} inactiveColor="#334155" disabled={channel.isActive === false && soleActive} accessibilityLabel={`${language === "ar" ? "تفعيل" : "Enable"} ${channel.kind}`} /></View></View>;
  };
  const renderFloatChannelGroup = (account: StaffFloatAccount, kind: "cliq" | "bank") => {
    const rows = (account.channels ?? []).filter((c) => c.kind === kind);
    const tint = "#0EA5E9";
    const meta = kind === "cliq" ? { title: language === "ar" ? "الحوالة البنكية عبر CliQ" : "CliQ transfer", sub: language === "ar" ? "كليك للتحويل الفوري" : "Instant CliQ transfers" } : { title: language === "ar" ? "الحوالة البنكية (IBAN)" : "Bank transfer (IBAN)", sub: language === "ar" ? "تحويل بنكي محلي ودولي" : "Local & international transfers" };
    return <View style={[styles.channelCard, { backgroundColor: colors.background, borderColor: colors.border }]}>{renderGroupHeader(kind === "cliq" ? "bolt" : "account-balance", tint, meta.title, meta.sub, kind === "cliq" ? (language === "ar" ? "+ إضافة حساب CliQ" : "+ Add CliQ account") : (language === "ar" ? "+ إضافة حساب بنكي" : "+ Add bank account"), () => openFloatAddChannel(account, kind))}{rows.length ? rows.map((channel) => renderFloatChannelRow(account, channel)) : <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8, textAlign: align, opacity: 0.85 }}>{language === "ar" ? "لا توجد قنوات في هذه النقطة بعد — استخدم زر الإضافة." : "No channels yet at this point — use the add button."}</Text>}</View>;
  };
  const pickRowDefault = (selectedKey: string) => {
    const clear = (current: OwnerRow[]) => current.map((item) => ({ ...item, isDefault: item.key === selectedKey }));
    setOwnerCliqRows((current) => clear(current));
    setOwnerBankRows((current) => clear(current));
    setOwnerVaultRows((current) => clear(current));
    setOwnerOtherRows((current) => clear(current));
    setFloatCliqRows((current) => clear(current));
    setFloatBankRows((current) => clear(current));
  };

  const ownerRowEditor = (group: "cliq" | "bank" | "vault" | "other", source: "owner" | "float") => {
    const ownerMode = source === "owner";
    const rows = ownerMode ? (group === "cliq" ? ownerCliqRows : group === "bank" ? ownerBankRows : group === "vault" ? ownerVaultRows : ownerOtherRows) : (group === "cliq" ? floatCliqRows : floatBankRows);
    const setRows = ownerMode ? (group === "cliq" ? setOwnerCliqRows : group === "bank" ? setOwnerBankRows : group === "vault" ? setOwnerVaultRows : setOwnerOtherRows) : (group === "cliq" ? setFloatCliqRows : setFloatBankRows);
    const addRow = () => setRows((current) => [...current, { ...emptyOwnerRow(group), isActive: current.some((row) => row.isActive !== false) }]);
    const setField = (key: string, patch: Partial<OwnerRow>) => { setRowErrors((prev) => { if (!prev[key]) return prev; const next = { ...prev }; delete next[key]; return next; }); setRedFields((prev) => { if (prev.size === 0) return prev; const next = new Set(prev); (Object.keys(patch) as (keyof OwnerRow)[]).forEach((field) => { next.delete(`row:${group}:${key}:${field}`); }); return next.size === prev.size ? prev : next; }); setRows((current) => current.map((entry) => entry.key === key ? { ...entry, ...patch } : entry)); };
    return rows.map((item, index) => { const active = item.isActive !== false; const ready = active && isChannelRowComplete(group, item);
      const title = group === "cliq" ? (language === "ar" ? `حساب CliQ #${index + 1}` : `CliQ account #${index + 1}`) : group === "bank" ? (language === "ar" ? `الحساب البنكي #${index + 1}` : `Bank account #${index + 1}`) : group === "vault" ? (language === "ar" ? "خزينة الكاش" : "Cash vault") : (language === "ar" ? `طريقة أخرى #${index + 1}` : `Other method #${index + 1}`);
      const fields = group === "cliq" ? [{ key: "detail" as const, mono: true, label: language === "ar" ? "الاسم المستعار أو رقم الموبايل" : "Alias / mobile number", placeholder: language === "ar" ? "مثال: STAYIN01 أو 0791234567" : "e.g. STAYIN01 or 0791234567" }, { key: "provider" as const, mono: false, label: language === "ar" ? "اسم البنك أو المحفظة" : "Bank / wallet provider", placeholder: language === "ar" ? "مثال: بنك الإسكان، أورنج موني، كابيتال بنك" : "e.g. Housing Bank, Orange Money, Capital Bank" }, { key: "holderName" as const, mono: false, label: language === "ar" ? "اسم المستلم / صاحب الحساب كما يظهر للعميل" : "Displayed account holder name", placeholder: language === "ar" ? "مثال: شركة ملاذ لإدارة العقارات أو محمد عجلوني" : "e.g. Malath Properties Co. or Mohammed Ajlouni" }] : group === "bank" ? [{ key: "provider" as const, mono: false, label: language === "ar" ? "اسم البنك" : "Bank name", placeholder: language === "ar" ? "مثال: بنك الاتحاد، البنك العربي" : "e.g. Union Bank, Arab Bank" }, { key: "holderName" as const, mono: false, label: language === "ar" ? "اسم صاحب الحساب المستلم" : "Account holder name", placeholder: language === "ar" ? "الاسم الرسمي المعتمد في البنك" : "Official name registered at the bank" }, { key: "iban" as const, mono: true, label: language === "ar" ? "رقم الآيبان الدولي (IBAN) / رقم الحساب" : "International IBAN / account number", placeholder: "JO000000000000000000000000" }] : group === "other" ? [{ key: "label" as const, mono: false, label: language === "ar" ? "اسم الجهاز / الطريقة" : "Device / method name", placeholder: language === "ar" ? "مثال: جهاز POS أو محفظة بنكية" : "e.g. POS terminal or bank wallet" }, { key: "detail" as const, mono: false, label: language === "ar" ? "وصف إضافي (اختياري)" : "Extra description (optional)", placeholder: language === "ar" ? "مثال: جهاز POS المخصص للاستقبال" : "e.g. POS device at reception" }] : [{ key: "label" as const, mono: false, label: language === "ar" ? "اسم خزينة الكاش" : "Cash vault label", placeholder: language === "ar" ? "مثال: كاش الخزينة الرئيسية" : "e.g. Main cash vault" }, { key: "detail" as const, mono: false, label: language === "ar" ? "وصف الخزينة (اختياري)" : "Vault description (optional)", placeholder: language === "ar" ? "مثال: خزينة الاستقبال الرئيسية" : "e.g. Main reception vault" }];
      return <View key={item.key} onLayout={(event) => { layoutY.current["row-" + item.key] = event.nativeEvent.layout.y; }} style={[styles.rowSubCard, { backgroundColor: colors.surfaceMuted + "66", borderColor: colors.border, marginTop: index === 0 ? 0 : 8 }]}>
        <View style={[styles.rowSubHead, { flexDirection: row, gap: 8 }]}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>{title}</Text>{ready ? renderStatusPill(language === "ar" ? "✓ مفعّل وجاهز" : "✓ Active", colors.success, "check-circle") : !active ? renderStatusPill(language === "ar" ? "معطّل" : "Inactive", colors.warning) : renderStatusPill(language === "ar" ? "⚠️ بانتظار استكمال البيانات" : "⚠️ Awaiting data completion", "#F59E0B")}<View style={styles.flex} /></View>
        {fields.map((field) => <View key={field.key}><Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{field.label}</Text><TextInput value={item[field.key]} onChangeText={(text) => setField(item.key, { [field.key]: text } as Partial<OwnerRow>)} maxLength={field.key === "iban" ? 40 : field.key === "detail" ? 200 : 60} placeholder={field.placeholder} placeholderTextColor={colors.muted} style={[styles.input, field.mono ? styles.inputMono : null, { backgroundColor: redFields.has(`row:${group}:${item.key}:${field.key}`) || missingRed.has(`row:${group}:${item.key}:${field.key}`) ? colors.error + "1A" : colors.background, borderColor: redFields.has(`row:${group}:${item.key}:${field.key}`) || missingRed.has(`row:${group}:${item.key}:${field.key}`) ? colors.error : colors.border, color: colors.foreground, textAlign: align }]} /></View>)}
        {rowErrors[item.key] ? <Text style={[styles.accountLabel, { color: colors.error, marginTop: 6 }]}>{rowErrors[item.key]}</Text> : null}
        <View style={[styles.subToolbar, { borderTopColor: colors.border }]}>{rows.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`${language === "ar" ? "حذف الحساب" : "Remove account"}`} onPress={() => setRows((current) => current.filter((entry) => entry.key !== item.key))} style={({ pressed }) => [styles.subToolbarTrash, { backgroundColor: colors.error + "10", borderColor: colors.error + "45", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="delete-outline" size={16} color={colors.error} /></Pressable> : null}<View style={styles.flex} /><View style={styles.subToolbarPills}>{group !== "vault" ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.whatsApp, disabled: !active }} onPress={() => { if (!active) { showToast(language === "ar" ? "يجب تفعيل الحساب أولاً لتضمينه في الرسائل" : "Activate the account first to include it in messages"); return; } setField(item.key, { whatsApp: !item.whatsApp }); pushAudit("whatsapp", rowTargetLabel(item), language === "ar" ? `تعديل التضمين في قوالب الواتساب ${item.whatsApp ? "— إيقاف التفعيل في قوالب الواتساب" : "— تفعيل الظهور في قوالب الواتساب"}` : `WhatsApp template membership ${item.whatsApp ? "— disabled in WhatsApp templates" : "— enabled in WhatsApp templates"}`); }} style={({ pressed }) => [styles.rowDefaultPill, { borderColor: item.whatsApp ? "#25D366" : colors.border, backgroundColor: item.whatsApp ? "#25D366" + "14" : "transparent", opacity: active ? (pressed ? 0.7 : 1) : 0.5, flexDirection: row, marginTop: 0 }]}><MaterialIcons name={item.whatsApp ? "check-box" : "check-box-outline-blank"} size={13} color={active ? (item.whatsApp ? "#25D366" : colors.muted) : colors.muted} /><Text style={{ color: active ? (item.whatsApp ? "#25D366" : colors.muted) : colors.muted, fontSize: 10.5, fontWeight: "800" }}>{language === "ar" ? "الظهور في قوالب الرسائل (واتساب)" : "Show in WhatsApp templates"}</Text></Pressable> : null}<Pressable accessibilityRole="radio" accessibilityState={{ checked: item.isDefault }} onPress={() => { if (item.isDefault) { setRows((current) => current.map((entry) => entry.key === item.key ? { ...entry, isDefault: false } : entry)); pushAudit("default", rowTargetLabel(item), language === "ar" ? "إلغاء التعيين الافتراضي" : "Unset as default"); showToast(ownerMode ? (language === "ar" ? "✓ تم إرجاع الحساب الافتراضي إلى حساب المالك الأساسي" : "✓ Default reverted to the owner's baseline account") : (language === "ar" ? "تم إلغاء تعيين الافتراضي" : "Default unset")); } else { if (!active) { hintRow(item.key, language === "ar" ? "لا يمكن تعيينه افتراضيًا — يجب تفعيل الحساب وإكمال بياناته أولًا" : "Can't set as default — activate the account and complete its data first"); return; } pickRowDefault(item.key); pushAudit("default", rowTargetLabel(item), language === "ar" ? `تعيين الحساب كافتراضي لطريقة ${groupLabel(group)}` : `Set account as default for ${groupLabel(group)}`); } }} style={({ pressed }) => [styles.rowDefaultPill, { borderColor: item.isDefault ? colors.primary : colors.border, backgroundColor: item.isDefault ? colors.primary + "14" : "transparent", opacity: pressed ? 0.7 : 1, flexDirection: row, marginTop: 0 }]}><MaterialIcons name={item.isDefault ? "star" : "star-border"} size={13} color={item.isDefault ? colors.primary : colors.muted} /><Text style={{ color: item.isDefault ? colors.primary : colors.muted, fontSize: 10.5, fontWeight: "800" }}>{language === "ar" ? "تعيين كافتراضي ★" : "Set as default ★"}</Text></Pressable></View></View>
        {group !== "vault" && index === rows.length - 1 ? <RipplePressable rippleColor={colors.primary + "22"} onPress={addRow} style={({ pressed }) => [styles.addRowButton, { borderColor: colors.primary + "66", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="add" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: "800" }}>{group === "cliq" ? (language === "ar" ? "+ إضافة حساب CliQ آخر" : "+ Add another CliQ account") : group === "bank" ? (language === "ar" ? "+ إضافة حساب بنكي آخر" : "+ Add another bank account") : (language === "ar" ? "+ إضافة طريقة أخرى" : "+ Add another custom method")}</Text></RipplePressable> : null}
      </View>;
    });
  };
  const channelTint = (group: "cliq" | "bank" | "vault" | "cash" | "other", source: "owner" | "float") => {
    const activeComplete = (rows: OwnerRow[]) => { const active = rows.filter((row) => row.isActive !== false); if (!active.length) return { state: "off" as const, color: "#334155" }; return active.every((row) => isChannelRowComplete(row.kind, row)) ? { state: "complete" as const, color: "#10B981" } : { state: "draft" as const, color: "#F59E0B" }; };
    if (group === "cash") {
      if (source === "owner") return activeComplete(ownerVaultRows);
      if (!floatDraft.isActive) return { state: "off" as const, color: "#334155" };
      if (floatDraft.ceiling.trim()) { const n = Number(floatDraft.ceiling); if (!Number.isFinite(n) || n < 0) return { state: "draft" as const, color: "#F59E0B" }; }
      return { state: "complete" as const, color: "#10B981" };
    }
    if (group === "other") return source === "owner" ? activeComplete(ownerOtherRows) : (floatDraft.hasOther ? (floatDraft.otherNote.trim() ? { state: "complete" as const, color: "#10B981" } : { state: "draft" as const, color: "#F59E0B" }) : { state: "off" as const, color: "#334155" });
    if (group === "vault") return activeComplete(ownerVaultRows);
    const rows = source === "owner" ? (group === "cliq" ? ownerCliqRows : ownerBankRows) : (group === "cliq" ? floatCliqRows : floatBankRows);
    return activeComplete(rows);
  };
  const renderChannelState = (state: "off" | "draft" | "complete") => state === "off" ? null : renderStatusPill(state === "complete" ? (language === "ar" ? "✓ مكتمل ومفعّل" : "✓ Complete & active") : (language === "ar" ? "⚠️ بانتظار استكمال البيانات" : "⚠️ Awaiting data completion"), state === "complete" ? colors.success : "#F59E0B");
  const ownerChannelSection = (group: "cliq" | "bank" | "vault" | "other") => {
    const rows = group === "cliq" ? ownerCliqRows : group === "bank" ? ownerBankRows : group === "vault" ? ownerVaultRows : ownerOtherRows;
    const on = rows.some((row) => row.isActive !== false);
    const meta = group === "cliq" ? { icon: "bolt" as const, title: language === "ar" ? "الحوالة البنكية عبر CliQ" : "CliQ transfer", sub: language === "ar" ? "كليك للتحويل الفوري" : "Instant CliQ transfers" } : group === "bank" ? { icon: "account-balance" as const, title: language === "ar" ? "الحوالة البنكية (IBAN)" : "Bank transfer (IBAN)", sub: language === "ar" ? "تحويل بنكي محلي ودولي" : "Local & international transfers" } : group === "other" ? { icon: "point-of-sale" as const, title: language === "ar" ? "الدفع الإلكتروني والبطاقات" : "Cards & e-payment", sub: language === "ar" ? "Visa / POS / محافظ إلكترونية (أخرى)" : "Visa / POS / e-wallets (other)" } : { icon: "payments" as const, title: language === "ar" ? "النقد (Cash)" : "Cash", sub: language === "ar" ? "استلام نقدي في الموقع" : "Receive physical cash" };
    const setOn = (next: boolean) => {
      const apply = (current: OwnerRow[]) => current.length ? current.map((row) => ({ ...row, isActive: next })) : (next ? [{ ...emptyOwnerRow(group), isActive: true }] : []);
      if (group === "cliq") setOwnerCliqRows(apply);
      else if (group === "bank") setOwnerBankRows(apply);
      else if (group === "vault") setOwnerVaultRows(apply);
      else setOwnerOtherRows(apply);
    };
    const tint = channelTint(group, "owner");
    return <View onLayout={(event) => { layoutY.current["sec-" + group] = event.nativeEvent.layout.y; }} style={[styles.channelCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" onPress={() => toggleOpenChannel(group)} style={[styles.channelHead, { flexDirection: row }]}><MaterialIcons name={meta.icon} size={19} color={colors.primary} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{meta.title}</Text><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 1, textAlign: align }}>{meta.sub}</Text>{on ? renderChannelState(tint.state) : null}</View><ChannelSwitch value={on} onValueChange={setOn} isRTL={isRTL} color={tint.color} inactiveColor="#334155" ring={tint.state === "complete" ? "#34D39980" : tint.state === "draft" ? "#FBBF2480" : undefined} accessibilityLabel={`${language === "ar" ? "تفعيل" : "Enable"} ${meta.title}`} /><MaterialIcons name={openChannels[group] ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={21} color={colors.muted} /></Pressable>
      {on && openChannels[group] ? <View>{ownerRowEditor(group, "owner")}</View> : null}
    </View>;
  };

  const floatChannelSection = (group: "cash" | "cliq" | "bank" | "other") => {
  if (group === "cash") { const cashTint = channelTint("cash", "float"); return <View onLayout={(event) => { layoutY.current["sec-cash"] = event.nativeEvent.layout.y; }} style={[styles.channelCard, { backgroundColor: colors.background, borderColor: colors.border }]}><View style={[styles.channelHead, { flexDirection: row }]}><MaterialIcons name="payments" size={19} color="#0EA5E9" /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "النقد (Cash)" : "Cash"}</Text><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 1, textAlign: align }}>{language === "ar" ? "استلام نقدي في الموقع" : "Receive physical cash"}</Text>{floatDraft.isActive ? renderChannelState(cashTint.state) : null}</View><ChannelSwitch value={floatDraft.isActive} onValueChange={(value) => setFloatDraft((draft) => ({ ...draft, isActive: value }))} isRTL={isRTL} color={cashTint.color} inactiveColor="#334155" ring={cashTint.state === "complete" ? "#34D39980" : cashTint.state === "draft" ? "#FBBF2480" : undefined} accessibilityLabel={`${language === "ar" ? "تفعيل النقد" : "Enable cash"}`} /></View></View>; }
  if (group === "other") {
    const on = floatDraft.hasOther;
    const tint = channelTint("other", "float");
    return <View onLayout={(event) => { layoutY.current["sec-other"] = event.nativeEvent.layout.y; }} style={[styles.channelCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" onPress={() => toggleOpenChannel("other")} style={[styles.channelHead, { flexDirection: row }]}><MaterialIcons name="point-of-sale" size={19} color="#0EA5E9" /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "أخرى (Other)" : "Other"}</Text><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 1, textAlign: align }}>{language === "ar" ? "أجهزة POS أو محافظ ثانوية" : "POS terminals or secondary wallets"}</Text>{on ? renderChannelState(tint.state) : null}</View><ChannelSwitch value={on} onValueChange={(value) => patchDraft({ hasOther: value })} isRTL={isRTL} color={tint.color} inactiveColor="#334155" ring={tint.state === "complete" ? "#34D39980" : tint.state === "draft" ? "#FBBF2480" : undefined} accessibilityLabel={`${language === "ar" ? "تفعيل" : "Enable"} ${language === "ar" ? "أخرى (Other)" : "Other"}`} /><MaterialIcons name={openChannels.other ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={21} color={colors.muted} /></Pressable>
      {on && openChannels.other ? <View><Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "وصف القناة الأخرى" : "Custom channel description"}</Text><TextInput value={floatDraft.otherNote} onChangeText={(text) => patchDraft({ otherNote: text })} maxLength={240} placeholder={language === "ar" ? "مثال: جهاز POS أو محفظة ثانوية" : "Example: POS terminal or secondary wallet"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: redFields.has("ident:otherNote") || missingRed.has("ident:otherNote") ? colors.error + "1A" : colors.background, borderColor: redFields.has("ident:otherNote") || missingRed.has("ident:otherNote") ? colors.error : colors.border, color: colors.foreground, textAlign: align }]} /></View> : null}
    </View>;
  }
  const rows = group === "cliq" ? floatCliqRows : floatBankRows;
  const meta = group === "cliq" ? { icon: "bolt" as const, title: language === "ar" ? "الحوالة البنكية عبر CliQ" : "CliQ transfer", sub: language === "ar" ? "كليك للتحويل الفوري" : "Instant CliQ transfers" } : { icon: "account-balance" as const, title: language === "ar" ? "الحوالة البنكية (IBAN)" : "Bank transfer (IBAN)", sub: language === "ar" ? "تحويل بنكي محلي ودولي" : "Local & international transfers" };
  const on = rows.some((row) => row.isActive !== false);
  const setOn = (next: boolean) => { const apply = (current: OwnerRow[]) => current.length ? current.map((row) => ({ ...row, isActive: next })) : (next ? [{ ...emptyOwnerRow(group), isActive: true }] : []); if (group === "cliq") setFloatCliqRows(apply); else setFloatBankRows(apply); };
  const tint = channelTint(group, "float");
  return <View onLayout={(event) => { layoutY.current["sec-" + group] = event.nativeEvent.layout.y; }} style={[styles.channelCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
    <Pressable accessibilityRole="button" onPress={() => toggleOpenChannel(group)} style={[styles.channelHead, { flexDirection: row }]}><MaterialIcons name={meta.icon} size={19} color="#0EA5E9" /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{meta.title}</Text><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 1, textAlign: align }}>{meta.sub}</Text>{on ? renderChannelState(tint.state) : null}</View><ChannelSwitch value={on} onValueChange={setOn} isRTL={isRTL} color={tint.color} inactiveColor="#334155" ring={tint.state === "complete" ? "#34D39980" : tint.state === "draft" ? "#FBBF2480" : undefined} accessibilityLabel={`${language === "ar" ? "تفعيل" : "Enable"} ${meta.title}`} /><MaterialIcons name={openChannels[group] ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={21} color={colors.muted} /></Pressable>
    {on && openChannels[group] ? <View>{ownerRowEditor(group, "float")}</View> : null}
  </View>;
};
  const patchDraft = (patch: Partial<FloatDraft>) => { setRedFields((prev) => { if (prev.size === 0) return prev; const next = new Set(prev); (Object.keys(patch) as (keyof FloatDraft)[]).forEach((field) => { if (field === "label" || field === "phone" || field === "ceiling" || field === "otherNote") next.delete(`ident:${field}`); }); return next.size === prev.size ? prev : next; }); setFloatDraft((draft) => ({ ...draft, ...patch })); };
  const floatVerifiedMember = (() => { const query = floatDraft.uid.trim().toLocaleLowerCase(); if (!query) return null; return selectableMembers.find((member) => member.userCode && member.userCode.trim().toLocaleLowerCase() === query) ?? null; })();
  const onbookAccent = "#0EA5E9";
  const onbookQuery = onbookSearch.trim().toLocaleLowerCase();
  const filteredOnbook = onbookQuery ? onbookStaff.filter((entry) => entry.name.toLocaleLowerCase().includes(onbookQuery) || entry.phone.includes(onbookQuery) || entry.uid.toLocaleLowerCase().includes(onbookQuery)) : onbookStaff;

  const pickEntity = (entity: "owner" | "staff" | "guard") => {
    setUnifiedEntity(entity);
    const ownerEmpty = ownerCliqRows.length + ownerBankRows.length + ownerVaultRows.length + ownerOtherRows.length === 0;
    const floatDraftEmpty = !floatDraft.id && !floatDraft.label.trim() && !floatDraft.phone.trim() && floatCliqRows.length === 0 && floatBankRows.length === 0;
    if (entity === "owner") {
      setOpenChannels({ cliq: false, bank: false, cash: false, other: false });
      if (ownerEmpty) { setOwnerCliqRows([]); setOwnerVaultRows([]); setOwnerBankRows([]); setOwnerOtherRows([]); setEditingAccountId(null); }
    } else {
      setOpenChannels({ cliq: false, bank: false, cash: false, other: false });
      if (floatDraftEmpty) setFloatDraft(emptyFloatDraft(entity === "guard" ? "guard" : "staff"));
      else if (floatDraft.entity && floatDraft.entity !== entity) setFloatDraft((draft) => ({ ...draft, entity }));
    }
  };

  const isOwnerEdit = Boolean(ownerCliqRows[0]?.id || ownerBankRows[0]?.id || ownerVaultRows[0]?.id || ownerOtherRows[0]?.id);
  const isFloatEdit = Boolean(floatDraft.id);
  const modalTitle = unifiedEntity === "owner" ? (isOwnerEdit ? (language === "ar" ? "تعديل حساب الخزينة" : "Edit treasury account") : (language === "ar" ? "إضافة حساب خزينة" : "Add treasury account")) : (isFloatEdit ? (language === "ar" ? "تعديل نقطة تحصيل موظف" : "Edit staff collection point") : floatDraft.entity === "guard" ? (language === "ar" ? "إضافة نقطة تحصيل حارس" : "Add guard collection point") : (language === "ar" ? "إضافة نقطة تحصيل موظف" : "Add staff collection point"));

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <SubScreenHeader title={language === "ar" ? "إدارة طرق الدفع" : "Payment methods"} fallbackHref="/(tabs)/more" />
    {canViewPaymentAudit ? <RipplePressable rippleColor={colors.primary + "18"} onPress={openAudit} style={({ pressed }) => [styles.auditAction, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "55", opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="history" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900" }}>{language === "ar" ? "سجل تعديلات الحسابات 📋" : "Account change log 📋"}</Text></RipplePressable> : null}
    <View style={[styles.info, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "45", flexDirection: row }]}><MaterialIcons name="info-outline" size={20} color={colors.primary} /><Text style={[styles.flex, { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: align }]}>{language === "ar" ? "تظهر الطرق المفعلة فقط في العربون والتأمين. حدّد وجهة التحصيل الافتراضية لكل طريقة، ثم اختر الحساب الفعلي من نموذج الحجز." : "Only active methods appear for new collections. Choose each method's default recipient, then select the actual account in the booking form."}</Text></View>

    <View style={[styles.sectionHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "حسابات الخزينة والمالك المباشرة" : "Owner treasury & direct accounts"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "حسابات الخزينة المركزية وحسابات المالك الرئيسية — تستقر الدفعات المباشرة هنا" : "Central treasury & master owner accounts — direct payments settle here"}</Text></View></View>
<View style={[styles.treasuryBody, { backgroundColor: colors.surface, borderColor: colors.border }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "توسيع الخزينة المركزية" : "Expand central treasury"} onPress={() => toggleExpanded("owner-parent")} style={[styles.channelRow, { backgroundColor: colors.background, borderColor: colors.border }]}><View style={[styles.channelRowHead, { flexDirection: cardRow, direction: "ltr" }]}><View style={[styles.channelIcon, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "35" }]}><MaterialIcons name="verified-user" size={20} color={colors.primary} /></View><View style={styles.flex}><View style={[styles.channelTitleRow, { flexDirection: row }]}><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: align }}>{language === "ar" ? "الخزينة المركزية" : "Central treasury"}</Text>{renderStatusPill(language === "ar" ? "المالك" : "Owner", colors.primary)}{ownerAccounts.length ? renderStatusPill(language === "ar" ? `${ownerAccounts.length} ${ownerAccounts.length === 1 ? "حساب مسجل" : "حسابات مسجلة"}` : `${ownerAccounts.length} registered account${ownerAccounts.length === 1 ? "" : "s"}`, colors.muted) : null}{activeOwnerCount > 0 ? renderStatusPill(language === "ar" ? "✓ مفعّل وجاهز" : "✓ Active", colors.success, "check-circle") : ownerAccounts.length ? renderStatusPill(language === "ar" ? "موقوف" : "Paused", colors.warning, "pause-circle") : null}</View>{ownerAccounts.length ? <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10.5, fontWeight: "700", marginTop: 3, textAlign: align, fontFamily: MONO_FONT }}>{ownerDetailLabel(ownerAccounts.find((item) => item.isDefault === true) ?? ownerAccounts.find((item) => item.isActive !== false) ?? ownerAccounts[0])}</Text> : null}</View>{ownerAccounts.length ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تعديل حساب الخزينة" : "Edit treasury account"} onPress={() => openOwnerEdit(ownerAccounts.find((item) => item.isDefault === true) ?? ownerAccounts.find((item) => item.isActive !== false) ?? ownerAccounts[0])} style={({ pressed }) => [styles.iconButton, { borderColor: colors.primary + "55", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="edit" size={17} color={colors.primary} /></Pressable> : null}<MaterialIcons name={expandedIds.has("owner-parent") ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={21} color={colors.muted} /></View></Pressable>{expandedIds.has("owner-parent") ? <View style={[styles.badge, { backgroundColor: colors.primary + "0F", borderColor: colors.success + "3A", flexDirection: row }]}><MaterialIcons name="verified-user" size={17} color={colors.success} /><Text style={[styles.flex, { color: colors.muted, fontSize: 11.5, lineHeight: 18, fontWeight: "700", textAlign: align }]}>{language === "ar" ? "تستقر الدفعات مباشرة في إيرادات الخزينة العامة للمنشأة" : "Funds settle directly into the business general treasury"}</Text></View> : null}{expandedIds.has("owner-parent") ? <View style={styles.list}>{renderOwnerGroup("vault")}{renderOwnerGroup("cliq")}{renderOwnerGroup("bank")}{renderOwnerGroup("other")}</View> : null}</View>

    <View style={[styles.sectionHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "صناديق عُهد الموظفين والحراس الميدانية" : "Staff & guard field custody vaults"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "العُهد الميدانية وقنوات الاستلام المعتمدة للفريق" : "Field custody points and approved team channels"}</Text></View>{canManage ? <RipplePressable rippleColor={colors.background + "3D"} onPress={openFloatCreate} style={({ pressed }) => [styles.headerAction, { backgroundColor: colors.primary, opacity: pressed ? 0.72 : 1, flexDirection: row }]}><MaterialIcons name="add" size={16} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "+ إضافة صندوق عهدة وتحصيل (موظف / حارس)" : "+ Add custody & collection vault (Staff / Guard)"}</Text></RipplePressable> : null}</View>

<View style={[styles.custodyCard, { backgroundColor: colors.surface, borderColor: "#0EA5E9" + "60" }]}><View style={[styles.badge, { backgroundColor: "#0EA5E9" + "0D", borderColor: "#0EA5E9" + "38", flexDirection: row }]}><MaterialIcons name="info-outline" size={17} color="#0284C7" /><Text style={[styles.flex, { color: colors.muted, fontSize: 11.5, lineHeight: 18, fontWeight: "700", textAlign: align }]}>{language === "ar" ? "المبالغ المستلمة هنا تُسجل كذمة مالية/عهدة معلقة على الموظف لحين التوريد والتسوية مع المالك" : "Funds received here are recorded as a liability/float due from the employee until handed over and settled with the owner"}</Text></View>{floats.length ? <View style={styles.list}>{floats.map((account) => { const isGuard = account.entity === "guard"; const floatIcon = isGuard ? "security" : "badge"; const floatTint = isGuard ? "#8B5CF6" : "#0EA5E9"; const floatId = "float-parent-" + account.id; const expanded = expandedIds.has(floatId); const cashChannels = Array.isArray(account.channels) ? account.channels.filter((c) => c.kind === "cliq") : []; const bankChannels = Array.isArray(account.channels) ? account.channels.filter((c) => c.kind === "bank") : []; const keyCount = (account.cashActive === true ? 1 : 0) + cashChannels.filter((c) => c.isActive !== false).length + bankChannels.filter((c) => c.isActive !== false).length + (account.hasOther ? 1 : 0); return <View key={account.id} style={[styles.floatParent, { backgroundColor: colors.background, borderColor: colors.border }]}><Pressable accessibilityRole="button" accessibilityLabel={`${language === "ar" ? "توسيع" : "Expand"} ${account.label}`} onPress={() => toggleExpanded(floatId)} style={{ width: "100%" }}><View style={[styles.channelRowHead, { flexDirection: cardRow, direction: "ltr" }]}><View style={[styles.channelIcon, { backgroundColor: floatTint + "14", borderColor: floatTint + "35" }]}><MaterialIcons name={floatIcon} size={20} color={floatTint} /></View><View style={styles.flex}><View style={[styles.channelTitleRow, { flexDirection: row }]}><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: align }}>{account.label}</Text>{renderStatusPill(isGuard ? (language === "ar" ? "حارس" : "Guard") : (language === "ar" ? "موظف" : "Staff"), floatTint)}{renderStatusPill(language === "ar" ? `${keyCount} ${keyCount === 1 ? "قناة مسجلة" : "قنوات مسجلة"}` : `${keyCount} registered channel${keyCount === 1 ? "" : "s"}`, colors.muted)}{!isFloatComplete(account) ? renderStatusPill(language === "ar" ? "⚠️ بيانات غير مكتملة" : "⚠️ Incomplete data", colors.warning) : account.isActive !== false ? renderStatusPill(language === "ar" ? "✓ مفعّل وجاهز" : "✓ Active", colors.success, "check-circle") : renderStatusPill(language === "ar" ? "موقوف" : "Paused", colors.warning, "pause-circle")}{account.isDefault ? renderStatusPill(language === "ar" ? "افتراضي" : "Default", colors.success, "star") : null}</View><Text numberOfLines={1} style={{ color: account.isActive !== false ? colors.muted : colors.warning, fontSize: 10.5, fontWeight: "700", marginTop: 3, textAlign: align, fontFamily: MONO_FONT }}>{[account.memberName ? `${language === "ar" ? "الموظف" : "Employee"}: ${account.memberName}` : "", account.contactPhone ? `${language === "ar" ? "الهاتف" : "Phone"}: ${account.contactPhone}` : "", account.maxFloatLimit !== undefined ? `${language === "ar" ? "سقف العهدة" : "Float ceiling"}: ${account.maxFloatLimit}` : ""].filter(Boolean).join(" · ")}</Text></View><ChannelSwitch value={account.isActive !== false} onValueChange={(value) => toggleFloatActive(account, value)} isRTL={isRTL} color={account.isActive !== false ? colors.success : colors.warning} inactiveColor="#334155" accessibilityLabel={`${language === "ar" ? "تفعيل" : "Enable"} ${account.label}`} /><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تعديل نقطة التحصيل" : "Edit collection point"} onPress={() => openFloatEdit(account)} style={({ pressed }) => [styles.iconButton, { borderColor: floatTint + "55", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="edit" size={17} color={floatTint} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حذف نقطة التحصيل" : "Remove collection point"} onPress={() => removeFloat(account)} style={({ pressed }) => [styles.iconButton, { borderColor: colors.error + "55", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="delete-outline" size={17} color={colors.error} /></Pressable><MaterialIcons name={expanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={21} color={colors.muted} /></View></Pressable>{expanded ? <View style={styles.list}>{renderFloatCashBlock(account)}{renderFloatChannelGroup(account, "cliq")}{renderFloatChannelGroup(account, "bank")}{renderFloatOtherBlock(account)}</View> : null}</View>; })}</View> : null}</View>
  </ScrollView>


    <Modal transparent visible={unifiedOpen} animationType="fade" onRequestClose={() => { setUnifiedOpen(false); setEditingAccountId(null); clearAuditHighlight(); }} statusBarTranslucent><View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => { setUnifiedOpen(false); setEditingAccountId(null); clearAuditHighlight(); }} /><View style={[styles.sheet, styles.unifiedSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.sheetHeader, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.foreground, fontSize: 18, fontWeight: "900", textAlign: align }]}>{modalTitle}</Text><Pressable accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={() => { setUnifiedOpen(false); setEditingAccountId(null); clearAuditHighlight(); }} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><View style={[styles.entityTabBar, { borderBottomColor: colors.border }]}><Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "جهة الحساب" : "Account entity"}</Text><View style={[styles.kindRow, { flexDirection: row }]}>{ENTITIES.map((choice) => <Pressable key={choice.id} accessibilityRole="button" accessibilityState={{ selected: unifiedEntity === choice.id }} onPress={() => pickEntity(choice.id)} style={({ pressed }) => [styles.kindChoice, { backgroundColor: unifiedEntity === choice.id ? colors.primary + "1A" : colors.background, borderColor: unifiedEntity === choice.id ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={choice.icon} size={19} color={unifiedEntity === choice.id ? colors.primary : colors.muted} /><Text style={{ color: unifiedEntity === choice.id ? colors.primary : colors.muted, fontSize: 10.5, fontWeight: "800", textAlign: "center" }}>{language === "ar" ? choice.ar : choice.en}</Text></Pressable>)}</View></View><ScrollView ref={sheetScrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 10 }}>
      
      {unifiedEntity === "owner" ? <View>
        <Text style={[styles.modalSectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "القنوات المتاحة" : "Available channels"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2, textAlign: align }}>{language === "ar" ? "فعّل كل قناة وأدخل بياناتها، ويمكن إضافة أكثر من بنك أو حساب CliQ واحد." : "Enable each channel with its details; you can add multiple banks or CliQ accounts."}</Text>
        {ownerChannelSection("vault")}{ownerChannelSection("cliq")}{ownerChannelSection("bank")}{ownerChannelSection("other")}
      </View> : <View>
        <View onLayout={(event) => { layoutY.current["sec-identity"] = event.nativeEvent.layout.y; }} style={[styles.identityCard, { backgroundColor: colors.surfaceMuted + "3A", borderColor: colors.border }]}><View style={[styles.bindingTabs, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityState={{ selected: floatDraft.binding === "app" }} onPress={() => patchDraft({ binding: "app" })} style={({ pressed }) => [styles.roleChip, { backgroundColor: floatDraft.binding === "app" ? colors.primary + "1A" : colors.background, borderColor: floatDraft.binding === "app" ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="smartphone" size={15} color={floatDraft.binding === "app" ? colors.primary : colors.muted} /><Text style={{ color: floatDraft.binding === "app" ? colors.primary : colors.muted, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? "مستخدم تطبيق (App)" : "App user"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ selected: floatDraft.binding === "onbook" }} onPress={() => patchDraft({ binding: "onbook" })} style={({ pressed }) => [styles.roleChip, { backgroundColor: floatDraft.binding === "onbook" ? onbookAccent + "18" : colors.background, borderColor: floatDraft.binding === "onbook" ? onbookAccent : colors.border, opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="badge" size={15} color={floatDraft.binding === "onbook" ? onbookAccent : colors.muted} /><Text style={{ color: floatDraft.binding === "onbook" ? onbookAccent : colors.muted, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? "منتسب على الكتاب (On-book)" : "On-book staff"}</Text></Pressable></View><View style={{ flexDirection: row, gap: 8 }}>{floatDraft.binding === "app" ? <View style={styles.flex}><Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "معرف المستخدم #UID (اختياري للبحث)" : "User #UID (optional for search)"}</Text><TextInput value={floatDraft.uid} onChangeText={(text) => { patchDraft({ uid: text }); const query = text.trim().toLocaleLowerCase(); const match = selectableMembers.find((member) => member.userCode && member.userCode.trim().toLocaleLowerCase() === query); if (match) patchDraft({ label: match.displayName, phone: match.phone ?? "" }); }} autoCapitalize="characters" autoCorrect={false} maxLength={40} placeholder={language === "ar" ? "مثال: U1024" : "e.g. U1024"} placeholderTextColor={colors.muted} style={[styles.input, styles.inputMono, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: "left" }]} /></View> : <View style={{ gap: 8 }}><TextInput value={onbookSearch} onChangeText={setOnbookSearch} autoCapitalize="none" autoCorrect={false} placeholder={language === "ar" ? "بحث بالاسم أو الهاتف أو #UID" : "Search by name, phone, or #UID"} placeholderTextColor={colors.muted} style={[styles.input, styles.inputMono, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: "left" }]} />{onbookQuery && filteredOnbook.length === 0 ? <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3, textAlign: align }}>{language === "ar" ? "لا يوجد منتسب مطابق. املأ الاسم والهاتف والحفظ سيُنشئ المنتسب تلقائيًا على الكتاب." : "No matching on-book member. Fill in the name and phone; saving auto-creates the member on the book."}</Text> : null}{filteredOnbook.slice(0, 4).map((entry) => { const active = floatDraft.onbookUid === entry.uid; return <Pressable key={entry.uid} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => { patchDraft({ label: floatDraft.label.trim() ? floatDraft.label : entry.name, phone: entry.phone, onbookUid: entry.uid }); setOnbookSearch(""); }} style={({ pressed }) => [styles.memberQuickRow, { backgroundColor: active ? onbookAccent + "1A" : colors.background, borderColor: active ? onbookAccent + "66" : colors.border, opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="badge" size={16} color={active ? onbookAccent : colors.muted} /><Text style={[styles.flex, { color: colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }]}>{entry.name}</Text><View style={{ alignItems: "flex-end" }}><Text style={{ color: onbookAccent, fontSize: 11, fontWeight: "900", writingDirection: "ltr" }}>{entry.uid}</Text><Text style={{ color: colors.muted, fontSize: 9.5, marginTop: 1 }}>{onbookRoleLabel(entry.role, language)} · {entry.phone}</Text></View>{active ? <MaterialIcons name="check-circle" size={17} color={onbookAccent} /> : null}</Pressable>; })}{onbookReady && onbookStaff.length === 0 ? <View style={[styles.verifyChip, { backgroundColor: onbookAccent + "0D", borderColor: onbookAccent + "38", flexDirection: row }]}><MaterialIcons name="badge" size={14} color={onbookAccent} /><Text style={[styles.flex, { color: colors.muted, fontSize: 10.5, lineHeight: 15, fontWeight: "700", textAlign: align }]}>{language === "ar" ? "لا يوجد منتسبون على الكتاب بعد — أضفهم من إدارة المستخدمين، أو احفظ هذه العهدة وسيُنشأ المنتسب تلقائيًا." : "No on-book staff yet — add them in User management, or save this float to auto-create the member."}</Text><Pressable accessibilityRole="button" onPress={() => router.push("/user-management")} style={({ pressed }) => [styles.memberQuickPick, { backgroundColor: onbookAccent, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="person-add" size={15} color={colors.background} /></Pressable></View> : null}{floatDraft.onbookUid ? <View style={[styles.verifyChip, { backgroundColor: onbookAccent + "12", borderColor: onbookAccent + "55", flexDirection: row }]}><MaterialIcons name="verified" size={13} color={onbookAccent} /><Text style={[styles.flex, { color: onbookAccent, fontSize: 10.5, fontWeight: "800", textAlign: align }]}>{language === "ar" ? `✓ مرتبط بالدليل المحلي: ${floatDraft.onbookUid}` : `✓ Linked to local directory: ${floatDraft.onbookUid}`}</Text></View> : null}</View>}<View style={styles.flex}><Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "رقم الهاتف للتواصل (إجباري)" : "Contact phone (required)"}</Text><TextInput value={floatDraft.phone} onChangeText={(text) => patchDraft({ phone: text })} keyboardType="phone-pad" maxLength={20} placeholder="07XXXXXXXX" placeholderTextColor={colors.muted} style={[styles.input, styles.inputMono, { backgroundColor: redFields.has("ident:phone") || missingRed.has("ident:phone") ? "#4C051933" : colors.background, borderColor: redFields.has("ident:phone") || missingRed.has("ident:phone") ? "#F43F5E" : colors.border, color: colors.foreground, textAlign: "left" }]} /></View></View>{floatDraft.binding === "app" && selectableMembers.length ? <View style={{ marginTop: 10, gap: 6 }}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textAlign: align }}>{language === "ar" ? "اختيار سريع من أعضاء التطبيق:" : "Quick pick from app members:"}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{selectableMembers.slice(0, 8).map((member) => { const active = (floatDraft.uid.trim().toLocaleLowerCase()) === (member.userCode ?? "").trim().toLocaleLowerCase(); return <Pressable key={member.userId} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => patchDraft({ uid: member.userCode ?? "", label: member.displayName, phone: member.phone ?? "" })} style={({ pressed }) => [styles.roleChip, { backgroundColor: active ? colors.primary + "1A" : colors.background, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="smartphone" size={14} color={active ? colors.primary : colors.muted} /><Text style={{ color: active ? colors.primary : colors.muted, fontSize: 10.5, fontWeight: "800" }}>{member.displayName}</Text><Text style={{ color: active ? colors.primary : colors.muted, fontSize: 9, fontWeight: "900", writingDirection: "ltr" }}>{member.userCode ?? ""}</Text></Pressable>; })}</ScrollView></View> : null}{floatVerifiedMember ? <View style={[styles.verifyChip, { backgroundColor: colors.success + "12", borderColor: colors.success + "45" }]}><MaterialIcons name="verified" size={13} color={colors.success} /><Text style={[styles.flex, { color: colors.success, fontSize: 11, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "✓ موظف موثق: " + floatVerifiedMember.displayName + " - " + (floatVerifiedMember.phone ?? "-") : "✓ Verified employee: " + floatVerifiedMember.displayName + " - " + (floatVerifiedMember.phone ?? "-")}</Text></View> : <View style={[styles.verifyChip, { backgroundColor: colors.surfaceMuted + "66", borderColor: colors.border }]}><MaterialIcons name="person-search" size={13} color={colors.muted} /><Text style={[styles.flex, { color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: align }]}>{language === "ar" ? "يرجى كتابة الاسم أدناه يدويًا" : "Please type the name manually below"}</Text></View>}<Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "اسم المستلم / النقطة (إجباري)" : "Recipient / collection-point name (required)"}</Text><TextInput value={floatDraft.label} onChangeText={(text) => patchDraft({ label: text })} maxLength={120} autoFocus placeholder={language === "ar" ? "مثال: كاش الحارس أحمد، كليك المحاسب" : "Example: guard Ahmed's cash, accountant's CliQ"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: redFields.has("ident:label") || missingRed.has("ident:label") ? "#4C051933" : colors.background, borderColor: redFields.has("ident:label") || missingRed.has("ident:label") ? "#F43F5E" : colors.border, color: colors.foreground, textAlign: align }]} /></View>
        <Text style={[styles.modalSectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "القنوات المتاحة" : "Available channels"}</Text>
        {floatChannelSection("cash")}{floatChannelSection("cliq")}{floatChannelSection("bank")}{floatChannelSection("other")}
        <Text style={[styles.modalSectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "الحدود والتحكم التشغيلي" : "Limits & operational controls"}</Text>
        <Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "الحد الأقصى للعهدة النقدية" : "Maximum cash float ceiling"}</Text><TextInput accessibilityLabel={language === "ar" ? "الحد الأقصى المسموح للعهدة النقدية" : "Maximum allowed float ceiling"} value={floatDraft.ceiling} onChangeText={(text) => patchDraft({ ceiling: text })} keyboardType="decimal-pad" placeholder={language === "ar" ? "مثال: 300 د.أ" : "Example: 300"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: redFields.has("ident:ceiling") || missingRed.has("ident:ceiling") ? colors.error + "1A" : colors.background, borderColor: redFields.has("ident:ceiling") || missingRed.has("ident:ceiling") ? colors.error : colors.border, color: colors.foreground, textAlign: align }]} /><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 5, textAlign: align }}>{language === "ar" ? "لتنبيه النظام عند تجاوز مبالغ الكاش المستلمة لدى هذا المستلم." : "System alerts when cash collected by this point exceeds the ceiling."}</Text>
        <View style={[styles.toggleRow, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: row, marginTop: 13 }]}><MaterialIcons name="payments" size={17} color="#8B5CF6" /><Text style={[styles.flex, { color: colors.foreground, fontSize: 12.5, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "عمولة تحفيزية للموظف على تحصيلاته" : "Staff incentive commission on collections"}</Text><AppToggle value={floatDraft.isCommissionEnabled} onValueChange={(value) => patchDraft({ isCommissionEnabled: value })} isRTL={isRTL} activeColor="#8B5CF6" inactiveColor={colors.border} accessibilityLabel={`${language === "ar" ? "عمولة تحفيزية للموظف" : "Staff incentive commission"}`} /></View>
        {floatDraft.isCommissionEnabled ? <View style={[{ backgroundColor: colors.background, borderColor: "#8B5CF6" + "45", borderRadius: 13, borderWidth: 1, padding: 11, marginTop: 9 }]}><Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "نوع العمولة" : "Commission type"}</Text><View style={[styles.kindRow, { flexDirection: row, marginTop: 7 }]}>{[["FIXED_PER_BOOKING", language === "ar" ? "مبلغ ثابت لكل حجز" : "Fixed per booking"], ["PERCENTAGE_OF_TOTAL", language === "ar" ? "نسبة من إجمالي التحصيل" : "% of total collected"]].map(([value, caption]) => { const selected = floatDraft.commissionType === value; return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => patchDraft({ commissionType: value as "FIXED_PER_BOOKING" | "PERCENTAGE_OF_TOTAL" })} style={({ pressed }) => [styles.kindChoice, { minHeight: 52, backgroundColor: selected ? "#8B5CF6" + "1A" : colors.surfaceMuted + "3A", borderColor: selected ? "#8B5CF6" : colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: selected ? "#8B5CF6" : colors.muted, fontSize: 11, fontWeight: "800", textAlign: "center" }}>{caption}</Text></Pressable>; })}</View><Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align, marginTop: 10 }]}>{language === "ar" ? (floatDraft.commissionType === "FIXED_PER_BOOKING" ? "قيمة العمولة لكل حجز محصَّل عبر العهدة" : "نسبة العمولة (%) من إجمالي التحصيل") : (floatDraft.commissionType === "FIXED_PER_BOOKING" ? "Commission amount per booking collected on this float" : "Commission percentage (%) of total collected")}</Text><TextInput accessibilityLabel={language === "ar" ? "قيمة العمولة" : "Commission value"} value={floatDraft.commissionValue} onChangeText={(text) => patchDraft({ commissionValue: text })} keyboardType="decimal-pad" placeholder={floatDraft.commissionType === "FIXED_PER_BOOKING" ? "10" : "5"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: redFields.has("ident:commission") || missingRed.has("ident:commission") ? colors.error + "1A" : colors.background, borderColor: redFields.has("ident:commission") || missingRed.has("ident:commission") ? colors.error : colors.border, color: colors.foreground, textAlign: align }]} /><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 5, textAlign: align }}>{language === "ar" ? "تُخصم العمولات المستحقة من صافي التوريد وتظهر في كشف العهدة عند التسوية." : "Earned commissions are deducted from the net handover and appear on the float statement at settlement."}</Text></View> : null}
      </View>}
      {unifiedEntity !== "owner" ? <View style={[styles.toggleRow, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="star" size={17} color={colors.primary} /><Text style={[styles.flex, { color: colors.foreground, fontSize: 12.5, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "حساب الاستلام الافتراضي" : "Primary destination"}</Text><AppToggle value={floatDraft.isDefault} onValueChange={(value) => patchDraft({ isDefault: value })} isRTL={isRTL} activeColor={colors.primary} inactiveColor={colors.border} accessibilityLabel={`${language === "ar" ? "حساب الاستلام الافتراضي" : "Primary destination"}`} /></View> : null}
      
    </ScrollView>{auditBanner ? <View style={[styles.auditBanner, { backgroundColor: colors.error + "12", borderColor: colors.error }]}><View style={{ flexDirection: "row", gap: 7, alignItems: "center" }}><MaterialIcons name="warning" size={15} color={colors.error} /><Text style={{ color: colors.error, fontSize: 12, fontWeight: "900", flexShrink: 1, textAlign: align }}>{auditBanner.title}</Text></View>{auditBanner.lines.map((line) => <View key={line} style={{ flexDirection: "row", gap: 6, marginTop: 5, alignItems: "flex-start" }}><Text style={{ color: colors.error, fontSize: 11, fontWeight: "800" }}>•</Text><Text style={{ color: colors.error, fontSize: 11.5, fontWeight: "700", flexShrink: 1, textAlign: align, lineHeight: 17 }}>{line}</Text></View>)}</View> : null}{toolbarToast ? <View style={[styles.toolbarToast, { backgroundColor: colors.foreground, borderColor: colors.border, flexDirection: "row", gap: 7 }]}><MaterialIcons name="info-outline" size={14} color={colors.background} /><Text style={{ color: colors.background, fontSize: 11.5, fontWeight: "800", flexShrink: 1, textAlign: align }}>{toolbarToast}</Text></View> : null}<View style={[styles.saveRow, styles.saveBar, { flexDirection: row, borderTopColor: colors.border }]}><RipplePressable rippleColor={colors.background + "3D"} onPress={() => void (unifiedEntity === "owner" ? saveOwnerEditor() : saveFloatEditor())} style={({ pressed }) => [styles.treasurySave, { backgroundColor: colors.primary, opacity: pressed ? 0.72 : 1, flexDirection: row }]}><MaterialIcons name="save" size={16} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 13 }}>{language === "ar" ? "حفظ" : "Save"}</Text></RipplePressable></View></View></View></Modal>

    <Modal transparent visible={pendingDelete !== null} animationType="fade" onRequestClose={() => setPendingDelete(null)} statusBarTranslucent><View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setPendingDelete(null)} /><View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.sheetHeader, { flexDirection: row }]}><View style={[styles.headerIcon, { backgroundColor: colors.error + "16" }]}><MaterialIcons name="delete-outline" size={20} color={colors.error} /></View><Text style={[styles.flex, { color: colors.foreground, fontSize: 18, fontWeight: "900", textAlign: align }]}>{pendingDelete?.title ?? ""}</Text><Pressable accessibilityLabel={language === "ar" ? "إلغاء" : "Cancel"} onPress={() => setPendingDelete(null)} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><Text style={{ color: colors.muted, fontSize: 13.5, lineHeight: 21, marginTop: 13, textAlign: align }}>{pendingDelete?.message ?? ""}</Text><View style={styles.confirmActions}><RipplePressable rippleColor={colors.foreground + "18"} onPress={() => setPendingDelete(null)} style={({ pressed }) => [styles.confirmAction, { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13 }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></RipplePressable><RipplePressable rippleColor={colors.background + "3D"} onPress={() => { const action = pendingDelete?.confirm; setPendingDelete(null); if (action) action(); }} style={({ pressed }) => [styles.confirmAction, { backgroundColor: colors.error, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="delete-outline" size={16} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 13 }}>{language === "ar" ? "حذف" : "Remove"}</Text></RipplePressable></View></View></View></Modal>
  <Modal transparent visible={auditOpen} animationType="slide" onRequestClose={() => setAuditOpen(false)} statusBarTranslucent><View style={[styles.backdrop, { flexDirection: "row", justifyContent: "flex-end" }]}><Pressable style={StyleSheet.absoluteFill} onPress={() => setAuditOpen(false)} /><View style={[styles.auditDrawer, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.auditDrawerHead, { flexDirection: row, borderBottomColor: colors.border }]}><MaterialIcons name="history" size={18} color={colors.primary} /><Text style={[styles.flex, { color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "سجل تعديلات الحسابات 📋" : "Account change log 📋"}</Text><Pressable accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={() => setAuditOpen(false)} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 10 }} showsVerticalScrollIndicator={false}>{auditLog.length === 0 ? <Text style={{ color: colors.muted, fontSize: 12.5, lineHeight: 19, textAlign: align }}>{language === "ar" ? "لا توجد تغييرات مسجلة بعد — أي تعديل على طرق الدفع سيظهر هنا بسجل كامل." : "No changes recorded yet — every payment-method change will appear here."}</Text> : <><View style={[styles.auditCols, { flexDirection: row }]}><Text style={[styles.auditCol, { color: colors.muted }]}>{language === "ar" ? "نوع الحركة" : "Action"}</Text><Text style={[styles.auditCol, styles.flex, { color: colors.muted }]}>{language === "ar" ? "القناة والحساب" : "Target"}</Text><Text style={[styles.auditCol, { color: colors.muted }]}>{language === "ar" ? "القائم بالعملية" : "Actor"}</Text><Text style={[styles.auditCol, { color: colors.muted }]}>{language === "ar" ? "التاريخ والوقت" : "Time"}</Text></View>{auditLog.map((entry) => <View key={entry.id} style={[styles.auditEntry, { backgroundColor: colors.background, borderColor: colors.border }]}><View style={[styles.auditEntryHead, { flexDirection: "row" }]}>{renderStatusPill(language === "ar" ? PAYMENT_METHOD_AUDIT_LABELS[entry.action].ar : PAYMENT_METHOD_AUDIT_LABELS[entry.action].en, entry.action === "activate" || entry.action === "add" ? colors.success : entry.action === "delete" || entry.action === "deactivate" ? colors.error : colors.primary)}<Text style={{ color: colors.muted, fontSize: 10.5, fontWeight: "700", textAlign: align, flex: 1 }}>{formatAuditTime(entry.at)}</Text></View><Text style={{ color: colors.foreground, fontSize: 12.5, fontWeight: "800", marginTop: 8, textAlign: align }}>{entry.target}</Text>{entry.detail ? <Text style={{ color: colors.muted, fontSize: 11.5, marginTop: 4, lineHeight: 17, textAlign: align }}>{entry.detail}</Text> : null}<Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 6, textAlign: align, opacity: 0.85 }}>{entry.actorName || (language === "ar" ? "حساب غير معروف" : "Unknown")}{entry.actorRole ? ` — ${roleTitle(entry.actorRole)}` : ""}</Text></View>)}</>}</ScrollView></View></View></Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 34 },
  flex: { flex: 1, minWidth: 0 },
  info: { borderWidth: 1, borderRadius: 15, padding: 12, alignItems: "flex-start", gap: 9 },
  treasuryBar: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 10, alignItems: "center", gap: 9, marginTop: 12 },
  treasuryToggle: { flex: 1, alignItems: "center", gap: 9 },
  treasuryBody: { borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, padding: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  accountLabel: { fontSize: 13, fontWeight: "800", marginTop: 12 },
  modalSectionTitle: { fontSize: 14, fontWeight: "900", marginTop: 18 },
  hint: { fontSize: 10.5, lineHeight: 16, marginTop: 6 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, marginTop: 7 },
  inputMono: { fontFamily: MONO_FONT },
  kindRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  kindChoice: { flex: 1, minHeight: 70, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 4 },
  channelCard: { borderWidth: 1, borderRadius: 15, marginTop: 8, paddingHorizontal: 11, paddingVertical: 9 },
  switchRing: { borderRadius: 17, padding: 2 },
  channelHead: { alignItems: "center", gap: 9 },
  addRowButton: { minHeight: 38, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, marginTop: 10 },
  saveRow: { justifyContent: "flex-end" },
  treasurySave: { minHeight: 36, borderRadius: 13, paddingHorizontal: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  sectionHeader: { alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 20, marginBottom: 6, flexWrap: "wrap" },
  sectionTitle: { fontSize: 15, lineHeight: 22, fontWeight: "900", alignSelf: "flex-start" },
  headerAction: { minHeight: 36, borderRadius: 13, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", gap: 5, flexShrink: 0 },
  custodyCard: { borderWidth: 1, borderRadius: 16, padding: 11, gap: 4 },
  list: { gap: 9, marginTop: 12 },
  channelRow: { minHeight: 68, borderWidth: 1, borderRadius: 16, padding: 12, alignItems: "center", justifyContent: "space-between", gap: 10 },
  channelRowHead: { flexDirection: "row", alignItems: "center", gap: 10, width: "100%" },
  channelIcon: { width: 44, height: 44, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  channelTitleRow: { alignItems: "center", gap: 7, flexWrap: "wrap" },
  statusPill: { minHeight: 19, borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3 },
  channelControls: { alignItems: "center", gap: 6, flexShrink: 0 },
  rowSubCard: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 2 },
  rowSubHead: { alignItems: "center", gap: 8 },
  rowRemove: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 3 },
  iconButton: { width: 32, height: 32, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(4, 12, 20, 0.78)" },
  sheet: { width: "100%", maxWidth: 460, borderWidth: 1, borderRadius: 22, padding: 16, paddingBottom: 20 },
  sheetHeader: { alignItems: "center", gap: 10 },
  close: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowDefaultPill: { minHeight: 32, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, gap: 4, flexDirection: "row", alignSelf: "flex-start", marginTop: 8 },
  subToolbar: { borderTopWidth: 1, marginTop: 10, paddingTop: 9, width: "100%", alignItems: "center", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  subToolbarTrash: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  subToolbarPills: { flexShrink: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  chipTray: { borderWidth: 1, borderRadius: 13, padding: 9, marginTop: 10, width: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  chipRow: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 7, alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  verifyChip: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center", gap: 6, flexDirection: "row", marginTop: 9 },
  identityCard: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 2 },
  unifiedSheet: { flexDirection: "column", maxHeight: "88%", paddingBottom: 0 },
  entityTabBar: { borderBottomWidth: 1, paddingBottom: 12, marginBottom: 8, marginHorizontal: -16, paddingHorizontal: 16 },
  saveBar: { marginTop: 6, paddingTop: 12, borderTopWidth: 1, paddingBottom: 4, marginHorizontal: -16, paddingHorizontal: 16 },
  badge: { borderWidth: 1, borderRadius: 12, padding: 9, alignItems: "center", gap: 7, marginTop: 10 },
  toolbarToast: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginHorizontal: 16, marginTop: 8, alignItems: "center" },
  auditBanner: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 16, marginTop: 8 },
  toggleRow: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, alignItems: "center", gap: 8, marginTop: 9 },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  confirmAction: { flex: 1, minHeight: 46, borderRadius: 13, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  auditAction: { alignSelf: "flex-start", marginTop: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, gap: 7, alignItems: "center" },
  auditDrawer: { width: "88%", maxWidth: 420, height: "100%", borderWidth: 1, borderRightWidth: 0, borderTopLeftRadius: 18, borderBottomLeftRadius: 18, paddingTop: 12, paddingBottom: 22 },
  auditDrawerHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1 },
  auditEntry: { borderWidth: 1, borderRadius: 14, padding: 11 },
  auditEntryHead: { alignItems: "center", gap: 8 },
  auditCols: { paddingHorizontal: 2, marginBottom: 2 },
  auditCol: { fontSize: 9.5, fontWeight: "800", flex: 1, letterSpacing: 0.4, textTransform: "uppercase" },
floatParent: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  quickAdd: { minHeight: 30, borderRadius: 8, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, borderWidth: 1 },
  bindingTabs: { gap: 8, marginBottom: 10 },
  roleChip: { flex: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", gap: 6 },
  memberQuickRow: { borderRadius: 11, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 10, alignItems: "center", gap: 7 },
  memberQuickPick: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
});
