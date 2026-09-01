import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useRef, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { BentoGlassCard } from "@/components/bento-glass-card";
import { useColors } from "@/hooks/use-colors";
import { type Customer, formatMoney } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { customerVipLabel, customerVipTier, searchCustomers } from "@/lib/customers";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { useAppPreferences } from "@/lib/app-preferences";

type CustomerSheet = { customer: Customer; reason: string; addingReason: boolean } | null;

export default function CrmScreen() {
  const { customers, saveCustomer, setCustomerBlacklisted, settings } = useBookings();
  const { can } = useWorkspaceAccess();
  const { isRTL, language } = useI18n();
  const { triggerHaptic, formatDate } = useAppPreferences();
  const colors = useColors();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "blacklisted">("all");
  const [sheet, setSheet] = useState<CustomerSheet>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNationalId, setEditNationalId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const inFlight = useRef(false);

  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  const list = useMemo(() => {
    const source = filter === "blacklisted" ? (customers ?? []).filter((customer) => customer.isBlacklisted) : customers ?? [];
    return searchCustomers(source, query);
  }, [customers, query, filter]);

  const blacklisted = useMemo(() => (customers ?? []).filter((customer) => customer.isBlacklisted).length, [customers]);
  const totalSpent = useMemo(() => (customers ?? []).reduce((sum, customer) => sum + Math.max(0, Number(customer.totalSpent || 0)), 0), [customers]);
  const canManage = can("edit_bookings");

  const openSheet = (customer: Customer) => {
    if (!canManage) return;
    triggerHaptic();
    setSheet({ customer, reason: "", addingReason: false });
    setEditName(customer.name);
    setEditPhone(customer.phone ?? "");
    setEditNationalId(customer.nationalId ?? "");
    setEditNotes(customer.notes ?? "");
  };

  const closeSheet = () => { if (!saving && !blocking) setSheet(null); };

  const saveEdits = async () => {
    if (!sheet || inFlight.current) return;
    if (!editName.trim() || !editPhone.trim()) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await saveCustomer({ ...sheet.customer, name: editName, phone: editPhone, nationalId: editNationalId.trim() || undefined, notes: editNotes.trim() || undefined });
      setSheet(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const title = message.endsWith("-forbidden") ? (language === "ar" ? "صلاحية مطلوبة" : "Permission required") : (language === "ar" ? "تعذر حفظ العميل" : "Could not save customer");
      const body = message.endsWith("-forbidden") ? (language === "ar" ? "لا تملك صلاحية إدارة العملاء." : "You do not have permission to manage customers.") : (language === "ar" ? "حاول مرة أخرى بعد قليل." : "Please try again shortly.");
      Alert.alert(title, body);
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  };

  const toggleBlacklist = async () => {
    if (!sheet || inFlight.current) return;
    inFlight.current = true;
    setBlocking(true);
    try {
      const next = !sheet.customer.isBlacklisted;
      await setCustomerBlacklisted(sheet.customer.id, next, sheet.addingReason ? sheet.reason : undefined);
      setSheet((current) => current ? { ...current, customer: { ...current.customer, isBlacklisted: next, blacklistReason: next && sheet.addingReason && sheet.reason.trim() ? sheet.reason.trim() : current.customer.blacklistReason }, addingReason: false, reason: "" } : null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      Alert.alert(message.endsWith("-forbidden") ? (language === "ar" ? "صلاحية مطلوبة" : "Permission required") : (language === "ar" ? "تعذر تحديث القائمة السوداء" : "Could not update blacklist"), message.endsWith("-forbidden") ? (language === "ar" ? "لا تملك صلاحية إدارة القائمة السوداء." : "You do not have permission to manage the blacklist.") : (language === "ar" ? "حاول مرة أخرى بعد قليل." : "Please try again shortly."));
    } finally {
      setBlocking(false);
      inFlight.current = false;
    }
  };

  const tierColors: Record<"gold" | "silver" | "bronze", { background: string; text: string }> = { gold: { background: colors.warning + "1C", text: colors.warning }, silver: { background: colors.primary + "18", text: colors.primary }, bronze: { background: colors.muted + "18", text: colors.muted } };

  const renderCustomer = ({ item }: { item: Customer }) => {
    const tier = customerVipTier(item);
    const badge = tierColors[tier];
    const accentColor = item.isBlacklisted ? colors.error : tier === "gold" ? colors.warning : tier === "silver" ? colors.primary : colors.muted;
    return (
      <GlowGlassCard glowColor={accentColor} intensity={item.isBlacklisted ? 16 : 12} style={styles.card} contentStyle={styles.cardContent}>
        <Pressable accessibilityRole="button" accessibilityLabel={item.name} onPress={() => openSheet(item)} disabled={!canManage} style={({ pressed }) => [styles.cardPressable, { opacity: pressed ? 0.7 : 1 }]}>
          <View style={[styles.avatar, { backgroundColor: item.isBlacklisted ? colors.error + "1C" : tier === "gold" ? colors.warning + "18" : tier === "silver" ? colors.primary + "18" : colors.muted + "18" }]}>
            <MaterialIcons name={item.isBlacklisted ? "block" : "person"} size={21} color={item.isBlacklisted ? colors.error : tier === "gold" ? colors.warning : tier === "silver" ? colors.primary : colors.muted} />
          </View>
          <View style={styles.flex}>
            <View style={[styles.nameRow, { flexDirection: row }]}>
              <Text numberOfLines={1} style={[styles.name, { color: colors.foreground, textAlign: align }]}>{item.name}</Text>
              <View style={[styles.badge, { backgroundColor: badge.background }]}>
                <MaterialIcons name={tier === "gold" ? "stars" : tier === "silver" ? "workspace-premium" : "person"} size={11} color={badge.text} />
                <Text style={{ color: badge.text, fontSize: 9, fontWeight: "900" }}>{customerVipLabel(tier, language)}</Text>
              </View>
            </View>
            <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted, textAlign: align }]}>{item.phone || "—"}{item.nationalId ? ` · ${item.nationalId}` : ""}</Text>
            <View style={[styles.metaRow, { flexDirection: row }]}>
              <View style={[styles.meta, { backgroundColor: colors.glassInset }]}>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{formatMoney(Math.max(0, Number(item.totalSpent || 0)), settings.currency)}</Text>
                <Text style={{ color: colors.muted, fontSize: 9, fontWeight: "700" }}>{language === "ar" ? "إجمالي الإنفاق" : "Total spent"}</Text>
              </View>
              <View style={[styles.meta, { backgroundColor: colors.glassInset }]}>
                <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "900" }}>{item.totalBookingsCount}</Text>
                <Text style={{ color: colors.muted, fontSize: 9, fontWeight: "700" }}>{language === "ar" ? "حجوزات" : "Bookings"}</Text>
              </View>
              {item.lastBookingDate ? (
                <View style={[styles.meta, { backgroundColor: colors.glassInset }]}>
                  <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", writingDirection: "ltr" }}>{formatDate(item.lastBookingDate) ?? item.lastBookingDate}</Text>
                  <Text style={{ color: colors.muted, fontSize: 9, fontWeight: "700" }}>{language === "ar" ? "آخر زيارة" : "Last stay"}</Text>
                </View>
              ) : null}
            </View>
            {item.isBlacklisted ? (
              <View style={[styles.blackChip, { backgroundColor: colors.error + "16" }]}>
                <MaterialIcons name="block" size={12} color={colors.error} />
                <Text numberOfLines={1} style={{ color: colors.error, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? `محظور · ${item.blacklistReason ?? "بدون سبب مسجل"}` : `Blacklisted · ${item.blacklistReason ?? "no recorded reason"}`}</Text>
              </View>
            ) : null}
            {canManage ? <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={21} color={colors.muted} /> : null}
          </View>
        </Pressable>
      </GlowGlassCard>
    );
  };

  return <ScreenContainer edges={["top", "left", "right"]}>
    <FlatList
      data={list}
      keyExtractor={(item) => item.id}
      renderItem={renderCustomer}
      ListHeaderComponent={<>
        <View style={[styles.titleRow, { flexDirection: row }]}>
          <View style={[styles.titleIcon, { backgroundColor: colors.primary + "1A" }]}><MaterialIcons name="group" size={21} color={colors.primary} /></View>
          <View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "900", textAlign: align }}>{language === "ar" ? "إدارة العملاء" : "Customer CRM"}</Text><Text style={[styles.subtitle, { color: colors.muted, textAlign: align, marginTop: 3 }]}>{language === "ar" ? `منظومة إدارة علاقات العملاء والولاء` : `Customer relationship & loyalty hub`}</Text></View>
        </View>

        <View style={[styles.statsRow, { flexDirection: row }]}>
          <GlowGlassCard glowColor={colors.primary} intensity={14} style={styles.statCard} contentStyle={styles.statCardContent}><Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "900" }}>{(customers ?? []).length}</Text><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}>{language === "ar" ? "عميل" : "Customers"}</Text></GlowGlassCard>
          <GlowGlassCard glowColor={colors.primary} intensity={16} style={styles.statCard} contentStyle={styles.statCardContent}><Text style={{ color: colors.primary, fontSize: 19, fontWeight: "900" }}>{formatMoney(totalSpent, settings.currency)}</Text><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}>{language === "ar" ? "إجمالي الإنفاق" : "Lifetime spend"}</Text></GlowGlassCard>
          <GlowGlassCard glowColor={colors.error} intensity={14} style={styles.statCard} contentStyle={styles.statCardContent}><Text style={{ color: colors.error, fontSize: 19, fontWeight: "900" }}>{blacklisted}</Text><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}>{language === "ar" ? "محظور" : "Blacklisted"}</Text></GlowGlassCard>
        </View>

        <GlowGlassCard glowColor={colors.primary} intensity={12} style={styles.searchBar} contentStyle={styles.searchBarContent}><MaterialIcons name="search" size={19} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} placeholder={language === "ar" ? "ابحث بالاسم أو الهاتف أو الرقم الوطني" : "Search by name, phone, or national ID"} placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.foreground, textAlign: align }]} /></GlowGlassCard>
        <View style={[styles.filterRow, { flexDirection: row }]}>
          <Pressable accessibilityRole="button" onPress={() => setFilter("all")} style={[styles.filterChip, { backgroundColor: filter === "all" ? colors.primary : colors.surface, borderColor: filter === "all" ? colors.primary : colors.border }]}><Text style={{ color: filter === "all" ? "#FFF" : colors.muted, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? `الكل (${(customers ?? []).length})` : `All (${(customers ?? []).length})`}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setFilter("blacklisted")} style={[styles.filterChip, { backgroundColor: filter === "blacklisted" ? colors.error : colors.surface, borderColor: filter === "blacklisted" ? colors.error : colors.border }]}><Text style={{ color: filter === "blacklisted" ? "#FFF" : colors.muted, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? `محظورون (${blacklisted})` : `Blacklisted (${blacklisted})`}</Text></Pressable>
        </View>
        {!canManage ? <GlowGlassCard glowColor={colors.muted} intensity={10} style={styles.noticeCard} contentStyle={styles.noticeCardContent}><MaterialIcons name="lock-outline" size={15} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 11, marginLeft: 6, textAlign: align }}>{language === "ar" ? "العرض متاح للجميع؛ التحرير والحظر خاص بالمالك والمديرين." : "Viewing is open; editing and blacklisting are owner/manager only."}</Text></GlowGlassCard> : null}
      </>}
      ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="group-off" size={38} color={colors.muted + "88"} /><Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800", marginTop: 12, textAlign: "center" }}>{language === "ar" ? "لا يوجد عملاء مطابقون بعد" : "No matching customers yet"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "center" }}>{language === "ar" ? "تظهر العملاء هنا تلقائيًا عند إضافة الحجوزات." : "Customers appear automatically as bookings are created."}</Text></View>}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />

    <Modal visible={Boolean(sheet)} transparent animationType="slide" onRequestClose={closeSheet} statusBarTranslucent>
      {sheet ? <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} disabled={saving || blocking} onPress={closeSheet} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.sheetHeader, { flexDirection: row }]}>
            <View style={[styles.titleIcon, { backgroundColor: sheet.customer.isBlacklisted ? colors.error + "1A" : colors.primary + "1A" }]}><MaterialIcons name={sheet.customer.isBlacklisted ? "block" : "manage-accounts"} size={21} color={sheet.customer.isBlacklisted ? colors.error : colors.primary} /></View>
            <View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{language === "ar" ? "ملف العميل" : "Customer profile"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 2, textAlign: align }}>{sheet.customer.name}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={closeSheet} disabled={saving || blocking} style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="close" size={21} color={colors.muted} /></Pressable>
          </View>

          <TextInput value={editName} onChangeText={setEditName} placeholder={language === "ar" ? "اسم العميل" : "Customer name"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <TextInput value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" placeholder={language === "ar" ? "رقم الهاتف" : "Phone number"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <TextInput value={editNationalId} onChangeText={setEditNationalId} keyboardType="number-pad" placeholder={language === "ar" ? "الرقم الوطني (اختياري)" : "National ID (optional)"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <TextInput value={editNotes} onChangeText={setEditNotes} placeholder={language === "ar" ? "ملاحظات (اختياري)" : "Notes (optional)"} placeholderTextColor={colors.muted} multiline style={[styles.input, styles.notesInput, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />

          <GlowGlassCard glowColor={sheet.customer.isBlacklisted ? colors.error : colors.muted} intensity={sheet.customer.isBlacklisted ? 16 : 12} style={styles.blackCard} contentStyle={styles.blackCardContent}>
            <View style={{ flexDirection: row, alignItems: "center", gap: 8 }}>
              <View style={[styles.titleIcon, { backgroundColor: (sheet.customer.isBlacklisted ? colors.error : colors.muted) + "1A" }]}><MaterialIcons name="block" size={19} color={sheet.customer.isBlacklisted ? colors.error : colors.muted} /></View>
              <View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "القائمة السوداء" : "Blacklist"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? (sheet.customer.isBlacklisted ? "العميل محظور حاليًا من الحجز." : "يحظر استقبال حجوزات هذا العميل.") : (sheet.customer.isBlacklisted ? "This customer is currently blocked from booking." : "Blocks this customer from booking.")}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تبديل الحظر" : "Toggle blacklist"} disabled={blocking || saving} onPress={() => void toggleBlacklist()} style={({ pressed }) => [styles.toggle, { backgroundColor: sheet.customer.isBlacklisted ? colors.error : colors.border, opacity: pressed || blocking || saving ? 0.6 : 1 }]}><MaterialIcons name={sheet.customer.isBlacklisted ? "check" : "close"} size={15} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>{sheet.customer.isBlacklisted ? (language === "ar" ? "موقوف" : "Blocked") : (language === "ar" ? "انقر للحظر" : "Tap to block")}</Text></Pressable>
            </View>
            {!sheet.customer.isBlacklisted ? <>
              <View style={[styles.filterRow, { flexDirection: row, marginTop: 10 }]}>
                <Pressable accessibilityRole="button" onPress={() => setSheet({ ...sheet, addingReason: false })} style={[styles.filterChip, { backgroundColor: !sheet.addingReason ? colors.primary : colors.surface, borderColor: !sheet.addingReason ? colors.primary : colors.border }]}><Text style={{ color: !sheet.addingReason ? "#FFF" : colors.muted, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "حظر فوري" : "Block now"}</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => setSheet({ ...sheet, addingReason: true })} style={[styles.filterChip, { backgroundColor: sheet.addingReason ? colors.primary : colors.surface, borderColor: sheet.addingReason ? colors.primary : colors.border }]}><Text style={{ color: sheet.addingReason ? "#FFF" : colors.muted, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "مع إضافة سبب" : "With a reason"}</Text></Pressable>
              </View>
              {sheet.addingReason ? <TextInput value={sheet.reason} onChangeText={(reason) => setSheet({ ...sheet, reason })} placeholder={language === "ar" ? "سبب الحظر..." : "Block reason..."} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, textAlign: align, marginTop: 9 }]} /> : null}
            </> : null}
            {sheet.customer.isBlacklisted ? <Pressable accessibilityRole="button" disabled={saving || blocking} onPress={() => void toggleBlacklist()} style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.success, opacity: pressed || saving || blocking ? 0.6 : 1 }]}><MaterialIcons name="lock-open" size={15} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "900" }}>{blocking ? (language === "ar" ? "جارٍ التحديث..." : "Updating...") : (language === "ar" ? "إزالة من القائمة السوداء" : "Remove from blacklist")}</Text></Pressable> : null}
          </GlowGlassCard>

          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حفظ بيانات العميل" : "Save customer"} disabled={saving || blocking} onPress={() => void saveEdits()} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary, opacity: pressed || saving || blocking ? 0.7 : 1 }]}><MaterialIcons name="save" size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "900" }}>{saving ? (language === "ar" ? "جارٍ الحفظ..." : "Saving...") : (language === "ar" ? "حفظ التعديلات" : "Save changes")}</Text></Pressable>
        </View>
      </View> : null}
    </Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 34, gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  titleRow: { alignItems: "center", gap: 10, marginBottom: 4 },
  titleIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  subtitle: { fontSize: 11, fontWeight: "600" },
  statsRow: { gap: 8, marginTop: 2 },
  statCard: { flex: 1, borderRadius: 16, alignItems: "center" },
  statCardContent: { padding: 12, alignItems: "center" },
  searchBar: { borderRadius: 15, marginTop: 12, minHeight: 46 },
  searchBarContent: { alignItems: "center", gap: 8, flexDirection: "row", paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 13, fontWeight: "600" },
  filterRow: { gap: 8, flexWrap: "wrap" },
  filterChip: { minHeight: 34, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  noticeCard: { borderRadius: 13, marginTop: 2 },
  noticeCardContent: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, padding: 10 },
  card: { borderRadius: 18, marginBottom: 8 },
  cardContent: { padding: 13, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 70 },
  cardPressable: { flex: 1, minHeight: 70 },
  avatar: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  nameRow: { alignItems: "center", gap: 7 },
  name: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: "900" },
  badge: { minHeight: 22, borderRadius: 11, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", gap: 3 },
  metaRow: { gap: 6, flexWrap: "wrap", marginTop: 9 },
  meta: { borderRadius: 11, paddingHorizontal: 9, paddingVertical: 5, alignItems: "flex-start", minWidth: 58 },
  blackChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, marginTop: 9, alignSelf: "flex-start" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 46, paddingHorizontal: 24 },
  backdrop: { flex: 1, backgroundColor: "rgba(3, 7, 12, 0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, padding: 18, paddingBottom: 30, gap: 11 },
  sheetHeader: { alignItems: "center", gap: 10, marginBottom: 2 },
  iconButton: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, fontSize: 13, fontWeight: "700" },
  notesInput: { minHeight: 72, textAlignVertical: "top", paddingTop: 11 },
  blackCard: { borderRadius: 16, marginTop: 4 },
  blackCardContent: { padding: 12 },
  toggle: { minHeight: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, paddingHorizontal: 11 },
  smallButton: { minHeight: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, marginTop: 10 },
  saveButton: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, marginTop: 6 },
});