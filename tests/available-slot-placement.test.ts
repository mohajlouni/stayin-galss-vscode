import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const bookingCard = readFileSync(resolve(process.cwd(), "components/booking-card.tsx"), "utf8");
const home = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
const bookings = readFileSync(resolve(process.cwd(), "app/(tabs)/bookings.tsx"), "utf8");

describe("available slot placement", () => {
  it("keeps a chalet vacancy outside the customer card in both booking lists", () => {
    expect(bookingCard).not.toContain("availability?: ReactNode");
    expect(home).not.toContain("availability={");
    expect(bookings).not.toContain("availability={");
    expect(home).toContain("<BookingCard booking={booking}");
    expect(home).toContain("<AvailableSlotCard chaletName={chaletLabel(booking.chaletId");
    expect(bookings).toContain("<BookingCard booking={item}");
    expect(bookings).toContain("<AvailableSlotCard chaletName={chaletLabel(item.chaletId");
  });
});
