import { describe, expect, it } from "vitest";

import { isBookingPeriodEndedToday, isBookingStartDatePast, type Booking } from "../lib/booking-model";

const booking = (overrides: Partial<Booking> = {}): Booking => ({ id: "b-1", customerName: "سامي", phone: "0790000000", startDate: "2026-08-22", endDate: "2026-08-22", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 100, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-22T08:00:00.000Z", ...overrides });

describe("new booking time guard", () => {
  it("rejects a date before today", () => {
    const now = new Date(2026, 7, 22, 12, 0).getTime();
    expect(isBookingStartDatePast(booking({ startDate: "2026-08-21" }), now)).toBe(true);
    expect(isBookingStartDatePast(booking(), now)).toBe(false);
  });

  it("rejects the morning after its end time but keeps the upcoming evening available", () => {
    const now = new Date(2026, 7, 22, 21, 1).getTime();
    expect(isBookingPeriodEndedToday(booking(), now)).toBe(true);
    expect(isBookingPeriodEndedToday(booking({ bookingType: "evening", startTime: "22:00", endTime: "09:00" }), now)).toBe(false);
  });
});
