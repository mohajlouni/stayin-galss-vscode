import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../lib/booking-model";
import { parseStoredAppData } from "../lib/backup-import";

describe("stored workspace snapshot hydration", () => {
  const storedSnapshot = {
    bookings: [{ id: "booking-history-1", customerName: "ضيف سابق", phone: "0790000000", chaletId: "unit-history", chaletName: "وحدة تاريخية", startDate: "2026-08-23", endDate: "2026-08-23", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 125, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-22T10:00:00.000Z" }],
    waitlist: [],
    chalets: [{ id: "unit-history", name: "وحدة تاريخية", color: "#0F8B83", createdAt: "2026-08-20T10:00:00.000Z" }],
    turnoverTasks: [],
    expenses: [],
    specialPriceRules: [],
    auditLog: [{ id: "audit-history-1", action: "booking-checked-in", subjectName: "ضيف سابق", details: "تسجيل وصول تاريخي", createdAt: "2026-08-23T09:00:00.000Z" }],
    settings: { ...DEFAULT_SETTINGS },
  };

  it("preserves bookings when a historical audit action is newer than the external import schema", () => {
    const hydrated = parseStoredAppData(JSON.stringify(storedSnapshot));
    expect(hydrated.bookings).toHaveLength(1);
    expect(hydrated.bookings[0]?.id).toBe("booking-history-1");
    expect(hydrated.chalets).toHaveLength(1);
  });

  it("uses the compatible parser for both local and shared workspace snapshots", () => {
    const store = readFileSync("lib/booking-store.tsx", "utf8");
    expect(store).toContain("parseStoredAppData(raw)");
    expect(store).toContain("parseStoredAppData(remoteData.data.payload)");
    expect(store).toContain("parseStoredAppData(result.data.payload)");
  });
});
