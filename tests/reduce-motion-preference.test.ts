import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("reduce motion preference", () => {
  it("persists the opt-in setting and disables additional glass dialog motion", () => {
    const preferences = source("lib/app-preferences.tsx");
    const settings = source("app/(tabs)/settings.tsx");
    const motion = source("components/glass-modal-motion.tsx");
    const dailyOperations = source("components/daily-operations-panel.tsx");

    expect(preferences).toContain("reduceMotion: settings.device?.reduceMotion === true");
    expect(settings).toContain("تقليل الحركة");
    expect(settings).toContain("updateDeviceSettings({ reduceMotion: value })");
    expect(motion).toContain("deviceSettings.reduceMotion");
    expect(motion).toContain("opacity.setValue(1)");
    expect(settings).toContain("تكبير النصوص حسب الجهاز");
    expect(settings).toContain("updateDeviceSettings({ respectFontScale: value })");
    expect(dailyOperations).toContain("!reduceMotion && !deviceSettings.reduceMotion");
  });
});
