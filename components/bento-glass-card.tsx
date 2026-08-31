import { memo, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

import { useColors } from "@/hooks/use-colors";

type BentoGlassCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  accentColor?: string;
  elevated?: boolean;
  radius?: number;
  intensity?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

function withAlpha(color: string, alpha: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? `${color}${alpha}` : color;
}

/**
 * BentoGlassCard — Modern frosted card per spec:
 * BlurView, borderWidth 1, borderTopColor topHighlight, radius 22, subtle elevation.
 * Uses AppThemeTokens.glass for Dark/Light adaptivity.
 * Neon binding via accentColor (neonBorder / neonGlow).
 */
export const BentoGlassCard = memo(function BentoGlassCard({
  children,
  style,
  contentStyle,
  accentColor,
  elevated = false,
  radius = 22,
  intensity,
  onPress,
  accessibilityLabel,
  testID,
}: BentoGlassCardProps) {
  const colors = useColors();
  const isInteractive = Boolean(onPress);
  const glass = colors.appTheme.glass;
  const bg = elevated ? glass.cardBgElevated : glass.cardBg;
  const borderColor = accentColor ? withAlpha(accentColor, "4D") : glass.borderColor;
  const topHighlight = glass.topHighlight;
  const blurIntensity = intensity ?? glass.blurIntensity;
  const shadow = colors.appTheme.shadow;
  const isDark = colors.mode === "dark";
  const Container: any = isInteractive ? Pressable : View;

  const containerStyle: ViewStyle = {
    backgroundColor: bg,
    borderWidth: 1,
    borderColor,
    borderTopColor: topHighlight,
    borderRadius: radius,
    overflow: "hidden",
    shadowColor: accentColor ?? shadow.color,
    shadowOpacity: accentColor ? 0.18 : shadow.opacity,
    shadowRadius: accentColor ? 20 : shadow.radius,
    shadowOffset: { width: 0, height: 10 },
    elevation: shadow.elevation,
  };

  if (isInteractive) {
    return (
      <Container
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={({ pressed }: { pressed: boolean }) => [styles.shell, containerStyle, { opacity: pressed ? 0.96 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}
      >
        {Platform.OS !== "android" ? <BlurView intensity={blurIntensity} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} /> : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.topSheen, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]} />
        <View style={[styles.content, contentStyle]}>{children}</View>
      </Container>
    );
  }

  return (
    <View style={[styles.shell, containerStyle, style as ViewStyle]}>
      {Platform.OS !== "android" ? <BlurView intensity={blurIntensity} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} /> : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.topSheen, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]} />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
  },
  topSheen: {
    height: "13%",
    backgroundColor: "rgba(255,255,255,0.038)",
  },
  content: {
    position: "relative",
    zIndex: 1,
  },
});
