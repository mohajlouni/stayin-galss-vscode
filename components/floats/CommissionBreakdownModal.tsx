import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { CalendarDateField } from "@/components/calendar-date-picker";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { formatMoney } from "@/lib/booking-model";
import { useI18n } from "@/lib/i18n";
import type { StaffFloatCommissionAuditRow } from "@/lib/reporting";

type CommissionSegment = "all" | "pending" | "settled";

export type CommissionBreakdownModalProps = {
  visible: boolean;
  floatId: string;
  floatLabel: string;
  memberName?: string;
  currency: string;
  audit: { rows: StaffFloatCommissionAuditRow[]; totalEarned: number; settledEarned: number; pendingEarned: number };
  onClose: () => void;
  onOpenBooking: (bookingId: string) => void;
};

const SEGMENT_ORDER: CommissionSegment[] = ["all", "pending", "settled"];

export function CommissionBreakdownModal(props: CommissionBreakdownModalProps) {
  const { visible, floatLabel, memberName, currency, audit, onClose, onOpenBooking } = props;
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const { formatDate } = useAppPreferences();
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const [segment, setSegment] = useState<CommissionSegment>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const ar = language === "ar";

  const filtered = useMemo(() => audit.rows.filter((item) => {
    if (segment === "pending" && item.settled) return false;
    if (segment === "settled" && !item.settled) return false;
    if (fromDate && item.date && item.date < fromDate) return false;
    if (toDate && item.date && item.date > toDate) return false;
    return true;
  }), [audit.rows, segment, fromDate, toDate]);

  const counts = useMemo(() => ({
    all: audit.rows.length,
    pending: audit.rows.filter((item) => !item.settled).length,
    settled: audit.rows.filter((item) => item.settled).length,
  }), [audit.rows]);

  const hasDateFilter = Boolean(fromDate || toDate);

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.modalHeader, { flexDirection: row }]}><View style={[styles.headerIcon, { backgroundColor: "#8B5CF6" + "18" }]}><MaterialIcons name="payments" size={18} color="#8B5CF6" /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{ar ? "كشف وتفصيل العمولات 📑" : "Commissions breakdown & audit trail 📑"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{ar ? `العهدة: ${floatLabel}${memberName ? ` · ${memberName}` : ""}` : `Float: ${floatLabel}${memberName ? ` · ${memberName}` : ""}`}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={ar ? "إغلاق الكشف" : "Close breakdown"} onPress={onClose} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.65 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={[styles.summaryCard, { backgroundColor: "#8B5CF6" + "0D", borderColor: "#8B5CF6" + "33" }]}><View style={[styles.summaryMain, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.muted, fontSize: 10.5, fontWeight: "800", textAlign: align }}>{ar ? "إجمالي العمولات المستحقة" : "Total commissions earned"}</Text><Text style={{ color: "#8B5CF6", fontSize: 20, fontWeight: "900", marginTop: 3, writingDirection: "ltr", textAlign: align === "right" ? "left" : "right" }}>{formatMoney(audit.totalEarned, currency)}</Text></View><MaterialIcons name="workspace-premium" size={26} color="#8B5CF6" /></View><View style={[styles.summaryRow, { flexDirection: row }]}><View style={[styles.summaryStat, { backgroundColor: colors.surface, borderColor: colors.warning + "4D" }]}><Text style={{ color: colors.warning, fontSize: 12, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(audit.pendingEarned, currency)}</Text><Text style={{ color: colors.muted, fontSize: 9.5, fontWeight: "700", marginTop: 2, textAlign: align }}>{ar ? "معلّق للصرف" : "Pending payout"}</Text></View><View style={[styles.summaryStat, { backgroundColor: colors.surface, borderColor: colors.success + "4D" }]}><Text style={{ color: colors.success, fontSize: 12, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(audit.settledEarned, currency)}</Text><Text style={{ color: colors.muted, fontSize: 9.5, fontWeight: "700", marginTop: 2, textAlign: align }}>{ar ? "تم تسويته سابقاً" : "Previously settled"}</Text></View><View style={[styles.summaryStat, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", writingDirection: "ltr" }}>{audit.rows.length}</Text><Text style={{ color: colors.muted, fontSize: 9.5, fontWeight: "700", marginTop: 2, textAlign: align }}>{ar ? "عدد الحجوزات" : "Bookings"}</Text></View></View></View>

      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align, marginTop: 14 }}>{ar ? "فلترة العرض" : "Filter view"}</Text>
      <View style={[styles.segmentBar, { flexDirection: row }]}>{SEGMENT_ORDER.map((key) => <Pressable key={key} accessibilityRole="button" onPress={() => setSegment(key)} style={({ pressed }) => [styles.segment, { backgroundColor: segment === key ? "#8B5CF6" : colors.surfaceMuted, opacity: pressed ? 0.72 : 1, borderColor: segment === key ? "#8B5CF6" : colors.border }]}><Text style={{ color: segment === key ? colors.background : colors.muted, fontSize: 10.5, fontWeight: "900", textAlign: "center" }}>{ar ? (key === "all" ? "الكل" : key === "pending" ? "معلّق للصرف" : "تم تسويته سابقاً") : (key === "all" ? "All" : key === "pending" ? "Pending" : "Settled")}</Text><Text style={{ color: segment === key ? colors.background : colors.muted, fontSize: 9.5, fontWeight: "700", textAlign: "center" }}>{counts[key]}</Text></Pressable>)}</View>
      <View style={[styles.dateRow, { flexDirection: row }]}><View style={styles.flex}><CalendarDateField label={ar ? "من تاريخ" : "From date"} value={fromDate} onChange={setFromDate} /></View><View style={styles.flex}><CalendarDateField label={ar ? "إلى تاريخ" : "To date"} value={toDate} onChange={setToDate} /></View></View>
      {hasDateFilter || segment !== "all" ? <Pressable accessibilityRole="button" onPress={() => { setSegment("all"); setFromDate(""); setToDate(""); }} style={({ pressed }) => [styles.clearButton, { opacity: pressed ? 0.72 : 1, flexDirection: row }]}><MaterialIcons name="filter-alt-off" size={14} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{ar ? "مسح الفلتر وعرض الكل" : "Clear filter & show all"}</Text></Pressable> : null}

      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align, marginTop: 14 }}>{ar ? `تفاصيل الحجوزات (${filtered.length})` : `Booking details (${filtered.length})`}</Text>
      {filtered.length ? filtered.map((item) => <View key={item.bookingId} style={[styles.itemCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={[styles.itemHeader, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={ar ? `فتح الحجز ${item.reference}` : `Open booking ${item.reference}`} onPress={() => onOpenBooking(item.bookingId)} style={({ pressed }) => [styles.bookingLink, { backgroundColor: "#8B5CF6" + "12", opacity: pressed ? 0.72 : 1, flexDirection: row }]}><MaterialIcons name="receipt-long" size={15} color="#8B5CF6" /><Text style={{ color: "#8B5CF6", fontSize: 11.5, fontWeight: "900", writingDirection: "ltr" }}>{`#${item.reference}`}</Text><MaterialIcons name="open-in-new" size={13} color="#8B5CF6" /></Pressable><View style={[styles.statusBadge, { backgroundColor: item.settled ? colors.success + "14" : colors.warning + "14", borderColor: item.settled ? colors.success + "4D" : colors.warning + "4D", flexDirection: row }]}><MaterialIcons name={item.settled ? "verified" : "hourglass-top"} size={12} color={item.settled ? colors.success : colors.warning} /><Text style={{ color: item.settled ? colors.success : colors.warning, fontSize: 9.5, fontWeight: "900" }}>{item.settled ? (ar ? "مُسوّاة ✓" : "Settled ✓") : (ar ? "معلّقة للصرف ⏳" : "Pending ⏳")}</Text></View></View>
        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align, marginTop: 7 }}>{item.customerName || (ar ? "عميل" : "Customer")}{item.chaletName ? ` · ${item.chaletName}` : ""}</Text>
        <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10.5, marginTop: 3, textAlign: align, lineHeight: 16 }}>{ar ? `المحصل: ${formatMoney(item.collected, currency)} · آلية الحساب: ${item.mechanism}` : `Collected: ${formatMoney(item.collected, currency)} · Mechanism: ${item.mechanism}`}</Text>
        <View style={[styles.itemFooter, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", writingDirection: "ltr", textAlign: "left" }}>{item.at}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 1, textAlign: align }}>{item.settled && item.settlementDate ? (ar ? `توريد بتاريخ ${formatDate(item.settlementDate)}` : `Handed over on ${formatDate(item.settlementDate)}`) : (ar ? "بانتظار توريد العهدة" : "Awaiting float handover")}</Text></View><Text style={{ color: "#8B5CF6", fontSize: 13, fontWeight: "900", writingDirection: "ltr" }}>+{formatMoney(item.commission, currency)}</Text></View>
      </View>) : <View style={[styles.empty, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name={audit.rows.length ? "filter-list-off" : "money-off"} size={20} color={colors.muted} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{audit.rows.length ? (ar ? "لا توجد نتائج مطابقة للفلتر" : "No rows match the filter") : (ar ? "لا توجد عمولات لهذه العهدة بعد" : "No commissions for this float yet")}</Text><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 3, textAlign: align, lineHeight: 15 }}>{audit.rows.length ? (ar ? "جرّب توسيع نطاق التاريخ أو اختيار «الكل»." : "Try widening the date range or picking “All”.") : (ar ? "ستظهر هنا تلقائيًا عند تحصيل مبالغ عبر عهدة موظف بعمولة مفعّلة." : "They will appear here automatically once a float with commissions enabled collects payments.")}</Text></View></View>}
      <Text style={[styles.hint, { color: colors.muted, textAlign: "center" }]}>{ar ? "اضغط على رقم الحجز لفتح صفحته الكاملة، وتُعتبر العمولة مسوّاة عند توريد العهدة للمالك." : "Tap a booking number to open its full page; a commission counts as settled once the float is handed over to the owner."}</Text>
    </ScrollView></View></View></Modal>;
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modal: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "94%", paddingBottom: 26 },
  modalHeader: { alignItems: "center", gap: 10, padding: 14, paddingBottom: 6 },
  headerIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  close: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  formContent: { paddingHorizontal: 16, paddingBottom: 14 },
  summaryCard: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 10, marginTop: 8 },
  summaryMain: { alignItems: "center", gap: 8 },
  summaryRow: { gap: 8 },
  summaryStat: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 6, alignItems: "center" },
  segmentBar: { gap: 8, marginTop: 8 },
  segment: { flex: 1, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 4, gap: 2, borderWidth: 1 },
  dateRow: { gap: 8, marginTop: 8 },
  clearButton: { alignItems: "center", gap: 5, justifyContent: "center", marginTop: 9 },
  itemCard: { borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 8 },
  itemHeader: { alignItems: "center", gap: 8 },
  bookingLink: { alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  statusBadge: { alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1 },
  itemFooter: { alignItems: "center", gap: 8, marginTop: 8 },
  empty: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10, marginTop: 8, alignItems: "center" },
  hint: { fontSize: 10, lineHeight: 15, marginTop: 12, paddingHorizontal: 6 },
});