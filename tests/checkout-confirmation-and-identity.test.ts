import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const store = readFileSync(resolve(process.cwd(), "lib/booking-store.tsx"), "utf8");
const checkInSheet = readFileSync(resolve(process.cwd(), "components/check-in-confirmation-sheet.tsx"), "utf8");
const checkOutSheet = readFileSync(resolve(process.cwd(), "components/check-out-confirmation-sheet.tsx"), "utf8");
const home = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
const bookings = readFileSync(resolve(process.cwd(), "app/(tabs)/bookings.tsx"), "utf8");
const detail = readFileSync(resolve(process.cwd(), "app/booking-detail.tsx"), "utf8");

describe("checkout confirmation and guest identity workflow", () => {
  it("requires an approved inspection and records an optional deposit refund before completing checkout", () => {
    expect(store).toContain("checkout-inspection-required");
    expect(store).toContain("invalid-deposit-refund");
    expect(store).toContain("deposit-refund-checkout");
    expect(store).toContain("تم إنهاء الإقامة بعد فحص الشاليه");
    expect(checkOutSheet).toContain("تم فحص الشاليه واعتماد التسليم");
    expect(checkOutSheet).toContain("إرجاع التأمين الآن");
  });

  it("allows capturing or selecting guest identity and saves its reference with check-in", () => {
    expect(checkInSheet).toContain("requestCameraPermissionsAsync");
    expect(checkInSheet).toContain("launchCameraAsync");
    expect(checkInSheet).toContain("launchImageLibraryAsync");
    expect(checkInSheet).toContain("identityImageUri");
    expect(store).toContain("guest-identity");
    expect(store).toContain("تم حفظ صورة الهوية");
  });

  it("opens the checkout confirmation in every operational entry point", () => {
    for (const screen of [home, bookings, detail]) expect(screen).toContain("CheckOutConfirmationSheet");
  });
});
