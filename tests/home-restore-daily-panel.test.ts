import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("home restore hint and daily tasks panel", () => {
  it("shows a short dismissible restore hint only after local data hydration", () => {
    const home = source("app/(tabs)/index.tsx");
    expect(home).toContain("const [restoreHintVisible, setRestoreHintVisible] = useState(false)");
    expect(home).toContain("hydrated && bookings.length === 0 && !isAuthenticated");
    expect(home).toContain("setTimeout(() => setRestoreHintVisible(false), 5_500)");
    expect(home).toContain("هل لديك بيانات منشأة محفوظة؟");
    expect(home).toContain("إخفاء الإشعار");
    expect(home).not.toContain("styles.restoreDataCard");
  });

  it("supports a persisted expand and collapse control for the daily task center", () => {
    const model = source("lib/booking-model.ts");
    const home = source("app/(tabs)/index.tsx");
    const panel = source("components/daily-operations-panel.tsx");
    expect(model).toContain("dailyOperationsCollapsed: boolean");
    expect(model).toContain("dailyOperationsCollapsed: false");
    expect(home).toContain("expanded={!deviceSettings.dailyOperationsCollapsed}");
    expect(home).toContain("dailyOperationsCollapsed: !deviceSettings.dailyOperationsCollapsed");
    expect(panel).toContain("onToggleExpanded");
    expect(panel).toContain('expanded ? "keyboard-arrow-up" : "keyboard-arrow-down"');
    expect(panel).toContain("LayoutAnimation.configureNext");
    expect(panel).toContain("duration: 220");
    expect(panel).toContain("AccessibilityInfo.isReduceMotionEnabled()");
    expect(panel).toContain('"reduceMotionChanged"');
  });
});
