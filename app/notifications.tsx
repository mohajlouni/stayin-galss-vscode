import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenBackButton } from "@/components/screen-back-button";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { type InAppNotification, type NotificationRecipient, type NotificationType } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { NOTIFICATION_FILTERS, notificationDeepLink, notificationRecipientLabel, notificationTypeIcon, notificationTypeLabel, sortNotifications, unreadNotificationCount, type NotificationFilter } from "@/lib/notification-center";
import { useAppPreferences } from "@/lib/app-preferences";
import { useWorkspaceAccess } from "@/lib/workspace-access";

const FILTER_ORDER: { id: NotificationFilter; icon: "all-inclusive" | "event-available" | "payments" | "login" | "construction" | "description" }[] = [
  { id: "all", icon: "all-inclusive" },
  { id: "new_booking", icon: "event-available" },
  { id: "payment_received", icon: "payments" },
  { id: "checkin_alert", icon: "login" },
  { id: "maintenance_due", icon: "construction" },
  { id: "contract_signed", icon: "description" },
];

export default function NotificationsScreen() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useBookings();
  const { isRTL, language } = useI18n();
  const { triggerHaptic, formatDate, formatTime } = useAppPreferences();
  const { role } = useWorkspaceAccess();
  const colors = useColors();
  const [filter, setFilter] = useState<NotificationFilter>("all");

  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  const ownNotifications = useMemo(() => {
    const all = notifications ?? [];
    const recipients: NotificationRecipient[] = role === "owner" || role === "admin" ? ["owner", "manager", "all"] : role === "guest" ? ["guard", "all"] : ["manager", "all"];
    return all.filter((notification) => notification.recipients.some((recipient) => recipients.includes(recipient)));
  }, [notifications, role]);

  const visible = useMemo(() => {
    const filtered = filter === "all" ? ownNotifications : ownNotifications.filter((notification) => notification.type === filter);
    return sortNotifications(filtered);
  }, [ownNotifications, filter]);

  const unread = useMemo(() => unreadNotificationCount(ownNotifications), [ownNotifications]);

  const typeColors: Record<NotificationType, string> = { new_booking: colors.primary, payment_received: colors.success, checkin_alert: colors.warning, maintenance_due: colors.error, contract_signed: colors.primary, weather_advisory: colors.sky };

  const open = (notification: InAppNotification) => {
    triggerHaptic();
    if (!notification.isRead) void markNotificationRead(notification.id).catch(() => undefined);
    const link = notificationDeepLink(notification);
    router.push(link as never);
  };

  return <ScreenContainer edges={["top", "left", "right"]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={[styles.header, { flexDirection: row }]}><ScreenBackButton fallbackHref="/" /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "900", textAlign: align }}>{language === "ar" ? "مركز الإشعارات" : "Notification center"}</Text><Text style={[styles.subtitle, { color: colors.muted, textAlign: align, marginTop: 3 }]}>{unread ? (language === "ar" ? `${unread} إشعارات غير مقروءة` : `${unread} unread notifications`) : (language === "ar" ? "لا توجد إشعارات غير مقروءة" : "No unread notifications")}</Text></View>{unread > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تحديد الكل كمقروء" : "Mark all as read"} onPress={() => void markAllNotificationsRead().catch(() => undefined)} style={({ pressed }) => [styles.markAll, { backgroundColor: colors.primary + "16", borderColor: colors.primary + "55", opacity: pressed ? 0.65 : 1 }]}><MaterialIcons name="done-all" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "الكل مُقروء" : "Mark all"}</Text></Pressable> : null}</View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterScroll}>
      {FILTER_ORDER.map(({ id, icon }) => { const active = filter === id; const count = id === "all" ? ownNotifications.length : ownNotifications.filter((item) => item.type === id).length; return <Pressable key={id} accessibilityRole="button" onPress={() => setFilter(id)} style={({ pressed }) => [styles.chip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={icon} size={14} color={active ? "#FFFFFF" : colors.muted} /><Text style={{ color: active ? "#FFFFFF" : colors.muted, fontSize: 11, fontWeight: "900" }}>{id === "all" ? (language === "ar" ? `الكل (${count})` : `All (${count})`) : `${notificationTypeLabel(id, language)} (${count})`}</Text></Pressable>; })}
    </ScrollView>

    {visible.length ? visible.map((notification) => {
      const accent = typeColors[notification.type];
      return <Pressable key={notification.id} accessibilityRole="button" accessibilityLabel={notification.title} onPress={() => open(notification)} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: notification.isRead ? colors.border : accent + "66", opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.iconWrap, { backgroundColor: accent + "16" }]}><MaterialIcons name={notificationTypeIcon(notification.type)} size={21} color={accent} />{!notification.isRead ? <View style={[styles.unreadDot, { backgroundColor: accent }]} /> : null}</View>
        <View style={styles.flex}>
          <View style={[styles.titleRow, { flexDirection: row }]}><Text numberOfLines={1} style={[styles.title, { color: colors.foreground, textAlign: align, flex: 1 }]}>{notification.title}</Text><Text style={{ color: colors.muted, fontSize: 9, fontWeight: "700" }}>{notification.recipients.map((recipient) => notificationRecipientLabel(recipient, language)).join(" · ")}</Text></View>
          <Text style={[styles.body, { color: colors.muted, textAlign: align }]} numberOfLines={2}>{notification.body}</Text>
          <Text style={[styles.time, { color: colors.muted, textAlign: align }]}>{formatDate(notification.createdAt.slice(0, 10)) ?? notification.createdAt.slice(0, 10)}{formatTime ? ` · ${formatTime(notification.createdAt)}` : ""}</Text>
        </View>
        <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={19} color={colors.muted} />
      </Pressable>;
    }) : <View style={styles.empty}><MaterialIcons name="notifications-off" size={38} color={colors.muted + "88"} /><Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800", marginTop: 12 }}>{language === "ar" ? "لا توجد إشعارات" : "No notifications"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "center" }}>{language === "ar" ? "ستظهر الأحداث هنا: حجز جديد، دفعة، وصول، عقد، وصيانة مستحقة." : "Events appear here: new bookings, payments, check-ins, contracts, and due maintenance."}</Text></View>}
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 34 },
  flex: { flex: 1, minWidth: 0 },
  subtitle: { fontSize: 11, fontWeight: "600" },
  header: { alignItems: "center", gap: 10, marginBottom: 4 },
  markAll: { minHeight: 36, borderRadius: 12, borderWidth: 1, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  filterScroll: { marginTop: 12, marginHorizontal: -16, flexGrow: 0 },
  filterRow: { gap: 8, paddingHorizontal: 16 },
  chip: { minHeight: 36, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  card: { borderRadius: 17, borderWidth: 1, padding: 12, marginTop: 9, alignItems: "center", gap: 10, flexDirection: "row" },
  iconWrap: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  unreadDot: { position: "absolute", top: -2, right: -2, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: "#FFF" },
  titleRow: { alignItems: "center", gap: 8 },
  title: { fontSize: 13, fontWeight: "900" },
  body: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  time: { fontSize: 9, marginTop: 5, fontWeight: "700" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 46, paddingHorizontal: 24 },
});