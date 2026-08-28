import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/available-slot-card.tsx"), "utf8");

describe("AvailableSlotCard column alignment", () => {
  it("uses the same single-column width as booking card controls", () => {
    expect(source).toContain('info: { width: "66%"');
    expect(source).toContain('cta: { width: "32%"');
    expect(source).toContain("paddingHorizontal: 12");
    expect(source).toContain("chaletName: string");
    expect(source).toContain("${chaletName} —");
    expect(source).not.toContain("embedded");
  });
});
