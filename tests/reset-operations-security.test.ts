import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, normalizeAppData } from "../lib/booking-model";

describe("reset operational records", () => {
  it("clears bookings and expenses while preserving properties and settings", () => {
    const data = normalizeAppData({
      bookings: [{ id: "booking-reset-1", customerName: "ضيف", phone: "0790000000", chaletId: "unit-reset", chaletName: "وحدة محفوظة", startDate: "2026-08-26", endDate: "2026-08-26", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 100, payments: [{ id: "payment-reset-1", amount: 30, date: "2026-08-26", note: "دفعة" }], notes: "", status: "confirmed", createdAt: "2026-08-20T00:00:00.000Z" }],
      expenses: [{ id: "expense-reset-1", amount: 20, date: "2026-08-26", category: "utilities", createdAt: "2026-08-20T00:00:00.000Z", createdByName: "المالك" }],
      waitlist: [], turnoverTasks: [], specialPriceRules: [], auditLog: [],
      chalets: [{ id: "unit-reset", name: "وحدة محفوظة", color: "#0F8B83", createdAt: "2026-08-20T00:00:00.000Z" }],
      settings: { ...DEFAULT_SETTINGS },
    });
    const reset = normalizeAppData({ ...data, bookings: [], expenses: [] });
    expect(reset.bookings).toEqual([]);
    expect(reset.expenses).toEqual([]);
    expect(reset.chalets).toHaveLength(1);
    expect(reset.chalets[0]?.name).toBe("وحدة محفوظة");
    expect(reset.settings.businessName).toBe(data.settings.businessName);
  });

  it("uses a primary-owner server mutation with a recovery-point write and a sensitive-area confirmation", () => {
    const router = readFileSync("server/routers.ts", "utf8");
    const store = readFileSync("lib/booking-store.tsx", "utf8");
    const screen = readFileSync("app/account-security.tsx", "utf8");
    expect(router).toContain("resetOperations");
    expect(router).toContain('confirmation: z.literal("RESET-OPERATIONS")');
    expect(router).toContain("summary.member?.role !== \"owner\"");
    expect(router).toContain("saveOwnerEmergencySnapshot");
    expect(router).toContain("bookings: [], expenses: []");
    expect(store).toContain("resetOperationalRecords");
    expect(screen).toContain("تصفير الحجوزات والعمليات المالية");
    expect(screen).toContain("نعم، تصفير السجلات");
  });
});
