import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { type Booking } from "./booking-model";
import { checkoutReminderCopy, getCheckoutReminderTiming, reminderNeedsRescheduling } from "./checkout-reminder";

const STORAGE_KEY = "hajez-checkout-reminders-v1";
const CHANNEL_ID = "checkout-reminders";

type ScheduledReminder = { notificationId: string; checkoutAt: number; notifyAt: number };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

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

async function prepareAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Checkout reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 220, 120, 220],
    lightColor: "#0F8B83",
  });
}

/** Requests notification permission only after the user explicitly enables local notifications. */
export async function requestCheckoutNotificationPermission() {
  if (Platform.OS === "web") return false;
  try {
    await prepareAndroidChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === "granted";
  } catch {
    return false;
  }
}

/** Synchronizes one reminder per active reservation and cancels stale or edited reminders. */
export async function syncCheckoutNotifications(bookings: Booking[], chalets: Array<{ id: string; name: string }>, enabled: boolean, language: "ar" | "en") {
  if (Platform.OS === "web") return;
  const existing = await readScheduled();
  const next: Record<string, ScheduledReminder> = {};
  if (!enabled) {
    await Promise.all(Object.values(existing).map((item) => Notifications.cancelScheduledNotificationAsync(item.notificationId).catch(() => undefined)));
    await writeScheduled(next);
    return;
  }
  try {
    await prepareAndroidChannel();
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted") return;
    for (const booking of bookings) {
      const timing = getCheckoutReminderTiming(booking);
      if (!timing) continue;
      const current = existing[booking.id];
      if (!reminderNeedsRescheduling(current, timing)) {
        next[booking.id] = current;
        continue;
      }
      if (current) await Notifications.cancelScheduledNotificationAsync(current.notificationId).catch(() => undefined);
      const chaletName = chalets.find((chalet) => chalet.id === booking.chaletId)?.name ?? booking.chaletName;
      const copy = checkoutReminderCopy(booking, chaletName, language);
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: { ...copy, data: { bookingId: booking.id, route: "/booking-detail" }, sound: "default", color: "#0F8B83" },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(timing.notifyAt), channelId: CHANNEL_ID },
      });
      next[booking.id] = { notificationId, checkoutAt: timing.checkoutAt, notifyAt: timing.notifyAt };
    }
    await Promise.all(Object.entries(existing).filter(([bookingId]) => !next[bookingId]).map(([, item]) => Notifications.cancelScheduledNotificationAsync(item.notificationId).catch(() => undefined)));
    await writeScheduled(next);
  } catch {
    // Notifications are optional. A device limitation must never block booking persistence.
  }
}
