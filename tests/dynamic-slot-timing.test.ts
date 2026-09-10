import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Booking, isFlexibleShift, nextUpcomingBookingGap } from "../lib/booking-model";

const source = readFileSync(resolve(process.cwd(), "app/booking-form.tsx"), "utf8");
const modelSource = readFileSync(resolve(process.cwd(), "lib/booking-model.ts"), "utf8");

const base = (overrides: Partial<Booking> = {}): Booking => ({ id: "1", customerName: "أحمد", phone: "079", startDate: "2026-08-17", endDate: "2026-08-17", bookingType: "custom", startTime: "14:00", endTime: "17:00", price: 100, payments: [], notes: "", status: "confirmed", createdAt: "", shiftId: "custom-1", ...overrides });

describe("dynamic slot timing helpers", () => {
  it("unlocks custom, event, and other periods while standard presets stay timed", () => {
    expect(isFlexibleShift({ id: "x", name: "فترة مخصصة", periodKind: "custom" })).toBe(true);
    expect(isFlexibleShift({ id: "y", name: "مناسبة / تصوير", periodKind: "event" })).toBe(true);
    expect(isFlexibleShift({ id: "z", name: "فترة أخرى", periodKind: "other" })).toBe(true);
    expect(isFlexibleShift({ id: "m", name: "صباحي", periodKind: "morning" })).toBe(false);
    expect(isFlexibleShift({ id: "e", name: "سهرة", periodKind: "evening" })).toBe(false);
    expect(isFlexibleShift({ id: "o", name: "24 ساعة", periodKind: "overnight" })).toBe(false);
    expect(isFlexibleShift({ id: "f", name: "يوم كامل", periodKind: "full_day" })).toBe(false);
  });

  it("infers flexibility from the shift name when no period kind is stored", () => {
    expect(isFlexibleShift({ id: "x", name: "تصوير" })).toBe(true);
    expect(isFlexibleShift({ id: "x", name: "مناسبة" })).toBe(true);
    expect(isFlexibleShift({ id: "x", name: "مخصص" })).toBe(true);
    expect(isFlexibleShift({ id: "x", name: "صباحي" })).toBe(false);
  });

  it("measures the gap to the next upcoming booking on the same chalet", () => {
    const candidate = base({ startDate: "2026-08-17", endDate: "2026-08-17", startTime: "14:00", endTime: "17:00", chaletName: "الوردة" });
    const nextDay = base({ id: "2", startDate: "2026-08-18", endDate: "2026-08-18", startTime: "09:00", endTime: "21:00", chaletName: "الوردة" });
    const gap = nextUpcomingBookingGap(candidate, [nextDay]);
    expect(gap?.booking.id).toBe("2");
    expect(gap?.gapMinutes).toBe(16 * 60);
  });

  it("flags tight short gaps below the 90-minute cleaning buffer", () => {
    const candidate = base({ startDate: "2026-08-17", endDate: "2026-08-17", startTime: "14:00", endTime: "17:00", chaletName: "الوردة" });
    const tooTight = nextUpcomingBookingGap(candidate, [base({ id: "2", startTime: "18:30", endTime: "21:00", chaletName: "الوردة" })]);
    expect(tooTight?.gapMinutes).toBe(90);
    const clean = nextUpcomingBookingGap(candidate, [base({ id: "3", startTime: "18:45", endTime: "21:00", chaletName: "الوردة" })]);
    expect(clean?.gapMinutes).toBe(105);
  });

  it("ignores overlapping, cancelled, waitlisted, other-chalet, and self bookings", () => {
    const candidate = base({ id: "1", startDate: "2026-08-17", endDate: "2026-08-17", startTime: "14:00", endTime: "17:00", chaletName: "الوردة" });
    const others = [
      base({ id: "2", startTime: "15:00", endTime: "20:00", chaletName: "الوردة" }),
      base({ id: "3", startDate: "2026-08-18", endDate: "2026-08-18", startTime: "09:00", endTime: "21:00", status: "cancelled", chaletName: "الوردة" }),
      base({ id: "4", startDate: "2026-08-18", endDate: "2026-08-18", startTime: "09:00", endTime: "21:00", status: "waitlisted", chaletName: "الوردة" }),
      base({ id: "5", startDate: "2026-08-18", endDate: "2026-08-18", startTime: "09:00", endTime: "21:00", chaletName: "الياسمين" }),
      base({ id: "1", startDate: "2026-08-18", endDate: "2026-08-18", startTime: "09:00", endTime: "21:00", chaletName: "الوردة" }),
    ];
    expect(nextUpcomingBookingGap(candidate, others, candidate.id)).toBeNull();
  });

  it("lets the booking form unlock flexible time inputs and drive ad-hoc collision messaging", () => {
    expect(source).toContain("editable={flexibleSlot}");
    expect(source).toContain("if (!isFlexibleShift(shift)) { setStartTime(shift.startTime); setEndTime(shift.endTime); }");
    expect(source).toContain("useEffect(() => { if (!existing && !cloneSource && flexibleSlot) setPriceIsManual(true); }");
    expect(source).toContain("⚠️ تعارض في الساعات: الشاليه محجوز في هذه الفترة حتى ");
    expect(source).toContain("formatTime(blocking.endTime)");
    expect(source).toContain("⚡ تنبيه تشغيلي: الفترة الفاصلة للتنظيف وتجهيز الشاليه قبل الحجز القادم هي ");
    expect(source).toContain("دقيقة فقط.");
  });

  it("exposes the shift-gap helpers from the central booking model", () => {
    expect(modelSource).toContain("export function isFlexibleShift");
    expect(modelSource).toContain("export function nextUpcomingBookingGap");
  });
});