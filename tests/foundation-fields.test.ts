import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, normalizeAppData, normalizeBookingSource, normalizeChaletLatitude, normalizePayoutStatus } from "../lib/booking-model";

const project = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const baseData = {
  waitlist: [],
  turnoverTasks: [],
  specialPriceRules: [],
  auditLog: [],
  settings: DEFAULT_SETTINGS,
};

describe("foundation fields: publish, verify, location and booking origin", () => {
  it("declares the future-proof fields on the chalet and booking models", () => {
    const model = project("lib/booking-model.ts");
    for (const field of ["isPublished", "isVerified", "latitude", "longitude", "googleMapsUrl"]) expect(model).toContain(field);
    for (const field of ["bookingSource", "commissionRate", "commissionAmount", "payoutStatus", "guest_app"]) expect(model).toContain(field);
  });

  it("normalizes and preserves valid publish/location metadata on chalets", () => {
    const result = normalizeAppData({
      ...baseData,
      chalets: [{ id: "c1", name: "الوحدة", color: "#FF6B47", latitude: 32.2, longitude: 35.9, googleMapsUrl: " https://maps.example/?q=ping? ", isPublished: true, isVerified: false, createdAt: "2026-08-20T10:00:00.000Z" }],
    });
    const chalet = result.chalets[0];
    expect(chalet.latitude).toBe(32.2);
    expect(chalet.longitude).toBe(35.9);
    expect(chalet.googleMapsUrl).toBe("https://maps.example/?q=ping?");
    expect(chalet.isPublished).toBe(true);
    expect(chalet.isVerified).toBe(false);
  });

  it("drops invalid coordinates while keeping the chalet", () => {
    const result = normalizeAppData({
      ...baseData,
      chalets: [{ id: "c1", name: "الوحدة", color: "#FF6B47", latitude: 999, longitude: "35.9" as unknown as number, createdAt: "2026-08-20T10:00:00.000Z" }],
    });
    expect(result.chalets[0].latitude).toBeUndefined();
    expect(result.chalets[0].longitude).toBeUndefined();
  });

  it("normalizes and preserves booking origin, commission and payout metadata", () => {
    const result = normalizeAppData({
      ...baseData,
      bookings: [{ id: "b1", customerName: "سارة", phone: "0790000000", chaletId: "c1", chaletName: "الوحدة", startDate: "2026-09-01", endDate: "2026-09-02", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 120, depositAmount: 30, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-20T10:00:00.000Z", bookingSource: "guest_app", commissionRate: "10" as unknown as number, commissionAmount: 12, payoutStatus: "paid" }],
    });
    const booking = result.bookings[0];
    expect(booking.bookingSource).toBe("guest_app");
    expect(booking.commissionRate).toBe(10);
    expect(booking.commissionAmount).toBe(12);
    expect(booking.payoutStatus).toBe("paid");
    expect(normalizeBookingSource("bad-source")).toBeUndefined();
    expect(normalizePayoutStatus("confirmed")).toBeUndefined();
    expect(normalizeChaletLatitude(200)).toBeUndefined();
  });

  it("adds account-level tenancy fields to the workspaces table schema", () => {
    const schema = project("drizzle/schema.ts");
    expect(schema).toContain('ownerUserId: int("ownerUserId")');
    expect(schema).toContain('accountTier: mysqlEnum("accountTier", ["free", "private_saas"])');
    expect(schema).toContain("isAccountLocked");
    expect(schema).toContain("lockReason");
    expect(schema).toContain("marketplaceCommissionPercent");
  });
});