import { type Booking, type WaitlistEntry, getBookingTimestampRange, isWaitlistExpired, totalPaid } from "./booking-model";
import { findBookingConflicts } from "../services/availabilityService";

export const WAITLIST_PRIORITY_LEAD_MS = 24 * 60 * 60 * 1000;

export type WaitlistPriorityCandidate = {
  booking: Booking;
  entry: WaitlistEntry;
  bookingStartAt: number;
  notifyAt: number;
};

function isActiveUnpaidBooking(booking: Booking) {
  return (booking.status === "confirmed" || booking.status === "awaiting-deposit") && totalPaid(booking) <= 0;
}

function waitlistConflictsWithBooking(entry: WaitlistEntry, booking: Booking, now: number) {
  if (entry.status !== "active" || isWaitlistExpired(entry, now)) return false;
  const configuredStart = entry.startTime ?? "09:00";
  const configuredEnd = entry.endTime ?? "21:00";
  return findBookingConflicts({ chaletId: entry.chaletId, chaletName: entry.chaletName, startDate: entry.requestedDate, endDate: entry.endDate ?? entry.requestedDate, bookingType: entry.bookingType, startTime: configuredStart, endTime: configuredEnd }, [booking]).some((conflict) => conflict.id === booking.id);
}

/** Returns unpaid future bookings that compete with an active waitlist request for the same occupied time. */
export function waitlistPriorityCandidates(bookings: Booking[], waitlist: WaitlistEntry[], now = Date.now()): WaitlistPriorityCandidate[] {
  return bookings.flatMap((booking) => {
    if (!isActiveUnpaidBooking(booking)) return [];
    const { start: bookingStartAt } = getBookingTimestampRange(booking);
    if (!Number.isFinite(bookingStartAt) || bookingStartAt <= now) return [];
    return waitlist.filter((entry) => booking.waitlistPriorityAcknowledgedForId !== entry.id && waitlistConflictsWithBooking(entry, booking, now)).map((entry) => ({ booking, entry, bookingStartAt, notifyAt: bookingStartAt - WAITLIST_PRIORITY_LEAD_MS }));
  });
}

/** Returns a schedulable 24-hour reminder only when the trigger is still in the future. */
export function getWaitlistPriorityReminderTiming(candidate: WaitlistPriorityCandidate, now = Date.now()) {
  if (candidate.notifyAt <= now) return null;
  return { bookingId: candidate.booking.id, waitlistId: candidate.entry.id, bookingStartAt: candidate.bookingStartAt, notifyAt: candidate.notifyAt };
}

/** A decision card becomes visible from the 24-hour window until the booking starts. */
export function isWaitlistPriorityDue(candidate: WaitlistPriorityCandidate, now = Date.now()) {
  return candidate.bookingStartAt > now && candidate.bookingStartAt - now <= WAITLIST_PRIORITY_LEAD_MS;
}
