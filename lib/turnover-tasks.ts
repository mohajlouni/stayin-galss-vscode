import { type Booking, type TurnoverTask, getBookingTimestampRange } from "./booking-model";

export type TurnoverTaskCandidate = TurnoverTask & {
  checkoutBooking: Booking;
  nextBooking: Booking;
};

export const TURNOVER_CHECKOUT_LEAD_MS = 60 * 60 * 1000;
export const TURNOVER_NEXT_ARRIVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Finds completed stays that need cleaning or inspection before the next reservation. */
export function getTurnoverTaskCandidates(bookings: Booking[], storedTasks: TurnoverTask[], now = Date.now(), chaletId?: string | null): TurnoverTaskCandidate[] {
  const operational = bookings.filter((booking) => booking.status !== "cancelled" && booking.status !== "waitlisted" && (!chaletId || booking.chaletId === chaletId));
  const savedById = new Map(storedTasks.map((task) => [task.id, task]));
  return operational.flatMap((checkoutBooking) => {
    const checkoutRange = getBookingTimestampRange(checkoutBooking);
    if (!Number.isFinite(checkoutRange.end) || checkoutRange.end - now > TURNOVER_CHECKOUT_LEAD_MS) return [];
    const nextBooking = operational
      .filter((booking) => booking.id !== checkoutBooking.id && booking.chaletId === checkoutBooking.chaletId)
      .map((booking) => ({ booking, range: getBookingTimestampRange(booking) }))
      .filter(({ range }) => {
        const isFutureArrival = range.start >= now && range.start - now <= TURNOVER_NEXT_ARRIVAL_WINDOW_MS;
        const isCurrentArrival = range.start < now && range.end >= now;
        return Number.isFinite(range.start) && range.start > checkoutRange.end && (isFutureArrival || isCurrentArrival);
      })
      .sort((left, right) => left.range.start - right.range.start)[0]?.booking;
    if (!nextBooking) return [];
    const id = `turnover-${checkoutBooking.id}`;
    const existing = savedById.get(id);
    return [{
      id,
      checkoutBookingId: checkoutBooking.id,
      nextBookingId: nextBooking.id,
      chaletId: checkoutBooking.chaletId,
      chaletName: checkoutBooking.chaletName,
      dueAt: new Date(getBookingTimestampRange(nextBooking).start).toISOString(),
      status: existing?.status ?? "pending",
      createdAt: existing?.createdAt ?? new Date(checkoutRange.end).toISOString(),
      startedAt: existing?.startedAt,
      completedAt: existing?.completedAt,
      completedByName: existing?.completedByName,
      checkoutBooking,
      nextBooking,
    }];
  }).sort((left, right) => left.dueAt.localeCompare(right.dueAt));
}
