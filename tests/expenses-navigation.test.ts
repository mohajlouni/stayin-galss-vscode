import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(resolve(process.cwd(), "app/expenses.tsx"), "utf8");
const picker = readFileSync(resolve(process.cwd(), "components/calendar-date-picker.tsx"), "utf8");
const model = readFileSync(resolve(process.cwd(), "lib/booking-model.ts"), "utf8");

describe("expenses calendar navigation chevrons", () => {
  it("keeps navigable day and month anchors that drive the visible filter", () => {
    expect(screen).toContain("const [todayAnchor, setTodayAnchor] = useState(todayISO());");
    expect(screen).toContain("const [monthAnchor, setMonthAnchor] = useState(todayISO().slice(0, 7));");
    expect(screen).toContain('if (period === "today") return date === todayAnchor;');
    expect(screen).toContain("return date.startsWith(monthAnchor);");
    expect(screen).toContain("todayAnchor, monthAnchor");
  });

  it("advances the day anchor by one with addDays and the month anchor with moveGregorianMonth", () => {
    expect(model).toContain("export function addDays");
    expect(screen).toContain("setTodayAnchor((current) => addDays(current, direction));");
    expect(screen).toContain("moveGregorianMonth(Number(current.slice(0, 4)), Number(current.slice(5, 7)), direction)");
    expect(screen).toContain("setTodayAnchor(todayISO());");
    expect(screen).toContain('setMonthAnchor(todayISO().slice(0, 7));');
  });

  it("flips forward/backward arrows to match the Arabic RTL reading direction", () => {
    expect(screen).toContain("shiftPeriod(isRTL ? 1 : -1)");
    expect(screen).toContain("shiftPeriod(isRTL ? -1 : 1)");
    expect(screen).toContain('name={isRTL ? "chevron-right" : "chevron-left"}');
    expect(screen).toContain('name={isRTL ? "chevron-left" : "chevron-right"}');
  });

  it("labels the arrows in both languages for day and month stepping", () => {
    expect(screen).toContain("اليوم السابق");
    expect(screen).toContain("اليوم التالي");
    expect(screen).toContain("الشهر السابق");
    expect(screen).toContain("الشهر التالي");
    expect(screen).toContain("Previous day");
    expect(screen).toContain("Previous month");
  });

  it("renders the current period header from the active anchor, hidden for custom ranges", () => {
    expect(screen).toContain('formatDate(todayAnchor)');
    expect(screen).toContain("formatMonth(monthAnchorYear, monthAnchorNumber)");
    expect(screen).toContain('{period !== "custom"');
  });

  it("labels the popover month chevrons with the direction they actually move in each language", () => {
    expect(picker).toContain('(isRTL ? "الشهر التالي" : "الشهر السابق")');
    expect(picker).toContain('(isRTL ? "الشهر السابق" : "الشهر التالي")');
  });
});