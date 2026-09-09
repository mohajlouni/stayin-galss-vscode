import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { RipplePressable } from "@/components/ripple-pressable";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { normalizeOwnerTreasuryAccounts, normalizeStaffFloatAccounts, type OwnerTreasuryAccount, type OwnerTreasuryKind, type StaffFloatAccount, type StaffFloatChannel, ownerTreasuryAccounts } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { trpc } from "@/lib/trpc";
import type { WorkspaceAccessRole } from "@/shared/workspace-permissions";

const createId = () => `pm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const createFloatId = () => `float-custody-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const createOwnerAccountId = () => `owner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const MONO_FONT = Platform.select({ ios: "Menlo", default: "monospace" });
const OWNER_KINDS: { id: OwnerTreasuryKind; icon: "bolt" | "account-balance" | "payments"; ar: string; en: string }[] = [
  { id: "cliq", icon: "bolt", ar: "قناة CliQ", en: "CliQ channel" },
  { id: "bank", icon: "account-balance", ar: "حساب بنكي / IBAN", en: "Bank account / IBAN" },
  { id: "vault", icon: "payments", ar: "خزينة الكاش", en: "Cash vault" },
];
const ownerKindMeta = (kind: OwnerTreasuryKind) => OWNER_KINDS.find((item) => item.id === kind) ?? OWNER_KINDS[0];
const ENTITIES: { id: "owner" | "staff" | "guard"; icon: "account-balance" | "badge" | "security"; ar: string; en: string }[] = [
  { id: "owner", icon: "account-balance", ar: "المالك / الخزينة المركزية", en: "Owner / Central treasury" },
  { id: "staff", icon: "badge", ar: "موظف / محاسب", en: "Staff / accountant" },
  { id: "guard", icon: "security", ar: "حارس ميداني", en: "Field guard" },
];
type RegisteredMember = { id: number; userId: number; displayName: string; phone: string | null; role: WorkspaceAccessRole; status: string; userCode: string | null };
type OwnerRow = { key: string; id?: string; kind: OwnerTreasuryKind; label: string; detail: string; provider: string; holderName: string; iban: string; isDefault: boolean };
type FloatDraft = { id?: string; entity: "staff" | "guard"; label: string; uid: string; phone: string; hasCash: boolean; hasOther: boolean; otherNote: string; ceiling: string; isActive: boolean; isDefault: boolean; whatsApp: boolean };
const emptyOwnerRow = (kind: OwnerTreasuryKind): OwnerRow => ({ key: createId(), kind, label: "", detail: "", provider: "", holderName: "", iban: "", isDefault: false });

const emptyFloatDraft = (entity: "staff" | "guard"): FloatDraft => ({ entity, label: "", uid: "", phone: "", hasCash: true, hasOther: false, otherNote: "", ceiling: "", isActive: true, isDefault: false, whatsApp: false });

export default function PaymentMethodsScreen() {
  const { settings, updateSettings } = useBookings();
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const { can, user } = useWorkspaceAccess();
  const row = isRTL ? "row-reverse" : "row";
  const cardRow = "row-reverse" as const;
  const align = isRTL ? "right" : "left";
  const canManage = can("manage_payments");
  const [accountsOpen, setAccountsOpen] = useState(true);
  const [unifiedOpen, setUnifiedOpen] = useState(false);
  const [unifiedEntity, setUnifiedEntity] = useState<"owner" | "staff" | "guard">("owner");
  const [openChannels, setOpenChannels] = useState<Record<string, boolean>>({ cliq: true, bank: true, cash: true, other: false });
  const [ownerVaultRows, setOwnerVaultRows] = useState<OwnerRow[]>([]);
  const [ownerCliqRows, setOwnerCliqRows] = useState<OwnerRow[]>([]);
  const [ownerBankRows, setOwnerBankRows] = useState<OwnerRow[]>([]);
  const [ownerFlags, setOwnerFlags] = useState<{ isActive: boolean; whatsApp: boolean }>({ isActive: true, whatsApp: false });
  const [floatDraft, setFloatDraft] = useState<FloatDraft>(() => emptyFloatDraft("staff"));
  const [floatCliqRows, setFloatCliqRows] = useState<OwnerRow[]>([]);
  const [floatBankRows, setFloatBankRows] = useState<OwnerRow[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ title: string; message: string; confirm: () => void } | null>(null);

  const ownerAccounts = ownerTreasuryAccounts(settings);
  const activeOwnerCount = ownerAccounts.filter((account) => account.isActive !== false).length;
  const floats = normalizeStaffFloatAccounts(settings.paymentRouting?.staffFloats);
  const overview = trpc.workspace.overview.useQuery(undefined, { enabled: canManage, retry: false });
  const members = ((overview.data?.members ?? []) as unknown as RegisteredMember[]).filter((member) => member.status === "active");
  const selectableMembers = members.filter((member) => member.role !== "owner" && member.userId !== user?.id);

  const seedRan = useRef(false);
  const saveOwnerRegistry = async (next: OwnerTreasuryAccount[]) => {
    await updateSettings({ ...settings, paymentRouting: { ...settings.paymentRouting, ownerAccounts: normalizeOwnerTreasuryAccounts(next) } });
  };
  useEffect(() => {
    if (!canManage || seedRan.current || ownerAccounts.length !== 0) return;
    seedRan.current = true;
    void saveOwnerRegistry([
      { id: "owner-seed-vault", kind: "vault", label: "كاش الخزينة الرئيسية", detail: "", isActive: true, isDefault: true },
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
    const base: OwnerRow = { ...emptyOwnerRow(account.kind), id: account.id, label: account.label, detail: account.kind === "bank" ? (account.iban ?? account.detail) : account.detail, provider: account.provider ?? "", holderName: account.holderName ?? (account.kind !== "vault" ? account.label : ""), iban: account.iban ?? (account.kind === "bank" ? account.detail : ""), isDefault: account.isDefault === true };
    setOwnerVaultRows(account.kind === "vault" ? [base] : []);
    setOwnerCliqRows(account.kind === "cliq" ? [base] : []);
    setOwnerBankRows(account.kind === "bank" ? [base] : []);
    setOwnerFlags({ isActive: account.isActive !== false, whatsApp: account.whatsApp === true });
    setOpenChannels({ cliq: account.kind === "cliq", bank: account.kind === "bank", cash: account.kind === "vault", other: false });
    setUnifiedOpen(true);
  };
  const openFloatCreateFor = (entity: "staff" | "guard") => {
    setUnifiedEntity(entity);
    setFloatDraft(emptyFloatDraft(entity));
    setFloatCliqRows([]);
    setFloatBankRows([]);
    setOwnerVaultRows([]);
    setOwnerCliqRows([]);
    setOwnerBankRows([]);
    setOpenChannels({ cliq: false, bank: false, cash: true, other: false });
    setUnifiedOpen(true);
  };
  const openFloatCreate = () => openFloatCreateFor("staff");
  const openFloatEdit = (account: StaffFloatAccount) => {
    const entity = account.entity ?? "staff";
    setUnifiedEntity(entity);
    setOwnerVaultRows([]);
    setOwnerCliqRows([]);
    setOwnerBankRows([]);
    const channels = Array.isArray(account.channels) ? account.channels : [];
    const cliqRows = channels.filter((c) => c.kind === "cliq").map((c) => ({ key: createId(), kind: "cliq" as const, label: "", detail: c.alias ?? "", provider: c.provider ?? "", holderName: c.holderName ?? "", iban: "", isDefault: c.isDefault === true }));
    const bankRows = channels.filter((c) => c.kind === "bank").map((c) => ({ key: createId(), kind: "bank" as const, label: "", detail: "", provider: c.provider ?? "", holderName: c.holderName ?? "", iban: c.iban ?? "", isDefault: c.isDefault === true }));
    setFloatCliqRows(cliqRows.length ? cliqRows : account.cliqAlias ? [{ key: createId(), kind: "cliq" as const, label: "", detail: account.cliqAlias, provider: "", holderName: "", iban: "", isDefault: false }] : []);
    setFloatBankRows(bankRows.length ? bankRows : account.bankDetails ? [{ key: createId(), kind: "bank" as const, label: "", detail: "", provider: "", holderName: "", iban: account.bankDetails, isDefault: false }] : []);
    setFloatDraft({ id: account.id, entity, label: account.label, uid: selectableMembers.find((member) => member.userId === account.memberUserId)?.userCode ?? "", phone: account.contactPhone ?? "", hasCash: account.isActive !== false, hasOther: false, otherNote: "", ceiling: account.maxFloatLimit !== undefined ? String(account.maxFloatLimit) : "", isActive: account.isActive !== false, isDefault: account.isDefault === true, whatsApp: account.whatsApp === true });
    setOpenChannels({ cliq: cliqRows.length > 0 || Boolean(account.cliqAlias), bank: bankRows.length > 0 || Boolean(account.bankDetails), cash: account.isActive !== false, other: false });
    setUnifiedOpen(true);
  };

  const saveFloats = async (next: StaffFloatAccount[]) => {
    await updateSettings({ ...settings, paymentRouting: { ...settings.paymentRouting, staffFloats: normalizeStaffFloatAccounts(next) } });
  };
  const saveOwnerEditor = async () => {
    const drafts = [...ownerCliqRows, ...ownerBankRows, ...ownerVaultRows];
    const rows = drafts.filter((item) => item.label.trim() || item.detail.trim() || item.provider.trim() || item.holderName.trim() || item.iban.trim());
    if (!rows.length) { Alert.alert(language === "ar" ? "أدخل بيانات الحساب أولاً" : "Enter account details first"); return; }
    for (const item of rows) {
      let label: string;
      if (item.kind === "cliq") {
        if (!item.detail.trim() && !item.holderName.trim()) { Alert.alert(language === "ar" ? "بيانات CliQ مطلوبة" : "CliQ details required", language === "ar" ? "أدخل الاسم المستعار أو رقم الموبايل، واسم المستلم الظاهر للعميل." : "Enter the alias/mobile number and the displayed recipient name."); return; }
        label = item.holderName.trim() || item.detail.trim();
      } else if (item.kind === "bank") {
        if (!item.iban.trim()) { Alert.alert(language === "ar" ? "رقم الآيبان مطلوب" : "IBAN required", language === "ar" ? "أدخل رقم الآيبان الدولي (IBAN) لحساب البنك." : "Enter the international IBAN for the bank account."); return; }
        label = item.holderName.trim() || item.provider.trim() || item.iban.trim();
      } else {
        if (!item.label.trim()) { Alert.alert(language === "ar" ? "اسم الخزينة مطلوب" : "Vault name required"); return; }
        label = item.label.trim();
      }
      const duplicate = ownerAccounts.some((account) => account.id !== item.id && account.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase());
      if (duplicate) { Alert.alert(language === "ar" ? "الاسم مستخدم" : "Name already used", language === "ar" ? "اختر اسمًا مختلفًا لحساب الخزينة." : "Choose a different treasury-account nickname."); return; }
    }
    const existingIds = new Set(ownerAccounts.map((account) => account.id));
    let next = rows.map((item) => {
      const cliqLabel = item.kind === "cliq" ? (item.holderName.trim() || item.detail.trim()).slice(0, 60) : "";
      const bankLabel = item.kind === "bank" ? (item.holderName.trim() || item.provider.trim() || item.iban.trim()).slice(0, 60) : "";
      return { id: item.id && existingIds.has(item.id) ? item.id : createOwnerAccountId(), kind: item.kind, label: item.kind === "vault" ? item.label.trim().slice(0, 60) : item.kind === "cliq" ? cliqLabel : bankLabel, detail: (item.kind === "bank" ? item.iban : item.detail).trim().slice(0, 200), provider: item.provider.trim().slice(0, 60) || undefined, holderName: item.holderName.trim().slice(0, 60) || undefined, iban: item.iban.trim().slice(0, 200) || undefined, isActive: ownerFlags.isActive, isDefault: item.isDefault || undefined, whatsApp: ownerFlags.whatsApp || undefined };
    });
    if (!next.some((account) => account.isDefault === true)) {
      const fallback = next.find((account) => account.kind === "vault") ?? next[0];
      if (fallback) next = next.map((account) => account.id === fallback.id ? { ...account, isDefault: true } : account);
    }
    const incompleteActive = next.some((account) => account.isActive !== false && !isOwnerTreasuryComplete(account));
    if (incompleteActive) { Alert.alert(language === "ar" ? "لا يمكن حفظ حساب ناقص التفعيل" : "Incomplete account can't stay active", language === "ar" ? "أكمل بيانات الحساب (اسم مستعار/موبايل لـ CliQ، واسم البنك ورقم الآيبان للتحويل البنكي)، أو عطّله لحين الإكمال." : "Fill the required account data, or deactivate it until complete."); return; }
    const merged = [...ownerAccounts.filter((account) => !next.some((item) => item.id === account.id)), ...next];
    await saveOwnerRegistry(merged);
    setUnifiedOpen(false);
  };
  const saveFloatEditor = async () => {
    const label = floatDraft.label.trim().slice(0, 120);
    if (!label) { Alert.alert(language === "ar" ? "اسم المستلم / النقطة مطلوب" : "Recipient / collection-point name required"); return; }
    if (!floatDraft.phone.trim()) { Alert.alert(language === "ar" ? "رقم الهاتف مطلوب" : "Phone number required", language === "ar" ? "أدخل رقم هاتف للتواصل مع المستلم." : "Enter a phone number to reach this recipient."); return; }
    if (floatDraft.ceiling.trim() && (!Number.isFinite(Number(floatDraft.ceiling)) || Number(floatDraft.ceiling) < 0)) { Alert.alert(language === "ar" ? "حد العهدة غير صالح" : "Invalid float limit"); return; }
    const duplicate = floats.some((item) => item.id !== floatDraft.id && item.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase());
    if (duplicate) { Alert.alert(language === "ar" ? "الاسم مستخدم" : "Name already used", language === "ar" ? "اختر اسمًا مختلفًا لنقطة التحصيل." : "Choose a different collection-point name."); return; }
    const uidQuery = floatDraft.uid.trim();
    const matchedMember = selectableMembers.find((member) => member.userCode && member.userCode.trim().toLocaleLowerCase() === uidQuery.toLocaleLowerCase());
    let memberUserId: number | undefined;
    let memberName: string | undefined;
    if (matchedMember) { memberUserId = matchedMember.userId; memberName = matchedMember.displayName; }
    else if (floatEditingId) { const existing = floats.find((item) => item.id === floatEditingId); if (existing?.memberUserId) { memberUserId = existing.memberUserId; memberName = existing.memberName; } }
    const channelRows = [...floatCliqRows, ...floatBankRows];
    for (const item of channelRows) {
      if (!item.detail.trim() && !item.provider.trim() && !item.holderName.trim() && !item.iban.trim()) continue;
      if (item.kind === "cliq" && !item.detail.trim() && !item.holderName.trim()) { Alert.alert(language === "ar" ? "بيانات CliQ مطلوبة" : "CliQ details required", language === "ar" ? "أدخل الاسم المستعار أو رقم الموبايل، واسم المستلم الظاهر للعميل." : "Enter the alias/mobile number and the displayed recipient name."); return; }
      if (item.kind === "bank" && !item.iban.trim()) { Alert.alert(language === "ar" ? "رقم الآيبان مطلوب" : "IBAN required", language === "ar" ? "أدخل رقم الآيبان الدولي (IBAN) للحساب البنكي." : "Enter the international IBAN for the bank account."); return; }
    }
    const channels: StaffFloatChannel[] = channelRows.filter((item) => item.detail.trim() || item.provider.trim() || item.holderName.trim() || item.iban.trim()).map((item) => ({ kind: (item.kind === "cliq" || item.kind === "bank") ? item.kind : "cliq", alias: (item.kind === "cliq" ? item.detail.trim() : "").slice(0, 160) || undefined, provider: item.provider.trim().slice(0, 60) || undefined, holderName: item.holderName.trim().slice(0, 60) || undefined, iban: (item.kind === "bank" ? item.iban.trim() : "").slice(0, 200) || undefined, isDefault: item.isDefault || undefined }));
    const cliqChannels = channels.filter((c) => c.kind === "cliq");
    const bankChannels = channels.filter((c) => c.kind === "bank");
    const primaryCliq = cliqChannels.find((c) => c.isDefault) ?? cliqChannels[0];
    const primaryBank = bankChannels.find((c) => c.isDefault) ?? bankChannels[0];
    const mirrorBank = primaryBank ? [`البنك: ${primaryBank.provider ?? ""}`, primaryBank.holderName ? `صاحب: ${primaryBank.holderName}` : "", `IBAN: ${primaryBank.iban ?? ""}`].filter(Boolean).join(" · ").trim() : undefined;
    const otherNote = floatDraft.hasOther ? `أخرى: ${floatDraft.otherNote.trim().slice(0, 240)}` : "";
    const base = { memberName: (memberName ?? "").trim().slice(0, 120) || undefined, memberUserId, contactPhone: floatDraft.phone.trim().slice(0, 30) || undefined, cliqAlias: primaryCliq?.alias, bankDetails: (primaryBank || floatDraft.hasOther) ? [mirrorBank, otherNote].filter(Boolean).join("\n") || undefined : undefined, channels: channels.length ? channels : undefined, maxFloatLimit: floatDraft.ceiling.trim() ? Math.round(Math.max(0, Number(floatDraft.ceiling)) * 100) / 100 : undefined, isDefault: floatDraft.isDefault || undefined, whatsApp: floatDraft.whatsApp || undefined, entity: floatDraft.entity, isActive: floatDraft.isActive };
    const primary: StaffFloatAccount = { id: floatDraft.id ?? createFloatId(), label, ...base };
    if (primary.isActive !== false && !isFloatComplete(primary)) { Alert.alert(language === "ar" ? "لا يمكن حفظ عهدة ناقصة التفعيل" : "Incomplete float can't stay active", language === "ar" ? "يرجى إكمال بيانات الحساب عبر زر التعديل أولاً." : "Please complete the account data via the edit button first."); return; }
    const all = floatDraft.id ? floats.map((item) => item.id === floatDraft.id ? primary : item) : [...floats, primary];
    await saveFloats(all);
    Alert.alert(language === "ar" ? "تم حفظ نقطة التحصيل" : "Collection point saved");
    setUnifiedOpen(false);
  };
  const floatEditingId = floatDraft.id ?? null;
  const isOwnerTreasuryComplete = (account: OwnerTreasuryAccount): boolean => {
    if (account.kind === "cliq") return Boolean((account.detail || "").trim() || (account.holderName || "").trim());
    if (account.kind === "bank") return Boolean((account.provider || "").trim()) && Boolean((account.detail || account.iban || "").trim());
    return Boolean((account.label || "").trim());
  };
  const isFloatComplete = (account: StaffFloatAccount): boolean => {
    if (!(account.label || "").trim() || !(account.contactPhone || "").trim()) return false;
    const channels = Array.isArray(account.channels) && account.channels.length ? account.channels : [];
    if (!channels.length) return Boolean((account.cliqAlias || "").trim() || (account.bankDetails || "").trim());
    return channels.every((channel) => channel.kind === "cliq" ? Boolean((channel.alias || "").trim()) : Boolean((channel.provider || "").trim() && (channel.iban || "").trim()));
  };
  const toggleOwnerActive = (account: OwnerTreasuryAccount, nextActive: boolean) => {
    if (nextActive && !isOwnerTreasuryComplete(account)) { Alert.alert(language === "ar" ? "لا يمكن تفعيل حساب ناقص" : "Incomplete account can't be activated", language === "ar" ? "يرجى إكمال بيانات الحساب عبر زر التعديل أولاً" : "Please complete the account data via the edit button first."); return; }
    void saveOwnerRegistry(ownerAccounts.map((item) => item.id === account.id ? { ...item, isActive: nextActive } : item));
  };
  const removeOwner = (account: OwnerTreasuryAccount) => setPendingDelete({ title: language === "ar" ? "حذف حساب الخزينة" : "Remove treasury account", message: language === "ar" ? `ستُزال «${account.label}» من قنوات الاستلام المتاحة في نموذج الحجز.` : `“${account.label}” will be removed from the checkout receiving channels.`, confirm: () => { void saveOwnerRegistry(ownerAccounts.filter((item) => item.id !== account.id)); } });
  const toggleFloatActive = (account: StaffFloatAccount, nextActive: boolean) => {
    if (nextActive && !isFloatComplete(account)) { Alert.alert(language === "ar" ? "لا يمكن تفعيل عهدة ناقصة البيانات" : "Incomplete float can't be activated", language === "ar" ? "يرجى إكمال بيانات الحساب عبر زر التعديل أولاً" : "Please complete the account data via the edit button first."); return; }
    void saveFloats(floats.map((item) => item.id === account.id ? { ...item, isActive: nextActive } : item));
  };
  const removeFloat = (account: StaffFloatAccount) => setPendingDelete({ title: language === "ar" ? "حذف نقطة التحصيل" : "Remove collection point", message: language === "ar" ? `ستُحذف «${account.label}» مع بقاء سجل تسوية العُهد السابقة محفوظًا.` : `“${account.label}” will be removed while past custody settlements remain recorded.`, confirm: () => { void saveFloats(floats.filter((item) => item.id !== account.id)); } });

  const ownerDetailLabel = (account: OwnerTreasuryAccount) => {
    if (account.isActive === false) return language === "ar" ? "موقوف — لا يظهر في خيارات الدفع" : "Disabled — hidden from checkout";
    const parts: string[] = [];
    if (account.kind === "cliq") { if (account.detail) parts.push(`Alias: ${account.detail}`); if (account.provider) parts.push(account.provider); }
    else if (account.kind === "bank") { if (account.detail) parts.push(`IBAN: ${account.detail}`); if (account.provider) parts.push(account.provider); }
    else if (account.detail) parts.push(account.detail);
    return parts.length ? parts.join(" · ") : (language === "ar" ? "بانتظار الإعداد" : "Awaiting setup");
  };

  const renderStatusPill = (label: string, color: string, icon?: "star" | "check-circle") => <View style={[styles.statusPill, { backgroundColor: color + "12", borderColor: color + "45" }]}>{icon ? <MaterialIcons name={icon} size={11} color={color} /> : null}<Text style={{ color, fontSize: 10, fontWeight: "800" }}>{label}</Text></View>;

  const pickRowDefault = (selectedKey: string) => {
    const clear = (current: OwnerRow[]) => current.map((item) => ({ ...item, isDefault: item.key === selectedKey }));
    setOwnerCliqRows((current) => clear(current));
    setOwnerBankRows((current) => clear(current));
    setOwnerVaultRows((current) => clear(current));
    setFloatCliqRows((current) => clear(current));
    setFloatBankRows((current) => clear(current));
  };

  const ownerRowEditor = (group: "cliq" | "bank" | "vault", source: "owner" | "float") => {
    const ownerMode = source === "owner";
    const rows = ownerMode ? (group === "cliq" ? ownerCliqRows : group === "bank" ? ownerBankRows : ownerVaultRows) : (group === "cliq" ? floatCliqRows : floatBankRows);
    const setRows = ownerMode ? (group === "cliq" ? setOwnerCliqRows : group === "bank" ? setOwnerBankRows : setOwnerVaultRows) : (group === "cliq" ? setFloatCliqRows : setFloatBankRows);
    const addRow = () => setRows((current) => [...current, emptyOwnerRow(group)]);
    const setField = (key: string, patch: Partial<OwnerRow>) => setRows((current) => current.map((entry) => entry.key === key ? { ...entry, ...patch } : entry));
    return rows.map((item, index) => {
      const title = group === "cliq" ? (language === "ar" ? `حساب CliQ #${index + 1}` : `CliQ account #${index + 1}`) : group === "bank" ? (language === "ar" ? `الحساب البنكي #${index + 1}` : `Bank account #${index + 1}`) : (language === "ar" ? "خزينة الكاش" : "Cash vault");
      const defaultLabel = group === "cliq" ? (language === "ar" ? "تعيين كـ CliQ افتراضي" : "Set as primary CliQ") : group === "bank" ? (language === "ar" ? "تعيين كـ بنك افتراضي" : "Set as primary bank") : (language === "ar" ? "تعيين كـ افتراضي" : "Set as default");
      const fields = group === "cliq" ? [{ key: "detail" as const, mono: true, label: language === "ar" ? "الاسم المستعار أو رقم الموبايل" : "Alias / mobile number", placeholder: language === "ar" ? "مثال: STAYIN01 أو 0791234567" : "e.g. STAYIN01 or 0791234567" }, { key: "provider" as const, mono: false, label: language === "ar" ? "اسم البنك أو المحفظة" : "Bank / wallet provider", placeholder: language === "ar" ? "مثال: بنك الإسكان، أورنج موني، كابيتال بنك" : "e.g. Housing Bank, Orange Money, Capital Bank" }, { key: "holderName" as const, mono: false, label: language === "ar" ? "اسم المستلم / صاحب الحساب كما يظهر للعميل" : "Displayed account holder name", placeholder: language === "ar" ? "مثال: شركة ملاذ لإدارة العقارات أو محمد عجلوني" : "e.g. Malath Properties Co. or Mohammed Ajlouni" }] : group === "bank" ? [{ key: "provider" as const, mono: false, label: language === "ar" ? "اسم البنك" : "Bank name", placeholder: language === "ar" ? "مثال: بنك الاتحاد، البنك العربي" : "e.g. Union Bank, Arab Bank" }, { key: "holderName" as const, mono: false, label: language === "ar" ? "اسم صاحب الحساب المستلم" : "Account holder name", placeholder: language === "ar" ? "الاسم الرسمي المعتمد في البنك" : "Official name registered at the bank" }, { key: "iban" as const, mono: true, label: language === "ar" ? "رقم الآيبان الدولي (IBAN) / رقم الحساب" : "International IBAN / account number", placeholder: "JO000000000000000000000000" }] : [{ key: "label" as const, mono: false, label: language === "ar" ? "اسم خزينة الكاش" : "Cash vault label", placeholder: language === "ar" ? "مثال: كاش الخزينة الرئيسية" : "e.g. Main cash vault" }, { key: "detail" as const, mono: false, label: language === "ar" ? "وصف الخزينة (اختياري)" : "Vault description (optional)", placeholder: language === "ar" ? "مثال: خزينة الاستقبال الرئيسية" : "e.g. Main reception vault" }];
      return <View key={item.key} style={[styles.rowSubCard, { backgroundColor: colors.surfaceMuted + "66", borderColor: colors.border, marginTop: index === 0 ? 0 : 8 }]}>
        <View style={[styles.rowSubHead, { flexDirection: row }]}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>{title}</Text><View style={styles.flex} />{rows.length > 1 ? <RipplePressable rippleColor={colors.error + "18"} onPress={() => setRows((current) => current.filter((entry) => entry.key !== item.key))} style={({ pressed }) => [styles.rowRemove, { opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="close" size={14} color={colors.error} /><Text style={{ color: colors.error, fontSize: 11, fontWeight: "800" }}>{language === "ar" ? "حذف ✕" : "Delete ✕"}</Text></RipplePressable> : null}</View>
        <RipplePressable rippleColor={colors.primary + "22"} onPress={() => pickRowDefault(item.key)} style={({ pressed }) => [styles.rowDefaultPill, { borderColor: item.isDefault ? colors.primary : colors.border, backgroundColor: item.isDefault ? colors.primary + "14" : "transparent", opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name={item.isDefault ? "radio-button-checked" : "radio-button-unchecked"} size={13} color={item.isDefault ? colors.primary : colors.muted} /><Text style={{ color: item.isDefault ? colors.primary : colors.muted, fontSize: 10.5, fontWeight: "800" }}>{defaultLabel}</Text></RipplePressable>
        {fields.map((field) => <View key={field.key}><Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{field.label}</Text><TextInput value={item[field.key]} onChangeText={(text) => setField(item.key, { [field.key]: text } as Partial<OwnerRow>)} maxLength={field.key === "iban" ? 40 : field.key === "detail" ? 200 : 60} placeholder={field.placeholder} placeholderTextColor={colors.muted} style={[styles.input, field.mono ? styles.inputMono : null, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /></View>)}
        {group !== "vault" && index === rows.length - 1 ? <RipplePressable rippleColor={colors.primary + "22"} onPress={addRow} style={({ pressed }) => [styles.addRowButton, { borderColor: colors.primary + "66", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="add" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: "800" }}>{group === "cliq" ? (language === "ar" ? "+ إضافة حساب CliQ آخر" : "+ Add another CliQ account") : (language === "ar" ? "+ إضافة حساب بنكي آخر" : "+ Add another bank account")}</Text></RipplePressable> : null}
      </View>;
    });
  };
  const ownerChannelSection = (group: "cliq" | "bank" | "vault") => {
    const rows = group === "cliq" ? ownerCliqRows : group === "bank" ? ownerBankRows : ownerVaultRows;
    const on = rows.length > 0;
    const meta = group === "cliq" ? { icon: "bolt" as const, title: language === "ar" ? "الحوالة البنكية عبر CliQ" : "CliQ transfer", sub: language === "ar" ? "كليك للتحويل الفوري" : "Instant CliQ transfers" } : group === "bank" ? { icon: "account-balance" as const, title: language === "ar" ? "الحوالة البنكية (IBAN)" : "Bank transfer (IBAN)", sub: language === "ar" ? "تحويل بنكي محلي ودولي" : "Local & international transfers" } : { icon: "payments" as const, title: language === "ar" ? "النقد (Cash)" : "Cash", sub: language === "ar" ? "استلام نقدي في الموقع" : "Receive physical cash" };
    const setOn = (next: boolean) => {
      if (group === "cliq") setOwnerCliqRows(next ? [emptyOwnerRow("cliq")] : []);
      else if (group === "bank") setOwnerBankRows(next ? [emptyOwnerRow("bank")] : []);
      else setOwnerVaultRows(next ? [emptyOwnerRow("vault")] : []);
    };
    return <View style={[styles.channelCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" onPress={() => toggleOpenChannel(group)} style={[styles.channelHead, { flexDirection: row }]}><MaterialIcons name={meta.icon} size={19} color={colors.primary} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{meta.title}</Text><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 1, textAlign: align }}>{meta.sub}</Text></View><AppToggle value={on} onValueChange={setOn} isRTL={isRTL} activeColor={colors.primary} inactiveColor={colors.border} accessibilityLabel={`${language === "ar" ? "تفعيل" : "Enable"} ${meta.title}`} /><MaterialIcons name={openChannels[group] ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={21} color={colors.muted} /></Pressable>
      {on && openChannels[group] ? <View>{ownerRowEditor(group, "owner")}</View> : null}
    </View>;
  };

  const floatChannelSection = (group: "cash" | "cliq" | "bank" | "other") => {
  if (group === "cash") return <View style={[styles.channelCard, { backgroundColor: colors.background, borderColor: colors.border }]}><View style={[styles.channelHead, { flexDirection: row }]}><MaterialIcons name="payments" size={19} color="#0EA5E9" /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "النقد (Cash)" : "Cash"}</Text><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 1, textAlign: align }}>{language === "ar" ? "استلام نقدي في الموقع" : "Receive physical cash"}</Text></View><AppToggle value={floatDraft.isActive} onValueChange={(value) => setFloatDraft((draft) => ({ ...draft, isActive: value }))} isRTL={isRTL} activeColor="#0EA5E9" inactiveColor={colors.border} accessibilityLabel={`${language === "ar" ? "تفعيل النقد" : "Enable cash"}`} /></View></View>;
  if (group === "other") {
    const on = floatDraft.hasOther;
    return <View style={[styles.channelCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" onPress={() => toggleOpenChannel("other")} style={[styles.channelHead, { flexDirection: row }]}><MaterialIcons name="point-of-sale" size={19} color="#0EA5E9" /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "أخرى (Other)" : "Other"}</Text><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 1, textAlign: align }}>{language === "ar" ? "أجهزة POS أو محافظ ثانوية" : "POS terminals or secondary wallets"}</Text></View><AppToggle value={on} onValueChange={(value) => patchDraft({ hasOther: value })} isRTL={isRTL} activeColor="#0EA5E9" inactiveColor={colors.border} accessibilityLabel={`${language === "ar" ? "تفعيل" : "Enable"} ${language === "ar" ? "أخرى (Other)" : "Other"}`} /><MaterialIcons name={openChannels.other ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={21} color={colors.muted} /></Pressable>
      {on && openChannels.other ? <View><Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "وصف القناة الأخرى" : "Custom channel description"}</Text><TextInput value={floatDraft.otherNote} onChangeText={(text) => patchDraft({ otherNote: text })} maxLength={240} placeholder={language === "ar" ? "مثال: جهاز POS أو محفظة ثانوية" : "Example: POS terminal or secondary wallet"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /></View> : null}
    </View>;
  }
  const rows = group === "cliq" ? floatCliqRows : floatBankRows;
  const meta = group === "cliq" ? { icon: "bolt" as const, title: language === "ar" ? "الحوالة البنكية عبر CliQ" : "CliQ transfer", sub: language === "ar" ? "كليك للتحويل الفوري" : "Instant CliQ transfers" } : { icon: "account-balance" as const, title: language === "ar" ? "الحوالة البنكية (IBAN)" : "Bank transfer (IBAN)", sub: language === "ar" ? "تحويل بنكي محلي ودولي" : "Local & international transfers" };
  const on = rows.length > 0;
  const setOn = (next: boolean) => { if (group === "cliq") setFloatCliqRows(next ? [emptyOwnerRow("cliq")] : []); else setFloatBankRows(next ? [emptyOwnerRow("bank")] : []); };
  return <View style={[styles.channelCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
    <Pressable accessibilityRole="button" onPress={() => toggleOpenChannel(group)} style={[styles.channelHead, { flexDirection: row }]}><MaterialIcons name={meta.icon} size={19} color="#0EA5E9" /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{meta.title}</Text><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 1, textAlign: align }}>{meta.sub}</Text></View><AppToggle value={on} onValueChange={setOn} isRTL={isRTL} activeColor="#0EA5E9" inactiveColor={colors.border} accessibilityLabel={`${language === "ar" ? "تفعيل" : "Enable"} ${meta.title}`} /><MaterialIcons name={openChannels[group] ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={21} color={colors.muted} /></Pressable>
    {on && openChannels[group] ? <View>{ownerRowEditor(group, "float")}</View> : null}
  </View>;
};
  const patchDraft = (patch: Partial<FloatDraft>) => setFloatDraft((draft) => ({ ...draft, ...patch }));
  const floatVerifiedMember = (() => { const query = floatDraft.uid.trim().toLocaleLowerCase(); if (!query) return null; return selectableMembers.find((member) => member.userCode && member.userCode.trim().toLocaleLowerCase() === query) ?? null; })();

  const pickEntity = (entity: "owner" | "staff" | "guard") => {
    setUnifiedEntity(entity);
    const ownerEmpty = ownerCliqRows.length + ownerBankRows.length + ownerVaultRows.length === 0;
    const floatDraftEmpty = !floatDraft.id && !floatDraft.label.trim() && !floatDraft.phone.trim() && floatCliqRows.length === 0 && floatBankRows.length === 0;
    if (entity === "owner") {
      setOpenChannels({ cliq: true, bank: false, cash: false, other: false });
      if (ownerEmpty) { setOwnerCliqRows([emptyOwnerRow("cliq")]); setOwnerVaultRows([]); setOwnerBankRows([]); setOwnerFlags({ isActive: true, whatsApp: false }); }
    } else {
      setOpenChannels({ cliq: false, bank: false, cash: true, other: false });
      if (floatDraftEmpty) setFloatDraft(emptyFloatDraft(entity === "guard" ? "guard" : "staff"));
      else if (floatDraft.entity && floatDraft.entity !== entity) setFloatDraft((draft) => ({ ...draft, entity }));
    }
  };

  const isOwnerEdit = Boolean(ownerCliqRows[0]?.id || ownerBankRows[0]?.id || ownerVaultRows[0]?.id);
  const isFloatEdit = Boolean(floatDraft.id);
  const modalTitle = unifiedEntity === "owner" ? (isOwnerEdit ? (language === "ar" ? "تعديل حساب الخزينة" : "Edit treasury account") : (language === "ar" ? "إضافة حساب خزينة" : "Add treasury account")) : (isFloatEdit ? (language === "ar" ? "تعديل نقطة تحصيل موظف" : "Edit staff collection point") : floatDraft.entity === "guard" ? (language === "ar" ? "إضافة نقطة تحصيل حارس" : "Add guard collection point") : (language === "ar" ? "إضافة نقطة تحصيل موظف" : "Add staff collection point"));

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <SubScreenHeader title={language === "ar" ? "إدارة طرق الدفع" : "Payment methods"} fallbackHref="/(tabs)/more" />
    <View style={[styles.info, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "45", flexDirection: row }]}><MaterialIcons name="info-outline" size={20} color={colors.primary} /><Text style={[styles.flex, { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: align }]}>{language === "ar" ? "تظهر الطرق المفعلة فقط في العربون والتأمين. حدّد وجهة التحصيل الافتراضية لكل طريقة، ثم اختر الحساب الفعلي من نموذج الحجز." : "Only active methods appear for new collections. Choose each method's default recipient, then select the actual account in the booking form."}</Text></View>

    <View style={[styles.treasuryBar, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityState={{ expanded: accountsOpen }} onPress={() => setAccountsOpen((value) => !value)} style={styles.treasuryToggle}><View style={[styles.headerIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="account-balance" size={19} color={colors.primary} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "900", textAlign: align }}>{language === "ar" ? "حسابات الخزينة والمالك المباشرة" : "Owner treasury & direct accounts"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "حسابات الخزينة المركزية وحسابات المالك الرئيسية — CliQ والتحويل البنكي ووجهة الكاش الافتراضية." : "Central treasury & master owner accounts — CliQ, bank transfer, and default cash destination."}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 2, textAlign: align }}>{language === "ar" ? "تستقر الدفعات هنا مباشرة كإيراد صافٍ للمنشأة" : "Payments settle here directly as net business revenue"}</Text></View><MaterialIcons name={accountsOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={23} color={colors.muted} /></Pressable></View>
    {accountsOpen ? <View style={[styles.treasuryBody, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.badge, { backgroundColor: colors.primary + "0F", borderColor: colors.success + "3A", flexDirection: row }]}><MaterialIcons name="verified-user" size={17} color={colors.success} /><Text style={[styles.flex, { color: colors.muted, fontSize: 11.5, lineHeight: 18, fontWeight: "700", textAlign: align }]}>{language === "ar" ? "تستقر الدفعات مباشرة في إيرادات الخزينة العامة للمنشأة" : "Funds settle directly into the business general treasury"}</Text></View>
      {ownerAccounts.length ? <View style={styles.list}>{ownerAccounts.map((account) => { const soleActive = account.isActive !== false && activeOwnerCount <= 1; const solePrimaryVault = account.kind === "vault" && account.isDefault === true && ownerAccounts.length === 1; const kind = ownerKindMeta(account.kind); return <View key={account.id} style={[styles.channelRow, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: cardRow, direction: "ltr" }]}><View style={[styles.channelIcon, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "35" }]}><MaterialIcons name={kind.icon} size={20} color={colors.primary} /></View><View style={styles.flex}><View style={[styles.channelTitleRow, { flexDirection: row }]}><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: align }}>{account.label}</Text>{account.isDefault ? renderStatusPill(language === "ar" ? "افتراضي" : "Default", colors.success, "star") : null}{account.whatsApp ? renderStatusPill(language === "ar" ? "واتساب" : "WhatsApp", "#0EA5E9") : null}</View><Text numberOfLines={1} style={{ color: account.isActive !== false ? colors.muted : colors.warning, fontSize: 10.5, fontWeight: "700", marginTop: 3, textAlign: align, fontFamily: MONO_FONT }}>{ownerDetailLabel(account)}</Text>{account.isActive !== false && isOwnerTreasuryComplete(account) ? <View style={{ marginTop: 5 }}>{renderStatusPill(language === "ar" ? "✓ مفعّل وجاهز للاستلام" : "✓ Active and ready to receive", colors.success, "check-circle")}</View> : null}{!isOwnerTreasuryComplete(account) ? <View style={{ marginTop: 5 }}>{renderStatusPill(language === "ar" ? "⚠️ يلزم إكمال البيانات للتفعيل" : "⚠️ Complete data to activate", colors.warning)}</View> : null}</View><View style={[styles.channelControls, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={`${language === "ar" ? "تعديل" : "Edit"} ${account.label}`} onPress={() => openOwnerEdit(account)} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name="edit" size={16} color={colors.primary} /></Pressable>{!solePrimaryVault ? <Pressable accessibilityRole="button" accessibilityLabel={`${language === "ar" ? "حذف" : "Remove"} ${account.label}`} onPress={() => removeOwner(account)} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.error + "10", borderColor: colors.error + "45", opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name="delete-outline" size={16} color={colors.error} /></Pressable> : null}{canManage ? <AppToggle value={account.isActive !== false} onValueChange={(nextActive) => toggleOwnerActive(account, nextActive)} disabled={account.isActive !== false && soleActive} isRTL={isRTL} activeColor={colors.primary} inactiveColor={colors.border} accessibilityLabel={`${language === "ar" ? "تفعيل" : "Enable"} ${account.label}`} /> : null}</View></View>; })}</View> : null}
    </View> : null}

    <View style={[styles.sectionHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "صناديق عُهد الموظفين والحراس الميدانية" : "Staff & guard field custody vaults"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "العُهد الميدانية وقنوات الاستلام المعتمدة للفريق" : "Field custody points and approved team channels"}</Text></View>{canManage ? <RipplePressable rippleColor={colors.background + "3D"} onPress={openFloatCreate} style={({ pressed }) => [styles.headerAction, { backgroundColor: colors.primary, opacity: pressed ? 0.72 : 1, flexDirection: row }]}><MaterialIcons name="add" size={16} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "+ إضافة صندوق عهدة وتحصيل (موظف / حارس)" : "+ Add custody & collection vault (Staff / Guard)"}</Text></RipplePressable> : null}</View>

    <View style={[styles.custodyCard, { backgroundColor: colors.surface, borderColor: "#0EA5E9" + "60" }]}><View style={[styles.badge, { backgroundColor: "#0EA5E9" + "0D", borderColor: "#0EA5E9" + "38", flexDirection: row }]}><MaterialIcons name="info-outline" size={17} color="#0284C7" /><Text style={[styles.flex, { color: colors.muted, fontSize: 11.5, lineHeight: 18, fontWeight: "700", textAlign: align }]}>{language === "ar" ? "المبالغ المستلمة هنا تُسجل كذمة مالية/عهدة معلقة على الموظف لحين التوريد والتسوية مع المالك" : "Funds received here are recorded as a liability/float due from the employee until handed over and settled with the owner"}</Text></View>
      {floats.length ? <View style={styles.list}>{floats.map((account) => { const isGuard = account.entity === "guard"; const floatIcon = isGuard ? "security" : "badge"; const floatTint = isGuard ? "#8B5CF6" : "#0EA5E9"; return <View key={account.id} style={[styles.channelRow, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: cardRow, direction: "ltr" }]}><View style={[styles.channelIcon, { backgroundColor: floatTint + "14", borderColor: floatTint + "35" }]}><MaterialIcons name={floatIcon} size={20} color={floatTint} /></View><View style={styles.flex}><View style={[styles.channelTitleRow, { flexDirection: row }]}><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: align }}>{account.label}</Text>{account.isDefault ? renderStatusPill(language === "ar" ? "افتراضي" : "Default", colors.success, "star") : null}{account.whatsApp ? renderStatusPill(language === "ar" ? "واتساب" : "WhatsApp", "#0EA5E9") : null}</View><Text numberOfLines={1} style={{ color: account.isActive !== false ? colors.muted : colors.warning, fontSize: 10.5, fontWeight: "700", marginTop: 3, textAlign: align, fontFamily: MONO_FONT }}>{[account.memberName ? `${language === "ar" ? "الموظف" : "Employee"}: ${account.memberName}` : "", account.contactPhone ? `${language === "ar" ? "الهاتف" : "Phone"}: ${account.contactPhone}` : "", account.maxFloatLimit !== undefined ? `${language === "ar" ? "سقف العهدة" : "Float ceiling"}: ${account.maxFloatLimit}` : "", account.cliqAlias ? `CliQ: ${account.cliqAlias}` : ""].filter(Boolean).join(" · ") || (language === "ar" ? "بلا بيانات إضافية" : "No extra details")}</Text>{account.isActive !== false && isFloatComplete(account) ? <View style={{ marginTop: 5 }}>{renderStatusPill(language === "ar" ? "✓ مفعّل وجاهز للاستلام" : "✓ Active and ready to receive", colors.success, "check-circle")}</View> : null}{!isFloatComplete(account) ? <View style={{ marginTop: 5 }}>{renderStatusPill(language === "ar" ? "⚠️ يلزم إكمال البيانات للتفعيل" : "⚠️ Complete data to activate", colors.warning)}</View> : null}</View><View style={[styles.channelControls, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={`${language === "ar" ? "تعديل" : "Edit"} ${account.label}`} onPress={() => openFloatEdit(account)} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name="edit" size={16} color={colors.primary} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${language === "ar" ? "حذف" : "Remove"} ${account.label}`} onPress={() => removeFloat(account)} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.error + "10", borderColor: colors.error + "45", opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name="delete-outline" size={16} color={colors.error} /></Pressable>{canManage ? <AppToggle value={account.isActive !== false} onValueChange={(nextActive) => toggleFloatActive(account, nextActive)} isRTL={isRTL} activeColor="#0EA5E9" inactiveColor={colors.border} accessibilityLabel={`${language === "ar" ? "تفعيل العهدة" : "Enable float"} ${account.label}`} /> : null}</View></View>; })}</View> : null}
    </View>
  </ScrollView>


    <Modal transparent visible={unifiedOpen} animationType="fade" onRequestClose={() => setUnifiedOpen(false)} statusBarTranslucent><View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setUnifiedOpen(false)} /><View style={[styles.sheet, styles.unifiedSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.sheetHeader, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.foreground, fontSize: 18, fontWeight: "900", textAlign: align }]}>{modalTitle}</Text><Pressable accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={() => setUnifiedOpen(false)} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><View style={[styles.entityTabBar, { borderBottomColor: colors.border }]}><Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "جهة الحساب" : "Account entity"}</Text><View style={[styles.kindRow, { flexDirection: row }]}>{ENTITIES.map((choice) => <Pressable key={choice.id} accessibilityRole="button" accessibilityState={{ selected: unifiedEntity === choice.id }} onPress={() => pickEntity(choice.id)} style={({ pressed }) => [styles.kindChoice, { backgroundColor: unifiedEntity === choice.id ? colors.primary + "1A" : colors.background, borderColor: unifiedEntity === choice.id ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={choice.icon} size={19} color={unifiedEntity === choice.id ? colors.primary : colors.muted} /><Text style={{ color: unifiedEntity === choice.id ? colors.primary : colors.muted, fontSize: 10.5, fontWeight: "800", textAlign: "center" }}>{language === "ar" ? choice.ar : choice.en}</Text></Pressable>)}</View></View><ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 10 }}>
      
      {unifiedEntity === "owner" ? <View>
        <View style={[styles.toggleRow, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="power-settings-new" size={17} color={colors.success} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 12.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "حالة الحساب — مفعّل للاستلام" : "Account status — active for collection"}</Text><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2, textAlign: align }}>{language === "ar" ? "تطابق حالة التفعيل الظاهرة في البطاقة الرئيسية لهذا الحساب" : "Mirrors the activation state shown on the account's main card"}</Text></View><AppToggle value={ownerFlags.isActive} onValueChange={(value) => setOwnerFlags((flags) => ({ ...flags, isActive: value }))} isRTL={isRTL} activeColor={colors.primary} inactiveColor={colors.border} accessibilityLabel={`${language === "ar" ? "حالة الحساب" : "Account status"}`} /></View>
        <Text style={[styles.modalSectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "القنوات المتاحة" : "Available channels"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2, textAlign: align }}>{language === "ar" ? "فعّل كل قناة وأدخل بياناتها، ويمكن إضافة أكثر من بنك أو حساب CliQ واحد." : "Enable each channel with its details; you can add multiple banks or CliQ accounts."}</Text>
        {ownerChannelSection("vault")}{ownerChannelSection("cliq")}{ownerChannelSection("bank")}
      </View> : <View>
        <View style={[styles.identityCard, { backgroundColor: colors.surfaceMuted + "3A", borderColor: colors.border }]}><View style={{ flexDirection: row, gap: 8 }}><View style={styles.flex}><Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "معرف المستخدم #UID (اختياري للبحث)" : "User #UID (optional for search)"}</Text><TextInput value={floatDraft.uid} onChangeText={(text) => { patchDraft({ uid: text }); const query = text.trim().toLocaleLowerCase(); const match = selectableMembers.find((member) => member.userCode && member.userCode.trim().toLocaleLowerCase() === query); if (match) patchDraft({ label: match.displayName, phone: match.phone ?? "" }); }} autoCapitalize="characters" autoCorrect={false} maxLength={40} placeholder={language === "ar" ? "مثال: U1024" : "e.g. U1024"} placeholderTextColor={colors.muted} style={[styles.input, styles.inputMono, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: "left" }]} /></View><View style={styles.flex}><Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "رقم الهاتف للتواصل (إجباري)" : "Contact phone (required)"}</Text><TextInput value={floatDraft.phone} onChangeText={(text) => patchDraft({ phone: text })} keyboardType="phone-pad" maxLength={20} placeholder="07XXXXXXXX" placeholderTextColor={colors.muted} style={[styles.input, styles.inputMono, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: "left" }]} /></View></View>{floatVerifiedMember ? <View style={[styles.verifyChip, { backgroundColor: colors.success + "12", borderColor: colors.success + "45" }]}><MaterialIcons name="verified" size={13} color={colors.success} /><Text style={[styles.flex, { color: colors.success, fontSize: 11, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "✓ موظف موثق: " + floatVerifiedMember.displayName + " - " + (floatVerifiedMember.phone ?? "-") : "✓ Verified employee: " + floatVerifiedMember.displayName + " - " + (floatVerifiedMember.phone ?? "-")}</Text></View> : <View style={[styles.verifyChip, { backgroundColor: colors.surfaceMuted + "66", borderColor: colors.border }]}><MaterialIcons name="person-search" size={13} color={colors.muted} /><Text style={[styles.flex, { color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: align }]}>{language === "ar" ? "يرجى كتابة الاسم أدناه يدويًا" : "Please type the name manually below"}</Text></View>}<Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "اسم المستلم / النقطة (إجباري)" : "Recipient / collection-point name (required)"}</Text><TextInput value={floatDraft.label} onChangeText={(text) => patchDraft({ label: text })} maxLength={120} autoFocus placeholder={language === "ar" ? "مثال: كاش الحارس أحمد، كليك المحاسب" : "Example: guard Ahmed's cash, accountant's CliQ"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /></View>
        <Text style={[styles.modalSectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "القنوات المتاحة" : "Available channels"}</Text>
        {floatChannelSection("cash")}{floatChannelSection("cliq")}{floatChannelSection("bank")}{floatChannelSection("other")}
        <Text style={[styles.modalSectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "الحدود والتحكم التشغيلي" : "Limits & operational controls"}</Text>
        <Text style={[styles.accountLabel, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "الحد الأقصى للعهدة النقدية" : "Maximum cash float ceiling"}</Text><TextInput accessibilityLabel={language === "ar" ? "الحد الأقصى المسموح للعهدة النقدية" : "Maximum allowed float ceiling"} value={floatDraft.ceiling} onChangeText={(text) => patchDraft({ ceiling: text })} keyboardType="decimal-pad" placeholder={language === "ar" ? "مثال: 300 د.أ" : "Example: 300"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 5, textAlign: align }}>{language === "ar" ? "لتنبيه النظام عند تجاوز مبالغ الكاش المستلمة لدى هذا المستلم." : "System alerts when cash collected by this point exceeds the ceiling."}</Text>
      </View>}
      {unifiedEntity !== "owner" ? <View style={[styles.toggleRow, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="star" size={17} color={colors.primary} /><Text style={[styles.flex, { color: colors.foreground, fontSize: 12.5, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "حساب الاستلام الافتراضي" : "Primary destination"}</Text><AppToggle value={floatDraft.isDefault} onValueChange={(value) => patchDraft({ isDefault: value })} isRTL={isRTL} activeColor={colors.primary} inactiveColor={colors.border} accessibilityLabel={`${language === "ar" ? "حساب الاستلام الافتراضي" : "Primary destination"}`} /></View> : null}
      <View style={[styles.toggleRow, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="chat" size={17} color="#25D366" /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 12.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "الظهور في قوالب الرسائل (واتساب)" : "WhatsApp templates inclusion"}</Text><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2, textAlign: align }}>{language === "ar" ? "تضمين بيانات هذا الحساب تلقائياً في رسائل الواتساب وقوالب الحجز للعميل" : "Automatically include this account's details in client WhatsApp messages and booking templates"}</Text></View><AppToggle value={unifiedEntity === "owner" ? ownerFlags.whatsApp : floatDraft.whatsApp} onValueChange={(value) => { if (unifiedEntity === "owner") setOwnerFlags((flags) => ({ ...flags, whatsApp: value })); else patchDraft({ whatsApp: value }); }} isRTL={isRTL} activeColor="#25D366" inactiveColor={colors.border} accessibilityLabel={`${language === "ar" ? "تضمين بيانات الحساب في الرسائل" : "Include account in messages"}`} /></View>
      
    </ScrollView><View style={[styles.saveRow, styles.saveBar, { flexDirection: row, borderTopColor: colors.border }]}><RipplePressable rippleColor={colors.background + "3D"} onPress={() => void (unifiedEntity === "owner" ? saveOwnerEditor() : saveFloatEditor())} style={({ pressed }) => [styles.treasurySave, { backgroundColor: colors.primary, opacity: pressed ? 0.72 : 1, flexDirection: row }]}><MaterialIcons name="save" size={16} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 13 }}>{language === "ar" ? "حفظ" : "Save"}</Text></RipplePressable></View></View></View></Modal>

    <Modal transparent visible={pendingDelete !== null} animationType="fade" onRequestClose={() => setPendingDelete(null)} statusBarTranslucent><View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setPendingDelete(null)} /><View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.sheetHeader, { flexDirection: row }]}><View style={[styles.headerIcon, { backgroundColor: colors.error + "16" }]}><MaterialIcons name="delete-outline" size={20} color={colors.error} /></View><Text style={[styles.flex, { color: colors.foreground, fontSize: 18, fontWeight: "900", textAlign: align }]}>{pendingDelete?.title ?? ""}</Text><Pressable accessibilityLabel={language === "ar" ? "إلغاء" : "Cancel"} onPress={() => setPendingDelete(null)} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><Text style={{ color: colors.muted, fontSize: 13.5, lineHeight: 21, marginTop: 13, textAlign: align }}>{pendingDelete?.message ?? ""}</Text><View style={styles.confirmActions}><RipplePressable rippleColor={colors.foreground + "18"} onPress={() => setPendingDelete(null)} style={({ pressed }) => [styles.confirmAction, { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13 }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></RipplePressable><RipplePressable rippleColor={colors.background + "3D"} onPress={() => { const action = pendingDelete?.confirm; setPendingDelete(null); if (action) action(); }} style={({ pressed }) => [styles.confirmAction, { backgroundColor: colors.error, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="delete-outline" size={16} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 13 }}>{language === "ar" ? "حذف" : "Remove"}</Text></RipplePressable></View></View></View></Modal>
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
  channelIcon: { width: 44, height: 44, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  channelTitleRow: { alignItems: "center", gap: 7, flexWrap: "wrap" },
  statusPill: { minHeight: 19, borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3 },
  channelControls: { alignItems: "center", gap: 6, flexShrink: 0 },
  rowSubCard: { borderWidth: 1, borderRadius: 13, padding: 10, gap: 2 },
  rowSubHead: { alignItems: "center", gap: 8 },
  rowRemove: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 3 },
  iconButton: { width: 32, height: 32, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(4, 12, 20, 0.78)" },
  sheet: { width: "100%", maxWidth: 460, borderWidth: 1, borderRadius: 22, padding: 16, paddingBottom: 20 },
  sheetHeader: { alignItems: "center", gap: 10 },
  close: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowDefaultPill: { minHeight: 24, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, gap: 4, flexDirection: "row", alignSelf: "flex-start", marginTop: 8 },
  verifyChip: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center", gap: 6, flexDirection: "row", marginTop: 9 },
  identityCard: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 2 },
  unifiedSheet: { flexDirection: "column", maxHeight: "88%", paddingBottom: 0 },
  entityTabBar: { borderBottomWidth: 1, paddingBottom: 12, marginBottom: 8, marginHorizontal: -16, paddingHorizontal: 16 },
  saveBar: { marginTop: 6, paddingTop: 12, borderTopWidth: 1, paddingBottom: 4, marginHorizontal: -16, paddingHorizontal: 16 },
  badge: { borderWidth: 1, borderRadius: 12, padding: 9, alignItems: "center", gap: 7, marginTop: 10 },
  toggleRow: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, alignItems: "center", gap: 8, marginTop: 9 },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  confirmAction: { flex: 1, minHeight: 46, borderRadius: 13, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
});