import { describe, expect, it } from "vitest";

import { type Booking } from "../lib/booking-model";
import { getTurnoverTaskCandidates } from "../lib/turnover-tasks";

const booking = (overrides: Partial<Booking> = {}): Booking => ({ id: "checkout", customerName: "سامي", phone: "0790000000", chaletId: "c-1", chaletName: "النوح", startDate: "2026-08-21", endDate: "2026-08-22", bookingType: "morning", startTime: "09:00", endTime: "09:00", price: 100, payments: [], notes: "", status: "completed", createdAt: "2026-08-20T10:00:00.000Z", ...overrides });

describe("turnover tasks", () => {
  it("creates a cleaning candidate only when a next booking is within the turnover window", () => {
    const now = new Date(2026, 7, 22, 10, 0).getTime();
    const tasks = getTurnoverTaskCandidates([booking(), booking({ id: "next", customerName: "ليلى", startDate: "2026-08-22", endDate: "2026-08-22", startTime: "18:00", endTime: "23:00", status: "confirmed" })], [], now);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe("turnover-checkout");
    expect(tasks[0]?.nextBooking.id).toBe("next");
  });

  it("only appears during the final checkout hour and when the incoming booking is within 24 hours", () => {
    const nextToday = booking({ id: "next-today", customerName: "ليلى", startDate: "2026-08-22", endDate: "2026-08-22", startTime: "18:00", endTime: "23:00", status: "confirmed" });
    const nextInTwoDays = booking({ id: "next-future", customerName: "نورا", startDate: "2026-08-24", endDate: "2026-08-24", startTime: "09:00", endTime: "21:00", status: "confirmed" });
    const beforeFinalHour = new Date(2026, 7, 22, 7, 30).getTime();
    const finalHour = new Date(2026, 7, 22, 8, 0).getTime();
    expect(getTurnoverTaskCandidates([booking(), nextToday], [], beforeFinalHour)).toEqual([]);
    expect(getTurnoverTaskCandidates([booking(), nextToday], [], finalHour)).toHaveLength(1);
    expect(getTurnoverTaskCandidates([booking(), nextInTwoDays], [], finalHour)).toEqual([]);
  });

  it("uses stored status and respects the selected chalet", () => {
    const now = new Date(2026, 7, 22, 10, 0).getTime();
    const tasks = getTurnoverTaskCandidates([booking(), booking({ id: "next", customerName: "ليلى", startDate: "2026-08-22", endDate: "2026-08-22", startTime: "18:00", endTime: "23:00", status: "confirmed" })], [{ id: "turnover-checkout", checkoutBookingId: "checkout", nextBookingId: "next", chaletId: "c-1", chaletName: "النوح", dueAt: "2026-08-22T18:00:00.000Z", status: "in-progress", createdAt: "2026-08-22T09:00:00.000Z" }], now, "c-1");
    expect(tasks[0]?.status).toBe("in-progress");
    expect(tasks[0]?.startedAt).toBeUndefined();
    expect(getTurnoverTaskCandidates([booking()], [], now, "c-2")).toEqual([]);
  });
});
