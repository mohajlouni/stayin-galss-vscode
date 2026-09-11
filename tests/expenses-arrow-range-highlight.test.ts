import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(resolve(process.cwd(), "app/expenses.tsx"), "utf8");
const picker = readFileSync(resolve(process.cwd(), "components/calendar-date-picker.tsx"), "utf8");
const rangePicker = readFileSync(resolve(process.cwd(), "components/ui/DateRangePicker.tsx"), "utf8");

describe("expenses stepper arrows and custom-range amber highlight", () => {
  it("routes the calendar chevrons through dedicated handlers that stop event propagation", () => {
    expect(screen).toContain("const handlePrev = (event: GestureResponderEvent) => {");
    expect(screen).toContain("const handleNext = (event: GestureResponderEvent) => {");
    expect(screen).toContain("event.stopPropagation();");
    expect(screen).toContain("shiftPeriod(isRTL ? 1 : -1);");
    expect(screen).toContain("shiftPeriod(isRTL ? -1 : 1);");
    expect(screen).toContain("onPress={handlePrev}");
    expect(screen).toContain("onPress={handleNext}");
  });

  it("forces the nav arrow buttons above siblings with explicit pointer events and web cursor semantics", () => {
    expect(screen).toContain('pointerEvents="auto"');
    expect(screen).toContain('position: "relative", zIndex: 20, elevation: 20');
    expect(screen).toContain('cursor: "pointer"');
    expect(screen).toContain('userSelect: "none"');
  });

  it("keeps the custom period chip amber while it stays active", () => {
    expect(screen).toContain('activeColor="#F59E0B"');
    expect(screen).toContain('active={period === "custom"}');
  });

  it("passes the shared draft range into both calendar pickers", () => {
    expect(rangePicker).toContain('range={{ start: draftStart, end: draftEnd }}');
  });

  it("highlights days between the range edges with an amber fill and solid amber edges", () => {
    expect(picker).toContain("const isRangeEdge = Boolean(range && range.start && range.end && (date === range.start || date === range.end));");
    expect(picker).toContain("const isInRange = Boolean(range && range.start && range.end && date > range.start && date < range.end);");
    expect(picker).toContain('isRangeEdge ? "#EA580C"');
    expect(picker).toContain('isInRange ? "rgba(234, 88, 12, 0.15)"');
    expect(picker).toContain('isRangeEdge ? "#FFFFFF"');
    expect(picker).toContain('isInRange ? "#FDBA74"');
    expect(picker).toContain('borderTopWidth: isInRange ? 1 : 0');
    expect(picker).toContain('borderColor: isInRange ? "rgba(234, 88, 12, 0.3)"');
    expect(picker).toContain('shadowColor: isRangeEdge ? "#EA580C"');
  });

  it("applies the same pointer-events defensiveness to the popover month steppers", () => {
    expect(picker).toContain('pointerEvents="auto"');
    expect(picker).toContain('shiftCursor(isRTL ? 1 : -1)');
    expect(picker).toContain('shiftCursor(isRTL ? -1 : 1)');
  });
});