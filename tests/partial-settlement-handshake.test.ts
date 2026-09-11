import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, type Booking, normalizeAppData, staffFloatCommissionEarned, staffFloatOutstanding, staffFloatSettledTotal, bookingEarnedCommission, type Settings } from "../lib/booking-model";
import { staffFloatStatements } from "../lib/reporting";

const floatId = "staff-1";
const pctFloatId = "staff-2";
const commissionSettings: Settings = {
  businessName: "منشأة",
  businessPhone: "",
  currency: "د.أ",
  bookingTypes: DEFAULT_SETTINGS.bookingTypes,
  paymentMethods: [],
  paymentRouting: {
    staffFloats: [
      { id: floatId, memberUserId: 7, memberName: "عصام", label: "نقطة الحارس", isActive: true, isCommissionEnabled: true, commissionType: "FIXED_PER_BOOKING", commissionValue: 10 },
      { id: pctFloatId, memberUserId: 8, memberName: "ريم", label: "نقطة ريم", isActive: true, isCommissionEnabled: true, commissionType: "PERCENTAGE_OF_TOTAL", commissionValue: 5 },
    ],
  },
};

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: "booking-float-test",
  customerName: "أحمد",
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
  payments: [{ id: "p1", amount: 40, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" }],
  depositCollection: { id: "d1", amount: 70, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" },
  notes: "",
  status: "confirmed",
  createdAt: "2026-08-26T10:00:00.000Z",
  ...overrides,
});

const settle = (overrides: Record<string, unknown> = {}) => ({ id: "s1", floatId, amount: 50, settledAt: "2026-08-28T10:00:00.000Z", ...overrides });

describe("المرحلة الخامسة: التوريد الجزئي وطلبات التوريد والعمولات", () => {
  it("تحتسب عمولة ثابتة لكل حجز محصَّل عبر العهدة وعمولة نسبة من إجمالي التحصيل", () => {
    const first: Booking = booking({ payments: [{ id: "p1", amount: 40, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" }], depositCollection: { id: "d1", amount: 30, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" } });
    const second: Booking = booking({ id: "booking-b", customerName: "ميس", depositCollection: undefined, payments: [{ id: "p2", amount: 30, date: "2026-08-27", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" }] });
    const pct: Booking = booking({ id: "booking-c", depositCollection: undefined, payments: [{ id: "p3", amount: 100, date: "2026-08-27", paymentMethod: "cash-owner", recipientTargetId: "float-staff-2" }] });
    const cancelled: Booking = booking({ id: "booking-x", status: "cancelled", depositCollection: undefined, payments: [{ id: "p4", amount: 90, date: "2026-08-27", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" }] });
    expect(staffFloatCommissionEarned({ bookings: [first, second, pct, cancelled], settings: commissionSettings }, floatId)).toBe(20);
    expect(staffFloatCommissionEarned({ bookings: [first, second, pct], settings: commissionSettings }, pctFloatId)).toBe(5);
    expect(staffFloatCommissionEarned({ bookings: [first], settings: { ...commissionSettings, paymentRouting: { staffFloats: [{ id: floatId, label: "نقطة الحارس", isActive: true, isCommissionEnabled: false }] } } }, floatId)).toBe(0);
    expect(bookingEarnedCommission(commissionSettings, first)).toBe(10);
    expect(bookingEarnedCommission(commissionSettings, cancelled)).toBe(0);
  });

  it("تخصم عمولات الموظف المستحقة من الرصيد المعلق للعهدة", () => {
    const first: Booking = booking({ payments: [{ id: "p1", amount: 40, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" }], depositCollection: { id: "d1", amount: 70, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" } });
    const second: Booking = booking({ id: "booking-b", depositCollection: undefined, payments: [{ id: "p2", amount: 30, date: "2026-08-27", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" }] });
    const data = normalizeAppData({ bookings: [first, second], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], settings: commissionSettings });
    expect(staffFloatCommissionEarned(data, floatId)).toBe(20);
    expect(staffFloatOutstanding(data, floatId)).toBe(140 - 20);
  });

  it("تستبعد طلبات التوريد المعلقة والمرفوضة من السجل والرصيد وتضبط الحالة الافتراضية للتسويات القديمة", () => {
    const first: Booking = booking({ payments: [{ id: "p1", amount: 40, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" }], depositCollection: { id: "d1", amount: 70, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" } });
    const data = normalizeAppData({
      bookings: [first],
      waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [],
      staffFloatSettlements: [settle(), settle({ id: "s2", amount: 999, status: "PENDING_APPROVAL" }), settle({ id: "s3", amount: 999, status: "REJECTED" })],
      settings: commissionSettings,
    });
    expect(data.staffFloatSettlements?.[0].status).toBe("CONFIRMED");
    expect(data.staffFloatSettlements?.find((entry) => entry.id === "s2")?.status).toBe("PENDING_APPROVAL");
    expect(staffFloatSettledTotal(data, floatId)).toBe(50);
    expect(staffFloatOutstanding(data, floatId)).toBe(110 - 50 - 10);
    const statement = staffFloatStatements(data).find((entry) => entry.float.id === floatId);
    expect(statement).toBeDefined();
    expect(statement).toMatchObject({ collectedTotal: 110, paidOutTotal: 0, settledTotal: 50, outstanding: 50, commissionEarned: 10 });
    expect(statement?.settlements.map((entry) => entry.id)).toEqual(["s1"]);
    expect(statement?.settlements[0].status).toBe("CONFIRMED");
    expect(statement?.settlements[0]).not.toHaveProperty("rejectReason");
  });

  it("يحافظ التطبيع على حقول طلب التوريد المعلق (المرسل، الإيصال، السبب، العمولة المخصومة)", () => {
    const data = normalizeAppData({
      bookings: [booking()],
      waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [],
      staffFloatSettlements: [settle({ id: "req-1", amount: 40, status: "PENDING_APPROVAL", requestedByUserId: 7, requestedByName: "عصام", receiptUri: "file:///receipts/r.jpg", rejectReason: "مبلغ مكرر", commissionOffset: 10 })],
      settings: commissionSettings,
    });
    expect(data.staffFloatSettlements?.[0]).toMatchObject({ id: "req-1", status: "PENDING_APPROVAL", requestedByUserId: 7, requestedByName: "عصام", receiptUri: "file:///receipts/r.jpg", rejectReason: "مبلغ مكرر", commissionOffset: 10 });
    const legacyInScope = normalizeAppData({ bookings: [booking()], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], staffFloatSettlements: [settle({ id: "legacy", amount: 60 })], settings: commissionSettings });
    expect(legacyInScope.staffFloatSettlements?.[0].status).toBe("CONFIRMED");
    const rendered = staffFloatStatements(legacyInScope).find((entry) => entry.float.id === floatId);
    expect(rendered?.settlements[0]).toMatchObject({ id: "legacy", amount: 60, status: "CONFIRMED" });
  });

  it("تربط النماذج والمخزن والواجهات دورة طلب التوريد والتأكيد والرفض والعمولات", () => {
    const model = readFileSync("lib/booking-model.ts", "utf8");
    const store = readFileSync("lib/booking-store.tsx", "utf8");
    const backup = readFileSync("lib/backup-import.ts", "utf8");
    const screen = readFileSync("app/float-settlements.tsx", "utf8");
    const audit = readFileSync("app/audit-log.tsx", "utf8");
    expect(model).toContain("FloatSettlementStatus");
    expect(model).toContain('"PENDING_APPROVAL"');
    expect(model).toContain("staffCommissionForBooking");
    expect(model).toContain("bookingEarnedCommission");
    expect(model).toContain("staffFloatCommissionEarned");
    expect(model).toContain("isCommissionEnabled");
    expect(model).toContain("commissionType === \"PERCENTAGE_OF_TOTAL\"");
    expect(model).toContain("earnedCommission");
    expect(model).toContain('"float-settlement-requested"');
    expect(model).toContain('"float-settlement-approved"');
    expect(model).toContain('"float-settlement-rejected"');
    expect(store).toContain("requestStaffFloatSettlement");
    expect(store).toContain("approveStaffFloatSettlement");
    expect(store).toContain("rejectStaffFloatSettlement");
    expect(store).toContain("float-settlement-amount-invalid");
    expect(store).toContain("float-request-forbidden");
    expect(store).toContain("float-settlement-not-pending");
    expect(store).toContain("status: \"PENDING_APPROVAL\" as FloatSettlementStatus");
    expect(store).toContain("commissionOffset");
    expect(store).toContain("لا يوجد رصيد متبقٍ للتأكيد");
    expect(backup).toContain('z.enum(["PENDING_APPROVAL", "CONFIRMED", "REJECTED"])');
    expect(backup).toContain("earnedCommission");
    expect(backup).toContain("commissionOffset");
    expect(backup).toContain("requestedByUserId");
    expect(backup).toContain("rejectReason");
    expect(backup).toContain('"float-settlement-requested"');
    expect(screen).toContain("طلبات توريد عهدة معلقة");
    expect(screen).toContain("طلب توريد العهدة للمالك");
    expect(screen).toContain("عمولات مستحقة للموظف (Commissions Earned)");
    expect(screen).toContain("معاينة الحركات المشمولة في شاشة مستقلة ↗");
    expect(screen).toContain("المتبقي كعهدة معلقة بذمة الموظف");
    expect(screen).toContain("requestStaffFloatSettlement");
    expect(screen).toContain("approveStaffFloatSettlement");
    expect(screen).toContain("rejectStaffFloatSettlement");
    expect(audit).toContain('"float-settlement-requested"');
    expect(audit).toContain('"float-settlement-approved"');
    expect(audit).toContain('"float-settlement-rejected"');
  });
});