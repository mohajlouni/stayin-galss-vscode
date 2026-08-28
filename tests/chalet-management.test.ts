import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, availableChaletSlotsForDate, availableSiblingSlotForBooking, chaletPerformanceSummary, findConflicts, normalizeAppData, singleAvailableChaletSlotForDate, singleAvailableChaletSlotsForDates } from "../lib/booking-model";

const baseBooking = {
  id: "booking-1",
  customerName: "عميل",
  phone: "0790000000",
  chaletName: "الوردة",
  startDate: "2026-08-20",
  endDate: "2026-08-20",
  bookingType: "morning" as const,
  startTime: "09:00",
  endTime: "21:00",
  price: 100,
  payments: [],
  notes: "",
  status: "confirmed" as const,
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("chalet management data", () => {
  it("migrates legacy chalet names without removing bookings", () => {
    const data = normalizeAppData({ bookings: [baseBooking], waitlist: [], settings: DEFAULT_SETTINGS });
    expect(data.bookings).toHaveLength(1);
    expect(data.bookings[0].customerName).toBe("عميل");
    expect(data.chalets).toHaveLength(1);
    expect(data.chalets[0].name).toBe("الوردة");
    expect(data.bookings[0].chaletId).toBe(data.chalets[0].id);
  });

  it("keeps every chalet when the workspace contains more units than any former UI limit", () => {
    const chalets = Array.from({ length: 40 }, (_, index) => ({ id: `chalet-${index}`, name: `شاليه ${index + 1}`, color: "#0F8B83", createdAt: "2026-08-01T00:00:00.000Z" }));
    const data = normalizeAppData({ chalets });
    expect(data.chalets).toHaveLength(40);
    expect(data.chalets[39]).toMatchObject({ id: "chalet-39", name: "شاليه 40" });
  });

  it("treats matching times in different chalets as non-conflicting", () => {
    const existing = { ...baseBooking, chaletId: "rose" };
    const candidate = { ...baseBooking, id: "booking-2", chaletId: "jasmine", chaletName: "الياسمين" };
    expect(findConflicts(candidate, [existing])).toEqual([]);
  });

  it("keeps conflicts inside the same chalet", () => {
    const existing = { ...baseBooking, chaletId: "rose" };
    const candidate = { ...baseBooking, id: "booking-2", chaletId: "rose" };
    expect(findConflicts(candidate, [existing])).toHaveLength(1);
  });

  it("preserves a chalet's independent rates and period times during normalization", () => {
    const data = normalizeAppData({
      bookings: [{ ...baseBooking, chaletId: "rose" }],
      waitlist: [],
      settings: DEFAULT_SETTINGS,
      chalets: [{
        id: "rose",
        name: "الوردة",
        color: "#0F8B83",
        imageUri: "file:///data/user/0/hajez/chalet-images/rose.jpg",
        createdAt: "2026-08-01T00:00:00.000Z",
        periodPricing: {
          morning: { weekdayPrice: 80, weekendPrice: 100 },
          evening: { weekdayPrice: 110, weekendPrice: 135 },
          "24h": { weekdayPrice: 165, weekendPrice: 190 },
        },
        periodTimes: {
          morning: { startTime: "08:00", endTime: "18:00" },
          evening: { startTime: "19:00", endTime: "06:00" },
          "24h": { startTime: "12:00", endTime: "12:00" },
        },
      }],
    });

    expect(data.chalets[0].periodPricing?.evening.weekendPrice).toBe(135);
    expect(data.chalets[0].periodTimes?.morning).toEqual({ startTime: "08:00", endTime: "18:00" });
    expect(data.chalets[0].imageUri).toContain("chalet-images/rose.jpg");
  });

  it("calculates occupancy and rental performance for one chalet without counting cancelled bookings", () => {
    const summary = chaletPerformanceSummary("rose", [
      { ...baseBooking, chaletId: "rose", endDate: "2026-08-21", price: 150, payments: [{ id: "p-1", amount: 60, date: "2026-08-01" }] },
      { ...baseBooking, id: "booking-2", chaletId: "rose", startDate: "2026-08-25", endDate: "2026-08-25", price: 90, payments: [{ id: "p-2", amount: 90, date: "2026-08-02" }], status: "completed" },
      { ...baseBooking, id: "booking-3", chaletId: "rose", price: 200, status: "cancelled" },
      { ...baseBooking, id: "booking-4", chaletId: "jasmine", price: 300 },
    ]);

    expect(summary).toEqual({ bookingCount: 2, occupiedDays: 3, rentalRevenue: 240, paidRevenue: 150, outstandingBalance: 90 });
  });

  it("exposes only truly free shifts for the chalet on the selected day", () => {
    expect(availableChaletSlotsForDate("rose", "2026-08-20", [{ ...baseBooking, chaletId: "rose", bookingType: "evening", startTime: "22:00", endTime: "09:00" }])).toEqual(["morning"]);
    expect(availableChaletSlotsForDate("rose", "2026-08-20", [{ ...baseBooking, chaletId: "rose", bookingType: "24h", startTime: "09:00", endTime: "09:00" }])).toEqual([]);
  });

  it("offers a quick-book slot only when exactly one half-day shift remains", () => {
    expect(singleAvailableChaletSlotForDate("rose", "2026-08-20", [{ ...baseBooking, chaletId: "rose", bookingType: "morning" }])).toBe("evening");
    expect(singleAvailableChaletSlotForDate("rose", "2026-08-20", [{ ...baseBooking, chaletId: "rose", bookingType: "evening", startTime: "22:00", endTime: "09:00" }])).toBe("morning");
    expect(singleAvailableChaletSlotForDate("rose", "2026-08-20", [])).toBeUndefined();
  });

  it("lists quick-book vacancies per chalet and ignores fully occupied dates", () => {
    const bookings = [
      { ...baseBooking, chaletId: "rose", bookingType: "morning" as const },
      { ...baseBooking, id: "booking-2", chaletId: "jasmine", bookingType: "24h" as const, startTime: "09:00", endTime: "09:00" },
    ];
    expect(singleAvailableChaletSlotsForDates(["2026-08-20", "2026-08-20"], bookings)).toEqual([{ chaletId: "rose", date: "2026-08-20", period: "evening" }]);
  });

  it("attaches a vacancy only to a half-day booking, never a free or fully occupied day", () => {
    const morning = { ...baseBooking, chaletId: "rose", bookingType: "morning" as const };
    const fullDay = { ...baseBooking, id: "booking-2", chaletId: "rose", bookingType: "24h" as const, startTime: "09:00", endTime: "09:00" };
    expect(availableSiblingSlotForBooking(morning, [morning])).toBe("evening");
    expect(availableSiblingSlotForBooking(fullDay, [fullDay])).toBeUndefined();
  });
});
