import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { type Booking } from "./booking-model";
import { checkoutReminderCopy, getCheckoutReminderTiming, reminderNeedsRescheduling } from "./checkout-reminder";
import { loadLocalNotifications, type LocalNotificationsApi } from "./local-notifications";

const STORAGE_KEY = "hajez-checkout-reminders-v1";
const CHANNEL_ID = "checkout-reminders";

type ScheduledReminder = { notificationId: string; checkoutAt: number; notifyAt: number };

/**
 * Local reminders load through `lib/local-notifications.ts`, which deep-imports the
 * `expo-notifications/build/*` leaves instead of the package barrel.
 *
 * The barrel (`build/index.js`) fires side effects at module scope that a runtime guard
 * cannot intercept: `console.warn` on line 5, plus the `DevicePushTokenAutoRegistration.fx`
 * (line 35) and `TokenEmitter` (line 38) re-exports. Those evaluate immediately and call
 * `addPushTokenListener` -> `warnOfExpoGoPushUsage()`, which uses `console.error` on Android
 * and therefore raises a red LogBox screen at startup in Expo Go — even though this app
 * never asks for a remote push token here.
 */
async function loadNotifications(): Promise<LocalNotificationsApi | null> {
  return loadLocalNotifications();
}

/** Best-effort loader: a missing notifications module must never block booking persistence. */
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

async function writeScheduled(reminders: Record<string, ScheduledReminder>) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
}

async function prepareAndroidChannel(api: LocalNotificationsApi) {
  if (Platform.OS !== "android") return;
  await api.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Checkout reminders",
    importance: api.AndroidImportance.HIGH,
    vibrationPattern: [0, 220, 120, 220],
    lightColor: "#0F8B83",
  });
}

/** Requests notification permission only after the user explicitly enables local notifications. */
export async function requestCheckoutNotificationPermission() {
  if (Platform.OS === "web") return false;
  const notifications = await loadNotificationsSafely();
  if (!notifications) return false;
  try {
    await prepareAndroidChannel(notifications);
    const current = await notifications.getPermissionsAsync();
    if (current.status === "granted") return true;
    const requested = await notifications.requestPermissionsAsync();
    return requested.status === "granted";
  } catch {
    return false;
  }
}

/** Synchronizes one reminder per active reservation and cancels stale or edited reminders. */
export async function syncCheckoutNotifications(bookings: Booking[], chalets: Array<{ id: string; name: string }>, enabled: boolean, language: "ar" | "en") {
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
    const permission = await notifications.getPermissionsAsync();
    if (permission.status !== "granted") return;
    for (const booking of bookings) {
      const timing = getCheckoutReminderTiming(booking);
      if (!timing) continue;
      const current = existing[booking.id];
      if (!reminderNeedsRescheduling(current, timing)) {
        next[booking.id] = current;
        continue;
      }
      if (current) await notifications.cancelScheduledNotificationAsync(current.notificationId).catch(() => undefined);
      const chaletName = chalets.find((chalet) => chalet.id === booking.chaletId)?.name ?? booking.chaletName;
      const copy = checkoutReminderCopy(booking, chaletName, language);
      const notificationId = await notifications.scheduleNotificationAsync({
        content: { ...copy, data: { bookingId: booking.id, route: "/booking-detail" }, sound: "default", color: "#0F8B83" },
        trigger: { type: notifications.SchedulableTriggerInputTypes.DATE, date: new Date(timing.notifyAt), channelId: CHANNEL_ID },
      });
      next[booking.id] = { notificationId, checkoutAt: timing.checkoutAt, notifyAt: timing.notifyAt };
    }
    await Promise.all(Object.entries(existing).filter(([bookingId]) => !next[bookingId]).map(([, item]) => notifications.cancelScheduledNotificationAsync(item.notificationId).catch(() => undefined)));
    await writeScheduled(next);
  } catch {
    // Notifications are optional. A device limitation must never block booking persistence.
  }
}
