import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const themeSource = readFileSync(resolve(process.cwd(), "theme.config.js"), "utf8");
const bookingCardSource = readFileSync(resolve(process.cwd(), "components/booking-card.tsx"), "utf8");
const availableSlotSource = readFileSync(resolve(process.cwd(), "components/available-slot-card.tsx"), "utf8");
const quickActionsSource = readFileSync(resolve(process.cwd(), "components/booking-quick-actions.tsx"), "utf8");
const glassCardSource = readFileSync(resolve(process.cwd(), "components/glow-glass-card.tsx"), "utf8");
const providerSource = readFileSync(resolve(process.cwd(), "lib/theme-provider.tsx"), "utf8");
const bookingDatePickerSource = readFileSync(resolve(process.cwd(), "components/booking-date-picker.tsx"), "utf8");
const calendarDatePickerSource = readFileSync(resolve(process.cwd(), "components/calendar-date-picker.tsx"), "utf8");
const bookingFormSource = readFileSync(resolve(process.cwd(), "app/booking-form.tsx"), "utf8");
const bookingDetailSource = readFileSync(resolve(process.cwd(), "app/booking-detail.tsx"), "utf8");
const modalMotionSource = readFileSync(resolve(process.cwd(), "components/glass-modal-motion.tsx"), "utf8");
const checkInSheetSource = readFileSync(resolve(process.cwd(), "components/check-in-confirmation-sheet.tsx"), "utf8");
const checkOutSheetSource = readFileSync(resolve(process.cwd(), "components/check-out-confirmation-sheet.tsx"), "utf8");
const securityCardSource = readFileSync(resolve(process.cwd(), "components/profile-security-links.tsx"), "utf8");
const calendarSource = readFileSync(resolve(process.cwd(), "app/(tabs)/calendar.tsx"), "utf8");
const tabLayoutSource = readFileSync(resolve(process.cwd(), "app/(tabs)/_layout.tsx"), "utf8");
const reportsSource = readFileSync(resolve(process.cwd(), "app/(tabs)/reports.tsx"), "utf8");

describe("GlowGlass design system", () => {
  it("defines the central Obsidian, frosted-glass, inset, rim, and coral tokens", () => {
    expect(themeSource).toContain('primary: { light: "#E85D3C", dark: "#FF6B47" }');
    expect(themeSource).toContain('background: { light: "#F8FAFC", dark: "#070B10" }');
    expect(themeSource).toContain('surface: { light: "#FFFFFFD1", dark: "#11182738" }');
    expect(themeSource).toContain('surfaceMuted: { light: "#F0F3F6", dark: "#070B1233" }');
    expect(themeSource).toContain('glassRim: { light: "#FFFFFFB8", dark: "#FFFFFF2E" }');
    expect(themeSource).toContain('glassGlow: { light: "#E8EEF7", dark: "#1E293338" }');
  });

  it("uses the shared GlowGlass card while preserving unit and period signals", () => {
    expect(bookingCardSource).toContain("GlowGlassCard");
    expect(bookingCardSource).toContain("glowColor={themeColor}");
    expect(bookingCardSource).toContain("backgroundColor: themeColor");
    expect(bookingCardSource).toContain("color: themeColor");
    expect(bookingCardSource).toContain('backgroundColor: shiftColor + "12"');
    expect(bookingCardSource).toContain("backgroundColor: shiftColor");
    expect(bookingCardSource).toContain("propertyTypeFrameRadius");
    expect(bookingCardSource).toContain("radius={frameRadius} intensity={18}");
    expect(bookingCardSource).toContain("backgroundColor: colors.glassInset");
    expect(bookingCardSource).toContain("styles.unitGlowFrame");
    expect(bookingCardSource).toContain('borderColor: themeColor + frameGlow.border');
    expect(bookingCardSource).toContain("shadowColor: themeColor");
    expect(bookingCardSource).toContain('glassGlowIntensity === "vivid"');
    expect(availableSlotSource).toContain("intensity={16}");
    expect(availableSlotSource).not.toContain("borderWidth: 0");
    expect(quickActionsSource).toContain("surfaceColor={colors.glassInset}");
  });

  it("uses frosted glass for shared calendar, security, and operational sheet containers", () => {
    expect(bookingDatePickerSource).toContain("<GlowGlassCard");
    expect(calendarDatePickerSource).toContain("<GlowGlassCard radius={28} intensity={30}");
    expect(bookingFormSource).toContain("<GlowGlassCard radius={20} intensity={28}");
    expect(bookingDetailSource).toContain("<GlowGlassCard radius={28} intensity={22} style={styles.paymentSheet}");
    expect(bookingDetailSource).toContain("<GlowGlassCard radius={28} intensity={22} style={styles.receiptSheet}");
    expect(bookingDetailSource).toContain("<GlowGlassCard radius={28} intensity={22} style={styles.cancellationSheet}");
    expect(bookingDetailSource).toContain("<GlowGlassCard radius={22} intensity={22} style={{ width: \"100%\", maxWidth: 360");
    expect(bookingDetailSource).toContain("<GlassModalMotion><GlowGlassCard radius={28} intensity={22}");
    expect(modalMotionSource).toContain("duration: 180");
    expect(modalMotionSource).toContain("duration: 220");
    expect(checkInSheetSource).toContain("<GlowGlassCard");
    expect(checkOutSheetSource).toContain("<GlowGlassCard");
    expect(securityCardSource).toContain("<GlowGlassCard");
    expect(calendarSource).toContain("<GlowGlassCard radius={28} intensity={22} style={styles.dayModal}");
  });

  it("uses a clean capsule glass body and limits the unit glow to the bottom of the card", () => {
    expect(glassCardSource).toContain("LinearGradient");
    expect(glassCardSource).toContain("bottomAura");
    expect(glassCardSource).toContain('backgroundColor: "transparent"');
    expect(glassCardSource).not.toContain("styles.material");
    expect(glassCardSource).not.toContain('backgroundColor: "rgba(15, 22, 33, 0.14)"');
    expect(glassCardSource).toContain('content: { position: "relative", zIndex: 2, elevation: 2 }');
    expect(glassCardSource).toContain('effects: { overflow: "hidden" }');
    expect(glassCardSource).toContain('const supportsBackdropBlur = Platform.OS !== "android"');
    expect(glassCardSource).toContain('!isAndroid ? <View pointerEvents="none"');
    expect(glassCardSource).toContain('androidContent: { zIndex: 0, elevation: 0 }');
    expect(glassCardSource).not.toContain('styles.androidGlassFallback');
    expect(glassCardSource).toContain('borderWidth: 1.2');
    expect(glassCardSource).toContain('borderColor: "rgba(255, 255, 255, 0.15)"');
    expect(glassCardSource).toContain('height: "26%"');
    expect(glassCardSource).toContain("const glowStrength");
    expect(glassCardSource).toContain("const effectiveGlowStrength");
    expect(glassCardSource).toContain("glowTone = \"standard\"");
    expect(glassCardSource).toContain("intensity = 18");
    expect(glassCardSource).toContain('tint={isDark ? "dark" : "light"}');
    expect(glassCardSource).not.toContain("unitGlow");
    expect(providerSource).toContain("const accent = SchemeColors[colorScheme].primary");
    expect(providerSource).not.toContain("selectedChalet?.color ?? SchemeColors[colorScheme].primary");
    expect(reportsSource).toContain('glowTone="subtle"');
  });

  it("keeps the bottom navigation as a single translucent glass surface", () => {
    expect(tabLayoutSource).toContain('backgroundColor: "transparent", borderWidth: 1');
    expect(tabLayoutSource).toContain("intensity={18}");
    expect(tabLayoutSource).toContain('tint={isDark ? "dark" : "light"}');
    expect(tabLayoutSource).toContain('tabBarStyle: { position: "relative"');
    expect(tabLayoutSource).toContain("marginHorizontal: 12");
    expect(tabLayoutSource).toContain("activeIconHalo");
    expect(tabLayoutSource).not.toContain('backgroundColor: "rgba(7, 11, 16, 0.86)"');
  });
});
