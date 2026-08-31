import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const calendar = readFileSync(`${process.cwd()}/app/(tabs)/calendar.tsx`, "utf8");

describe("calendar marker and legend context", () => {
  it("colors every booking dot with the booked unit color and adds a +N overflow badge", () => {
    expect(calendar).toContain("const chaletMarkers = useMemo(() => Object.fromEntries");
    expect(calendar).toContain("chaletMarkers={chaletMarkers}");
    expect(calendar).toContain("chaletMarkers[booking.chaletId ?? \"\"]");
    expect(calendar).toContain("marker?.color ?? reservedPeriodColorForBookingType(booking.bookingType)");
    expect(calendar).toContain("+{overflowCount}");
    expect(calendar).toContain("styles.overflowBadge");
  });

  it("tints the tile of the active unit and shows a small star badge on Jordanian holidays", () => {
    expect(calendar).toContain('tintActiveUnit={!isAllUnitsView}');
    expect(calendar).toContain('accentColor + "25"');
    expect(calendar).toContain('holiday ? <View style={styles.holidayStarBadge}><MaterialIcons name="star" size={8} color="#FFD54F" /></View> : null');
    expect(calendar).toContain("holidayStarBadge:");
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

  it("hides check-in/check-out arrows under All Units and only shows them for the active unit", () => {
    expect(calendar).toContain("const showArrows = tintActiveUnit && (arrivals || departures)");
    expect(calendar).toContain("{showArrows ? <View style={styles.operationDots}>");
    expect(calendar).toContain("tintActiveUnit={!isAllUnitsView}");
  });

  it("replaces dense fills with neon glow and typography highlight for selected and today days", () => {
    expect(calendar).toContain("const highlighted = selected || today");
    expect(calendar).toContain("const glow = highlighted ? { borderColor: highlightColor, shadowColor: highlightColor, shadowOpacity: 0.48, shadowRadius: 12, elevation: 8 } : {}");
    expect(calendar).toContain("textShadowColor: highlightColor");
    expect(calendar).toContain("backgroundColor: \"transparent\"");
    expect(calendar).toContain("tinted && { backgroundColor: accentColor + \"25\" }");
    expect(calendar).not.toContain("today ? colors.neonBadge");
  });
});