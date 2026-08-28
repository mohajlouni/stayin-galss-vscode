import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { CompactScreenHeader } from "@/components/compact-screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenBackButton } from "@/components/screen-back-button";
import { useColors } from "@/hooks/use-colors";
import { formatBookingReference, type Booking, type WaitlistEntry } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";

type SearchResult = { kind: "booking"; item: Booking } | { kind: "waitlist"; item: WaitlistEntry };

function searchable(value: string) {
  return value.toLowerCase().replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[^\p{L}\p{N}]/gu, "");
}

export default function QuickSearchScreen() {
  const { bookings, waitlist, settings } = useBookings();
  const { language, isRTL } = useI18n();
  const colors = useColors();
  const [query, setQuery] = useState("");
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const key = searchable(query.trim());
  const results = useMemo<SearchResult[]>(() => {
    if (!key) return [];
    const bookingMatches = bookings.filter((booking) => [booking.customerName, booking.phone, booking.bookingReference ?? "", booking.chaletName ?? ""].some((value) => searchable(value).includes(key))).slice(0, 12).map((item) => ({ kind: "booking" as const, item }));
    const waitlistMatches = waitlist.filter((entry) => entry.status === "active" && [entry.customerName, entry.phone, entry.chaletName ?? ""].some((value) => searchable(value).includes(key))).slice(0, 8).map((item) => ({ kind: "waitlist" as const, item }));
    return [...bookingMatches, ...waitlistMatches];
  }, [bookings, key, waitlist]);
  const open = (result: SearchResult) => {
    if (result.kind === "booking") router.push({ pathname: "/booking-detail", params: { id: result.item.id } } as never);
    else router.push({ pathname: "/booking-form", params: { waitlistId: result.item.id } } as never);
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><View style={styles.screen}><View style={[styles.backRow, { flexDirection: row }]}><ScreenBackButton fallbackHref="/" /></View><CompactScreenHeader title={language === "ar" ? "بحث سريع" : "Quick search"} logoUrl={settings.businessLogoUrl} icon="search" action={{ label: language === "ar" ? "حجز جديد" : "New booking", accessibilityLabel: language === "ar" ? "حجز جديد" : "New booking", onPress: () => router.push("/booking-form" as never), icon: "add" }} /><View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="search" size={22} color={colors.primary} /><TextInput autoFocus value={query} onChangeText={setQuery} placeholder={language === "ar" ? "الاسم أو الهاتف أو مرجع الحجز" : "Guest, phone, or booking reference"} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, textAlign: align }]} /></View><Text style={{ color: colors.muted, fontSize: 11, marginHorizontal: 16, marginTop: 8, textAlign: align }}>{language === "ar" ? "ابحث في الحجوزات وطلبات الانتظار من شاشة واحدة." : "Search bookings and active waitlist requests from one place."}</Text><FlatList data={results} keyExtractor={(result) => `${result.kind}-${result.item.id}`} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" ListEmptyComponent={<View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name={key ? "search-off" : "manage-search"} size={29} color={colors.muted} /><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", marginTop: 9, textAlign: "center" }}>{key ? (language === "ar" ? "لا توجد نتيجة مطابقة" : "No matching result") : (language === "ar" ? "اكتب للبحث السريع" : "Start typing to search")}</Text></View>} renderItem={({ item: result }) => { const isBooking = result.kind === "booking"; const item = result.item; const reference = result.kind === "booking" ? formatBookingReference(result.item.bookingReference) : (language === "ar" ? "طلب انتظار" : "Waitlist request"); return <Pressable accessibilityRole="button" accessibilityLabel={isBooking ? (language === "ar" ? `فتح حجز ${item.customerName}` : `Open booking for ${item.customerName}`) : (language === "ar" ? `فتح طلب انتظار ${item.customerName}` : `Open waitlist request for ${item.customerName}`)} onPress={() => open(result)} style={({ pressed }) => [styles.result, { backgroundColor: colors.surface, borderColor: isBooking ? colors.primary + "55" : colors.warning + "66", flexDirection: row, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.resultIcon, { backgroundColor: (isBooking ? colors.primary : colors.warning) + "18" }]}><MaterialIcons name={isBooking ? "event" : "pending-actions"} size={18} color={isBooking ? colors.primary : colors.warning} /></View><View style={styles.flex}><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: align }}>{item.customerName}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{item.phone} · {item.chaletName ?? (language === "ar" ? "شاليه غير محدد" : "Chalet not set")}</Text></View><View style={styles.reference}><Text numberOfLines={1} style={{ color: isBooking ? colors.primary : colors.warning, fontSize: 10, fontWeight: "900", writingDirection: "ltr" }}>{reference}</Text><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.muted} /></View></Pressable>; }} /></View></ScreenContainer>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, backRow: { paddingHorizontal: 16, paddingTop: 7, justifyContent: "flex-start" }, back: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" }, inputWrap: { minHeight: 49, borderWidth: 1, borderRadius: 15, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, alignItems: "center", gap: 8 }, input: { flex: 1, minWidth: 0, minHeight: 46, fontSize: 13 }, content: { padding: 16, paddingBottom: 110, gap: 8 }, empty: { minHeight: 155, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", padding: 16 }, result: { minHeight: 66, borderWidth: 1, borderRadius: 16, padding: 11, alignItems: "center", gap: 9 }, resultIcon: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, reference: { alignItems: "flex-end", gap: 3, maxWidth: 105 }, });
