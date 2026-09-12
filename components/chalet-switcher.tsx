import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { useChaletScope } from "@/lib/chalet-scope";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { effectiveWeatherAdvisory, propertyTypeIcon } from "@/lib/booking-model";
import { weatherCodeLabel, weatherIconName } from "@/lib/weather";

const WEATHER_ICONS: Record<ReturnType<typeof weatherIconName>, React.ComponentProps<typeof MaterialIcons>["name"]> = {
  sunny: "wb-sunny",
  "partly-cloudy-day": "cloud",
  cloud: "cloud",
  rainy: "grain",
  snowing: "ac-unit",
  thunderstorm: "thunderstorm",
  foggy: "dehaze",
};

const AMBER = "#F59E0B";
const SLATE_800 = "#1E293B";
const SLATE_200 = "#E2E8F0";
const SLATE_500 = "#64748B";
const SLATE_600 = "#475569";
const AMBER_300 = "#FCD34D";
const AMBER_200 = "#FDE68A";

export function ChaletSwitcher() {
  const { chalets, weatherLogs, settings, expenses = [] } = useBookings();
  const { selectedChalet, selectedChaletId, setSelectedChaletId } = useChaletScope();
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const allLabel = language === "ar" ? "جميع الوحدات" : "All properties";
  const selectedName = selectedChalet?.name ?? allLabel;
  const select = (id: string | null) => { void setSelectedChaletId(id); setOpen(false); };
  const weatherConfig = effectiveWeatherAdvisory(settings);
  const weatherLog = selectedChalet ? weatherLogs?.find((log) => log.chaletId === selectedChalet.id) : undefined;
  const weatherNow = weatherLog?.current;
  const showWeather = weatherConfig.enabled && selectedChalet != null && weatherNow != null && (typeof selectedChalet.latitude === "number" && typeof selectedChalet.longitude === "number");
  const expenseCountFor = (chaletId: string | null) => expenses.filter((expense) => (chaletId === null || expense.chaletId === chaletId)).length;

  return <>
    <GlowGlassCard radius={20} intensity={32} style={styles.triggerGlass}><Pressable accessibilityLabel={language === "ar" ? "تغيير الوحدة الحالية" : "Change current property"} onPress={() => setOpen(true)} style={({ pressed }) => [styles.trigger, { flexDirection: row, opacity: pressed ? 0.72 : 1 }]}>
      <MaterialIcons name={selectedChalet ? propertyTypeIcon(selectedChalet.propertyType) : "home-work"} size={21} color={selectedChalet?.color ?? colors.primary} />
      <View style={styles.flex}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: align }}>{language === "ar" ? "الوحدة الحالية" : "Current property"}</Text><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", marginTop: 2, textAlign: align }}>{selectedName}</Text>{showWeather ? <View style={[styles.weatherSubCell, { flexDirection: row }]}><MaterialIcons name={WEATHER_ICONS[weatherIconName(weatherNow.weatherCode)]} size={10} color={colors.muted} /><Text numberOfLines={1} style={[styles.weatherSubText, { color: colors.muted, textAlign: align }]}>{Math.round(weatherNow.temperature)}° · {weatherCodeLabel(weatherNow.weatherCode, language)}</Text></View> : null}</View>
      <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.primary} />
    </Pressable></GlowGlassCard>
    <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: "#000000", shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: -8 }, elevation: 50 }]}>
          <View style={[styles.sheetHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 20, textAlign: align }}>{language === "ar" ? "اختيار الوحدة / العقار" : "Choose a property"}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, textAlign: align }}>{language === "ar" ? "تتحدث الشاشات فورًا حسب اختيارك" : "Screens update instantly with your selection"}</Text></View><Pressable onPress={() => setOpen(false)} hitSlop={12} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={22} color={colors.muted} /></Pressable></View>
          <View style={[styles.dragHandle, { backgroundColor: colors.muted + "33" }]} />
          <ScrollView showsVerticalScrollIndicator={false} style={styles.list} contentContainerStyle={styles.listContent}>
            <UnitOptionCard label={allLabel} icon="home-work" color={colors.primary} selected={!selectedChaletId} count={expenseCountFor(null)} onPress={() => select(null)} />
            {chalets.map((chalet) => <UnitOptionCard key={chalet.id} label={chalet.name} icon={propertyTypeIcon(chalet.propertyType)} color={chalet.color} selected={selectedChaletId === chalet.id} count={expenseCountFor(chalet.id)} onPress={() => select(chalet.id)} />)}
            {chalets.length === 0 ? <Text style={{ color: colors.muted, textAlign: align, paddingVertical: 16 }}>{language === "ar" ? "أضف أول وحدة من الإعدادات." : "Add your first property from Settings."}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

function UnitOptionCard({ label, icon, color, selected, count, onPress }: { label: string; icon: "holiday-village" | "agriculture" | "cabin" | "castle" | "landscape" | "home-work"; color: string; selected: boolean; count: number; onPress: () => void }) {
  const { isRTL, language } = useI18n();
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const expenseLabel = language === "ar" ? "مصروف" : (count === 1 ? "expense" : "expenses");
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.option, { flexDirection: row, backgroundColor: selected ? AMBER + "1A" : "rgba(15,23,42,0.8)", borderColor: selected ? AMBER + "CC" : SLATE_800, shadowColor: selected ? AMBER : "transparent", shadowOpacity: selected ? 0.3 : 0, shadowRadius: selected ? 4 : 0, shadowOffset: { width: 0, height: 0 }, elevation: selected ? 2 : 0, opacity: pressed ? 0.72 : 1 }]}>
    <View style={[styles.optionIcon, { backgroundColor: selected ? AMBER + "14" : "rgba(15,23,42,0.5)", borderColor: selected ? AMBER + "55" : SLATE_800 }]}><MaterialIcons name={icon} size={19} color={selected ? AMBER_300 : color} /></View>
    <View style={styles.flex}><Text numberOfLines={1} style={{ color: selected ? AMBER_300 : SLATE_200, fontSize: 16, fontWeight: "800", textAlign: align }}>{label}</Text><Text numberOfLines={1} style={{ color: selected ? AMBER_200 : SLATE_500, fontSize: 11, fontWeight: "700", marginTop: 3, textAlign: align }}>{language === "ar" ? `${count} ${expenseLabel}` : `${count} ${expenseLabel}`}</Text></View>
    <MaterialIcons name={selected ? "radio-button-checked" : "radio-button-unchecked"} size={20} color={selected ? AMBER_300 : SLATE_600} />
  </Pressable>;
}

const styles = StyleSheet.create({
  triggerGlass: { width: "100%" }, trigger: { width: "100%", minHeight: 58, borderRadius: 20, alignItems: "center", gap: 10, paddingHorizontal: 13 }, flex: { flex: 1, minWidth: 0 }, dot: { width: 11, height: 11, borderRadius: 6, flexShrink: 0 }, weatherSubCell: { marginTop: 2, alignSelf: "flex-start", minHeight: 15, borderRadius: 7, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 6, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 3, maxWidth: "100%" }, weatherSubText: { fontSize: 9, fontWeight: "700", flexShrink: 1, marginStart: 0, marginEnd: 0 }, backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(3,18,16,0.64)" }, sheet: { width: "100%", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1 }, sheetHeader: { alignItems: "flex-start", gap: 12, marginBottom: 8, paddingTop: 20, paddingHorizontal: 18 }, dragHandle: { width: 44, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 0, marginBottom: 8 }, close: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }, list: { maxHeight: 360 }, listContent: { paddingHorizontal: 18, paddingBottom: 44 }, option: { minHeight: 62, borderRadius: 12, borderWidth: 1, alignItems: "center", gap: 12, paddingHorizontal: 13, paddingVertical: 10, marginTop: 8, flexShrink: 0 }, optionIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, flexShrink: 0 }, trailingSpace: { width: 22, height: 22 } });