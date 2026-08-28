import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { useI18n } from "@/lib/i18n";
import { RipplePressable } from "@/components/ripple-pressable";

type ScreenBackButtonProps = {
  fallbackHref?: Href;
  /** Uses the fallback directly instead of the stack, for screens with one mandated parent destination. */
  returnToFallback?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
};

const fallbackDestinations = {
  "/": { ar: "الرئيسية", en: "Home" },
  "/(tabs)/more": { ar: "المزيد", en: "More" },
  "/(tabs)/bookings": { ar: "الحجوزات", en: "Bookings" },
  "/(tabs)/reports": { ar: "التقارير", en: "Reports" },
  "/chalet-management": { ar: "إدارة الوحدات", en: "Property management" },
} as const;

/** A consistent, RTL-aware return action for independent application screens. */
export function ScreenBackButton({ fallbackHref = "/", returnToFallback = false, label, style, onPress }: ScreenBackButtonProps) {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { triggerHaptic } = useAppPreferences();
  const [isHovered, setIsHovered] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const backLabel = label ?? (language === "ar" ? "رجوع" : "Back");
  const row = isRTL ? "row-reverse" : "row";
  const fallbackPath = typeof fallbackHref === "string" ? fallbackHref : "";
  const destination = fallbackDestinations[fallbackPath as keyof typeof fallbackDestinations]?.[language === "ar" ? "ar" : "en"];
  const tooltipLabel = destination
    ? (language === "ar" ? `العودة إلى ${destination}` : `Return to ${destination}`)
    : (language === "ar" ? "العودة إلى الشاشة السابقة" : "Return to the previous screen");
  const accessibilityHint = destination
    ? (returnToFallback ? (language === "ar" ? `يعيدك مباشرةً إلى ${destination}.` : `Returns directly to ${destination}.`) : (language === "ar" ? `يعيدك إلى ${destination} عند عدم وجود شاشة سابقة.` : `Returns to ${destination} when there is no previous screen.`))
    : (language === "ar" ? "يعيدك إلى الشاشة السابقة." : "Returns to the previous screen.");

  const goBack = () => {
    void triggerHaptic();
    if (onPress) {
      onPress();
      return;
    }
    if (returnToFallback) router.replace(fallbackHref);
    else if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  };

  return <RipplePressable accessibilityRole="button" accessibilityLabel={backLabel} accessibilityHint={accessibilityHint} rippleColor={colors.primary + "2B"} onPress={goBack} onHoverIn={() => { setIsHovered(true); setShowHint(true); }} onHoverOut={() => { setIsHovered(false); setShowHint(false); }} onLongPress={() => setShowHint(true)} onPressOut={() => setShowHint(false)} style={({ pressed }) => [styles.button, { backgroundColor: isHovered ? colors.primary + "18" : colors.glassInset, flexDirection: row, opacity: pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.97 : isHovered ? 1.02 : 1 }] }, style]}>{showHint ? <Text pointerEvents="none" style={[styles.tooltip, { backgroundColor: colors.foreground, color: colors.background, textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr", [isRTL ? "right" : "left"]: 0 }]}>{tooltipLabel}</Text> : null}<MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900" }}>{backLabel}</Text></RipplePressable>;
}

const styles = StyleSheet.create({ button: { minHeight: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, gap: 4, flexShrink: 0, position: "relative", overflow: "visible" }, tooltip: { position: "absolute", top: -38, minHeight: 30, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7, fontSize: 11, fontWeight: "800", lineHeight: 16, maxWidth: 210, zIndex: 20, elevation: 6 } });
