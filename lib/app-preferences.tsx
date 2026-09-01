import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCalendars, getLocales } from "expo-localization";
import * as Haptics from "expo-haptics";
import { Appearance, I18nManager, Platform, useColorScheme as useSystemColorScheme } from "react-native";
import * as Updates from "expo-updates";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useBookings } from "@/lib/booking-store";
import { type AppLanguage, type AppearanceMode, type DateFormat, type DeviceSettings, DEFAULT_DEVICE_SETTINGS, formatBookingDate, formatCalendarMonth, formatTime12, hijriDateLabel, hijriMonthLabel, normalizeGlassBackgroundLevel, normalizeGlassGlowIntensity, normalizeGlassSurfaceOpacity } from "@/lib/booking-model";
import { normalizeWeekdayFormat } from "@/lib/gregorian-calendar";

type AppPreferencesValue = {
  language: AppLanguage;
  direction: "rtl" | "ltr";
  isRTL: boolean;
  appearanceMode: AppearanceMode;
  colorScheme: "light" | "dark";
  deviceSettings: DeviceSettings;
  deviceLanguage: AppLanguage;
  deviceTimezone: string;
  systemColorScheme: "light" | "dark";
  fontScale: number;
  dateFormat: DateFormat;
  showHijriDate: boolean;
  formatDate: (date: string) => string;
  formatMonth: (year: number, month: number) => string;
  formatTime: (time: string) => string;
  formatHijriDate: (date: string) => string;
  formatHijriMonth: (year: number, month: number) => string;
  updateDeviceSettings: (patch: Partial<DeviceSettings>) => Promise<void>;
  triggerHaptic: (style?: Haptics.ImpactFeedbackStyle) => Promise<void>;
  languageChangeStatus: LanguageChangeStatus;
  acknowledgeLanguageChange: () => void;
  restartApp: () => Promise<void>;
};

const PreferencesContext = createContext<AppPreferencesValue | null>(null);

type LanguageChangeStatus = "none" | "pending" | "acknowledged";

function detectDeviceLanguage(): AppLanguage {
  const locale = getLocales()[0]?.languageCode?.toLowerCase() ?? "en";
  return locale.startsWith("ar") ? "ar" : "en";
}

function detectDeviceTimezone(): string {
  const calendarTimezone = getCalendars()[0]?.timeZone;
  if (calendarTimezone) return calendarTimezone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function AppPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings, hydrated } = useBookings();
  const systemScheme = useSystemColorScheme() === "dark" ? "dark" : "light";
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>({
    ...DEFAULT_DEVICE_SETTINGS,
    timezone: detectDeviceTimezone(),
  });
  const [fontScale, setFontScale] = useState(1);
  const [languageChangeStatus, setLanguageChangeStatus] = useState<LanguageChangeStatus>("none");
  const deviceLanguage = useMemo(detectDeviceLanguage, []);

  const deviceSettingsRef = useRef(deviceSettings);
  const settingsRef = useRef(settings);
  const previousLanguageRef = React.useRef<string | null>(null);

  const deviceTimezone = useMemo(detectDeviceTimezone, []);

  useEffect(() => {
    if (!hydrated) return;
    const storedDateFormat = (settings.device as { dateFormat?: string } | undefined)?.dateFormat;
    const glassBackgroundLevel = normalizeGlassBackgroundLevel(settings.device?.glassBackgroundLevel, settings.device?.quietGlassBackground === true);
    const glassSurfaceOpacity = normalizeGlassSurfaceOpacity(settings.device?.glassSurfaceOpacity);
    const glassGlowIntensity = normalizeGlassGlowIntensity(settings.device?.glassGlowIntensity);
    setDeviceSettings((current) => ({
      ...current,
      ...(settings.device ?? {}),
      dateFormat: storedDateFormat === "gregory" ? DEFAULT_DEVICE_SETTINGS.dateFormat : (storedDateFormat as DateFormat | undefined) ?? current.dateFormat,
      weekdayFormat: normalizeWeekdayFormat(settings.device?.weekdayFormat),
      showHijriDate: settings.device?.showHijriDate ?? current.showHijriDate,
      timezone: settings.device?.timezone || current.timezone || deviceTimezone,
      bookingCardViewMode: settings.device?.bookingCardViewMode === "compact" ? "compact" : "expanded",
      reduceMotion: settings.device?.reduceMotion === true,
      glassBackgroundLevel,
      glassSurfaceOpacity,
      glassGlowIntensity,
      quietGlassBackground: glassBackgroundLevel !== "standard",
      showGuestCheckIn: settings.device?.showGuestCheckIn !== false,
      showTurnoverTasks: settings.device?.showTurnoverTasks !== false,
      showDailyTasks: settings.device?.showDailyTasks !== false,
      auditLogDefaultRange: ["today", "two-days", "week", "month", "all"].includes(settings.device?.auditLogDefaultRange ?? "") ? settings.device!.auditLogDefaultRange : current.auditLogDefaultRange,
      activeBookingDefaultRange: ["today", "two-days", "tomorrow", "week", "month", "upcoming", "all"].includes(settings.device?.activeBookingDefaultRange ?? "") ? settings.device!.activeBookingDefaultRange : current.activeBookingDefaultRange,
      endedStayDefaultRange: ["today", "two-days", "week", "month", "all"].includes(settings.device?.endedStayDefaultRange ?? "") ? settings.device!.endedStayDefaultRange : current.endedStayDefaultRange,
    }));
  }, [deviceTimezone, hydrated, settings.device]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.devicePixelRatio) setFontScale(window.devicePixelRatio);
    else setFontScale(1);
  }, []);

  const language = deviceSettings.useDeviceLanguage ? deviceLanguage : deviceSettings.language;
  const direction = language === "ar" ? "rtl" : "ltr";
  const isRTL = direction === "rtl";
  const appearanceMode = deviceSettings.appearanceMode;
  const colorScheme = appearanceMode === "system" ? systemScheme : appearanceMode;
  const formatDate = useCallback((date: string) => {
    const gregorian = formatBookingDate(date, deviceSettings.dateFormat);
    return deviceSettings.showHijriDate ? `${gregorian} · ${hijriDateLabel(date, language)}` : gregorian;
  }, [deviceSettings.dateFormat, deviceSettings.showHijriDate, language]);
  const formatMonth = useCallback((year: number, month: number) => formatCalendarMonth(year, month, deviceSettings.dateFormat), [deviceSettings.dateFormat]);
  const formatTime = useCallback((time: string) => formatTime12(time, language, deviceSettings.timeFormat), [deviceSettings.timeFormat, language]);
  const formatHijriDate = useCallback((date: string) => hijriDateLabel(date, language), [language]);
  const formatHijriMonth = useCallback((year: number, month: number) => hijriMonthLabel(year, month, language), [language]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
      document.documentElement.dir = direction;
    }
    if (Platform.OS !== "web") {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(isRTL);
    }

    if (previousLanguageRef.current !== null && previousLanguageRef.current !== language) {
      setLanguageChangeStatus("pending");
    }
    previousLanguageRef.current = language;
  }, [direction, isRTL, language]);

  useEffect(() => {
    Appearance.setColorScheme?.(appearanceMode === "system" ? null : appearanceMode);
  }, [appearanceMode]);

  useEffect(() => {
    deviceSettingsRef.current = deviceSettings;
  }, [deviceSettings]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const updateDeviceSettings = useCallback(async (patch: Partial<DeviceSettings>) => {
    const next = { ...deviceSettingsRef.current, ...patch };
    if ("showGuestCheckIn" in patch && typeof patch.showGuestCheckIn === "boolean" && patch.showGuestCheckIn !== deviceSettingsRef.current.showGuestCheckIn) {
      next.guestCheckInModeHistory = [{ enabled: patch.showGuestCheckIn, changedAt: new Date().toISOString() }, ...deviceSettingsRef.current.guestCheckInModeHistory].slice(0, 3);
    }
    deviceSettingsRef.current = next;
    setDeviceSettings(next);
    await updateSettings({ ...settingsRef.current, device: next });
  }, [updateSettings]);

  const triggerHaptic = useCallback(async (style = Haptics.ImpactFeedbackStyle.Light) => {
    if (!deviceSettings.hapticsEnabled || Platform.OS === "web") return;
    try {
      await Haptics.impactAsync(style);
    } catch {
      // Haptics are optional and may be unavailable on simulators.
    }
  }, [deviceSettings.hapticsEnabled]);

  const acknowledgeLanguageChange = useCallback(() => {
    setLanguageChangeStatus("acknowledged");
  }, []);

  const restartApp = useCallback(async () => {
    if (Platform.OS !== "web") {
      await Updates.reloadAsync();
    } else {
      window.location.reload();
    }
  }, []);

  const value = useMemo<AppPreferencesValue>(() => ({
    language,
    direction,
    isRTL,
    appearanceMode,
    colorScheme,
    deviceSettings,
    deviceLanguage,
    deviceTimezone,
    systemColorScheme: systemScheme,
    fontScale,
    dateFormat: deviceSettings.dateFormat,
    showHijriDate: deviceSettings.showHijriDate,
    formatDate,
    formatMonth,
    formatTime,
    formatHijriDate,
    formatHijriMonth,
    updateDeviceSettings,
    triggerHaptic,
    languageChangeStatus,
    acknowledgeLanguageChange,
    restartApp,
  }), [appearanceMode, colorScheme, deviceLanguage, deviceSettings, deviceTimezone, direction, fontScale, formatDate, formatHijriDate, formatHijriMonth, formatMonth, formatTime, isRTL, language, systemScheme, triggerHaptic, updateDeviceSettings, languageChangeStatus, acknowledgeLanguageChange, restartApp]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useAppPreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("useAppPreferences must be used within AppPreferencesProvider");
  return context;
}

/** Alias for screens that consume user-facing date, time, language, and device settings. */
export const useSettings = useAppPreferences;

export { AsyncStorage };
export type { LanguageChangeStatus };
