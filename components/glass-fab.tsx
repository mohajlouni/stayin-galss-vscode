import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { useI18n } from "@/lib/i18n";

type GlassFabProps = {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  accentColor?: string;
};

/**
 * Neo-Glass FAB: semi-transparent multi-layered surface with accent neon aura.
 * Spec: backgroundColor rgba(18,24,38,0.75) to rgba(28,36,56,0.85), blur 20-35,
 * border 1 rgba(255,255,255,0.08-0.15), shadow 0.35/16/8, top-edge highlight 0.2.
 */
export function GlassFab({ label, icon, onPress, accentColor }: GlassFabProps) {
  const colors = useColors();
  const { isRTL } = useI18n();
  const { triggerHaptic } = useAppPreferences();
  const accent = accentColor ?? colors.primary;
  const isDark = colors.background === "#070B10";
  const { deviceSettings } = useAppPreferences();

  const handlePress = () => {
    void triggerHaptic();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: isDark ? colors.glassFillDark : colors.glassFillLight,
          borderWidth: 1,
          borderColor: isDark ? colors.glassRimDark : colors.glassRimLight,
          borderTopColor: isDark ? colors.glassRimTopDark : colors.glassRimTopLight,
          shadowColor: accent,
          shadowOpacity: 0.35,
          shadowRadius: 16,
          elevation: 8,
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          flexDirection: isRTL ? "row-reverse" : "row",
          marginStart: 0,
          marginEnd: 0,
          paddingStart: 16,
          paddingEnd: 16,
        },
      ]}
    >
      {Platform.OS !== "android" ? <BlurView intensity={26} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} /> : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.topHighlight, { borderTopColor: isDark ? colors.glassRimTopDark : colors.glassRimTopLight }]} />
      <LinearGradient colors={[accent + "22", "transparent"]} style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {icon}
        <Text style={[styles.label, { color: "#FFFFFF", writingDirection: "ltr" }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    minHeight: 56,
    minWidth: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#FF6B47",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  topHighlight: {
    height: 1,
    borderTopWidth: 1,
    borderTopColor: "transparent",
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingStart: 12,
    paddingEnd: 12,
    marginStart: 0,
    marginEnd: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
    writingDirection: "ltr",
  },
});
