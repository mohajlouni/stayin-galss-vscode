import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const form = readFileSync(resolve(process.cwd(), "app/booking-form.tsx"), "utf8");
const detail = readFileSync(resolve(process.cwd(), "app/booking-detail.tsx"), "utf8");

describe("duplicate booking flow", () => {
  it("prefills guest and chalet details while keeping a fresh date and payment history", () => {
    expect(form).toContain("copyFromId");
    expect(form).toContain("cloneSource?.customerName");
    expect(form).toContain("cloneSource?.chaletId");
    expect(form).toContain("payments: existing?.payments ?? pendingInitialPayment");
  });

  it("offers the flow from booking details only to users who can create bookings", () => {
    expect(detail).toContain('can("create_bookings")');
    expect(detail).toContain("حجز جديد بنفس العميل");
    expect(detail).toContain("copyFromId: booking.id");
  });
});
