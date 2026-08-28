import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/available-slot-card.tsx"), "utf8");

describe("available slot glass action", () => {
  it("keeps the quick-book action as a complete glass surface in the unit color", () => {
    expect(source).toContain("RipplePressable");
    expect(source).toContain('backgroundColor: colors.glassInset');
    expect(source).toContain('borderColor: themeColor + "52"');
    expect(source).toContain('color: themeColor');
    expect(source).toContain('flexDirection: "row-reverse"');
    expect(source).not.toContain("<GlassButton");
  });
});
