import { type Booking, type Chalet, getBookingStayTimeline, remainingAmount, remainingRefundableDeposit } from "./booking-model";
import { type ReportRange } from "./reporting";

export type ReportBusinessInsights = {
  occupancyRate: number;
  bookedChaletDays: number;
  availableChaletDays: number;
  expectedCollection: number;
  outstandingBookingCount: number;
  overdueDepositAmount: number;
  overdueDepositCount: number;
};

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function rangeBounds(bookings: Booking[], range: ReportRange, today: string) {
  if (range === "today") return { start: today, end: today };
  if (range === "month") {
    const start = `${today.slice(0, 7)}-01`;
    const lastDay = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
    return { start, end: `${today.slice(0, 7)}-${String(lastDay).padStart(2, "0")}` };
  }
  const dates = bookings.flatMap((booking) => [booking.startDate, booking.endDate]).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  return { start: dates.sort()[0] ?? today, end: dates.sort().at(-1) ?? today };
}

/** Computes decision-oriented, day-level occupancy and collection risk from the selected report scope. */
export function buildReportBusinessInsights(bookings: Booking[], chalets: Chalet[], range: ReportRange, today: string, selectedChaletId?: string | null, now = Date.now()): ReportBusinessInsights {
  const scopeChalets = selectedChaletId ? chalets.filter((chalet) => chalet.id === selectedChaletId) : chalets;
  const scopedBookings = bookings.filter((booking) => booking.status !== "cancelled" && booking.status !== "waitlisted" && (!selectedChaletId || booking.chaletId === selectedChaletId));
  const { start, end } = rangeBounds(scopedBookings, range, today);
  const activeDates = new Set<string>();
  for (let date = start; date <= end; date = addDays(date, 1)) activeDates.add(date);
  const occupiedKeys = new Set<string>();
  scopedBookings.forEach((booking) => {
    for (let date = booking.startDate; date <= booking.endDate; date = addDays(date, 1)) if (activeDates.has(date) && booking.chaletId) occupiedKeys.add(`${booking.chaletId}:${date}`);
  });
  const availableChaletDays = activeDates.size * scopeChalets.length;
  const bookedChaletDays = occupiedKeys.size;
  const outstanding = scopedBookings.filter((booking) => remainingAmount(booking) > 0);
  const overdueDeposit = scopedBookings.filter((booking) => remainingRefundableDeposit(booking) > 0 && getBookingStayTimeline(booking, now).phase === "ended");
  return {
    occupancyRate: availableChaletDays > 0 ? Math.min(100, Math.round((bookedChaletDays / availableChaletDays) * 100)) : 0,
    bookedChaletDays,
    availableChaletDays,
    expectedCollection: outstanding.reduce((sum, booking) => sum + remainingAmount(booking), 0),
    outstandingBookingCount: outstanding.length,
    overdueDepositAmount: overdueDeposit.reduce((sum, booking) => sum + remainingRefundableDeposit(booking), 0),
    overdueDepositCount: overdueDeposit.length,
  };
}
