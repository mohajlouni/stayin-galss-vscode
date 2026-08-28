import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const storeSource = readFileSync(resolve(process.cwd(), "lib/booking-store.tsx"), "utf8");
const formSource = readFileSync(resolve(process.cwd(), "app/booking-form.tsx"), "utf8");
const auditLogSource = readFileSync(resolve(process.cwd(), "app/audit-log.tsx"), "utf8");

describe("Waitlist promotion", () => {
  it("uses one promotion operation when a waiting request replaces conflicting bookings", () => {
    expect(formSource).toContain("promoteWaitlist(sourceWaitlist.id, next, conflicts.map((item) => item.id))");
    expect(storeSource).toContain("status: \"promoted\" as const");
    expect(storeSource).toContain("promotedBookingReference: bookingReference");
    expect(storeSource).toContain("status: \"cancelled\" as const");
  });

  it("records the created booking, replaced guest, and operator in the audit log", () => {
    expect(storeSource).toContain("تم التحويل إلى الحجز");
    expect(storeSource).toContain("استُبدل حجز العميل");
    expect(storeSource).toContain("نفّذ التحويل");
    expect(storeSource).toContain("createdByName: actorName");
    expect(storeSource).toContain("promotedByName: actorName");
    expect(auditLogSource).toContain("function detailsForEntry");
    expect(auditLogSource).toContain("styles.detailBlock");
  });
});
