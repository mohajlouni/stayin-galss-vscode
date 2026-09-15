import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { type Booking, type WaitlistEntry } from "./booking-model";
import { loadLocalNotifications, type LocalNotificationsApi } from "./local-notifications";
import { getWaitlistPriorityReminderTiming, waitlistPriorityCandidates } from "./waitlist-priority";

const STORAGE_KEY = "hajez-waitlist-priority-reminders-v1";
const CHANNEL_ID = "waitlist-priority-reminders";

type ScheduledReminder = { notificationId: string; bookingStartAt: number; notifyAt: number };

/**
 * Local reminders load through `lib/local-notifications.ts`, which deep-imports the
 * `expo-notifications/build/*` leaves instead of the package barrel.
 *
 * The barrel (`build/index.js`) fires side effects at module scope that a runtime guard
 * cannot intercept: `console.warn` on line 5, plus the `DevicePushTokenAutoRegistration.fx`
 * (line 35) and `TokenEmitter` (line 38) re-exports. Those evaluate immediately and call
 * `addPushTokenListener` -> `warnOfExpoGoPushUsage()`, which uses `console.error` on Android
 * and therefore raises a red LogBox screen at startup in Expo Go.
 */
async function loadNotifications(): Promise<LocalNotificationsApi | null> {
  return loadLocalNotifications();
}

/** Best-effort loader: local reminders are optional and must never block booking persistence. */
async function loadNotificationsSafely(): Promise<LocalNotificationsApi | null> {
  try {
    return await loadNotifications();
  } catch {
    return null;
  }
}

async function readScheduled(): Promise<Record<string, ScheduledReminder>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, ScheduledReminder> : {};
  } catch {
    return {};
  }
}

async function writeScheduled(value: Record<string, ScheduledReminder>) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

async function prepareAndroidChannel(api: LocalNotificationsApi) {
  if (Platform.OS !== "android") return;
  await api.setNotificationChannelAsync(CHANNEL_ID, { name: "تنبيهات أولوية الحجز", importance: api.AndroidImportance.HIGH, vibrationPattern: [0, 220, 120, 220], lightColor: "#F59E0B" });
}

/** Schedules one reminder per unpaid booking / active-waitlist pair and cancels stale reminders. */
export async function syncWaitlistPriorityNotifications(bookings: Booking[], waitlist: WaitlistEntry[], enabled: boolean, language: "ar" | "en") {
  if (Platform.OS === "web") return;
  const notifications = await loadNotificationsSafely();
  if (!notifications) return;
  const existing = await readScheduled();
  const next: Record<string, ScheduledReminder> = {};
  if (!enabled) {
    await Promise.all(Object.values(existing).map((item) => notifications.cancelScheduledNotificationAsync(item.notificationId).catch(() => undefined)));
    await writeScheduled(next);
    return;
  }
  try {
    await prepareAndroidChannel(notifications);
    if ((await notifications.getPermissionsAsync()).status !== "granted") return;
    for (const candidate of waitlistPriorityCandidates(bookings, waitlist)) {
      const timing = getWaitlistPriorityReminderTiming(candidate);
      if (!timing) continue;
      const key = `${timing.bookingId}:${timing.waitlistId}`;
      const current = existing[key];
      if (current?.bookingStartAt === timing.bookingStartAt && current.notifyAt === timing.notifyAt) {
        next[key] = current;
        continue;
      }
      if (current) await notifications.cancelScheduledNotificationAsync(current.notificationId).catch(() => undefined);
      const title = language === "ar" ? "حجز غير مدفوع أمام طلب انتظار" : "Unpaid booking has a waitlist request";
      const body = language === "ar" ? `حجز ${candidate.booking.customerName} غدًا بلا دفعة، ويوجد طلب انتظار للعميل ${candidate.entry.customerName}. راجع القرار الآن.` : `${candidate.booking.customerName}'s booking is tomorrow with no payment, and ${candidate.entry.customerName} is waiting for the same slot.`;
      const notificationId = await notifications.scheduleNotificationAsync({ content: { title, body, data: { bookingId: timing.bookingId, waitlistId: timing.waitlistId, route: "/bookings" }, sound: "default", color: "#F59E0B" }, trigger: { type: notifications.SchedulableTriggerInputTypes.DATE, date: new Date(timing.notifyAt), channelId: CHANNEL_ID } });
      next[key] = { notificationId, bookingStartAt: timing.bookingStartAt, notifyAt: timing.notifyAt };
    }
    await Promise.all(Object.entries(existing).filter(([key]) => !next[key]).map(([, item]) => notifications.cancelScheduledNotificationAsync(item.notificationId).catch(() => undefined)));
    await writeScheduled(next);
  } catch {
    // Local reminders are optional and must never block booking persistence.
  }
}
