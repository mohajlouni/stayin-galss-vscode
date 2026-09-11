import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { CalendarDateField } from "@/components/calendar-date-picker";
import { useColors } from "@/hooks/use-colors";
import { weekdayLabel } from "@/lib/booking-model";
import { useAppPreferences } from "@/lib/app-preferences";
import { useI18n } from "@/lib/i18n";

export type DateRange = { start: string; end: string };

function longDate(value: string, language: "ar" | "en", formatDate: (date: string) => string) {
  return `${weekdayLabel(value, language)}، ${formatDate(value)}`;
}

export function DateRangePicker({ visible, start, end, onApply, onClose }: { visible: boolean; start: string; end: string; onApply: (range: DateRange) => void; onClose: () => void }) {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { formatDate } = useAppPreferences();
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);

  useEffect(() => {
    if (visible) {
      setDraftStart(start);
      setDraftEnd(end);
    }
  }, [end, start, visible]);

  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={[styles.backdrop, { zIndex: 50, elevation: 50 }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.header, { flexDirection: row }]}>
          <View style={[styles.titleIcon, { backgroundColor: colors.primary + "1A" }]}><MaterialIcons name="date-range" size={18} color={colors.primary} /></View>
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تحديد الفترة الزمنية" : "Select time period"}</Text>
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "اختر تاريخ البداية والنهاية من التقويم" : "Select start and end dates from the calendar"}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable>
        </View>
        <View style={[styles.field, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><CalendarDateField label={language === "ar" ? "من تاريخ" : "From"} value={draftStart} onChange={setDraftStart} /></View>
        <View style={[styles.field, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><CalendarDateField label={language === "ar" ? "إلى تاريخ" : "To"} value={draftEnd} onChange={setDraftEnd} /></View>
        <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? "النطاق الحالي" : "Current range"}: {longDate(draftStart, language, formatDate)} — {longDate(draftEnd, language, formatDate)}</Text>
        <View style={[styles.actions, { flexDirection: row }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إلغاء" : "Cancel"} onPress={onClose} style={[styles.cancel, { borderColor: colors.border }]}><MaterialIcons name="close" size={15} color={colors.muted} /><Text style={{ color: colors.foreground, fontWeight: "800" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تطبيق الفلترة" : "Apply filter"} onPress={() => onApply({ start: draftStart, end: draftEnd })} style={[styles.apply, { backgroundColor: "#F59E0B" }]}><MaterialIcons name="check" size={17} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{language === "ar" ? "تطبيق الفلترة" : "Apply filter"}</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 380, borderRadius: 16, borderWidth: 1, padding: 20, gap: 14 },
  header: { alignItems: "center", gap: 10 },
  titleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  flex: { flex: 1, minWidth: 0 },
  close: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  field: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 6, overflow: "hidden" },
  actions: { gap: 9, marginTop: 2 },
  apply: { flex: 1, minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  cancel: { minWidth: 106, minHeight: 46, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
});