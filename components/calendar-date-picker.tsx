import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { weekdayLabel } from "@/lib/booking-model";
import { gregorianMonthGrid, moveGregorianMonth } from "@/lib/gregorian-calendar";
import { useI18n } from "@/lib/i18n";
import { useAppPreferences } from "@/lib/app-preferences";

const WEEKDAYS_AR = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function currentDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dateParts(value: string) {
  const date = new Date(`${value || currentDateKey()}T12:00:00`);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function yearChoices(centerYear: number) {
  const start = centerYear - 5;
  return Array.from({ length: 12 }, (_, index) => start + index);
}

export function CalendarDateField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { formatDate } = useAppPreferences();
  const [visible, setVisible] = useState(false);
  const display = value ? `${weekdayLabel(value, language)}، ${formatDate(value)}` : (placeholder ?? (language === "ar" ? "اختيار التاريخ" : "Choose date"));

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setVisible(true)} style={({ pressed }) => [styles.field, { backgroundColor: colors.glassInset, opacity: pressed ? 0.72 : 1, flexDirection: isRTL ? "row-reverse" : "row" }]}>
      <MaterialIcons name="calendar-month" size={17} color={colors.primary} />
      <View style={styles.flex}>
        <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: isRTL ? "right" : "left" }}>{label}</Text>
        <Text numberOfLines={1} style={{ color: value ? colors.foreground : colors.muted, fontSize: 12, fontWeight: "800", marginTop: 2, textAlign: isRTL ? "right" : "left" }}>{display}</Text>
      </View>
    </Pressable>
    <CalendarDatePicker visible={visible} value={value} onClose={() => setVisible(false)} onSelect={(date) => { onChange(date); setVisible(false); }} />
  </>;
}

export function CalendarDatePicker({ visible, value, onClose, onSelect }: { visible: boolean; value: string; onClose: () => void; onSelect: (value: string) => void }) {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { formatDate, formatMonth } = useAppPreferences();
  const seed = useMemo(() => dateParts(value), [value]);
  const [cursor, setCursor] = useState(seed);
  const [yearMode, setYearMode] = useState(false);
  const today = currentDateKey();
  const selectedParts = dateParts(value);
  const grid = gregorianMonthGrid(cursor.year, cursor.month);
  const weekdays = language === "ar" ? WEEKDAYS_AR : WEEKDAYS_EN;
  const row = isRTL ? "row-reverse" : "row";
  const years = yearChoices(cursor.year);
  const title = yearMode ? (language === "ar" ? "اختيار السنة" : "Choose year") : (language === "ar" ? "اختيار التاريخ" : "Choose date");
  const subtitle = yearMode
    ? (language === "ar" ? "اختر السنة ثم عد لاختيار الشهر واليوم." : "Choose a year, then return to pick month and day.")
    : value ? `${weekdayLabel(value, language)}، ${formatDate(value)}` : (language === "ar" ? "اختر يومًا من التقويم" : "Select a day from the calendar");

  useEffect(() => {
    if (!visible) return;
    setCursor(dateParts(value));
    setYearMode(false);
  }, [value, visible]);

  const shiftCursor = (direction: -1 | 1) => {
    if (yearMode) {
      setCursor((current) => ({ ...current, year: current.year + direction * 12 }));
      return;
    }
    setCursor((current) => moveGregorianMonth(current.year, current.month, direction));
  };
  const chooseYear = (year: number) => {
    setCursor((current) => ({ ...current, year }));
    setYearMode(false);
  };
  const selectToday = () => onSelect(today);
  const selectedYear = selectedParts.year;

  return <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <GlowGlassCard radius={28} intensity={30} style={styles.sheet} contentStyle={styles.sheetContent}>
        <View style={[styles.sheetHeader, { flexDirection: row }]}>
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "900", textAlign: isRTL ? "right" : "left" }}>{title}</Text>
            <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: isRTL ? "right" : "left" }}>{subtitle}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={onClose} style={[styles.iconButton, { backgroundColor: colors.glassInset }]}>
            <MaterialIcons name="close" size={21} color={colors.muted} />
          </Pressable>
        </View>

        <View style={[styles.monthControls, { flexDirection: row }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? (yearMode ? "السنوات التالية" : "الشهر التالي") : (yearMode ? "Next years" : "Next month")} onPress={() => shiftCursor(isRTL ? 1 : -1)} style={[styles.iconButton, { backgroundColor: colors.glassInset }]}>
            <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={23} color={colors.primary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "فتح اختيار السنة" : "Open year selector"} onPress={() => setYearMode((current) => !current)} style={({ pressed }) => [styles.monthLabel, { backgroundColor: yearMode ? colors.primary + "16" : colors.glassInset, opacity: pressed ? 0.72 : 1 }]}>
            <MaterialIcons name={yearMode ? "calendar-view-month" : "calendar-today"} size={16} color={colors.primary} />
            <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900" }}>{yearMode ? `${years[0]} – ${years[years.length - 1]}` : formatMonth(cursor.year, cursor.month)}</Text>
            <MaterialIcons name={yearMode ? "expand-less" : "expand-more"} size={18} color={colors.primary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? (yearMode ? "السنوات السابقة" : "الشهر السابق") : (yearMode ? "Previous years" : "Previous month")} onPress={() => shiftCursor(isRTL ? -1 : 1)} style={[styles.iconButton, { backgroundColor: colors.glassInset }]}>
            <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={23} color={colors.primary} />
          </Pressable>
        </View>

        {yearMode ? <View style={styles.yearGrid}>
          {years.map((year) => {
            const isSelectedYear = selectedYear === year;
            const isCurrentYear = Number(today.slice(0, 4)) === year;
            return <Pressable key={year} accessibilityRole="button" accessibilityLabel={`${language === "ar" ? "سنة" : "Year"} ${year}`} onPress={() => chooseYear(year)} style={({ pressed }) => [styles.yearCell, { backgroundColor: isSelectedYear ? colors.primary : isCurrentYear ? colors.primary + "16" : colors.surfaceMuted, borderColor: isSelectedYear ? colors.primary : isCurrentYear ? colors.primary : colors.border, opacity: pressed ? 0.68 : 1 }]}>
              <Text style={{ color: isSelectedYear ? colors.background : isCurrentYear ? colors.primary : colors.foreground, fontSize: 14, fontWeight: "900" }}>{year}</Text>
              {isCurrentYear && !isSelectedYear ? <View style={[styles.yearMarker, { backgroundColor: colors.primary }]} /> : null}
            </Pressable>;
          })}
        </View> : <>
          <View style={styles.weekRow}>{weekdays.map((day) => <Text key={day} style={{ flex: 1, color: colors.muted, textAlign: "center", fontSize: 10, fontWeight: "800" }}>{day}</Text>)}</View>
          <View style={styles.grid}>{grid.map((date, index) => {
            if (!date) return <View key={`blank-${index}`} style={[styles.blankDay, { backgroundColor: colors.surfaceMuted + "45", borderColor: colors.border + "88" }]} />;
            const isSelected = value === date;
            const isToday = date === today;
            return <Pressable key={date} accessibilityRole="button" accessibilityLabel={`${weekdayLabel(date, language)} ${formatDate(date)}${isToday ? ` · ${language === "ar" ? "اليوم" : "today"}` : ""}`} onPress={() => onSelect(date)} style={({ pressed }) => [styles.day, { backgroundColor: isSelected ? colors.primary : isToday ? colors.primary + "16" : colors.glassInset, opacity: pressed ? 0.68 : 1 }]}>
              <Text style={{ color: isSelected ? colors.background : isToday ? colors.primary : colors.foreground, fontSize: 13, fontWeight: "900" }}>{Number(date.slice(-2))}</Text>
              {isToday ? <View style={[styles.todayDot, { backgroundColor: isSelected ? colors.background : colors.primary }]} /> : null}
            </Pressable>;
          })}</View>
        </>}

        <View style={[styles.actions, { flexDirection: row }]}>
          <Pressable onPress={onClose} style={[styles.action, { backgroundColor: colors.glassInset }]}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable>
          <Pressable onPress={selectToday} style={[styles.action, { backgroundColor: colors.primary }]}><MaterialIcons name="today" size={17} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{language === "ar" ? "اليوم" : "Today"}</Text></Pressable>
        </View>
      </GlowGlassCard>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  field: { flex: 1, minWidth: 0, minHeight: 62, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center", gap: 7 },
  flex: { flex: 1, minWidth: 0 },
  backdrop: { flex: 1, backgroundColor: "rgba(4, 8, 14, 0.4)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetContent: { padding: 16, paddingBottom: 20 },
  sheetHeader: { alignItems: "center", gap: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(128,128,128,0.22)" },
  iconButton: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  monthControls: { alignItems: "center", gap: 8, marginTop: 14 },
  monthLabel: { flex: 1, minHeight: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, paddingHorizontal: 8 },
  weekRow: { flexDirection: "row", marginTop: 18, marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  day: { width: "13.28%", aspectRatio: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  blankDay: { width: "13.28%", aspectRatio: 1, borderRadius: 12, opacity: 0.24 },
  todayDot: { position: "absolute", width: 4, height: 4, borderRadius: 2, bottom: 6 },
  yearGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  yearCell: { width: "23.65%", minHeight: 52, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  yearMarker: { position: "absolute", bottom: 7, width: 4, height: 4, borderRadius: 2 },
  actions: { gap: 9, marginTop: 19 },
  action: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
});
