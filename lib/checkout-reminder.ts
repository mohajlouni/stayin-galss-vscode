import { type Booking, getBookingTimestampRange } from "./booking-model";

export const CHECKOUT_REMINDER_LEAD_MS = 60 * 60 * 1000;

export type CheckoutReminderTiming = {
  bookingId: string;
  checkoutAt: number;
  notifyAt: number;
};

export type StoredCheckoutReminder = Pick<CheckoutReminderTiming, "checkoutAt" | "notifyAt">;

/** Returns a one-hour-before-checkout reminder only when it is still schedulable. */
export function getCheckoutReminderTiming(booking: Booking, now = Date.now()): CheckoutReminderTiming | null {
  if (booking.status !== "confirmed" && booking.status !== "awaiting-deposit") return null;
  const { end } = getBookingTimestampRange(booking);
  const notifyAt = end - CHECKOUT_REMINDER_LEAD_MS;
  if (!Number.isFinite(end) || notifyAt <= now) return null;
  return { bookingId: booking.id, checkoutAt: end, notifyAt };
}

export function reminderNeedsRescheduling(stored: StoredCheckoutReminder | undefined, timing: CheckoutReminderTiming) {
  return !stored || stored.checkoutAt !== timing.checkoutAt || stored.notifyAt !== timing.notifyAt;
}

export function checkoutReminderCopy(booking: Booking, chaletName: string | undefined, language: "ar" | "en") {
  const location = chaletName?.trim() || (language === "ar" ? "الشاليه" : "the chalet");
  return language === "ar"
    ? { title: "مغادرة بعد ساعة", body: `يتبقى ساعة واحدة لمغادرة ${booking.customerName} من ${location}.` }
    : { title: "Checkout in one hour", body: `${booking.customerName} checks out of ${location} in one hour.` };
}
