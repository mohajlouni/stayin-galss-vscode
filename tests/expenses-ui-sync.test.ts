import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(resolve(process.cwd(), "app/expenses.tsx"), "utf8");
const switcher = readFileSync(resolve(process.cwd(), "components/chalet-switcher.tsx"), "utf8");

describe("expenses UI/UX sync", () => {
  it("renders a horizontal 14-day strip with forward/backward nudges synced to the selected day", () => {
    expect(screen).toMatch(/expenseStripDates\.map\(\(date\) =>/);
    expect(screen).toContain("scopedDateSet.has(date)");
    expect(screen).toContain("STRIP_WEEKDAYS");
    expect(screen).toContain("selectStripDay(date)");
    expect(screen).toMatch(/nudgeStrip\(-1\)/);
    expect(screen).toMatch(/nudgeStrip\(1\)/);
  });

  it("styles the strip chips with an amber active state and an expense dot", () => {
    expect(screen).toContain("styles.dayStrip");
    expect(screen).toContain("styles.stripArrow");
    expect(screen).toContain("styles.stripChip");
    expect(screen).toContain("styles.stripDot");
    expect(screen).toMatch(/backgroundColor: "#EA580C", borderColor: "#EA580C"/);
    expect(screen).toContain("hasExpense ? <View style={styles.stripDot} /> : null");
  });

  it("uses the compact card layout with an amber amount and badge cluster", () => {
    expect(screen).toContain("styles.cardTopRow");
    expect(screen).toContain("styles.cardAmount");
    expect(screen).toContain("styles.cardBadges");
    expect(screen).toContain("styles.cardActions");
    expect(screen).toContain("styles.cardMeta");
    expect(screen).toContain(`color: "#FBBF24"`);
  });

  it("wraps card dynamic fields in HighlightedText and shows the بواسطة label", () => {
    expect(screen).toContain("<HighlightedText text={categoryLabel}");
    expect(screen).toContain("<HighlightedText text={item.item.note ?? \"\"}");
    expect(screen).toContain("بواسطة:");
    expect(screen).toContain("item.item.createdByName");
  });

  it("uniforms the chalet switcher as amber unit cards", () => {
    expect(switcher).toContain("اختيار الوحدة / العقار");
    expect(switcher).toContain("AMBER + \"1A\"");
    expect(switcher).toContain("AMBER + \"CC\"");
    expect(switcher).toContain("radio-button-checked");
    expect(switcher).toContain("radio-button-unchecked");
  });
});