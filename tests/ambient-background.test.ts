import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(resolve(process.cwd(), "components/ambient-screen-background.tsx"), "utf8");
const containerSource = readFileSync(resolve(process.cwd(), "components/screen-container.tsx"), "utf8");
const orchestratorSource = readFileSync(resolve(process.cwd(), "components/dynamic-glass-background.tsx"), "utf8");
const sceneSource = readFileSync(resolve(process.cwd(), "components/glass-scene-background.tsx"), "utf8");

describe("ambient screen background", () => {
  it("uses a dynamic neon glass scene above a clean Obsidian base without a static image", () => {
    expect(backgroundSource).not.toContain("dark-glass-background.jpg");
    expect(backgroundSource).not.toContain('require("@/assets/images');
    expect(backgroundSource).toContain("pointerEvents=\"none\"");
    expect(backgroundSource).toContain("#070B10");
    expect(backgroundSource).toContain('zIndex: 0');
    expect(backgroundSource).toContain("isDark");
    expect(backgroundSource).toContain("LinearGradient");
    expect(backgroundSource).toContain("colors.primary");
    expect(backgroundSource).toContain("useIsFocused");
    expect(backgroundSource).toContain("useSharedValue");
    expect(backgroundSource).toContain("withRepeat");
    expect(backgroundSource).toContain("deviceSettings.reduceMotion");
  });

  it("keeps the background behind the shared screen content rather than recoloring cards", () => {
    expect(containerSource).toContain("<DynamicGlassBackground />");
    expect(containerSource).toContain("backgroundColor: colors.background");
    expect(containerSource).toContain('backgroundColor: "transparent"');
    expect(containerSource).toContain("zIndex: 1");
    expect(containerSource).not.toContain("selectedChalet?.color");
  });

  it("orchestrates the single elegant glass scene behind every screen", () => {
    expect(orchestratorSource).toContain("<GlassSceneBackground />");
    expect(orchestratorSource).not.toContain("backgroundStyle");
    expect(orchestratorSource).not.toContain("<ColorGradientBackground />");
  });

  it("dynamic ambient grid — deep #080C14 base, thin vector grid, breathing bottom aura with morphing chalet hue", () => {
    expect(sceneSource).toContain("FeGaussianBlur");
    expect(sceneSource).toContain("RadialGradient");
    expect(sceneSource).toContain("useMorphingAccent");
    expect(sceneSource).toContain("deviceSettings.reduceMotion");
    expect(sceneSource).toContain("pointerEvents=\"none\"");
    expect(sceneSource).toContain("#080C14");
    expect(sceneSource).toContain("strokeWidth={0.5}");
    expect(sceneSource).toContain("rgba(255, 255, 255, 0.03)");
    expect(sceneSource).toContain("useAnimatedProps");
    expect(sceneSource).toContain("withRepeat");
    expect(sceneSource).not.toContain("dark-glass-background.jpg");
    expect(sceneSource).not.toContain("solidColor");
  });
});
