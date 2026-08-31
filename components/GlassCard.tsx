import { memo, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";

type GlassCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** لون النيون المرتبط بالشاليه النشط؛ الافتراضي colors.primary (ديناميكي من useColors) */
  accentColor?: string;
  radius?: number;
  /** شدة التمويه — الافتراضي 25px كما بالمواصفات */
  intensity?: number;
  elevated?: boolean;
  /** يفعّل الحدود النيونية + التوهج الناعم */
  active?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

function withAlpha(color: string, alpha: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? `${color}${alpha}` : color;
}

/**
 * GlassCard — بطاقة زجاجية موحدة قابلة لإعادة الاستخدام:
 * BlurView بـ 25px، جسم شفاف (cardBg / cardBgElevated)، حافة علوية لامعة،
 * حدود نيونية ديناميكية (neonBorder من useColors تتبع لون الشاليه النشط)،
 * ودعم RTL عبر direction + الخصائص المنطقية.
 */
export const GlassCard = memo(function GlassCard({
  children,
  style,
  contentStyle,
  accentColor,
  radius,
  intensity = 25,
  elevated = false,
  active = false,
  onPress,
  accessibilityLabel,
  testID,
}: GlassCardProps) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  const isDark = colors.mode === "dark";
  const isInteractive = Boolean(onPress);
  const glass = colors.appTheme.glass;
  const accent = accentColor ?? colors.primary;
  const bg = elevated ? glass.cardBgElevated : glass.cardBg;
  const baseRadius = radius ?? glass.radiusLg;
  const blurIntensity = Math.min(35, Math.max(20, intensity));
  const neonBorder = accentColor ? withAlpha(accent, "66") : colors.neonBorder;
  const borderColor = active ? neonBorder : glass.borderColor;
  const shadow = colors.appTheme.shadow;
  const Container: any = isInteractive ? Pressable : View;

  const containerStyle: ViewStyle = {
    direction,
    backgroundColor: bg,
    borderWidth: 1,
    borderColor,
    borderTopColor: active ? neonBorder : glass.topHighlight,
    borderRadius: baseRadius,
    overflow: "hidden",
    shadowColor: active ? accent : shadow.color,
    shadowOpacity: active ? 0.35 : shadow.opacity,
    shadowRadius: active ? 16 : shadow.radius,
    shadowOffset: { width: 0, height: 8 },
    elevation: shadow.elevation,
  };

  const inner = (
    <>
      {Platform.OS !== "android" ? <BlurView intensity={blurIntensity} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} /> : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.topSheen, { borderTopLeftRadius: baseRadius, borderTopRightRadius: baseRadius }]} />
      {active ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.neonAura, { backgroundColor: `${accent}0F` }]} /> : null}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </>
  );

  if (isInteractive) {
    return (
      <Container
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={({ pressed }: { pressed: boolean }) => [styles.shell, containerStyle, { opacity: pressed ? 0.96 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}
      >
        {inner}
      </Container>
    );
  }

  return (
    <View style={[styles.shell, containerStyle, style as ViewStyle]} testID={testID}>
      {inner}
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
  },
  topSheen: {
    height: "18%",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  neonAura: {
    opacity: 0.5,
  },
  content: {
    position: "relative",
    zIndex: 1,
  },
});