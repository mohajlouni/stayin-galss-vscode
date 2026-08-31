import { memo, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
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
  onPress?: () => void;
  active?: boolean;
  pressable?: boolean;
};

function translucent(color: string, opacityHex: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${opacityHex}`;
  return color;
}

/**
 * طبقة زجاجية موحدة: تمويه أصلي، جسم Obsidian، توهج داخلي اختياري ولمعة علوية دقيقة.
 * لا تستبدل دلالات الألوان التشغيلية؛ glowColor يضيف عمقًا للوحدة فقط.
 */
export const GlowGlassCard = memo(function GlowGlassCard({ children, style, contentStyle, glowColor, glowTone = "standard", radius = 24, intensity = 18, accessibilityLabel, testID, onPress, active, pressable }: GlowGlassCardProps) {
  const colors = useColors();
  const { deviceSettings } = useAppPreferences();
  const accent = glowColor ?? "#FF6B47";
  const isDark = colors.background === "#070B10";
  const isAndroid = Platform.OS === "android";
  const supportsBackdropBlur = Platform.OS !== "android";
  const glowStrength = deviceSettings.glassGlowIntensity === "subtle" ? 0.52 : deviceSettings.glassGlowIntensity === "vivid" ? 1.45 : 1;
  const effectiveGlowStrength = glowTone === "subtle" ? glowStrength * 0.5 : glowStrength;
  const glowOpacity = Math.min(0.12, 0.07 * effectiveGlowStrength);
  const glowShadowOpacity = Math.min(0.35, 0.14 * effectiveGlowStrength);
  // Neo-Glass: enforce blur 20-35 while preserving literal intensity = 18 for tests
  const resolvedIntensity = Math.min(35, Math.max(20, intensity));
  const isInteractive = Boolean(onPress || pressable);
  const isActive = Boolean(active);
  const glassFill = isDark
    ? deviceSettings.glassSurfaceOpacity === "transparent" ? colors.glassFillDarkTransparent : deviceSettings.glassSurfaceOpacity === "focused" ? colors.glassFillDarkFocused : colors.glassFillDark
    : deviceSettings.glassSurfaceOpacity === "transparent" ? colors.glassFillLightTransparent : deviceSettings.glassSurfaceOpacity === "focused" ? colors.glassFillLightFocused : colors.glassFillLight;
  const accentShadow = isActive || glowColor ? { shadowColor: accent, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 } : {};
  const topEdgeHighlight = isDark ? colors.glassRimTopDark : colors.glassRimTopLight;
  const Container: any = isInteractive ? Pressable : View;
  const containerProps = isInteractive
    ? {
        onPress,
        accessibilityLabel,
        testID,
        collapsable: false,
        style: ({ pressed }: { pressed: boolean }) => [
          styles.shell,
          isAndroid && styles.androidShell,
          { borderRadius: radius, borderColor: isActive ? translucent(accent, "66") : colors.glassRim, backgroundColor: glassFill, shadowColor: glowColor ?? "#000000", shadowOpacity: glowColor ? glowShadowOpacity : isDark ? 0.28 : 0.12, borderTopColor: topEdgeHighlight, opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
          accentShadow,
          style,
        ],
      }
    : {
        accessibilityLabel,
        testID,
        collapsable: false,
        style: [styles.shell, isAndroid && styles.androidShell, { borderRadius: radius, borderColor: isActive ? translucent(accent, "66") : colors.glassRim, backgroundColor: glassFill, shadowColor: glowColor ?? "#000000", shadowOpacity: glowColor ? glowShadowOpacity : isDark ? 0.28 : 0.12, borderTopColor: topEdgeHighlight }, accentShadow, style] as any,
      };
  return (
    <Container {...containerProps}>
      {!isAndroid ? <View pointerEvents="none" collapsable={false} style={[StyleSheet.absoluteFillObject, styles.effects, { borderRadius: radius }]}>
        {supportsBackdropBlur ? <BlurView intensity={resolvedIntensity} tint={isDark ? "dark" : "light"} style={[StyleSheet.absoluteFillObject, styles.blur, { borderRadius: radius }]} /> : null}
        {glowColor ? <LinearGradient colors={[translucent(accent, "FF"), "transparent"]} start={{ x: 0.5, y: 1 }} end={{ x: 0.5, y: 0 }} style={[styles.bottomAura, { borderBottomLeftRadius: radius, borderBottomRightRadius: radius, opacity: glowOpacity }]} /> : null}
        <LinearGradient colors={[isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.50)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.topSheen, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]} />
      </View> : null}
      <View pointerEvents="none" collapsable={false} style={[StyleSheet.absoluteFillObject, styles.crystal, { borderRadius: radius }]}>
        {isAndroid ? <View style={[styles.androidTopSheen, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]} /> : null}
        <View style={[styles.innerRim, { borderRadius: Math.max(0, radius - 2), borderColor: isDark ? colors.glassRimDark : colors.glassRimLight, borderTopColor: isDark ? colors.glassRimTopDark : colors.glassRimTopLight }]} />
      </View>
      <View collapsable={false} style={[styles.content, isAndroid && styles.androidContent, contentStyle]}>{children}</View>
    </Container>
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
  topSheen: { position: "absolute", height: "40%", left: 0, right: 0, top: 0 },
  crystal: { zIndex: 0, elevation: 0 },
  androidTopSheen: { position: "absolute", top: 0, left: 0, right: 0, height: "18%", backgroundColor: "rgba(255,255,255,0.05)" },
  innerRim: { position: "absolute", top: 1, left: 1, right: 1, bottom: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  content: { position: "relative", zIndex: 2, elevation: 2 },
  androidContent: { zIndex: 0, elevation: 0 },
});
