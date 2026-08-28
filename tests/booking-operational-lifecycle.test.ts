import { describe, expect, it } from "vitest";

import { expireElapsedRecords, getBookingOperationalState, normalizeAppData, splitBookingsByCheckout, type Booking } from "../lib/booking-model";

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "booking-1",
    customerName: "سعد",
    phone: "0799999999",
    chaletId: "chalet-1",
    chaletName: "آدم",
    startDate: "2026-08-23",
    endDate: "2026-08-23",
    bookingType: "morning",
    startTime: "09:00",
    endTime: "21:00",
    price: 100,
    payments: [],
    notes: "",
    status: "confirmed",
    createdAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("booking operational lifecycle", () => {
  it("does not expose checkout progress before a guest is checked in", () => {
    const now = new Date("2026-08-23T20:49:00").getTime();
    expect(getBookingOperationalState(booking(), now).state).toBe("late-arrival");
    expect(getBookingOperationalState(booking({ checkedInAt: "2026-08-23T10:00:00.000Z" }), now).state).toBe("checkout-warning");
  });

  it("keeps the expired unchecked record intact while moving it out of the active list", () => {
    const now = new Date("2026-08-23T22:00:00").getTime();
    const expired = booking();
    expect(getBookingOperationalState(expired, now).state).toBe("no-show");
    expect(splitBookingsByCheckout([expired], now).activeBookings).toHaveLength(0);
    expect(splitBookingsByCheckout([expired], now).historyBookings.map((item) => item.id)).toEqual(["booking-1"]);
    expect(expireElapsedRecords(normalizeAppData({ bookings: [expired] }), now).bookings[0].status).toBe("confirmed");
  });

  it("moves checked-out or archived bookings out of the active operating list", () => {
    const now = new Date("2026-08-23T22:00:00").getTime();
    const checkedOut = booking({ id: "booking-checked-out", checkedInAt: "2026-08-23T10:00:00.000Z", checkedOutAt: "2026-08-23T21:00:00.000Z", status: "completed" });
    const noShow = booking({ id: "booking-no-show", noShowAt: "2026-08-23T22:00:00.000Z", status: "cancelled" });
    const lists = splitBookingsByCheckout([checkedOut, noShow], now);
    expect(lists.activeBookings).toHaveLength(0);
    expect(lists.historyBookings.map((item) => item.id)).toEqual(["booking-checked-out", "booking-no-show"]);
  });

  it("moves an elapsed checked-in stay to history without altering its stored status", () => {
    const now = new Date("2026-08-23T22:00:00").getTime();
    const occupied = booking({ checkedInAt: "2026-08-23T10:00:00.000Z" });
    expect(getBookingOperationalState(occupied, now).state).toBe("checkout-warning");
    const normalized = expireElapsedRecords(normalizeAppData({ bookings: [occupied] }), now);
    expect(normalized.bookings[0].status).toBe("confirmed");
    expect(splitBookingsByCheckout(normalized.bookings, now).activeBookings).toHaveLength(0);
    expect(splitBookingsByCheckout(normalized.bookings, now).historyBookings.map((item) => item.id)).toEqual(["booking-1"]);
  });
});
