import { Platform } from "react-native";

import themeConfig from "@/theme.config";

export type ColorScheme = "light" | "dark";

export const ThemeColors = themeConfig.themeColors;

type ThemeColorTokens = typeof ThemeColors;
type ThemeColorName = keyof ThemeColorTokens;
type SchemePalette = Record<ColorScheme, Record<ThemeColorName, string>>;
type SchemePaletteItem = SchemePalette[ColorScheme];

function buildSchemePalette(colors: ThemeColorTokens): SchemePalette {
  const palette: SchemePalette = {
    light: {} as SchemePalette["light"],
    dark: {} as SchemePalette["dark"],
  };

  (Object.keys(colors) as ThemeColorName[]).forEach((name) => {
    const swatch = colors[name];
    palette.light[name] = swatch.light;
    palette.dark[name] = swatch.dark;
  });

  return palette;
}

export const SchemeColors = buildSchemePalette(ThemeColors);

export interface AppThemeTokens {
  mode: "dark" | "light";
  background: {
    base: string;
    canvasGradient: string[];
    orbPrimary: string;
    orbSecondary: string;
  };
  glass: {
    cardBg: string;
    cardBgElevated: string;
    borderColor: string;
    topHighlight: string;
    blurIntensity: number;
    radiusSm: number;
    radiusMd: number;
    radiusLg: number;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
  };
  input: {
    bg: string;
    borderColor: string;
    height: number;
    radius: number;
  };
  shadow: {
    color: string;
    opacity: number;
    radius: number;
    elevation: number;
  };
}

export function neonForAccent(accent: string) {
  const normalized = /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : "#FF6B47";
  return {
    neonBorder: `${normalized}4D`,
    neonGlow: `${normalized}26`,
    neonBadge: `${normalized}1F`,
  };
}

export type ThemeColorPalette = SchemePaletteItem & {
  text: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  border: string;
  glassFillDark: string;
  glassFillLight: string;
  glassFillDarkFocused: string;
  glassFillLightFocused: string;
  glassFillDarkTransparent: string;
  glassFillLightTransparent: string;
  glassRimDark: string;
  glassRimLight: string;
  glassRimTopDark: string;
  glassRimTopLight: string;
  // New architectural tokens per spec — additive, legacy preserved
  mode: ColorScheme;
  appTheme: AppThemeTokens;
  neonBorder: string;
  neonGlow: string;
  neonBadge: string;
  font: {
    arabic: string;
    arabicMedium: string;
    arabicBold: string;
    latin: string;
    latinMedium: string;
    latinBold: string;
    numbers: string;
  };
};

function buildAppThemeTokens(scheme: ColorScheme, base: SchemePaletteItem): AppThemeTokens {
  const isDark = scheme === "dark";
  return {
    mode: scheme,
    background: {
      base: base.background,
      canvasGradient: isDark ? ["#090D16", "#0F172A"] : ["#F8FAFC", "#EEF2FF"],
      orbPrimary: isDark ? "rgba(14, 165, 233, 0.18)" : "rgba(6, 182, 212, 0.12)",
      orbSecondary: isDark ? "rgba(245, 158, 11, 0.14)" : "rgba(251, 191, 36, 0.10)",
    },
    glass: {
      cardBg: isDark ? "rgba(15, 23, 42, 0.68)" : "rgba(255, 255, 255, 0.75)",
      cardBgElevated: isDark ? "rgba(30, 41, 59, 0.78)" : "rgba(255, 255, 255, 0.90)",
      borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.60)",
      topHighlight: isDark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.95)",
      blurIntensity: isDark ? 28 : 35,
      radiusSm: 12,
      radiusMd: 18,
      radiusLg: 24,
    },
    text: {
      primary: base.foreground,
      secondary: base.muted,
      muted: base.muted,
      inverse: isDark ? "#0F172A" : "#F8FAFC",
    },
    input: {
      bg: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)",
      borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.10)",
      height: 52,
      radius: 14,
    },
    shadow: {
      color: isDark ? "#000000" : "#0F172A",
      opacity: isDark ? 0.18 : 0.08,
      radius: 24,
      elevation: 8,
    },
  };
}

function buildRuntimePalette(scheme: ColorScheme): ThemeColorPalette {
  const base = SchemeColors[scheme];
  const isDark = scheme === "dark";
  const appTheme = buildAppThemeTokens(scheme, base);
  const defaultNeon = neonForAccent(base.primary);
  return {
    ...base,
    text: base.foreground,
    background: base.background,
    tint: base.primary,
    icon: base.muted,
    tabIconDefault: base.muted,
    tabIconSelected: base.primary,
    border: base.border,
    glassFillDark: isDark ? "rgba(18, 24, 38, 0.75)" : "transparent",
    glassFillLight: isDark ? "transparent" : "rgba(255, 255, 255, 0.80)",
    glassFillDarkFocused: isDark ? "rgba(28, 36, 56, 0.85)" : "transparent",
    glassFillLightFocused: isDark ? "transparent" : "rgba(255, 255, 255, 0.90)",
    glassFillDarkTransparent: isDark ? "rgba(18, 24, 38, 0.55)" : "transparent",
    glassFillLightTransparent: isDark ? "transparent" : "rgba(255, 255, 255, 0.62)",
    glassRimDark: isDark ? "rgba(255, 255, 255, 0.08)" : "transparent",
    glassRimLight: isDark ? "transparent" : "rgba(255, 255, 255, 0.12)",
    glassRimTopDark: isDark ? "rgba(255, 255, 255, 0.20)" : "transparent",
    glassRimTopLight: isDark ? "transparent" : "rgba(255, 255, 255, 0.20)",
    mode: scheme,
    appTheme,
    neonBorder: defaultNeon.neonBorder,
    neonGlow: defaultNeon.neonGlow,
    neonBadge: defaultNeon.neonBadge,
    font: {
      arabic: "Tajawal-Regular",
      arabicMedium: "Tajawal-Medium",
      arabicBold: "Tajawal-Bold",
      latin: "system-ui",
      latinMedium: "system-ui",
      latinBold: "system-ui",
      numbers: "system-ui",
    },
  };
}

export const Colors = {
  light: buildRuntimePalette("light"),
  dark: buildRuntimePalette("dark"),
} satisfies Record<ColorScheme, ThemeColorPalette>;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
    /** Arabic optimized fonts */
    arabic: "Tajawal-Regular",
    arabicMedium: "Tajawal-Medium",
    arabicBold: "Tajawal-Bold",
    arabicBlack: "Tajawal-Black",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
    arabic: "Tajawal-Regular",
    arabicMedium: "Tajawal-Medium",
    arabicBold: "Tajawal-Bold",
    arabicBlack: "Tajawal-Black",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    arabic: "'Tajawal', 'Cairo', 'IBM Plex Sans Arabic', system-ui, sans-serif",
    arabicMedium: "'Tajawal', 'Cairo', 'IBM Plex Sans Arabic', system-ui, sans-serif",
    arabicBold: "'Tajawal', 'Cairo', 'IBM Plex Sans Arabic', system-ui, sans-serif",
    arabicBlack: "'Tajawal', 'Cairo', 'IBM Plex Sans Arabic', system-ui, sans-serif",
  },
});
