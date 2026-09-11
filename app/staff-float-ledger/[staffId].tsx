import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { RipplePressable } from "@/components/ripple-pressable";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { useColors } from "@/hooks/use-colors";
import { formatMoney, staffFloatAccounts, todayISO } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { exportLedgerStatementPdf } from "@/lib/ledger-pdf";
import { staffFloatLedgerForFloat, staffFloatLedgerForPeriod, type LedgerPeriodRange, type StaffFloatLedgerEntryKind } from "@/lib/reporting";
import { useWorkspaceAccess } from "@/lib/workspace-access";

const ENTRY_META: Record<StaffFloatLedgerEntryKind, { icon: React.ComponentProps<typeof MaterialIcons>["name"]; ar: string; en: string; color: string }> = {
  "rental-collected": { icon: "payments", ar: "تحصيل إيجار", en: "Rental collected", color: "#22C55E" },
  "deposit-collected": { icon: "savings", ar: "تأمين بحوزته", en: "Deposit held in hand", color: "#10B981" },
  "float-expense": { icon: "receipt-long", ar: "مصروف من العهدة", en: "Float expense receipt", color: "#F43F5E" },
  "settled-transfer": { icon: "account-balance", ar: "توريد مؤكد للمالك", en: "Approved transfer to owner", color: "#0EA5E9" },
};

type PeriodKey = "today" | "week" | "month" | "custom" | "all";
const PERIOD_PILLS: { key: PeriodKey; ar: string; en: string }[] = [
  { key: "today", ar: "اليوم", en: "Today" },
  { key: "week", ar: "هذا الأسبوع (7 أيام)", en: "This week (7 days)" },
  { key: "month", ar: "هذا الشهر", en: "This month" },
  { key: "custom", ar: "فترة مخصصة (من - إلى)", en: "Custom range (from - to)" },
  { key: "all", ar: "الكل", en: "All" },
];

export default function StaffFloatLedgerScreen() {
  const { staffId: routeStaffId } = useLocalSearchParams<{ staffId: string }>();
  const floatId = typeof routeStaffId === "string" && routeStaffId ? routeStaffId : "";
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const { bookings, staffFloatSettlements, settings, expenses } = useBookings();
  const { user, isAuthenticated, isManager, isSuperAdmin } = useWorkspaceAccess();
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const isGlobalView = isManager || isSuperAdmin;

  const float = useMemo(() => staffFloatAccounts(settings).find((account) => account.id === floatId), [settings, floatId]);
  const ownsFloat = Number.isInteger(float?.memberUserId) && float?.memberUserId === user?.id;
  const locked = Boolean(float) && isAuthenticated && !isGlobalView && !ownsFloat;

  const formatDate = useCallback((value: string) => new Date(`${value}T00:00:00.000Z`).toLocaleDateString(language === "ar" ? "ar-JO" : "en-GB"), [language]);
  const todayKey = useMemo(() => todayISO(), []);
  const keyFor = useCallback((daysAgo: number) => {
    const date = new Date(`${todayKey}T12:00:00`);
    date.setDate(date.getDate() - daysAgo);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }, [todayKey]);
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customRange, setCustomRange] = useState<DateRange>(() => ({ start: keyFor(6), end: keyFor(0) }));
  const [rangeOpen, setRangeOpen] = useState(false);

  const effectiveRange: LedgerPeriodRange | null = useMemo(() => {
    if (period === "all") return null;
    if (period === "today") return { start: todayKey, end: todayKey };
    if (period === "week") return { start: keyFor(6), end: todayKey };
    if (period === "month") return { start: `${todayKey.slice(0, 8)}01`, end: todayKey };
    return customRange.start && customRange.end ? { start: customRange.start, end: customRange.end } : null;
  }, [period, customRange, todayKey, keyFor]);

  const ledger = useMemo(() => staffFloatLedgerForFloat({ bookings, staffFloatSettlements, settings, expenses }, floatId), [bookings, staffFloatSettlements, settings, expenses, floatId]);
  const metrics = useMemo(() => staffFloatLedgerForPeriod({ bookings, staffFloatSettlements, settings, expenses }, floatId, effectiveRange), [bookings, staffFloatSettlements, settings, expenses, floatId, effectiveRange]);
  const kindLabel = (kind: StaffFloatLedgerEntryKind) => (language === "ar" ? ENTRY_META[kind].ar : ENTRY_META[kind].en);

  const periodLabel = useMemo(() => {
    if (!effectiveRange) return language === "ar" ? "كل الفترات" : "All time";
    const { start, end } = effectiveRange;
    if (period === "today") return language === "ar" ? `اليوم (${formatDate(start)})` : `Today (${formatDate(start)})`;
    return `${formatDate(start)} — ${formatDate(end)}`;
  }, [effectiveRange, period, language, formatDate]);

  const selectPeriod = (key: PeriodKey) => {
    if (key === "custom") {
      setPeriod("custom");
      setRangeOpen(true);
      return;
    }
    setPeriod(key);
    setRangeOpen(false);
  };

  const exportStatement = async () => {
    try {
      await exportLedgerStatementPdf({
        businessName: settings.businessName || "StayIn",
        currency: settings.currency,
        staffLabel: ledger.float?.label ?? float?.label ?? floatId,
        staffName: ledger.float?.memberName ?? float?.memberName,
        generatedLabel: `${language === "ar" ? "تاريخ إنشاء الكشف" : "Generated on"} ${formatDate(todayKey)}`,
        periodLabel,
        language,
        openingBalance: metrics.openingBalance,
        closingBalance: metrics.closingBalance,
        collected: metrics.collected,
        expenses: metrics.expenses,
        handedOver: metrics.handedOver,
        kindLabels: { "rental-collected": kindLabel("rental-collected"), "deposit-collected": kindLabel("deposit-collected"), "float-expense": kindLabel("float-expense"), "settled-transfer": kindLabel("settled-transfer") },
        entries: metrics.entries,
        formatDate,
      });
    } catch {
      Alert.alert(language === "ar" ? "تعذر إصدار الكشف" : "Could not issue statement", language === "ar" ? "تعذر طباعة كشف الحساب. حاول مجددًا." : "Could not print the statement. Try again.");
    }
  };

  const kpiCards = [
    { key: "closing" as const, labelAr: "الرصيد المعلق الحالي", labelEn: "Current pending balance", value: metrics.closingBalance, color: metrics.closingBalance > 0.005 ? colors.warning : colors.success },
    { key: "collected" as const, labelAr: "إجمالي المحصل (المستلم)", labelEn: "Total collected (received)", value: metrics.collected, color: colors.foreground },
    { key: "expenses" as const, labelAr: "إجمالي المصروفات (المرجوع / الخصم)", labelEn: "Total expenses (refunded / deducted)", value: metrics.expenses, color: colors.error },
    { key: "handed" as const, labelAr: "إجمالي المورَّد للمالك", labelEn: "Total handed over to owner", value: metrics.handedOver, color: colors.success },
  ];

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <SubScreenHeader title={language === "ar" ? "كشف حساب وسجل حركات العهدة" : "Staff float ledger"} fallbackHref="/float-settlements" />
    {!floatId || (!float && !locked) ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="error-outline" size={22} color={colors.muted} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "لم يتم العثور على العهدة" : "Float not found"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: align }}>{language === "ar" ? "تأكد من صحة المعرّف أو عُد لقائمة العُهد." : "Verify the float ID or return to the settlements list."}</Text></View></View> : locked ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="lock" size={22} color={colors.muted} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "لا يمكنك الاطلاع على كشف حساب موظف آخر" : "You may only view your own float ledger"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: align }}>{language === "ar" ? "حق الدخول مخصصة للمالك أو موظف العهدة ذاتها فقط." : "Access is restricted to the owner or the float's own employee."}</Text></View></View> : <>
      <View style={[styles.filterBar, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
        {PERIOD_PILLS.map((pill) => {
          const active = period === pill.key;
          return <RipplePressable key={pill.key} rippleColor={colors.background + "3D"} onPress={() => selectPeriod(pill.key)} style={({ pressed }) => [styles.pill, { backgroundColor: active ? "#F59E0B" : colors.background, borderColor: active ? "#F59E0B" : colors.border, opacity: pressed ? 0.72 : 1 }]}><Text style={{ color: active ? colors.background : colors.foreground, fontSize: 11, fontWeight: "900", textAlign: "center" }}>{language === "ar" ? pill.ar : pill.en}</Text></RipplePressable>;
        })}
      </View>
      {period === "custom" && effectiveRange ? <Text style={{ color: colors.muted, fontSize: 10.5, fontWeight: "800", marginTop: 8, textAlign: align }}>{language === "ar" ? "الفترة المحددة" : "Selected range"}: {formatDate(effectiveRange.start)} — {formatDate(effectiveRange.end)}</Text> : null}
      <View style={[styles.identityRow, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}>
        <View style={[styles.iconBox, { backgroundColor: colors.sky + "18" }]}><MaterialIcons name="account-balance-wallet" size={20} color="#0284C7" /></View>
        <View style={styles.flex}>
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", textAlign: align }}>{language === "ar" ? "كشف حساب العهدة" : "Float statement"}</Text>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", marginTop: 2, textAlign: align }}>{ledger.float?.label ?? float?.label}{(ledger.float?.memberName ?? float?.memberName) ? ` · ${ledger.float?.memberName ?? float?.memberName}` : ""}</Text>
        </View>
        <MaterialIcons name="verified" size={20} color={metrics.closingBalance > 0.005 ? colors.warning : colors.success} />
      </View>
      <View style={styles.kpiGrid}>
        {kpiCards.map((card) => <View key={card.key} style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? card.labelAr : card.labelEn}</Text>
          <Text style={{ color: card.color, fontSize: 18, fontWeight: "900", marginTop: 3, writingDirection: "ltr", textAlign: isRTL ? "left" : "right" }}>{formatMoney(card.value, settings.currency)}</Text>
        </View>)}
      </View>
      {period !== "all" && effectiveRange ? <Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 8, textAlign: align }}>{language === "ar" ? "القيم تعكس فترتك المحددة فقط؛ الرصيد الجاري لكل حركة يبقى الرصيد الفعلي الكامل عبر السجل." : "Values reflect your selected period only; each entry's running balance stays the true full-statement balance."}</Text> : null}
      <RipplePressable rippleColor={colors.background + "3D"} onPress={() => void exportStatement()} style={({ pressed }) => [styles.printButton, { backgroundColor: "#0EA5E9", opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="print" size={17} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "[ طباعة كشف الحساب 🖨️ / PDF ]" : "[ Print statement 🖨️ / PDF ]"}</Text></RipplePressable>
      {metrics.entries.length ? <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {metrics.entries.map((entry, index) => {
          const meta = ENTRY_META[entry.kind];
          const positive = entry.amount >= 0;
          const isLast = index === metrics.entries.length - 1;
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
      </View> : <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="receipt-long" size={22} color={colors.muted} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "لا توجد حركات في هذه الفترة" : "No movements in this period"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: align }}>{language === "ar" ? "غيّر الفترة أو اختر «الكل» لعرض كامل السجل." : "Change the period or choose “All” to view the full ledger."}</Text></View></View>}
    </>}
    <DateRangePicker visible={rangeOpen} start={customRange.start} end={customRange.end} onApply={(range) => { setCustomRange(range); setPeriod("custom"); setRangeOpen(false); }} onClose={() => setRangeOpen(false)} />
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 34 },
  flex: { flex: 1, minWidth: 0 },
  filterBar: { flexDirection: "row", flexWrap: "wrap", gap: 8, borderWidth: 1, borderRadius: 16, padding: 9 },
  pill: { minHeight: 36, borderRadius: 11, borderWidth: 1, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" },
  identityRow: { borderWidth: 1, borderRadius: 17, padding: 13, alignItems: "center", gap: 10, marginTop: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  kpiCard: { width: "48.5%", borderWidth: 1, borderRadius: 14, padding: 12 },
  printButton: { minHeight: 48, borderRadius: 14, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, marginTop: 13 },
  listCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, marginTop: 13 },
  entry: { alignItems: "center", gap: 9, paddingVertical: 11 },
  entryIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  numbers: { alignItems: "flex-end" },
  empty: { borderWidth: 1, borderRadius: 16, padding: 14, alignItems: "center", gap: 10, marginTop: 13 },
});