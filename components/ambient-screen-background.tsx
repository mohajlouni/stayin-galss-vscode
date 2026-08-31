import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "@react-navigation/native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";

const NEON_OPACITY = {
  standard: { upper: 0.46, lower: 0.34, sheen: 0.22, orb: 0.30, catch: 0.20 },
  quiet: { upper: 0.30, lower: 0.22, sheen: 0.14, orb: 0.16, catch: 0.12 },
  minimal: { upper: 0.18, lower: 0.12, sheen: 0.08, orb: 0.07, catch: 0.06 },
} as const;

function withAlpha(color: string, alpha: string) {
  return color.startsWith("#") && color.length === 7 ? `${color}${alpha}` : color;
}

/**
 * مشهد خلفي Neo-Glassmorphism حيّ: هالات زجاجية ملونة خلف طبقة ضبابية،
 * مع لمعة ضوء علوية ونقشة خفيفة تعطي عمق "زجاج مصنفر" دون تكلفة تفاعل أو رسم زائد.
 * لا يضع أي طبقة فوق المحتوى، وتتوقف الحركة خارج الشاشة المركزة ومع تقليل الحركة.
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

  const accent = colors.primary;
  const orbTints = isDark
    ? [["22", "08"], ["1E", "06"], ["28", "0A"]] as const
    : [["1A", "05"], ["14", "04"], ["1E", "06"]] as const;
  const rim = isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.5)";

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.backgroundLayer}
    >
      {/* قاعدة شفافة حتى تظهر الموجة السائلة المُلونة أدناه */}
      <View style={[styles.base, { backgroundColor: "transparent" }]} />
      {/* هالات زجاجية ملونة خلف الطبقة الضبابية */}
      <View style={[styles.orb, styles.orbTop, { opacity: intensity.orb }]}>
        <LinearGradient colors={[withAlpha(accent, orbTints[0][0]), withAlpha("#5EEAD4", orbTints[0][1]), "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
      </View>
      <View style={[styles.orb, styles.orbSide, { opacity: intensity.orb * 1.1 }]}>
        <LinearGradient colors={[withAlpha("#7DD3FC", orbTints[1][0]), withAlpha(accent, orbTints[1][1]), "transparent"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.fill} />
      </View>
      <View style={[styles.orb, styles.orbBase, { opacity: intensity.orb }]}>
        <LinearGradient colors={[withAlpha("#C4B5FD", orbTints[2][0]), withAlpha(accent, orbTints[2][1]), "transparent"]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.fill} />
      </View>
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
          <View style={[styles.speckles, { opacity: intensity.catch }]}>
            {SPECKLE_CELLS.map((cell) => (
              <View key={cell} style={[styles.speckleCell, styles[`speckle${cell}`]]} />
            ))}
          </View>
          <LinearGradient
            colors={["rgba(7,11,16,0.24)", "transparent", "rgba(7,11,16,0.16)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.contrastVeil}
          />
        </>
      ) : (
        <>
          <LinearGradient
            colors={["rgba(255,255,255,0.92)", withAlpha(colors.primary, "12"), "rgba(248,250,252,0.98)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.glassSheen, { opacity: intensity.sheen * 1.6 }]}
          />
          <View style={[styles.speckles, { opacity: intensity.catch }]}>
            {SPECKLE_CELLS.map((cell) => (
              <View key={cell} style={[styles.speckleCell, styles[`speckle${cell}`]]} />
            ))}
          </View>
        </>
      )}
      {/* لمعة ضوء علوية مائلة — توقيع Neo-Glassmorphism */}
      <LinearGradient
        colors={isDark ? ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.015)", "transparent"] : ["rgba(255,255,255,0.85)", "rgba(255,255,255,0.10)", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.62, y: 0.62 }}
        style={[styles.lightCatch, { opacity: isDark ? intensity.catch : intensity.catch * 1.5 }]}
      />
      <View style={[styles.glassRim, { backgroundColor: rim }]} />
    </View>
  );
}

const SPECKLE_CELLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

const styles = StyleSheet.create({
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: "hidden",
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  // هالات زجاجية ملونة مستوحاة من Neo-Glassmorphism
  orb: {
    position: "absolute",
    borderRadius: 999,
    overflow: "hidden",
  },
  orbTop: {
    top: "-14%",
    left: "-20%",
    width: "70%",
    height: "40%",
  },
  orbSide: {
    top: "18%",
    right: "-24%",
    width: "58%",
    height: "46%",
  },
  orbBase: {
    left: "-18%",
    bottom: "-12%",
    width: "66%",
    height: "44%",
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
  // نقشة خفيفة شبيهة بحبيبات الزجاج المصنفر
  speckles: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  speckleCell: {
    position: "absolute",
    width: 1.2,
    height: 1.2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  speckle1: { top: "8%", left: "12%" },
  speckle2: { top: "13%", left: "38%" },
  speckle3: { top: "6%", left: "64%" },
  speckle4: { top: "19%", left: "86%" },
  speckle5: { top: "27%", left: "24%" },
  speckle6: { top: "33%", left: "72%" },
  speckle7: { top: "45%", left: "8%" },
  speckle8: { top: "52%", left: "48%" },
  speckle9: { top: "58%", left: "88%" },
  speckle10: { top: "67%", left: "18%" },
  speckle11: { top: "74%", left: "58%" },
  speckle12: { top: "82%", left: "34%" },
  speckle13: { top: "88%", left: "76%" },
  speckle14: { top: "94%", left: "14%" },
  speckle15: { top: "38%", left: "94%" },
  speckle16: { top: "29%", left: "55%" },
  contrastVeil: {
    ...StyleSheet.absoluteFillObject,
  },
  // لمعة ضوء علوية مائلة بزاوية استثمار النيون
  lightCatch: {
    position: "absolute",
    top: "-18%",
    left: "-10%",
    width: "90%",
    height: "64%",
    transform: [{ rotate: "18deg" }],
  },
  glassRim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
});