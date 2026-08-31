import { Colors, neonForAccent, type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import { Fonts } from "@/constants/theme";
import { useAppPreferences } from "@/lib/app-preferences";
import { useChaletScope } from "@/lib/chalet-scope";

export function useColors(colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const { colorScheme } = useAppPreferences();
  const { selectedChalet } = useChaletScope();
  const scheme = colorSchemeOverride ?? colorScheme;
  const base = Colors[scheme];
  const accent = selectedChalet?.color ?? base.primary;
  const fonts = Fonts as NonNullable<typeof Fonts>;
  const neon = neonForAccent(accent);
  const dynamicAppTheme = {
    ...base.appTheme,
    background: {
      ...base.appTheme.background,
      orbPrimary: `${accent}26`,
      orbSecondary: `${accent}14`,
    },
  };
  return {
    ...base,
    primary: accent,
    tint: accent,
    tabIconSelected: accent,
    secondary: accent,
    neonBorder: neon.neonBorder,
    neonGlow: neon.neonGlow,
    neonBadge: neon.neonBadge,
    appTheme: dynamicAppTheme,
    font: {
      arabic: fonts.arabic,
      arabicMedium: fonts.arabicMedium,
      arabicBold: fonts.arabicBold,
      latin: fonts.sans,
      latinMedium: "system-ui" /* fallback */,
      latinBold: "system-ui" /* fallback */,
      numbers: fonts.sans,
    },
  };
}
