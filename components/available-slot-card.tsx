import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StyleSheet, Text, View } from "react-native";

import { GlowGlassCard } from "@/components/glow-glass-card";
import { RipplePressable } from "@/components/ripple-pressable";
import { useColors } from "@/hooks/use-colors";
import type { PricedBookingType } from "@/lib/booking-model";

type AvailableSlotCardProps = {
  chaletName: string;
  dateText: string;
  timeRange: string;
  period: Extract<PricedBookingType, "morning" | "evening">;
  language: "ar" | "en";
  themeColor: string;
  onQuickBook: () => void;
};

export function AvailableSlotCard({ chaletName, dateText, timeRange, period, language, themeColor, onQuickBook }: AvailableSlotCardProps) {
  const colors = useColors();
  const isArabic = language === "ar";
  const functionalColor = period === "morning" ? "#3B82F6" : "#8B5CF6";
  const periodName = isArabic ? (period === "morning" ? "الصباحية (صباحي)" : "المسائية (سهرة)") : (period === "morning" ? "Morning" : "Evening");
  const label = isArabic ? `✨ ${chaletName} — فترة ${period === "morning" ? "صباحي" : "سهرة"} متاحة` : `✨ ${chaletName} — ${periodName} slot available`;

  return <GlowGlassCard style={styles.card} contentStyle={styles.cardContent} glowColor={themeColor} intensity={16}>
    <View style={styles.info}>
      <Text numberOfLines={1} style={[styles.title, { color: functionalColor, textAlign: isArabic ? "right" : "left" }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.meta, { color: colors.muted, textAlign: isArabic ? "right" : "left" }]}>{dateText} · {timeRange}</Text>
    </View>
    <RipplePressable accessibilityRole="button" accessibilityLabel={isArabic ? `إضافة حجز ${periodName}` : `Book ${periodName}`} rippleColor={themeColor + "2E"} onPress={onQuickBook} style={[styles.cta, { backgroundColor: colors.glassInset, borderColor: themeColor + "52" }]}><MaterialIcons name="add" size={17} color={themeColor} /><Text style={[styles.ctaText, { color: themeColor }]}>{isArabic ? "حجز الآن" : "Book now"}</Text></RipplePressable>
  </GlowGlassCard>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, minHeight: 58, marginBottom: 9 },
  cardContent: { minHeight: 58, paddingVertical: 9, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  info: { width: "66%", minWidth: 0, paddingHorizontal: 9, alignItems: "flex-end" },
  title: { width: "100%", fontSize: 12, fontWeight: "900", writingDirection: "rtl" },
  meta: { width: "100%", fontSize: 10, marginTop: 3, writingDirection: "rtl" },
  cta: { width: "32%", minHeight: 40, flexShrink: 0, borderWidth: 1, borderRadius: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, overflow: "hidden" },
  ctaText: { fontSize: 12, fontWeight: "900", writingDirection: "rtl" },
});
