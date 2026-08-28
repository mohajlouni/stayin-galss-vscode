import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { type Booking, type WaitlistEntry } from "./booking-model";
import { getWaitlistPriorityReminderTiming, waitlistPriorityCandidates } from "./waitlist-priority";

const STORAGE_KEY = "hajez-waitlist-priority-reminders-v1";
const CHANNEL_ID = "waitlist-priority-reminders";

type ScheduledReminder = { notificationId: string; bookingStartAt: number; notifyAt: number };

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

async function prepareAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: "تنبيهات أولوية الحجز", importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 220, 120, 220], lightColor: "#F59E0B" });
}

/** Schedules one reminder per unpaid booking / active-waitlist pair and cancels stale reminders. */
export async function syncWaitlistPriorityNotifications(bookings: Booking[], waitlist: WaitlistEntry[], enabled: boolean, language: "ar" | "en") {
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
    if ((await Notifications.getPermissionsAsync()).status !== "granted") return;
    for (const candidate of waitlistPriorityCandidates(bookings, waitlist)) {
      const timing = getWaitlistPriorityReminderTiming(candidate);
      if (!timing) continue;
      const key = `${timing.bookingId}:${timing.waitlistId}`;
      const current = existing[key];
      if (current?.bookingStartAt === timing.bookingStartAt && current.notifyAt === timing.notifyAt) {
        next[key] = current;
        continue;
      }
      if (current) await Notifications.cancelScheduledNotificationAsync(current.notificationId).catch(() => undefined);
      const title = language === "ar" ? "حجز غير مدفوع أمام طلب انتظار" : "Unpaid booking has a waitlist request";
      const body = language === "ar" ? `حجز ${candidate.booking.customerName} غدًا بلا دفعة، ويوجد طلب انتظار للعميل ${candidate.entry.customerName}. راجع القرار الآن.` : `${candidate.booking.customerName}'s booking is tomorrow with no payment, and ${candidate.entry.customerName} is waiting for the same slot.`;
      const notificationId = await Notifications.scheduleNotificationAsync({ content: { title, body, data: { bookingId: timing.bookingId, waitlistId: timing.waitlistId, route: "/bookings" }, sound: "default", color: "#F59E0B" }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(timing.notifyAt), channelId: CHANNEL_ID } });
      next[key] = { notificationId, bookingStartAt: timing.bookingStartAt, notifyAt: timing.notifyAt };
    }
    await Promise.all(Object.entries(existing).filter(([key]) => !next[key]).map(([, item]) => Notifications.cancelScheduledNotificationAsync(item.notificationId).catch(() => undefined)));
    await writeScheduled(next);
  } catch {
    // Local reminders are optional and must never block booking persistence.
  }
}
