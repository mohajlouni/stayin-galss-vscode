import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { GlowGlassCard } from "@/components/glow-glass-card";

type OperationalAlertsProps = {
  turnoverCount: number;
  checkoutWarningCount: number;
  onTurnoverPress: () => void;
  onCheckoutsPress: () => void;
};

export function OperationalAlerts({ turnoverCount, checkoutWarningCount, onTurnoverPress, onCheckoutsPress }: OperationalAlertsProps) {
  const { language, isRTL } = useI18n();
  const colors = useColors();
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  if (!turnoverCount && !checkoutWarningCount) return null;

  return <View style={styles.wrap}>{turnoverCount ? <GlowGlassCard intensity={16} style={styles.alert}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "فتح مهام التنظيف والفحص" : "Open cleaning and inspection tasks"} onPress={onTurnoverPress} style={({ pressed }) => [styles.alertContent, { flexDirection: row, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.icon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="cleaning-services" size={17} color={colors.primary} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? `${turnoverCount} مهمة تنظيف وفحص تحتاج متابعة` : `${turnoverCount} cleaning task${turnoverCount === 1 ? "" : "s"} need attention`}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? "جهّز الشاليه قبل الحجز التالي" : "Prepare the chalet before the next stay"}</Text></View><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={19} color={colors.primary} /></Pressable></GlowGlassCard> : null}{checkoutWarningCount ? <GlowGlassCard intensity={16} style={styles.alert}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "فتح المغادرات القريبة" : "Open upcoming checkouts"} onPress={onCheckoutsPress} style={({ pressed }) => [styles.alertContent, { flexDirection: row, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.icon, { backgroundColor: colors.warning + "18" }]}><MaterialIcons name="alarm" size={17} color={colors.warning} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? `${checkoutWarningCount} مغادرة خلال ساعتين` : `${checkoutWarningCount} checkout${checkoutWarningCount === 1 ? "" : "s"} within two hours`}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? "راجع المغادرة والتأمين قبل انتهاء الإقامة" : "Review checkout and deposit before the stay ends"}</Text></View><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={19} color={colors.warning} /></Pressable></GlowGlassCard> : null}</View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 7, marginTop: 10 },
  alert: { borderRadius: 18 },
  alertContent: { minHeight: 57, alignItems: "center", paddingHorizontal: 10, gap: 8 },
  icon: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
});
