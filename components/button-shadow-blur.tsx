import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

type ButtonShadowBlurProps = {
  children: React.ReactNode;
  scale?: number;
  rotate?: string;
  blink?: boolean;
  style?: object;
};

export function ButtonShadowBlur({ children, scale = 1, rotate = "0deg", blink = false, style }: ButtonShadowBlurProps) {
  const animatedStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      transform: [
        { scale: withTiming(scale, { duration: 200 }) },
        { translateY: withTiming(blink ? 0 : -12, { duration: 200 }) },
        { rotate: withTiming(rotate, { duration: 200 }) },
      ],
    };
  });

  return (
    <View
      collapsable={false}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        ...style,
      }}
    >
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({});
