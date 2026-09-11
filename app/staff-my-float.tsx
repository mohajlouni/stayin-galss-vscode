import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { RipplePressable } from "@/components/ripple-pressable";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { formatMoney } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { staffFloatLedgerForUser, type StaffFloatLedgerEntry, type StaffFloatLedgerEntryKind } from "@/lib/reporting";
import { useWorkspaceAccess } from "@/lib/workspace-access";

const ENTRY_META: Record<StaffFloatLedgerEntryKind, { icon: React.ComponentProps<typeof MaterialIcons>["name"]; ar: string; en: string; color: string }> = {
  "rental-collected": { icon: "payments", ar: "تحصيل إيجار", en: "Rental collected", color: "#22C55E" },
  "deposit-collected": { icon: "savings", ar: "تأمين بحوزتك", en: "Deposit held in hand", color: "#10B981" },
  "float-expense": { icon: "receipt-long", ar: "مصروف من العهدة", en: "Float expense receipt", color: "#F43F5E" },
  "settled-transfer": { icon: "account-balance", ar: "توريد مؤكد للمالك", en: "Approved transfer to owner", color: "#0EA5E9" },
};

export default function StaffMyFloatScreen() {
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const { bookings, staffFloatSettlements, settings, expenses } = useBookings();
  const { user, isAuthenticated } = useWorkspaceAccess();
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  const ledger = useMemo(() => staffFloatLedgerForUser({ bookings, staffFloatSettlements, settings, expenses }, user?.id), [bookings, staffFloatSettlements, settings, expenses, user?.id]);
  const formatDate = (value: string) => new Date(`${value}T00:00:00.000Z`).toLocaleDateString(language === "ar" ? "ar-JO" : "en-GB");
  const kindLabel = (kind: StaffFloatLedgerEntryKind) => (language === "ar" ? ENTRY_META[kind].ar : ENTRY_META[kind].en);

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <SubScreenHeader title={language === "ar" ? "كشف حسابي وسجل الحركات" : "My float statement"} fallbackHref="/float-settlements" />
    {isAuthenticated && ledger.float ? <>
      <View style={[styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}>
        <View style={[styles.iconBox, { backgroundColor: colors.sky + "18" }]}><MaterialIcons name="account-balance-wallet" size={22} color="#0284C7" /></View>
        <View style={styles.flex}>
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", textAlign: align }}>{language === "ar" ? "رصيدك الحالي (ذمة معلقة)" : "Current balance (float due)"}</Text>
          <Text style={{ color: ledger.netBalance > 0.005 ? colors.warning : colors.success, fontSize: 22, fontWeight: "900", marginTop: 3, textAlign: align }}>{formatMoney(ledger.netBalance, settings.currency)}</Text>
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 3, textAlign: align }}>{ledger.float.label}{ledger.float.memberName ? ` · ${ledger.float.memberName}` : ""}</Text>
        </View>
        <MaterialIcons name="verified" size={22} color={ledger.netBalance > 0.005 ? colors.warning : colors.success} />
      </View>
      {ledger.entries.length ? <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {ledger.entries.map((entry, index) => {
          const meta = ENTRY_META[entry.kind];
          const positive = entry.amount >= 0;
          const isLast = index === ledger.entries.length - 1;
          return <View key={`${entry.kind}-${entry.id}-${index}`} style={[styles.entry, { flexDirection: row }, !isLast ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null]}>
            <View style={[styles.entryIcon, { backgroundColor: meta.color + "18" }]}><MaterialIcons name={meta.icon} size={17} color={meta.color} /></View>
            <View style={styles.flex}>
              <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{kindLabel(entry.kind)}</Text>
              <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10.5, marginTop: 2, textAlign: align }}>{entry.label}{entry.date ? ` · ${formatDate(entry.date)}` : ""}</Text>
            </View>
            <View style={styles.numbers}>
              <Text style={{ color: positive ? colors.success : colors.error, fontSize: 13, fontWeight: "900", writingDirection: "ltr" }}>{positive ? "+" : "-"} {formatMoney(Math.abs(entry.amount), settings.currency)}</Text>
              <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", writingDirection: "ltr", marginTop: 2, textAlign: "right" }}>{formatMoney(entry.runningBalance, settings.currency)}</Text>
            </View>
          </View>;
        })}
      </View> : <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="receipt-long" size={22} color={colors.muted} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "لا توجد حركات بعد" : "No movements yet"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: align }}>{language === "ar" ? "ستظهر تحصيلاتك ومصروفاتك وتوريداتك هنا كرونولوجيًا مع رصيد جارٍ." : "Your collections, float expenses, and approved handovers will appear here in order with a running balance."}</Text></View></View>}
    </> : <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="lock" size={22} color={colors.muted} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "لا توجد عهدة مرتبطة بحسابك" : "No float linked to your account"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: align }}>{language === "ar" ? "اطلب من المالك ربط عهدة نقدية بحسابك لتتمكن من متابعة حركاتك." : "Ask the owner to link a cash float to your account to track your movements."}</Text></View></View>}
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 34 },
  flex: { flex: 1, minWidth: 0 },
  balanceCard: { borderWidth: 1, borderRadius: 17, padding: 14, alignItems: "center", gap: 11 },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  listCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, marginTop: 13 },
  entry: { alignItems: "center", gap: 9, paddingVertical: 11 },
  entryIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  numbers: { alignItems: "flex-end" },
  empty: { borderWidth: 1, borderRadius: 16, padding: 14, alignItems: "center", gap: 10, marginTop: 13 },
});