import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { ChaletSwitcher } from "@/components/chalet-switcher";
import { BookingViewToggle } from "@/components/booking-view-toggle";
import { BookingCard } from "@/components/booking-card";
import { BookingQuickActions } from "@/components/booking-quick-actions";
import { AvailableSlotCard } from "@/components/available-slot-card";
import { CalendarDateField } from "@/components/calendar-date-picker";
import { CheckInConfirmationSheet } from "@/components/check-in-confirmation-sheet";
import { CheckOutConfirmationSheet } from "@/components/check-out-confirmation-sheet";
import { CompactScreenHeader } from "@/components/compact-screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { Booking, BookingListFilter, PricedBookingType, WaitlistEntry, availableSiblingSlotForBooking, bookingMatchesSearch, chaletColor, chaletLabel, getBookingOperationalState, isWaitlistExpired, remainingAmount, splitBookingsByCheckout, waitlistCountdownLabel, waitlistRemainingMilliseconds } from "@/lib/booking-model";
import { findConflicts } from "@/services/availabilityService";
import { useBookings } from "@/lib/booking-store";
import { useChaletScope } from "@/lib/chalet-scope";
import { useI18n } from "@/lib/i18n";
import { isWaitlistPriorityDue, waitlistPriorityCandidates } from "@/lib/waitlist-priority";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { openBookingWhatsApp } from "@/lib/whatsapp-helper";

type TimeFilter = "all" | "today" | "two-days" | "tomorrow" | "week" | "month" | "upcoming";
type StatusFilter = "all" | "confirmed" | "cancelled" | "completed";
type PaymentFilter = "all" | "due" | "paid";

function timeRangeLabel(filter: TimeFilter, language: "ar" | "en") {
  const labels: Record<TimeFilter, { ar: string; en: string }> = {
    all: { ar: "الكل", en: "All" },
    today: { ar: "يومي", en: "Daily" },
    "two-days": { ar: "يومان", en: "Two days" },
    tomorrow: { ar: "غدًا", en: "Tomorrow" },
    week: { ar: "أسبوعي", en: "Weekly" },
    month: { ar: "شهري", en: "Monthly" },
    upcoming: { ar: "القادمة", en: "Upcoming" },
  };
  return labels[filter][language];
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addLocalDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function bookingDateKey(date: string) {
  return date.slice(0, 10);
}

function matchesTimeFilter(booking: Booking, filter: TimeFilter, today: string, dateKey = booking.startDate.slice(0, 10)) {
  if (filter === "all") return true;
  if (filter === "today") return dateKey === today;
  if (filter === "two-days") return dateKey >= addLocalDays(today, -1) && dateKey <= today;
  if (filter === "tomorrow") return dateKey === addLocalDays(today, 1);
  if (filter === "week") return dateKey >= addLocalDays(today, -6) && dateKey <= today;
  if (filter === "month") return dateKey >= addLocalDays(today, -29) && dateKey <= today;
  return dateKey >= today;
}

function matchesStatusFilter(booking: Booking, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "confirmed") return booking.status === "confirmed" || booking.status === "awaiting-deposit";
  return booking.status === filter;
}

function matchesDateRange(booking: Booking, fromDate: string, toDate: string) {
  const bookingStartDate = bookingDateKey(booking.startDate);
  const bookingEndDate = bookingDateKey(booking.endDate);
  if (fromDate && bookingEndDate < fromDate) return false;
  if (toDate && bookingStartDate > toDate) return false;
  return true;
}

export default function BookingsScreen() {
  const { bookings, waitlist, chalets, settings, hydrated, refreshWorkspaceData, acknowledgeWaitlistPriority, markBookingCheckedIn, completeBookingStay, archiveBookingAsNoShow } = useBookings();
  const { selectedChaletId } = useChaletScope();
  const { activeWorkspaceId } = useWorkspaceAccess();
  const { t, isRTL, language } = useI18n();
  const { formatDate, formatTime, deviceSettings, updateDeviceSettings } = useAppPreferences();
  const colors = useColors();
  const { filter: requestedFilter } = useLocalSearchParams<{ filter?: BookingListFilter }>();
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [query, setQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(deviceSettings.activeBookingDefaultRange);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paymentView, setPaymentView] = useState<PaymentFilter>("all");
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [draftTimeFilter, setDraftTimeFilter] = useState<TimeFilter>(deviceSettings.activeBookingDefaultRange);
  const [draftStatusFilter, setDraftStatusFilter] = useState<StatusFilter>("all");
  const [draftPaymentView, setDraftPaymentView] = useState<PaymentFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [draftDateFrom, setDraftDateFrom] = useState("");
  const [draftDateTo, setDraftDateTo] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [operationalSavingId, setOperationalSavingId] = useState<string | null>(null);
  const [operationalFeedback, setOperationalFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [checkInBooking, setCheckInBooking] = useState<Booking | null>(null);
  const [checkOutBooking, setCheckOutBooking] = useState<Booking | null>(null);
  const recoveryAttemptWorkspace = useRef<number | null>(null);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const selectedChaletAccent = selectedChaletId ? chaletColor(selectedChaletId, chalets) : colors.primary;
  const selectionColor = colors.primary;
  const isHistoryView = activeTab === "history";

  useEffect(() => {
    if (!requestedFilter) return;
    if (requestedFilter === "today") setTimeFilter("today");
    if (requestedFilter === "upcoming") setTimeFilter("upcoming");
    if (requestedFilter === "balance") setPaymentView("due");
    if (requestedFilter === "cancelled") setStatusFilter("cancelled");
  }, [requestedFilter]);
  useFocusEffect(useCallback(() => {
    setClock(Date.now());
    const interval = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []));
  useEffect(() => {
    if (!hydrated || bookings.length || !activeWorkspaceId || recoveryAttemptWorkspace.current === activeWorkspaceId) return;
    recoveryAttemptWorkspace.current = activeWorkspaceId;
    void refreshWorkspaceData().then((restored) => {
      if (restored) setOperationalFeedback({ isError: false, message: language === "ar" ? "تمت استعادة بيانات الحجوزات من المنشأة المشتركة وتحديث القائمة." : "Bookings were restored from the shared property snapshot." });
    });
  }, [activeWorkspaceId, bookings.length, hydrated, language, refreshWorkspaceData]);
  useEffect(() => {
    if (!operationalFeedback) return;
    const timeout = setTimeout(() => setOperationalFeedback(null), 3_600);
    return () => clearTimeout(timeout);
  }, [operationalFeedback]);
  useEffect(() => {
    const defaultRange = activeTab === "history" ? deviceSettings.endedStayDefaultRange : deviceSettings.activeBookingDefaultRange;
    setTimeFilter(defaultRange);
    setDraftTimeFilter(defaultRange);
  }, [activeTab, deviceSettings.activeBookingDefaultRange, deviceSettings.endedStayDefaultRange]);

  const { activeBookings, historyBookings } = useMemo(() => splitBookingsByCheckout(bookings, clock), [bookings, clock]);
  const endedStayBookings = useMemo(() => historyBookings.filter((booking) => booking.status !== "cancelled"), [historyBookings]);
  const priorityWaitlistByBookingId = useMemo(() => {
    const due = waitlistPriorityCandidates(bookings, waitlist, clock).filter((candidate) => isWaitlistPriorityDue(candidate, clock));
    return new Map(due.map((candidate) => [candidate.booking.id, candidate]));
  }, [bookings, clock, waitlist]);
  const activeWaitlistByBookingId = useMemo(() => {
    const indexed = new Map<string, WaitlistEntry[]>();
    for (const entry of waitlist) {
      if (entry.status !== "active" || isWaitlistExpired(entry, clock)) continue;
      const configuredTimes = settings.bookingTypes[entry.bookingType];
      const conflicts = findConflicts({ chaletId: entry.chaletId, chaletName: entry.chaletName, startDate: entry.requestedDate, endDate: entry.endDate ?? entry.requestedDate, bookingType: entry.bookingType, startTime: entry.startTime ?? configuredTimes.startTime, endTime: entry.endTime ?? configuredTimes.endTime }, activeBookings);
      for (const booking of conflicts) {
        const entries = indexed.get(booking.id) ?? [];
        entries.push(entry);
        indexed.set(booking.id, entries);
      }
    }
    return indexed;
  }, [activeBookings, clock, settings.bookingTypes, waitlist]);
  const tabBookings = isHistoryView ? endedStayBookings : activeBookings;
  const todayKey = localDateKey();
  const filtered = useMemo(() => tabBookings.filter((booking) => {
    if (selectedChaletId && booking.chaletId !== selectedChaletId) return false;
    const chaletName = chaletLabel(booking.chaletId, booking.chaletName, chalets, "");
    const matchesPayment = paymentView === "all" || (paymentView === "due" ? remainingAmount(booking) > 0 : remainingAmount(booking) === 0);
    const filterDate = isHistoryView ? bookingDateKey(booking.endDate) : bookingDateKey(booking.startDate);
    return matchesPayment && matchesTimeFilter(booking, timeFilter, todayKey, filterDate) && matchesStatusFilter(booking, statusFilter) && matchesDateRange({ ...booking, startDate: filterDate }, dateFrom, dateTo) && bookingMatchesSearch(booking, chaletName, query);
  }).sort((first, second) => {
    const firstPast = bookingDateKey(first.startDate) < todayKey ? 1 : 0;
    const secondPast = bookingDateKey(second.startDate) < todayKey ? 1 : 0;
    if (firstPast !== secondPast) return firstPast - secondPast;
    return `${bookingDateKey(first.startDate)}T${first.startTime}`.localeCompare(`${bookingDateKey(second.startDate)}T${second.startTime}`);
  }), [tabBookings, chalets, dateFrom, dateTo, isHistoryView, paymentView, query, selectedChaletId, statusFilter, timeFilter, todayKey]);
  const activeFilterCount = Number(timeFilter !== "all") + Number(statusFilter !== "all") + Number(paymentView !== "all") + Number(Boolean(dateFrom || dateTo));

  const showAllActiveBookings = () => {
    setActiveTab("active");
    setTimeFilter("all");
    setStatusFilter("all");
    setPaymentView("all");
    setDateFrom("");
    setDateTo("");
    setDraftTimeFilter("all");
    setDraftStatusFilter("all");
    setDraftPaymentView("all");
    setDraftDateFrom("");
    setDraftDateTo("");
  };

const selectTab = (tab: "active" | "history") => {
  const defaultStatus: StatusFilter = "all";
  setActiveTab(tab);
  setTimeFilter(tab === "history" ? deviceSettings.endedStayDefaultRange : deviceSettings.activeBookingDefaultRange);
  setStatusFilter(defaultStatus);
  setPaymentView("all");
  setDraftTimeFilter(tab === "history" ? deviceSettings.endedStayDefaultRange : deviceSettings.activeBookingDefaultRange);
  setDraftStatusFilter(defaultStatus);
  setDraftPaymentView("all");
  setDateFrom("");
  setDateTo("");
  setDraftDateFrom("");
  setDraftDateTo("");
};

const openFilterSheet = () => {
  setDraftTimeFilter(timeFilter);
  setDraftStatusFilter(statusFilter);
  setDraftPaymentView(paymentView);
  setDraftDateFrom(dateFrom);
  setDraftDateTo(dateTo);
  setFilterSheetVisible(true);
};
const applyFilters = () => {
  if (draftDateFrom && draftDateTo && draftDateFrom > draftDateTo) {
    Alert.alert(language === "ar" ? "الفترة غير صحيحة" : "Invalid date range", language === "ar" ? "يجب أن يكون تاريخ البداية قبل أو مساويًا لتاريخ النهاية." : "The start date must be before or equal to the end date.");
    return;
  }
  setTimeFilter(draftTimeFilter);
  setStatusFilter(draftStatusFilter);
  setPaymentView(draftPaymentView);
  setDateFrom(draftDateFrom);
  setDateTo(draftDateTo);
  setFilterSheetVisible(false);
};
const resetFilters = () => {
  const defaultStatus: StatusFilter = "all";
  setDraftTimeFilter("all");
  setDraftStatusFilter(defaultStatus);
  setDraftPaymentView("all");
  setDraftDateFrom("");
  setDraftDateTo("");
};
const clearAppliedFilters = () => {
  const defaultStatus: StatusFilter = "all";
  setTimeFilter("all");
  setStatusFilter(defaultStatus);
  setPaymentView("all");
  setDateFrom("");
  setDateTo("");
  setDraftTimeFilter("all");
  setDraftStatusFilter(defaultStatus);
  setDraftPaymentView("all");
  setDraftDateFrom("");
  setDraftDateTo("");
};
  const quickBookSlot = (slot: { chaletId: string; date: string; period: "morning" | "evening" }) => router.push({ pathname: "/booking-form", params: { date: slot.date, bookingType: slot.period, chaletId: slot.chaletId } } as never);
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
  const operationalFailureMessage = (error: unknown, action: "check-in" | "check-out" | "no-show") => {
    const code = error instanceof Error ? error.message : "";
    if (code.endsWith("-forbidden")) return language === "ar" ? "لا تملك صلاحية تعديل الحجوزات. اطلب من المدير تفعيلها لحسابك." : "You do not have permission to edit bookings. Ask an administrator to enable it.";
    if (code === `booking-not-ready-for-${action}`) return language === "ar" ? (action === "check-in" ? "لا يمكن تسجيل الوصول قبل بداية وقت الإقامة أو بعد انتهائها." : "لا يمكن إنهاء الإقامة قبل وقت الوصول وبعد بداية الإقامة.") : "This operational action is not available at the current stay time.";
    if (code === "booking-not-found") return language === "ar" ? "هذا الحجز لم يعد متاحًا. حدّث القائمة ثم حاول مرة أخرى." : "This booking is no longer available. Refresh the list and try again.";
    if (code === "booking-not-ready-for-no-show") return language === "ar" ? "لا يمكن أرشفة عدم الحضور قبل انتهاء وقت الحجز." : "A booking can be marked no-show only after its scheduled end.";
    return language === "ar" ? "تعذر حفظ الإجراء الآن. حاول مرة أخرى." : "The action could not be saved. Please try again.";
  };
  const saveOperationalAction = (booking: Booking, action: "check-in" | "check-out" | "no-show", confirmation?: NonNullable<Booking["checkInConfirmation"]> | import("@/lib/booking-model").CheckoutConfirmation) => {
    const isCheckIn = action === "check-in";
    setOperationalSavingId(booking.id);
    const request = isCheckIn ? markBookingCheckedIn(booking.id, confirmation as NonNullable<Booking["checkInConfirmation"]>) : action === "check-out" ? completeBookingStay(booking.id, confirmation as import("@/lib/booking-model").CheckoutConfirmation) : archiveBookingAsNoShow(booking.id);
    void request.then(() => setOperationalFeedback({
      isError: false,
      message: isCheckIn
        ? (language === "ar" ? "تم تسجيل وصول الضيف بنجاح." : "Guest arrival was recorded.")
        : action === "check-out" ? (language === "ar" ? "تم إنهاء الإقامة ونقل الحجز إلى السجل." : "The stay was completed and moved to history.") : (language === "ar" ? "تمت أرشفة الحجز كعدم حضور." : "The booking was archived as a no-show."),
    })).catch((error: unknown) => setOperationalFeedback({ message: operationalFailureMessage(error, action), isError: true })).finally(() => { setOperationalSavingId(null); if (isCheckIn) setCheckInBooking(null); if (action === "check-out") setCheckOutBooking(null); });
  };
  const runOperationalAction = (booking: Booking, action: "check-in" | "check-out" | "no-show") => {
    const isCheckIn = action === "check-in";
    if (isCheckIn) { setCheckInBooking(booking); return; }
    const isCheckOut = action === "check-out";
    if (isCheckOut) { setCheckOutBooking(booking); return; }
    const title = isCheckIn
      ? (language === "ar" ? "تأكيد تسجيل الوصول" : "Confirm guest arrival")
      : isCheckOut
        ? (language === "ar" ? "تأكيد تسجيل المغادرة" : "Confirm guest checkout")
        : (language === "ar" ? "تأكيد أرشفة عدم الحضور" : "Confirm no-show archive");
    const message = isCheckIn
      ? (language === "ar" ? `هل وصل ${booking.customerName} بالفعل؟ بعد التأكيد ستتحول الحالة إلى «مقيم حاليًا».` : `Has ${booking.customerName} arrived? The booking will change to In-house after confirmation.`)
      : isCheckOut
        ? (language === "ar" ? `هل تأكدت من مغادرة ${booking.customerName}؟ سينتقل الحجز إلى منتهي الإقامة.` : `Confirm ${booking.customerName} has checked out? The booking will move to ended stays.`)
        : (language === "ar" ? `لم يحضر ${booking.customerName} حتى انتهاء الموعد. هل تريد أرشفة الحجز كعدم حضور؟` : `${booking.customerName} did not arrive before checkout. Archive this booking as a no-show?`);
    Alert.alert(title, message, [
      { text: language === "ar" ? "إلغاء" : "Cancel", style: "cancel" },
      {
        text: isCheckOut ? (language === "ar" ? "تسجيل المغادرة" : "Record checkout") : (language === "ar" ? "أرشفة الحجز" : "Archive booking"),
        style: action === "no-show" ? "destructive" : "default",
        onPress: () => saveOperationalAction(booking, action),
      },
    ]);
  };
  const operationalActionFor = (booking: Booking) => {
    const operationalState = getBookingOperationalState(booking, clock).state;
    if ((operationalState === "awaiting-arrival" || operationalState === "late-arrival") && deviceSettings.showGuestCheckIn) return { label: operationalSavingId === booking.id ? (language === "ar" ? "جارٍ تسجيل الوصول" : "Recording arrival") : (language === "ar" ? "تسجيل وصول الضيف" : "Record guest arrival"), icon: "login" as const, color: colors.success, onPress: () => runOperationalAction(booking, "check-in"), disabled: operationalSavingId === booking.id || operationalState === "awaiting-arrival" };
    if (operationalState === "in-house" || operationalState === "checkout-warning") return { label: operationalSavingId === booking.id ? (language === "ar" ? "جارٍ تسجيل المغادرة" : "Recording checkout") : (language === "ar" ? "تسجيل مغادرة الضيف" : "Record guest checkout"), icon: "logout" as const, color: colors.primary, onPress: () => runOperationalAction(booking, "check-out"), disabled: operationalSavingId === booking.id };
    if (operationalState === "no-show" && deviceSettings.showGuestCheckIn) return { label: operationalSavingId === booking.id ? (language === "ar" ? "جارٍ الأرشفة" : "Archiving") : (language === "ar" ? "لم يحضر · أرشفة الحجز" : "No-show · Archive"), icon: "person-off" as const, color: colors.error, onPress: () => runOperationalAction(booking, "no-show"), disabled: operationalSavingId === booking.id };
    return undefined;
  };
  const openWaitlistPromotion = (entry: WaitlistEntry, booking: Booking) => {
    router.push({ pathname: "/booking-form", params: { waitlistId: entry.id, sourceBookingId: booking.id, mode: "promote" } } as never);
  };
  const confirmBookingAgainstWaitlist = (booking: Booking, entry: WaitlistEntry) => {
    Alert.alert(language === "ar" ? "تأكيد الحجز الحالي" : "Confirm current booking", language === "ar" ? `سيبقى حجز ${booking.customerName} مؤكدًا رغم عدم تسجيل أي دفعة، وسيُحفظ قرارك أمام طلب انتظار ${entry.customerName}.` : `${booking.customerName}'s booking will remain confirmed with no payment, and your decision will be saved against ${entry.customerName}'s waitlist request.`, [{ text: language === "ar" ? "رجوع" : "Back", style: "cancel" }, { text: language === "ar" ? "تأكيد الحجز" : "Confirm booking", onPress: () => void acknowledgeWaitlistPriority(booking.id, entry.id).then(() => Alert.alert(language === "ar" ? "تم التأكيد" : "Confirmed", language === "ar" ? "تم حفظ قرار تأكيد الحجز الحالي." : "The decision to keep this booking was saved.")).catch(() => Alert.alert(language === "ar" ? "تعذر التأكيد" : "Could not confirm", language === "ar" ? "لم يعد طلب الانتظار متاحًا أو لم يعد متعارضًا مع الحجز." : "The waitlist request is no longer available or conflicts no longer exist.")) }]);
  };
  const startWaitlistReplacement = (entry: WaitlistEntry, booking: Booking) => {
    Alert.alert(language === "ar" ? "بدء استبدال الحجز" : "Start booking replacement", language === "ar" ? `ستنتقل إلى نموذج تحويل طلب ${entry.customerName}. لن يُلغى الحجز الحالي إلا بعد التأكيد النهائي.` : `You will open ${entry.customerName}'s conversion form. The current booking will not be cancelled until final confirmation.`, [{ text: language === "ar" ? "رجوع" : "Back", style: "cancel" }, { text: language === "ar" ? "متابعة" : "Continue", onPress: () => openWaitlistPromotion(entry, booking) }]);
  };

  return (
    <ScreenContainer>
      <View style={styles.screen}>
        <View style={styles.headerSection}>
          <CompactScreenHeader title={t("bookings")} logoUrl={settings.businessLogoUrl} accentColor={selectedChaletAccent} action={{ label: language === "ar" ? "حجز جديد" : "New booking", accessibilityLabel: language === "ar" ? "حجز جديد" : "New booking", onPress: () => router.push("/booking-form" as never) }} />
          <View style={[styles.scopeBlock, { flexDirection: row }]}><View style={styles.scopeChalet}><ChaletSwitcher /></View><BookingViewToggle value={deviceSettings.bookingCardViewMode} onChange={(bookingCardViewMode) => void updateDeviceSettings({ bookingCardViewMode })} accentColor={selectedChaletAccent} /></View>
          <View style={[styles.segmentedTabs, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}>
            <Pressable onPress={() => selectTab("active")} style={({ pressed }) => [styles.segment, { flexDirection: row, backgroundColor: activeTab === "active" ? selectionColor : "transparent", opacity: pressed ? 0.78 : 1 }]}><MaterialIcons name="event-available" size={16} color={activeTab === "active" ? "#FFFFFF" : colors.muted} /><Text style={{ color: activeTab === "active" ? "#FFFFFF" : colors.foreground, fontSize: 12, fontWeight: "900" }}>{language === "ar" ? "الحجوزات النشطة" : "Active"}</Text></Pressable>
            <Pressable onPress={() => selectTab("history")} style={({ pressed }) => [styles.segment, { flexDirection: row, backgroundColor: activeTab === "history" ? selectionColor : "transparent", opacity: pressed ? 0.78 : 1 }]}><MaterialIcons name="check-circle" size={16} color={activeTab === "history" ? "#FFFFFF" : colors.muted} /><Text style={{ color: activeTab === "history" ? "#FFFFFF" : colors.foreground, fontSize: 12, fontWeight: "900" }}>{language === "ar" ? "منتهي الإقامة" : "Ended stays"}</Text></Pressable>
          </View>
          <GlowGlassCard style={styles.search}><View style={[styles.searchContent, { flexDirection: row }]}> 
            <MaterialIcons name="search" size={20} color={colors.muted} />
            <TextInput value={query} onChangeText={setQuery} placeholder={language === "ar" ? "ابحث بالاسم أو الهاتف أو الشاليه أو المرجع" : "Search name, phone, chalet or reference"} placeholderTextColor={colors.muted} style={{ flex: 1, color: colors.foreground, textAlign: align, paddingVertical: 0 }} />
            {activeFilterCount ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "مسح كل الفلاتر" : "Clear all filters"} onPress={clearAppliedFilters} style={({ pressed }) => [styles.clearFilter, { flexDirection: row, backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="close" size={14} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800" }}>{language === "ar" ? "مسح" : "Clear"}</Text></Pressable> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "فتح الفلاتر" : "Open filters"} onPress={openFilterSheet} style={({ pressed }) => [styles.paymentFilter, { flexDirection: row, backgroundColor: activeFilterCount ? selectionColor : colors.surfaceMuted, opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name="filter-alt" size={16} color={activeFilterCount ? "#FFFFFF" : colors.muted} /><Text numberOfLines={1} style={{ color: activeFilterCount ? "#FFFFFF" : colors.muted, fontSize: 10, fontWeight: "800" }}>{language === "ar" ? "فلترة" : "Filter"}</Text>{activeFilterCount ? <View style={[styles.filterCount, { backgroundColor: colors.surface }]}><Text style={{ color: selectionColor, fontSize: 9, fontWeight: "900" }}>{activeFilterCount}</Text></View> : null}</Pressable>
          </View></GlowGlassCard>
        </View>

        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(item) => item.id}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<GlowGlassCard style={styles.empty} contentStyle={styles.emptyContent}><MaterialIcons name={isHistoryView ? "check-circle" : query ? "search-off" : "event-available"} size={29} color={colors.muted} /><Text style={{ color: colors.foreground, fontWeight: "800", marginTop: 10 }}>{isHistoryView ? (language === "ar" ? "لا توجد حجوزات منتهية الإقامة" : "No ended stays") : query ? (language === "ar" ? "لا توجد نتائج مطابقة للبحث" : "No matching results") : (language === "ar" ? "لا توجد حجوزات نشطة ضمن هذا العرض" : t("noBookings"))}</Text><Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 6 }}>{isHistoryView ? (activeBookings.length ? (language === "ar" ? `توجد ${activeBookings.length} حجوزات نشطة في المنشأة. لا يظهر هنا إلا ما تم تسجيل مغادرته واعتماد فحصه.` : `${activeBookings.length} active bookings are available. Only recorded checkouts appear here.`) : (language === "ar" ? "لا يُنقل الحجز إلى هذا السجل إلا بعد تسجيل المغادرة واعتماد الفحص." : "A stay moves here only after recorded checkout and inspection.")) : tabBookings.length ? (language === "ar" ? `توجد ${tabBookings.length} حجوزات نشطة، لكن الفلتر الحالي يخفيها.` : `${tabBookings.length} active bookings are hidden by the current filter.`) : (language === "ar" ? "ستُستعاد بيانات المنشأة المشتركة تلقائيًا عند توفرها، أو أضف حجزًا جديدًا للبدء." : "Shared property data is restored automatically when available, or add a booking to begin.")}</Text>{(isHistoryView && activeBookings.length > 0) || (!isHistoryView && tabBookings.length > 0) ? <Pressable onPress={showAllActiveBookings} style={({ pressed }) => [{ minHeight: 40, borderRadius: 15, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", marginTop: 13, backgroundColor: selectionColor, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "900" }}>{language === "ar" ? `عرض جميع الحجوزات النشطة (${activeBookings.length || tabBookings.length})` : `Show all active bookings (${activeBookings.length || tabBookings.length})`}</Text></Pressable> : null}</GlowGlassCard>}
          renderItem={({ item }) => {
            const availablePeriod = isHistoryView ? undefined : availableSiblingSlotForBooking(item, activeBookings);
            const themeColor = chaletColor(item.chaletId, chalets, selectedChaletAccent);
            const linkedWaitlist = isHistoryView ? [] : activeWaitlistByBookingId.get(item.id) ?? [];
            const priorityWaitlist = priorityWaitlistByBookingId.get(item.id);
            return <View><BookingCard booking={item} chalets={chalets} colors={colors} language={language} currency={settings.currency} formatDate={formatDate} formatTime={formatTime} now={clock} viewMode={deviceSettings.bookingCardViewMode} onDetailsPress={() => router.push({ pathname: "/booking-detail", params: { id: item.id } } as never)} footer={!isHistoryView ? <><BookingQuickActions language={language} colors={colors} themeColor={themeColor} operationalAction={operationalActionFor(item)} onWhatsApp={() => void sendCheckInWhatsApp(item)} onCall={() => void callGuest(item)} onDetails={() => router.push({ pathname: "/booking-detail", params: { id: item.id } } as never)} />{priorityWaitlist ? <WaitlistPriorityDecision booking={item} entry={priorityWaitlist.entry} language={language} colors={colors} themeColor={themeColor} onConfirm={() => confirmBookingAgainstWaitlist(item, priorityWaitlist.entry)} onReplace={() => startWaitlistReplacement(priorityWaitlist.entry, item)} /> : linkedWaitlist[0] ? <WaitlistBookingSummary entry={linkedWaitlist[0]} additionalCount={linkedWaitlist.length - 1} now={clock} language={language} colors={colors} themeColor={themeColor} onPromote={() => openWaitlistPromotion(linkedWaitlist[0], item)} /> : null}</> : undefined} />{availablePeriod ? <AvailableSlotCard chaletName={chaletLabel(item.chaletId, item.chaletName, chalets)} dateText={formatDate(item.startDate)} timeRange={slotTimeRange(availablePeriod)} period={availablePeriod} language={language} themeColor={themeColor} onQuickBook={() => quickBookSlot({ chaletId: item.chaletId!, date: item.startDate, period: availablePeriod })} /> : null}</View>;
          }}
        />
        <BookingFilterSheet visible={filterSheetVisible} colors={colors} language={language} isRTL={isRTL} showStatusFilter={!isHistoryView} timeFilter={draftTimeFilter} statusFilter={draftStatusFilter} paymentFilter={draftPaymentView} dateFrom={draftDateFrom} dateTo={draftDateTo} defaultRange={isHistoryView ? deviceSettings.endedStayDefaultRange : deviceSettings.activeBookingDefaultRange} defaultRangeScope={isHistoryView ? "history" : "active"} onSetDefault={() => void updateDeviceSettings(isHistoryView ? { endedStayDefaultRange: draftTimeFilter as typeof deviceSettings.endedStayDefaultRange } : { activeBookingDefaultRange: draftTimeFilter })} onTimeChange={setDraftTimeFilter} onStatusChange={setDraftStatusFilter} onPaymentChange={setDraftPaymentView} onDateFromChange={setDraftDateFrom} onDateToChange={setDraftDateTo} onReset={resetFilters} onClose={() => setFilterSheetVisible(false)} onApply={applyFilters} />
        <CheckInConfirmationSheet booking={checkInBooking} visible={Boolean(checkInBooking)} saving={operationalSavingId === checkInBooking?.id} colors={colors} currency={settings.currency} language={language} isRTL={isRTL} formatDate={formatDate} formatTime={formatTime} onClose={() => setCheckInBooking(null)} onConfirm={(confirmation) => { if (checkInBooking) saveOperationalAction(checkInBooking, "check-in", confirmation); }} />
        <CheckOutConfirmationSheet booking={checkOutBooking} visible={Boolean(checkOutBooking)} saving={operationalSavingId === checkOutBooking?.id} colors={colors} currency={settings.currency} language={language} isRTL={isRTL} onClose={() => setCheckOutBooking(null)} onConfirm={(confirmation) => { if (checkOutBooking) saveOperationalAction(checkOutBooking, "check-out", confirmation); }} />
        {operationalFeedback ? <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.operationalToast, { flexDirection: row, backgroundColor: operationalFeedback.isError ? colors.error : colors.success }]}><MaterialIcons name={operationalFeedback.isError ? "error-outline" : "check-circle"} size={20} color="#FFFFFF" /><Text style={[styles.flex, { color: "#FFFFFF", fontSize: 12, fontWeight: "800", textAlign: align }]}>{operationalFeedback.message}</Text></View> : null}
      </View>
    </ScreenContainer>
  );
}

function WaitlistBookingSummary({ entry, additionalCount, now, language, colors, themeColor, onPromote }: { entry: WaitlistEntry; additionalCount: number; now: number; language: "ar" | "en"; colors: ReturnType<typeof useColors>; themeColor: string; onPromote: () => void }) {
  const row = language === "ar" ? "row-reverse" : "row";
  const align = language === "ar" ? "right" : "left";
  const deadlineColor = waitlistRemainingMilliseconds(entry, now) <= 3_600_000 ? "#F87171" : "#F59E0B";
  return <View style={[styles.waitlistSummary, { flexDirection: row, backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="pending-actions" size={17} color={themeColor} /><View style={styles.flex}><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 11, fontWeight: "900", textAlign: align }}>{language === "ar" ? "طلب انتظار في الفترة نفسها" : "Waiting request for this slot"}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? `الاسم: ${entry.customerName} · ${entry.phone}` : `${entry.customerName} · ${entry.phone}`}</Text><Text numberOfLines={1} style={{ color: deadlineColor, fontSize: 9, fontWeight: "900", marginTop: 2, textAlign: align }}>{language === "ar" ? `المهلة: ${waitlistCountdownLabel(entry, now, language)}` : `Deadline: ${waitlistCountdownLabel(entry, now, language)}`}</Text></View>{additionalCount > 0 ? <View style={[styles.waitlistCount, { backgroundColor: themeColor + "22" }]}><Text style={{ color: themeColor, fontSize: 10, fontWeight: "900" }}>+{additionalCount}</Text></View> : null}<Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? `تحويل طلب انتظار ${entry.customerName} إلى حجز` : `Convert ${entry.customerName}'s waiting request`} onPress={onPromote} style={({ pressed }) => [styles.promoteWaitlist, { backgroundColor: colors.primary, opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name="event-available" size={14} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "تحويل" : "Convert"}</Text></Pressable></View>;
}

function WaitlistPriorityDecision({ booking, entry, language, colors, themeColor, onConfirm, onReplace }: { booking: Booking; entry: WaitlistEntry; language: "ar" | "en"; colors: ReturnType<typeof useColors>; themeColor: string; onConfirm: () => void; onReplace: () => void }) {
  const isRTL = language === "ar";
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  return <View style={[styles.waitlistPriority, { backgroundColor: colors.surfaceMuted }]}><View style={[styles.waitlistPriorityHeader, { flexDirection: row }]}><View style={styles.waitlistPriorityIcon}><MaterialIcons name="priority-high" size={19} color="#F59E0B" /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تنبيه قبل الموعد: حجز بلا دفعة أمام طلب انتظار" : "Upcoming unpaid booking has a waitlist request"}</Text><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 3, textAlign: align }}>{language === "ar" ? `الحجز الحالي باسم ${booking.customerName} لم يسجل أي دفعة. العميل ${entry.customerName} ينتظر الفترة نفسها.` : `${booking.customerName} has no recorded payment. ${entry.customerName} is waiting for the same slot.`}</Text></View></View><View style={[styles.waitlistPriorityActions, { flexDirection: row }]}><Pressable onPress={onConfirm} style={({ pressed }) => [styles.waitlistPriorityAction, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="verified" size={15} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "تأكيد الحجز" : "Keep booking"}</Text></Pressable><Pressable onPress={onReplace} style={({ pressed }) => [styles.waitlistPriorityAction, { backgroundColor: "#F59E0B18", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="swap-horiz" size={16} color="#F59E0B" /><Text style={{ color: "#F59E0B", fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "بدء الاستبدال" : "Start replacement"}</Text></Pressable></View></View>;
}

function BookingFilterSheet({ visible, colors, language, isRTL, showStatusFilter, timeFilter, statusFilter, paymentFilter, dateFrom, dateTo, defaultRange, defaultRangeScope, onSetDefault, onTimeChange, onStatusChange, onPaymentChange, onDateFromChange, onDateToChange, onReset, onClose, onApply }: { visible: boolean; colors: ReturnType<typeof useColors>; language: "ar" | "en"; isRTL: boolean; showStatusFilter: boolean; timeFilter: TimeFilter; statusFilter: StatusFilter; paymentFilter: PaymentFilter; dateFrom: string; dateTo: string; defaultRange: TimeFilter; defaultRangeScope: "active" | "history"; onSetDefault: () => void; onTimeChange: (value: TimeFilter) => void; onStatusChange: (value: StatusFilter) => void; onPaymentChange: (value: PaymentFilter) => void; onDateFromChange: (value: string) => void; onDateToChange: (value: string) => void; onReset: () => void; onClose: () => void; onApply: () => void }) {
  const row = isRTL ? "row-reverse" : "row";
  const timeOptions: { value: TimeFilter; ar: string; en: string; emoji: string }[] = [{ value: "all", ar: "الكل", en: "All", emoji: "🌐" }, { value: "today", ar: "يومي", en: "Daily", emoji: "⚡" }, { value: "two-days", ar: "يومان", en: "Two days", emoji: "🗓️" }, { value: "tomorrow", ar: "غدًا", en: "Tomorrow", emoji: "📅" }, { value: "week", ar: "أسبوعي", en: "Weekly", emoji: "⏳" }, { value: "month", ar: "شهري", en: "Monthly", emoji: "📆" }, { value: "upcoming", ar: "القادمة", en: "Upcoming", emoji: "🔜" }];
  const statusOptions: { value: StatusFilter; ar: string; en: string; emoji: string }[] = [{ value: "all", ar: "الكل", en: "All", emoji: "🌐" }, { value: "confirmed", ar: "المؤكدة", en: "Confirmed", emoji: "🟢" }, { value: "cancelled", ar: "الملغاة", en: "Cancelled", emoji: "🚫" }, { value: "completed", ar: "المكتملة", en: "Completed", emoji: "🏁" }];
  const paymentOptions: { value: PaymentFilter; ar: string; en: string; emoji: string }[] = [{ value: "all", ar: "الكل", en: "All", emoji: "🌐" }, { value: "due", ar: "عليها متبقي", en: "Balance due", emoji: "💰" }, { value: "paid", ar: "مدفوعة بالكامل", en: "Fully paid", emoji: "✅" }];
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent><View style={styles.sheetBackdrop}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق الفلاتر" : "Close filters"} style={StyleSheet.absoluteFill} onPress={onClose} /><GlowGlassCard radius={28} intensity={22} style={styles.filterSheet} contentStyle={styles.filterSheetContent}>
    <View style={[styles.sheetHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900", textAlign: isRTL ? "right" : "left" }}>{language === "ar" ? "فلترة الحجوزات" : "Filter bookings"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: isRTL ? "right" : "left" }}>{language === "ar" ? "اختر المعايير ثم طبّق الفلتر" : "Choose criteria, then apply"}</Text></View><Pressable onPress={onClose} style={[styles.sheetClose, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={18} color={colors.muted} /></Pressable></View>
    <FilterSection title={language === "ar" ? "الوقت" : "Time"} row={row} colors={colors} options={timeOptions} selected={timeFilter} onChange={onTimeChange} language={language} />
    <DateRangeFilter colors={colors} language={language} isRTL={isRTL} fromDate={dateFrom} toDate={dateTo} onFromChange={onDateFromChange} onToChange={onDateToChange} />
    <Pressable onPress={onSetDefault} style={({ pressed }) => [styles.defaultRangeButton, { backgroundColor: colors.surfaceMuted, flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="bookmark-added" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? `تعيين فترة ${defaultRangeScope === "active" ? "الحجوزات النشطة" : "منتهي الإقامة"} كافتراضي · الحالي: ${timeRangeLabel(defaultRange, language)}` : `Set ${defaultRangeScope === "active" ? "active bookings" : "ended stays"} period as default`}</Text></Pressable>
    {showStatusFilter ? <FilterSection title={language === "ar" ? "حالة الحجز" : "Booking status"} row={row} colors={colors} options={statusOptions} selected={statusFilter} onChange={onStatusChange} language={language} /> : null}
    <FilterSection title={language === "ar" ? "الحالة المالية" : "Financial status"} row={row} colors={colors} options={paymentOptions} selected={paymentFilter} onChange={onPaymentChange} language={language} />
    <View style={[styles.sheetActions, { flexDirection: row }]}><TouchableOpacity activeOpacity={0.7} onPress={onReset} style={[styles.resetFilter, { backgroundColor: colors.surfaceMuted }]}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{language === "ar" ? "إعادة ضبط" : "Reset"}</Text></TouchableOpacity><TouchableOpacity activeOpacity={0.7} onPress={onApply} style={[styles.applyFilter, { backgroundColor: colors.primary }]}><MaterialIcons name="check" size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{language === "ar" ? "تطبيق الفلتر" : "Apply filters"}</Text></TouchableOpacity></View>
  </GlowGlassCard></View></Modal>;
}

function DateRangeFilter({ colors, language, isRTL, fromDate, toDate, onFromChange, onToChange }: { colors: ReturnType<typeof useColors>; language: "ar" | "en"; isRTL: boolean; fromDate: string; toDate: string; onFromChange: (value: string) => void; onToChange: (value: string) => void }) {
  const cleanDate = (value: string) => value.replace(/[^\d-]/g, "").slice(0, 10);
  const align = isRTL ? "right" : "left";
  return <View style={styles.dateRangeSection}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "فترة مخصصة" : "Custom period"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 3, textAlign: align }}>{language === "ar" ? "اختر تاريخ البداية والنهاية من التقويم" : "Select start and end dates from the calendar"}</Text><View style={[styles.dateRangeFields, { flexDirection: isRTL ? "row-reverse" : "row" }]}><DateRangeField label={language === "ar" ? "من تاريخ" : "From"} value={fromDate} onChange={(value) => onFromChange(cleanDate(value))} /><DateRangeField label={language === "ar" ? "إلى تاريخ" : "To"} value={toDate} onChange={(value) => onToChange(cleanDate(value))} /></View></View>;
}

function DateRangeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <CalendarDateField label={label} value={value} onChange={onChange} placeholder={label} />;
}

function FilterSection<T extends string>({ title, row, colors, options, selected, onChange, language }: { title: string; row: "row" | "row-reverse"; colors: ReturnType<typeof useColors>; options: { value: T; ar: string; en: string; emoji: string }[]; selected: T; onChange: (value: T) => void; language: "ar" | "en" }) {
  return <View style={styles.filterSection}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: row === "row-reverse" ? "right" : "left" }}>{title}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={[styles.filterOptions, { flexDirection: row, alignItems: "center", justifyContent: "flex-start" }]}>{options.map((option) => <Pressable key={option.value} onPress={() => onChange(option.value)} style={({ pressed }) => [styles.sheetFilterChoice, { backgroundColor: selected === option.value ? colors.primary : colors.surfaceMuted, opacity: pressed ? 0.72 : 1 }]}><Text numberOfLines={1} style={{ color: selected === option.value ? "#FFFFFF" : colors.foreground, fontSize: 11, fontWeight: "800" }}>{option.emoji} {language === "ar" ? option.ar : option.en}</Text></Pressable>)}</ScrollView><View style={[styles.scrollHint, { flexDirection: row }]}><MaterialIcons name="swipe" size={13} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 10 }}>{language === "ar" ? "اسحب لعرض المزيد" : "Swipe for more"}</Text></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  headerSection: { paddingHorizontal: 16, paddingTop: 5 },
  historyBack: { alignSelf: "flex-start", minHeight: 36, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 10, marginTop: 4, marginBottom: 6 },
  flex: { flex: 1, minWidth: 0 },
  scopeBlock: { marginTop: 11, alignItems: "center", gap: 8 },
  scopeChalet: { flex: 1, minWidth: 0 },
  segmentedTabs: { minHeight: 50, borderRadius: 20, padding: 4, gap: 4, marginTop: 12 },
  segment: { flex: 1, minHeight: 42, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 8 },
  search: { minHeight: 50, borderRadius: 20, marginTop: 12, marginBottom: 10 },
  searchContent: { minHeight: 50, borderRadius: 20, alignItems: "center", gap: 9, paddingHorizontal: 13 },
  paymentFilter: { minHeight: 34, minWidth: 74, borderRadius: 13, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3, flexShrink: 0, position: "relative" },
  clearFilter: { minHeight: 30, borderRadius: 12, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3, flexShrink: 0 },
  filterCount: { position: "absolute", width: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center", top: -7, right: -7 },
  list: { flex: 1, minHeight: 0 },
  content: { padding: 16, paddingBottom: 196 },
  waitlistPriority: { borderRadius: 18, padding: 10, marginTop: 8 },
  waitlistPriorityHeader: { alignItems: "center", gap: 8 },
  waitlistPriorityIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: "#F59E0B20" },
  waitlistPriorityActions: { gap: 7, marginTop: 9 },
  waitlistPriorityAction: { flex: 1, minWidth: 0, minHeight: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, paddingHorizontal: 6 },
  empty: { borderRadius: 22, marginTop: 18 },
  emptyContent: { alignItems: "center", padding: 24 },
  operationalToast: { position: "absolute", top: 14, left: 16, right: 16, zIndex: 30, minHeight: 50, borderRadius: 14, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, elevation: 8, shadowColor: "#071412", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 9 },
  cardContent: { minHeight: 64 },
  cardHeader: { alignItems: "center", gap: 8 },
  guestInfo: { flex: 1, minWidth: 0 },
  guestMeta: { alignItems: "center", gap: 3, marginTop: 3 },
  guestMetaDivider: { color: "#64748B", fontSize: 13, marginHorizontal: 3 },
  chaletBadge: { minWidth: 72, maxWidth: 116, minHeight: 33, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignItems: "center", justifyContent: "center", flexShrink: 1 },
  chaletBadgeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", textAlign: "center" },
  bookingControl: { minHeight: 28, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  headerDetails: { flexShrink: 1 },
  scheduleContainer: { width: "100%", borderWidth: 1, borderRadius: 8, padding: 8, backgroundColor: "rgba(255,255,255,0.03)", marginTop: 8, alignItems: "center", justifyContent: "space-between", gap: 8 },
  scheduleInfo: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  statusRow: { alignItems: "center", justifyContent: "space-between", gap: 7, marginTop: 8, minHeight: 28 },
  liveStatus: { flex: 1, minWidth: 0 },
  typeBadge: { minWidth: 64, flexShrink: 0 },
  periodDot: { width: 6, height: 6, borderRadius: 3 },
  financialRow: { alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 8, flexWrap: "nowrap" },
  compactFinancialPill: { flex: 1, flexBasis: 0, minWidth: 0, paddingHorizontal: 6 },
  waitlistSummary: { minHeight: 58, borderRadius: 16, alignItems: "center", gap: 7, paddingHorizontal: 9, marginTop: 8 },
  waitlistCount: { minWidth: 25, minHeight: 25, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, flexShrink: 0 },
  promoteWaitlist: { width: "32%", minHeight: 29, borderRadius: 12, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3, flexShrink: 0 },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(4, 18, 15, 0.58)", justifyContent: "flex-end" },
  filterSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  filterSheetContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 26 },
  sheetHeader: { alignItems: "center", gap: 12, paddingBottom: 16 },
  sheetClose: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  filterSection: { marginTop: 16 },
  dateRangeSection: { marginTop: 16 },
  dateRangeFields: { gap: 8, marginTop: 9 },
  defaultRangeButton: { minHeight: 42, borderRadius: 15, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14 },
  dateField: { flex: 1, minWidth: 0, minHeight: 64, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, justifyContent: "center" },
  dateInput: { marginTop: 2, paddingVertical: 0, fontSize: 13, fontWeight: "800", textAlign: "center", writingDirection: "ltr" },
  filterScroll: { marginTop: 9 },
  filterOptions: { gap: 8, paddingVertical: 4, paddingHorizontal: 1 },
  sheetFilterChoice: { minHeight: 35, borderRadius: 13, paddingHorizontal: 11, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  scrollHint: { alignItems: "center", justifyContent: "flex-start", gap: 3, marginTop: 4, opacity: 0.76 },
  sheetActions: { gap: 9, marginTop: 24 },
  resetFilter: { flex: 0.72, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  applyFilter: { flex: 1.28, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
});
