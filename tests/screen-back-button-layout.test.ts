import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("unified screen back navigation", () => {
  it("uses one RTL-aware component with a safe fallback route", () => {
    const source = read("components/screen-back-button.tsx");
    expect(source).toContain("router.canGoBack()");
    expect(source).toContain("router.replace(fallbackHref)");
    expect(source).toContain('isRTL ? "arrow-forward" : "arrow-back"');
    expect(source).toContain('accessibilityRole="button"');
    expect(source).toContain('accessibilityHint={accessibilityHint}');
    expect(source).toContain("onHoverIn");
    expect(source).toContain("onLongPress");
    expect(source).toContain("fallbackDestinations");
    expect(source).toContain("العودة إلى ${destination}");
    expect(source).toContain("useAppPreferences");
    expect(source).toContain("void triggerHaptic()");
  });

  it("keeps a visible unified back action on key independent screens without adding one to the more tab root", () => {
    expect(read("app/(tabs)/more.tsx")).not.toContain("backHref=");
    ["app/booking-detail.tsx", "app/booking-form.tsx", "app/audit-log.tsx", "app/chalet-management.tsx", "app/chalet-profile.tsx", "app/quick-search.tsx", "app/turnover-tasks.tsx", "app/user-management.tsx"].forEach((path) => {
      expect(read(path)).toMatch(/ScreenBackButton|SubScreenHeader/);
    });
  });
});
