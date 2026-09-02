import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sharedActions = readFileSync(resolve(process.cwd(), "components/booking-quick-actions.tsx"), "utf8");
const home = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
const bookings = readFileSync(resolve(process.cwd(), "app/(tabs)/bookings.tsx"), "utf8");

describe("booking quick actions", () => {
  it("uses the same details, call, and WhatsApp actions for home and active bookings", () => {
    expect(sharedActions).toContain("واتساب");
    expect(sharedActions).toContain("اتصال");
    expect(sharedActions).toContain("التفاصيل");
    expect(sharedActions).toContain('FontAwesome name="whatsapp"');
    expect(sharedActions).toContain("RipplePressable");
    expect(sharedActions).toContain("surfaceColor={colors.glassInset}");
    expect(sharedActions).toContain("backgroundColor: surfaceColor");
    expect(sharedActions).not.toContain('backgroundColor: "rgba(255,255,255,0.045)"');
    expect(sharedActions).toContain('backgroundColor: colors.glassInset');
    expect(sharedActions).toContain('borderColor: themeColor + "52"');
    expect(sharedActions).toContain('color: themeColor');
    expect(sharedActions).not.toContain("<GlassButton");
    expect(home).toContain("<BookingQuickActions");
    expect(bookings).toContain("<BookingQuickActions");
    expect(home).toContain("themeColor={themeColor}");
    expect(bookings).toContain("themeColor={themeColor}");
    expect(bookings).toContain("!isHistoryView ? <><BookingQuickActions");
    expect(bookings).toContain("<WaitlistBookingSummary");
    expect(bookings).toContain("openWhatsAppChat");
    expect(bookings).toContain("buildBookingConfirmationMessage");
    expect(bookings).toContain("Linking.openURL");
  });
});
