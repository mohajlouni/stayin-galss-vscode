import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const ambient = read("components/ambient-screen-background.tsx");
const screenContainer = read("components/screen-container.tsx");
const glowCard = read("components/glow-glass-card.tsx");
const glassButton = read("components/glass-button.tsx");
const alerts = read("components/operational-alerts.tsx");
const bookings = read("app/(tabs)/bookings.tsx");
const reports = read("app/(tabs)/reports.tsx");
const more = read("app/(tabs)/more.tsx");
const tabs = read("app/(tabs)/_layout.tsx");

describe("adaptive glass audit", () => {
  it("keeps ambient decoration behind content and unable to intercept touches", () => {
    expect(ambient).toContain('pointerEvents="none"');
    expect(ambient).toContain("zIndex: 0");
    expect(screenContainer).toContain("zIndex: 1");
    expect(screenContainer).toContain("backgroundColor: colors.background");
    expect(glowCard).toContain('effects: { overflow: "hidden" }');
    expect(glowCard).toContain('content: { position: "relative", zIndex: 2, elevation: 2 }');
    expect(glowCard).toContain('collapsable={false}');
    expect(glowCard).toContain('const supportsBackdropBlur = Platform.OS !== "android"');
    expect(glowCard).toContain('!isAndroid ? <View pointerEvents="none"');
    expect(glowCard).toContain('isAndroid && styles.androidContent');
    expect(glowCard).not.toContain('styles.androidGlassFallback');
    expect(glowCard).not.toContain("dimezisBlurView");
    expect(tabs).toContain('Platform.OS !== "android" ? <BlurView');
  });

  it("uses adaptive light and dark surfaces without static primary gradients", () => {
    expect(glowCard).toContain('tint={isDark ? "dark" : "light"}');
    expect(glassButton).toContain('colors.secondary + "C2"');
    expect(glassButton).not.toContain('"#FF9A80C2"');
    expect(reports).toContain("color: colors.foreground");
    expect(more).toContain("<GlowGlassCard intensity={16} style={styles.suggestionCard}");
  });

  it("keeps alerts and filtering as accessible single glass surfaces with restrained blur", () => {
    expect(alerts).toContain("<GlowGlassCard intensity={16}");
    expect(alerts).not.toContain("borderColor: colors.primary + \"72\"");
    expect(bookings).toContain('accessibilityLabel={language === "ar" ? "إغلاق الفلاتر"');
    expect(bookings).toContain("<GlowGlassCard radius={28} intensity={22}");
  });
});
