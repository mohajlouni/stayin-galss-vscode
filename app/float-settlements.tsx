import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { CalendarDateField } from "@/components/calendar-date-picker";
import { RipplePressable } from "@/components/ripple-pressable";
import { ScreenContainer } from "@/components/screen-container";
import { CHANNEL_META, channelForKind, SettlementModal, type SettlementTarget } from "@/components/settlements/SettlementModal";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { activeOwnerTreasuryAccounts, formatMoney, staffFloatAccounts, todayISO } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { persistPaymentReceipt } from "@/lib/payment-receipt";
import { staffFloatStatements, staffFloatStatementsForUser, type StaffFloatStatement } from "@/lib/reporting";
import { useWorkspaceAccess } from "@/lib/workspace-access";

export default function FloatSettlementsScreen() {
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const { bookings, expenses, staffFloatSettlements, settings, settleStaffFloat, settleStaffReimbursement, requestStaffFloatSettlement, approveStaffFloatSettlement, rejectStaffFloatSettlement } = useBookings();
  const { isManager, can, user, isGuest, isAuthenticated, isSuperAdmin } = useWorkspaceAccess();
  const router = useRouter();
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const isGlobalView = isManager || isSuperAdmin;
  const canSettle = isGlobalView && can("manage_payments");
  const ownerAccounts = useMemo(() => activeOwnerTreasuryAccounts(settings), [settings]);
  const [justSettled, setJustSettled] = useState<string | null>(null);
  const [justReimbursed, setJustReimbursed] = useState<string | null>(null);

  const [settleFor, setSettleFor] = useState<SettlementTarget | null>(null);
  const [reimburseFor, setReimburseFor] = useState<{ floatId: string; label: string; due: number } | null>(null);
  const [recipientAccountId, setRecipientAccountId] = useState<string | null>(null);
  const [settlementDate, setSettlementDate] = useState<string>(todayISO());
  const [settlementNote, setSettlementNote] = useState("");
  const [reimbursementAccountId, setReimbursementAccountId] = useState<string | null>(null);
  const [reimbursementDate, setReimbursementDate] = useState<string>(todayISO());
  const [reimbursementNote, setReimbursementNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [settleAmount, setSettleAmount] = useState<string>("");
  const [requestFor, setRequestFor] = useState<{ floatId: string; label: string; outstanding: number } | null>(null);
  const [requestAmount, setRequestAmount] = useState<string>("");
  const [requestAccountId, setRequestAccountId] = useState<string | null>(null);
  const [requestDate, setRequestDate] = useState<string>(todayISO());
  const [requestNote, setRequestNote] = useState("");
  const [requestReceiptUri, setRequestReceiptUri] = useState<string | undefined>();
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);

  const statements = useMemo(() => staffFloatStatements({ bookings, staffFloatSettlements, settings, expenses }), [bookings, staffFloatSettlements, settings, expenses]);
  const myStatements = useMemo(() => staffFloatStatementsForUser({ bookings, staffFloatSettlements, settings, expenses }, user?.id), [bookings, staffFloatSettlements, settings, expenses, user?.id]);
  const visibleStatements = isGlobalView ? statements : myStatements;
  const ownFloatIds = useMemo(() => new Set(visibleStatements.map((statement) => statement.float.id)), [visibleStatements]);
  const activeStatements = visibleStatements.filter((statement) => statement.float.isActive !== false);
  const totalOutstanding = statements.reduce((sum, statement) => sum + statement.outstanding, 0);

  const defaultAccount = ownerAccounts.find((account) => account.isDefault === true) ?? ownerAccounts[0];

  const openSettle = (statement: StaffFloatStatement) => {
    setRecipientAccountId(defaultAccount?.id ?? null);
    setSettlementDate(todayISO());
    setSettlementNote("");
    setSettleAmount(String(statement.outstanding > 0 ? Math.round(statement.outstanding * 100) / 100 : 0));
    setSettleFor({ floatId: statement.float.id, label: statement.float.label, collectedTotal: statement.collectedTotal, paidOutTotal: statement.paidOutTotal, settledTotal: statement.settledTotal, outstanding: statement.outstanding });
  };
  const openRequest = (statement: StaffFloatStatement) => {
    setRequestAccountId(defaultAccount?.id ?? null);
    setRequestDate(todayISO());
    setRequestNote("");
    setRequestReceiptUri(undefined);
    setRequestAmount(String(Math.max(0, Math.round(statement.outstanding * 100) / 100)));
    setRequestFor({ floatId: statement.float.id, label: statement.float.label, outstanding: statement.outstanding });
  };
  const openReimburse = (statement: StaffFloatStatement) => {
    setReimbursementAccountId(defaultAccount?.id ?? null);
    setReimbursementDate(todayISO());
    setReimbursementNote("");
    setReimburseFor({ floatId: statement.float.id, label: statement.float.label, due: statement.reimbursementDue });
  };

  const confirmSettlement = async () => {
    if (!settleFor || saving) return;
    const account = ownerAccounts.find((item) => item.id === recipientAccountId);
    if (!account) {
      Alert.alert(language === "ar" ? "اختر حساب الخزينة" : "Choose a treasury account", language === "ar" ? "حدد حساب الخزينة الذي سيُورَّد إليه المبلغ (صندوق كاش، CliQ، أو بنك)." : "Select the treasury account receiving the funds (cash vault, CliQ, or bank).");
      return;
    }
    const parsed = Number(settleAmount.replace(",", "."));
    const requested = Number.isFinite(parsed) && parsed > 0 ? parsed : settleFor.outstanding;
    if (requested > settleFor.outstanding + 0.005) {
      Alert.alert(language === "ar" ? "مبلغ غير صحيح" : "Invalid amount", language === "ar" ? `المبلغ المتاح للتوريد هو ${formatMoney(settleFor.outstanding, settings.currency)} فقط.` : `The handover amount cannot exceed ${formatMoney(settleFor.outstanding, settings.currency)}.`);
      return;
    }
    setSaving(true);
    try {
      await settleStaffFloat(settleFor.floatId, settlementNote.trim() || undefined, { recipientAccountId: account.id, recipientAccountLabel: account.label, channel: channelForKind(account.kind), settlementDate, amount: requested });
      setJustSettled(settleFor.floatId);
      setTimeout(() => setJustSettled(null), 2600);
      setSettleFor(null);
    } catch {
      Alert.alert(language === "ar" ? "تعذر التوريد" : "Handover failed", language === "ar" ? "تعذر إتمام تسوية العهدة. حاول مجددًا." : "Could not complete the float settlement. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const confirmReimbursement = async () => {
    if (!reimburseFor || saving) return;
    const account = ownerAccounts.find((item) => item.id === reimbursementAccountId);
    if (!account) {
      Alert.alert(language === "ar" ? "اختر حساب الدفع" : "Choose a paying account", language === "ar" ? "حدد حساب المالك الذي سيُصرف منه التعويض." : "Select the owner account paying the compensation.");
      return;
    }
    setSaving(true);
    try {
      await settleStaffReimbursement(reimburseFor.floatId, { recipientAccountId: account.id, recipientAccountLabel: account.label, channel: channelForKind(account.kind), paymentDate: reimbursementDate, note: reimbursementNote.trim() || undefined });
      setJustReimbursed(reimburseFor.floatId);
      setTimeout(() => setJustReimbursed(null), 2600);
      setReimburseFor(null);
    } catch {
      Alert.alert(language === "ar" ? "تعذر صرف التعويض" : "Compensation failed", language === "ar" ? "تعذر تصفية ذمة الموظف. حاول مجددًا." : "Could not clear the staff liability. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const chooseRequestReceipt = async (source: "camera" | "library") => {
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(language === "ar" ? "إذن الكاميرا مطلوب" : "Camera permission required", language === "ar" ? "اسمح للكاميرا لتصوير إيصال الإيداع." : "Allow camera access to take a deposit receipt photo.");
          return;
        }
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.75 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.75 });
      if (!result.canceled && result.assets[0]?.uri) setRequestReceiptUri(result.assets[0].uri);
    } catch {
      Alert.alert(language === "ar" ? "تعذر إرفاق الإيصال" : "Could not attach receipt", language === "ar" ? "حاول اختيار الصورة مرة أخرى." : "Try selecting the image again.");
    }
  };

  const submitRequest = async () => {
    if (!requestFor || saving) return;
    const parsed = Number(requestAmount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > requestFor.outstanding + 0.005) {
      Alert.alert(language === "ar" ? "مبلغ غير صحيح" : "Invalid amount", language === "ar" ? `أدخل مبلغًا أكبر من صفر ولا يتجاوز ${formatMoney(requestFor.outstanding, settings.currency)}.` : `Enter an amount greater than zero and no more than ${formatMoney(requestFor.outstanding, settings.currency)}.`);
      return;
    }
    const account = ownerAccounts.find((item) => item.id === requestAccountId);
    if (!account) {
      Alert.alert(language === "ar" ? "اختر حساب الخزينة" : "Choose a treasury account", language === "ar" ? "حدد حساب الخزينة المقصود للإيداع." : "Select the treasury account for the deposit.");
      return;
    }
    setSaving(true);
    try {
      const managedReceiptUri = await persistPaymentReceipt(requestReceiptUri, requestFor.floatId, "settlement-request");
      await requestStaffFloatSettlement(requestFor.floatId, { amount: parsed, recipientAccountId: account.id, recipientAccountLabel: account.label, channel: channelForKind(account.kind), settlementDate: requestDate, note: requestNote.trim() || undefined, receiptUri: managedReceiptUri });
      setRequestFor(null);
    } catch {
      Alert.alert(language === "ar" ? "تعذر إرسال الطلب" : "Request failed", language === "ar" ? "تعذر إرسال طلب التوريد إلى المالك. حاول مجددًا." : "Could not send the handover request to the owner. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const confirmPending = async (settlementId: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await approveStaffFloatSettlement(settlementId);
      setJustSettled(settlementId);
      setTimeout(() => setJustSettled(null), 2600);
    } catch {
      Alert.alert(language === "ar" ? "تعذر التأكيد" : "Could not confirm", language === "ar" ? "تعذر تأكيد توريد العهدة. حاول مجددًا." : "Could not confirm the float handover. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const submitRejection = async () => {
    if (!rejecting || saving) return;
    setSaving(true);
    try {
      await rejectStaffFloatSettlement(rejecting.id, rejecting.reason.trim() || undefined);
      setRejecting(null);
    } catch {
      Alert.alert(language === "ar" ? "تعذر الرفض" : "Could not reject", language === "ar" ? "تعذر رفض طلب التوريد. حاول مجددًا." : "Could not reject the handover request. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const pendingSettlements = useMemo(() => (staffFloatSettlements ?? []).filter((entry) => entry.status === "PENDING_APPROVAL").sort((left, right) => right.settledAt.localeCompare(left.settledAt)), [staffFloatSettlements]);
  const visiblePendingSettlements = isGlobalView ? pendingSettlements : pendingSettlements.filter((entry) => ownFloatIds.has(entry.floatId));

  const settlementCommission = (floatId: string) => statements.find((statement) => statement.float.id === floatId)?.commissionEarned ?? 0;

  const floatLabels = useMemo(() => {
    const labels = new Map<string, string>();
    staffFloatAccounts(settings).forEach((account) => labels.set(account.id, account.label));
    return labels;
  }, [settings]);
  const { formatDate } = useAppPreferences();

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <SubScreenHeader title={language === "ar" ? "تسوية العُهد النقدية" : "Float settlements"} fallbackHref="/(tabs)/more" />
    <View style={[styles.info, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "45", flexDirection: row }]}><MaterialIcons name="account-balance-wallet" size={20} color={colors.primary} /><Text style={[styles.flex, { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: align }]}>{language === "ar" ? "دفعات يستلمها الموظفون (إيجار وتأمين) تُسجل ذمة معلقة عليهم. التوريد ينقل الرصيد دفعة واحدة إلى خزينة المالك مع توثيق كامل في سجل التدقيق." : "Payments received by staff (rent and deposits) stay as floats due from them. Handing over moves the whole balance to the owner treasury with full audit trail."}</Text></View>
    {isGlobalView ? <RipplePressable rippleColor={colors.background + "3D"} onPress={() => router.push("/settlements-history")} style={({ pressed }) => [styles.archiveButton, { backgroundColor: "rgba(15,23,42,0.9)", borderColor: "#1E293B", flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="archive" size={17} color="#94A3B8" /><Text style={[styles.flex, { color: "#E2E8F0", fontSize: 12.5, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "أرشيف وسجل التسويات العامة 🗄️" : "Archive & general settlements log 🗄️"}</Text><MaterialIcons name="chevron-right" size={17} color="#64748B" /></RipplePressable> : null}
    {isGlobalView ? <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إجمالي العُهد المعلقة" : "Total pending floats"}</Text><Text style={{ color: totalOutstanding > 0 ? colors.warning : colors.success, fontSize: 21, fontWeight: "900", marginTop: 3, textAlign: align }}>{formatMoney(totalOutstanding, settings.currency)}</Text></View><MaterialIcons name="trending-up" size={28} color={colors.primary} /></View> : null}

    {visiblePendingSettlements.length ? <View style={[styles.pendingPanel, { backgroundColor: colors.surface, borderColor: colors.warning + "60" }]}><View style={[styles.pendingHeader, { flexDirection: row }]}><MaterialIcons name="hourglass-top" size={18} color={colors.warning} /><Text style={[styles.flex, { color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "طلبات توريد عهدة معلقة بانتظار التأكيد (Pending Confirmations)" : "Pending float handover confirmations"}</Text><View style={[styles.countBadge, { backgroundColor: colors.warning + "18" }]}><Text style={{ color: colors.warning, fontSize: 11, fontWeight: "900" }}>{visiblePendingSettlements.length}</Text></View></View>{visiblePendingSettlements.map((pending) => { const floatLabel = floatLabels.get(pending.floatId) ?? pending.floatId; return <View key={pending.id} style={[styles.pendingCard, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? `طلب توريد ${formatMoney(pending.amount, settings.currency)} — ${floatLabel}` : `Handover request ${formatMoney(pending.amount, settings.currency)} — ${floatLabel}`}</Text><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 3, textAlign: align, lineHeight: 16 }}>{[pending.requestedByName ? `${language === "ar" ? "بواسطة" : "By"}: ${pending.requestedByName}` : "", pending.recipientAccountLabel ? `${language === "ar" ? "إلى" : "To"}: ${pending.recipientAccountLabel}` : "", formatDate(pending.settlementDate ?? pending.settledAt.slice(0, 10))].filter(Boolean).join(" · ") || (language === "ar" ? "بانتظار تأكيد المالك" : "Awaiting owner confirmation")}</Text>{pending.receiptUri ? <View style={{ marginTop: 7, alignSelf: align === "right" ? "flex-start" : "flex-end" }}><Image source={{ uri: pending.receiptUri }} style={styles.receiptImage} /></View> : null}{pending.note ? <Text style={{ color: colors.muted, fontSize: 10, marginTop: 5, textAlign: align }}>{pending.note}</Text> : null}{rejecting && rejecting.id === pending.id ? <View style={styles.rejectBox}><TextInput value={rejecting.reason} onChangeText={(text) => setRejecting((current) => current ? { ...current, reason: text } : current)} placeholder={language === "ar" ? "سبب الرفض / التعديل (اختياري)" : "Rejection / adjustment reason (optional)"} placeholderTextColor={colors.muted} style={[styles.noteInput, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align, marginTop: 8, minHeight: 42 }]} /><View style={[styles.pendingActions, { flexDirection: row, marginTop: 8 }]}><RipplePressable rippleColor={colors.background + "3D"} disabled={saving} onPress={() => void submitRejection()} style={({ pressed }) => [styles.approveButton, { backgroundColor: colors.error, opacity: pressed || saving ? 0.72 : 1, flex: 1 }]}><MaterialIcons name="block" size={15} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 11.5 }}>{language === "ar" ? "تأكيد الرفض" : "Confirm rejection"}</Text></RipplePressable><RipplePressable rippleColor={colors.background + "3D"} disabled={saving} onPress={() => setRejecting(null)} style={({ pressed }) => [styles.rejectButton, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.72 : 1 }]}><Text style={{ color: colors.muted, fontWeight: "900", fontSize: 11.5 }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></RipplePressable></View></View> : null}</View>{canSettle ? <View style={styles.pendingActions}>{rejecting && rejecting.id === pending.id ? null : <><RipplePressable rippleColor={colors.background + "3D"} disabled={saving} onPress={() => void confirmPending(pending.id)} style={({ pressed }) => [styles.approveButton, { backgroundColor: colors.success, opacity: pressed || saving ? 0.72 : 1 }]}><MaterialIcons name="check" size={15} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 11.5 }}>{justSettled === pending.id ? (language === "ar" ? "تم التأكيد ✓" : "Confirmed ✓") : (language === "ar" ? "✔ تأكيد الاستلام والإيداع" : "Confirm receipt & deposit")}</Text></RipplePressable><RipplePressable rippleColor={colors.background + "3D"} disabled={saving} onPress={() => setRejecting({ id: pending.id, reason: "" })} style={({ pressed }) => [styles.rejectButton, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.72 : 1 }]}><MaterialIcons name="close" size={15} color={colors.error} /><Text style={{ color: colors.error, fontWeight: "900", fontSize: 11.5 }}>{language === "ar" ? "✖ رفض / تعديل" : "Reject / adjust"}</Text></RipplePressable></>}</View> : <View style={[styles.countBadge, { backgroundColor: colors.warning + "16", alignSelf: "flex-start" }]}><MaterialIcons name="schedule" size={11} color={colors.warning} /><Text style={{ color: colors.warning, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "بانتظار تأكيد المالك" : "Awaiting owner confirmation"}</Text></View>}</View>; })}</View> : null}

    {activeStatements.length ? activeStatements.map((statement) => {
      const account = statement.float;
      const hasOutstanding = statement.outstanding > 0.005;
      const hasReimbursement = statement.reimbursementDue > 0.005;
      return <View key={account.id} style={[styles.floatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.floatHeader, { flexDirection: row }]}><View style={[styles.floatIcon, { backgroundColor: colors.sky + "18" }]}><MaterialIcons name="person" size={20} color="#0284C7" /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", textAlign: align }}>{account.label}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 2, textAlign: align }}>{[account.memberName ? `${language === "ar" ? "الموظف" : "Employee"}: ${account.memberName}` : "", account.cliqAlias ? `CliQ: ${account.cliqAlias}` : ""].filter(Boolean).join(" · ") || (language === "ar" ? "نقطة تحصيل عامة" : "General collection point")}</Text></View><View style={[styles.floatBadge, { backgroundColor: hasOutstanding ? colors.warning + "18" : colors.success + "18" }]}><Text style={{ color: hasOutstanding ? colors.warning : colors.success, fontSize: 10.5, fontWeight: "900" }}>{hasOutstanding ? formatMoney(statement.outstanding, settings.currency) : (language === "ar" ? "مسوّاة" : "Settled")}</Text></View></View>
        <View style={[styles.floatStats, { flexDirection: row }]}><View style={styles.stat}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? "المستلم" : "Received"}</Text><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", marginTop: 2, textAlign: align }}>{formatMoney(statement.collectedTotal, settings.currency)}</Text></View><View style={styles.stat}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? "المرجوع/الخصم" : "Refunded/deducted"}</Text><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", marginTop: 2, textAlign: align }}>{formatMoney(statement.paidOutTotal, settings.currency)}</Text></View><View style={styles.stat}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? "المورَّد للمالك" : "Handed over"}</Text><Text style={{ color: colors.success, fontSize: 13, fontWeight: "900", marginTop: 2, textAlign: align }}>{formatMoney(statement.settledTotal, settings.currency)}</Text></View></View>
        {hasReimbursement ? <View style={[styles.dueRow, { backgroundColor: colors.warning + "12", borderColor: colors.warning + "4D", flexDirection: row }]}><MaterialIcons name="payments" size={15} color={colors.warning} /><Text style={[styles.flex, { color: colors.warning, fontSize: 10.5, fontWeight: "900", textAlign: align }]}>{language === "ar" ? `ذمة للموظف (مصروفات دفعها من جيبه): ${formatMoney(statement.reimbursementDue, settings.currency)}` : `Due to staff (out-of-pocket expenses): ${formatMoney(statement.reimbursementDue, settings.currency)}`}</Text></View> : null}
        {statement.reimbursementPaid > 0 ? <View style={[styles.paidRow, { backgroundColor: colors.success + "12", borderColor: colors.success + "4D", flexDirection: row }]}><MaterialIcons name="verified" size={15} color={colors.success} /><Text style={[styles.flex, { color: colors.success, fontSize: 10.5, fontWeight: "900", textAlign: align }]}>{language === "ar" ? `تعويضات صُرفت للموظف: ${formatMoney(statement.reimbursementPaid, settings.currency)}` : `Compensation paid to staff: ${formatMoney(statement.reimbursementPaid, settings.currency)}`}</Text></View> : null}
        {statement.commissionEarned > 0.005 ? <View style={[styles.commissionRow, { backgroundColor: "#8B5CF6" + "12", borderColor: "#8B5CF6" + "4D", flexDirection: row }]}><MaterialIcons name="payments" size={15} color="#8B5CF6" /><Text style={[styles.flex, { color: "#8B5CF6", fontSize: 10.5, fontWeight: "900", textAlign: align }]}>{language === "ar" ? `عمولات مستحقة للموظف (Commissions Earned): ${formatMoney(statement.commissionEarned, settings.currency)}` : `Commissions earned by staff: ${formatMoney(statement.commissionEarned, settings.currency)}`}</Text></View> : null}
        {canSettle ? <>
          {hasReimbursement ? <RipplePressable rippleColor={colors.background + "3D"} onPress={() => void openReimburse(statement)} style={({ pressed }) => [styles.reimburseButton, { backgroundColor: hasReimbursement ? "#F59E0B" : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="payments" size={16} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 12 }}>{justReimbursed === account.id ? (language === "ar" ? "تم صرف التعويض ✓" : "Compensation paid ✓") : (language === "ar" ? "صرف تعويض للموظف / تصفية الذمة" : "Pay staff compensation / clear liability")}</Text></RipplePressable> : null}
          <RipplePressable rippleColor={colors.background + "3D"} disabled={!hasOutstanding} onPress={() => void openSettle(statement)} style={({ pressed }) => [styles.settleButton, { backgroundColor: hasOutstanding ? "#0EA5E9" : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="account-balance" size={16} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 12 }}>{justSettled === account.id ? (language === "ar" ? "تم التوريد ✓" : "Handed over ✓") : (language === "ar" ? "تسوية وتوريد العهدة للمالك" : "Hand over to owner")}</Text></RipplePressable>
        </> : (isAuthenticated && !isGuest ? <>
          {hasOutstanding ? <RipplePressable rippleColor={colors.background + "3D"} onPress={() => void openRequest(statement)} style={({ pressed }) => [styles.settleButton, { backgroundColor: "#8B5CF6", opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="send" size={16} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "طلب توريد وتسليم نقدية للمالك 📤" : "Request cash handover to owner 📤"}</Text></RipplePressable> : null}
        </> : <View style={[styles.readonlyHint, { backgroundColor: colors.surfaceMuted }]}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: align }}>{language === "ar" ? "التوريد متاح للمالك والمسؤول المفوض فقط." : "Handover is limited to the owner or a delegated manager."}</Text></View>)}
        <RipplePressable rippleColor={colors.background + "3D"} onPress={() => router.push({ pathname: "/staff-float-ledger/[staffId]", params: { staffId: account.id } } as never)} style={({ pressed }) => [styles.ledgerButton, { backgroundColor: "transparent", borderColor: colors.sky + "50", borderWidth: 1, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="receipt-long" size={16} color="#0284C7" /><Text style={{ color: "#0284C7", fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "سجل الحركات وكشف الحساب 📋" : "Movement log & statement per staff 📋"}</Text></RipplePressable>
        {statement.settlements.length ? <View style={styles.history}><Text style={{ color: colors.muted, fontSize: 10.5, fontWeight: "900", textAlign: align }}>{language === "ar" ? "سجل التوريد" : "Handover history"}</Text>{statement.settlements.map((settlement) => <View key={settlement.id} style={[styles.historyRow, { backgroundColor: colors.background, flexDirection: row }]}><MaterialIcons name="verified" size={15} color={colors.success} /><Text numberOfLines={1} style={[styles.flex, { color: colors.muted, fontSize: 10.5, fontWeight: "700", textAlign: align }]}>{language === "ar" ? `توريد ${formatMoney(settlement.amount, settings.currency)}${settlement.recipientAccountLabel ? ` · ${settlement.recipientAccountLabel}` : ""}${settlement.note ? ` · ${settlement.note}` : ""}` : `Handed over ${formatMoney(settlement.amount, settings.currency)}${settlement.recipientAccountLabel ? ` · ${settlement.recipientAccountLabel}` : ""}${settlement.note ? ` · ${settlement.note}` : ""}`}</Text><Text style={{ color: colors.muted, fontSize: 10 }}>{formatDate(settlement.settlementDate ?? settlement.settledAt.slice(0, 10))}</Text></View>)}</View> : null}
      </View>;
    }) : <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="account-balance-wallet" size={22} color={colors.muted} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{isGlobalView ? (language === "ar" ? "لا توجد عُهد موظفين بعد" : "No staff floats yet") : (language === "ar" ? "لا توجد عهدة مرتبطة بحسابك" : "No float linked to your account")}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: align }}>{isGlobalView ? (language === "ar" ? "أضف نقاط تحصيل من «طرق الدفع والحسابات المالية» أولًا، وستندرج العُهد هنا تلقائيًا." : "Add collection points under “Payment methods & financial accounts” first; floats will appear here automatically.") : (language === "ar" ? "تواصل مع المالك لربط عهدة نقدية بحسابك قبل تحصيل أي مبالغ." : "Contact the owner to link a cash float to your account before collecting any payments.")}</Text></View></View>}


    <SettlementModal
      visible={Boolean(settleFor)}
      target={settleFor}
      settleAmount={settleAmount}
      onSettleAmountChange={setSettleAmount}
      recipientAccountId={recipientAccountId}
      onRecipientAccountIdChange={setRecipientAccountId}
      settlementDate={settlementDate}
      onSettlementDateChange={setSettlementDate}
      settlementNote={settlementNote}
      onSettlementNoteChange={setSettlementNote}
      commission={settleFor ? settlementCommission(settleFor.floatId) : 0}
      saving={saving}
      onConfirm={() => void confirmSettlement()}
      onClose={() => !saving && setSettleFor(null)}
    />
    <Modal visible={Boolean(reimburseFor)} transparent animationType="slide" onRequestClose={() => !saving && setReimburseFor(null)}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.modalHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "900", textAlign: align }}>{language === "ar" ? "صرف تعويض للموظف / تصفية الذمة" : "Pay staff compensation / clear liability"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{reimburseFor ? `${language === "ar" ? "الموظف" : "Employee"}: ${reimburseFor.label}` : ""}</Text></View><Pressable disabled={saving} onPress={() => setReimburseFor(null)} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.65 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {reimburseFor ? <View style={[styles.breakdown, { backgroundColor: colors.background, borderColor: colors.warning + "55" }]}><View style={[styles.breakdownRow, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.muted, fontSize: 11.5, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "ذمة مستحقة للموظف (مصروفات من جيبه)" : "Due to staff (out-of-pocket expenses)"}</Text><Text style={{ color: "#F59E0B", fontSize: 15, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(reimburseFor.due, settings.currency)}</Text></View><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 7, textAlign: align }}>{language === "ar" ? "سيُسجل قيد تعويض تلقائيًا في المصروفات (التصنيف: أخرى / تصفية ذمة موظف) ويُصفَّر رصيد الذمة للموظف." : "An automatic compensation expense will be recorded (category: Other / settle staff liability) and the staff balance will be cleared."}</Text></View> : null}
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align, marginTop: 13 }}>{language === "ar" ? "حساب المالك الدافع" : "Paying owner account"}</Text>
      {ownerAccounts.length ? <View style={[styles.accountList, { flexDirection: "column" }]}>{ownerAccounts.map((account) => { const channel = channelForKind(account.kind); const meta = CHANNEL_META[channel]; const selected = reimbursementAccountId === account.id; return <Pressable key={account.id} onPress={() => setReimbursementAccountId(account.id)} style={({ pressed }) => [styles.accountOption, { backgroundColor: selected ? colors.primary + "12" : colors.background, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1, flexDirection: row }]}><MaterialIcons name={meta.icon} size={18} color={selected ? colors.primary : colors.muted} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{account.label}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? meta.ar : meta.en}</Text></View>{selected ? <MaterialIcons name="check-circle" size={18} color={colors.primary} /> : null}</Pressable>; })}</View> : <View style={[styles.accountList, { backgroundColor: colors.warning + "12", borderColor: colors.warning + "4D" }]}><Text style={{ color: colors.warning, fontSize: 11, fontWeight: "800", textAlign: align }}>{language === "ar" ? "لا توجد حسابات خزينة مفعلة — أضفها من «طرق الدفع والحسابات المالية» أولًا." : "No active treasury accounts — add them under “Payment methods & financial accounts” first."}</Text></View>}
      <View style={{ marginTop: 13 }}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تاريخ الصرف" : "Payment date"}</Text><CalendarDateField label={language === "ar" ? "تاريخ الصرف" : "Payment date"} value={reimbursementDate} onChange={setReimbursementDate} /></View>
      <TextInput value={reimbursementNote} onChangeText={setReimbursementNote} placeholder={language === "ar" ? "ملاحظة الصرف (اختياري)" : "Payment note (optional)"} placeholderTextColor={colors.muted} style={[styles.noteInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
      <RipplePressable rippleColor={colors.background + "3D"} disabled={saving || !ownerAccounts.length} onPress={() => void confirmReimbursement()} style={({ pressed }) => [styles.confirmButton, { backgroundColor: "#F59E0B", opacity: pressed || saving ? 0.72 : 1 }]}><MaterialIcons name="payments" size={17} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 13 }}>{saving ? (language === "ar" ? "جارٍ الصرف..." : "Paying...") : (language === "ar" ? "صرف تعويض للموظف / تصفية الذمة" : "Pay staff compensation / clear liability")}</Text></RipplePressable>
    </ScrollView></View></View></Modal>

    <Modal visible={Boolean(requestFor)} transparent animationType="slide" onRequestClose={() => !saving && setRequestFor(null)}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.modalHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "900", textAlign: align }}>{language === "ar" ? "طلب توريد العهدة للمالك" : "Request float handover"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{requestFor ? `${language === "ar" ? "العهدة" : "Float"}: ${requestFor.label}` : ""}</Text></View><Pressable disabled={saving} onPress={() => setRequestFor(null)} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.65 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {requestFor ? <View style={[styles.breakdown, { backgroundColor: colors.background, borderColor: colors.primary + "55" }]}><View style={[styles.breakdownRow, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.muted, fontSize: 11.5, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "الرصيد المعلق بذمتك" : "Outstanding float due from you"}</Text><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(requestFor.outstanding, settings.currency)}</Text></View>{settlementCommission(requestFor.floatId) > 0.005 ? <View style={[styles.breakdownRow, { flexDirection: row }]}><Text style={[styles.flex, { color: "#8B5CF6", fontSize: 11.5, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "عمولات مستحقة لك" : "Commissions earned by you"}</Text><Text style={{ color: "#8B5CF6", fontSize: 12, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(settlementCommission(requestFor.floatId), settings.currency)}</Text></View> : null}<Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4, textAlign: align }}>{language === "ar" ? "سيُرسل الطلب للمالك للتأكيد. لا تُسجَّل أي حركة مالية حتى يعتمد المالك الاستلام والإيداع." : "The request is sent to the owner for confirmation. No financial movement is recorded until the owner approves receipt and deposit."}</Text></View> : null}
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align, marginTop: 13 }}>{language === "ar" ? "المبلغ المطلوب توريده" : "Amount to hand over"}</Text>
      <TextInput value={requestAmount} onChangeText={setRequestAmount} keyboardType="decimal-pad" placeholder={`${language === "ar" ? "المبلغ" : "Amount"} (${requestFor ? formatMoney(requestFor.outstanding, settings.currency) : ""})`} placeholderTextColor={colors.muted} style={[styles.noteInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: align, marginTop: 8 }]} />
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align, marginTop: 13 }}>{language === "ar" ? "حساب الخزينة المستلم" : "Receiving treasury account"}</Text>
      {ownerAccounts.length ? <View style={[styles.accountList, { flexDirection: "column" }]}>{ownerAccounts.map((account) => { const channel = channelForKind(account.kind); const meta = CHANNEL_META[channel]; const selected = requestAccountId === account.id; return <Pressable key={account.id} onPress={() => setRequestAccountId(account.id)} style={({ pressed }) => [styles.accountOption, { backgroundColor: selected ? colors.primary + "12" : colors.background, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1, flexDirection: row }]}><MaterialIcons name={meta.icon} size={18} color={selected ? colors.primary : colors.muted} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{account.label}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? meta.ar : meta.en}{account.detail ? ` · ${account.detail}` : ""}</Text></View>{selected ? <MaterialIcons name="check-circle" size={18} color={colors.primary} /> : null}</Pressable>; })}</View> : <View style={[styles.accountList, { backgroundColor: colors.warning + "12", borderColor: colors.warning + "4D" }]}><Text style={{ color: colors.warning, fontSize: 11, fontWeight: "800", textAlign: align }}>{language === "ar" ? "لا توجد حسابات خزينة مفعلة — أضفها من «طرق الدفع والحسابات المالية» أولًا." : "No active treasury accounts — add them under “Payment methods & financial accounts” first."}</Text></View>}
      <View style={{ marginTop: 13 }}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تاريخ التوريد" : "Handover date"}</Text><CalendarDateField label={language === "ar" ? "تاريخ التوريد" : "Handover date"} value={requestDate} onChange={setRequestDate} /></View>
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align, marginTop: 13 }}>{language === "ar" ? "إرفاق إيصال التوريد (اختياري)" : "Attach handover receipt (optional)"}</Text>
      <View style={[styles.receiptActions, { flexDirection: row }]}><RipplePressable rippleColor={colors.background + "3D"} disabled={saving} onPress={() => void chooseRequestReceipt("camera")} style={({ pressed }) => [styles.receiptButton, { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed || saving ? 0.72 : 1 }]}><MaterialIcons name="photo-camera" size={16} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 11.5, fontWeight: "900" }}>{language === "ar" ? "كاميرا" : "Camera"}</Text></RipplePressable><RipplePressable rippleColor={colors.background + "3D"} disabled={saving} onPress={() => void chooseRequestReceipt("library")} style={({ pressed }) => [styles.receiptButton, { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed || saving ? 0.72 : 1 }]}><MaterialIcons name="photo-library" size={16} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 11.5, fontWeight: "900" }}>{language === "ar" ? "المعرض" : "Library"}</Text></RipplePressable>{requestReceiptUri ? <RipplePressable rippleColor={colors.background + "3D"} disabled={saving} onPress={() => setRequestReceiptUri(undefined)} style={({ pressed }) => [styles.receiptButton, { backgroundColor: colors.error + "12", borderColor: colors.error + "45", opacity: pressed || saving ? 0.72 : 1 }]}><MaterialIcons name="delete" size={16} color={colors.error} /><Text style={{ color: colors.error, fontSize: 11.5, fontWeight: "900" }}>{language === "ar" ? "إزالة" : "Remove"}</Text></RipplePressable> : null}</View>
      {requestReceiptUri ? <Image source={{ uri: requestReceiptUri }} style={styles.receiptPreview} /> : null}
      <TextInput value={requestNote} onChangeText={setRequestNote} placeholder={language === "ar" ? "ملاحظة للمالك (اختياري)" : "Note to owner (optional)"} placeholderTextColor={colors.muted} style={[styles.noteInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
      <RipplePressable rippleColor={colors.background + "3D"} disabled={saving || !ownerAccounts.length} onPress={() => void submitRequest()} style={({ pressed }) => [styles.confirmButton, { backgroundColor: "#8B5CF6", opacity: pressed || saving ? 0.72 : 1 }]}><MaterialIcons name="send" size={17} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 13 }}>{saving ? (language === "ar" ? "جارٍ الإرسال..." : "Sending...") : (language === "ar" ? "إرسال طلب التوريد للمالك" : "Send handover request")}</Text></RipplePressable>
    </ScrollView></View></View></Modal>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 34 },
  flex: { flex: 1, minWidth: 0 },
  info: { borderWidth: 1, borderRadius: 15, padding: 12, alignItems: "flex-start", gap: 9 },
  summary: { borderWidth: 1, borderRadius: 16, padding: 13, alignItems: "center", gap: 10, marginTop: 13 },
  archiveButton: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, marginTop: 12, borderWidth: 1, shadowColor: "#000000", shadowOpacity: 0.16, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  floatCard: { borderWidth: 1, borderRadius: 17, padding: 12, marginTop: 12 },
  floatHeader: { alignItems: "center", gap: 9 },
  floatIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  floatBadge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  floatStats: { gap: 8, marginTop: 11 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 13, padding: 9, backgroundColor: undefined },
  dueRow: { borderWidth: 1, borderRadius: 12, padding: 9, alignItems: "center", gap: 7, marginTop: 11 },
  paidRow: { borderWidth: 1, borderRadius: 12, padding: 9, alignItems: "center", gap: 7, marginTop: 11 },
  settleButton: { minHeight: 46, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, marginTop: 11 },
  reimburseButton: { minHeight: 46, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, marginTop: 11 },
  ledgerButton: { minHeight: 46, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, marginTop: 11 },
  readonlyHint: { borderRadius: 12, padding: 9, marginTop: 11 },
  history: { marginTop: 11, gap: 6 },
  historyRow: { borderRadius: 11, padding: 8, alignItems: "center", gap: 7 },
  countBadge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  empty: { borderWidth: 1, borderRadius: 16, padding: 14, alignItems: "center", gap: 10, marginTop: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modal: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "92%", paddingBottom: 26 },
  modalHeader: { alignItems: "center", gap: 10, padding: 14, paddingBottom: 6 },
  close: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  formContent: { paddingHorizontal: 16, paddingBottom: 14 },
  breakdown: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 10, marginTop: 8 },
  breakdownRow: { alignItems: "center", gap: 10 },
  accountList: { borderWidth: 1, borderRadius: 14, padding: 6, gap: 6, marginTop: 8 },
  accountOption: { borderRadius: 12, padding: 10, alignItems: "center", gap: 9 },
  noteInput: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, fontSize: 12, marginTop: 13 },
  confirmButton: { minHeight: 50, borderRadius: 14, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, marginTop: 14 },
  pendingPanel: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 13, gap: 9 },
  pendingHeader: { alignItems: "center", gap: 8 },
  pendingCard: { borderWidth: 1, borderRadius: 14, padding: 11, gap: 10 },
  pendingActions: { justifyContent: "flex-end", alignItems: "center", gap: 7 },
  approveButton: { minHeight: 40, borderRadius: 11, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  rejectButton: { minHeight: 40, borderRadius: 11, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  rejectBox: { marginTop: 4 },
  receiptImage: { width: 52, height: 52, borderRadius: 8 },
  commissionRow: { borderWidth: 1, borderRadius: 12, padding: 9, alignItems: "center", gap: 7, marginTop: 11 },
  receiptActions: { gap: 8, marginTop: 8 },
  receiptButton: { minHeight: 40, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  receiptPreview: { width: "100%", height: 150, borderRadius: 13, marginTop: 9, resizeMode: "cover" },
});
