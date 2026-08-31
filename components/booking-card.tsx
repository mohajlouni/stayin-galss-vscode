import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { ThemeColorPalette } from "@/constants/theme";
import {
  type Booking,
  type AuditLogEntry,
  type Chalet,
  bookingShiftLabel,
  chaletColor,
  chaletLabel,
  depositFinancialStatus,
  formatRemainingTime,
  formatBookingReference,
  getBookingDisplayOperationalState,
  normalizeBookingEndDate,
  propertyTypeIcon,
  propertyTypeLabel,
  propertyTypeFrameRadius,
  refundableDepositAmount,
  remainingAmount,
  remainingRefundableDeposit,
  totalDepositRefunded,
  typeColors,
  type BookingCardViewMode,
} from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useAppPreferences } from "@/lib/app-preferences";
import { GlowGlassCard } from "@/components/glow-glass-card";

type BookingCardProps = {
  booking: Booking;
  chalets: Chalet[];
  colors: ThemeColorPalette;
  language: "ar" | "en";
  currency: string;
  formatDate: (date: string) => string;
  formatTime: (time: string) => string;
  now: number;
  onDetailsPress: () => void;
  onPress?: () => void;
  footer?: ReactNode;
  viewMode?: BookingCardViewMode;
  manualCheckInMode?: boolean;
};

/** مستوى الزجاج الغائر — داخلي معتم شفاف للفقرات داخل البطاقة. */
const SUNK = "rgba(0, 0, 0, 0.25)";

function arabicWeekday(dateKey: string) {
  return ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][new Date(`${dateKey}T12:00:00`).getDay()] ?? "";
}

function timePeriodLabel(time: string) {
  const hour = Number.parseInt(time, 10);
  return time.includes("م") || (Number.isFinite(hour) && hour >= 12) ? "مساء" : "صباح";
}

function stayStatus(booking: Booking, now: number, language: "ar" | "en", formatTime: (time: string) => string, manualCheckInMode: boolean) {
  const operationalState = getBookingDisplayOperationalState(booking, now, manualCheckInMode);
  const remaining = formatRemainingTime(operationalState.remainingMilliseconds, language);
  const nearingCheckout = operationalState.remainingMilliseconds <= 60 * 60 * 1_000;
  const checkInConfirmed = manualCheckInMode && Boolean(booking.checkedInAt);
  if (operationalState.state === "awaiting-arrival") {
    return {
      label: manualCheckInMode
        ? (language === "ar" ? `في انتظار الوصول · موعد الوصول: ${formatTime(booking.startTime)}` : `Awaiting arrival · At ${formatTime(booking.startTime)}`)
        : (language === "ar" ? `في انتظار الوصول · يبدأ بعد ${remaining}` : `Awaiting arrival · Starts in ${remaining}`),
      color: "#EAB308",
      background: "rgba(234, 179, 8, 0.12)",
    };
  }
  if (manualCheckInMode && !checkInConfirmed && operationalState.state === "no-show") {
    return { label: language === "ar" ? "انتهت فترة الإقامة · لم يُسجل الوصول" : "Stay ended · Arrival was not recorded", color: "#94A3B8", background: "rgba(148, 163, 184, 0.10)" };
  }
  if (operationalState.state === "ended") return { label: language === "ar" ? "انتهت فترة الإقامة" : "Stay ended", color: "#94A3B8", background: "rgba(148, 163, 184, 0.10)" };
  if (manualCheckInMode && !checkInConfirmed) {
    return { label: language === "ar" ? "لم يُسجل الوصول بعد · الإقامة جارية" : "Arrival not recorded yet · Stay in progress", color: "#D6A13D", background: "rgba(214, 161, 61, 0.12)" };
  }
  if (checkInConfirmed) return { label: language === "ar" ? `تم تسجيل الوصول ✓ · الإقامة جارية · متبقي: ${remaining}` : `Checked in ✓ · Stay in progress · ${remaining} remaining`, color: "#10B981", background: "rgba(16, 185, 129, 0.12)" };
  if (nearingCheckout) return { label: language === "ar" ? `الإقامة جارية · متبقي: ${remaining}` : `Stay in progress · ${remaining} remaining`, color: "#10B981", background: "rgba(16, 185, 129, 0.12)" };
  return { label: language === "ar" ? `الإقامة جارية · متبقي: ${remaining}` : `Stay in progress · ${remaining} remaining`, color: "#10B981", background: "rgba(16, 185, 129, 0.12)" };
}

function compactAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function numberRun(value: string) {
  return `\u200E${value}\u200E`;
}

export function BookingCard({ booking, chalets, colors, language, currency, formatDate, formatTime, now, onDetailsPress, onPress, footer, viewMode = "expanded", manualCheckInMode = true }: BookingCardProps) {
  const { auditLog } = useBookings();
  const { deviceSettings } = useAppPreferences();
  const activeManualCheckInMode = manualCheckInMode && deviceSettings.showGuestCheckIn;
  const [creatorActivityOpen, setCreatorActivityOpen] = useState(false);
  const isArabic = language === "ar";
  const themeColor = chaletColor(booking.chaletId, chalets);
  const shiftColor = booking.shiftColor ?? typeColors[booking.bookingType].text;
  const chaletName = chaletLabel(booking.chaletId, booking.chaletName, chalets, isArabic ? "الشاليه غير محدد" : "Chalet not specified");
  const bookedProperty = chalets.find((chalet) => chalet.id === booking.chaletId);
  const propertyIcon = propertyTypeIcon(bookedProperty?.propertyType);
  const propertyType = propertyTypeLabel(bookedProperty?.propertyType, language);
  const frameRadius = propertyTypeFrameRadius(bookedProperty?.propertyType);
  const frameGlow = deviceSettings.glassGlowIntensity === "subtle" ? { border: "66", shadowOpacity: 0.10 } : deviceSettings.glassGlowIntensity === "vivid" ? { border: "B8", shadowOpacity: 0.25 } : { border: "8A", shadowOpacity: 0.18 };
  const normalizedBooking = normalizeBookingEndDate(booking);
  const endDate = normalizedBooking.endDate;
  const balance = remainingAmount(booking);
  const deposit = refundableDepositAmount(booking);
  const depositPending = deposit > 0 && booking.status === "awaiting-deposit";
  const depositState = depositFinancialStatus(booking);
  const depositRefunded = totalDepositRefunded(booking);
  const depositHeld = remainingRefundableDeposit(booking);
  const status = stayStatus(normalizedBooking, now, language, formatTime, activeManualCheckInMode);
  const phoneText = numberRun(booking.phone);
  const referenceText = numberRun(formatBookingReference(booking.bookingReference));
  const createdByName = booking.createdByName?.trim() || (isArabic ? "غير مسجل" : "Not recorded");
  const creatorKnown = Boolean(booking.createdByName?.trim());
  const creatorRoleIcon = booking.createdByRole === "owner" ? "admin-panel-settings" : booking.createdByRole === "employee" ? "badge" : "person-outline";
  const creatorRoleColor = booking.createdByRole === "owner" ? colors.primary : booking.createdByRole === "employee" ? colors.success : colors.muted;
  const creatorRoleLabel = booking.createdByRole === "owner" ? (isArabic ? "مالك" : "Owner") : booking.createdByRole === "employee" ? (isArabic ? "موظف" : "Employee") : (isArabic ? "دور غير مسجل" : "Role unavailable");
  const isCompactView = viewMode === "compact";
  const creatorActivity = useMemo(() => {
    if (!creatorKnown) return [] as AuditLogEntry[];
    const name = booking.createdByName!.trim();
    return auditLog.filter((entry) => entry.details.includes(name)).slice(0, 10);
  }, [auditLog, booking.createdByName, creatorKnown]);
  const dateRange = isArabic
    ? `${numberRun(formatDate(booking.startDate))} – ${numberRun(formatDate(endDate))}`
    : `${formatDate(booking.startDate)} – ${formatDate(endDate)}`;
  const scheduleDescription = isArabic
    ? `من ${timePeriodLabel(booking.startTime)} ${arabicWeekday(booking.startDate)} ${formatTime(booking.startTime)} – إلى ${timePeriodLabel(booking.endTime)} ${arabicWeekday(endDate)} ${formatTime(booking.endTime)}`
    : `${formatTime(booking.startTime)} – ${formatTime(booking.endTime)}`;
  const balanceLabel = balance > 0 ? `${isArabic ? "متبقي" : "Remaining"}: ${compactAmount(balance)} ${currency}` : (isArabic ? "مدفوع" : "Paid");
  const depositLabel = depositState === "fully-refunded"
    ? (isArabic ? `تأمين مسترد: ${compactAmount(depositRefunded)} ${currency}` : `Refunded: ${compactAmount(depositRefunded)} ${currency}`)
    : depositRefunded > 0 && depositHeld > 0
      ? (isArabic ? `دفعة: ${compactAmount(depositRefunded)}/${compactAmount(deposit)} ${currency}` : `Refund: ${compactAmount(depositRefunded)}/${compactAmount(deposit)} ${currency}`)
      : deposit > 0
        ? (isArabic ? `تأمين: ${compactAmount(deposit)} ${currency}` : `Deposit: ${compactAmount(deposit)} ${currency}`)
        : (isArabic ? "لا يوجد تأمين" : "No deposit");
  const depositIcon = depositPending ? "pending-actions" : depositState === "fully-refunded" ? "task-alt" : deposit > 0 ? "verified-user" : "shield";
  const depositTextColor = depositPending ? "#FBBF24" : depositState === "none" ? "#94A3B8" : "#34D399";
  const textAlign = isArabic ? "right" : "left";

  return <GlowGlassCard glowColor={themeColor} radius={frameRadius} intensity={18} style={[styles.card, styles.unitGlowFrame, { borderRadius: frameRadius, borderColor: themeColor + frameGlow.border, borderTopColor: "rgba(255, 255, 255, 0.15)", borderBottomColor: themeColor + "40", borderLeftColor: themeColor + "26", borderRightColor: themeColor + "26", borderWidth: 1, borderTopWidth: 1, borderBottomWidth: 1, borderLeftWidth: 0.5, borderRightWidth: 0.5, shadowColor: themeColor, shadowOpacity: frameGlow.shadowOpacity }, isCompactView && styles.compactCard]}>
    <Pressable accessibilityRole="button" accessibilityLabel={isArabic ? "فتح تفاصيل الحجز" : "Open booking details"} onPress={onPress ?? onDetailsPress} style={({ pressed }) => [styles.cardPressable, { opacity: pressed ? 0.76 : 1 }]}>
      <View style={styles.rowBetween}>
        <View style={styles.guestInfo}>
          <View style={styles.guestStrip}>
            <Text numberOfLines={1} style={[styles.guestName, { color: colors.foreground, textAlign }]}>{isArabic ? `الاسم: ${booking.customerName}` : `Name: ${booking.customerName}`}</Text>
            <View style={[styles.guestMeta, isArabic && styles.guestMetaArabic]}>
              <Text numberOfLines={1} style={styles.guestMetaText}>{phoneText}</Text>
            </View>
          </View>
        </View>
        <View style={styles.chaletIdentity}><View style={[styles.chaletBadge, { backgroundColor: themeColor }]}><MaterialIcons name={propertyIcon} size={14} color="#FFFFFF" /><Text numberOfLines={1} style={styles.chaletBadgeText}>{chaletName}</Text></View><Text numberOfLines={1} style={[styles.propertyTypeText, { color: themeColor }]}>{propertyType}</Text><Text numberOfLines={1} style={[styles.bookingReference, { color: themeColor }]}>{referenceText}</Text></View>
      </View>

      <View style={[styles.scheduleBox, isCompactView && styles.scheduleBoxCompact, { backgroundColor: SUNK }]}>
        <View style={[styles.scheduleInfo, isCompactView && styles.scheduleInfoCompact]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.scheduleDate, isCompactView && styles.scheduleDateCompact, { color: colors.foreground, textAlign: isCompactView ? "center" : isArabic ? "center" : textAlign }]}>{dateRange}</Text>
          {!isCompactView ? <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.64} style={[styles.scheduleDescription, { color: colors.muted, textAlign }]}>{scheduleDescription}</Text> : null}
        </View>
        <Pressable disabled={!creatorKnown} accessibilityRole="button" accessibilityLabel={creatorKnown ? (isArabic ? `عرض سجل إجراءات ${createdByName}` : `View ${createdByName}'s activity`) : (isArabic ? "اسم منشئ الحجز غير متاح" : "Booking creator unavailable")} onPress={() => setCreatorActivityOpen(true)} style={({ pressed }) => [styles.creatorSlot, { backgroundColor: SUNK, opacity: pressed && creatorKnown ? 0.68 : 1 }]}><MaterialIcons name={creatorRoleIcon} size={14} color={creatorRoleColor} /><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.creatorSlotText, { color: creatorKnown ? colors.foreground : colors.muted }]}>{createdByName}</Text></Pressable>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.stayBanner, { backgroundColor: status.background }]}><Text numberOfLines={1} style={[styles.stayText, { color: status.color }]}>{status.label}</Text></View>
        <View style={[styles.periodTag, { backgroundColor: shiftColor + "12" }]}><View style={[styles.periodDot, { backgroundColor: shiftColor }]} /><Text numberOfLines={1} style={[styles.periodText, { color: shiftColor }]}>{bookingShiftLabel(booking, undefined, language)}</Text></View>
      </View>

      {!isCompactView ? <View style={styles.financialRow}>
        <FinancialSlot label={balanceLabel} icon={balance > 0 ? "account-balance-wallet" : "check-circle"} textColor={balance > 0 ? "#FBBF24" : "#34D399"} surfaceColor={SUNK} />
        <FinancialSlot label={depositLabel} icon={depositIcon} textColor={depositTextColor} surfaceColor={SUNK} />
        <FinancialSlot label={`${isArabic ? "الإجمالي" : "Total"}: ${compactAmount(booking.price)} ${currency}`} icon="payments" textColor={colors.foreground} surfaceColor={SUNK} />
      </View> : null}
    </Pressable>
    {footer && !isCompactView ? <View style={styles.footer}>{footer}</View> : null}
    <Modal visible={creatorActivityOpen} transparent animationType="slide" onRequestClose={() => setCreatorActivityOpen(false)}><View style={styles.creatorActivityBackdrop}><View style={[styles.creatorActivitySheet, { backgroundColor: colors.surface }]}><View style={styles.creatorActivityHeader}><View style={[styles.creatorRoleIcon, { backgroundColor: creatorRoleColor + "18" }]}><MaterialIcons name={creatorRoleIcon} size={20} color={creatorRoleColor} /></View><View style={styles.creatorActivityTitle}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: isArabic ? "right" : "left" }}>{createdByName}</Text><Text style={{ color: creatorRoleColor, fontSize: 11, fontWeight: "800", marginTop: 2, textAlign: isArabic ? "right" : "left" }}>{creatorRoleLabel}</Text></View><Pressable accessibilityLabel={isArabic ? "إغلاق سجل الإجراءات" : "Close activity log"} onPress={() => setCreatorActivityOpen(false)} style={[styles.creatorActivityClose, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={19} color={colors.muted} /></Pressable></View><ScrollView style={styles.creatorActivityScroll} contentContainerStyle={styles.creatorActivityContent} showsVerticalScrollIndicator={false}>{<View style={[styles.creatorActivityEntry, { backgroundColor: colors.glassInset }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", textAlign: isArabic ? "right" : "left" }}>{isArabic ? "سجّل هذا الحجز" : "Recorded this booking"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 4, textAlign: isArabic ? "right" : "left" }}>{new Date(booking.createdAt).toLocaleString(isArabic ? "ar-JO" : "en-GB")}</Text></View>}{creatorActivity.length ? creatorActivity.map((entry) => <View key={entry.id} style={[styles.creatorActivityEntry, { backgroundColor: colors.glassInset }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", textAlign: isArabic ? "right" : "left" }}>{entry.subjectName}</Text><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 4, textAlign: isArabic ? "right" : "left" }}>{entry.details}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 5, textAlign: isArabic ? "right" : "left" }}>{new Date(entry.createdAt).toLocaleString(isArabic ? "ar-JO" : "en-GB")}</Text></View>) : <Text style={{ color: colors.muted, fontSize: 12, marginTop: 12, textAlign: isArabic ? "right" : "left" }}>{isArabic ? "لا توجد إجراءات إضافية مسجلة لهذا المستخدم بعد." : "No additional recorded actions for this user yet."}</Text>}</ScrollView></View></View></Modal>
  </GlowGlassCard>;
}

function FinancialSlot({ label, icon, textColor, surfaceColor }: { label: string; icon: "account-balance-wallet" | "check-circle" | "verified-user" | "shield" | "payments" | "pending-actions" | "task-alt"; textColor: string; surfaceColor: string }) {
  return <View style={[styles.financialSlot, { backgroundColor: surfaceColor }]}><MaterialIcons name={icon} size={12} color={textColor} /><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={[styles.financialText, { color: textColor }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 26, padding: 12, marginBottom: 11 },
  unitGlowFrame: { borderWidth: 1.35, shadowRadius: 17, shadowOffset: { width: 0, height: 8 }, elevation: 7 },
  compactCard: { paddingVertical: 10 },
  cardPressable: { minHeight: 64 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  guestInfo: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  guestStrip: { width: "100%", borderRadius: 16, paddingVertical: 8, paddingHorizontal: 11, overflow: "hidden", backgroundColor: "rgba(0, 0, 0, 0.25)" },
  guestName: { width: "100%", fontSize: 16, fontWeight: "800", writingDirection: "rtl" },
  guestMeta: { flexDirection: "row", alignItems: "center", minHeight: 18, gap: 3, marginTop: 3 },
  guestMetaArabic: { width: "100%", justifyContent: "flex-start", alignSelf: "flex-end" },
  guestMetaText: { color: "#94A3B8", fontSize: 13, writingDirection: "ltr" },
  chaletIdentity: { minWidth: 72, maxWidth: 116, alignItems: "center", gap: 4, flexShrink: 1 },
  chaletBadge: { width: "100%", minHeight: 33, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center" },
  chaletBadgeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", textAlign: "center" },
  propertyTypeText: { fontSize: 9, fontWeight: "800", textAlign: "center" },
  bookingReference: { maxWidth: "100%", fontSize: 10, fontWeight: "900", writingDirection: "ltr", textAlign: "center" },
  scheduleBox: { width: "100%", borderRadius: 16, paddingVertical: 9, marginTop: 9, alignItems: "center", justifyContent: "space-between", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scheduleBoxCompact: { paddingVertical: 6 },
  scheduleInfo: { flex: 1, minWidth: 120, paddingHorizontal: 8, alignItems: "flex-end" },
  scheduleInfoCompact: { flex: 1, width: undefined, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  scheduleDate: { width: "100%", fontSize: 12, fontWeight: "800", writingDirection: "rtl" },
  scheduleDateCompact: { fontSize: 14, letterSpacing: 0.1 },
  scheduleDescription: { fontSize: 10, lineHeight: 15, marginTop: 2, letterSpacing: -0.18, writingDirection: "rtl" },
  creatorSlot: { flex: 1, minWidth: 100, maxWidth: "32%", minHeight: 28, borderRadius: 12, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3, flexShrink: 0 },
  creatorSlotText: { flex: 1, minWidth: 0, fontSize: 9, fontWeight: "900", textAlign: "center", writingDirection: "rtl" },
  creatorActivityBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(7, 20, 18, 0.58)" },
  creatorActivitySheet: { maxHeight: "72%", borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  creatorActivityHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 9, paddingBottom: 13 },
  creatorRoleIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  creatorActivityTitle: { flex: 1, minWidth: 0 },
  creatorActivityClose: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  creatorActivityScroll: { maxHeight: 390 },
  creatorActivityContent: { paddingTop: 12, paddingBottom: 6 },
  creatorActivityEntry: { borderRadius: 14, padding: 10, marginTop: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  stayBanner: { flex: 1, minWidth: 120, maxWidth: "66%", minHeight: 28, borderRadius: 12, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  stayText: { fontSize: 9, fontWeight: "900", textAlign: "center", writingDirection: "rtl" },
  periodTag: { flex: 1, minWidth: 90, maxWidth: "32%", minHeight: 28, borderRadius: 12, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 0 },
  periodDot: { width: 6, height: 6, borderRadius: 3 },
  periodText: { fontSize: 10, fontWeight: "800", writingDirection: "rtl" },
  financialRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 },
  financialSlot: { flex: 1, minWidth: 90, maxWidth: "32%", minHeight: 30, borderRadius: 14, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 0 },
  financialText: { flex: 1, minWidth: 0, fontSize: 9, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  footer: { marginTop: 10 },
});
