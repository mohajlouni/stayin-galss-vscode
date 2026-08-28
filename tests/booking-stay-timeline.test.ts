import { describe, expect, it } from "vitest";

import { CHECKOUT_WARNING_MILLISECONDS, getBookingStayTimeline, getBookingTimestampRange, type Booking } from "../lib/booking-model";

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: "b-timeline",
  customerName: "سامي",
  phone: "0790000000",
  startDate: "2030-08-18",
  endDate: "2030-08-22",
  bookingType: "multi-day",
  startTime: "09:00",
  endTime: "21:00",
  price: 100,
  payments: [],
  notes: "",
  status: "confirmed",
  createdAt: "2030-08-18T08:00:00.000Z",
  ...overrides,
});

describe("live checkout timeline", () => {
  it("uses the booking's actual end date and end time rather than a fixed countdown", () => {
    const target = booking();
    const { end } = getBookingTimestampRange(target);
    const nearCheckout = getBookingStayTimeline(target, end - (93 * 60_000));
    const earlierStay = getBookingStayTimeline(target, end - CHECKOUT_WARNING_MILLISECONDS - 1);

    expect(nearCheckout.phase).toBe("checkout-warning");
    expect(nearCheckout.remainingMilliseconds).toBe(93 * 60_000);
    expect(earlierStay.phase).toBe("in-house");
  });

  it("keeps an overnight booking active until its actual next-day checkout timestamp", () => {
    const overnight = booking({ startDate: "2030-08-18", endDate: "2030-08-18", bookingType: "evening", startTime: "22:00", endTime: "09:00" });
    const { end } = getBookingTimestampRange(overnight);
    expect(getBookingStayTimeline(overnight, end - (30 * 60_000)).phase).toBe("checkout-warning");
    expect(getBookingStayTimeline(overnight, end).phase).toBe("ended");
  });
});
