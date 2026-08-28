import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const home = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
const bookings = readFileSync(resolve(process.cwd(), "app/(tabs)/bookings.tsx"), "utf8");
const detail = readFileSync(resolve(process.cwd(), "app/booking-detail.tsx"), "utf8");

describe("arrival feedback and booking-detail action colors", () => {
  it("opens the structured arrival confirmation and preserves visible success or error feedback in both booking lists", () => {
    for (const screen of [home, bookings]) {
      expect(screen).toContain("saveOperationalAction");
      expect(screen).toContain("runOperationalAction");
      expect(screen).toContain("CheckInConfirmationSheet");
      expect(screen).toContain("checkInBooking");
      expect(screen).toContain("operationalFeedback");
      expect(screen).toContain("تم تسجيل وصول الضيف بنجاح.");
      expect(screen).toContain("جارٍ تسجيل الوصول");
      expect(screen).toContain('saveOperationalAction(checkInBooking, "check-in", confirmation)');
    }
  });

  it("records arrival verification details and shows the per-booking activity history in booking details", () => {
    expect(detail).toContain("CheckInConfirmationSheet");
    expect(detail).toContain("recordGuestArrival");
    expect(detail).toContain("مقيم حاليًا");
    expect(detail).toContain("سجل الحركات");
    expect(detail).toContain("بواسطة:");
    expect(detail).toContain("bookingActivity");
  });

  it("uses the unified emerald accent for primary booking-detail actions", () => {
    expect(detail).toContain("accentColor={colors.primary}");
    expect(detail).not.toContain('accentColor="#38BDF8"');
    expect(detail).toContain("whatsappSendItemLabel(item, language)");
    expect(detail).toContain("item === \"contract\"");
    expect(detail).toContain("borderColor: actionColor + \"70\"");
  });
});
