import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

type IconName = ComponentProps<typeof MaterialIcons>["name"];

type SettingsRowProps = {
  icon: IconName;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** A clean glass settings row: icon (start) + title/subtitle + dynamic trailing control (end). */
export function SettingsRow({ icon, title, subtitle, trailing, onPress, disabled = false, accessibilityLabel }: SettingsRowProps) {
  const colors = useColors();
  const { isRTL } = useI18n();
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const content = (
    <>
      <View style={[styles.iconBox, { backgroundColor: disabled ? colors.surfaceMuted : colors.primary + "18" }]}>
        <MaterialIcons name={icon} size={20} color={disabled ? colors.muted : colors.primary} />
      </View>
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: disabled ? colors.muted : colors.foreground, textAlign: align }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.muted, textAlign: align }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      <View style={styles.trailing}>{trailing}</View>
    </>
  );
  if (onPress) {
    return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, { flexDirection: row, opacity: pressed ? 0.68 : disabled ? 0.55 : 1 }]}>{content}</Pressable>;
  }
  return <View style={[styles.row, { flexDirection: row, opacity: disabled ? 0.55 : 1 }]}>{content}</View>;
}

type SettingsSwitchProps = {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  icon?: IconName;
};

/** A switch trailing control in a settings row. */
export function SettingsSwitch({ label, description, value, onChange, disabled = false, icon }: SettingsSwitchProps) {
  const colors = useColors();
  const { isRTL } = useI18n();
  return <SettingsRow icon={icon ?? "settings-suggest"} disabled={disabled} title={label} subtitle={description} trailing={<View style={styles.switchWrap}><AppToggle value={value} onValueChange={onChange} isRTL={isRTL} activeColor={colors.primary} inactiveColor={colors.border} disabled={disabled} accessibilityLabel={label} /></View>} />;
}

/** A static value badge trailing control (e.g. current picker value). */
export function SettingsValueBadge({ label }: { label: string }) {
  const colors = useColors();
  return <View style={[styles.badge, { backgroundColor: colors.primary + "18" }]}><Text numberOfLines={1} style={[styles.badgeText, { color: colors.primary }]}>{label}</Text></View>;
}

type SettingsStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  formatValue?: (value: number) => string;
  disabled?: boolean;
};

/** A compact minus / value / plus control for numeric settings. */
export function SettingsStepper({ value, onChange, min = 0, max = 1000, step = 1, formatValue, disabled = false }: SettingsStepperProps) {
  const colors = useColors();
  const { isRTL } = useI18n();
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next * 100) / 100));
  const stepButton = (direction: -1 | 1) => (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onChange(clamp(value + step * direction))} style={({ pressed }) => [styles.stepButton, { backgroundColor: colors.surfaceMuted, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      <MaterialIcons name={direction === 1 ? "add" : "remove"} size={18} color={colors.foreground} />
    </Pressable>
  );
  return (
    <View style={[styles.stepper, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
      {stepButton(-1)}
      <View style={[styles.stepperValue, { backgroundColor: colors.surfaceMuted }]}><Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: "900", fontSize: 13 }}>{formatValue ? formatValue(value) : String(value)}</Text></View>
      {stepButton(1)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 60, alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 12, paddingHorizontal: 2 },
  iconBox: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  textBlock: { flex: 1, minWidth: 0, marginStart: 2, marginEnd: 2 },
  title: { fontSize: 14, fontWeight: "800", lineHeight: 20 },
  subtitle: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  trailing: { flexShrink: 0, marginStart: 10, marginEnd: 10, alignItems: "flex-end" },
  switchWrap: { width: 50, justifyContent: "center", alignItems: "center" },
  badge: { minHeight: 30, borderRadius: 15, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 12, fontWeight: "900" },
  stepper: { alignItems: "center", gap: 6 },
  stepButton: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  stepperValue: { minWidth: 58, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
});