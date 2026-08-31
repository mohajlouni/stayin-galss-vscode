import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "@react-navigation/native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useEffect } from "react";

import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";

function withAlpha(color: string, alpha: string) {
  return color.startsWith("#") && color.length === 7 ? `${color}${alpha}` : color;
}

/**
 * DynamicAmbientBackground — Underlay behind all screens featuring soft blurred radial gradient spheres
 * One sphere linked dynamically to activeUnitColor (via colors.primary / colors.neonGlow) and one brand cyan/amber.
 * Uses AppThemeTokens.background canvasGradient, orbPrimary (dynamic), orbSecondary, and glass blur.
 */
export function DynamicAmbientBackground() {
  const colors = useColors();
  const { deviceSettings } = useAppPreferences();
  const isFocused = useIsFocused();
  const isDark = colors.mode === "dark";
  const appBg = colors.appTheme.background;
  const orbPrimary = colors.appTheme.background.orbPrimary;
  const orbSecondary = colors.appTheme.background.orbSecondary;
  const breath = useSharedValue(0.55);

  useEffect(() => {
    if (!isDark || !isFocused || deviceSettings.reduceMotion) {
      cancelAnimation(breath);
      breath.value = 0.6;
      return;
    }
    breath.value = withRepeat(withTiming(0.9, { duration: 5200 }), -1, true);
    return () => cancelAnimation(breath);
  }, [breath, deviceSettings.reduceMotion, isDark, isFocused]);

  const primaryOrbStyle = useAnimatedStyle(() => ({
    opacity: 0.34 * (0.6 + breath.value * 0.4),
    transform: [{ scale: 0.97 + breath.value * 0.06 }],
  }));
  const secondaryOrbStyle = useAnimatedStyle(() => ({
    opacity: 0.28 * (1.05 - breath.value * 0.3),
  }));

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.layer}>
      {/* Canvas شبه شفاف ليظهر اللومة والموجة السائلة خلفها */}
      <LinearGradient colors={isDark ? (["rgba(9,13,22,0.66)", "rgba(15,23,42,0.34)"] as [string, string, ...string[]]) : (["rgba(248,250,252,0.55)", "rgba(238,242,255,0.35)"] as [string, string, ...string[]])} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.base, { backgroundColor: "transparent" }]} />
      <Animated.View style={[styles.orb, styles.orbPrimary, primaryOrbStyle]}>
        <LinearGradient
          colors={[withAlpha(colors.primary, "2E"), withAlpha(orbPrimary, "18"), "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        />
      </Animated.View>
      <Animated.View style={[styles.orb, styles.orbSecondary, secondaryOrbStyle]}>
        <LinearGradient
          colors={[withAlpha(orbSecondary, "1A"), withAlpha(colors.primary, "14"), "transparent"]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.fill}
        />
      </Animated.View>
      <LinearGradient
        colors={isDark ? ["rgba(255,255,255,0.08)", "transparent", "rgba(255,255,255,0.04)"] : ["rgba(255,255,255,0.85)", "transparent", "rgba(255,255,255,0.6)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.7 }}
        style={styles.sheen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: "hidden",
  },
  base: {
    ...StyleSheet.absoluteFillObject,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
    overflow: "hidden",
  },
  orbPrimary: {
    top: "-12%",
    start: "-18%",
    end: undefined,
    width: "72%",
    height: "42%",
  },
  orbSecondary: {
    top: "20%",
    end: "-22%",
    start: undefined,
    width: "60%",
    height: "48%",
  },
  sheen: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
});
