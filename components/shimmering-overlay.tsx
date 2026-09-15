import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { createContext, useContext, useState } from "react";

type ShimmeringOverlayProps = {
  children?: React.ReactNode;
  accent?: string;
  speed?: number;
  bursting?: boolean;
};

const ShimmeringOverlayContext = createContext<{
  accent: string;
  speed: number;
  bursting: boolean;
}>({
  accent: "#0F8B83",
  speed: 1,
  bursting: false,
});

export const ShimmeringOverlayProvider = ShimmeringOverlayContext.Provider;

export function useShimmeringOverlay() {
  return useContext(ShimmeringOverlayContext);
}

function hexToRgba(hex: string, alpha: number) {
  const parsed = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!parsed) return hex;
  const int = parseInt(parsed[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ShimmeringOverlayInner({ accent = "#0F8B83", speed = 1, bursting = false }: ShimmeringOverlayProps) {
  const animOpacity = useSharedValue(0);

  const breathStyle = useAnimatedStyle(() => {
    return {
      opacity: animOpacity.value,
    };
  });

  useEffect(() => {
    animOpacity.value = withTiming(bursting ? 1 : 0.5, { duration: 400 / Math.max(1, speed) }, () => {
      animOpacity.value = withRepeat(
        withTiming(bursting ? 0.25 : 0.5, { duration: 2200 / Math.max(1, speed) }),
        -1,
        true,
      );
    });
  }, [bursting, speed]);

  return (
    <Animated.View
      collapsable={false}
      pointerEvents="none"
      style={[{ opacity: 0.5, position: "absolute", inset: 0 }, breathStyle]}
    >
      <Animated.View
        style={[styles.ripple, { opacity: animOpacity.value }]}
      />
    </Animated.View>
  );
}

export { ShimmeringOverlayInner };

const styles = StyleSheet.create({
  ripple: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: hexToRgba("#0F8B83", 0.18),
    borderRadius: 999,
  },
});
