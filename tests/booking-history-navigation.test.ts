import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const historySource = readFileSync(resolve(process.cwd(), "app/booking-history.tsx"), "utf8");
const bookingsSource = readFileSync(resolve(process.cwd(), "app/(tabs)/bookings.tsx"), "utf8");

describe("Legacy booking history navigation", () => {
  it("redirects old history links to the regular bookings tab", () => {
    expect(historySource).toContain("Redirect");
    expect(historySource).toContain('href={"/(tabs)/bookings"');
    expect(historySource).not.toContain("mode=history");
  });

  it("keeps both booking tabs inside the regular bookings screen", () => {
    expect(bookingsSource).toContain('useState<"active" | "history">("active")');
    expect(bookingsSource).toContain("الحجوزات النشطة");
    expect(bookingsSource).toContain("منتهي الإقامة");
    expect(bookingsSource).toContain('historyBookings.filter((booking) => booking.status !== "cancelled")');
    expect(bookingsSource).toContain("showStatusFilter={!isHistoryView}");
    expect(bookingsSource).not.toContain("isMoreHistory");
  });
});
