import { describe, expect, it } from "vitest";

import { bookingToWaitlistEntry, expireElapsedRecords, isWaitlistExpired, waitlistCountdownLabel, type Booking } from "../lib/booking-model";

const booking: Booking = { id: "booking-1", customerName: "سامي", phone: "0790000000", chaletId: "noah", chaletName: "النوح", startDate: "2026-08-23", endDate: "2026-08-23", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 125, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-22T10:00:00.000Z" };

describe("waitlist lifecycle", () => {
  it("cancels a waiting request at its booking start rather than its checkout", () => {
    const entry = bookingToWaitlistEntry(booking, "wait-1");
    const start = Date.UTC(2026, 7, 23, 9, 0);
    expect(isWaitlistExpired(entry, start - 60_000)).toBe(false);
    expect(isWaitlistExpired(entry, start)).toBe(true);
  });

  it("formats the remaining cancellation deadline from the same start timestamp", () => {
    const entry = bookingToWaitlistEntry(booking, "wait-1");
    const now = Date.UTC(2026, 7, 23, 7, 35);
    expect(waitlistCountdownLabel(entry, now, "ar")).toBe("ساعة واحدة و25 دقيقة");
    expect(waitlistCountdownLabel(entry, now, "en")).toBe("1 h 25 m");
  });

  it("keeps the cancelled request and an audit record in its history", () => {
    const entry = bookingToWaitlistEntry(booking, "wait-1");
    const start = Date.UTC(2026, 7, 23, 9, 0);
    const result = expireElapsedRecords({ bookings: [], waitlist: [entry], turnoverTasks: [], chalets: [], specialPriceRules: [], auditLog: [], settings: { businessName: "", businessPhone: "", currency: "د.أ", bookingTypes: { morning: { label: "صباحي", startTime: "09:00", endTime: "21:00" }, evening: { label: "سهرة", startTime: "22:00", endTime: "09:00" }, "24h": { label: "24 ساعة", startTime: "09:00", endTime: "09:00" }, custom: { label: "مخصص", startTime: "09:00", endTime: "17:00" }, "multi-day": { label: "عدة أيام", startTime: "09:00", endTime: "21:00" } } } }, start);
    expect(result.waitlist[0]).toMatchObject({ status: "cancelled", cancellationReason: "start-time" });
    expect(result.auditLog[0]).toMatchObject({ action: "waitlist-cancelled", subjectName: "سامي" });
  });

  it("moves a legacy waiting request that exactly matches its confirmed promoted booking into conversion history", () => {
    const entry = bookingToWaitlistEntry(booking, "wait-legacy");
    const result = expireElapsedRecords({ bookings: [booking], waitlist: [entry], turnoverTasks: [], chalets: [], specialPriceRules: [], auditLog: [], settings: { businessName: "", businessPhone: "", currency: "د.أ", bookingTypes: { morning: { label: "صباحي", startTime: "09:00", endTime: "21:00" }, evening: { label: "سهرة", startTime: "22:00", endTime: "09:00" }, "24h": { label: "24 ساعة", startTime: "09:00", endTime: "09:00" }, custom: { label: "مخصص", startTime: "09:00", endTime: "17:00" }, "multi-day": { label: "عدة أيام", startTime: "09:00", endTime: "21:00" } } } }, Date.UTC(2026, 7, 22, 10, 0));
    expect(result.waitlist[0]).toMatchObject({ status: "promoted", promotedBookingId: "booking-1", promotedBookingReference: booking.bookingReference });
    expect(result.auditLog[0]).toMatchObject({ action: "waitlist-promoted", subjectName: "سامي" });
  });
});
