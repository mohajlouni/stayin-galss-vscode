import { Colors, type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import { useAppPreferences } from "@/lib/app-preferences";
import { useChaletScope } from "@/lib/chalet-scope";

export function useColors(colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const { colorScheme } = useAppPreferences();
  const { selectedChalet } = useChaletScope();
  const scheme = colorSchemeOverride ?? colorScheme;
  const base = Colors[scheme];
  const accent = selectedChalet?.color ?? base.primary;
  return { ...base, primary: accent, tint: accent, tabIconSelected: accent, secondary: accent };
}
