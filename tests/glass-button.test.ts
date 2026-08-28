import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const glassButtonSource = readFileSync(resolve(process.cwd(), "components/glass-button.tsx"), "utf8");
const quickActionsSource = readFileSync(resolve(process.cwd(), "components/booking-quick-actions.tsx"), "utf8");
const availableSlotSource = readFileSync(resolve(process.cwd(), "components/available-slot-card.tsx"), "utf8");

describe("GlassButton", () => {
  it("provides a coral-to-peach primary gradient and RTL-aware content", () => {
    expect(glassButtonSource).toContain("LinearGradient");
    expect(glassButtonSource).toContain('colors.secondary + "C2"');
    expect(glassButtonSource).not.toContain('"#FF9A80C2"');
    expect(glassButtonSource).toContain('colors.primary + "D1"');
    expect(glassButtonSource).toContain('isRTL ? "row-reverse" : "row"');
    expect(glassButtonSource).toContain("colors.glassInset");
  });

  it("uses unit-colored glass surfaces for the main quick booking and operational actions", () => {
    expect(availableSlotSource).toContain("<RipplePressable");
    expect(availableSlotSource).toContain('backgroundColor: colors.glassInset');
    expect(availableSlotSource).toContain('borderColor: themeColor + "52"');
    expect(quickActionsSource).toContain("<RipplePressable");
    expect(quickActionsSource).toContain('backgroundColor: colors.glassInset');
    expect(quickActionsSource).toContain('borderColor: themeColor + "52"');
    expect(quickActionsSource).toContain("operationalAction.onPress()");
  });
});
