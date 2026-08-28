import { describe, expect, it } from "vitest";

import { type Booking, getBookingTimestampRange } from "../lib/booking-model";
import { CHECKOUT_REMINDER_LEAD_MS, getCheckoutReminderTiming, reminderNeedsRescheduling } from "../lib/checkout-reminder";

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: "checkout-reminder",
  customerName: "أحمد",
  phone: "0790000000",
  chaletId: "chalet-1",
  chaletName: "النخلة",
  startDate: "2026-08-20",
  endDate: "2026-08-22",
  bookingType: "multi-day",
  startTime: "09:00",
  endTime: "21:00",
  price: 100,
  payments: [],
  notes: "",
  status: "confirmed",
  createdAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

describe("checkout reminder timing", () => {
  it("schedules exactly one hour before a multi-day checkout", () => {
    const value = booking();
    const { end } = getBookingTimestampRange(value);
    const reminder = getCheckoutReminderTiming(value, end - (4 * CHECKOUT_REMINDER_LEAD_MS));
    expect(reminder).toMatchObject({ bookingId: value.id, checkoutAt: end, notifyAt: end - CHECKOUT_REMINDER_LEAD_MS });
  });

  it("does not schedule an elapsed or non-active booking", () => {
    const value = booking();
    const { end } = getBookingTimestampRange(value);
    expect(getCheckoutReminderTiming(value, end - 30 * 60 * 1000)).toBeNull();
    expect(getCheckoutReminderTiming(booking({ status: "cancelled" }), end - 4 * CHECKOUT_REMINDER_LEAD_MS)).toBeNull();
  });

  it("keeps an unchanged scheduled reminder instead of duplicating it", () => {
    const value = booking();
    const { end } = getBookingTimestampRange(value);
    const timing = getCheckoutReminderTiming(value, end - 4 * CHECKOUT_REMINDER_LEAD_MS)!;
    expect(reminderNeedsRescheduling({ checkoutAt: timing.checkoutAt, notifyAt: timing.notifyAt }, timing)).toBe(false);
    expect(reminderNeedsRescheduling({ checkoutAt: timing.checkoutAt + 1, notifyAt: timing.notifyAt }, timing)).toBe(true);
  });
});
