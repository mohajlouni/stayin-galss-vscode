import { Pressable, StyleSheet, View } from "react-native";

type AppToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  isRTL: boolean;
  activeColor: string;
  inactiveColor: string;
  disabled?: boolean;
  accessibilityLabel: string;
};

/** A compact switch with an explicit mirrored thumb position for Arabic RTL layouts. */
export function AppToggle({ value, onValueChange, isRTL, activeColor, inactiveColor, disabled = false, accessibilityLabel }: AppToggleProps) {
  const thumbLeft = isRTL ? (value ? 3 : 25) : (value ? 25 : 3);
  return <Pressable
    accessibilityRole="switch"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ checked: value, disabled }}
    disabled={disabled}
    onPress={() => onValueChange(!value)}
    hitSlop={6}
    style={({ pressed }) => [styles.track, { backgroundColor: value ? activeColor : inactiveColor, opacity: disabled ? 0.48 : pressed ? 0.76 : 1 }]}
  >
    <View style={[styles.thumb, { left: thumbLeft }]} />
  </Pressable>;
}

const styles = StyleSheet.create({
  track: { width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: "center", flexShrink: 0 },
  thumb: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF", elevation: 1 },
});
