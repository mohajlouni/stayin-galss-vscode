import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "@react-navigation/native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";

const NEON_OPACITY = {
  standard: { upper: 0.46, lower: 0.34, sheen: 0.22 },
  quiet: { upper: 0.30, lower: 0.22, sheen: 0.14 },
  minimal: { upper: 0.18, lower: 0.12, sheen: 0.08 },
} as const;

function withAlpha(color: string, alpha: string) {
  return color.startsWith("#") && color.length === 7 ? `${color}${alpha}` : color;
}

/**
 * مشهد خلفي زجاجي حيّ، مشتق من لون الوحدة النشطة ولا يضع أي طبقة تفاعلية فوق المحتوى.
 * الحركة تتوقف خارج الشاشة المركزة ومع تفضيل تقليل الحركة لتبقى كلفتها منخفضة على Android.
 */
export function AmbientScreenBackground() {
  const { deviceSettings } = useAppPreferences();
  const colors = useColors();
  const isFocused = useIsFocused();
  const isDark = colors.background === "#070B10";
  const intensity = NEON_OPACITY[deviceSettings.glassBackgroundLevel];
  const breath = useSharedValue(0.52);

  useEffect(() => {
    if (!isDark || !isFocused || deviceSettings.reduceMotion) {
      cancelAnimation(breath);
      breath.value = 0.58;
      return;
    }

    breath.value = withRepeat(withTiming(0.88, { duration: 5400 }), -1, true);
    return () => cancelAnimation(breath);
  }, [breath, deviceSettings.reduceMotion, isDark, isFocused]);

  const upperBloomStyle = useAnimatedStyle(() => ({
    opacity: intensity.upper * (0.56 + breath.value * 0.44),
    transform: [{ scale: 0.98 + breath.value * 0.05 }],
  }));
  const lowerBloomStyle = useAnimatedStyle(() => ({
    opacity: intensity.lower * (1.06 - breath.value * 0.32),
  }));

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.backgroundLayer}
    >
      <View style={[styles.base, { backgroundColor: colors.background }]} />
      {isDark ? (
        <>
          <Animated.View style={[styles.upperBloom, upperBloomStyle]}>
            <LinearGradient
              colors={[withAlpha(colors.primary, "66"), withAlpha(colors.primary, "20"), "transparent"]}
              start={{ x: 0.12, y: 0 }}
              end={{ x: 0.86, y: 1 }}
              style={styles.fill}
            />
          </Animated.View>
          <Animated.View style={[styles.lowerBloom, lowerBloomStyle]}>
            <LinearGradient
              colors={["transparent", withAlpha(colors.primary, "18"), withAlpha(colors.primary, "4D")]}
              start={{ x: 0.42, y: 0 }}
              end={{ x: 0.58, y: 1 }}
              style={styles.fill}
            />
          </Animated.View>
          <LinearGradient
            colors={["rgba(255,255,255,0.025)", withAlpha(colors.primary, "14"), "rgba(255,255,255,0.012)"]}
            start={{ x: 0, y: 0.08 }}
            end={{ x: 1, y: 0.92 }}
            style={[styles.glassSheen, { opacity: intensity.sheen }]}
          />
          <View style={styles.glassMesh} />
          <LinearGradient
            colors={["rgba(7,11,16,0.24)", "transparent", "rgba(7,11,16,0.16)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.contrastVeil}
          />
        </>
      ) : (
        <LinearGradient
          colors={["rgba(255,255,255,0.92)", withAlpha(colors.primary, "12"), "rgba(248,250,252,0.98)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: "hidden",
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#070B10",
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  upperBloom: {
    position: "absolute",
    top: "-16%",
    left: "-26%",
    width: "116%",
    height: "52%",
    borderRadius: 999,
  },
  lowerBloom: {
    position: "absolute",
    right: "-30%",
    bottom: "-14%",
    width: "124%",
    height: "50%",
    borderRadius: 999,
  },
  glassSheen: {
    ...StyleSheet.absoluteFillObject,
  },
  glassMesh: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "42%",
    backgroundColor: "rgba(255,255,255,0.012)",
  },
  contrastVeil: {
    ...StyleSheet.absoluteFillObject,
  },
});
