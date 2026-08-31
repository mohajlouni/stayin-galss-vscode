import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { AccessibilityInfo, LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from "react-native";
import { useEffect, useState } from "react";

import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { useI18n } from "@/lib/i18n";
import { GlowGlassCard } from "@/components/glow-glass-card";

export type UpcomingHolidayTrigger = { date: string; titleAr: string; titleEn: string; daysAway: number };

type DailyOperationsPanelProps = {
  arrivals: number;
  checkouts: number;
  outstanding: number;
  waitlist: number;
  onArrivalsPress: () => void;
  onCheckoutsPress: () => void;
  onOutstandingPress: () => void;
  onWaitlistPress: () => void;
  onTurnoverPress: () => void;
  showTurnoverAction?: boolean;
  upcomingHolidays?: UpcomingHolidayTrigger[];
  onHolidayPricingPress?: (holiday: UpcomingHolidayTrigger) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
};

export function DailyOperationsPanel({ arrivals, checkouts, outstanding, waitlist, onArrivalsPress, onCheckoutsPress, onOutstandingPress, onWaitlistPress, onTurnoverPress, showTurnoverAction = true, upcomingHolidays, onHolidayPricingPress, expanded, onToggleExpanded }: DailyOperationsPanelProps) {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { deviceSettings } = useAppPreferences();
  const [reduceMotion, setReduceMotion] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  useEffect(() => {
    if (Platform.OS === "android") UIManager.setLayoutAnimationEnabledExperimental?.(true);
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => setReduceMotion(false));
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => subscription.remove();
  }, []);
  const entries = [
    { key: "arrivals", count: arrivals, label: language === "ar" ? "وصول اليوم" : "Arrivals today", hint: language === "ar" ? "حجوزات تبدأ لاحقًا" : "Bookings starting later", color: "#3B82F6", icon: "login" as const, onPress: onArrivalsPress },
    { key: "checkouts", count: checkouts, label: language === "ar" ? "مغادرة اليوم" : "Today's checkouts", hint: language === "ar" ? "إقامات تنتهي اليوم" : "Stays ending today", color: "#F59E0B", icon: "logout" as const, onPress: onCheckoutsPress },
    { key: "outstanding", count: outstanding, label: language === "ar" ? "دفعات معلقة" : "Outstanding payments", hint: language === "ar" ? "تحتاج متابعة مالية" : "Need payment follow-up", color: "#EF8C26", icon: "payments" as const, onPress: onOutstandingPress },
    { key: "waitlist", count: waitlist, label: language === "ar" ? "طلبات انتظار" : "Waitlist requests", hint: language === "ar" ? "بانتظار قرارك" : "Awaiting a decision", color: "#A56DD1", icon: "pending-actions" as const, onPress: onWaitlistPress },
  ];

  const total = arrivals + checkouts + outstanding + waitlist;
  const nextHoliday = upcomingHolidays?.[0];
  const holidayDayLabel = (daysAway: number) => daysAway === 0 ? (language === "ar" ? "اليوم" : "today") : daysAway === 1 ? (language === "ar" ? "غدًا" : "tomorrow") : (language === "ar" ? `بعد ${daysAway} أيام` : `in ${daysAway} days`);
  const toggleExpanded = () => {
    if (!reduceMotion && !deviceSettings.reduceMotion) LayoutAnimation.configureNext({ duration: 220, create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity }, update: { type: LayoutAnimation.Types.easeInEaseOut }, delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity } });
    onToggleExpanded();
  };
  return <GlowGlassCard style={styles.panel} contentStyle={styles.panelContent}><View style={[styles.header, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={language === "ar" ? (expanded ? "إخفاء مركز مهام اليوم" : "إظهار مركز مهام اليوم") : (expanded ? "Hide today’s task center" : "Show today’s task center")} onPress={toggleExpanded} style={({ pressed }) => [styles.headerTrigger, { flexDirection: row, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.headerIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="today" size={18} color={colors.primary} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", textAlign: align }}>{language === "ar" ? "مركز مهام اليوم" : "Today’s task center"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 2, textAlign: align }}>{expanded ? (language === "ar" ? "الوصول والمغادرة والدفعات والمتابعة" : "Arrivals, checkouts, payments, and follow-up") : (language === "ar" ? `${total} مهام للمتابعة · اضغط للإظهار` : `${total} tasks to review · tap to expand`)}</Text></View><MaterialIcons name={expanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={25} color={colors.primary} /></Pressable>{showTurnoverAction ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "لوحة التنظيف والفحص" : "Cleaning and inspection board"} onPress={onTurnoverPress} style={({ pressed }) => [styles.turnoverLink, { backgroundColor: colors.glassInset, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="cleaning-services" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "التنظيف" : "Cleaning"}</Text></Pressable> : null}</View>{expanded ? <>{nextHoliday ? <View style={[styles.holidayBanner, { flexDirection: row, backgroundColor: "#E8590C18", borderColor: "#E8590C2E" }]}><View style={[styles.holidayIcon, { backgroundColor: "#E8590C22" }]}><MaterialIcons name="celebration" size={16} color="#E8590C" /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? `عطلة قريبة: ${nextHoliday.titleAr}` : `Upcoming holiday: ${nextHoliday.titleEn}`}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{holidayDayLabel(nextHoliday.daysAway)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تفعيل تسعيرة العطلات" : "Activate holiday pricing"} onPress={() => onHolidayPricingPress?.(nextHoliday)} style={({ pressed }) => [styles.holidayChip, { backgroundColor: "#E8590C", opacity: pressed ? 0.75 : 1 }]}><MaterialIcons name="local-offer" size={13} color="#FFFFFF" /><Text style={styles.holidayChipText}>{language === "ar" ? "تسعيرة العطلات" : "Holiday pricing"}</Text></Pressable></View> : null}<View style={styles.grid}>{entries.map((entry) => <Pressable key={entry.key} accessibilityRole="button" accessibilityLabel={entry.label} onPress={entry.onPress} style={({ pressed }) => [styles.taskCard, { backgroundColor: colors.glassInset, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.taskTop, { flexDirection: row }]}><View style={[styles.taskIcon, { backgroundColor: entry.color + "18" }]}><MaterialIcons name={entry.icon} size={17} color={entry.color} /></View><Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>{entry.count}</Text></View><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 10, textAlign: align }}>{entry.label}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 3, textAlign: align }}>{entry.hint}</Text></Pressable>)}</View></> : null}</GlowGlassCard>;
}

const styles = StyleSheet.create({
  panel: { borderRadius: 24, marginTop: 14 },
  panelContent: { padding: 13 },
  header: { alignItems: "center", gap: 9 },
  headerTrigger: { flex: 1, minWidth: 0, alignItems: "center", gap: 9 },
  headerIcon: { width: 35, height: 35, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  taskCard: { flexBasis: "47%", flexGrow: 1, minWidth: 0, minHeight: 104, borderRadius: 16, padding: 11 },
  taskTop: { alignItems: "center", justifyContent: "space-between" },
  taskIcon: { width: 31, height: 31, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  turnoverLink: { minHeight: 34, borderRadius: 12, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", gap: 3, flexDirection: "row", flexShrink: 0 },
  holidayBanner: { alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 16, borderWidth: 1, padding: 10, marginTop: 12 },
  holidayIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  holidayChip: { minHeight: 30, borderRadius: 12, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, flexShrink: 0 },
  holidayChipText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
});
