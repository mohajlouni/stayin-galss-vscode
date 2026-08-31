import { describe, expect, it } from "vitest";

import { DEFAULT_DEVICE_SETTINGS, dateLabel, formatBookingDate, formatCalendarMonth, formatTime12, hijriDateLabel, localDateISO, normalizeAppData, normalizeGlassBackgroundLevel, normalizeGlassGlowIntensity, normalizeGlassSurfaceOpacity } from "../lib/booking-model";
import { gregorianMonthLabel } from "../lib/gregorian-calendar";

describe("device and locale settings", () => {
  it("defaults to Arabic (not the device language) with Gregorian dates and 12-hour time", () => {
    expect(DEFAULT_DEVICE_SETTINGS).toMatchObject({
      useDeviceLanguage: false,
      language: "ar",
      appearanceMode: "system",
      dateFormat: "arabic-gregorian",
      showHijriDate: false,
      timeFormat: "12h",
      bookingCardViewMode: "expanded",
      reduceMotion: false,
      glassBackgroundLevel: "standard",
      glassSurfaceOpacity: "transparent",
      glassGlowIntensity: "vivid",
      quietGlassBackground: false,
      lastWhatsAppSendItems: ["confirmation"],
    });
  });

  it("formats 12-hour time in Arabic and English without changing the stored value", () => {
    expect(formatTime12("00:05", "ar")).toBe("12:05 ص");
    expect(formatTime12("13:30", "en")).toBe("1:30 PM");
  });

  it("formats the stored time in 24-hour mode when selected", () => {
    expect(formatTime12("09:05", "ar", "24h")).toBe("09:05");
    expect(formatTime12("13:30", "en", "24h")).toBe("13:30");
  });

  it("formats saved ISO booking dates in Gregorian calendar using UTC-safe display", () => {
    expect(dateLabel("2026-01-01", "ar")).toMatch(/يناير|كانون الثاني/);
    expect(dateLabel("2026-01-01", "en")).toMatch(/January|Jan/);
  });

  it("formats the same stored date with numeric, English-month, and Arabic-Gregorian preferences", () => {
    expect(formatBookingDate("2026-08-18", "DD/MM/YYYY")).toBe("18/08/2026");
    expect(formatBookingDate("2026-08-18", "YYYY-MM-DD")).toBe("2026-08-18");
    expect(formatBookingDate("2026-08-18", "english-month")).toContain("August");
    expect(formatBookingDate("2026-08-18", "arabic-gregorian")).toMatch(/أغسطس|آب/);
    expect(formatCalendarMonth(2026, 8, "YYYY-MM-DD")).toBe("2026-08");
  });

  it("can provide a Hijri companion label without changing the Gregorian booking date", () => {
    expect(hijriDateLabel("2026-08-18", "ar")).toMatch(/\d{4}/);
    expect(formatBookingDate("2026-08-18", "YYYY-MM-DD")).toBe("2026-08-18");
  });

  it("keeps the Gregorian month label language-aware", () => {
    expect(gregorianMonthLabel(2026, 8, "ar")).toBe("8 - أغسطس 2026");
    expect(gregorianMonthLabel(2026, 8, "en")).toBe("8 - August 2026");
  });

  it("creates local calendar dates without UTC conversion", () => {
    const value = localDateISO(new Date(2026, 0, 1, 0, 15));
    expect(value).toBe("2026-01-01");
  });

  it("keeps three background levels while migrating the prior quiet switch safely", () => {
    expect(normalizeGlassBackgroundLevel("minimal")).toBe("minimal");
    expect(normalizeGlassBackgroundLevel("unknown", true)).toBe("quiet");
    const migrated = normalizeAppData({ settings: { device: { quietGlassBackground: true } } as never });
    expect(migrated.settings.device).toMatchObject({ glassBackgroundLevel: "quiet", quietGlassBackground: true });
  });

  it("uses a balanced glass surface for saved data without the new preference", () => {
    expect(normalizeGlassSurfaceOpacity("transparent")).toBe("transparent");
    expect(normalizeGlassSurfaceOpacity("focused")).toBe("focused");
    expect(normalizeGlassSurfaceOpacity("unknown")).toBe("balanced");
    const migrated = normalizeAppData({ settings: { device: { glassBackgroundLevel: "minimal" } } as never });
    expect(migrated.settings.device).toMatchObject({ glassBackgroundLevel: "minimal", glassSurfaceOpacity: "balanced" });
  });

  it("keeps the unit-frame glow configurable while migrating earlier saved settings safely", () => {
    expect(normalizeGlassGlowIntensity("subtle")).toBe("subtle");
    expect(normalizeGlassGlowIntensity("vivid")).toBe("vivid");
    expect(normalizeGlassGlowIntensity("unknown")).toBe("balanced");
    const migrated = normalizeAppData({ settings: { device: { glassSurfaceOpacity: "focused" } } as never });
    expect(migrated.settings.device).toMatchObject({ glassSurfaceOpacity: "focused", glassGlowIntensity: "balanced" });
  });
});
