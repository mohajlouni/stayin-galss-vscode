import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, View } from "react-native";

import { RipplePressable } from "@/components/ripple-pressable";
import type { ThemeColorPalette } from "@/constants/theme";
import { useAppPreferences } from "@/lib/app-preferences";

type BookingQuickActionsProps = {
  language: "ar" | "en";
  colors: ThemeColorPalette;
  themeColor: string;
  onWhatsApp: () => void;
  onCall: () => void;
  onDetails: () => void;
  operationalAction?: { label: string; icon: "login" | "logout" | "person-off"; color: string; onPress: () => void; disabled?: boolean };
};

export function BookingQuickActions({ language, colors, themeColor, onWhatsApp, onCall, onDetails, operationalAction }: BookingQuickActionsProps) {
  const row = language === "ar" ? "row-reverse" : "row";
  const { triggerHaptic } = useAppPreferences();
  return <View>{operationalAction ? <RipplePressable accessibilityRole="button" accessibilityLabel={operationalAction.label} disabled={operationalAction.disabled} rippleColor={themeColor + "2E"} onPress={() => { void triggerHaptic(); operationalAction.onPress(); }} style={[styles.operation, { backgroundColor: colors.glassInset, borderColor: themeColor + "52", opacity: operationalAction.disabled ? 0.5 : 1 }]}><MaterialIcons name={operationalAction.icon} size={18} color={themeColor} /><Text style={[styles.operationText, { color: themeColor }]}>{operationalAction.label}</Text></RipplePressable> : null}<View style={[styles.row, { flexDirection: row }]}>
    <QuickAction label={language === "ar" ? "واتساب" : "WhatsApp"} icon="whatsapp" textColor="#34D399" surfaceColor={colors.glassInset} onPress={() => { void triggerHaptic(); onWhatsApp(); }} />
    <QuickAction label={language === "ar" ? "اتصال" : "Call"} icon="phone" textColor="#38BDF8" surfaceColor={colors.glassInset} onPress={onCall} />
    <QuickAction label={language === "ar" ? "التفاصيل" : "Details"} icon="description" textColor={colors.primary} surfaceColor={colors.glassInset} onPress={onDetails} />
  </View></View>;
}

function QuickAction({ label, icon, textColor, surfaceColor, onPress }: { label: string; icon: "whatsapp" | "phone" | "description"; textColor: string; surfaceColor: string; onPress: () => void }) {
  return <RipplePressable accessibilityRole="button" accessibilityLabel={label} rippleColor={textColor + "24"} onPress={onPress} style={[styles.action, { backgroundColor: surfaceColor }]}>{icon === "whatsapp" ? <FontAwesome name="whatsapp" size={17} color={textColor} /> : <MaterialIcons name={icon} size={16} color={textColor} />}<Text style={[styles.actionText, { color: textColor }]}>{label}</Text></RipplePressable>;
}

const styles = StyleSheet.create({
  row: { gap: 8, marginTop: 8 },
  operation: { minHeight: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 7, marginTop: 12, overflow: "hidden" },
  operationText: { fontSize: 13, fontWeight: "900", writingDirection: "rtl" },
  action: { flex: 1, minHeight: 43, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  actionText: { fontSize: 11, fontWeight: "900" },
});
