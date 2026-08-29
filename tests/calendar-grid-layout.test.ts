import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const calendar = readFileSync(resolve(process.cwd(), "app/(tabs)/calendar.tsx"), "utf8");

describe("calendar month grid layout", () => {
  it("renders 7 equal columns that wrap as a row instead of overflowing vertically", () => {
    expect(calendar).toContain("daysGridContainer: { flexDirection: \"row\", flexWrap: \"wrap\", width: \"100%\", justifyContent: \"flex-start\" }");
  });

  it("keeps every day cell an exact seventh of the width with a fixed 48 height and centered content", () => {
    expect(calendar).toContain("dayCell: { width: \"14.28%\", height: 48, alignItems: \"center\", justifyContent: \"center\", padding: 2 }");
    expect(calendar).toContain("blankDay: { width: \"14.28%\", height: 48 }");
    expect(calendar).not.toContain("aspectRatio");
  });

  it("keeps weekday headers aligned with the same 14.28% column width", () => {
    expect(calendar).toContain("weekday: { width: \"14.28%\", fontSize: 10, fontWeight: \"800\", textAlign: \"center\" }");
  });
});