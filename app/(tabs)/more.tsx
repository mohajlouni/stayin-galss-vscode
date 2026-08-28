import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { CompactScreenHeader } from "@/components/compact-screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { useColors } from "@/hooks/use-colors";
import { useBookings } from "@/lib/booking-store";
import { useAuthSession } from "@/lib/auth-session";
import { useI18n } from "@/lib/i18n";
import { useInternetAvailability } from "@/lib/network-status";
import { trpc } from "@/lib/trpc";
import { useWorkspaceAccess } from "@/lib/workspace-access";

type MenuRoute = "/(tabs)/settings" | "/(tabs)/waitlist" | "/suggestions" | "/audit-log" | "/chalet-management" | "/user-management" | "/workspace-select" | "/whatsapp-templates" | "/profile" | "/admin/master-control" | "/settings/advanced-tools" | "/payment-methods";
type MenuIcon = "settings" | "format-list-bulleted" | "lightbulb-outline" | "history" | "holiday-village" | "home-work" | "group" | "business" | "chat" | "login" | "person" | "admin-panel-settings" | "health-and-safety" | "payments";
type MenuEntry = { title: string; description: string; icon: MenuIcon; route: MenuRoute };
const MORE_TAB_ROUTES = new Set<MenuRoute>(["/(tabs)/settings", "/(tabs)/waitlist"]);

function openMoreRoute(route: MenuRoute) {
  if (MORE_TAB_ROUTES.has(route)) {
    router.navigate(route as never);
    return;
  }
  router.push(route as never);
}

export default function MoreScreen() {
  const colors = useColors();
  const { lastSyncedAt, refreshWorkspaceData } = useBookings();
  const { isRTL, language, t } = useI18n();
  const { isAuthenticated, isManager, isOwner, can } = useWorkspaceAccess();
  const { currentUser, activePropertyGroup } = useAuthSession();
  const masterControl = trpc.masterControl.overview.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const internetAvailability = useInternetAvailability();
  const [syncRefreshing, setSyncRefreshing] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const internetReachable = internetAvailability === true;
  const lastSyncLabel = useMemo(() => {
    if (!lastSyncedAt) return language === "ar" ? "لم تتم مزامنة سابقة على هذا الجهاز." : "No previous sync on this device.";
    const syncedDate = new Date(lastSyncedAt);
    if (Number.isNaN(syncedDate.getTime())) return language === "ar" ? "وقت المزامنة غير متاح." : "Sync time unavailable.";
    const locale = language === "ar" ? "ar-JO" : "en-GB";
    const timestamp = `${syncedDate.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })} · ${syncedDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
    return language === "ar" ? `آخر مزامنة: ${timestamp}` : `Last sync: ${timestamp}`;
  }, [language, lastSyncedAt]);
  const connectionLabel = internetReachable
    ? (language === "ar" ? "متصل بالإنترنت · المزامنة ممكنة" : "Online · Sync available")
    : (language === "ar" ? "لا يوجد اتصال بالإنترنت · المزامنة متوقفة" : "Offline · Sync unavailable");
  const refreshDataNow = async () => {
    if (!isManager) {
      Alert.alert(language === "ar" ? "صلاحية مطلوبة" : "Permission required", language === "ar" ? "تحديث بيانات المنشأة متاح للمالك أو المدير فقط." : "Workspace refresh is available to owners and managers only.");
      return;
    }
    if (!internetReachable) {
      Alert.alert(language === "ar" ? "لا يوجد اتصال" : "No internet connection", language === "ar" ? "اتصل بالإنترنت ثم حاول تحديث بيانات المنشأة مرة أخرى." : "Connect to the internet, then try refreshing workspace data again.");
      return;
    }
    setSyncRefreshing(true);
    try { await refreshWorkspaceData(); } finally { setSyncRefreshing(false); }
  };

  const propertyOperationsItems: MenuEntry[] = [
    ...(isManager ? [{ title: language === "ar" ? "إدارة الوحدات / العقارات" : "Property management", description: language === "ar" ? "ملف كل وحدة وأسعارها وحارسها وأوقاتها" : "Each property profile, pricing, guardian, and hours", icon: "home-work" as const, route: "/chalet-management" as const }] : []),
    { title: t("waitlist"), description: language === "ar" ? "طلبات العملاء بانتظار توفر الموعد" : "Customer requests waiting for availability", icon: "format-list-bulleted", route: "/(tabs)/waitlist" },
  ];
  const financialItems: MenuEntry[] = [
    ...(isManager ? [{ title: language === "ar" ? "طرق الدفع والحسابات المالية" : "Payment methods & financial accounts", description: language === "ar" ? "طرق التحصيل وحسابات CliQ وIBAN للإيجار والتأمين" : "Collection methods and CliQ/IBAN accounts for rent and deposits", icon: "payments" as const, route: "/payment-methods" as const }] : []),
  ];
  const teamSecurityItems: MenuEntry[] = [
    ...(isManager ? [{ title: language === "ar" ? "إدارة المستخدمين والصلاحيات" : "User management & permissions", description: language === "ar" ? "فريق العمل والموظفون والدعوات والصلاحيات" : "Staff, employees, invitations, and permissions", icon: "group" as const, route: "/user-management" as const }] : []),
    ...(can("view_audit_logs") ? [{ title: language === "ar" ? "سجل إجراءات النظام" : "System activity log", description: language === "ar" ? "متابعة الحذف والإلغاء والتحويل والحركات المؤثرة" : "Track deletions, cancellations, promotions, and critical actions", icon: "history" as const, route: "/audit-log" as const }] : []),
    ...(isOwner ? [{ title: language === "ar" ? "أدوات متقدمة وطوارئ" : "Advanced tools & recovery", description: language === "ar" ? "نقل الحجوزات وفك التعليق والاستعادة برقابة PIN" : "Move bookings, release holds, and recover data with owner PIN", icon: "health-and-safety" as const, route: "/settings/advanced-tools" as const }] : []),
    ...(masterControl.data ? [{ title: language === "ar" ? "مركز الإدارة العليا" : "Master control", description: language === "ar" ? "محاكاة الأدوار والاسترداد وسجل الحماية" : "Role simulation, recovery, and security audit", icon: "admin-panel-settings" as const, route: "/admin/master-control" as const }] : []),
  ];
  const communicationPreferenceItems: MenuEntry[] = [
    ...(isManager ? [{ title: language === "ar" ? "قوالب رسائل الواتساب" : "WhatsApp message templates", description: language === "ar" ? "تخصيص القوالب والرسائل الذكية" : "Customize templates and smart messages", icon: "chat" as const, route: "/whatsapp-templates" as const }] : []),
    { title: language === "ar" ? "الإعدادات العامة والمزامنة" : "General settings & sync", description: language === "ar" ? "المظهر وحالة الاتصال والمزامنة والنسخ الاحتياطي" : "Appearance, connection, sync, and backup", icon: "settings", route: "/(tabs)/settings" },
  ];
  const suggestion: MenuEntry = { title: language === "ar" ? "مركز الاقتراحات والمساعدة" : "Suggestions & help center", description: language === "ar" ? "شارك فكرة أو اطلب مساعدة لتطوير تجربتك" : "Share an idea or ask for help", icon: "lightbulb-outline", route: "/suggestions" };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView style={{ flex: 1, minHeight: 0, backgroundColor: "transparent" }} contentContainerStyle={[styles.content, { backgroundColor: "transparent" }]} showsVerticalScrollIndicator={false}>
      <CompactScreenHeader title={t("more")} icon="more-horiz" plain showDateTime={false} />
      {isAuthenticated && currentUser ? <GlowGlassCard style={styles.profileCard} contentStyle={styles.profileCardContent}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "فتح ملفي الشخصي" : "Open my profile"} onPress={() => router.push("/profile")} style={({ pressed }) => [styles.profileMain, { flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><View style={[styles.profileAvatar, { backgroundColor: colors.primary + "16" }]}>{currentUser.avatarUrl ? <Image source={{ uri: currentUser.avatarUrl }} contentFit="cover" style={styles.profileImage} /> : <MaterialIcons name="person" size={30} color={colors.primary} />}</View><View style={styles.flex}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900", textAlign: align }}>{language === "ar" ? "ملفي الشخصي" : "My profile"}</Text><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", marginTop: 3, textAlign: align }}>{currentUser.fullName}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{currentUser.email ?? (language === "ar" ? "لا يوجد بريد إلكتروني موثق" : "No verified email")}</Text></View><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={25} color={colors.primary} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تبديل مجموعة المنشآت" : "Switch property group"} onPress={() => router.push("/workspace-select")} style={({ pressed }) => [styles.workspaceBadge, { backgroundColor: colors.glassInset, flexDirection: row, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="business" size={17} color={colors.primary} /><View style={styles.flex}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? "المنشأة النشطة" : "Active property group"}</Text><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 2, textAlign: align }}>{activePropertyGroup?.name ?? (language === "ar" ? "اختيار مجموعة منشآت" : "Choose a property group")}</Text></View><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={19} color={colors.primary} /></Pressable></GlowGlassCard> : null}
      {propertyOperationsItems.length ? <MenuSection title={language === "ar" ? "إدارة المنشأة والتشغيل" : "Property operations"} items={propertyOperationsItems} colors={colors} row={row} align={align} isRTL={isRTL} /> : null}
      {financialItems.length ? <MenuSection title={language === "ar" ? "الإعدادات المالية" : "Financial settings"} items={financialItems} colors={colors} row={row} align={align} isRTL={isRTL} /> : null}
      {teamSecurityItems.length ? <MenuSection title={language === "ar" ? "الفريق والأمان" : "Staff & security"} items={teamSecurityItems} colors={colors} row={row} align={align} isRTL={isRTL} /> : null}
      <MenuSection title={language === "ar" ? "التواصل والتفضيلات" : "Communication & preferences"} items={communicationPreferenceItems} colors={colors} row={row} align={align} isRTL={isRTL} />
      <MenuSection title={language === "ar" ? "الدعم والمساعدة" : "Support"} items={[]} colors={colors} row={row} align={align} isRTL={isRTL} beforeItems={<SuggestionRow item={suggestion} colors={colors} row={row} align={align} isRTL={isRTL} />} />
      {isAuthenticated ? <CompactSyncIndicator colors={colors} row={row} align={align} internetReachable={internetReachable} lastSyncLabel={lastSyncLabel} syncRefreshing={syncRefreshing} canRefresh={isManager} onRefresh={() => void refreshDataNow()} language={language} /> : null}
    </ScrollView>
  </ScreenContainer>;
}

function MenuSection({ title, items, colors, row, align, isRTL, beforeItems }: { title: string; items: MenuEntry[]; colors: ReturnType<typeof useColors>; row: "row" | "row-reverse"; align: "left" | "right"; isRTL: boolean; beforeItems?: ReactNode }) {
  return <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{title}</Text>{beforeItems ? <View style={styles.sectionAccessory}>{beforeItems}</View> : null}{items.length ? <GlowGlassCard style={styles.group}>{items.map((item, index) => <Fragment key={item.title}><MenuRow item={item} colors={colors} row={row} align={align} isRTL={isRTL} />{index < items.length - 1 ? <View style={[styles.divider, { backgroundColor: colors.glassInset }]} /> : null}</Fragment>)}</GlowGlassCard> : null}</View>;
}

function MenuRow({ item, colors, row, align, isRTL }: { item: MenuEntry; colors: ReturnType<typeof useColors>; row: "row" | "row-reverse"; align: "left" | "right"; isRTL: boolean }) {
  return <Pressable onPress={() => openMoreRoute(item.route)} style={({ pressed }) => [styles.menuRow, { flexDirection: row, opacity: pressed ? 0.68 : 1 }]}><View style={[styles.iconBox, { backgroundColor: colors.primary + "16" }]}><MaterialIcons name={item.icon} size={21} color={colors.primary} /></View><View style={styles.flex}><Text style={[styles.menuTitle, { color: colors.foreground, textAlign: align }]}>{item.title}</Text><Text numberOfLines={1} style={[styles.menuDescription, { color: colors.muted, textAlign: align }]}>{item.description}</Text></View><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={colors.muted} /></Pressable>;
}

function SuggestionRow({ item, colors, row, align, isRTL }: { item: MenuEntry; colors: ReturnType<typeof useColors>; row: "row" | "row-reverse"; align: "left" | "right"; isRTL: boolean }) {
  return <GlowGlassCard intensity={16} style={styles.suggestionCard}><Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => openMoreRoute(item.route)} style={({ pressed }) => [styles.suggestionRow, { flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><View style={[styles.iconBox, { backgroundColor: colors.primary + "28" }]}><MaterialIcons name={item.icon} size={21} color={colors.primary} /></View><View style={styles.flex}><Text style={[styles.menuTitle, { color: colors.foreground, textAlign: align }]}>{item.title}</Text><Text numberOfLines={1} style={[styles.menuDescription, { color: colors.muted, textAlign: align }]}>{item.description}</Text></View><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={colors.primary} /></Pressable></GlowGlassCard>;
}

function CompactSyncIndicator({ colors, row, align, internetReachable, lastSyncLabel, syncRefreshing, canRefresh, onRefresh, language }: { colors: ReturnType<typeof useColors>; row: "row" | "row-reverse"; align: "left" | "right"; internetReachable: boolean; lastSyncLabel: string; syncRefreshing: boolean; canRefresh: boolean; onRefresh: () => void; language: "ar" | "en" }) {
  const statusColor = internetReachable ? colors.success : colors.muted;
  const statusLabel = internetReachable ? (language === "ar" ? "متصل · المزامنة ممكنة" : "Online · Sync ready") : (language === "ar" ? "غير متصل · المزامنة متوقفة" : "Offline · Sync paused");
  const disabled = syncRefreshing || !canRefresh || !internetReachable;
  return <GlowGlassCard style={styles.compactSyncIndicator} contentStyle={[styles.compactSyncIndicatorContent, { flexDirection: row }]}><MaterialIcons name={internetReachable ? "wifi" : "wifi-off"} size={18} color={statusColor} /><View style={styles.flex}><Text style={{ color: statusColor, fontSize: 11, fontWeight: "900", textAlign: align }}>{statusLabel}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 9, marginTop: 2, textAlign: align }}>{lastSyncLabel}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تحديث بيانات المنشأة" : "Refresh workspace data"} disabled={disabled} onPress={onRefresh} style={({ pressed }) => [styles.compactRefreshButton, { backgroundColor: internetReachable ? colors.primary : colors.muted, opacity: pressed || disabled ? 0.5 : 1 }]}><MaterialIcons name={syncRefreshing ? "sync" : "refresh"} size={17} color="#FFFFFF" /></Pressable></GlowGlassCard>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 16, paddingBottom: 36 },
  profileCard: { borderRadius: 24, marginTop: 10 },
  profileCardContent: { padding: 12, gap: 10 },
  profileMain: { minHeight: 58, alignItems: "center", gap: 11 },
  profileAvatar: { width: 58, height: 58, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  profileImage: { width: "100%", height: "100%" },
  workspaceBadge: { minHeight: 47, borderRadius: 16, paddingHorizontal: 11, alignItems: "center", gap: 8 },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 14, lineHeight: 22, fontWeight: "900", marginBottom: 7 },
  group: { borderRadius: 22, overflow: "hidden" },
  menuRow: { minHeight: 72, alignItems: "center", gap: 12, paddingHorizontal: 13, paddingVertical: 10 },
  suggestionCard: { borderRadius: 22 },
  suggestionRow: { minHeight: 72, alignItems: "center", gap: 12, paddingHorizontal: 13, paddingVertical: 10 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 13 },
  iconBox: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sectionAccessory: { marginBottom: 8 },
  syncStatusCard: { minHeight: 72, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10, alignItems: "center", gap: 10 },
  refreshNowButton: { minHeight: 38, borderRadius: 11, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  compactSyncIndicator: { minHeight: 52, borderRadius: 18, marginTop: 16 },
  compactSyncIndicatorContent: { minHeight: 52, paddingHorizontal: 11, paddingVertical: 8, alignItems: "center", gap: 8 },
  compactRefreshButton: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  flex: { flex: 1, minWidth: 0 },
  menuTitle: { fontSize: 16, lineHeight: 22, fontWeight: "900" },
  menuDescription: { fontSize: 11, lineHeight: 17, marginTop: 2 },
});
