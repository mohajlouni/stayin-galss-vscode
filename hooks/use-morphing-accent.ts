import { useEffect } from "react";
import { Easing, interpolateColor, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";

import { useAppPreferences } from "@/lib/app-preferences";

/** يحوّل لون hex إلى rgba بصيغة reanimated-supported. */
export function hexToRgba(color: string, alpha: number): string {
  const hex = /^#([0-9A-Fa-f]{6})$/.exec(color);
  if (!hex) return color;
  const int = parseInt(hex[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type MorphResult = {
  /** props لمسار/دائرة: stroke/fill مع اللون المتغير */
  rgbProps: { stroke?: string; fill?: string };
  /** props لـ stroke فقط (حلقات/خطوط بدون ملء) */
  strokeProps: { stroke?: string };
  /** props لـ <Stop> داخل التدرج */
  stopProps: { stopColor?: string };
};

/**
 * useMorphingAccent — انزياح لوني سلس (hue melt):
 * عندما يتغير لون الشاليه النشط، يذوب اللون تدريجياً من القديم إلى الجديد
 * داخل react-native-reanimated ليُستخدم مع SVG (Animated components).
 * مع "تقليل الحركة" ينتقل فورياً.
 */
export function useMorphingAccent(accent: string, alpha: number): MorphResult {
  const { deviceSettings } = useAppPreferences();
  const reduceMotion = Boolean(deviceSettings.reduceMotion);

  const colorA = hexToRgba(accent, alpha);
  const from = useSharedValue(colorA);
  const target = useSharedValue(colorA);
  const progress = useSharedValue(1);

  useEffect(() => {
    const next = hexToRgba(accent, alpha);
    if (next === target.value) return;
    from.value = target.value;
    target.value = next;
    progress.value = 0;
    progress.value = withTiming(1, { duration: reduceMotion ? 0 : 850, easing: Easing.inOut(Easing.quad) });
  }, [accent, alpha, reduceMotion, from, target, progress]);

  const rgbProps = useAnimatedProps(() => {
    const color = interpolateColor(progress.value, [0, 1], [from.value, target.value]);
    return { stroke: color, fill: color };
  });
  const strokeProps = useAnimatedProps(() => {
    const color = interpolateColor(progress.value, [0, 1], [from.value, target.value]);
    return { stroke: color };
  });
  const stopProps = useAnimatedProps(() => {
    const color = interpolateColor(progress.value, [0, 1], [from.value, target.value]);
    return { stopColor: color };
  });

  return { rgbProps, strokeProps, stopProps };
}