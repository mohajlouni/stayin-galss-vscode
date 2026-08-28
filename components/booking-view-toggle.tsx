import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { useColors } from "@/hooks/use-colors";
import type { BookingCardViewMode } from "@/lib/booking-model";
import { useI18n } from "@/lib/i18n";

type BookingViewToggleProps = {
  value: BookingCardViewMode;
  onChange: (value: BookingCardViewMode) => void;
  accentColor?: string;
};

/** Compact, adjacent control for switching booking cards between the detailed and summary views. */
export function BookingViewToggle({ value, onChange, accentColor: _accentColor }: BookingViewToggleProps) {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const accent = colors.primary;
  const row = isRTL ? "row-reverse" : "row";
  const options: { value: BookingCardViewMode; label: string; icon: "view-agenda" | "view-compact" }[] = [
    { value: "expanded", label: language === "ar" ? "موسع" : "Full", icon: "view-agenda" },
    { value: "compact", label: language === "ar" ? "مختصر" : "Brief", icon: "view-compact" },
  ];

  return (
    <View accessibilityLabel={language === "ar" ? "طريقة عرض بطاقات الحجوزات" : "Booking card view"} style={[styles.container, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={language === "ar" ? `عرض ${option.label}` : `${option.label} view`}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.option, { backgroundColor: selected ? accent : "transparent", opacity: pressed ? 0.66 : 1 }]}
          >
            <MaterialIcons name={option.icon} size={17} color={selected ? "#FFFFFF" : colors.muted} />
            <Text numberOfLines={1} style={{ color: selected ? "#FFFFFF" : colors.muted, fontSize: 10, fontWeight: "900", writingDirection: isRTL ? "rtl" : "ltr" }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 132, minHeight: 58, borderRadius: 20, padding: 4, alignItems: "stretch", gap: 3, flexShrink: 0 },
  option: { flex: 1, minWidth: 0, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 4 },
});
