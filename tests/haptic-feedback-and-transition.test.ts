import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("haptic feedback and navigation transitions", () => {
  it("uses the saved haptic preference for return and important actions", () => {
    expect(read("components/screen-back-button.tsx")).toContain("useAppPreferences");
    expect(read("components/screen-back-button.tsx")).toContain("void triggerHaptic()");
    expect(read("components/booking-quick-actions.tsx")).toContain("void triggerHaptic(); operationalAction.onPress()");
    expect(read("app/suggestions.tsx")).toContain("void triggerHaptic()");
    expect(read("app/expenses.tsx")).toContain("void triggerHaptic(); setModalOpen(false)");
  });

  it("keeps a user-facing haptic setting and a motion-aware stack transition", () => {
    expect(read("app/(tabs)/settings.tsx")).toContain("الاستجابة اللمسية");
    expect(read("app/(tabs)/settings.tsx")).toContain("hapticsEnabled");
    const rootLayout = read("app/_layout.tsx");
    expect(rootLayout).toContain("AccessibilityInfo.isReduceMotionEnabled()");
    expect(rootLayout).toContain('animation: reduceMotion ? "none" as const : "fade_from_bottom" as const');
  });

  it("uses a bounded ripple component on priority back and action buttons", () => {
    const ripple = read("components/ripple-pressable.tsx");
    expect(ripple).toContain("android_ripple");
    expect(ripple).toContain("foreground: true");
    ["components/screen-back-button.tsx", "components/booking-quick-actions.tsx", "app/booking-form.tsx", "app/expenses.tsx", "app/suggestions.tsx", "app/(tabs)/settings.tsx"].forEach((path) => {
      expect(read(path)).toContain("RipplePressable");
    });
  });
});
