import { describe, expect, it } from "vitest";

import { indexCalendarBookingsByDate } from "../lib/calendar-booking-index";
import type { Booking } from "../lib/booking-model";
import { readFileSync } from "node:fs";

const calendarSource = readFileSync(`${process.cwd()}/app/(tabs)/calendar.tsx`, "utf8");

function bookingForDay(index: number): Booking {
  const day = String((index % 30) + 1).padStart(2, "0");
  return {
    id: `load-${index}`,
    customerName: `ضيف ${index}`,
    phone: "0790000000",
    chaletId: `unit-${index % 3}`,
    startDate: `2026-08-${day}`,
    endDate: `2026-08-${day}`,
    bookingType: "morning",
    startTime: "09:00",
    endTime: "21:00",
    price: 100,
    payments: [],
    notes: "",
    status: "confirmed",
    createdAt: "2026-07-01T00:00:00.000Z",
  };
}

describe("calendar booking index", () => {
  it("indexes a large isolated booking set once by visible day while retaining every entry", () => {
    const bookings = Array.from({ length: 600 }, (_, index) => bookingForDay(index));
    const index = indexCalendarBookingsByDate(bookings);

    expect(index.size).toBe(30);
    expect([...index.values()].flat()).toHaveLength(600);
    expect(index.get("2026-08-01")).toHaveLength(20);
  });

  it("indexes an overnight stay on each day it visually covers", () => {
    const overnight = { ...bookingForDay(30), id: "overnight", bookingType: "evening" as const, startDate: "2026-08-01", endDate: "2026-08-01", startTime: "22:00", endTime: "09:00" };
    const index = indexCalendarBookingsByDate([overnight]);

    expect(index.get("2026-08-01")?.map((booking) => booking.id)).toEqual(["overnight"]);
    expect(index.get("2026-08-02")?.map((booking) => booking.id)).toEqual(["overnight"]);
  });

  it("keeps a dense single-day detail list virtualized to a small initial render batch", () => {
    const bookings = Array.from({ length: 120 }, (_, index) => ({ ...bookingForDay(index), id: `same-day-${index}`, startDate: "2026-08-15", endDate: "2026-08-15" }));
    const index = indexCalendarBookingsByDate(bookings);

    expect(index.get("2026-08-15")).toHaveLength(120);
    expect(calendarSource).toContain("<FlatList data={bookings}");
    expect(calendarSource).toContain("initialNumToRender={6}");
    expect(calendarSource).toContain("maxToRenderPerBatch={6}");
    expect(calendarSource).toContain("windowSize={5}");
  });
});
