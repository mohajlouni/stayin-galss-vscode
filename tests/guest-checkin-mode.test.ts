import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { formatRemainingTime, getBookingDisplayOperationalState } from "../lib/booking-model";

const booking = {
  id: "booking-checkin-mode",
  startDate: "2026-08-26",
  endDate: "2026-08-28",
  startTime: "10:00",
  endTime: "15:00",
  bookingType: "multi-day" as const,
};

describe("guest check-in display modes", () => {
  it("formats long and short Arabic operational countdowns without raw large hour totals", () => {
    expect(formatRemainingTime((2 * 24 * 60 + 5 * 60) * 60_000, "ar")).toBe("يومان و 5 ساعات");
    expect(formatRemainingTime((4 * 60 + 30) * 60_000, "ar")).toBe("4 ساعات و 30 دقيقة");
    expect(formatRemainingTime(45 * 60_000, "ar")).toBe("45 دقيقة");
  });

  it("keeps manual arrival awaiting confirmation while automatic mode follows booking time", () => {
    const duringStay = new Date(2026, 7, 26, 12, 0).getTime();
    expect(getBookingDisplayOperationalState(booking, duringStay, true).state).toBe("awaiting-arrival");
    expect(getBookingDisplayOperationalState(booking, duringStay, false).state).toBe("in-house");
    expect(getBookingDisplayOperationalState(booking, new Date(2026, 7, 26, 9, 0).getTime(), false).state).toBe("awaiting-arrival");
    expect(getBookingDisplayOperationalState(booking, new Date(2026, 7, 28, 16, 0).getTime(), false).state).toBe("ended");
  });

  it("binds the home card and its action buttons to the saved manual check-in preference", () => {
    const home = readFileSync("app/(tabs)/index.tsx", "utf8");
    const card = readFileSync("components/booking-card.tsx", "utf8");
    const bookings = readFileSync("app/(tabs)/bookings.tsx", "utf8");
    const detail = readFileSync("app/booking-detail.tsx", "utf8");
    const store = readFileSync("lib/booking-store.tsx", "utf8");
    const preferences = readFileSync("lib/app-preferences.tsx", "utf8");
    const settings = readFileSync("app/(tabs)/settings.tsx", "utf8");
    expect(home).toContain("manualCheckInMode={deviceSettings.showGuestCheckIn}");
    expect(home).toContain("if (!deviceSettings.showGuestCheckIn) return undefined;");
    expect(bookings).toContain('operationalState === "no-show" && deviceSettings.showGuestCheckIn');
    expect(card).toContain("getBookingDisplayOperationalState");
    expect(card).toContain("const activeManualCheckInMode = manualCheckInMode && deviceSettings.showGuestCheckIn");
    expect(card).toContain('language === "ar" ? "انتهت فترة الإقامة · لم يُسجل الوصول"');
    expect(card).toContain('language === "ar" ? "لم يُسجل الوصول بعد · الإقامة جارية"');
    expect(card).toContain('language === "ar" ? `تم تسجيل الوصول ✓ · الإقامة جارية · متبقي: ${remaining}`');
    expect(card).toContain('language === "ar" ? `الإقامة جارية · متبقي: ${remaining}`');
    expect(card).not.toContain('"لم يحضر الضيف"');
    expect(card).not.toContain('color: "#EF4444"');
    expect(card).not.toContain("تأخر عن الوصول");
    expect(detail).toContain("const manualCheckInEnabled = deviceSettings.showGuestCheckIn");
    expect(detail).toContain("getBookingDisplayOperationalState(booking, clock, manualCheckInEnabled)");
    expect(detail).toContain("const manualOperationalState = getBookingOperationalState(booking, clock).state");
    expect(detail).toContain('manualCheckInEnabled && can("edit_bookings") && manualOperationalState === "late-arrival"');
    expect(detail).toContain('manualCheckInEnabled && can("edit_bookings") && (manualOperationalState === "in-house" || manualOperationalState === "checkout-warning")');
    expect(detail).toContain("const actualArrivalTime = (() => {");
    expect(detail).toContain('language === "ar" ? "وصول يدوي"');
    expect(detail).toContain('language === "ar" ? "وصول تلقائي"');
    expect(detail).toContain('language === "ar" ? `وصل ${actualArrivalTime}`');
    expect(preferences).toContain("guestCheckInModeHistory = [{ enabled: patch.showGuestCheckIn");
    expect(settings).toContain("سجل وضع الوصول");
    expect(settings).toContain("guestCheckInModeHistory");
    expect(settings).toContain("يتم تتبع الحجوزات زمنيًا وتلقائيًا");
    expect(detail).toContain("التتبع اليدوي معطّل (يعمل بالوضع الزمني التلقائي)");
    expect(detail).toContain("تعديل وقت الوصول / المغادرة");
    expect(detail).toContain("معالجة حالة لم يحضر الضيف");
    expect(detail).toContain("booking-status-corrected");
    expect(store).toContain("correctBookingStay");
    expect(store).toContain("stay-correction-forbidden");
  });
});
