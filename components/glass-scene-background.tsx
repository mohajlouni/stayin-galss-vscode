import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import Svg, { Defs, Ellipse, FeGaussianBlur, Filter, Line, RadialGradient, Stop } from "react-native-svg";
import Animated, { cancelAnimation, useAnimatedProps, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { hexToRgba, useMorphingAccent } from "@/hooks/use-morphing-accent";

/** القاعدة الصلبة الفاخرة (Obsidian deep) للخلفية الموحّدة. */
const BASE = "#080C14";

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedStop = Animated.createAnimatedComponent(Stop);

/** الشبكة الهندسية: خطوط رأسية كل 48 وأفقية كل 60، وخطوط رئيسية كل 240/300. */
const GRID_V = Array.from({ length: 11 }, (_, i) => i * 48);
const GRID_H = Array.from({ length: 16 }, (_, i) => i * 60);
const GRID_V_MAJOR = [240];
const GRID_H_MAJOR = [300, 600];

const GRID_STROKE_MINOR = "rgba(255, 255, 255, 0.03)";
const GRID_STROKE_MAJOR = "rgba(255, 255, 255, 0.05)";

/**
 * GlassSceneBackground — الخلفية الديناميكية الموحّدة (Dynamic Ambient Grid):
 * قاعدة عميقة صامتة #080C14، شبكة هندسية رفيعة (stroke 0.5 / شفافية 3%)،
 * وهالة محيطية ضخمة في الأسفل تبث لون الشاليه النشط على نحوٍ سلس ومُتنفِّس
 * عبر reanimated — كإشعاع محيطي فاخر. لا صناديق ولا صور.
 */
export function GlassSceneBackground() {
  const colors = useColors();
  const { deviceSettings } = useAppPreferences();
  const isFocused = useIsFocused();
  const accent = colors.primary;
  const isDark = colors.mode === "dark";
  const breathe = useSharedValue(0.5);

  const morphGlow = useMorphingAccent(accent, isDark ? 0.5 : 0.24);
  const morphCore = useMorphingAccent(accent, isDark ? 0.34 : 0.16);

  useEffect(() => {
    if (deviceSettings.reduceMotion || !isFocused) {
      cancelAnimation(breathe);
      breathe.value = 0.6;
      return;
    }
    breathe.value = withRepeat(withTiming(0.96, { duration: 9000 }), -1, true);
    return () => cancelAnimation(breathe);
  }, [breathe, deviceSettings.reduceMotion, isFocused]);

  const auraProps = useAnimatedProps(() => {
    const scale = 0.9 + breathe.value * 0.16;
    return {
      opacity: (isDark ? 0.9 : 0.7) * (0.72 + breathe.value * 0.32),
      transform: `translate(0 ${breathe.value * -26 + 10}) scale(${scale})`,
    };
  });
  const coreProps = useAnimatedProps(() => {
    const scale = 0.92 + breathe.value * 0.14;
    return {
      opacity: (isDark ? 0.85 : 0.6) * (0.7 + breathe.value * 0.3),
      transform: `translate(0 ${breathe.value * -18 + 6}) scale(${scale})`,
    };
  });

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.layer}>
      <View style={styles.canvas}>
        <Svg width="100%" height="100%" viewBox="0 0 480 900" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <Filter id="gridAura" x="-200%" y="-200%" width="600%" height="600%">
              <FeGaussianBlur stdDeviation="90" />
            </Filter>
            <Filter id="gridAuraCore" x="-160%" y="-160%" width="480%" height="480%">
              <FeGaussianBlur stdDeviation="70" />
            </Filter>
            <RadialGradient id="gridGlow" cx="50%" cy="98%" r="72%">
              <AnimatedStop offset="0" animatedProps={morphGlow.stopProps} stopOpacity={1} />
              <Stop offset="0.5" stopColor="#00000000" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="gridCore" cx="50%" cy="100%" r="58%">
              <AnimatedStop offset="0" animatedProps={morphCore.stopProps} stopOpacity={1} />
              <Stop offset="0.62" stopColor="#00000000" stopOpacity={0} />
            </RadialGradient>
          </Defs>

          {/* الشبكة الهندسية الخافتة */}
          {GRID_V.map((x) => <Line key={`gv-${x}`} x1={x} y1={0} x2={x} y2={900} stroke={GRID_STROKE_MINOR} strokeWidth={0.5} />)}
          {GRID_H.map((y) => <Line key={`gh-${y}`} x1={0} y1={y} x2={480} y2={y} stroke={GRID_STROKE_MINOR} strokeWidth={0.5} />)}
          {GRID_V_MAJOR.map((x) => <Line key={`gvm-${x}`} x1={x} y1={0} x2={x} y2={900} stroke={GRID_STROKE_MAJOR} strokeWidth={0.5} />)}
          {GRID_H_MAJOR.map((y) => <Line key={`ghm-${y}`} x1={0} y1={y} x2={480} y2={y} stroke={GRID_STROKE_MAJOR} strokeWidth={0.5} />)}

          {/* الهالة المحيطية الضخمة في الأسفل — ضباب feGaussianBlur عميق */}
          <AnimatedEllipse cx={240} cy={890} rx={520} ry={430} fill="url(#gridGlow)" filter="url(#gridAura)" animatedProps={auraProps} />
          <AnimatedEllipse cx={240} cy={902} rx={380} ry={315} fill="url(#gridCore)" filter="url(#gridAuraCore)" animatedProps={coreProps} />

          {/* لمعة زجاجية سفلية رفيعة */}
          <Ellipse cx={240} cy={906} rx={250} ry={44} fill={hexToRgba("#FFFFFF", 0.045)} filter="url(#gridAura)" />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: "hidden",
    backgroundColor: BASE,
  },
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
});