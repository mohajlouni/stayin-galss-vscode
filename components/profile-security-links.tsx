import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { useI18n } from "@/lib/i18n";

export function ProfileSecurityLinks() {
  const colors = useColors(); const { language, isRTL } = useI18n(); const row = isRTL ? "row-reverse" : "row"; const align = isRTL ? "right" : "left";
  return <GlowGlassCard radius={20} intensity={30} style={styles.card} contentStyle={styles.cardContent}><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", textAlign: align }}>{language === "ar" ? "أمان الحساب" : "Account security"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4, textAlign: align }}>{language === "ar" ? "كلمة المرور، تسجيل الخروج، وإدارة طلب حذف الحساب والبيانات." : "Password management, sign out, and account deletion requests."}</Text><Pressable onPress={() => router.push("/account-security")} style={({ pressed }) => [styles.button, { backgroundColor: colors.surfaceMuted, flexDirection: row, opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name="security" size={20} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900", flex: 1, textAlign: align }}>{language === "ar" ? "فتح إعدادات أمان الحساب" : "Open account security"}</Text><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={21} color={colors.primary} /></Pressable></GlowGlassCard>;
}
const styles = StyleSheet.create({ card: { marginTop: 14 }, cardContent: { padding: 15 }, button: { minHeight: 48, borderRadius: 13, marginTop: 13, paddingHorizontal: 12, alignItems: "center", gap: 8 } });
