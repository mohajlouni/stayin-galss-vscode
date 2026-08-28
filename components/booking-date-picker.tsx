import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { Booking, PERIOD_COLORS, WaitlistEntry, bookingCoversDate, dateObjectUTC, dayNumber, getBookingRange, parseISODate, typeColors, weekdayLabel } from "@/lib/booking-model";
import { gregorianMonthGrid, moveGregorianMonth } from "@/lib/gregorian-calendar";
import { useI18n } from "@/lib/i18n";
import { useAppPreferences } from "@/lib/app-preferences";

const WEEK_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WEEK_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Props = { value: string; onChange: (date: string) => void; bookings: Booking[]; waitlist?: WaitlistEntry[]; rangeStart?: string; rangeEnd?: string; embedded?: boolean; minimumDate?: string };

export function BookingDatePicker({ value, onChange, bookings, waitlist = [], rangeStart = value, rangeEnd = value, embedded = false, minimumDate }: Props) {
  const parsed = parseISODate(value);
  const [year, setYear] = useState(parsed.y);
  const [month, setMonth] = useState(parsed.m);
  const { t, isRTL, language } = useI18n();
  const { formatDate, formatMonth, formatHijriDate, showHijriDate } = useAppPreferences();
  const colors = useColors();
  const direction = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";

  useEffect(() => { setYear(parsed.y); setMonth(parsed.m); }, [parsed.m, parsed.y]);

  const days = useMemo(() => gregorianMonthGrid(year, month), [month, year]);
  const moveMonth = (delta: number) => { const next = moveGregorianMonth(year, month, delta); if (minimumDate && `${next.year}-${String(next.month).padStart(2, "0")}-01` < minimumDate.slice(0, 7) + "-01") return; setYear(next.year); setMonth(next.month); };
  const atMinimumMonth = Boolean(minimumDate && year === parseISODate(minimumDate).y && month === parseISODate(minimumDate).m);
  const bookingsFor = (date: string) => bookings.filter((booking) => booking.status !== "cancelled" && booking.status !== "waitlisted" && bookingCoversDate(booking, date));
  const waitFor = (date: string) => waitlist.some((entry) => entry.status !== "cancelled" && entry.requestedDate === date);
  const week = language === "ar" ? WEEK_AR : WEEK_EN;

  const calendarContent = <>
      <View style={{ flexDirection: direction, justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Pressable disabled={atMinimumMonth} onPress={() => moveMonth(-1)} style={{ width: 40, height: 40, backgroundColor: colors.surfaceMuted, borderRadius: 12, alignItems: "center", justifyContent: "center", opacity: atMinimumMonth ? 0.35 : 1 }}>
          <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={22} color={colors.primary} />
        </Pressable>
        <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 16, flex: 1, textAlign: "center" }}>{formatMonth(year, month)}</Text>
        <Pressable onPress={() => moveMonth(1)} style={{ width: 40, height: 40, backgroundColor: colors.surfaceMuted, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
          <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={colors.primary} />
        </Pressable>
      </View>
      <View style={{ flexDirection: direction, flexWrap: "wrap", marginTop: 10 }}>
        {week.map((day) => <Text key={day} style={{ width: "14.28%", textAlign: "center", color: colors.muted, fontSize: 10, paddingVertical: 5 }}>{day.slice(0, 3)}</Text>)}
      </View>
      <View style={{ flexDirection: direction, flexWrap: "wrap" }}>
        {days.map((date, index) => {
          if (!date) return <View key={`blank-${index}`} style={{ width: "14.28%", minHeight: 58 }} />;
          const unavailable = Boolean(minimumDate && date < minimumDate);
          return <Pressable key={date} disabled={unavailable} onPress={() => onChange(date)} style={{ width: "14.28%", minHeight: 58, padding: 3, opacity: unavailable ? 0.32 : 1 }}>
            <CalendarDayCell date={date} bookings={bookingsFor(date)} waiting={waitFor(date)} arrivals={bookingsFor(date).filter((booking) => booking.startDate === date).length} departures={bookingsFor(date).filter((booking) => Math.floor(getBookingRange(booking).end / 1440) === dayNumber(date)).length} selected={!unavailable && date === value} inRange={!unavailable && date >= rangeStart && date <= rangeEnd} rangeStart={!unavailable && date === rangeStart} rangeEnd={!unavailable && date === rangeEnd} colors={colors} />
          </Pressable>;
        })}
      </View>
      <Text style={{ textAlign: align, color: colors.primary, fontWeight: "700", marginTop: 10 }}>{weekdayLabel(value, language)}, {formatDate(value)}</Text>
      {showHijriDate ? <Text style={{ textAlign: align, color: colors.muted, fontSize: 11, marginTop: 3 }}>{language === "ar" ? `هجري: ${formatHijriDate(value)}` : `Hijri: ${formatHijriDate(value)}`}</Text> : null}
      <View style={{ flexDirection: direction, flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <Legend color={typeColors.morning.text} text={t("morning")} colors={colors} />
        <Legend color={typeColors.evening.text} text={t("evening")} colors={colors} />
        <Legend color={typeColors["24h"].text} text={t("fullDay")} colors={colors} />
        <Legend color={typeColors["multi-day"].text} text={t("multiDay")} colors={colors} />
        <Legend color={PERIOD_COLORS.waitlist} text={t("waiting")} colors={colors} />
      </View>
    </>;

  return embedded
    ? <GlowGlassCard radius={20} intensity={26} style={{ marginTop: 6 }} contentStyle={{ padding: 10 }}>{calendarContent}</GlowGlassCard>
    : <GlowGlassCard radius={22} intensity={30} style={{ marginTop: 10 }} contentStyle={{ padding: 14 }}>{calendarContent}</GlowGlassCard>;
}

export function CalendarDayCell({ date, bookings, waiting, arrivals, departures, selected, inRange, rangeStart, rangeEnd, colors }: { date: string; bookings: Booking[]; waiting: boolean; arrivals: number; departures: number; selected: boolean; inRange: boolean; rangeStart: boolean; rangeEnd: boolean; colors: ReturnType<typeof useColors> }) {
  const types = Array.from(new Set(bookings.map((booking) => booking.bookingType))).slice(0, 3);
  const occupied = bookings.length > 0 || waiting;
  const activeRange = selected || rangeStart || rangeEnd;
  const backgroundColor = activeRange ? colors.primary : inRange ? colors.primary + "1C" : occupied ? colors.surfaceMuted : "transparent";
  return <View style={{ flex: 1, borderRadius: rangeStart || rangeEnd ? 16 : 14, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor }}><Text style={{ color: activeRange ? "#FFFFFF" : colors.foreground, fontWeight: "800", zIndex: 1 }}>{dateObjectUTC(date).getUTCDate()}</Text>{arrivals || departures ? <View style={{ flexDirection: "row", gap: 2, marginTop: 2, zIndex: 1 }}>{arrivals ? <MaterialIcons name="login" size={9} color={colors.success} /> : null}{departures ? <MaterialIcons name="logout" size={9} color={colors.primary} /> : null}</View> : null}<View style={{ flexDirection: "row", gap: 3, marginTop: 2, zIndex: 1 }}>{types.map((type) => <View key={type} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: typeColors[type].text }} />)}{waiting ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: PERIOD_COLORS.waitlist }} /> : null}</View></View>;
}

function Legend({ color, text, colors }: { color: string; text: string; colors: ReturnType<typeof useColors> }) { return <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: color }} /><Text style={{ color: colors.muted, fontSize: 11 }}>{text}</Text></View>; }
