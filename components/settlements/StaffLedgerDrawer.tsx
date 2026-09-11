import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";

import { RipplePressable } from "@/components/ripple-pressable";
import { useColors } from "@/hooks/use-colors";
import { formatMoney } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { FLOAT_LEDGER_KIND_LABELS, staffFloatLedgerForFloat, type StaffFloatLedgerEntryKind } from "@/lib/reporting";
import { useAppPreferences } from "@/lib/app-preferences";

const DRAWER_ENTRY_META: Record<StaffFloatLedgerEntryKind, { icon: React.ComponentProps<typeof MaterialIcons>["name"]; color: string }> = {
  "rental-collected": { icon: "payments", color: "#22C55E" },
  "deposit-collected": { icon: "savings", color: "#10B981" },
  "float-expense": { icon: "receipt-long", color: "#F43F5E" },
  "settled-transfer": { icon: "account-balance", color: "#0EA5E9" },
};

/** لوحة معاينة داخلية تُفتح فوق نافذة التوريد مباشرة (Sub-Modal) — تعرض حركات العهدة دون إغلاق النموذج ولا فقدان أي قيمة مدخلة. */
export function StaffLedgerDrawer({ visible, floatId, onClose }: { visible: boolean; floatId: string | null; onClose: () => void }) {
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const { bookings, staffFloatSettlements, settings, expenses } = useBookings();
  const { formatDate } = useAppPreferences();
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const ledger = floatId ? staffFloatLedgerForFloat({ bookings, staffFloatSettlements, settings, expenses }, floatId) : null;
  const kindLabel = (kind: StaffFloatLedgerEntryKind) => (language === "ar" ? FLOAT_LEDGER_KIND_LABELS[kind].ar : FLOAT_LEDGER_KIND_LABELS[kind].en);

  return <Modal transparent visible={visible && Boolean(floatId)} animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={[styles.drawer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.header, { flexDirection: row, borderBottomColor: colors.border }]}>
          <View style={[styles.headerIcon, { backgroundColor: colors.sky + "18" }]}><MaterialIcons name="receipt-long" size={20} color="#0284C7" /></View>
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{language === "ar" ? "كشف حركات العهدة" : "Float movements statement"}</Text>
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2, textAlign: align }}>{ledger?.float?.label}{ledger?.float?.memberName ? ` · ${ledger?.float?.memberName}` : ""}</Text>
          </View>
        </View>
        <RipplePressable rippleColor={colors.background + "3D"} onPress={onClose} style={({ pressed }) => [styles.returnButton, { backgroundColor: "#0EA5E9", opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="arrow-back" size={16} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "[ إغلاق والعودة للتوريد ✕ ]" : "[ Close & return to handover ✕ ]"}</Text></RipplePressable>
        <View style={[styles.balanceStrip, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}><MaterialIcons name="account-balance-wallet" size={17} color={ledger && ledger.netBalance > 0.005 ? colors.warning : colors.success} /><Text style={[styles.flex, { color: ledger && ledger.netBalance > 0.005 ? colors.warning : colors.success, fontSize: 12, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "الرصيد المعلق الحالي" : "Current pending balance"}</Text><Text style={{ color: ledger && ledger.netBalance > 0.005 ? colors.warning : colors.success, fontSize: 16, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(ledger?.netBalance ?? 0, settings.currency)}</Text></View>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[styles.list, { borderColor: colors.border }]}>
            {(ledger?.entries.length ?? 0) ? ledger!.entries.map((entry, index) => {
              const meta = DRAWER_ENTRY_META[entry.kind];
              const positive = entry.amount >= 0;
              const isLast = index === ledger!.entries.length - 1;
              return <View key={`${entry.kind}-${entry.id}-${index}`} style={[styles.entry, { flexDirection: row, borderBottomColor: colors.border }, isLast ? null : { borderBottomWidth: 1 }]}>
                <View style={[styles.entryIcon, { backgroundColor: meta.color + "18" }]}><MaterialIcons name={meta.icon} size={16} color={meta.color} /></View>
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{kindLabel(entry.kind)}</Text>
                  <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10.5, marginTop: 2, textAlign: align }}>{entry.label}{entry.date ? ` · ${formatDate(entry.date)}` : ""}</Text>
                </View>
                <View style={styles.numbers}>
                  <Text style={{ color: positive ? colors.success : colors.error, fontSize: 12.5, fontWeight: "900", writingDirection: "ltr" }}>{positive ? "+" : "-"} {formatMoney(Math.abs(entry.amount), settings.currency)}</Text>
                  <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", writingDirection: "ltr", marginTop: 2, textAlign: "right" }}>{formatMoney(entry.runningBalance, settings.currency)}</Text>
                </View>
              </View>;
            }) : <View style={[styles.empty, { borderColor: colors.border }]}><MaterialIcons name="receipt-long" size={22} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800", textAlign: align }}>{language === "ar" ? "لا توجد حركات بعد" : "No movements yet"}</Text></View>}
            <Text style={{ color: colors.muted, fontSize: 10, textAlign: align, lineHeight: 15, marginTop: 8, padding: 10 }}>{language === "ar" ? "المعاينة لا تغيّر قيم التوريد المدخلة — أغلق اللوحة للعودة للتوريد." : "Preview does not change entered handover values — close to return to the handover form."}</Text>
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  drawer: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "94%", paddingBottom: 24, borderWidth: 1, overflow: "hidden" },
  header: { alignItems: "center", gap: 10, padding: 14, paddingBottom: 10, borderBottomWidth: 1 },
  headerIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  flex: { flex: 1, minWidth: 0 },
  returnButton: { minHeight: 48, borderRadius: 13, marginHorizontal: 14, marginTop: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  balanceStrip: { minHeight: 46, borderRadius: 13, marginHorizontal: 14, marginTop: 12, paddingHorizontal: 12, alignItems: "center", gap: 8 },
  scroll: { flexGrow: 0, marginTop: 12 },
  list: { marginHorizontal: 14, borderWidth: 1, borderRadius: 15, overflow: "hidden", paddingHorizontal: 12 },
  entry: { alignItems: "center", gap: 9, paddingVertical: 11 },
  entryIcon: { width: 31, height: 31, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  numbers: { alignItems: "flex-end" },
  empty: { borderRadius: 15, borderWidth: 1, padding: 18, alignItems: "center", gap: 8 },
});