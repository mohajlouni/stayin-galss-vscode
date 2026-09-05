import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { Booking, Chalet, Settings, chaletPerformanceSummary, formatMoney, propertyTypeIcon, propertyTypeLabel } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";

export default function ChaletManagementScreen() {
  const { chalets, bookings, settings } = useBookings();
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const [query, setQuery] = useState("");
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const layoutDirection: "rtl" | "ltr" = isRTL ? "rtl" : "ltr";
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return chalets;
    return chalets.filter((chalet) => `${chalet.name} ${chalet.location ?? ""} ${chalet.guardianName ?? ""} ${chalet.guardianPhone ?? ""}`.toLocaleLowerCase().includes(needle));
  }, [chalets, query]);
  const openProfile = (chalet?: Chalet) => router.push(chalet ? { pathname: "/chalet-profile", params: { id: chalet.id } } as never : "/chalet-profile?mode=add" as never);

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { direction: layoutDirection }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<>
        <SubScreenHeader title={language === "ar" ? "إدارة الوحدات / العقارات" : "Property management"} />
        <TextInput value={query} onChangeText={setQuery} placeholder={language === "ar" ? "ابحث باسم الوحدة أو الموقع أو الحارس" : "Search property, location, or guardian"} placeholderTextColor={colors.muted} style={[styles.search, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border, textAlign: align, writingDirection: layoutDirection }]} />
        <Pressable onPress={() => openProfile()} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1, flexDirection: row }]}>
          <MaterialIcons name="add" size={20} color={colors.background} />
          <Text style={{ color: colors.background, fontWeight: "800" }}>{language === "ar" ? "إضافة وحدة جديدة" : "Add new property"}</Text>
        </Pressable>
      </>}
      renderItem={({ item }) => <ChaletCard chalet={item} bookings={bookings} settings={settings} colors={colors} language={language} align={align} row={row} onPress={() => openProfile(item)} />}
      ListEmptyComponent={<View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="home-work" size={28} color={colors.primary} /><Text style={{ color: colors.foreground, fontWeight: "800", marginTop: 9 }}>{language === "ar" ? "لا توجد وحدات مطابقة" : "No matching properties"}</Text></View>}
      ListFooterComponent={<View style={{ height: 24 }} />}
    />
  </ScreenContainer>;
}

function ChaletCard({ chalet, bookings, settings, colors, language, align, row, onPress }: { chalet: Chalet; bookings: Booking[]; settings: Settings; colors: ReturnType<typeof useColors>; language: "ar" | "en"; align: "left" | "right"; row: "row" | "row-reverse"; onPress: () => void }) {
  const summary = chaletPerformanceSummary(chalet.id, bookings);
  const typeLabel = propertyTypeLabel(chalet.propertyType, language);
  const typeIcon = propertyTypeIcon(chalet.propertyType);
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}>
    <View style={[styles.cardTop, { flexDirection: row }]}>
      {chalet.imageUri ? <Image source={{ uri: chalet.imageUri }} contentFit="cover" style={styles.coverImage} /> : <View style={[styles.coverFallback, { backgroundColor: chalet.color + "1F" }]}><MaterialIcons name={typeIcon} size={24} color={chalet.color} /></View>}
      <View style={styles.flex}><View style={[styles.nameRow, { flexDirection: row }]}><View style={[styles.dot, { backgroundColor: chalet.color }]} /><Text style={[styles.flex, { color: colors.foreground, fontWeight: "800", fontSize: 18, textAlign: align }]}>{chalet.name}</Text></View><View style={[styles.badgeRow, { flexDirection: row }]}><View style={[styles.badge, { backgroundColor: chalet.color + "1F", borderColor: chalet.color + "66" }]}><Text style={{ color: chalet.color, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 }}>#{typeof settings.workspaceCode === "string" && settings.workspaceCode.trim() ? settings.workspaceCode.trim().toUpperCase() : "E01"}-{chalet.referenceCode}</Text></View></View><View style={[styles.typeRow, { flexDirection: row }]}><MaterialIcons name={typeIcon} size={13} color={chalet.color} /><Text style={{ color: chalet.color, fontSize: 11, fontWeight: "800" }}>{typeLabel}</Text></View><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, marginTop: 5, textAlign: align }}>{chalet.location || (language === "ar" ? "أضف موقع الوحدة" : "Add property location")}</Text></View>
      <MaterialIcons name={language === "ar" ? "chevron-left" : "chevron-right"} size={24} color={colors.muted} />
    </View>
    <View style={[styles.metaRow, { flexDirection: row }]}><MaterialIcons name="support-agent" size={15} color={colors.primary} /><Text numberOfLines={1} style={[styles.flex, { color: colors.muted, fontSize: 12, textAlign: align }]}>{chalet.guardianName || chalet.guardianPhone || (language === "ar" ? "الحارس غير محدد" : "No guardian set")}</Text></View>
    <View style={[styles.summaryRow, { flexDirection: row, backgroundColor: colors.background, borderColor: colors.border }]}><CardMetric label={language === "ar" ? "حجوزات" : "Bookings"} value={String(summary.bookingCount)} colors={colors} align={align} /><CardMetric label={language === "ar" ? "أيام مشغولة" : "Occupied days"} value={String(summary.occupiedDays)} colors={colors} align={align} /><CardMetric label={language === "ar" ? "إيراد الإيجار" : "Rental revenue"} value={formatMoney(summary.rentalRevenue, settings.currency)} colors={colors} align={align} /></View>
    <View style={[styles.editHint, { borderColor: colors.primary + "66", flexDirection: row }]}><MaterialIcons name="edit" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "800", fontSize: 12 }}>{language === "ar" ? "فتح ملف الوحدة" : "Open property profile"}</Text></View>
  </Pressable>;
}

function CardMetric({ label, value, colors, align }: { label: string; value: string; colors: ReturnType<typeof useColors>; align: "left" | "right" }) { return <View style={styles.cardMetric}><Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: "800", fontSize: 11, textAlign: align }}>{value}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 9, marginTop: 3, textAlign: align }}>{label}</Text></View>; }

const styles = StyleSheet.create({ content: { padding: 18, paddingBottom: 112 }, header: { gap: 12, alignItems: "center" }, back: { minWidth: 42, height: 42, borderRadius: 14, paddingHorizontal: 10, gap: 4, flexDirection: "row", alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, search: { minHeight: 50, borderWidth: 1, borderRadius: 15, marginTop: 18, paddingHorizontal: 14 }, addButton: { minHeight: 52, borderRadius: 15, marginTop: 12, justifyContent: "center", alignItems: "center", gap: 7 }, card: { borderWidth: 1, borderRadius: 21, padding: 16, marginTop: 13 }, cardTop: { alignItems: "center", gap: 10 }, coverImage: { width: 58, height: 58, borderRadius: 15, flexShrink: 0 }, coverFallback: { width: 58, height: 58, borderRadius: 15, alignItems: "center", justifyContent: "center", flexShrink: 0 }, nameRow: { alignItems: "center", gap: 7 }, badgeRow: { marginTop: 6 }, badge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 }, typeRow: { alignItems: "center", gap: 4, marginTop: 4 }, dot: { width: 11, height: 11, borderRadius: 6, flexShrink: 0 }, metaRow: { alignItems: "center", gap: 6, marginTop: 13 }, summaryRow: { borderWidth: 1, borderRadius: 13, marginTop: 13, padding: 9, gap: 6 }, cardMetric: { flex: 1, minWidth: 0 }, editHint: { minHeight: 38, alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 11, borderWidth: 1, marginTop: 14 }, empty: { minHeight: 170, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 14 } });
