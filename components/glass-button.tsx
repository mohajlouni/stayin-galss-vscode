import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

type GlassButtonProps = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

/** زر موحّد لنظام GlowGlass؛ المرجاني للإجراء العام وألوان الخطر دلالية فقط. */
export function GlassButton({ title, onPress, variant = "primary", icon, style, disabled = false, accessibilityLabel, testID }: GlassButtonProps) {
  const colors = useColors();
  const { isRTL } = useI18n();
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const textColor = isPrimary ? "#FFFFFF" : isDanger ? colors.error : colors.foreground;

  const content = <>
    {icon}
    <Text style={[styles.text, { color: textColor }]}>{title}</Text>
  </>;

  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} testID={testID} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.base, { borderColor: isPrimary ? "rgba(255,255,255,0.28)" : colors.glassRim, opacity: disabled ? 0.48 : pressed ? 0.82 : 1, transform: [{ scale: pressed && !disabled ? 0.98 : 1 }] }, style]}>
    {isPrimary ? <LinearGradient colors={[colors.primary + "D1", colors.secondary + "C2"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.primaryFill, { flexDirection: isRTL ? "row-reverse" : "row" }]}>{content}</LinearGradient> : <View pointerEvents="none" style={[styles.secondaryFill, { flexDirection: isRTL ? "row-reverse" : "row", backgroundColor: isDanger ? colors.error + "18" : colors.glassInset, borderColor: colors.glassRim }]}>{content}</View>}
  </Pressable>;
}

const styles = StyleSheet.create({
  base: { minHeight: 46, borderRadius: 16, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, shadowColor: "#000000", shadowOpacity: 0.18, shadowRadius: 11, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  primaryFill: { minHeight: 46, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, shadowColor: "#FF6B47", shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  secondaryFill: { minHeight: 46, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  text: { fontSize: 14, fontWeight: "800", textAlign: "center" },
});
