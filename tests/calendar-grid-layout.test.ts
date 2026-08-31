import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const calendar = readFileSync(resolve(process.cwd(), "app/(tabs)/calendar.tsx"), "utf8");

describe("calendar month grid layout", () => {
  it("renders 7 equal columns that wrap as a row instead of overflowing vertically", () => {
    expect(calendar).toContain("daysGridContainer: { flexDirection: \"row\", flexWrap: \"wrap\", width: \"100%\", justifyContent: \"flex-start\", alignItems: \"center\" }");
  });

  it("keeps every day cell an exact seventh of the width with a fixed 62 height and centered content", () => {
    expect(calendar).toContain("dayCell: { width: \"14.285%\", height: 62, minWidth: 0, alignItems: \"center\", justifyContent: \"center\", padding: 2 }");
    expect(calendar).toContain("blankDay: { width: \"14.285%\", height: 62, minWidth: 0 }");
    expect(calendar).not.toContain("aspectRatio");
  });

  it("uses a frictionless floating day tile with a micro border and aligned weekday headers", () => {
    expect(calendar).toContain("dayTile: { flex: 1, width: \"100%\", minWidth: 0, alignItems: \"center\", justifyContent: \"center\", gap: 3, paddingVertical: 4, borderRadius: 14, borderWidth: 0.5, borderColor: \"rgba(255,255,255,0.10)\", backgroundColor: \"transparent\" }");
    expect(calendar).toContain("weekday: { width: \"14.285%\", minWidth: 0, fontSize: 10, fontWeight: \"800\", textAlign: \"center\" }");
  });

  it("aligns a Saturday-first weekday grid that renders right-to-left", () => {
    expect(calendar).toContain("const leadingBlanks = (firstDay + 1) % 7");
    expect(calendar).toContain("weekdayLabels[(column + 6) % 7]");
    expect(calendar).toContain('style={[styles.weekRow, { flexDirection: "row-reverse" }]}');
    expect(calendar).toContain('style={[styles.daysGridContainer, { flexDirection: "row-reverse" }]}');
  });

  it("shows a subdued dash for vacant days and dims passed days with a 0.35 opacity", () => {
    expect(calendar).toContain("const passed = date < todayDate");
    expect(calendar).toContain("const vacant = bookings.length === 0 && !waiting");
    expect(calendar).toContain("opacity: pressed ? 0.88 : passed ? 0.35 : 1");
    expect(calendar).toContain("{vacant ? <View style={styles.vacantDash} /> : <View style={styles.dayDots}>");
    expect(calendar).toContain("vacantDash: { width: 12, height: 1.5, borderRadius: 1, backgroundColor: \"rgba(255,255,255,0.16)\" }");
  });
});