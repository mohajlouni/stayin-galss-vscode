import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { ChaletSwitcher } from "@/components/chalet-switcher";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { useBookings } from "@/lib/booking-store";
import { useChaletScope } from "@/lib/chalet-scope";
import { useI18n } from "@/lib/i18n";
import { Booking, Chalet, Settings, WaitlistEntry, bookingTypeLabel, chaletColor, chaletLabel, formatBookingReference, formatMoney, isWaitlistExpired, totalPaid, waitlistCountdownLabel, waitlistRemainingMilliseconds, weekdayLabel } from "@/lib/booking-model";
import { findConflicts } from "@/services/availabilityService";

type PendingAction = { kind: "promote" | "remove"; entry: WaitlistEntry };
type WaitlistTab = "active" | "promoted" | "cancelled";

export default function WaitlistScreen() {
  const { waitlist, bookings, chalets, settings, deleteWaitlist } = useBookings();
  const { selectedChaletId } = useChaletScope();
  const { t, isRTL, language } = useI18n();
  const { formatDate, formatTime } = useAppPreferences();
  const colors = useColors();
  const { tab } = useLocalSearchParams<{ tab?: WaitlistTab }>();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [waitlistTab, setWaitlistTab] = useState<WaitlistTab>("active");
  const [clock, setClock] = useState(() => Date.now());
  const align = isRTL ? "right" : "left";
  const row: "row" | "row-reverse" = isRTL ? "row-reverse" : "row";

  const scopedWaitlist = waitlist.filter((entry) => !selectedChaletId || entry.chaletId === selectedChaletId);
  const waitlistStartTimestamp = (entry: WaitlistEntry) => {
    const value = Date.parse(`${entry.requestedDate}T${entry.startTime ?? "09:00"}:00`);
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  };
  const activeWaitlist = scopedWaitlist
    .filter((entry) => (entry.status === "active" || !entry.status) && !isWaitlistExpired(entry, clock))
    .toSorted((left, right) => waitlistStartTimestamp(left) - waitlistStartTimestamp(right));
  const promotedWaitlist = scopedWaitlist.filter((entry) => entry.status === "promoted").toSorted((left, right) => (right.promotedAt ?? "").localeCompare(left.promotedAt ?? ""));
  const cancelledWaitlist = scopedWaitlist.filter((entry) => entry.status === "cancelled");
  const displayedWaitlist = waitlistTab === "active" ? activeWaitlist : waitlistTab === "promoted" ? promotedWaitlist : cancelledWaitlist;

  useFocusEffect(useCallback(() => {
    setClock(Date.now());
    const interval = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []));
  useEffect(() => {
    if (tab === "active" || tab === "promoted" || tab === "cancelled") setWaitlistTab(tab);
  }, [tab]);

  const remove = async (entry: WaitlistEntry) => {
    try {
      await deleteWaitlist(entry.id);
      Alert.alert(language === "ar" ? "تم الإلغاء" : "Cancelled", language === "ar" ? "نُقل طلب الانتظار إلى سجل الإلغاء مع الاحتفاظ ببياناته." : "The waiting request was moved to cancellation history with its details retained.");
    } catch {
      Alert.alert(language === "ar" ? "تعذر الإلغاء" : "Cancellation failed", language === "ar" ? "تعذر إلغاء طلب الانتظار. حاول مرة أخرى." : "The waiting request could not be cancelled. Please try again.");
    }
  };

  const confirmAction = async () => {
    const action = pendingAction;
    if (!action) return;
    setPendingAction(null);
    if (action.kind === "remove") {
      await remove(action.entry);
      return;
    }
    router.push({ pathname: "/booking-form", params: { waitlistId: action.entry.id } } as never);
  };

  const isRemoval = pendingAction?.kind === "remove";
  const actionTitle = isRemoval ? (language === "ar" ? "إلغاء طلب الانتظار" : "Cancel waiting request") : (language === "ar" ? "تحويل إلى حجز" : "Convert to booking");
  const actionBody = isRemoval
    ? (language === "ar" ? `هل أنت متأكد من إلغاء طلب ${pendingAction?.entry.customerName ?? ""}؟ سيبقى محفوظًا في سجل الإلغاء.` : `Cancel ${pendingAction?.entry.customerName ?? ""}'s waiting request? It will remain in cancellation history.`)
    : (language === "ar" ? `سيُفتح طلب ${pendingAction?.entry.customerName ?? ""} كنموذج حجز. راجع البيانات ثم احفظه كحجز مؤكد.` : "The request will open as a booking form. Review it, then save as confirmed.");

  return <>
    <ScreenContainer>
      <FlatList
        data={displayedWaitlist}
        keyExtractor={(entry) => entry.id}
        style={styles.list}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<>
          <SubScreenHeader title={t("waitlist")} action={{ label: language === "ar" ? "طلب" : "Request", icon: "add", accessibilityLabel: language === "ar" ? "إضافة طلب انتظار" : "Add waiting request", onPress: () => router.push({ pathname: "/booking-form", params: { mode: "waitlist" } } as never) }} />
          <ChaletSwitcher />
          <View style={[styles.segmentedTabs, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}>
            <Segment label={language === "ar" ? `المعلقة (${activeWaitlist.length})` : `Active (${activeWaitlist.length})`} icon="pending-actions" active={waitlistTab === "active"} colors={colors} onPress={() => setWaitlistTab("active")} />
            <Segment label={language === "ar" ? `سجل التحويل (${promotedWaitlist.length})` : `Converted (${promotedWaitlist.length})`} icon="event-available" active={waitlistTab === "promoted"} colors={colors} onPress={() => setWaitlistTab("promoted")} />
            <Segment label={language === "ar" ? `سجل الإلغاء (${cancelledWaitlist.length})` : `Cancellation history (${cancelledWaitlist.length})`} icon="history" active={waitlistTab === "cancelled"} colors={colors} onPress={() => setWaitlistTab("cancelled")} />
          </View>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800", marginTop: 16, marginBottom: 10, textAlign: align }}>{waitlistTab === "active" ? (language === "ar" ? `الطلبات المعلقة (${activeWaitlist.length})` : `Active requests (${activeWaitlist.length})`) : waitlistTab === "promoted" ? (language === "ar" ? `سجل التحويل إلى الحجز (${promotedWaitlist.length})` : `Converted to booking (${promotedWaitlist.length})`) : (language === "ar" ? `سجل الإلغاء (${cancelledWaitlist.length})` : `Cancellation history (${cancelledWaitlist.length})`)}</Text>
        </>}
        ListEmptyComponent={<View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name={waitlistTab === "active" ? "hourglass-empty" : waitlistTab === "promoted" ? "event-available" : "history"} size={28} color={colors.muted} /><Text style={{ color: colors.foreground, fontWeight: "800", marginTop: 10 }}>{waitlistTab === "active" ? (language === "ar" ? "لا توجد طلبات معلقة" : "No active requests") : waitlistTab === "promoted" ? (language === "ar" ? "لا توجد طلبات محولة" : "No converted requests") : (language === "ar" ? "لا توجد طلبات ملغاة" : "No cancelled requests")}</Text></View>}
        renderItem={({ item, index }) => <WaitlistCard entry={item} index={index} mode={waitlistTab} now={clock} bookings={bookings} chalets={chalets} settings={settings} currency={settings.currency} language={language} colors={colors} formatDate={formatDate} formatTime={formatTime} align={align} row={row} onPromote={() => setPendingAction({ kind: "promote", entry: item })} onRemove={() => setPendingAction({ kind: "remove", entry: item })} />}
      />
    </ScreenContainer>
    <Modal transparent visible={Boolean(pendingAction)} animationType="fade" onRequestClose={() => setPendingAction(null)}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.confirmCard, { backgroundColor: colors.surface, borderColor: isRemoval ? colors.error + "88" : colors.primary + "88" }]}>
          <MaterialIcons name={isRemoval ? "cancel" : "event-available"} size={28} color={isRemoval ? colors.error : colors.primary} />
          <Text style={[styles.confirmTitle, { color: colors.foreground, textAlign: align }]}>{actionTitle}</Text>
          <Text style={[styles.confirmBody, { color: colors.muted, textAlign: align }]}>{actionBody}</Text>
          <View style={[styles.confirmActions, { flexDirection: row }]}>
            <Pressable onPress={() => setPendingAction(null)} style={({ pressed }) => [styles.confirmButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{language === "ar" ? "رجوع" : "Back"}</Text></Pressable>
            <Pressable onPress={() => void confirmAction()} style={({ pressed }) => [styles.confirmButton, { backgroundColor: isRemoval ? colors.error : colors.primary, opacity: pressed ? 0.72 : 1 }]}><Text style={{ color: colors.background, fontWeight: "900" }}>{isRemoval ? (language === "ar" ? "تأكيد الإلغاء" : "Confirm cancellation") : (language === "ar" ? "فتح نموذج الحجز" : "Open booking form")}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}

function Segment({ label, icon, active, colors, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; active: boolean; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.segment, { backgroundColor: active ? colors.primary : "transparent", opacity: pressed ? 0.75 : 1 }]}><MaterialIcons name={icon} size={14} color={active ? colors.background : colors.muted} /><Text numberOfLines={1} style={{ color: active ? colors.background : colors.foreground, fontSize: 10, fontWeight: "900", flexShrink: 1 }}>{label}</Text></Pressable>;
}

type WaitlistCardProps = { entry: WaitlistEntry; index: number; mode: WaitlistTab; now: number; bookings: Booking[]; chalets: Chalet[]; settings: Settings; currency: string; language: "ar" | "en"; colors: ReturnType<typeof useColors>; formatDate: (date: string) => string; formatTime: (time: string) => string; align: "left" | "right"; row: "row" | "row-reverse"; onPromote: () => void; onRemove: () => void };

function WaitlistCard({ entry, index, mode, now, bookings, chalets, settings, currency, language, colors, formatDate, formatTime, align, row, onPromote, onRemove }: WaitlistCardProps) {
  const archived = mode !== "active";
  const promoted = mode === "promoted";
  const chaletMarker = chaletColor(entry.chaletId, chalets);
  const endDate = entry.endDate ?? entry.requestedDate;
  const conflict = findConflicts({ chaletId: entry.chaletId, chaletName: entry.chaletName, startDate: entry.requestedDate, endDate, bookingType: entry.bookingType, startTime: entry.startTime ?? "09:00", endTime: entry.endTime ?? "21:00" }, bookings)[0];
  const chaletName = chaletLabel(entry.chaletId, entry.chaletName, chalets, language === "ar" ? "الشاليه غير محدد" : "Chalet not selected");
  const dateRange = `${formatDate(entry.requestedDate)} — ${formatDate(endDate)}`;
  const dayRange = entry.requestedDate === endDate ? weekdayLabel(entry.requestedDate, language) : `${weekdayLabel(entry.requestedDate, language)} — ${weekdayLabel(endDate, language)}`;
  const cancellationText = entry.cancellationReason === "start-time" ? (language === "ar" ? "أُلغي تلقائيًا عند وقت بداية الحجز" : "Automatically cancelled at start time") : (language === "ar" ? "أُلغي يدويًا" : "Manually cancelled");
  const cancellationTime = entry.cancelledAt ? ` · ${formatDate(entry.cancelledAt.slice(0, 10))} ${formatTime(entry.cancelledAt.slice(11, 16))}` : "";
  const promotedBooking = entry.promotedBookingId ? bookings.find((booking) => booking.id === entry.promotedBookingId) : undefined;
  const storedPromotionReference = promotedBooking?.bookingReference ?? entry.promotedBookingReference;
  const promotionReference = storedPromotionReference && !storedPromotionReference.startsWith("b-") ? formatBookingReference(storedPromotionReference) : (language === "ar" ? "مرجع الحجز غير متاح" : "Booking reference unavailable");
  const promotionTime = entry.promotedAt ? `${formatDate(entry.promotedAt.slice(0, 10))} · ${formatTime(entry.promotedAt.slice(11, 16))}` : (language === "ar" ? "غير متاح" : "Unavailable");
  const remaining = waitlistRemainingMilliseconds(entry, now);
  const deadlineColor = remaining <= 3_600_000 ? colors.error : colors.warning;
  const statusColor = conflict ? colors.warning : deadlineColor;
  const statusText = conflict
    ? (language === "ar" ? `المهلة: ${waitlistCountdownLabel(entry, now, language)} · يتعارض مع حجز العميل: ${conflict.customerName}` : `Deadline: ${waitlistCountdownLabel(entry, now, language)} · Conflicts with: ${conflict.customerName}`)
    : (language === "ar" ? `المهلة قبل الإلغاء: ${waitlistCountdownLabel(entry, now, language)}` : `Time before cancellation: ${waitlistCountdownLabel(entry, now, language)}`);

  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: archived ? colors.border : colors.warning + "80" }]}>
    <View style={[styles.cardTop, { flexDirection: row }]}>
      <View style={styles.flex}><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 16, fontWeight: "800", textAlign: align }}>{language === "ar" ? `الاسم: ${entry.customerName}` : `Guest: ${entry.customerName}`}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13, marginTop: 3, textAlign: align, writingDirection: "ltr" }}>{entry.phone}</Text></View>
      <View style={[styles.chaletPill, { backgroundColor: chaletMarker }]}><Text numberOfLines={1} style={styles.chaletPillText}>{chaletName}</Text></View>
    </View>
    <View style={[styles.scheduleBox, { borderColor: chaletMarker + "88", backgroundColor: colors.background, flexDirection: row }]}>
      <View style={styles.flex}><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontWeight: "800", textAlign: align, writingDirection: "ltr" }}>{dateRange}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{dayRange} · {formatTime(entry.startTime ?? "09:00")} — {formatTime(entry.endTime ?? "21:00")}</Text></View>
      <View style={[styles.periodPill, { borderColor: (entry.shiftColor ?? chaletMarker) + "88" }]}><Text style={{ color: entry.shiftColor ?? chaletMarker, fontSize: 11, fontWeight: "800" }}>{entry.shiftName?.trim() || bookingTypeLabel(entry.bookingType, settings, language)}</Text></View>
    </View>
    {!archived ? <View style={[styles.statusRow, { flexDirection: row, backgroundColor: statusColor + "12", borderColor: statusColor + "66" }]}><MaterialIcons name={conflict ? "event-busy" : "timer"} size={15} color={statusColor} /><Text numberOfLines={1} style={[styles.flex, { color: statusColor, fontSize: 11, fontWeight: "900", textAlign: align }]}>{statusText}</Text></View> : null}
    <View style={[styles.financeRow, { flexDirection: row }]}>
      <View style={[styles.financePill, { borderColor: chaletMarker + "88" }]}><Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "800" }}>{language === "ar" ? `الإجمالي: ${formatMoney(entry.price ?? 0, currency)}` : `Total: ${formatMoney(entry.price ?? 0, currency)}`}</Text></View>
      <View style={[styles.financePill, { borderColor: chaletMarker + "88" }]}><Text style={{ color: colors.success, fontSize: 11, fontWeight: "800" }}>{language === "ar" ? `المدفوع: ${formatMoney(totalPaid({ payments: entry.payments ?? [] }), currency)}` : `Paid: ${formatMoney(totalPaid({ payments: entry.payments ?? [] }), currency)}`}</Text></View>
      <View style={[styles.priority, { backgroundColor: colors.warning + "1D" }]}><Text style={{ color: colors.warning, fontSize: 10, fontWeight: "800" }}>{language === "ar" ? `الترتيب ${index + 1}` : `Order ${index + 1}`}</Text></View>
    </View>
    {entry.notes ? <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 8, textAlign: align }}>{entry.notes}</Text> : null}
    {archived ? promoted ? <ConversionHistory reference={promotionReference} actorName={entry.promotedByName} replacedCustomerNames={entry.promotedReplacedCustomerNames} convertedAt={promotionTime} language={language} colors={colors} row={row} align={align} /> : <View style={[styles.historyRow, { flexDirection: row, backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name={entry.cancellationReason === "start-time" ? "schedule" : "cancel"} size={16} color={colors.muted} /><Text style={[styles.flex, { color: colors.muted, fontSize: 11, fontWeight: "800", textAlign: align }]}>{cancellationText + cancellationTime}</Text></View> : <View style={[styles.actions, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تحويل الطلب إلى حجز" : "Promote request"} onPress={onPromote} style={({ pressed }) => [styles.promote, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="event-available" size={16} color={colors.background} /><Text style={{ color: colors.background, fontSize: 12, fontWeight: "800" }}>{language === "ar" ? "تحويل إلى حجز" : "Promote"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إلغاء طلب الانتظار" : "Cancel waiting request"} onPress={onRemove} style={({ pressed }) => [styles.remove, { backgroundColor: colors.error + "18", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="cancel" size={18} color={colors.error} /></Pressable></View>}
  </View>;
}

function ConversionHistory({ reference, actorName, replacedCustomerNames, convertedAt, language, colors, row, align }: { reference: string; actorName?: string; replacedCustomerNames?: string; convertedAt: string; language: "ar" | "en"; colors: ReturnType<typeof useColors>; row: "row" | "row-reverse"; align: "left" | "right" }) {
  const details = [
    { label: language === "ar" ? "مرجع الحجز" : "Booking reference", value: reference, reference: true },
    { label: language === "ar" ? "نفّذ التحويل" : "Converted by", value: actorName ?? (language === "ar" ? "غير متاح" : "Unknown") },
    ...(replacedCustomerNames ? [{ label: language === "ar" ? "الحجز المستبدل" : "Replaced booking", value: replacedCustomerNames }] : []),
    { label: language === "ar" ? "وقت التحويل" : "Converted at", value: convertedAt },
  ];
  return <View style={[styles.conversionHistory, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "66" }]}><View style={[styles.conversionTitle, { flexDirection: row }]}><MaterialIcons name="event-available" size={17} color={colors.primary} /><Text style={[styles.flex, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "تم التحويل إلى حجز مؤكد" : "Converted to a confirmed booking"}</Text></View><View style={styles.conversionDetails}>{details.map((detail) => <View key={detail.label} style={[styles.conversionDetail, { flexDirection: row, borderColor: colors.border }]}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{detail.label}</Text><Text numberOfLines={1} style={[styles.conversionValue, { color: colors.foreground, textAlign: align, writingDirection: detail.reference ? "ltr" : "rtl" }]}>{detail.value}</Text></View>)}</View></View>;
}

const styles = StyleSheet.create({
  list: { flex: 1, minHeight: 0 }, content: { padding: 16, paddingBottom: 244 }, flex: { flex: 1, minWidth: 0 },
  header: { alignItems: "flex-start", gap: 12 }, addButton: { minHeight: 44, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, flexShrink: 0 },
  infoCard: { alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginTop: 10 }, segmentedTabs: { minHeight: 44, borderWidth: 1, borderRadius: 13, padding: 4, gap: 4, marginTop: 10 },
  segment: { flex: 1, minHeight: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, paddingHorizontal: 7 }, empty: { minHeight: 160, borderWidth: 1, borderRadius: 20, padding: 22, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 20, padding: 15, marginBottom: 10 }, cardTop: { alignItems: "flex-start", gap: 9 }, chaletPill: { minWidth: 78, maxWidth: 112, minHeight: 34, borderRadius: 10, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", flexShrink: 0 }, chaletPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  scheduleBox: { alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 13, padding: 10, marginTop: 12 }, periodPill: { minWidth: 74, minHeight: 32, borderRadius: 9, borderWidth: 1, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  statusRow: { minHeight: 34, alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, marginTop: 9 }, financeRow: { alignItems: "center", gap: 7, marginTop: 10 }, financePill: { flex: 1, minHeight: 33, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }, priority: { borderRadius: 9, paddingHorizontal: 7, paddingVertical: 8, flexShrink: 0 },
  actions: { gap: 8, marginTop: 13, zIndex: 3, elevation: 3 }, promote: { flex: 1, minHeight: 43, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }, remove: { width: 46, minHeight: 43, borderRadius: 12, alignItems: "center", justifyContent: "center" }, historyRow: { minHeight: 40, borderWidth: 1, borderRadius: 11, alignItems: "center", gap: 7, paddingHorizontal: 10, marginTop: 13 }, conversionHistory: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 13 }, conversionTitle: { alignItems: "center", gap: 7 }, conversionDetails: { marginTop: 8, gap: 0 }, conversionDetail: { minHeight: 30, alignItems: "center", justifyContent: "space-between", gap: 10, borderTopWidth: 1, paddingVertical: 5 }, conversionValue: { flex: 1, minWidth: 0, fontSize: 11, fontWeight: "900" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(2, 6, 23, 0.76)", justifyContent: "center", padding: 24 }, confirmCard: { borderWidth: 1, borderRadius: 22, padding: 20 }, confirmTitle: { fontSize: 19, fontWeight: "900", marginTop: 12 }, confirmBody: { fontSize: 13, lineHeight: 21, marginTop: 7 }, confirmActions: { gap: 9, marginTop: 18 }, confirmButton: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
