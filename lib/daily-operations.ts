import { type Booking, type WaitlistEntry, getBookingStayTimeline, isWaitlistExpired, localDateISO, remainingAmount } from "./booking-model";

export type DailyOperations = {
  arrivals: Booking[];
  checkouts: Booking[];
  outstanding: Booking[];
  waitlist: WaitlistEntry[];
};

/** Builds the four operational queues that need attention during the current day. */
export function getDailyOperations(bookings: Booking[], waitlist: WaitlistEntry[], now = Date.now(), chaletId?: string | null): DailyOperations {
  const today = localDateISO(new Date(now));
  const scopedBookings = bookings.filter((booking) => booking.status !== "cancelled" && booking.status !== "completed" && (!chaletId || booking.chaletId === chaletId));
  const activeBookings = scopedBookings.filter((booking) => getBookingStayTimeline(booking, now).phase !== "ended");

  return {
    arrivals: activeBookings.filter((booking) => booking.startDate === today && getBookingStayTimeline(booking, now).phase === "upcoming"),
    checkouts: activeBookings.filter((booking) => booking.endDate === today && ["in-house", "checkout-warning"].includes(getBookingStayTimeline(booking, now).phase)),
    outstanding: activeBookings.filter((booking) => remainingAmount(booking) > 0),
    waitlist: waitlist.filter((entry) => entry.status === "active" && !isWaitlistExpired(entry, now) && (!chaletId || entry.chaletId === chaletId)),
  };
}
