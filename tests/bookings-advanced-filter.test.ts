import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(`${process.cwd()}/app/(tabs)/bookings.tsx`, "utf8");

describe("bookings tabs and advanced filters", () => {
  it("keeps active and ended-stay tabs inside the regular bookings screen", () => {
    expect(source).toContain('useState<"active" | "history">("active")');
    expect(source).toContain('"الحجوزات النشطة"');
    expect(source).toContain('"منتهي الإقامة"');
    expect(source).not.toContain("isMoreHistory");
  });

  it("filters bookings by search and an optional from-to date range", () => {
    expect(source).toContain("bookingMatchesSearch");
    expect(source).toContain("matchesDateRange");
    expect(source).toContain("dateFrom");
    expect(source).toContain("dateTo");
    expect(source).toContain('"من تاريخ"');
    expect(source).toContain('"إلى تاريخ"');
    expect(source).toContain("draftDateFrom > draftDateTo");
  });

  it("normalizes date keys and keeps multi-day stays visible when their range intersects the filter", () => {
    expect(source).toContain("function bookingDateKey(date: string)");
    expect(source).toContain("const bookingEndDate = bookingDateKey(booking.endDate)");
    expect(source).toContain("if (fromDate && bookingEndDate < fromDate) return false");
    expect(source).toContain("if (toDate && bookingStartDate > toDate) return false");
    expect(source).toContain("const firstPast = bookingDateKey(first.startDate) < todayKey");
    expect(source).not.toContain("const firstPast = first.startDate < todayKey");
  });
});
