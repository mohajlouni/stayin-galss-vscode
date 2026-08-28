import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { Href } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { RipplePressable } from "@/components/ripple-pressable";
import { ScreenBackButton } from "@/components/screen-back-button";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

type HeaderAction = {
  label: string;
  icon?: React.ComponentProps<typeof MaterialIcons>["name"];
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
};

type SubScreenHeaderProps = {
  title: string;
  fallbackHref?: Href;
  action?: HeaderAction;
};

/** Compact shared header for management screens: mandatory return, direct title, and optional primary action. */
export function SubScreenHeader({ title, fallbackHref = "/(tabs)/more", action }: SubScreenHeaderProps) {
  const colors = useColors();
  const { isRTL } = useI18n();
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";

  return <View style={[styles.wrap, { flexDirection: row }]}>
    <ScreenBackButton fallbackHref={fallbackHref} returnToFallback />
    <Text numberOfLines={1} style={[styles.title, { color: colors.foreground, textAlign: align }]}>{title}</Text>
    {action ? <RipplePressable accessibilityRole="button" accessibilityLabel={action.accessibilityLabel ?? action.label} disabled={action.disabled} rippleColor="#FFFFFF3D" onPress={action.onPress} style={({ pressed }) => [styles.action, { backgroundColor: colors.primary, opacity: pressed || action.disabled ? 0.58 : 1, flexDirection: row }]}>{action.icon ? <MaterialIcons name={action.icon} size={17} color="#FFFFFF" /> : null}<Text numberOfLines={1} style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "900" }}>{action.label}</Text></RipplePressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { minHeight: 48, alignItems: "center", gap: 10, marginBottom: 10 },
  title: { flex: 1, minWidth: 0, fontSize: 20, fontWeight: "900" },
  action: { minHeight: 40, maxWidth: 142, borderRadius: 15, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", gap: 5, flexShrink: 1 },
});
