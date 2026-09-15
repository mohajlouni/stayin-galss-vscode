import { useMemo } from "react";

import { Colors, neonForAccent, type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import { Fonts } from "@/constants/theme";
import { useAppPreferences } from "@/lib/app-preferences";
import { useChaletScope } from "@/lib/chalet-scope";

/**
 * بناء لوحة الألوان النهائية من (النمط + لون الوحدة النشطة) فقط.
 * مفصول خارج الهوك حتى يمكن تثبيت هوية الكائن عبر useMemo، لأن كل مستهلك
 * للوحة (بطاقات، حقول إدخال، أنماط) كان يعيد بناء عشرات الكائنات في كل إطار،
 * وهو ما كان يُسقط الإطارات أثناء الكتابة والتنقل.
 */
function buildPalette(scheme: ColorScheme, accent: string): ThemeColorPalette {
  const base = Colors[scheme];
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

/**
 * لوحة الألوان مشتركة ومُثبّتة الهوية: تتغيّر فقط عند تبديل النمط (فاتح/داكن)
 * أو عند تغيّر لون الوحدة النشطة، فلا يعاد بناء الأنماط (StyleSheet) في كل إطار.
 */
export function useColors(colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const { colorScheme } = useAppPreferences();
  const { selectedChalet } = useChaletScope();
  const scheme = colorSchemeOverride ?? colorScheme;
  const accent = selectedChalet?.color ?? Colors[scheme].primary;
  return useMemo(() => buildPalette(scheme, accent), [accent, scheme]);
}
