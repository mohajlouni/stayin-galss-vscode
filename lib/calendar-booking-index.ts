import { type Booking, getBookingRange } from "./booking-model";

/** يفهرس الحجوزات المرئية مرة واحدة لكل يوم في التقويم، بدل تكرار مسح القائمة لكل خلية. */
export function indexCalendarBookingsByDate(bookings: readonly Booking[]): ReadonlyMap<string, Booking[]> {
  const bookingsByDate = new Map<string, Booking[]>();
  bookings.forEach((booking) => {
    const range = getBookingRange(booking);
    const firstDay = Math.floor(range.start / 1440);
    const lastDay = Math.floor((range.end - 1) / 1440);
    for (let day = firstDay; day <= lastDay; day += 1) {
      const date = new Date(day * 86_400_000).toISOString().slice(0, 10);
      const entries = bookingsByDate.get(date) ?? [];
      entries.push(booking);
      bookingsByDate.set(date, entries);
    }
  });
  return bookingsByDate;
}
