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
    expect(screen).toContain("todayAnchor, weekAnchor, monthAnchor, searchQuery");
  });

  it("nudges the strip window a full week at a time with addDays around the strip center", () => {
    expect(model).toContain("export function addDays");
    expect(screen).toContain("setStripCenter((current) => addDays(current, direction * 7));");
    expect(screen).toMatch(/nudgeStrip\(-1\)/);
    expect(screen).toMatch(/nudgeStrip\(1\)/);
    expect(screen).toContain("setTodayAnchor(todayISO());");
    expect(screen).toContain('setMonthAnchor(todayISO().slice(0, 7));');
  });

  it("flips the strip arrows to match the Arabic RTL reading direction", () => {
    expect(screen).toContain('name={isRTL ? "chevron-right" : "chevron-left"}');
    expect(screen).toContain('name={isRTL ? "chevron-left" : "chevron-right"}');
    expect(screen).toContain("nudgeStrip(-1)");
    expect(screen).toContain("nudgeStrip(1)");
  });

  it("labels the strip navigation arrows in both languages", () => {
    expect(screen).toContain("تمرير الأيام للخلف");
    expect(screen).toContain("تمرير الأيام للأمام");
    expect(screen).toContain("Scroll days backward");
    expect(screen).toContain("Scroll days forward");
  });

  it("shows the active period label inside the dropdown trigger with amber custom state", () => {
    expect(screen).toContain("const periodMenuLabel = period === \"today\"");
    expect(screen).toContain('(language === "ar" ? "كافة الفترات" : "All periods")');
    expect(screen).toContain("{periodMenuLabel}");
    expect(screen).toContain('period === "custom" ? "#EA580C" : colors.border');
  });

  it("labels the popover month chevrons with the direction they actually move in each language", () => {
    expect(picker).toContain('(isRTL ? "الشهر التالي" : "الشهر السابق")');
    expect(picker).toContain('(isRTL ? "الشهر السابق" : "الشهر التالي")');
  });
});