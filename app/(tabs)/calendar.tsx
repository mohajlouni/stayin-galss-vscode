import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ChaletSwitcher } from "@/components/chalet-switcher";
import { BookingCard } from "@/components/booking-card";
import { CompactScreenHeader } from "@/components/compact-screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { useColors } from "@/hooks/use-colors";
import {
  Booking,
  WaitlistEntry,
  ChaletShift,
  bookingShiftLabel,
  bookingTypeForShift,
  bookingCoversDate,
  dayNumber,
  dateObjectUTC,
  parseISODate,
  propertyTypeIcon,
  getActiveChaletShifts,
  PERIOD_COLORS,
  RESERVED_PERIOD_COLORS,
  RESERVED_PERIOD_META,
  reservedPeriodColorForBookingType,
  reservedPeriodColorKeyForShift,
  todayISO,
  typeColors,
} from "@/lib/booking-model";
import { findBookingConflicts } from "@/services/availabilityService";
import { useBookings } from "@/lib/booking-store";
import { indexCalendarBookingsByDate } from "@/lib/calendar-booking-index";
import { useChaletScope } from "@/lib/chalet-scope";
import { gregorianMonthGrid, moveGregorianMonth } from "@/lib/gregorian-calendar";
import { useI18n } from "@/lib/i18n";
import { useAppPreferences } from "@/lib/app-preferences";
import { openBookingWhatsApp } from "@/lib/whatsapp-helper";

const WEEK_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WEEK_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EMPTY_DAY_BOOKINGS: Booking[] = [];
const EMPTY_DAY_WAITLIST: WaitlistEntry[] = [];
type CalendarDaySummary = { bookings: Booking[]; arrivals: number; departures: number; waiting: boolean };
const EMPTY_DAY_SUMMARY: CalendarDaySummary = { bookings: EMPTY_DAY_BOOKINGS, arrivals: 0, departures: 0, waiting: false };
export default function CalendarScreen() {
  const { bookings, waitlist, chalets, settings, hydrated } = useBookings();
  const { selectedChaletId } = useChaletScope();
  const { t, isRTL, language } = useI18n();
  const { formatDate, formatMonth, formatHijriMonth, formatTime, showHijriDate } = useAppPreferences();
  const colors = useColors();
  const today = todayISO();
  const start = parseISODate(today);
  const [year, setYear] = useState(start.y);
  const [month, setMonth] = useState(start.m);
  const [selected, setSelected] = useState<string | null>(null);
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const week = language === "ar" ? WEEK_AR : WEEK_EN;
  const days = useMemo(() => gregorianMonthGrid(year, month), [month, year]);
  const isAllUnitsView = !selectedChaletId;
  const selectedChalet = useMemo(() => chalets.find((chalet) => chalet.id === selectedChaletId), [chalets, selectedChaletId]);
  const selectedChaletAccent = selectedChalet?.color ?? colors.primary;
  const selectedChaletShifts = useMemo(() => selectedChalet ? getActiveChaletShifts(selectedChalet, settings) : [], [selectedChalet, settings]);
  const selectedShiftColors = useMemo(() => Object.fromEntries(selectedChaletShifts.map((shift) => [shift.id, { color: shift.color, label: shift.name }])), [selectedChaletShifts]);
  const selectedPeriodLegend = useMemo<Array<keyof typeof RESERVED_PERIOD_COLORS>>(() => {
    const keys = ["morning", "evening", "overnight", "full_day", "event", "custom"] as const;
    const hasOther = selectedChaletShifts.some((shift) => reservedPeriodColorKeyForShift(shift) === "other");
    return hasOther ? [...keys, "other"] : [...keys];
  }, [selectedChaletShifts]);
  const chaletMarkers = useMemo(() => Object.fromEntries(chalets.map((chalet) => [chalet.id, { color: chalet.color, icon: propertyTypeIcon(chalet.propertyType) }])), [chalets]);

  const moveMonth = (delta: number) => {
    const next = moveGregorianMonth(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
  };
  const visibleBookings = useMemo(() => bookings.filter((booking) => booking.status !== "cancelled" && booking.status !== "waitlisted" && (!selectedChaletId || booking.chaletId === selectedChaletId)), [bookings, selectedChaletId]);
  const calendarBookingIndex = useMemo(() => indexCalendarBookingsByDate(visibleBookings), [visibleBookings]);
  const dayBookings = (date: string) => calendarBookingIndex.get(date) ?? EMPTY_DAY_BOOKINGS;
  const calendarWaitlistIndex = useMemo(() => {
    const index = new Map<string, WaitlistEntry[]>();
    for (const entry of waitlist) {
      if (entry.status === "cancelled" || (selectedChaletId && entry.chaletId !== selectedChaletId)) continue;
      const entries = index.get(entry.requestedDate) ?? [];
      entries.push(entry);
      index.set(entry.requestedDate, entries);
    }
    return index;
  }, [selectedChaletId, waitlist]);
  const dayWaitlist = (date: string) => calendarWaitlistIndex.get(date) ?? EMPTY_DAY_WAITLIST;
  const calendarDaySummaries = useMemo(() => {
    const summaries = new Map<string, CalendarDaySummary>();
    const ensureSummary = (date: string) => {
      const existing = summaries.get(date);
      if (existing) return existing;
      const summary = { bookings: calendarBookingIndex.get(date) ?? EMPTY_DAY_BOOKINGS, arrivals: 0, departures: 0, waiting: false };
      summaries.set(date, summary);
      return summary;
    };
    for (const [date, dateBookings] of calendarBookingIndex) summaries.set(date, { bookings: dateBookings, arrivals: 0, departures: 0, waiting: false });
    for (const booking of visibleBookings) {
      ensureSummary(booking.startDate.slice(0, 10)).arrivals += 1;
      ensureSummary(booking.endDate.slice(0, 10)).departures += 1;
    }
    for (const [date, entries] of calendarWaitlistIndex) {
      if (entries.length) ensureSummary(date).waiting = true;
    }
    return summaries;
  }, [calendarBookingIndex, calendarWaitlistIndex, visibleBookings]);
  const daySummary = (date: string) => calendarDaySummaries.get(date) ?? EMPTY_DAY_SUMMARY;
  const selectedBookings = selected ? dayBookings(selected) : [];
  const selectedWaitlist = selected ? dayWaitlist(selected) : [];
  const selectDay = (date: string) => setSelected(date);

  if (!hydrated) return <CalendarLoading colors={colors} language={language} />;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView style={[styles.scroll, { backgroundColor: "transparent" }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <CompactScreenHeader title={language === "ar" ? "التقويم" : "Calendar"} logoUrl={settings.businessLogoUrl} icon="calendar-month" accentColor={selectedChaletAccent} />
        <View style={styles.scopeWrap}><ChaletSwitcher /></View>

        <GlowGlassCard style={styles.calendarCard} contentStyle={styles.calendarCardContent}>
          <View style={[styles.monthHeader, { flexDirection: row }]}>
            <MonthButton icon={isRTL ? "chevron-right" : "chevron-left"} label={t("previous")} onPress={() => moveMonth(-1)} colors={colors} />
            <View style={styles.monthTitleWrap}><Text style={[styles.monthTitle, { color: colors.foreground }]}>{formatMonth(year, month)}</Text>{showHijriDate ? <Text style={[styles.hijriMonth, { color: colors.muted }]}>{formatHijriMonth(year, month)}</Text> : null}</View>
            <MonthButton icon={isRTL ? "chevron-left" : "chevron-right"} label={t("next")} onPress={() => moveMonth(1)} colors={colors} />
          </View>
          <View style={[styles.weekRow, { flexDirection: row }]}>
            {week.map((day) => <Text key={day} style={[styles.weekday, { color: colors.muted }]}>{day.slice(0, 3)}</Text>)}
          </View>
          <View style={[styles.daysGridContainer, { flexDirection: row }]}>
            {days.map((date, index) => {
              if (!date) return <View key={`blank-${index}`} style={styles.blankDay} />;
              const summary = daySummary(date);
              return <CalendarDay key={date} date={date} bookings={summary.bookings} arrivals={summary.arrivals} departures={summary.departures} waiting={summary.waiting} selected={selected === date} today={date === today} colors={colors} accentColor={selectedChaletAccent} onPress={() => selectDay(date)} chaletMarkers={chaletMarkers} markerMode={isAllUnitsView ? "unit" : "period"} shiftColors={selectedShiftColors} />;
            })}
          </View>
        </GlowGlassCard>

        <View style={[styles.legend, { flexDirection: row }]}>
          {isAllUnitsView ? <>
            {chalets.slice(0, 5).map((chalet) => <Legend key={chalet.id} color={chalet.color} icon={propertyTypeIcon(chalet.propertyType)} text={chalet.name} colors={colors} isRTL={isRTL} />)}
            <Legend color={PERIOD_COLORS.waitlist} icon="schedule" text={t("waiting")} colors={colors} isRTL={isRTL} />
          </> : <>
            {selectedPeriodLegend.map((key) => <Legend key={key} color={RESERVED_PERIOD_COLORS[key]} text={RESERVED_PERIOD_META[key][language]} colors={colors} isRTL={isRTL} />)}
            <Legend color={PERIOD_COLORS.waitlist} text={t("waiting")} colors={colors} isRTL={isRTL} />
          </>}
        </View>

        <View style={[styles.allDaysNotice, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}>
          <MaterialIcons name="touch-app" size={20} color={colors.primary} />
          <Text style={[styles.flex, { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: align }]}>{language === "ar" ? "اضغط على أي يوم لفتح ملخص حجوزاته وتفاصيله" : "Tap any day to open its booking summary and details."}</Text>
        </View>
        <DayDetailsModal visible={Boolean(selected)} date={selected} bookings={selectedBookings} waiting={selectedWaitlist} chalets={chalets} selectedChaletId={selectedChaletId} settings={settings} formatDate={formatDate} formatTime={formatTime} colors={colors} language={language} isRTL={isRTL} onClose={() => setSelected(null)} />
      </ScrollView>
    </ScreenContainer>
  );
}

function DayDetailsModal({ visible, date, bookings, waiting, chalets, selectedChaletId, settings, formatDate, formatTime, colors, language, isRTL, onClose }: { visible: boolean; date: string | null; bookings: Booking[]; waiting: import("@/lib/booking-model").WaitlistEntry[]; chalets: import("@/lib/booking-model").Chalet[]; selectedChaletId: string | null; settings: import("@/lib/booking-model").Settings; formatDate: (date: string) => string; formatTime: (time: string) => string; colors: ReturnType<typeof useColors>; language: "ar" | "en"; isRTL: boolean; onClose: () => void }) {
  if (!date) return null;
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const compactDate = date.split("-").reverse().join("/");
  const selectedChalet = chalets.find((chalet) => chalet.id === selectedChaletId);
  const shifts = selectedChalet ? getActiveChaletShifts(selectedChalet, settings) : [];
  const slotBookingsByShift = new Map(shifts.map((shift) => [shift.id, selectedChalet ? bookings.filter((booking) => findBookingConflicts({ chaletId: selectedChalet.id, startDate: date, endDate: date, bookingType: bookingTypeForShift(shift.id), shiftId: shift.id, startTime: shift.startTime, endTime: shift.endTime }, [booking]).length > 0) : EMPTY_DAY_BOOKINGS]));
  const slotBookings = (shift: ChaletShift) => slotBookingsByShift.get(shift.id) ?? EMPTY_DAY_BOOKINGS;
  const openSlot = (shift: ChaletShift) => { if (!selectedChalet) return; onClose(); router.push({ pathname: "/booking-form", params: { date, chaletId: selectedChalet.id, bookingType: bookingTypeForShift(shift.id), shiftId: shift.id } } as never); };
  const availableShifts = shifts.filter((shift) => slotBookings(shift).length === 0);
  const openDetails = (bookingId: string) => { onClose(); requestAnimationFrame(() => router.push({ pathname: "/booking-detail", params: { id: bookingId } } as never)); };
  const dayFooter = <>{selectedChalet ? availableShifts.length ? <><Text style={{ color: colors.muted, fontSize: 12, marginTop: bookings.length ? 8 : 0, marginBottom: 8, textAlign: align }}>{language === "ar" ? "الفترات المتاحة" : "Available shifts"}</Text>{availableShifts.map((shift) => <AvailableSlot key={shift.id} shift={shift} shiftColor={shift.color} formatTime={formatTime} colors={colors} language={language} row={row} onBook={() => openSlot(shift)} />)}</> : <View style={[styles.allBookedBadge, { flexDirection: row, backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="event-busy" size={17} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{language === "ar" ? "لا توجد فترة متاحة" : "No available shift"}</Text></View> : <View style={[styles.allBookedBadge, { flexDirection: row, backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="info-outline" size={17} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{language === "ar" ? "اختر شاليهًا لعرض فتراته المتاحة" : "Select a chalet to view available shifts"}</Text></View>}{waiting.length ? <View style={[styles.waitlistSection, { backgroundColor: colors.surfaceMuted }]}><Text style={{ color: PERIOD_COLORS.waitlist, fontSize: 12, fontWeight: "800", textAlign: align }}>{language === "ar" ? "طلبات الانتظار" : "Waitlist requests"}</Text>{waiting.map((entry) => <WaitlistQuickRow key={entry.id} entry={entry} settings={settings} colors={colors} language={language} row={row} />)}</View> : null}</>;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><GlowGlassCard radius={28} intensity={22} style={styles.dayModal} contentStyle={styles.dayModalContent}><View style={[styles.modalHeader, { flexDirection: row }]}><Text style={[styles.modalDate, { color: colors.foreground }]}>{compactDate}</Text><Pressable accessibilityLabel={language === "ar" ? "إغلاق تفاصيل اليوم" : "Close day details"} onPress={onClose} style={({ pressed }) => [styles.modalCloseIcon, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable></View><FlatList data={bookings} keyExtractor={(booking) => booking.id} renderItem={({ item }) => <DayBookingCard booking={item} chalets={chalets} settings={settings} formatDate={formatDate} formatTime={formatTime} colors={colors} language={language} isRTL={isRTL} onViewDetails={() => openDetails(item.id)} />} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5} removeClippedSubviews contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false} ListHeaderComponent={bookings.length ? <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 8, textAlign: align }}>{language === "ar" ? "الحجوزات المشغولة" : "Occupied bookings"}</Text> : null} ListFooterComponent={dayFooter} /></GlowGlassCard></View></Modal>;
}

function CalendarDay({ date, bookings, arrivals, departures, waiting, selected, today, colors, accentColor, chaletMarkers, markerMode, shiftColors, onPress }: { date: string; bookings: Booking[]; arrivals: number; departures: number; waiting: boolean; selected: boolean; today: boolean; colors: ReturnType<typeof useColors>; accentColor: string; chaletMarkers: Record<string, { color: string; icon: ReturnType<typeof propertyTypeIcon> }>; markerMode: "unit" | "period"; shiftColors: Record<string, { color: string; label: string }>; onPress: () => void }) {
  const displayBookings = bookings.slice(0, 3);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.dayCell, { opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]} accessibilityLabel={`${date}${bookings.length ? `, ${bookings.length} bookings` : ""}`}>
      <View style={[styles.day, { backgroundColor: selected ? accentColor : today ? colors.surfaceMuted : "transparent", borderWidth: selected ? 1 : 0, borderColor: selected ? "rgba(255, 255, 255, 0.15)" : "transparent", borderTopColor: selected ? "rgba(255, 255, 255, 0.2)" : undefined, shadowColor: selected ? accentColor : "transparent", shadowOpacity: selected ? 0.35 : 0, shadowRadius: selected ? 16 : 0, elevation: selected ? 8 : 0 }]}> 
        <Text style={{ color: selected ? "#FFFFFF" : today ? colors.primary : colors.foreground, fontWeight: selected || today ? "800" : "600", fontSize: 13 }}>{dateObjectUTC(date).getUTCDate()}</Text>
        {arrivals || departures ? <View style={styles.operationDots}>{arrivals ? <MaterialIcons name="login" size={9} color={colors.success} /> : null}{departures ? <MaterialIcons name="logout" size={9} color={colors.primary} /> : null}</View> : null}
        <View style={markerMode === "unit" ? styles.unitMarkers : styles.dots}>{displayBookings.map((booking) => {
          const marker = chaletMarkers[booking.chaletId ?? ""];
          return markerMode === "unit"
            ? <View key={booking.id} style={[styles.unitIconMarker, { backgroundColor: (marker?.color ?? typeColors[booking.bookingType].text) + "20" }]}><MaterialIcons name={marker?.icon ?? "holiday-village"} size={11} color={marker?.color ?? typeColors[booking.bookingType].text} /></View>
            : <View key={booking.id} style={[styles.dot, { backgroundColor: shiftColors[booking.shiftId ?? ""]?.color ?? reservedPeriodColorForBookingType(booking.bookingType) }]} />;
        })}{waiting ? <View style={[styles.dot, { backgroundColor: PERIOD_COLORS.waitlist }]} /> : null}</View>
        {bookings.length > 3 ? <Text style={{ color: colors.muted, fontSize: 8 }}>+{bookings.length - 3}</Text> : null}
      </View>
    </Pressable>
  );
}

function MonthButton({ icon, label, onPress, colors }: { icon: "chevron-left" | "chevron-right"; label: string; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => [styles.monthButton, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={icon} size={22} color={colors.primary} /></Pressable>;
}

function DayBookingCard({ booking, chalets, settings, formatDate, formatTime, colors, language, isRTL, onViewDetails }: { booking: Booking; chalets: import("@/lib/booking-model").Chalet[]; settings: import("@/lib/booking-model").Settings; formatDate: (date: string) => string; formatTime: (time: string) => string; colors: ReturnType<typeof useColors>; language: "ar" | "en"; isRTL: boolean; onViewDetails: () => void }) {
  const row = isRTL ? "row-reverse" : "row";
  const chalet = chalets.find((item) => item.id === booking.chaletId);
  const call = () => { if (booking.phone.trim()) void Linking.openURL(`tel:${booking.phone.trim().replace(/\s/g, "")}`); };
  const share = () => { void openBookingWhatsApp(booking, settings, language, chalet).catch(() => undefined); };
  return <BookingCard booking={booking} chalets={chalets} colors={colors} language={language} currency={settings.currency} formatDate={formatDate} formatTime={formatTime} now={Date.now()} onDetailsPress={onViewDetails} footer={<View style={[styles.slotActions, { flexDirection: row }]}><Pressable onPress={call} style={({ pressed }) => [styles.slotAction, { flexDirection: row, backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.65 : 1 }]}><MaterialIcons name="call" size={17} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "800", fontSize: 11 }}>{language === "ar" ? "اتصال" : "Call"}</Text></Pressable><Pressable onPress={share} style={({ pressed }) => [styles.slotAction, { flexDirection: row, backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.65 : 1 }]}><MaterialIcons name="chat" size={17} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "800", fontSize: 11 }}>{language === "ar" ? "واتساب" : "WhatsApp"}</Text></Pressable><Pressable onPress={onViewDetails} style={({ pressed }) => [styles.slotAction, { flexDirection: row, backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.65 : 1 }]}><MaterialIcons name="visibility" size={17} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "800", fontSize: 11 }}>{language === "ar" ? "تفاصيل" : "Details"}</Text></Pressable></View>} />;
}

function AvailableSlot({ shift, shiftColor, formatTime, colors, language, row, onBook }: { shift: ChaletShift; shiftColor: string; formatTime: (time: string) => string; colors: ReturnType<typeof useColors>; language: "ar" | "en"; row: "row" | "row-reverse"; onBook: () => void }) {
  return <View style={[styles.availableSlot, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}><View style={styles.flex}><Text style={{ color: shiftColor, fontSize: 13, fontWeight: "800", textAlign: language === "ar" ? "right" : "left" }}>{shift.name}: {language === "ar" ? "متاحة" : "Available"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: language === "ar" ? "right" : "left" }}>{formatTime(shift.startTime)} — {formatTime(shift.endTime)}</Text></View><Pressable onPress={onBook} style={({ pressed }) => [styles.bookSlotButton, { flexDirection: row, backgroundColor: colors.primary, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="add" size={16} color="#FFFFFF" /><Text style={styles.bookSlotText}>{language === "ar" ? "حجز" : "Book"}</Text></Pressable></View>;
}

function WaitlistQuickRow({ entry, settings, colors, language, row }: { entry: import("@/lib/booking-model").WaitlistEntry; settings: import("@/lib/booking-model").Settings; colors: ReturnType<typeof useColors>; language: "ar" | "en"; row: "row" | "row-reverse" }) {
  return <View style={[styles.waitlistRow, { borderTopColor: PERIOD_COLORS.waitlist + "36", flexDirection: row }]}><View style={styles.flex}><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontWeight: "800", textAlign: language === "ar" ? "right" : "left" }}>{entry.customerName}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: language === "ar" ? "right" : "left" }}>{entry.shiftName?.trim() || bookingShiftLabel({ bookingType: entry.bookingType, shiftName: entry.shiftName }, settings, language)}</Text></View><Pressable onPress={() => router.push({ pathname: "/booking-form", params: { waitlistId: entry.id } } as never)} style={({ pressed }) => [styles.promoteButton, { backgroundColor: PERIOD_COLORS.waitlist, opacity: pressed ? 0.7 : 1 }]}><Text style={styles.promoteButtonText}>{language === "ar" ? "تحويل إلى حجز" : "Convert"}</Text></Pressable></View>;
}

function Legend({ color, icon, text, colors, isRTL }: { color: string; icon?: "holiday-village" | "agriculture" | "cabin" | "castle" | "landscape" | "home-work" | "schedule"; text: string; colors: ReturnType<typeof useColors>; isRTL: boolean }) {
  return <View style={[styles.legendItem, { flexDirection: isRTL ? "row-reverse" : "row" }]}>{icon ? <MaterialIcons name={icon} size={13} color={color} /> : null}<View style={[styles.dot, { backgroundColor: color }]} /><Text style={{ color: colors.muted, fontSize: 11 }}>{text}</Text></View>;
}


function CalendarLoading({ colors, language }: { colors: ReturnType<typeof useColors>; language: "ar" | "en" }) {
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><View style={styles.loadingWrap}><View style={[styles.loadingCard, { backgroundColor: colors.surface }]}><View style={[styles.loadingIcon, { backgroundColor: colors.primary + "15" }]}><ActivityIndicator size="large" color={colors.primary} /></View><Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", marginTop: 16 }}>{language === "ar" ? "جارٍ تجهيز التقويم" : "Preparing calendar"}</Text><Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", lineHeight: 19, marginTop: 6 }}>{language === "ar" ? "يتم تحميل حجوزاتك وتنظيم الأيام…" : "Loading your bookings and organizing days…"}</Text></View></View></ScreenContainer>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingStart: 16, paddingEnd: 16, paddingTop: 8, paddingBottom: 196, marginStart: 0, marginEnd: 0 },
  flex: { flex: 1, minWidth: 0 },
  scopeWrap: { marginTop: 11 },
  calendarCard: { borderRadius: 24, marginTop: 12 },
  calendarCardContent: { padding: 14 },
  monthHeader: { alignItems: "center", justifyContent: "space-between", gap: 10 },
  monthTitleWrap: { flex: 1, minWidth: 0, alignItems: "center" },
  monthTitle: { fontSize: 17, fontWeight: "800", textAlign: "center" },
  hijriMonth: { fontSize: 10, marginTop: 2, textAlign: "center" },
  monthButton: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  weekRow: { marginTop: 17, marginBottom: 7 },
  weekday: { width: "14.28%", fontSize: 10, fontWeight: "800", textAlign: "center" },
  daysGridContainer: { flexDirection: "row", flexWrap: "wrap", width: "100%", justifyContent: "flex-start" },
  dayCell: { width: "14.28%", height: 48, alignItems: "center", justifyContent: "center", padding: 2 },
  blankDay: { width: "14.28%", height: 48 },
  day: { flex: 1, borderRadius: 15, alignItems: "center", justifyContent: "center", gap: 3 },
  dots: { flexDirection: "row", gap: 2, minHeight: 6 },
  unitMarkers: { flexDirection: "row", gap: 2, minHeight: 14, alignItems: "center" },
  unitIconMarker: { width: 14, height: 14, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  operationDots: { minHeight: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexWrap: "wrap", gap: 10, marginTop: 15 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  selectedHeader: { alignItems: "center", justifyContent: "space-between", marginTop: 27, marginBottom: 11 },
  selectionTitle: { fontSize: 20, fontWeight: "800" },
  selectionDate: { fontSize: 12, marginTop: 3 },
  selectionBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dayFilterBar: { alignItems: "center", gap: 10, borderRadius: 15, padding: 10, marginBottom: 11 },
  clearDayFilter: { minHeight: 32, paddingHorizontal: 9, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 3 },
  detailsHeading: { fontSize: 15, fontWeight: "800", marginTop: 4, marginBottom: 9 },
  detailsHint: { fontSize: 11, marginTop: 10, marginBottom: 10 },
  dayMetricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  dayMetric: { width: "48%", minHeight: 86, borderRadius: 16, padding: 11 },
  allDaysNotice: { alignItems: "center", gap: 9, borderRadius: 16, padding: 13, marginTop: 27 },
  emptyDay: { minHeight: 132, borderRadius: 21, alignItems: "center", justifyContent: "center", padding: 20 },
  selectedCard: { borderRadius: 21, padding: 15, marginBottom: 10, elevation: 1, shadowColor: "#000000", shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  cardTop: { alignItems: "flex-start", gap: 9 },
  chaletMeta: { alignItems: "center", gap: 5, marginTop: 4 },
  chaletDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  typeLine: { width: 6, minHeight: 42, borderRadius: 3, flexShrink: 0 },
  typePill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, maxWidth: "36%" },
  cardFooter: { justifyContent: "space-between", gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#DCE8E4" },
  cardAmount: { flex: 1, minWidth: 0, fontWeight: "800", fontSize: 12 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingCard: { width: "100%", maxWidth: 330, borderRadius: 24, padding: 26, alignItems: "center" },
  loadingIcon: { width: 66, height: 66, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(7, 20, 18, 0.56)", justifyContent: "flex-end" },
  dayModal: { maxHeight: "82%", borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  dayModalContent: { paddingTop: 14, paddingHorizontal: 16 },
  modalHeader: { alignItems: "center", gap: 9, paddingBottom: 14 },
  modalDate: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", marginStart: 38 },
  modalCloseIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modalContent: { paddingTop: 14, paddingBottom: 28 },
  slotBookingCard: { borderWidth: 1, borderRadius: 17, padding: 13, marginBottom: 9 },
  guestLine: { alignItems: "center", gap: 8 },
  slotActions: { gap: 7, marginTop: 12 },
  slotAction: { flex: 1, minWidth: 0, minHeight: 34, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3, paddingHorizontal: 4 },
  availableSlot: { alignItems: "center", gap: 10, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  allBookedBadge: { minHeight: 42, borderRadius: 13, marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12 },
  bookSlotButton: { minHeight: 32, borderRadius: 10, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  bookSlotText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  waitlistSection: { borderRadius: 18, marginTop: 10, padding: 12 },
  waitlistRow: { alignItems: "center", gap: 10, paddingTop: 10, marginTop: 10 },
  promoteButton: { minHeight: 32, borderRadius: 10, justifyContent: "center", paddingHorizontal: 10 },
  promoteButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
});
