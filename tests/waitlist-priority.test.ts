import { describe, expect, it } from "vitest";

import { type Booking, type WaitlistEntry, getBookingTimestampRange } from "../lib/booking-model";
import { WAITLIST_PRIORITY_LEAD_MS, getWaitlistPriorityReminderTiming, isWaitlistPriorityDue, waitlistPriorityCandidates } from "../lib/waitlist-priority";

const booking = (overrides: Partial<Booking> = {}): Booking => ({ id: "booking-1", customerName: "سامي", phone: "0790000000", chaletId: "chalet-1", chaletName: "المايا", startDate: "2026-09-10", endDate: "2026-09-10", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 100, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-01T00:00:00.000Z", ...overrides });
const waitlist = (overrides: Partial<WaitlistEntry> = {}): WaitlistEntry => ({ id: "waitlist-1", customerName: "قيس", phone: "0790000001", chaletId: "chalet-1", chaletName: "المايا", requestedDate: "2026-09-10", endDate: "2026-09-10", bookingType: "morning", startTime: "09:00", endTime: "21:00", notes: "", status: "active", createdAt: "2026-08-01T00:00:00.000Z", ...overrides });

describe("waitlist priority alert", () => {
  it("finds an unpaid booking that conflicts with an active waitlist request and schedules one day earlier", () => {
    const value = booking();
    const { start } = getBookingTimestampRange(value);
    const candidates = waitlistPriorityCandidates([value], [waitlist()], start - 2 * WAITLIST_PRIORITY_LEAD_MS);
    expect(candidates).toHaveLength(1);
    expect(getWaitlistPriorityReminderTiming(candidates[0], start - 2 * WAITLIST_PRIORITY_LEAD_MS)).toMatchObject({ bookingId: value.id, waitlistId: "waitlist-1", notifyAt: start - WAITLIST_PRIORITY_LEAD_MS });
  });

  it("shows the decision only during the final 24 hours and skips paid, acknowledged, or non-conflicting records", () => {
    const value = booking();
    const { start } = getBookingTimestampRange(value);
    const candidate = waitlistPriorityCandidates([value], [waitlist()], start - 2 * WAITLIST_PRIORITY_LEAD_MS)[0];
    expect(isWaitlistPriorityDue(candidate, start - WAITLIST_PRIORITY_LEAD_MS)).toBe(true);
    expect(waitlistPriorityCandidates([booking({ payments: [{ id: "p-1", amount: 10, date: "2026-08-01" }] })], [waitlist()], start - 2 * WAITLIST_PRIORITY_LEAD_MS)).toHaveLength(0);
    expect(waitlistPriorityCandidates([booking({ waitlistPriorityAcknowledgedForId: "waitlist-1" })], [waitlist()], start - 2 * WAITLIST_PRIORITY_LEAD_MS)).toHaveLength(0);
    expect(waitlistPriorityCandidates([value], [waitlist({ chaletId: "other" })], start - 2 * WAITLIST_PRIORITY_LEAD_MS)).toHaveLength(0);
  });
});
