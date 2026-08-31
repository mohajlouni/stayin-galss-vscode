import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(resolve(process.cwd(), "components/ambient-screen-background.tsx"), "utf8");
const preferencesSource = readFileSync(resolve(process.cwd(), "lib/app-preferences.tsx"), "utf8");
const settingsSource = readFileSync(resolve(process.cwd(), "app/(tabs)/settings.tsx"), "utf8");

describe("glass background levels", () => {
  it("keeps the backend leveling logic while locking the premium glass dials in settings", () => {
    expect(preferencesSource).toContain("normalizeGlassBackgroundLevel(settings.device?.glassBackgroundLevel, settings.device?.quietGlassBackground === true)");
    expect(preferencesSource).toContain('quietGlassBackground: glassBackgroundLevel !== "standard"');
    expect(backgroundSource).toContain("glassBackgroundLevel");
    expect(backgroundSource).toContain("NEON_OPACITY");
    expect(backgroundSource).toContain("standard:");
    expect(backgroundSource).toContain("quiet:");
    expect(backgroundSource).toContain("minimal:");
    expect(backgroundSource).toContain("const intensity = NEON_OPACITY[deviceSettings.glassBackgroundLevel]");
    expect(settingsSource).toContain('"اللون يتبع الوحدة النشطة"');
    expect(settingsSource).toContain("لمسة الوحدة النشطة");
    expect(settingsSource).not.toContain('"شدة النيون الخلفي"');
    expect(settingsSource).not.toContain("glassBackgroundLevel: choice.value");
    expect(settingsSource).not.toContain('"استعادة المتوازنة"');
    expect(settingsSource).not.toContain('"شفافية الزجاج"');
    expect(settingsSource).not.toContain("glassSurfaceOpacity: choice.value");
    expect(settingsSource).not.toContain("وهج الإطارات");
  });
});
