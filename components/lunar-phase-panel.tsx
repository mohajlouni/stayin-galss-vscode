import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StyleSheet, Text, View } from "react-native";

import { BentoGlassCard } from "@/components/bento-glass-card";
import { useColors } from "@/hooks/use-colors";
import { todayISO } from "@/lib/booking-model";
import { useI18n } from "@/lib/i18n";
import { lookupLunar2026 } from "@/lib/lunar-dates.2026";
import { LUNAR_PHASE_COLORS, LUNAR_PHASE_ICONS, LUNAR_PHASE_NAMES, type LunarPhase, hijriForDate, hijriMonthLabel, lunarPhaseForDate, lunarPhaseInsight, lunarTideStrength, monthGrid, toArabicDigits } from "@/lib/lunar-helper";

type Props = {
  compact?: boolean;
  /** الوحدة تقع قرب مسطح مائي — يعرض تنبيه المدّ القمري. */
  nearWater?: boolean;
};

export function LunarPhasePanel({ compact = false, nearWater = false }: Props) {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const todayKey = todayISO();
  const [year, month, day] = todayKey.split("-").map(Number);
  const record = lookupLunar2026(todayKey) ?? { phase: lunarPhaseForDate(year, month, day), hijriDay: hijriForDate(year, month, day).day, hijriMonth: hijriForDate(year, month, day).month, hijriYear: hijriForDate(year, month, day).year };
  const phase = record.phase as LunarPhase;
  const phaseColor = LUNAR_PHASE_COLORS[phase];
  const phaseIcon = LUNAR_PHASE_ICONS[phase] as React.ComponentProps<typeof MaterialIcons>["name"];
  const hijriDay = Number(record.hijriDay);
  const hijriMonth = Number(record.hijriMonth);
  const hijriYear = Number(record.hijriYear);
  const gregorianMonthLabel = language === "ar" ? new Date(year, month - 1, day).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" }) : new Date(year, month - 1, day).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
  const grid = monthGrid(year, month);
  const trailDays = grid.filter((cell) => !cell.blank);
  const insight = lunarPhaseInsight(phase, language);
  const tide = lunarTideStrength(year, month, day);
  const tideStrong = nearWater && tide >= 0.7;

  return <BentoGlassCard radius={compact ? 20 : 24} elevated accentColor={phaseColor} style={styles.card} contentStyle={styles.cardContent}>
    <View style={[styles.main, { flexDirection: row }]}>
      <View style={[styles.moon, { backgroundColor: phaseColor + "22" }]}><MaterialIcons name={phaseIcon} size={30} color={phaseColor} /></View>
      <View style={styles.flex}>
        <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900", textAlign: align, letterSpacing: 0.4 }}>{language === "ar" ? "اليوم القمري" : "Lunar today"}</Text>
        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 18, fontWeight: "900", marginTop: 2, textAlign: align }}>{LUNAR_PHASE_NAMES[phase][language === "ar" ? 0 : 1]}</Text>
        <Text numberOfLines={1} style={{ color: phaseColor, fontSize: 13, fontWeight: "800", marginTop: 3, textAlign: align, writingDirection: isRTL ? "rtl" : "ltr" }}>{toArabicDigits(hijriDay)} {hijriMonthLabel(hijriMonth, language)} {toArabicDigits(hijriYear)} · {gregorianMonthLabel}</Text>
      </View>
    </View>
    {!compact ? <>
      {insight ? <View style={[styles.insight, { backgroundColor: phaseColor + "18", borderColor: phaseColor + "44", flexDirection: row }]}><MaterialIcons name={phase === "full" ? "wb-sunny" : "lightbulb-outline"} size={14} color={phaseColor} /><Text numberOfLines={2} style={[styles.insightText, { color: phaseColor, textAlign: align }]}>{insight.label} — {insight.detail}</Text></View> : null}
      {tideStrong ? <View style={[styles.tideBar, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "55", flexDirection: row }]}><MaterialIcons name="waves" size={14} color={colors.primary} /><Text numberOfLines={2} style={[styles.insightText, { color: colors.primary, textAlign: align }]}>{language === "ar" ? "مدّ قمري مرتفع قرب هذه المنشأة — انتبه لمستوى الماء." : "Strong spring tide near this property — watch water levels."}</Text></View> : null}
      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", marginTop: 13, marginBottom: 7, textAlign: align }}>{language === "ar" ? "خريطة أطوار الشهر" : "Month phase trail"}</Text>
      <View style={styles.trail}>
        {trailDays.map((cell) => {
          const cellKey = `${todayKey.slice(0, 8)}${String(cell.day).padStart(2, "0")}`;
          const cellRecord = lookupLunar2026(cellKey) ?? { phase: lunarPhaseForDate(year, month, cell.day) };
          const cellPhase = cellRecord.phase as LunarPhase;
          const isToday = cell.day === day;
          return <View key={cell.day} style={[styles.trailCell, { borderColor: isToday ? phaseColor : "transparent", backgroundColor: isToday ? LUNAR_PHASE_COLORS[cellPhase] + "26" : "transparent" }]}><View style={[styles.trailDot, { backgroundColor: LUNAR_PHASE_COLORS[cellPhase], opacity: isToday ? 1 : 0.75 }]} /><Text style={{ color: colors.muted, fontSize: 8, fontWeight: "700", marginTop: 2, writingDirection: "ltr" }}>{cell.day}</Text></View>;
        })}
      </View>
    </> : null}
  </BentoGlassCard>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 24 },
  cardContent: { padding: 15 },
  main: { alignItems: "center", gap: 12 },
  moon: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  trail: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  trailCell: { width: 30, height: 34, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  trailDot: { width: 10, height: 10, borderRadius: 5 },
  insight: { minHeight: 34, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", gap: 7, marginTop: 11 },
  insightText: { flex: 1, fontSize: 11, fontWeight: "900" },
  tideBar: { minHeight: 34, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", gap: 7, marginTop: 8 },
});