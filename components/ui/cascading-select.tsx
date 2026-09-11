import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { RipplePressable } from "@/components/ripple-pressable";
import { useColors } from "@/hooks/use-colors";

type IconName = keyof typeof MaterialIcons.glyphMap;

/**
 * مشغّل قائمة منسدلة مدمج — نسخة موحّدة من بنية المصروفات المتتالية:
 * حقل ضغط مدمج يفتح لوحة خيارات سفلية، بلا بطاقات أو أزرار راديو.
 */
export function CascadingSelectField({ value, placeholder, error, icon, onPress, colors, language }: { value: string | null; placeholder: string; error: boolean; icon?: IconName; onPress: () => void; colors: ReturnType<typeof useColors>; language: "ar" | "en" }) {
  const isArabic = language === "ar";
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.field, { borderColor: error ? "#F43F5E" : colors.border, backgroundColor: colors.surfaceMuted, flexDirection: isArabic ? "row-reverse" : "row", opacity: pressed ? 0.72 : 1 }]}>{icon ? <MaterialIcons name={icon} size={17} color={error ? "#F43F5E" : colors.primary} /> : null}<Text numberOfLines={1} style={{ flex: 1, color: value ? colors.foreground : colors.muted, fontSize: 12, fontWeight: value ? "800" : "700", textAlign: isArabic ? "right" : "left" }}>{value ?? placeholder}</Text><MaterialIcons name="keyboard-arrow-down" size={20} color={colors.muted} /></Pressable>;
}

/** لوحة الخيارات السفلية الموحّدة المفتوحة من حقل قائمة منسدلة متتالية. */
export function CascadingSelectSheet({ visible, title, options, selectedKey, onSelect, onCancel, colors, language }: { visible: boolean; title: string; options: { key: string; label: string; icon?: IconName }[]; selectedKey: string | null; onSelect: (key: string) => void; onCancel: () => void; colors: ReturnType<typeof useColors>; language: "ar" | "en" }) {
  const isArabic = language === "ar";
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: "#000000", shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: -8 }, elevation: 50 }]}><View style={[styles.header, { flexDirection: isArabic ? "row-reverse" : "row" }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: isArabic ? "right" : "left" }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: isArabic ? "right" : "left" }}>{language === "ar" ? "اختر واحدًا من الخيارات" : "Pick one option"}</Text></View><Pressable accessibilityRole="button" onPress={onCancel} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={18} color={colors.muted} /></Pressable></View><ScrollView showsVerticalScrollIndicator={false}>{options.map((option) => { const active = option.key === selectedKey; return <Pressable key={option.key} accessibilityRole="button" onPress={() => onSelect(option.key)} style={({ pressed }) => [styles.option, { backgroundColor: active ? colors.primary + "12" : "transparent", borderColor: active ? colors.primary + "55" : colors.border, flexDirection: isArabic ? "row-reverse" : "row", opacity: pressed ? 0.72 : 1 }]}>{option.icon ? <MaterialIcons name={option.icon} size={18} color={active ? colors.primary : colors.muted} /> : null}<Text style={{ flex: 1, color: active ? colors.primary : colors.foreground, fontSize: 13, fontWeight: active ? "900" : "700", textAlign: isArabic ? "right" : "left" }}>{option.label}</Text>{active ? <MaterialIcons name="check-circle" size={17} color={colors.primary} /> : null}</Pressable>; })}</ScrollView><RipplePressable rippleColor={colors.background + "3D"} onPress={onCancel} style={({ pressed }) => [styles.cancel, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="close" size={16} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, fontWeight: "900" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></RipplePressable></View></View></Modal>;
}

const styles = StyleSheet.create({
  field: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", gap: 8, marginTop: 9 },
  backdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.92)", justifyContent: "flex-end" },
  sheet: { maxHeight: "78%", borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 24 },
  header: { alignItems: "center", gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  close: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  option: { minHeight: 50, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, alignItems: "center", gap: 9, marginTop: 8 },
  cancel: { minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, flexDirection: "row" },
});