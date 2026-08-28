import { describe, expect, it } from "vitest";

import { type Booking, type WaitlistEntry } from "../lib/booking-model";
import { getDailyOperations } from "../lib/daily-operations";

const booking = (overrides: Partial<Booking> = {}): Booking => ({ id: "b-1", customerName: "سامي", phone: "0790000000", chaletId: "c-1", startDate: "2026-08-22", endDate: "2026-08-22", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 100, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-21T12:00:00.000Z", ...overrides });
const waitlist = (overrides: Partial<WaitlistEntry> = {}): WaitlistEntry => ({ id: "w-1", customerName: "ليلى", phone: "0791111111", chaletId: "c-1", requestedDate: "2026-08-23", bookingType: "morning", notes: "", status: "active", createdAt: "2026-08-22T08:00:00.000Z", ...overrides });

describe("daily operations", () => {
  it("separates today’s arrivals, checkouts, outstanding balances, and active waitlist requests", () => {
    const now = new Date(2026, 7, 22, 10, 0).getTime();
    const queue = getDailyOperations([
      booking({ id: "arrival", startTime: "18:00", endTime: "23:00", price: 100 }),
      booking({ id: "checkout", startDate: "2026-08-21", endDate: "2026-08-22", startTime: "09:00", endTime: "20:00", price: 200, payments: [{ id: "p-1", amount: 200, date: "2026-08-21" }] }),
      booking({ id: "ended", startDate: "2026-08-21", endDate: "2026-08-22", startTime: "09:00", endTime: "09:00" }),
    ], [waitlist(), waitlist({ id: "expired", requestedDate: "2026-08-21", startTime: "09:00", endTime: "10:00" })], now);
    expect(queue.arrivals.map((item) => item.id)).toEqual(["arrival"]);
    expect(queue.checkouts.map((item) => item.id)).toEqual(["checkout"]);
    expect(queue.outstanding.map((item) => item.id)).toEqual(["arrival"]);
    expect(queue.waitlist.map((item) => item.id)).toEqual(["w-1"]);
  });

  it("applies the active chalet scope to every operational queue", () => {
    const now = new Date(2026, 7, 22, 10, 0).getTime();
    const queue = getDailyOperations([booking({ chaletId: "c-1", startTime: "18:00" }), booking({ id: "other", chaletId: "c-2", startTime: "19:00" })], [waitlist({ chaletId: "c-2" })], now, "c-1");
    expect(queue.arrivals.map((item) => item.id)).toEqual(["b-1"]);
    expect(queue.waitlist).toEqual([]);
  });
});
