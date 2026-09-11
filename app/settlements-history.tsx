import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { useColors } from "@/hooks/use-colors";
import { formatMoney, staffFloatAccounts, todayISO } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useAppPreferences } from "@/lib/app-preferences";
import { useI18n } from "@/lib/i18n";
import { settlementArchiveEntries, type SettlementArchiveEntry } from "@/lib/reporting";
import { useWorkspaceAccess } from "@/lib/workspace-access";

type PeriodKey = "all" | "today" | "week" | "month" | "custom";

const STATUS_META: Record<string, { ar: string; en: string; bg: string; fg: string }> = {
  PENDING_APPROVAL: { ar: "بانتظار التأكيد", en: "Pending", bg: "#F59E0B14", fg: "#F59E0B" },
  CONFIRMED: { ar: "مؤكَّد", en: "Confirmed", bg: "#22C55E14", fg: "#22C55E" },
  REJECTED: { ar: "مرفوض", en: "Rejected", bg: "#F43F5E14", fg: "#F43F5E" },
};

const CHANNEL_LABELS: Record<string, { ar: string; en: string }> = {
  vault: { ar: "كاش", en: "Cash" },
  cliq: { ar: "CliQ", en: "CliQ" },
  bank: { ar: "بنكي", en: "Bank" },
};

function matchesQuery(entry: SettlementArchiveEntry, q: string, language: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const { settlement, memberName, floatLabel, bookings, expenses } = entry;
  const channel = settlement.channel ? (CHANNEL_LABELS[settlement.channel]?.[language === "ar" ? "ar" : "en"] ?? "") : "";
  const texts = [
    memberName, floatLabel, settlement.id,
    String(settlement.amount), channel,
    settlement.recipientAccountLabel, settlement.note,
    settlement.requestedByName, settlement.settledByName,
    ...bookings.map((b) => b.customerName),
    ...expenses.map((e) => e.note),
  ];
  return texts.some((text) => typeof text === "string" && text.toLowerCase().includes(lower));
}

function inPeriod(dateISO: string, period: PeriodKey, today: string, customRange: DateRange): boolean {
  if (period === "all") return true;
  if (period === "today") return dateISO === today;
  if (period === "month") return dateISO.startsWith(today.slice(0, 7));
  if (period === "week") {
    const diff = Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${dateISO}T00:00:00`).getTime()) / 86400000);
    return diff >= 0 && diff <= 6;
  }
  if (period === "custom") return dateISO >= customRange.start && dateISO <= customRange.end;
  return true;
}

export default function SettlementsHistoryScreen() {
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const { formatDate } = useAppPreferences();
  const { bookings, expenses, staffFloatSettlements, settings } = useBookings();
  const { can } = useWorkspaceAccess();
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const today = todayISO();

  const [query, setQuery] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customRange, setCustomRange] = useState<DateRange>({ start: today, end: today });
  const [customRangeVisible, setCustomRangeVisible] = useState(false);

  const allowed = can("view_audit_logs");

  const floats = useMemo(() => staffFloatAccounts(settings), [settings]);
  const staffChips = useMemo(() => [{ id: "all", label: language === "ar" ? "الكل" : "All" }, ...floats.map((account) => ({ id: account.id, label: account.memberName ?? account.label }))], [floats, language]);
  const periodChips = useMemo(() => ([
    { id: "all" as PeriodKey, label: language === "ar" ? "الكل" : "All" },
    { id: "today" as PeriodKey, label: language === "ar" ? "اليوم" : "Today" },
    { id: "week" as PeriodKey, label: language === "ar" ? "هذا الأسبوع" : "This week" },
    { id: "month" as PeriodKey, label: language === "ar" ? "هذا الشهر" : "This month" },
    { id: "custom" as PeriodKey, label: language === "ar" ? "فترة مخصصة" : "Custom period" },
  ]), [language]);

  const allEntries = useMemo(() => settlementArchiveEntries({ bookings, staffFloatSettlements, settings, expenses }), [bookings, staffFloatSettlements, settings, expenses]);

  const entries = useMemo(() => allEntries.filter((entry) => {
    const staffMatch = staffFilter === "all" || entry.floatId === staffFilter;
    const dateISO = entry.settlement.settlementDate ?? entry.settlement.settledAt.slice(0, 10);
    const periodMatch = inPeriod(dateISO, period, today, customRange);
    const queryMatch = matchesQuery(entry, query, language);
    return staffMatch && periodMatch && queryMatch;
  }), [allEntries, staffFilter, period, today, customRange, query, language]);

  if (!allowed) return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={styles.content}>
    <SubScreenHeader title={language === "ar" ? "أرشيف التسويات العامة" : "General settlements archive"} fallbackHref="/float-settlements" />
    <View style={[styles.lockCard, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}>
      <MaterialIcons name="lock" size={22} color={colors.muted} />
      <View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "الأرشيف متاح للمالك أو المدير المفوض فقط." : "The archive is available to the owner or a delegated manager."}</Text></View>
    </View>
  </ScrollView></ScreenContainer>;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <SubScreenHeader title={language === "ar" ? "أرشيف وسجل التسويات العامة 🗄️" : "General settlements archive 🗄️"} fallbackHref="/float-settlements" />

    <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}>
      <MaterialIcons name="search" size={17} color={colors.muted} />
      <TextInput value={query} onChangeText={setQuery} placeholder={language === "ar" ? "بحث: اسم الموظف، رقم السند، المبلغ، طريقة الدفع، الحساب..." : "Search: staff name, voucher ID, amount, payment method, account..."} placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.foreground, textAlign: align }]} />
      {query ? <Pressable onPress={() => setQuery("")}><MaterialIcons name="close" size={17} color={colors.muted} /></Pressable> : null}
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsRow}>
      {staffChips.map((chip) => { const selected = staffFilter === chip.id; return <Pressable key={chip.id} onPress={() => setStaffFilter(chip.id)} style={({ pressed }) => [styles.chip, { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1 }]}><Text style={{ color: selected ? colors.background : colors.foreground, fontSize: 11.5, fontWeight: "800" }}>{chip.label}</Text></Pressable>; })}
    </ScrollView>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsRow}>
      {periodChips.map((chip) => { const selected = period === chip.id; return <Pressable key={chip.id} onPress={() => { setPeriod(chip.id); if (chip.id === "custom") setCustomRangeVisible(true); }} style={({ pressed }) => [styles.chip, { backgroundColor: selected ? colors.sky : colors.surface, borderColor: selected ? colors.sky : colors.border, opacity: pressed ? 0.72 : 1 }]}><Text style={{ color: selected ? colors.background : colors.foreground, fontSize: 11.5, fontWeight: "800" }}>{chip.label}</Text></Pressable>; })}
    </ScrollView>

    {period === "custom" ? <Pressable onPress={() => setCustomRangeVisible(true)} style={({ pressed }) => [styles.rangeRow, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="date-range" size={16} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 11.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? `من ${formatDate(customRange.start)} إلى ${formatDate(customRange.end)}` : `From ${formatDate(customRange.start)} to ${formatDate(customRange.end)}`}</Text><MaterialIcons name="edit-calendar" size={15} color={colors.muted} /></Pressable> : null}

    <View style={[styles.resultRow, { flexDirection: row }]}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", textAlign: align }}>{language === "ar" ? `${entries.length} سند` : `${entries.length} voucher(s)`}</Text>
    </View>

    {entries.length ? entries.map((entry) => {
      const s = entry.settlement;
      const status = STATUS_META[s.status ?? "CONFIRMED"] ?? STATUS_META.CONFIRMED;
      const channelMeta = s.channel ? CHANNEL_LABELS[s.channel] : undefined;
      const settlementDate = s.settlementDate ?? s.settledAt.slice(0, 10);
      const createdAt = s.createdAt ?? s.settledAt;
      return <View key={s.id} style={[styles.voucher, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.voucherHeader, { flexDirection: row }]}>
          <View style={styles.flex}>
            <View style={[styles.statusBadge, { backgroundColor: status.bg, flexDirection: row }]}><MaterialIcons name={s.status === "CONFIRMED" ? "check-circle" : s.status === "REJECTED" ? "cancel" : "hourglass-top"} size={13} color={status.fg} /><Text style={{ color: status.fg, fontSize: 10.5, fontWeight: "900" }}>{language === "ar" ? status.ar : status.en}</Text></View>
            <Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 4, textAlign: align }}>{language === "ar" ? `رقم السند: ${s.id}` : `Voucher: ${s.id}`}</Text>
          </View>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(s.amount, settings.currency)}</Text>
        </View>
        <View style={[styles.voucherBody, { backgroundColor: colors.background, flexDirection: row }]}>
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{entry.memberName ?? entry.floatLabel}</Text>
            <Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 2, textAlign: align }}>{language === "ar" ? `الحساب: ${entry.floatLabel}` : `Account: ${entry.floatLabel}`}</Text>
            <Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 2, textAlign: align }}>{[s.recipientAccountLabel ? `${language === "ar" ? "إلى" : "To"}: ${s.recipientAccountLabel}` : "", channelMeta ? `${language === "ar" ? "الطريقة" : "Method"}: ${language === "ar" ? channelMeta.ar : channelMeta.en}` : ""].filter(Boolean).join(" · ")}</Text>
            <Text style={{ color: colors.muted, fontSize: 10, marginTop: 3, textAlign: align }}>{language === "ar" ? `تاريخ التسوية: ${formatDate(settlementDate)} — تم التنفيذ: ${new Date(createdAt).toLocaleString("ar-JO")}` : `Settlement date: ${formatDate(settlementDate)} — Executed: ${new Date(createdAt).toLocaleString("en-GB")}`}</Text>
            {s.note ? <Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 2, fontStyle: "italic", textAlign: align }}>{s.note}</Text> : null}
          </View>
          {s.receiptUri ? <Image source={{ uri: s.receiptUri }} style={styles.receiptThumb} /> : null}
        </View>
        {entry.bookings.length ? <View style={styles.subSection}><Text style={{ color: colors.muted, fontSize: 10.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? `الحجوزات المشمولة (${entry.bookings.length}):` : `Covered bookings (${entry.bookings.length}):`}</Text>{entry.bookings.map((b) => <View key={b.bookingId} style={[styles.subRow, { flexDirection: row }]}><MaterialIcons name="event" size={12} color={colors.muted} /><Text numberOfLines={1} style={[styles.flex, { color: colors.foreground, fontSize: 10.5, fontWeight: "700", textAlign: align }]}>{b.customerName}</Text><Text style={{ color: colors.muted, fontSize: 10 }}>{formatDate(b.date)} · {formatMoney(b.amount, settings.currency)}</Text></View>)}</View> : null}
        {entry.expenses.length ? <View style={styles.subSection}><Text style={{ color: colors.muted, fontSize: 10.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? `المصروفات المشمولة (${entry.expenses.length}):` : `Covered expenses (${entry.expenses.length}):`}</Text>{entry.expenses.map((e) => <View key={e.expenseId} style={[styles.subRow, { flexDirection: row }]}><MaterialIcons name="receipt" size={12} color={colors.warning} /><Text numberOfLines={1} style={[styles.flex, { color: colors.foreground, fontSize: 10.5, fontWeight: "700", textAlign: align }]}>{e.note ?? e.category}</Text><Text style={{ color: colors.warning, fontSize: 10 }}>- {formatMoney(e.amount, settings.currency)}</Text></View>)}</View> : null}
      </View>;
    }) : <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}>
      <MaterialIcons name="search-off" size={22} color={colors.muted} />
      <View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "لا توجد نتائج مطابقة" : "No matching records"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: align }}>{language === "ar" ? "جرّب تعديل كلمة البحث أو الفلتر." : "Try adjusting your search or filters."}</Text></View>
    </View>}

    <DateRangePicker visible={customRangeVisible} start={customRange.start} end={customRange.end} onApply={(range) => { setCustomRange(range); setCustomRangeVisible(false); }} onClose={() => setCustomRangeVisible(false)} />
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 34 },
  flex: { flex: 1, minWidth: 0 },
  lockCard: { borderWidth: 1, borderRadius: 16, padding: 14, alignItems: "center", gap: 10, marginTop: 13 },
  searchRow: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, alignItems: "center", gap: 8, minHeight: 46, marginTop: 12 },
  searchInput: { flex: 1, fontSize: 12, fontWeight: "700", paddingVertical: 10 },
  chipsScroll: { marginTop: 10 },
  chipsRow: { gap: 7 },
  chip: { borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  rangeRow: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, alignItems: "center", gap: 8, marginTop: 10 },
  resultRow: { marginTop: 12, alignItems: "center" },
  voucher: { borderWidth: 1, borderRadius: 17, marginTop: 12, overflow: "hidden" },
  voucherHeader: { alignItems: "center", justifyContent: "space-between", padding: 12, paddingBottom: 10, gap: 10 },
  statusBadge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4, alignItems: "center", gap: 4 },
  voucherBody: { borderRadius: 12, padding: 12, gap: 8, marginHorizontal: 8 },
  receiptThumb: { width: 48, height: 48, borderRadius: 8, marginLeft: 8 },
  subSection: { paddingHorizontal: 12, paddingBottom: 10, gap: 5, marginTop: 8 },
  subRow: { alignItems: "center", gap: 6 },
  empty: { borderWidth: 1, borderRadius: 16, padding: 14, alignItems: "center", gap: 10, marginTop: 13 },
});
