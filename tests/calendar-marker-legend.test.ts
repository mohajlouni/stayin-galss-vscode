import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const calendar = readFileSync(`${process.cwd()}/app/(tabs)/calendar.tsx`, "utf8");

describe("calendar marker and legend context", () => {
  it("uses colored property-type icons for all-units markers and reserved period colors for a selected chalet", () => {
    expect(calendar).toContain('markerMode={isAllUnitsView ? "unit" : "period"}');
    expect(calendar).toContain("const chaletMarkers = useMemo(() => Object.fromEntries");
    expect(calendar).toContain("chaletMarkers={chaletMarkers}");
    expect(calendar).toContain("<MaterialIcons name={marker?.icon ?? \"holiday-village\"}");
    expect(calendar).toContain("reservedPeriodColorForBookingType(booking.bookingType)");
  });

  it("switches the legend from units to the calendar period palette with a separate waitlist marker", () => {
    expect(calendar).toContain("{isAllUnitsView ? <>");
    expect(calendar).toContain("selectedPeriodLegend.map((key) => <Legend");
    expect(calendar).toContain("RESERVED_PERIOD_META[key][language]");
    expect(calendar).toContain("PERIOD_COLORS.waitlist");
  });

  it("defines clear marker colors for morning, evening, overnight, multi-day, and custom bookings", () => {
    expect(calendar).toContain("RESERVED_PERIOD_COLORS");
    expect(calendar).toContain('"morning", "evening", "overnight", "full_day", "event", "custom"');
  });

  it("indexes a day summary once and reads arrival and checkout markers from normalized saved date keys", () => {
    expect(calendar).toContain("const calendarDaySummaries = useMemo(() => {");
    expect(calendar).toContain("ensureSummary(booking.startDate.slice(0, 10)).arrivals += 1");
    expect(calendar).toContain("ensureSummary(booking.endDate.slice(0, 10)).departures += 1");
    expect(calendar).toContain("const summary = daySummary(date)");
    expect(calendar).not.toContain("Math.floor(getBookingRange(booking).end / 1440)");
  });
});
