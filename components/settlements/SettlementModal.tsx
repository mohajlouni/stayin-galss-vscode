import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { CalendarDateField } from "@/components/calendar-date-picker";
import { RipplePressable } from "@/components/ripple-pressable";
import { StaffLedgerDrawer } from "@/components/settlements/StaffLedgerDrawer";
import { activeOwnerTreasuryAccounts, formatMoney } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

export type AccountChannelMeta = { icon: React.ComponentProps<typeof MaterialIcons>["name"]; ar: string; en: string };
export const CHANNEL_META: Record<"vault" | "cliq" | "bank", AccountChannelMeta> = {
  vault: { icon: "payments", ar: "كاش من صندوق الخزينة المركزية", en: "Cash from central treasury" },
  cliq: { icon: "bolt", ar: "إيداع بحساب المالك (CliQ)", en: "Deposit to owner account (CliQ)" },
  bank: { icon: "account-balance", ar: "حوالة بنكية (IBAN) لحساب المالك", en: "Bank transfer (IBAN) to owner account" },
};

export function channelForKind(kind: "cliq" | "bank" | "vault" | "other"): "vault" | "cliq" | "bank" {
  return kind === "cliq" ? "cliq" : kind === "bank" ? "bank" : "vault";
}

export type SettlementTarget = { floatId: string; label: string; collectedTotal: number; paidOutTotal: number; settledTotal: number; outstanding: number };

type SettlementModalProps = {
  visible: boolean;
  target: SettlementTarget | null;
  settleAmount: string;
  onSettleAmountChange: (text: string) => void;
  recipientAccountId: string | null;
  onRecipientAccountIdChange: (id: string) => void;
  settlementDate: string;
  onSettlementDateChange: (date: string) => void;
  settlementNote: string;
  onSettlementNoteChange: (text: string) => void;
  commission: number;
  saving: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** نافذة تسوية وتوريد العهدة للمالك — تُحفظ قيم المدخلات أثناء معاينة الحركات داخل لوحة فرعية فوقها دون قفل الواجهة. */
export function SettlementModal({ visible, target, settleAmount, onSettleAmountChange, recipientAccountId, onRecipientAccountIdChange, settlementDate, onSettlementDateChange, settlementNote, onSettlementNoteChange, commission, saving, onConfirm, onClose }: SettlementModalProps) {
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const { settings } = useBookings();
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const ownerAccounts = useMemo(() => activeOwnerTreasuryAccounts(settings), [settings]);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!visible || !target) setPreviewOpen(false);
  }, [visible, target]);

  const close = () => {
    setPreviewOpen(false);
    onClose();
  };

  return <Modal visible={visible && Boolean(target)} transparent animationType="slide" onRequestClose={() => !saving && close()}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.modalHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تسوية وتوريد العهدة للمالك" : "Hand over float to owner"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{target ? `${language === "ar" ? "العهدة" : "Float"}: ${target.label}` : ""}</Text></View><Pressable disabled={saving} onPress={close} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.65 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {target ? <View style={[styles.breakdown, { backgroundColor: colors.background, borderColor: colors.border }]}><View style={[styles.breakdownRow, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.muted, fontSize: 11.5, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "إجمالي المحصل" : "Total collected"}</Text><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(target.collectedTotal, settings.currency)}</Text></View><View style={[styles.breakdownRow, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.muted, fontSize: 11.5, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "المخصوم كفواتير مصاريف" : "Deducted as expense invoices"}</Text><Text style={{ color: colors.warning, fontSize: 13, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(target.paidOutTotal, settings.currency)}</Text></View>{target.settledTotal > 0.005 ? <View style={[styles.breakdownRow, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.muted, fontSize: 11.5, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "المورَّد سابقًا" : "Previously handed over"}</Text><Text style={{ color: colors.success, fontSize: 13, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(target.settledTotal, settings.currency)}</Text></View> : null}{commission > 0.005 ? <View style={[styles.breakdownRow, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.muted, fontSize: 11.5, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "عمولات مستحقة للموظف (Commissions Earned)" : "Commissions earned by staff"}</Text><Text style={{ color: "#8B5CF6", fontSize: 13, fontWeight: "900", writingDirection: "ltr" }}>- {formatMoney(commission, settings.currency)}</Text></View> : null}<View style={[styles.breakdownDivider, { backgroundColor: colors.border }]} /><View style={[styles.breakdownRow, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "صافي المبلغ المطلوب توريده" : "Net amount due to be handed over"}</Text><Text style={{ color: "#0EA5E9", fontSize: 16, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(target.outstanding, settings.currency)}</Text></View><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 7, textAlign: align }}>{language === "ar" ? "المخصوم يشمل إرجاعات التأمين وخصومات الأضرار ومصروفات العهدة المعتمدة (المرجوع/الخصم)." : "Deductions include deposit refunds, damage compensations, and approved float expenses."}</Text></View> : null}
      {target ? <View style={[styles.amountCard, { backgroundColor: colors.background, borderColor: colors.border }]}><View style={{ flexDirection: row }}><Text style={[styles.flex, { color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "المبلغ المورّد" : "Amount handed over"}</Text>{(() => { const parsed = Number(settleAmount.replace(",", ".")); const entered = Number.isFinite(parsed) && parsed > 0 ? parsed : target.outstanding; const remaining = Math.max(0, Math.round((target.outstanding - entered) * 100) / 100); const invalid = Number.isFinite(parsed) && parsed > target.outstanding + 0.005; return <View style={[styles.remainingBadge, { backgroundColor: invalid ? colors.error + "18" : (remaining > 0.005 ? colors.warning + "18" : colors.success + "18") }]}><Text style={{ color: invalid ? colors.error : (remaining > 0.005 ? colors.warning : colors.success), fontSize: 10.5, fontWeight: "900", textAlign: align }}>{language === "ar" ? `المتبقي كعهدة معلقة بذمة الموظف: ${formatMoney(remaining, settings.currency)}` : `Remaining as pending float due from employee: ${formatMoney(remaining, settings.currency)}`}</Text></View>; })()}</View><View style={[styles.amountField, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: "row" }]}><TextInput value={settleAmount} onChangeText={onSettleAmountChange} keyboardType="decimal-pad" placeholder={`${language === "ar" ? "المبلغ" : "Amount"} (${formatMoney(target.outstanding, settings.currency)})`} placeholderTextColor={colors.muted} style={[styles.amountInput, { color: colors.foreground }]} /><Text style={{ color: colors.muted, fontSize: 13, fontWeight: "900", writingDirection: "ltr" }}>{settings.currency}</Text></View><RipplePressable rippleColor={colors.background + "3D"} onPress={() => setPreviewOpen(true)} style={({ pressed }) => [styles.breakdownToggle, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "40", flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="open-in-new" size={16} color={colors.primary} /><Text style={[styles.flex, { color: colors.primary, fontSize: 12, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "معاينة الحركات المشمولة في شاشة مستقلة ↗" : "Preview included movements in a separate screen ↗"}</Text></RipplePressable></View> : null}
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align, marginTop: 13 }}>{language === "ar" ? "حساب الخزينة المستلم" : "Receiving treasury account"}</Text>
      {ownerAccounts.length ? <View style={[styles.accountList, { flexDirection: "column" }]}>{ownerAccounts.map((account) => { const channel = channelForKind(account.kind); const meta = CHANNEL_META[channel]; const selected = recipientAccountId === account.id; return <Pressable key={account.id} onPress={() => onRecipientAccountIdChange(account.id)} style={({ pressed }) => [styles.accountOption, { backgroundColor: selected ? colors.primary + "12" : colors.background, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1, flexDirection: row }]}><MaterialIcons name={meta.icon} size={18} color={selected ? colors.primary : colors.muted} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{account.label}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? meta.ar : meta.en}{account.detail ? ` · ${account.detail}` : ""}</Text></View>{selected ? <MaterialIcons name="check-circle" size={18} color={colors.primary} /> : null}</Pressable>; })}</View> : <View style={[styles.accountList, { backgroundColor: colors.warning + "12", borderColor: colors.warning + "4D" }]}><Text style={{ color: colors.warning, fontSize: 11, fontWeight: "800", textAlign: align }}>{language === "ar" ? "لا توجد حسابات خزينة مفعلة — أضفها من «طرق الدفع والحسابات المالية» أولًا." : "No active treasury accounts — add them under “Payment methods & financial accounts” first."}</Text></View>}
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align, marginTop: 13 }}>{language === "ar" ? "تاريخ التسوية" : "Settlement date"}</Text><CalendarDateField label={language === "ar" ? "تاريخ التسوية" : "Settlement date"} value={settlementDate} onChange={onSettlementDateChange} />
      <TextInput value={settlementNote} onChangeText={onSettlementNoteChange} placeholder={language === "ar" ? "ملاحظة التوريد (اختياري)" : "Handover note (optional)"} placeholderTextColor={colors.muted} style={[styles.noteText, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
      <RipplePressable rippleColor={colors.background + "3D"} disabled={saving || !ownerAccounts.length} onPress={() => void onConfirm()} style={({ pressed }) => [styles.confirmButton, { backgroundColor: "#0EA5E9", opacity: pressed || saving ? 0.72 : 1 }]}><MaterialIcons name="account-balance" size={17} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 13 }}>{saving ? (language === "ar" ? "جارٍ التوريد..." : "Handing over...") : (language === "ar" ? "تأكيد التوريد" : "Confirm handover")}</Text></RipplePressable>
    </ScrollView><StaffLedgerDrawer visible={previewOpen} floatId={target?.floatId ?? null} onClose={() => setPreviewOpen(false)} /></View></View></Modal>;
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modal: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "92%", paddingBottom: 26 },
  modalHeader: { alignItems: "center", gap: 10, padding: 14, paddingBottom: 6 },
  close: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  formContent: { paddingHorizontal: 16, paddingBottom: 14 },
  breakdown: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 10, marginTop: 8 },
  breakdownRow: { alignItems: "center", gap: 10 },
  breakdownDivider: { height: 1 },
  amountCard: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 7, marginTop: 8 },
  remainingBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  amountField: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, alignItems: "center", marginTop: 9 },
  amountInput: { flex: 1, minHeight: 46, paddingVertical: 0, fontSize: 15, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  breakdownToggle: { minHeight: 42, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", gap: 6, marginTop: 10 },
  accountList: { borderWidth: 1, borderRadius: 14, padding: 6, gap: 6, marginTop: 8 },
  accountOption: { borderRadius: 12, padding: 10, alignItems: "center", gap: 9 },
  noteText: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, fontSize: 12, marginTop: 13 },
  confirmButton: { minHeight: 50, borderRadius: 14, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, marginTop: 14 },
});