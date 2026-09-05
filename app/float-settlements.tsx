import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { RipplePressable } from "@/components/ripple-pressable";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { formatMoney } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { staffFloatStatements } from "@/lib/reporting";
import { useWorkspaceAccess } from "@/lib/workspace-access";

export default function FloatSettlementsScreen() {
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const { bookings, staffFloatSettlements, settings, settleStaffFloat } = useBookings();
  const { isManager, can } = useWorkspaceAccess();
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const canSettle = isManager && can("manage_payments");
  const [noteFor, setNoteFor] = useState<Record<string, string>>({});
  const [justSettled, setJustSettled] = useState<string | null>(null);

  const statements = useMemo(() => staffFloatStatements({ bookings, staffFloatSettlements, settings }), [bookings, staffFloatSettlements, settings]);
  const activeStatements = statements.filter((statement) => statement.float.isActive !== false);
  const totalOutstanding = statements.reduce((sum, statement) => sum + statement.outstanding, 0);

  const settleNow = async (floatId: string, label: string, outstanding: number) => {
    const note = (noteFor[floatId] ?? "").trim();
    Alert.alert(language === "ar" ? "تسوية وتوريد العهدة للمالك" : "Hand over float to owner", language === "ar" ? `سيُصفَّر رصيد «${label}» وستُنقل قيمة ${formatMoney(outstanding, settings.currency)} إلى الخزينة العامة للمنشأة وتُسجل في سجل التدقيق.` : `“${label}” will be zeroed and ${formatMoney(outstanding, settings.currency)} moves to the business treasury and the audit log.`, [{ text: language === "ar" ? "إلغاء" : "Cancel", style: "cancel" }, { text: language === "ar" ? "تأكيد التوريد" : "Confirm handover", style: "destructive", onPress: () => void (async () => { await settleStaffFloat(floatId, note); setJustSettled(floatId); setTimeout(() => setJustSettled(null), 2600); })() }]);
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <SubScreenHeader title={language === "ar" ? "تسوية العُهد النقدية" : "Float settlements"} fallbackHref="/payment-methods" />
    <View style={[styles.info, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "45", flexDirection: row }]}><MaterialIcons name="account-balance-wallet" size={20} color={colors.primary} /><Text style={[styles.flex, { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: align }]}>{language === "ar" ? "دفعات يستلمها الموظفون (إيجار وتأمين) تُسجل ذمة معلقة عليهم. التوريد ينقل الرصيد دفعة واحدة إلى خزينة المالك مع توثيق كامل في سجل التدقيق." : "Payments received by staff (rent and deposits) stay as floats due from them. Handing over moves the whole balance to the owner treasury with full audit trail."}</Text></View>
    <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إجمالي العُهد المعلقة" : "Total pending floats"}</Text><Text style={{ color: totalOutstanding > 0 ? colors.warning : colors.success, fontSize: 21, fontWeight: "900", marginTop: 3, textAlign: align }}>{formatMoney(totalOutstanding, settings.currency)}</Text></View><MaterialIcons name="trending-up" size={28} color={colors.primary} /></View>

    {activeStatements.length ? activeStatements.map((statement) => {
      const account = statement.float;
      const hasOutstanding = statement.outstanding > 0.005;
      return <View key={account.id} style={[styles.floatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.floatHeader, { flexDirection: row }]}><View style={[styles.floatIcon, { backgroundColor: colors.sky + "18" }]}><MaterialIcons name="person" size={20} color="#0284C7" /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", textAlign: align }}>{account.label}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 2, textAlign: align }}>{[account.memberName ? `${language === "ar" ? "الموظف" : "Employee"}: ${account.memberName}` : "", account.cliqAlias ? `CliQ: ${account.cliqAlias}` : ""].filter(Boolean).join(" · ") || (language === "ar" ? "نقطة تحصيل عامة" : "General collection point")}</Text></View><View style={[styles.floatBadge, { backgroundColor: hasOutstanding ? colors.warning + "18" : colors.success + "18" }]}><Text style={{ color: hasOutstanding ? colors.warning : colors.success, fontSize: 10.5, fontWeight: "900" }}>{hasOutstanding ? formatMoney(statement.outstanding, settings.currency) : (language === "ar" ? "مسوّاة" : "Settled")}</Text></View></View>
        <View style={[styles.floatStats, { flexDirection: row }]}><View style={styles.stat}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? "المستلم" : "Received"}</Text><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", marginTop: 2, textAlign: align }}>{formatMoney(statement.collectedTotal, settings.currency)}</Text></View><View style={styles.stat}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? "المرجوع/الخصم" : "Refunded/deducted"}</Text><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", marginTop: 2, textAlign: align }}>{formatMoney(statement.paidOutTotal, settings.currency)}</Text></View><View style={styles.stat}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? "المورَّد للمالك" : "Handed over"}</Text><Text style={{ color: colors.success, fontSize: 13, fontWeight: "900", marginTop: 2, textAlign: align }}>{formatMoney(statement.settledTotal, settings.currency)}</Text></View></View>
        {canSettle ? <View style={[styles.settleRow, { flexDirection: row }]}><TextInput value={noteFor[account.id] ?? ""} onChangeText={(value) => setNoteFor((current) => ({ ...current, [account.id]: value }))} editable={hasOutstanding} placeholder={language === "ar" ? "ملاحظة التوريد (اختياري)" : "Handover note (optional)"} placeholderTextColor={colors.muted} style={[styles.noteInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><RipplePressable rippleColor={colors.background + "3D"} disabled={!hasOutstanding} onPress={() => void settleNow(account.id, account.label, statement.outstanding)} style={({ pressed }) => [styles.settleButton, { backgroundColor: hasOutstanding ? "#0EA5E9" : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="account-balance" size={16} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 12 }}>{justSettled === account.id ? (language === "ar" ? "تم التوريد ✓" : "Handed over ✓") : (language === "ar" ? "تسوية وتوريد العهدة للمالك" : "Hand over to owner")}</Text></RipplePressable></View> : <View style={[styles.readonlyHint, { backgroundColor: colors.surfaceMuted }]}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: align }}>{language === "ar" ? "التوريد متاح للمالك والمسؤول المفوض فقط." : "Handover is limited to the owner or a delegated manager."}</Text></View>}
        {statement.settlements.length ? <View style={styles.history}><Text style={{ color: colors.muted, fontSize: 10.5, fontWeight: "900", textAlign: align }}>{language === "ar" ? "سجل التوريد" : "Handover history"}</Text>{statement.settlements.map((settlement) => <View key={settlement.id} style={[styles.historyRow, { backgroundColor: colors.background, flexDirection: row }]}><MaterialIcons name="verified" size={15} color={colors.success} /><Text numberOfLines={1} style={[styles.flex, { color: colors.muted, fontSize: 10.5, fontWeight: "700", textAlign: align }]}>{language === "ar" ? `توريد ${formatMoney(settlement.amount, settings.currency)}${settlement.note ? ` · ${settlement.note}` : ""}` : `Handed over ${formatMoney(settlement.amount, settings.currency)}${settlement.note ? ` · ${settlement.note}` : ""}`}</Text><Text style={{ color: colors.muted, fontSize: 10 }}>{new Date(settlement.settledAt).toLocaleDateString(language === "ar" ? "ar-JO" : "en-GB")}</Text></View>)}</View> : null}
      </View>;
    }) : <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="account-balance-wallet" size={22} color={colors.muted} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "لا توجد عُهد موظفين بعد" : "No staff floats yet"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: align }}>{language === "ar" ? "أضف نقاط تحصيل من «طرق الدفع والحسابات المالية» أولًا، وستندرج العُهد هنا تلقائيًا." : "Add collection points under “Payment methods & financial accounts” first; floats will appear here automatically."}</Text></View></View>}
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 34 },
  flex: { flex: 1, minWidth: 0 },
  info: { borderWidth: 1, borderRadius: 15, padding: 12, alignItems: "flex-start", gap: 9 },
  summary: { borderWidth: 1, borderRadius: 16, padding: 13, alignItems: "center", gap: 10, marginTop: 13 },
  floatCard: { borderWidth: 1, borderRadius: 17, padding: 12, marginTop: 12 },
  floatHeader: { alignItems: "center", gap: 9 },
  floatIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  floatBadge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  floatStats: { gap: 8, marginTop: 11 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 13, padding: 9, backgroundColor: undefined },
  settleRow: { alignItems: "center", gap: 8, marginTop: 11 },
  noteInput: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, fontSize: 12 },
  settleButton: { minHeight: 46, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  readonlyHint: { borderRadius: 12, padding: 9, marginTop: 11 },
  history: { marginTop: 11, gap: 6 },
  historyRow: { borderRadius: 11, padding: 8, alignItems: "center", gap: 7 },
  empty: { borderWidth: 1, borderRadius: 16, padding: 14, alignItems: "center", gap: 10, marginTop: 13 },
});