import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, type Booking, type Settings } from "../lib/booking-model";
import { staffFloatCommissionAudit } from "../lib/reporting";

const memberFloatId = "staff-9";

const memberSettings: Settings = {
  businessName: "منشأة",
  businessPhone: "",
  currency: "د.أ",
  bookingTypes: DEFAULT_SETTINGS.bookingTypes,
  paymentMethods: [],
  paymentRouting: {
    staffFloats: [
      { id: memberFloatId, memberUserId: 9, memberName: "ليث", label: "نقطة ليث", isActive: true },
      { id: "staff-3", memberUserId: 3, memberName: "سامر", label: "نقطة سامر", isActive: true, isCommissionEnabled: true, commissionType: "FIXED_PER_BOOKING", commissionValue: 10 },
      { id: "staff-4", memberUserId: 4, memberName: "رنيم", label: "نقطة رنيم", isActive: true, isCommissionEnabled: true, commissionType: "PERCENTAGE_OF_TOTAL", commissionValue: 5 },
    ],
  },
};

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: "booking-commission-test",
  customerName: "هبة",
  phone: "0790000000",
  chaletId: "chalet-1",
  chaletName: "النوح",
  startDate: "2026-08-26",
  endDate: "2026-08-26",
  bookingType: "evening",
  startTime: "22:00",
  endTime: "09:00",
  price: 150,
  depositAmount: 70,
  depositPaymentMethod: "cash-guardian",
  payments: [],
  notes: "",
  status: "confirmed",
  createdAt: "2026-08-26T10:00:00.000Z",
  ...overrides,
});

describe("سجل تدقيق العمولات داخل وحدة العُهد (كشف تفصيلي لكل حجز)", () => {
  it("يفصّل عمولة ملف الموظف لكل حجز: المرجع والمحصّل وآلية الحساب وتاريخ/وقت التحصيل وحالة المعلّق للصرف", () => {
    const first: Booking = booking({ payments: [{ id: "p1", amount: 100, date: "2026-08-26", recordedAt: "2026-08-26T18:45:00.000Z", paymentMethod: "cash-owner", recipientTargetId: `float-${memberFloatId}`, calculatedCommission: 2.5, commissionType: "percent" }], checkedInAt: "2026-08-26T18:00:00.000Z" });
    const audit = staffFloatCommissionAudit({ bookings: [first], settings: memberSettings, staffFloatSettlements: [] }, memberFloatId);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ bookingId: "booking-commission-test", reference: "booking-commission-test", customerName: "هبة", chaletName: "النوح", date: "2026-08-26", at: "2026-08-26 18:45", collected: 100, mechanism: "2.5% من قيمة التحصيل", commission: 2.5, settled: false });
    expect(audit.totalEarned).toBe(2.5);
    expect(audit.pendingEarned).toBe(2.5);
    expect(audit.settledEarned).toBe(0);
  });

  it("يعرض آليات الحساب: ثابت لكل حجز (النقطة القديمة) وثابت لكل تحصيل (ملف الموظف) ونسبة من إجمالي التحصيل", () => {
    const fixedLegacy: Booking = booking({ id: "b1", payments: [{ id: "p1", amount: 40, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-3" }], status: "completed" });
    const percentLegacy: Booking = booking({ id: "b2", customerName: "أسيل", payments: [{ id: "p2", amount: 100, date: "2026-08-27", paymentMethod: "cash-owner", recipientTargetId: "float-staff-4" }], status: "completed" });
    const fixedMember: Booking = booking({ id: "b3", customerName: "رنا", checkedInAt: "2026-08-27T18:10:00.000Z", payments: [{ id: "p3", amount: 60, date: "2026-08-27", recordedAt: "2026-08-27T18:10:00.000Z", paymentMethod: "cash-owner", recipientTargetId: `float-${memberFloatId}`, calculatedCommission: 10, commissionType: "fixed" }] });
    expect(staffFloatCommissionAudit({ bookings: [fixedLegacy], settings: memberSettings, staffFloatSettlements: [] }, "staff-3").rows[0].mechanism).toBe("مبلغ ثابت لكل حجز");
    expect(staffFloatCommissionAudit({ bookings: [percentLegacy], settings: memberSettings, staffFloatSettlements: [] }, "staff-4").rows[0].mechanism).toBe("5% من إجمالي التحصيل");
    expect(staffFloatCommissionAudit({ bookings: [fixedMember], settings: memberSettings, staffFloatSettlements: [] }, memberFloatId).rows[0].mechanism).toBe("مبلغ ثابت لكل تحصيل");
  });

  it("يصنّف العمولة كمُسوّاة سابقًا عندما يكون تحصيل الحجز مغطًى بتوريد عهدة معتمد", () => {
    const covered: Booking = booking({ id: "b1", payments: [{ id: "p1", amount: 100, date: "2026-08-26", recordedAt: "2026-08-26T18:45:00.000Z", paymentMethod: "cash-owner", recipientTargetId: `float-${memberFloatId}`, calculatedCommission: 2.5, commissionType: "percent", settlementId: "sett-1" }], checkedInAt: "2026-08-26T18:00:00.000Z" });
    const uncovered: Booking = booking({ id: "b2", customerName: "أسيل", payments: [{ id: "p2", amount: 100, date: "2026-08-27", recordedAt: "2026-08-27T18:00:00.000Z", paymentMethod: "cash-owner", recipientTargetId: `float-${memberFloatId}`, calculatedCommission: 2.5, commissionType: "percent" }], checkedInAt: "2026-08-27T18:00:00.000Z" });
    const audit = staffFloatCommissionAudit({ bookings: [covered, uncovered], settings: memberSettings, staffFloatSettlements: [{ id: "sett-1", floatId: memberFloatId, amount: 0, settledAt: "2026-08-28T10:00:00.000Z", settlementDate: "2026-08-28", status: "CONFIRMED" }] }, memberFloatId);
    const settledRow = audit.rows.find((row) => row.bookingId === "b1");
    const pendingRow = audit.rows.find((row) => row.bookingId === "b2");
    expect(settledRow?.settled).toBe(true);
    expect(settledRow?.settlementDate).toBe("2026-08-28");
    expect(pendingRow?.settled).toBe(false);
    expect(audit.settledEarned).toBe(2.5);
    expect(audit.pendingEarned).toBe(2.5);
    expect(audit.totalEarned).toBe(5);
  });

  it("يرتّب الحجوزات تنازليًا حسب وقت التحصيل ويستخدم أول تاريخ تحصيل مع (تاريخ/وقت التحصيل)", () => {
    const early: Booking = booking({ id: "b1", payments: [{ id: "p1", amount: 50, date: "2026-08-26", recordedAt: "2026-08-26T18:45:00.000Z", paymentMethod: "cash-owner", recipientTargetId: `float-${memberFloatId}`, calculatedCommission: 1, commissionType: "percent" }], checkedInAt: "2026-08-26T18:00:00.000Z" });
    const late: Booking = booking({ id: "b2", customerName: "أسيل", payments: [{ id: "p2", amount: 50, date: "2026-08-27", recordedAt: "2026-08-27T21:15:00.000Z", paymentMethod: "cash-owner", recipientTargetId: `float-${memberFloatId}`, calculatedCommission: 1, commissionType: "percent" }], checkedInAt: "2026-08-27T18:00:00.000Z" });
    const rows = staffFloatCommissionAudit({ bookings: [early, late], settings: memberSettings, staffFloatSettlements: [] }, memberFloatId).rows;
    expect(rows.map((row) => row.bookingId)).toEqual(["b2", "b1"]);
  });

  it("يعود بكشف فارغ لعهدة غير موجودة", () => {
    const audit = staffFloatCommissionAudit({ bookings: [], settings: memberSettings, staffFloatSettlements: [] }, "staff-missing");
    expect(audit.rows).toEqual([]);
    expect(audit.totalEarned).toBe(0);
    expect(audit.pendingEarned).toBe(0);
    expect(audit.settledEarned).toBe(0);
  });

  it("يربط الوجهة صف العمولات القابل للنقر وزر الكشف التفصيلي ومكوّن الكشف بدون إضافة تبويب جديد", () => {
    const screen = readFileSync("app/float-settlements.tsx", "utf8");
    const modal = readFileSync("components/floats/CommissionBreakdownModal.tsx", "utf8");
    const reporting = readFileSync("lib/reporting.ts", "utf8");
    expect(screen).toContain("staffFloatCommissionAudit");
    expect(screen).toContain("commissionAudits");
    expect(screen).toContain("كشف وتفصيل العمولات 📑");
    expect(screen).toContain("عرض كشف وتفصيل العمولات");
    expect(screen).toContain("<CommissionBreakdownModal");
    expect(screen).toContain("onOpenBooking");
    expect(screen).toContain('pathname: "/booking-detail"');
    expect(modal).toContain("كشف وتفصيل العمولات 📑");
    expect(modal).toContain("معلّق للصرف");
    expect(modal).toContain("تم تسويته سابقاً");
    expect(modal).toContain("مُسوّاة ✓");
    expect(modal).toContain("لا توجد عمولات لهذه العهدة بعد");
    expect(reporting).toContain("staffFloatCommissionAudit");
    const tabs = readFileSync("app/(tabs)/more.tsx", "utf8") + readFileSync("app/(tabs)/bookings.tsx", "utf8") + readFileSync("app/(tabs)/reports.tsx", "utf8") + readFileSync("app/(tabs)/settings.tsx", "utf8");
    expect(tabs).not.toContain("كشف وتفصيل العمولات 📑");
    expect(tabs).not.toContain("CommissionBreakdownModal");
  });
});