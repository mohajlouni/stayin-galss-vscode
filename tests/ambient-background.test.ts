import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(resolve(process.cwd(), "components/ambient-screen-background.tsx"), "utf8");
const containerSource = readFileSync(resolve(process.cwd(), "components/screen-container.tsx"), "utf8");

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
    expect(containerSource).toContain("<AmbientScreenBackground />");
    expect(containerSource).toContain("backgroundColor: colors.background");
    expect(containerSource).toContain('backgroundColor: "transparent"');
    expect(containerSource).toContain("zIndex: 1");
    expect(containerSource).not.toContain("selectedChalet?.color");
  });
});
