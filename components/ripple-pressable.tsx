import { Pressable, StyleSheet, type PressableProps } from "react-native";

type RipplePressableProps = PressableProps & {
  rippleColor?: string;
};

/** Pressable with a bounded Android ripple and a subtle cross-platform pressed fallback. */
export function RipplePressable({ android_ripple, children, rippleColor = "#FFFFFF2E", style, ...props }: RipplePressableProps) {
  return <Pressable {...props} android_ripple={android_ripple ?? { color: rippleColor, borderless: false, foreground: true }} style={(state) => [typeof style === "function" ? style(state) : style, state.pressed && styles.pressed]}>{children}</Pressable>;
}

const styles = StyleSheet.create({ pressed: { opacity: 0.82 } });
