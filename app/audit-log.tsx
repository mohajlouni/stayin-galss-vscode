import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { AuditAction, AuditLogEntry, formatBookingReference } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceAccess } from "@/lib/workspace-access";

const ACTIONS: (AuditAction | "all")[] = ["all", "waitlist-promoted", "waitlist-deleted", "waitlist-cancelled", "booking-deleted", "booking-cancelled", "booking-checked-in", "booking-checked-out", "turnover-task-updated", "expense-added", "expense-deleted", "booking-waitlist-priority-confirmed", "chalet-deleted", "payment-updated", "payment-voided", "customer-created", "customer-updated", "customer-blacklisted", "customer-unblacklisted", "contract-signed", "asset-added", "asset-updated", "asset-deleted", "maintenance-task-updated", "maintenance-task-completed", "weather-log-updated", "utility-reading-recorded", "loyalty-points-awarded", "loyalty-points-redeemed", "float-settled", "deposit-compensation-recorded", "staff-float-account-saved"];
const TIME_RANGES = ["all", "today", "two-days", "week", "month"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

function timeRangeLabel(range: TimeRange, language: "ar" | "en") {
  const labels: Record<TimeRange, [string, string]> = { all: ["كل الوقت", "All time"], today: ["يومي", "Daily"], "two-days": ["يومان", "Two days"], week: ["أسبوعي", "Weekly"], month: ["شهري", "Monthly"] };
  return labels[range][language === "ar" ? 0 : 1];
}

type ActionPresentation = { label: string; color: string; icon: React.ComponentProps<typeof MaterialIcons>["name"] };

function actionPresentation(entry: AuditLogEntry | AuditAction, language: "ar" | "en", colors: ReturnType<typeof useColors>): ActionPresentation {
  const action = typeof entry === "string" ? entry : entry.action;
  const details = typeof entry === "string" ? "" : entry.details;
  const common = {
    "waitlist-promoted": { label: language === "ar" ? "تحويل إلى حجز" : "Converted", color: colors.success, icon: "event-available" as const },
    "waitlist-deleted": { label: language === "ar" ? "حذف انتظار" : "Waitlist deleted", color: colors.error, icon: "delete-outline" as const },
    "waitlist-cancelled": { label: language === "ar" ? "إلغاء طلب انتظار" : "Waitlist cancelled", color: colors.error, icon: "cancel" as const },
    "booking-deleted": { label: language === "ar" ? "حذف حجز" : "Booking deleted", color: colors.error, icon: "delete-outline" as const },
    "booking-cancelled": { label: details.includes("لم يحضر") ? (language === "ar" ? "أرشفة عدم حضور" : "No-show archived") : (language === "ar" ? "إلغاء حجز" : "Booking cancelled"), color: colors.error, icon: "event-busy" as const },
    "booking-checked-in": { label: language === "ar" ? "تسجيل وصول" : "Checked in", color: colors.success, icon: "login" as const },
    "booking-checked-out": { label: language === "ar" ? "إنهاء إقامة" : "Checked out", color: colors.primary, icon: "logout" as const },
    "booking-status-corrected": { label: language === "ar" ? "تصحيح حالة الإقامة" : "Stay status corrected", color: colors.warning, icon: "edit-calendar" as const },
    "turnover-task-updated": { label: language === "ar" ? "تنظيف وفحص" : "Cleaning & inspection", color: colors.warning, icon: "cleaning-services" as const },
    "expense-added": { label: language === "ar" ? "تسجيل مصروف" : "Expense recorded", color: colors.warning, icon: "receipt-long" as const },
    "expense-deleted": { label: language === "ar" ? "حذف مصروف" : "Expense deleted", color: colors.error, icon: "delete-outline" as const },
    "booking-waitlist-priority-confirmed": { label: language === "ar" ? "تأكيد حجز أمام انتظار" : "Booking confirmed", color: colors.success, icon: "verified" as const },
    "chalet-deleted": { label: language === "ar" ? "حذف شاليه" : "Chalet deleted", color: colors.error, icon: "holiday-village" as const },
    "payment-updated": { label: language === "ar" ? "تعديل دفعة" : "Payment updated", color: colors.warning, icon: "edit" as const },
    "payment-voided": { label: language === "ar" ? "إلغاء دفعة" : "Payment voided", color: colors.warning, icon: "money-off" as const },
    "customer-created": { label: language === "ar" ? "إضافة عميل" : "Customer added", color: colors.success, icon: "person-add" as const },
    "customer-updated": { label: language === "ar" ? "تحديث بيانات عميل" : "Customer updated", color: colors.warning, icon: "edit" as const },
    "customer-blacklisted": { label: language === "ar" ? "حظر عميل" : "Customer blacklisted", color: colors.error, icon: "block" as const },
    "customer-unblacklisted": { label: language === "ar" ? "رفع حظر عميل" : "Blacklist removed", color: colors.success, icon: "person-outline" as const },
    "contract-signed": { label: language === "ar" ? "توقيع عقد إيجار" : "Lease signed", color: colors.primary, icon: "description" as const },
    "asset-added": { label: language === "ar" ? "إضافة أصل" : "Asset added", color: colors.success, icon: "inventory-2" as const },
    "asset-updated": { label: language === "ar" ? "تحديث أصل" : "Asset updated", color: colors.warning, icon: "edit" as const },
    "asset-deleted": { label: language === "ar" ? "حذف أصل" : "Asset deleted", color: colors.error, icon: "delete-outline" as const },
    "maintenance-task-updated": { label: language === "ar" ? "مهمة صيانة" : "Maintenance task", color: colors.warning, icon: "construction" as const },
    "maintenance-task-completed": { label: language === "ar" ? "إنجاز صيانة" : "Maintenance done", color: colors.success, icon: "check-circle" as const },
    "weather-log-updated": { label: language === "ar" ? "تحديث بيانات الطقس" : "Weather updated", color: colors.sky, icon: "wb-cloudy" as const },
    "utility-reading-recorded": { label: language === "ar" ? "قراءة عدّاد" : "Meter reading", color: colors.warning, icon: "speed" as const },
    "loyalty-points-awarded": { label: language === "ar" ? "إضافة نقاط ولاء" : "Loyalty points earned", color: colors.success, icon: "stars" as const },
    "loyalty-points-redeemed": { label: language === "ar" ? "استرداد نقاط ولاء" : "Loyalty points redeemed", color: colors.primary, icon: "redeem" as const },
    "float-settled": { label: language === "ar" ? "تسوية وتوريد عهدة" : "Float settled", color: colors.success, icon: "account-balance-wallet" as const },
    "deposit-compensation-recorded": { label: language === "ar" ? "خصم أضرار من التأمين" : "Deposit compensation", color: colors.warning, icon: "handshake" as const },
    "staff-float-account-saved": { label: language === "ar" ? "نقطة تحصيل موظف" : "Staff float account", color: colors.sky, icon: "add-card" as const },
  } as const;
  return common[action];
}

function formatAuditTimestamp(value: string, language: "ar" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return language === "ar" ? "وقت غير متاح" : "Time unavailable";
  const datePart = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  const hours = date.getHours();
  const hour12 = String(((hours + 11) % 12) + 1).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const meridiem = language === "ar" ? (hours >= 12 ? "م" : "ص") : (hours >= 12 ? "PM" : "AM");
  return `${datePart} - ${hour12}:${minutes} ${meridiem}`;
}

function splitDetails(details: string) {
  return details.split(" · ").map((item) => item.trim()).filter(Boolean);
}

function extractActor(entry: AuditLogEntry, language: "ar" | "en") {
  if (entry.actorName?.trim()) return entry.actorName.trim();
  const match = entry.details.match(/(?:نفّذ التحويل|نفذ التحويل|نفّذ التأكيد|نفذ التأكيد|بواسطة)\s*:\s*([^·]+)/);
  return match?.[1]?.trim() || (language === "ar" ? "مستخدم التطبيق" : "App user");
}

function detailsForEntry(entry: AuditLogEntry, currency: string, language: "ar" | "en") {
  const segments = splitDetails(entry.details);
  const paymentUpdate = entry.action === "payment-updated" ? entry.details.match(/(?:تم تعديل\s+(دفعة الإيجار|مبلغ التأمين)\s+من\s+)?([0-9]+(?:\.[0-9]+)?)(?:\s+[^0-9·]+)?\s*(?:←|إلى)\s*([0-9]+(?:\.[0-9]+)?)/) : null;
  const chaletName = entry.action === "chalet-deleted" ? entry.subjectName : segments[0] || (language === "ar" ? "شاليه غير محدد" : "Chalet unavailable");
  const actorPattern = /^(?:نفّذ التحويل|نفذ التحويل|نفّذ التأكيد|نفذ التأكيد|بواسطة)\s*:/;
  const bodySegments = segments.slice(entry.action === "chalet-deleted" ? 0 : 1).filter((segment) => !actorPattern.test(segment) && !/^[0-9]+(?:\.[0-9]+)?\s*←\s*[0-9]+(?:\.[0-9]+)?$/.test(segment) && !/^تم تعديل\s+(دفعة الإيجار|مبلغ التأمين)\s+من\s+/.test(segment));
  const paymentLine = paymentUpdate
    ? (language === "ar" ? `تم تعديل ${paymentUpdate[1] || "دفعة الإيجار"} من ${paymentUpdate[2]} ${currency} إلى ${paymentUpdate[3]} ${currency}` : `${paymentUpdate[1] === "مبلغ التأمين" ? "Security deposit" : "Rental payment"} changed from ${paymentUpdate[2]} ${currency} to ${paymentUpdate[3]} ${currency}`)
    : undefined;
  const subjectLine = entry.action === "chalet-deleted"
    ? (language === "ar" ? `الشاليه: ${entry.subjectName}` : `Chalet: ${entry.subjectName}`)
    : (language === "ar" ? `العميل: ${entry.subjectName}` : `Customer: ${entry.subjectName}`);
  const normalizedLines = bodySegments.map((line) => {
    const reference = line.match(/(?:تم التحويل إلى الحجز|الحجز الناتج)\s*:?\s*(#?[A-Za-z0-9\u0621-\u064A]+)/);
    if (reference?.[1]) return language === "ar" ? `تحويل الحجز: ${formatBookingReference(reference[1])}` : `Converted booking: ${formatBookingReference(reference[1])}`;
    if (/^استبدل بحجز العميل\s*:/.test(line)) return language === "ar" ? line.replace(/^استبدل بحجز العميل\s*:/, "الحجز المستبدل:") : line;
    return line;
  });
  return { chaletName, actorName: extractActor(entry, language), lines: [subjectLine, ...(paymentLine ? [paymentLine] : []), ...normalizedLines] };
}

export default function AuditLogScreen() {
  const { auditLog, settings } = useBookings();
  const { isRTL, language } = useI18n();
  const { deviceSettings, updateDeviceSettings } = useAppPreferences();
  const { can } = useWorkspaceAccess();
  const colors = useColors();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AuditAction | "all">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>(deviceSettings.auditLogDefaultRange);
  const [filterOpen, setFilterOpen] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  useEffect(() => { setTimeRange(deviceSettings.auditLogDefaultRange); }, [deviceSettings.auditLogDefaultRange]);
  const filtered = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const rangeStart = timeRange === "today" ? startOfToday : timeRange === "two-days" ? startOfToday - 24 * 60 * 60 * 1000 : timeRange === "week" ? startOfToday - 6 * 24 * 60 * 60 * 1000 : timeRange === "month" ? startOfToday - 29 * 24 * 60 * 60 * 1000 : 0;
    return auditLog.filter((entry) => {
      const createdAt = new Date(entry.createdAt).getTime();
      const matchesTime = timeRange === "all" || (Number.isFinite(createdAt) && createdAt >= rangeStart);
      return matchesTime && (filter === "all" || entry.action === filter) && `${entry.subjectName} ${entry.details} ${entry.actorName ?? ""}`.toLowerCase().includes(query.toLowerCase());
    });
  }, [auditLog, filter, query, timeRange]);

  if (!can("view_audit_logs")) return <ScreenContainer edges={["top", "bottom", "left", "right"]}><View style={[styles.emptyCard, { margin: 16, backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="lock" size={30} color={colors.primary} /><Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 17, marginTop: 10, textAlign: align }}>{language === "ar" ? "سجل الإجراءات غير مفعّل" : "Action log is not enabled"}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 6, textAlign: align }}>{language === "ar" ? "اطلب من المدير تفعيل صلاحية عرض سجل الإجراءات." : "Ask your manager to enable action-log access."}</Text></View></ScreenContainer>;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <View style={styles.screen}>
      <View style={styles.headerArea}>
        <SubScreenHeader title={language === "ar" ? "سجل الإجراءات" : "Activity log"} />
        <TextInput value={query} onChangeText={setQuery} placeholder={language === "ar" ? "ابحث بالعميل أو الشاليه" : "Search customer or chalet"} placeholderTextColor={colors.muted} style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
        <View style={[styles.filterTriggerRow, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityState={{ expanded: filterOpen }} onPress={() => setFilterOpen((value) => !value)} style={({ pressed }) => [styles.filterTrigger, { backgroundColor: colors.surface, borderColor: colors.primary, opacity: pressed ? 0.72 : 1, flexDirection: row }]}><MaterialIcons name="filter-list" size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900" }}>{language === "ar" ? "فلترة" : "Filter"}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10 }}>{language === "ar" ? `${filter === "all" ? "الكل" : actionPresentation(filter, language, colors).label} · ${timeRangeLabel(timeRange, language)}` : ""}</Text><MaterialIcons name={filterOpen ? "expand-less" : "expand-more"} size={17} color={colors.primary} /></Pressable></View>
        {filterOpen ? <View style={[styles.filterPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? "نوع الإجراء" : "Action type"}</Text><View style={[styles.filterOptions, { flexDirection: row }]}>{ACTIONS.map((action) => { const active = filter === action; const chip = action === "all" ? { label: language === "ar" ? "الكل" : "All", color: colors.primary } : actionPresentation(action, language, colors); return <Pressable key={action} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setFilter(action)} style={({ pressed }) => [styles.filterChip, { borderColor: active ? chip.color : colors.border, backgroundColor: active ? chip.color + "1A" : colors.background, opacity: pressed ? 0.7 : 1 }]}><Text numberOfLines={1} style={{ color: active ? chip.color : colors.foreground, fontSize: 11, fontWeight: "800" }}>{chip.label}</Text></Pressable>; })}</View><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align, marginTop: 11 }}>{language === "ar" ? "الفترة" : "Period"}</Text><View style={[styles.timeRangeRow, { flexDirection: row }]}>{TIME_RANGES.map((range) => { const active = timeRange === range; return <Pressable key={range} onPress={() => setTimeRange(range)} style={({ pressed }) => [styles.timeRangeChip, { backgroundColor: active ? colors.primary + "16" : colors.background, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: active ? colors.primary : colors.muted, fontSize: 10, fontWeight: "800" }}>{timeRangeLabel(range, language)}</Text></Pressable>; })}</View><Pressable onPress={() => void updateDeviceSettings({ auditLogDefaultRange: timeRange })} style={({ pressed }) => [styles.defaultRangeButton, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "66", flexDirection: row, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="bookmark-added" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? `اعتماد ${timeRangeLabel(timeRange, language)} كافتراضي · الحالي: ${timeRangeLabel(deviceSettings.auditLogDefaultRange, language)}` : `Set ${timeRangeLabel(timeRange, language)} as default`}</Text></Pressable></View> : null}
      </View>
      <FlatList data={filtered} keyExtractor={(entry) => entry.id} initialNumToRender={6} maxToRenderPerBatch={5} windowSize={5} updateCellsBatchingPeriod={50} removeClippedSubviews={false} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <ActionCard entry={item} colors={colors} language={language} currency={settings.currency} align={align} isRTL={isRTL} />} ListEmptyComponent={<View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="history-toggle-off" size={30} color={colors.muted} /><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800", marginTop: 9 }}>{language === "ar" ? "لا توجد إجراءات مطابقة" : "No matching activity"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "center" }}>{language === "ar" ? "غيّر البحث أو الفلتر لعرض الإجراءات الأخرى." : "Change the search or filter to view other actions."}</Text></View>} />
    </View>
  </ScreenContainer>;
}

function ActionCard({ entry, colors, language, currency, align, isRTL }: { entry: AuditLogEntry; colors: ReturnType<typeof useColors>; language: "ar" | "en"; currency: string; align: "left" | "right"; isRTL: boolean }) {
  const presentation = actionPresentation(entry, language, colors);
  const detail = detailsForEntry(entry, currency, language);
  const row = isRTL ? "row-reverse" : "row";
  const [expanded, setExpanded] = useState(false);
  const isConversion = entry.action === "waitlist-promoted";
  const mainLines = isConversion ? detail.lines.slice(0, 2) : detail.lines;
  const extraLines = isConversion ? detail.lines.slice(2) : [];
  return <GlowGlassCard style={styles.card} contentStyle={styles.cardContent}>
    <View style={[styles.cardAccent, { backgroundColor: presentation.color, right: isRTL ? 0 : undefined, left: isRTL ? undefined : 0 }]} />
    <View style={[styles.cardHeader, { flexDirection: row }]}><View style={[styles.actionBadge, { backgroundColor: presentation.color + "18", borderColor: presentation.color + "58", flexDirection: row }]}><MaterialIcons name={presentation.icon} size={14} color={presentation.color} /><Text numberOfLines={1} style={{ color: presentation.color, fontSize: 11, fontWeight: "900" }}>{presentation.label}</Text></View><Text numberOfLines={1} style={[styles.chaletName, { color: colors.foreground, textAlign: align }]}>{detail.chaletName}</Text></View>
    <View style={styles.detailBlock}>{mainLines.map((line, index) => <Text key={`${entry.id}-${index}`} style={[styles.detailText, { color: index === 1 && entry.action === "payment-updated" ? colors.warning : colors.muted, textAlign: align, writingDirection: isRTL ? "rtl" : "ltr" }]}>{line}</Text>)}{extraLines.length ? <Pressable onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.moreDetails, { opacity: pressed ? 0.65 : 1, flexDirection: row }]}><MaterialIcons name={expanded ? "expand-less" : "expand-more"} size={17} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }}>{expanded ? (language === "ar" ? "إخفاء التفاصيل" : "Hide details") : (language === "ar" ? "عرض التفاصيل" : "View details")}</Text></Pressable> : null}{expanded ? extraLines.map((line, index) => <Text key={`${entry.id}-extra-${index}`} style={[styles.detailText, { color: colors.muted, textAlign: align, writingDirection: isRTL ? "rtl" : "ltr" }]}>{line}</Text>) : null}</View>
    <View style={[styles.cardFooter, { borderTopColor: colors.border, flexDirection: row }]}><Text numberOfLines={1} style={[styles.footerText, { color: colors.muted, textAlign: align }]}>{language === "ar" ? `بواسطة: ${detail.actorName}` : `By: ${detail.actorName}`}</Text><Text numberOfLines={1} style={[styles.footerText, { color: colors.muted, textAlign: isRTL ? "left" : "right", writingDirection: "ltr" }]}>{formatAuditTimestamp(entry.createdAt, language)}</Text></View>
  </GlowGlassCard>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  headerArea: { paddingHorizontal: 16, paddingTop: 8 },
  header: { alignItems: "center", gap: 11 },
  backButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  title: { flex: 1, minWidth: 0, fontSize: 25, fontWeight: "900" },
  search: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, marginTop: 14 },
  filterTriggerRow: { marginTop: 12, justifyContent: "flex-start" },
  filterTrigger: { minHeight: 42, borderWidth: 1, borderRadius: 13, alignItems: "center", gap: 7, paddingHorizontal: 12, alignSelf: "flex-start" },
  filterPanel: { borderWidth: 1, borderRadius: 15, padding: 11, marginTop: 8 },
  filterOptions: { flexWrap: "wrap", gap: 7, marginTop: 8, justifyContent: "flex-start" },
  filterChip: { minHeight: 37, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, justifyContent: "center", flexShrink: 0 },
  timeRangeRow: { gap: 7, marginTop: 8, justifyContent: "flex-start" },
  timeRangeChip: { minHeight: 31, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" },
  defaultRangeButton: { minHeight: 39, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10, marginTop: 10 },
  listContent: { padding: 16, paddingTop: 11, paddingBottom: 42 },
  card: { borderRadius: 17, marginBottom: 10 },
  cardContent: { padding: 13 },
  cardAccent: { position: "absolute", top: 0, bottom: 0, width: 3 },
  cardHeader: { alignItems: "center", justifyContent: "space-between", gap: 9 },
  actionBadge: { maxWidth: "68%", minHeight: 30, alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, flexShrink: 1 },
  chaletName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "900" },
  detailBlock: { gap: 5, marginTop: 12 },
  detailText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 19, writingDirection: "rtl" },
  moreDetails: { alignSelf: "flex-start", alignItems: "center", gap: 3, paddingVertical: 2, marginTop: 2 },
  cardFooter: { alignItems: "center", justifyContent: "space-between", gap: 9, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 11, paddingTop: 9 },
  footerText: { flex: 1, minWidth: 0, fontSize: 10, lineHeight: 15 },
  emptyCard: { minHeight: 170, borderWidth: 1, borderRadius: 20, padding: 22, alignItems: "center", justifyContent: "center" },
});
