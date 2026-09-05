import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ChaletSwitcher } from "@/components/chalet-switcher";
import { HomeTopWidget } from "@/components/home-top-widget";
import { DailyOperationsPanel } from "@/components/daily-operations-panel";
import { OperationalAlerts } from "@/components/operational-alerts";
import { BookingViewToggle } from "@/components/booking-view-toggle";
import { BookingCard } from "@/components/booking-card";
import { BookingQuickActions } from "@/components/booking-quick-actions";
import { AvailableSlotCard } from "@/components/available-slot-card";
import { CheckInConfirmationSheet } from "@/components/check-in-confirmation-sheet";
import { CheckOutConfirmationSheet } from "@/components/check-out-confirmation-sheet";
import { ScreenContainer } from "@/components/screen-container";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { BentoGlassCard } from "@/components/bento-glass-card";
import { useColors } from "@/hooks/use-colors";
import { Booking, BookingListFilter, PricedBookingType, availableSiblingSlotForBooking, bookingCoversDate, chaletColor, chaletLabel, getBookingDisplayOperationalState, getBookingStayTimeline, isWaitlistExpired, remainingAmount, splitBookingsByCheckout, todayISO } from "@/lib/booking-model";
import { unreadNotificationCount } from "@/lib/notification-center";
import { getDailyOperations } from "@/lib/daily-operations";
import { getTurnoverTaskCandidates } from "@/lib/turnover-tasks";
import { upcomingJordanianHolidays } from "@/lib/jordan-holidays";
import { useBookings } from "@/lib/booking-store";
import { useChaletScope } from "@/lib/chalet-scope";
import { useI18n } from "@/lib/i18n";
import { useAppPreferences } from "@/lib/app-preferences";
import { openBookingWhatsApp } from "@/lib/whatsapp-helper";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { useGlobalFeatureFlags } from "@/lib/feature-flags";
import { startOAuthLogin } from "@/constants/oauth";

export default function HomeScreen() {
  const appRouter = useRouter();
  const { bookings, waitlist, turnoverTasks, chalets, settings, hydrated, markBookingCheckedIn, completeBookingStay } = useBookings();
  const { notifications, assets } = useBookings();
  const { selectedChaletId } = useChaletScope();
  const { isRTL, language } = useI18n();
  const { formatTime, formatDate, deviceSettings, updateDeviceSettings } = useAppPreferences();
  const { isAuthenticated } = useWorkspaceAccess();
  const globalFlags = useGlobalFeatureFlags();
  const cleaningFlowEnabled = globalFlags.feat_cleaning_inspection;
  const guestCheckInEnabled = globalFlags.feat_guest_checkin;
  const colors = useColors();
  const [clock, setClock] = useState(() => Date.now());
  const [operationalSavingId, setOperationalSavingId] = useState<string | null>(null);
  const [operationalFeedback, setOperationalFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [checkInBooking, setCheckInBooking] = useState<Booking | null>(null);
  const [checkOutBooking, setCheckOutBooking] = useState<Booking | null>(null);
  const [restoreHintVisible, setRestoreHintVisible] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const today = todayISO();

  useFocusEffect(useCallback(() => {
    setClock(Date.now());
    const interval = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []));

  useEffect(() => {
    if (!operationalFeedback) return;
    const timeout = setTimeout(() => setOperationalFeedback(null), 3_600);
    return () => clearTimeout(timeout);
  }, [operationalFeedback]);

  useEffect(() => {
    const shouldShowHint = hydrated && bookings.length === 0 && !isAuthenticated;
    if (!shouldShowHint) { setRestoreHintVisible(false); return; }
    setRestoreHintVisible(true);
    const timeout = setTimeout(() => setRestoreHintVisible(false), 5_500);
    return () => clearTimeout(timeout);
  }, [bookings.length, hydrated, isAuthenticated]);

  const scopedBookings = useMemo(() => bookings.filter((booking) => booking.status !== "cancelled" && booking.status !== "completed" && (!selectedChaletId || booking.chaletId === selectedChaletId)), [bookings, selectedChaletId]);
  const todayBookings = useMemo(() => scopedBookings.filter((booking) => booking.startDate <= today && booking.endDate >= today), [scopedBookings, today]);
  const activeOperationalBookings = useMemo(() => splitBookingsByCheckout(scopedBookings, clock).activeBookings, [clock, scopedBookings]);
  const remaining = useMemo(() => scopedBookings.reduce((sum, booking) => sum + remainingAmount(booking), 0), [scopedBookings]);
  const pendingWaitlist = useMemo(() => waitlist.filter((entry) => entry.status === "active" && !isWaitlistExpired(entry, clock) && (!selectedChaletId || entry.chaletId === selectedChaletId)), [clock, selectedChaletId, waitlist]);
  const dailyOperations = useMemo(() => getDailyOperations(bookings, waitlist, clock, selectedChaletId), [bookings, clock, selectedChaletId, waitlist]);
  const upcomingHolidays = useMemo(() => upcomingJordanianHolidays(today, 7), [today]);
  const turnoverAttentionCount = useMemo(() => getTurnoverTaskCandidates(bookings, turnoverTasks, clock, selectedChaletId).filter((task) => task.status !== "completed").length, [bookings, clock, selectedChaletId, turnoverTasks]);
  const checkoutWarningCount = useMemo(() => activeOperationalBookings.filter((booking) => getBookingStayTimeline(booking, clock).phase === "checkout-warning").length, [activeOperationalBookings, clock]);
  const occupiedChaletCount = useMemo(() => new Set(bookings.filter((booking) => booking.status !== "cancelled" && booking.status !== "waitlisted" && bookingCoversDate(booking, today) && (!selectedChaletId || booking.chaletId === selectedChaletId)).map((booking) => booking.chaletId).filter(Boolean)).size, [bookings, selectedChaletId, today]);
  const availableChaletCount = selectedChaletId ? 1 : chalets.length;
  const occupancyPercent = availableChaletCount > 0 ? Math.round((occupiedChaletCount / availableChaletCount) * 100) : undefined;
  const selectedChaletAccent = selectedChaletId ? chaletColor(selectedChaletId, chalets, colors.primary) : colors.primary;
  const openFilteredBookings = (filter: BookingListFilter) => appRouter.push({ pathname: "/(tabs)/bookings", params: { filter } } as never);
  const quickBookSlot = (slot: { chaletId: string; date: string; period: "morning" | "evening" }) => appRouter.push({ pathname: "/booking-form", params: { date: slot.date, bookingType: slot.period, chaletId: slot.chaletId } } as never);
  const slotTimeRange = (period: Extract<PricedBookingType, "morning" | "evening">) => {
    const times = settings.bookingTypes[period];
    const overnight = period === "evening" ? (language === "ar" ? " (اليوم التالي)" : " (next day)") : "";
    return `${formatTime(times.startTime)} – ${formatTime(times.endTime)}${overnight}`;
  };
  const callGuest = async (booking: Booking) => {
    const phone = booking.phone.replace(/[^\d+]/g, "");
    if (phone.replace(/\D/g, "").length < 7) {
      Alert.alert(language === "ar" ? "رقم غير صالح" : "Invalid phone", language === "ar" ? "لا يوجد رقم صالح للاتصال بهذا الضيف." : "There is no valid phone number for this guest.");
      return;
    }
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      Alert.alert(language === "ar" ? "تعذر إجراء الاتصال" : "Call unavailable", language === "ar" ? "تعذر فتح تطبيق الاتصال على هذا الجهاز." : "The calling application could not be opened on this device.");
    }
  };
  const sendCheckInWhatsApp = async (booking: Booking) => {
    try {
      await openBookingWhatsApp(booking, settings, language, chalets.find((chalet) => chalet.id === booking.chaletId));
    } catch {
      Alert.alert(language === "ar" ? "تعذر فتح واتساب" : "WhatsApp unavailable", language === "ar" ? "تحقق من تفعيل المشاركة ورقم الضيف وتثبيت واتساب." : "Check sharing settings, the guest number, and that WhatsApp is installed.");
    }
  };
  const operationalFailureMessage = (error: unknown, action: "check-in" | "check-out") => {
    const code = error instanceof Error ? error.message : "";
    if (code.endsWith("-forbidden")) return language === "ar" ? "لا تملك صلاحية تعديل الحجوزات. اطلب من المدير تفعيلها لحسابك." : "You do not have permission to edit bookings. Ask an administrator to enable it.";
    if (code === `booking-not-ready-for-${action}`) return language === "ar" ? (action === "check-in" ? "لا يمكن تسجيل الوصول قبل بداية وقت الإقامة أو بعد انتهائها." : "لا يمكن إنهاء الإقامة قبل وقت الوصول وبعد بداية الإقامة.") : "This operational action is not available at the current stay time.";
    if (code === "booking-not-found") return language === "ar" ? "هذا الحجز لم يعد متاحًا. حدّث القائمة ثم حاول مرة أخرى." : "This booking is no longer available. Refresh the list and try again.";
    return language === "ar" ? "تعذر حفظ الإجراء الآن. حاول مرة أخرى." : "The action could not be saved. Please try again.";
  };
  const saveOperationalAction = (booking: Booking, action: "check-in" | "check-out", confirmation?: NonNullable<Booking["checkInConfirmation"]> | import("@/lib/booking-model").CheckoutConfirmation) => {
    const isCheckIn = action === "check-in";
    setOperationalSavingId(booking.id);
    const request = isCheckIn ? markBookingCheckedIn(booking.id, confirmation as NonNullable<Booking["checkInConfirmation"]>) : completeBookingStay(booking.id, confirmation as import("@/lib/booking-model").CheckoutConfirmation);
    void request.then(() => setOperationalFeedback({
      isError: false,
      message: isCheckIn
        ? (language === "ar" ? "تم تسجيل وصول الضيف بنجاح." : "Guest arrival was recorded.")
        : (language === "ar" ? "تم إنهاء الإقامة ونقل الحجز إلى السجل." : "The stay was completed and moved to history."),
    })).catch((error: unknown) => setOperationalFeedback({ message: operationalFailureMessage(error, action), isError: true })).finally(() => { setOperationalSavingId(null); if (isCheckIn) setCheckInBooking(null); else setCheckOutBooking(null); });
  };
  const runOperationalAction = (booking: Booking, action: "check-in" | "check-out") => {
    const isCheckIn = action === "check-in";
    if (isCheckIn) { setCheckInBooking(booking); return; }
    setCheckOutBooking(booking);
  };
  const operationalActionFor = (booking: Booking) => {
    if (!deviceSettings.showGuestCheckIn) return undefined;
    if (!guestCheckInEnabled) return undefined;
    const operationalState = getBookingDisplayOperationalState(booking, clock, true).state;
    const timeline = getBookingStayTimeline(booking, clock);
    if (operationalState === "awaiting-arrival") return { label: operationalSavingId === booking.id ? (language === "ar" ? "جارٍ تسجيل الوصول" : "Recording arrival") : (language === "ar" ? "تسجيل وصول الضيف" : "Record guest arrival"), icon: "login" as const, color: colors.success, onPress: () => runOperationalAction(booking, "check-in"), disabled: operationalSavingId === booking.id || timeline.phase === "upcoming" };
    if (operationalState === "in-house" || operationalState === "checkout-warning") return { label: operationalSavingId === booking.id ? (language === "ar" ? "جارٍ تسجيل المغادرة" : "Recording checkout") : (language === "ar" ? "تسجيل مغادرة الضيف" : "Record guest checkout"), icon: "logout" as const, color: colors.primary, onPress: () => runOperationalAction(booking, "check-out"), disabled: operationalSavingId === booking.id };
    return undefined;
  };

  const unreadCount = unreadNotificationCount(notifications ?? []);
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <HomeTopWidget logoUrl={settings.businessLogoUrl} unreadCount={unreadCount} onNewBooking={() => appRouter.push("/booking-form" as never)} onNotifications={() => appRouter.push("/notifications" as never)} />
      <BentoGlassCard radius={20} style={styles.quickSearchCard} contentStyle={{ padding: 0 }}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "فتح البحث السريع" : "Open quick search"} onPress={() => appRouter.push("/quick-search" as never)} style={({ pressed }) => [styles.quickSearch, { flexDirection: row, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="search" size={19} color={colors.primary} /><Text style={[styles.flex, { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: align }]}>{language === "ar" ? "بحث سريع بالاسم أو الهاتف أو المرجع" : "Quick search by guest, phone, or reference"}</Text><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={19} color={colors.primary} /></Pressable></BentoGlassCard>

      <View style={[styles.scopeBlock, { flexDirection: row }]}><View style={styles.scopeChalet}><ChaletSwitcher /></View><BookingViewToggle value={deviceSettings.bookingCardViewMode} onChange={(bookingCardViewMode) => void updateDeviceSettings({ bookingCardViewMode })} accentColor={selectedChaletAccent} /></View>

      <BentoGlassCard radius={24} elevated accentColor={selectedChaletAccent} style={styles.summaryBar} contentStyle={[styles.summaryBarContent, { flexDirection: row }]}>
      <SummaryMetric label={language === "ar" ? "حجوزات اليوم" : "Today's bookings"} value={String(todayBookings.length)} icon="calendar-month" colors={colors} accent={colors.success} align={align} onPress={() => openFilteredBookings("today")} />
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <SummaryMetric label={language === "ar" ? "نسبة الإشغال" : "Occupancy"} value={occupancyPercent === undefined ? "—" : `${occupancyPercent}%`} icon="percent" colors={colors} accent={colors.primary} align={align} onPress={() => appRouter.push("/(tabs)/calendar" as never)} />
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <SummaryMetric label={language === "ar" ? "الرصيد المستحق" : "Outstanding balance"} value={remaining > 0 ? `${remaining.toFixed(2)} ${settings.currency}` : language === "ar" ? "لا يوجد" : "None"} icon="account-balance-wallet" colors={colors} accent={colors.warning} align={align} onPress={() => openFilteredBookings("balance")} />
      </BentoGlassCard>
      {restoreHintVisible ? <View accessibilityLiveRegion="polite" style={[styles.restoreDataHint, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}><MaterialIcons name="cloud-download" size={18} color={colors.primary} /><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تسجيل الدخول لاستعادة البيانات" : "Sign in to restore data"} onPress={() => void startOAuthLogin()} style={({ pressed }) => [styles.flex, { opacity: pressed ? 0.68 : 1 }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "هل لديك بيانات منشأة محفوظة؟" : "Have saved workspace data?"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? "اضغط لتسجيل الدخول واستعادتها بأمان." : "Tap to sign in and restore it securely."}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إخفاء الإشعار" : "Dismiss notification"} onPress={() => setRestoreHintVisible(false)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View> : null}
      {deviceSettings.showDailyTasks ? <DailyOperationsPanel arrivals={dailyOperations.arrivals.length} checkouts={dailyOperations.checkouts.length} outstanding={dailyOperations.outstanding.length} waitlist={dailyOperations.waitlist.length} expanded={!deviceSettings.dailyOperationsCollapsed} onToggleExpanded={() => void updateDeviceSettings({ dailyOperationsCollapsed: !deviceSettings.dailyOperationsCollapsed })} onArrivalsPress={() => openFilteredBookings("today")} onCheckoutsPress={() => openFilteredBookings("today")} onOutstandingPress={() => openFilteredBookings("balance")} upcomingHolidays={upcomingHolidays} onHolidayPricingPress={(holiday) => appRouter.push({ pathname: "/booking-form", params: { date: holiday.date, holidayPricing: "1" } } as never)} onWaitlistPress={() => appRouter.push({ pathname: "/(tabs)/waitlist", params: { tab: "active" } } as never)} onTurnoverPress={() => { if (cleaningFlowEnabled) appRouter.push("/turnover-tasks" as never); }} showTurnoverAction={deviceSettings.showTurnoverTasks} /> : null}
      <OperationalAlerts turnoverCount={deviceSettings.showTurnoverTasks && cleaningFlowEnabled ? turnoverAttentionCount : 0} checkoutWarningCount={checkoutWarningCount} onTurnoverPress={() => { if (cleaningFlowEnabled) appRouter.push("/turnover-tasks" as never); }} onCheckoutsPress={() => openFilteredBookings("today")} />
      {pendingWaitlist.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "طلبات الانتظار المعلقة" : "Active waitlist requests"} onPress={() => appRouter.push({ pathname: "/(tabs)/waitlist", params: { tab: "active" } } as never)} style={({ pressed }) => [styles.waitlistIndicator, { backgroundColor: colors.warning + "12", flexDirection: row, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="pending-actions" size={16} color={colors.warning} /><Text style={[styles.flex, { color: colors.warning, fontSize: 11, fontWeight: "900", textAlign: align }]}>{language === "ar" ? `${pendingWaitlist.length} طلب انتظار يحتاج متابعة` : `${pendingWaitlist.length} waitlist request${pendingWaitlist.length === 1 ? "" : "s"} need attention`}</Text><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.warning} /></Pressable> : null}

      <View style={[styles.sectionHeader, { flexDirection: row }]}>
        <View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "حالة الشاليهات اليوم" : "Today's chalet status"}</Text><Text style={[styles.sectionHint, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "متابعة الإشغال والوصول والمغادرة اليوم" : "Quick occupancy, arrival, and checkout follow-up"}</Text></View>
        <Pressable onPress={() => appRouter.push("/(tabs)/bookings" as never)} style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1 })}><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900" }}>{language === "ar" ? "كل الحجوزات" : "All bookings"}</Text></Pressable>
      </View>
      {todayBookings.length === 0 ? <GlowGlassCard style={styles.emptyCard} contentStyle={styles.emptyCardContent}><MaterialIcons name="event-available" size={23} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800", marginTop: 8 }}>{language === "ar" ? "لا توجد حجوزات نشطة اليوم" : "No active bookings today"}</Text></GlowGlassCard> : todayBookings.slice(0, 3).map((booking) => {
        const availablePeriod = availableSiblingSlotForBooking(booking, activeOperationalBookings);
        const themeColor = chaletColor(booking.chaletId, chalets, colors.primary);
        return <View key={booking.id}><BookingCard booking={booking} chalets={chalets} colors={colors} language={language} currency={settings.currency} formatDate={formatDate} formatTime={formatTime} now={clock} viewMode={deviceSettings.bookingCardViewMode} manualCheckInMode={deviceSettings.showGuestCheckIn} onDetailsPress={() => appRouter.push({ pathname: "/booking-detail", params: { id: booking.id } } as never)} footer={<BookingQuickActions language={language} colors={colors} themeColor={themeColor} operationalAction={operationalActionFor(booking)} onWhatsApp={() => void sendCheckInWhatsApp(booking)} onCall={() => void callGuest(booking)} onDetails={() => appRouter.push({ pathname: "/booking-detail", params: { id: booking.id } } as never)} />} />{availablePeriod ? <AvailableSlotCard chaletName={chaletLabel(booking.chaletId, booking.chaletName, chalets)} dateText={formatDate(booking.startDate)} timeRange={slotTimeRange(availablePeriod)} period={availablePeriod} language={language} themeColor={themeColor} onQuickBook={() => quickBookSlot({ chaletId: booking.chaletId!, date: booking.startDate, period: availablePeriod })} /> : null}</View>;
      })}
      {!hydrated ? <Text style={{ color: colors.muted, textAlign: "center", fontSize: 12, marginTop: 12 }}>{language === "ar" ? "جارٍ تحميل البيانات المحلية..." : "Loading local data..."}</Text> : null}
    </ScrollView>
    <CheckInConfirmationSheet booking={checkInBooking} visible={Boolean(checkInBooking)} saving={operationalSavingId === checkInBooking?.id} colors={colors} currency={settings.currency} language={language} isRTL={isRTL} formatDate={formatDate} formatTime={formatTime} onClose={() => setCheckInBooking(null)} onConfirm={(confirmation) => { if (checkInBooking) saveOperationalAction(checkInBooking, "check-in", confirmation); }} />
    <CheckOutConfirmationSheet booking={checkOutBooking} visible={Boolean(checkOutBooking)} saving={operationalSavingId === checkOutBooking?.id} colors={colors} currency={settings.currency} language={language} isRTL={isRTL} assets={assets} onClose={() => setCheckOutBooking(null)} onConfirm={(confirmation) => { if (checkOutBooking) saveOperationalAction(checkOutBooking, "check-out", confirmation); }} />
    {operationalFeedback ? <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.operationalToast, { backgroundColor: operationalFeedback.isError ? colors.error : colors.success }]}><MaterialIcons name={operationalFeedback.isError ? "error-outline" : "check-circle"} size={20} color="#FFFFFF" /><Text style={[styles.flex, { color: "#FFFFFF", fontSize: 12, fontWeight: "800", textAlign: align }]}>{operationalFeedback.message}</Text></View> : null}
  </ScreenContainer>;
}

function SummaryMetric({ label, value, icon, colors, accent, align, onPress }: { label: string; value: string; icon: "account-balance-wallet" | "calendar-month" | "percent"; colors: ReturnType<typeof useColors>; accent: string; align: "left" | "right"; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.summaryMetric, { opacity: pressed ? 0.64 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}><View style={[styles.summaryIcon, { backgroundColor: accent + "13" }]}><MaterialIcons name={icon} size={15} color={accent} /></View><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", letterSpacing: 0.1, marginTop: 8, textAlign: align }}>{value}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, fontWeight: "600", letterSpacing: 0.2, marginTop: 3, textAlign: align }}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 188 },
  flex: { flex: 1, minWidth: 0 },
  bellButton: { width: 43, height: 43, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  bellBadge: { position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  scopeBlock: { marginTop: 13, alignItems: "center", justifyContent: "space-between", gap: 10 },
  scopeChalet: { flex: 1, minWidth: 0 },
  quickSearchCard: { marginTop: 12, borderRadius: 20 },
  quickSearch: { minHeight: 50, borderRadius: 20, paddingHorizontal: 16, alignItems: "center", justifyContent: "space-between", gap: 10 },
  summaryBar: { minHeight: 104, borderRadius: 24, marginTop: 14 },
  summaryBarContent: { minHeight: 104, paddingVertical: 14, alignItems: "stretch", justifyContent: "space-between", gap: 4 },
  summaryMetric: { flex: 1, minWidth: 0, paddingHorizontal: 10, justifyContent: "center" },
  summaryIcon: { width: 30, height: 30, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  summaryDivider: { width: StyleSheet.hairlineWidth, marginVertical: 8, opacity: 0.6 },
  restoreDataHint: { minHeight: 60, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 },
  waitlistIndicator: { minHeight: 36, borderRadius: 15, alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 12, marginTop: 10 },
  sectionHeader: { alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 24, marginBottom: 12 },
  sectionTitle: { fontWeight: "900", fontSize: 18, letterSpacing: 0.15 },
  sectionHint: { fontSize: 11.5, marginTop: 3, lineHeight: 16 },
  emptyCard: { minHeight: 104, borderRadius: 24 },
  emptyCardContent: { minHeight: 104, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 16 },
  operationalToast: { position: "absolute", top: 14, left: 16, right: 16, zIndex: 30, minHeight: 50, borderRadius: 14, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, elevation: 8, shadowColor: "#071412", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  bookingCard: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 9 },
  guestHeader: { width: "100%", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  homeGuestMeta: { alignItems: "center", gap: 3, marginTop: 4 },
  homeGuestMetaDivider: { color: "#64748B", fontSize: 13, marginHorizontal: 3 },
  chaletBadge: { minWidth: 72, maxWidth: 116, minHeight: 33, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignItems: "center", justifyContent: "center", flexShrink: 1 },
  chaletBadgeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", textAlign: "center" },
  periodPill: { alignSelf: "center", minWidth: 0, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, flexShrink: 1 },
  periodDot: { width: 6, height: 6, borderRadius: 3 },
  scheduleBlock: { flex: 1, minWidth: 0, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  fullScheduleBlock: { width: "100%", minHeight: 68, flex: 0, flexGrow: 0, flexShrink: 0, justifyContent: "center", overflow: "hidden" },
  scheduleDateText: { fontSize: 13, fontWeight: "600" },
  scheduleDescription: { fontSize: 12, fontWeight: "600", lineHeight: 19 },
  statusPeriodBar: { width: "100%", minHeight: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginTop: 8, alignItems: "center", justifyContent: "space-between", gap: 8 },
  statusPeriodText: { flex: 1, minWidth: 0, fontSize: 10, fontWeight: "900" },
  financialRow: { minHeight: 34, alignItems: "center", justifyContent: "space-between", gap: 4, marginTop: 8, flexWrap: "nowrap" },
  financialSlot: { width: "32%", minWidth: 0, alignItems: "stretch", justifyContent: "center" },
  paymentPill: { width: "100%", minHeight: 32, borderWidth: 1, borderRadius: 9, paddingHorizontal: 5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  depositPill: { width: "100%", minHeight: 32, borderWidth: 1, borderRadius: 9, paddingHorizontal: 5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  slotAction: { width: "100%", minHeight: 32, borderWidth: 1, borderRadius: 9, paddingHorizontal: 5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  occupiedPill: { width: "100%", minHeight: 32, borderWidth: 1, borderRadius: 9, paddingHorizontal: 5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
});
