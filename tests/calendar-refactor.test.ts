import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const calendar = source("app/(tabs)/calendar.tsx");
const switcher = source("components/chalet-switcher.tsx");

describe("calendar matrix refactor", () => {
  it("keeps the calendar sheet free of the lunar phase panel mount", () => {
    expect(calendar).not.toContain("<LunarPhasePanel ");
    expect(calendar).not.toContain("components/lunar-phase-panel");
  });

  it("builds the Saturday-first grid from the Saturday offset of the 1st and renders rows right-to-left", () => {
    expect(calendar).toContain("const leadingBlanks = (firstDay + 1) % 7");
    expect(calendar).toContain("weekdayLabels[(column + 6) % 7]");
    expect(calendar).toContain('style={[styles.weekRow, { flexDirection: "row-reverse" }]}');
    expect(calendar).toContain('style={[styles.daysGridContainer, { flexDirection: "row-reverse" }]}');
    expect(calendar).toContain("return [...cells, ...Array.from({ length: 42 - cells.length }, () => null as string | null)]");
  });

  it("renders a subtle vacancy dash instead of any harsh mark and dims passed days", () => {
    expect(calendar).toContain("const passed = date < todayDate");
    expect(calendar).toContain("const vacant = bookings.length === 0 && !waiting");
    expect(calendar).toContain("opacity: pressed ? 0.88 : passed ? 0.35 : 1");
    expect(calendar).toContain("vacant ? <View style={styles.vacantDash} /> : <View style={styles.dayDots}>");
    expect(calendar).toContain('vacantDash: { width: 12, height: 1.5, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.16)" }');
  });

  it("injects the miniature chalet weather sub-cell into the top property selector banner", () => {
    expect(switcher).toContain("effectiveWeatherAdvisory");
    expect(switcher).toContain("weatherCodeLabel");
    expect(switcher).toContain("weatherIconName");
    expect(switcher).toContain("styles.weatherSubCell");
    expect(switcher).toContain("الوحدة الحالية");
    expect(calendar).toContain("<View style={styles.scopeWrap}><ChaletSwitcher /></View>");
  });
});
