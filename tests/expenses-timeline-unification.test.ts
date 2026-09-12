import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(resolve(process.cwd(), "app/expenses.tsx"), "utf8");

describe("expenses unified timeline", () => {
  it("groups the range chip, period pills, day strip, and search under one coherent filter block", () => {
    expect(screen).toContain("styles.timelineWrap");
    expect(screen).toContain("styles.timelineChips");
    expect(screen).toContain("styles.filterRow");
    expect(screen).not.toContain("styles.navBar");
    expect(screen).not.toContain("styles.periodArrow");
    expect(screen).not.toContain("handlePrev");
    expect(screen).not.toContain("handleNext");
  });

  it("lets the custom range chip open the range picker and clear its own selection", () => {
    expect(screen).toContain("onPress={() => setRangePickerOpen(true)}");
    expect(screen).toContain('accessibilityLabel={language === "ar" ? "فترة مخصصة" : "Custom range"}');
    expect(screen).toContain('"من - إلى"');
    expect(screen).toContain("clearRangeFilter()");
    expect(screen).toContain("مسح الفترة");
  });

  it("recolors the day strip chips and dots to the orange family", () => {
    expect(screen).toMatch(/backgroundColor: "#EA580C", borderColor: "#EA580C"/);
    expect(screen).toContain('backgroundColor: "rgba(234, 88, 12, 0.15)"');
    expect(screen).toContain('isToday ? "#FDBA74"');
    expect(screen).toContain('hasExpense ? "#EA580C"');
    expect(screen).not.toContain("#FCD34D");
    expect(screen).not.toContain("#FDE68A");
    expect(screen).not.toContain("rgba(245, 158, 11, 0.18)");
  });

  it("moves the 14-day strip under the period pills inside the timeline wrapper", () => {
    expect(screen).toMatch(/expenseStripDates\.map\(\(date\) =>/);
    expect(screen).toContain("styles.dayStrip");
    expect(screen).toContain("styles.stripChip");
    expect(screen).toContain("styles.stripDot");
    expect(screen).toContain("selectStripDay(date)");
    expect(screen).toMatch(/nudgeStrip\(-1\)/);
    expect(screen).toMatch(/nudgeStrip\(1\)/);
  });

  it("adds a scope selector anchored to the search row with a callout menu", () => {
    expect(screen).toContain("styles.scopeMenuAnchor");
    expect(screen).toContain("styles.toolbarSelect");
    expect(screen).toContain("styles.toolbarMenu");
    expect(screen).toContain("styles.clickAway");
    expect(screen).toContain("void setSelectedChaletId(null)");
    expect(screen).toContain("setScopeMenuOpen(false)");
    expect(screen).toContain("scopeMenuSide");
  });

  it("drops the standalone chalet switcher from the expenses header", () => {
    expect(screen).not.toContain("ChaletSwitcher");
  });

  it("hides the web vertical scrollbar on the expense list", () => {
    expect(screen).toMatch(/showsVerticalScrollIndicator=\{false\}/);
  });

  it("restyles each expense card on a dark slate with a larger amber amount", () => {
    expect(screen).toContain('backgroundColor: "rgba(15, 23, 42, 0.8)", borderColor: "#1E293B"');
    expect(screen).toContain('color: "#FBBF24"');
    expect(screen).toContain("styles.cardAmount");
    expect(screen).toContain("styles.cardMeta");
  });
});