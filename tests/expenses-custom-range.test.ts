import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(resolve(process.cwd(), "app/expenses.tsx"), "utf8");

describe("expenses custom period filter", () => {
  it("opens the shared DateRangePicker sheet instead of duplicate inline popovers with floating done buttons", () => {
    expect(screen).toContain("<DateRangePicker visible={rangePickerOpen}");
    expect(screen).toContain("onClose={() => setRangePickerOpen(false)}");
    expect(screen).toContain("onApply={applyRange}");
    expect(screen).toContain("setRangePickerOpen(true)");
    expect(screen).not.toContain("customStartPicker");
    expect(screen).not.toContain("customEndPicker");
    expect(screen).not.toContain("onCustomStartPick");
    expect(screen).not.toContain("onCustomEndPick");
    expect(screen).not.toContain("rangePickerWrap");
  });

  it("applying the range immediately refilters the counters without toggling away from custom period", () => {
    expect(screen).toContain('if (period === "custom") return date >= customStart && date <= customEnd;');
    expect(screen).toContain("setCustomStart(start);");
    expect(screen).toContain("setCustomEnd(end);");
    expect(screen).toContain("setRangePickerOpen(false);");
  });

  it("keeps the اليوم / هذا الشهر / فترة مخصصة chips in sync with the committed range fields", () => {
    expect(screen).toContain('"اليوم"');
    expect(screen).toContain('"هذا الشهر"');
    expect(screen).toContain('"فترة مخصصة"');
    expect(screen).toContain("} · {formatDate(customStart)}");
    expect(screen).toContain("} · {formatDate(customEnd)}");
  });

  it("formats all displayed dates and labels through the centralized app date formatter", () => {
    expect(screen).toContain("const { triggerHaptic, formatDate, formatMonth } = useAppPreferences();");
    expect(screen).toContain("weekdayLabel");
    expect(screen).not.toContain("formatExpenseDate");
  });
});