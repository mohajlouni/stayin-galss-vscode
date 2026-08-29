import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { type Booking } from "../lib/booking-model";
import { findBookingDateConflicts, validateBookingInput } from "../lib/booking-validation";

const validDraft = {
  customerName: "سارة",
  phone: "0790000000",
  chaletId: "chalet-1",
  startDate: "2026-09-01",
  endDate: "2026-09-02",
  bookingType: "morning" as const,
  startTime: "09:00",
  endTime: "21:00",
  price: 120,
  depositAmount: 30,
};

describe("Booking validation service", () => {
  it("accepts a valid draft and normalizes the Jordanian phone", () => {
    const result = validateBookingInput(validDraft);
    expect(result).toEqual({ ok: true, normalizedPhone: "+962790000000" });
  });

  it("rejects an invalid phone and a non-positive price with Arabic field messages", () => {
    expect(validateBookingInput({ ...validDraft, phone: "0790" })).toMatchObject({ ok: false, field: "phone" });
    expect(validateBookingInput({ ...validDraft, price: 0 })).toMatchObject({ ok: false, field: "price" });
    expect(validateBookingInput({ ...validDraft, depositAmount: -5 })).toMatchObject({ ok: false, field: "depositAmount" });
    expect(validateBookingInput({ ...validDraft, customerName: " " })).toMatchObject({ ok: false, field: "customerName" });
    expect(validateBookingInput({ ...validDraft, endDate: "01-09-2026" })).toMatchObject({ ok: false, field: "endDate" });
  });

  it("detects date-shift conflicts while ignoring cancelled and completed bookings", () => {
    const draft = { id: "draft-1", ...validDraft, chaletName: "الوحدة" } as unknown as Booking;
    const blocking = { id: "b-1", chaletId: "chalet-1", startDate: "2026-09-01", endDate: "2026-09-02", startTime: "09:00", endTime: "21:00", bookingType: "morning", status: "confirmed" } as Booking;
    const cancelled = { ...blocking, id: "b-2", status: "cancelled" } as Booking;
    const ignored = { id: "b-3", chaletId: "chalet-other", startDate: "2026-09-01", endDate: "2026-09-02", startTime: "09:00", endTime: "21:00", bookingType: "morning", status: "confirmed" } as Booking;
    expect(findBookingDateConflicts(draft, [blocking, cancelled, ignored])).toHaveLength(1);
    expect(findBookingDateConflicts(draft, [blocking, cancelled, ignored], "draft-1").map((item) => item.id)).toEqual(["b-1"]);
  });

  it("backs the save flow of the booking form with the shared validation service", () => {
    const form = readFileSync(resolve(process.cwd(), "app/booking-form.tsx"), "utf8");
    expect(form).toContain('import { validateBookingInput } from "@/lib/booking-validation";');
    expect(form).toContain("const validation = validateBookingInput(draft)");
    expect(form).toContain("validation.message");
  });
});