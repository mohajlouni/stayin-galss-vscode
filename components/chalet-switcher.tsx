import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { useChaletScope } from "@/lib/chalet-scope";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { propertyTypeIcon } from "@/lib/booking-model";

export function ChaletSwitcher() {
  const { chalets } = useBookings();
  const { selectedChalet, selectedChaletId, setSelectedChaletId } = useChaletScope();
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const allLabel = language === "ar" ? "جميع الوحدات" : "All properties";
  const selectedName = selectedChalet?.name ?? allLabel;
  const select = (id: string | null) => { void setSelectedChaletId(id); setOpen(false); };

  return <>
    <GlowGlassCard radius={20} intensity={32} style={styles.triggerGlass}><Pressable accessibilityLabel={language === "ar" ? "تغيير الوحدة الحالية" : "Change current property"} onPress={() => setOpen(true)} style={({ pressed }) => [styles.trigger, { flexDirection: row, opacity: pressed ? 0.72 : 1 }]}>
      <MaterialIcons name={selectedChalet ? propertyTypeIcon(selectedChalet.propertyType) : "home-work"} size={21} color={selectedChalet?.color ?? colors.primary} />
      <View style={styles.flex}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: align }}>{language === "ar" ? "الوحدة الحالية" : "Current property"}</Text><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", marginTop: 2, textAlign: align }}>{selectedName}</Text></View>
      <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.primary} />
    </Pressable></GlowGlassCard>
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <GlowGlassCard radius={28} intensity={36} style={styles.sheet} contentStyle={styles.sheetContent}>
          <View style={[styles.sheetHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 20, textAlign: align }}>{language === "ar" ? "اختيار الوحدة / العقار" : "Choose a property"}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, textAlign: align }}>{language === "ar" ? "تتحدث الشاشات فورًا حسب اختيارك" : "Screens update instantly with your selection"}</Text></View><Pressable onPress={() => setOpen(false)} hitSlop={12} style={styles.close}><MaterialIcons name="close" size={22} color={colors.muted} /></Pressable></View>
          <ScopeRow label={allLabel} icon="home-work" color={colors.primary} selected={!selectedChaletId} onPress={() => select(null)} colors={colors} row={row} align={align} />
          {chalets.map((chalet) => <ScopeRow key={chalet.id} label={chalet.name} icon={propertyTypeIcon(chalet.propertyType)} color={chalet.color} selected={selectedChaletId === chalet.id} onPress={() => select(chalet.id)} colors={colors} row={row} align={align} />)}
          {chalets.length === 0 ? <Text style={{ color: colors.muted, textAlign: align, paddingVertical: 16 }}>{language === "ar" ? "أضف أول وحدة من الإعدادات." : "Add your first property from Settings."}</Text> : null}
        </GlowGlassCard>
      </View>
    </Modal>
  </>;
}

function ScopeRow({ label, icon, color, selected, onPress, colors, row, align }: { label: string; icon: "holiday-village" | "agriculture" | "cabin" | "castle" | "landscape" | "home-work"; color: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof useColors>; row: "row" | "row-reverse"; align: "left" | "right" }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.scopeRow, { flexDirection: row, backgroundColor: selected ? colors.primary : colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={icon} size={19} color={color} /><Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: selected ? "#FFFFFF" : colors.foreground, fontSize: 16, fontWeight: selected ? "800" : "700", textAlign: align }}>{label}</Text>{selected ? <MaterialIcons name="check-circle" size={22} color="#FFFFFF" /> : <View style={styles.trailingSpace} />}</Pressable>;
}

const styles = StyleSheet.create({ triggerGlass: { width: "100%" }, trigger: { width: "100%", minHeight: 58, borderRadius: 20, alignItems: "center", gap: 10, paddingHorizontal: 13 }, flex: { flex: 1, minWidth: 0 }, dot: { width: 11, height: 11, borderRadius: 6, flexShrink: 0 }, backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(3,18,16,0.64)" }, sheet: { width: "100%", borderTopLeftRadius: 28, borderTopRightRadius: 28 }, sheetContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30 }, sheetHeader: { alignItems: "flex-start", gap: 12, marginBottom: 13 }, close: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }, scopeRow: { width: "100%", minHeight: 58, borderRadius: 18, alignItems: "center", gap: 12, paddingHorizontal: 14, marginTop: 8 }, trailingSpace: { width: 22, height: 22 } });
