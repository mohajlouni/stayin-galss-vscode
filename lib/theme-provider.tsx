import { View } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";
import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";

import { SchemeColors, type ColorScheme } from "@/constants/theme";
import { useAppPreferences } from "@/lib/app-preferences";
import { useChaletScope } from "@/lib/chalet-scope";

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, updateDeviceSettings } = useAppPreferences();
  useChaletScope();
  const accent = SchemeColors[colorScheme].primary;

  useEffect(() => {
    nativewindColorScheme.set(colorScheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = colorScheme;
      root.classList.toggle("dark", colorScheme === "dark");
      Object.entries(SchemeColors[colorScheme]).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
      root.style.setProperty("--color-primary", accent);
      root.style.setProperty("--color-secondary", accent);
    }
  }, [accent, colorScheme]);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    void updateDeviceSettings({ appearanceMode: scheme });
  }, [updateDeviceSettings]);

  const themeVariables = useMemo(() => vars({
    "color-primary": accent,
    "color-background": SchemeColors[colorScheme].background,
    "color-surface": SchemeColors[colorScheme].surface,
    "color-foreground": SchemeColors[colorScheme].foreground,
    "color-muted": SchemeColors[colorScheme].muted,
    "color-border": SchemeColors[colorScheme].border,
    "color-success": SchemeColors[colorScheme].success,
    "color-warning": SchemeColors[colorScheme].warning,
    "color-error": SchemeColors[colorScheme].error,
  }), [accent, colorScheme]);

  const value = useMemo(() => ({ colorScheme, setColorScheme }), [colorScheme, setColorScheme]);

  return <ThemeContext.Provider value={value}><View style={[{ flex: 1, backgroundColor: SchemeColors[colorScheme].background }, themeVariables]}>{children}</View></ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider");
  return ctx;
}
