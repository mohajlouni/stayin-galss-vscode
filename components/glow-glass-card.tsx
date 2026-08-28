import { memo, type ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";

type GlowGlassCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  glowColor?: string;
  glowTone?: "standard" | "subtle";
  radius?: number;
  intensity?: number;
  accessibilityLabel?: string;
  testID?: string;
};

function translucent(color: string, opacityHex: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${opacityHex}`;
  return color;
}

/**
 * طبقة زجاجية موحدة: تمويه أصلي، جسم Obsidian، توهج داخلي اختياري ولمعة علوية دقيقة.
 * لا تستبدل دلالات الألوان التشغيلية؛ glowColor يضيف عمقًا للوحدة فقط.
 */
export const GlowGlassCard = memo(function GlowGlassCard({ children, style, contentStyle, glowColor, glowTone = "standard", radius = 24, intensity = 18, accessibilityLabel, testID }: GlowGlassCardProps) {
  const colors = useColors();
  const { deviceSettings } = useAppPreferences();
  const accent = glowColor ?? "#FF6B47";
  const isDark = colors.background === "#070B10";
  const isAndroid = Platform.OS === "android";
  const supportsBackdropBlur = Platform.OS !== "android";
  const glowStrength = deviceSettings.glassGlowIntensity === "subtle" ? 0.52 : deviceSettings.glassGlowIntensity === "vivid" ? 1.45 : 1;
  const effectiveGlowStrength = glowTone === "subtle" ? glowStrength * 0.5 : glowStrength;
  const glowOpacity = Math.min(0.12, 0.07 * effectiveGlowStrength);
  const glowShadowOpacity = Math.min(0.26, 0.12 * effectiveGlowStrength);
  const glassFill = isDark
    ? deviceSettings.glassSurfaceOpacity === "transparent" ? "rgba(15, 23, 36, 0.12)" : deviceSettings.glassSurfaceOpacity === "focused" ? "rgba(15, 23, 36, 0.30)" : "rgba(15, 23, 36, 0.21)"
    : deviceSettings.glassSurfaceOpacity === "transparent" ? "rgba(255, 255, 255, 0.62)" : deviceSettings.glassSurfaceOpacity === "focused" ? "rgba(255, 255, 255, 0.90)" : "rgba(255, 255, 255, 0.80)";
  return (
    <View accessibilityLabel={accessibilityLabel} testID={testID} collapsable={false} style={[styles.shell, isAndroid && styles.androidShell, { borderRadius: radius, borderColor: colors.glassRim, backgroundColor: glassFill, shadowColor: glowColor ?? "#000000", shadowOpacity: glowColor ? glowShadowOpacity : isDark ? 0.28 : 0.12 }, style]}>
      {!isAndroid ? <View pointerEvents="none" collapsable={false} style={[StyleSheet.absoluteFillObject, styles.effects, { borderRadius: radius }]}>
        {supportsBackdropBlur ? <BlurView intensity={intensity} tint={isDark ? "dark" : "light"} style={[StyleSheet.absoluteFillObject, styles.blur, { borderRadius: radius }]} /> : null}
        {glowColor ? <LinearGradient colors={[translucent(accent, "FF"), "transparent"]} start={{ x: 0.5, y: 1 }} end={{ x: 0.5, y: 0 }} style={[styles.bottomAura, { borderBottomLeftRadius: radius, borderBottomRightRadius: radius, opacity: glowOpacity }]} /> : null}
      </View> : null}
      <View collapsable={false} style={[styles.content, isAndroid && styles.androidContent, contentStyle]}>{children}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    backgroundColor: "transparent",
    borderWidth: 1.2,
    borderColor: "rgba(255, 255, 255, 0.15)",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 10,
  },
  androidShell: { overflow: "visible", elevation: 4, shadowOpacity: 0 },
  effects: { overflow: "hidden" },
  blur: { overflow: "hidden" },
  bottomAura: { position: "absolute", height: "26%", left: 0, right: 0, bottom: 0 },
  content: { position: "relative", zIndex: 2, elevation: 2 },
  androidContent: { zIndex: 0, elevation: 0 },
});
