import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const maintenance = read("app/maintenance-dashboard.tsx");
const expenses = read("app/expenses.tsx");

describe("date strip ↔ dropdown synchronization (اليوم badge, period sync, dots, container)", () => {
  it("computes the maintenance 'اليوم' badge against a fresh local date snapshot instead of a frozen mount time", () => {
    expect(maintenance).toContain("const now = Date.now();");
    expect(maintenance).toContain("const todayISO = localDateISO(new Date(now));");
    expect(maintenance).toContain("const isToday = date === todayISO;");
    expect(maintenance).not.toContain("useMemo(() => Date.now(), [])");
  });

  it("renders the same اليوم label in both screens so Sunday 13 shows identically", () => {
    expect(maintenance).toContain('const topLabel = isToday ? (language === "ar" ? "اليوم" : "Today") : weekday;');
    expect(expenses).toContain('{isToday ? (language === "ar" ? "اليوم" : "Today") : weekday}');
  });

  it("re-centers the expenses strip on Today for every broad period selected from the dropdown", () => {
    expect(expenses).toContain('if (id === "today") { setTodayAnchor(todayISO()); setStripCenter(todayISO()); }');
    expect(expenses).toContain('if (id === "7") { setWeekAnchor(todayISO()); setStripCenter(todayISO()); }');
    expect(expenses).toContain('if (id === "month") { setMonthAnchor(todayISO().slice(0, 7)); setStripCenter(todayISO()); }');
    expect(expenses).toContain('if (id === "all") { setStripCenter(todayISO()); }');
  });

  it("clears the maintenance day filter and re-centers the roller on Today when a cadence dropdown option is picked", () => {
    expect(maintenance).toContain("setCadenceFilter(selected ? \"all\" : cadence.id); setCadenceMenuOpen(false); resetTimeline();");
    expect(maintenance).toContain("const resetTimeline = () => {");
    expect(maintenance).toContain("setDateFilter(null);");
  });

  it("renders the status dot ONLY on days with logged activity in both screens", () => {
    expect(maintenance).toContain("{hasTaskOnDate ? <View style={styles.rollerDot} /> : null}");
    expect(expenses).toContain("{hasExpense ? <View style={styles.stripDot} /> : null}");
    expect(maintenance).not.toContain('backgroundColor: hasTaskOnDate ? "#EA580C" : "transparent"');
    expect(expenses).not.toContain('backgroundColor: hasExpense ? "#EA580C" : "transparent"');
  });

  it("standardizes the dot geometry so it never clips inside the 54-high chip", () => {
    expect(maintenance).toContain("rollerDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2");
    expect(expenses).toContain("stripDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2");
    expect(maintenance).toMatch(/minWidth: 38[^}]*maxWidth: 38[^}]*height: 54/);
    expect(expenses).toMatch(/minWidth: 38[^}]*height: 54/);
  });
});

describe("expenses 14-day strip scrolls as needed without overflowing the wrapper", () => {
  it("grows the horizontal scroll view between the arrows and balances the chips across the width", () => {
    expect(expenses).toContain("stripScroll: { flex: 1, minWidth: 0 }");
    expect(maintenance).toContain("rollerScroll: { flex: 1, minWidth: 0 }");
    expect(maintenance).toContain('style={styles.rollerScroll}');
    expect(expenses).toContain("style={styles.stripScroll}");
    expect(expenses).toContain('stripContent: { flexDirection: "row", flexGrow: 1, justifyContent: "space-between"');
    expect(maintenance).toContain('rollerStrip: { flexDirection: "row", flexGrow: 1, justifyContent: "space-between"');
  });

  it("caps and centers the strip wrapper on wide desktop screens", () => {
    expect(maintenance).toContain("rollerWrap: { marginTop: 13, width: \"100%\", maxWidth: 1024, alignSelf: \"center\"");
    expect(expenses).toContain("timelineWrap: { gap: 8, width: \"100%\", maxWidth: 1024, alignSelf: \"center\"");
  });
});