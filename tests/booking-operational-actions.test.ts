import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const store = readFileSync(resolve(process.cwd(), "lib/booking-store.tsx"), "utf8");
const home = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
const bookings = readFileSync(resolve(process.cwd(), "app/(tabs)/bookings.tsx"), "utf8");
const audit = readFileSync(resolve(process.cwd(), "app/audit-log.tsx"), "utf8");
const detail = readFileSync(resolve(process.cwd(), "app/booking-detail.tsx"), "utf8");

describe("booking operational quick actions", () => {
  it("records a checked-in and completed stay with permissions and audit entries", () => {
    expect(store).toContain("markBookingCheckedIn");
    expect(store).toContain("completeBookingStay");
    expect(store).toContain('action: "booking-checked-in"');
    expect(store).toContain('action: "booking-checked-out"');
    expect(store).toContain('status: "completed" as const');
    expect(store).toContain('if (!confirmation || !confirmation.inspectionPassed) throw new Error("checkout-inspection-required")');
    expect(store).toContain('bookingId: id, subjectName: booking.customerName');
  });

  it("renders the operational actions in both booking lists and the audit log", () => {
    expect(home).toContain("operationalAction={operationalActionFor(booking)}");
    expect(bookings).toContain("operationalAction={operationalActionFor(item)}");
    expect(audit).toContain('"booking-checked-in"');
    expect(audit).toContain('"booking-checked-out"');
    expect(audit).toContain('details.includes("لم يحضر")');
    expect(home).toContain("operationalFailureMessage");
    expect(bookings).toContain("operationalFailureMessage");
    expect(store).toContain("check-in-forbidden");
    expect(detail).toContain("تم إلغاء أو أرشفة الحجز");
    expect(detail).toContain('entry.action === "booking-cancelled"');
  });

  it("asks for confirmation before every operational state change", () => {
    expect(bookings).toContain("تأكيد تسجيل الوصول");
    expect(bookings).toContain("تأكيد تسجيل المغادرة");
    expect(bookings).toContain("تأكيد أرشفة عدم الحضور");
    expect(bookings).toContain("هل وصل ${booking.customerName} بالفعل؟");
    expect(bookings).toContain('style: action === "no-show" ? "destructive" : "default"');
  });
});
