import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, EXPENSE_CATEGORIES, type Booking, normalizeAppData, staffFloatCommissionBreakdown, staffFloatCommissionEarned, type Settings } from "../lib/booking-model";

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

describe("شركة الحجوزات: تراكم عمولات الموظف والمقاصة والتسوية", () => {
  it("تحتسب عمولة ملف الموظف على الحجوزات المسجّلة حتى لو كان الحجز «مؤكدًا» بلا عُهدة قديمة مفعّلة", () => {
    const accrued: Booking = booking({ payments: [{ id: "p1", amount: 100, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: `float-${memberFloatId}`, calculatedCommission: 2.5, commissionType: "percent" }], checkedInAt: "2026-08-26T18:00:00.000Z" });
    expect(staffFloatCommissionEarned({ bookings: [accrued], settings: memberSettings }, memberFloatId)).toBe(2.5);
    expect(staffFloatCommissionBreakdown({ bookings: [accrued], settings: memberSettings }, memberFloatId)).toEqual([{ bookingId: "booking-commission-test", reference: "booking-commission-test", customerName: "هبة", amount: 2.5 }]);
  });

  it("تقتصر عمولة ملف الموظف على الحجوزات المفعّلة (تم التسجيل أو اكتمل) وتتجاوز عمولة النقطة القديمة عند الحساب", () => {
    const accruedMember = booking({ id: "b1", payments: [{ id: "p1", amount: 100, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: `float-${memberFloatId}`, calculatedCommission: 2.5, commissionType: "percent" }], checkedInAt: "2026-08-26T18:00:00.000Z" });
    const notAccruedMember = booking({ id: "b2", customerName: "أسيل", payments: [{ id: "p2", amount: 100, date: "2026-08-27", paymentMethod: "cash-owner", recipientTargetId: `float-${memberFloatId}`, calculatedCommission: 2.5, commissionType: "percent" }] });
    const accruedOverridesLegacy: Booking = booking({ id: "b3", payments: [{ id: "p3", amount: 100, date: "2026-08-27", paymentMethod: "cash-owner", recipientTargetId: "float-staff-3", calculatedCommission: 2.5, commissionType: "percent" }], checkedInAt: "2026-08-27T18:00:00.000Z" });
    expect(staffFloatCommissionEarned({ bookings: [accruedMember, notAccruedMember], settings: memberSettings }, memberFloatId)).toBe(2.5);
    expect(staffFloatCommissionBreakdown({ bookings: [accruedMember, notAccruedMember], settings: memberSettings }, memberFloatId)).toEqual([{ bookingId: "b1", reference: "b1", customerName: "هبة", amount: 2.5 }]);
    expect(staffFloatCommissionEarned({ bookings: [accruedOverridesLegacy], settings: memberSettings }, "staff-3")).toBe(2.5);
  });

  it("تعود إلى عمولة النقطة القديمة (ثابت/نسبة) عندما لا يوجد حساب عمولة في ملف الموظف", () => {
    const first: Booking = booking({ id: "b1", payments: [{ id: "p1", amount: 40, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-3" }] });
    expect(staffFloatCommissionEarned({ bookings: [first], settings: memberSettings }, "staff-3")).toBe(10);
    expect(staffFloatCommissionEarned({ bookings: [first], settings: memberSettings }, memberFloatId)).toBe(0);
    const data = normalizeAppData({ bookings: [first], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], settings: memberSettings });
    expect(staffFloatCommissionEarned(data, "staff-3")).toBe(10);
  });

  it("تحافظ على قيمة المكافأة (موجبة أو سالبة) في التطبيع وتضيف التصنيف الجديد إلى المصروفات", () => {
    expect(EXPENSE_CATEGORIES).toContain("commissions-bonuses");
    const data = normalizeAppData({
      bookings: [], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [],
      staffFloatSettlements: [{ id: "s9", floatId: memberFloatId, amount: 40, settledAt: "2026-08-28T10:00:00.000Z", status: "CONFIRMED", staffBonus: 3.5 }, { id: "s8", floatId: memberFloatId, amount: 40, settledAt: "2026-08-28T10:00:00.000Z", status: "CONFIRMED", staffBonus: -2 }],
      settings: memberSettings,
    });
    expect(data.staffFloatSettlements?.[0].staffBonus).toBe(3.5);
    expect(data.staffFloatSettlements?.find((entry) => entry.id === "s8")?.staffBonus).toBe(-2);
    const text = normalizeAppData({ bookings: [], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], staffFloatSettlements: [{ id: "s-bad", floatId: memberFloatId, amount: 40, settledAt: "2026-08-28T10:00:00.000Z", status: "CONFIRMED", staffBonus: "abc" as unknown as number }], settings: memberSettings });
    expect(text.staffFloatSettlements?.[0].staffBonus).toBeUndefined();
  });

  it("يربط المخزن والواجهات قيد التصنيف الجديد والمكافأة والمقاصة في التسوية", () => {
    const model = readFileSync("lib/booking-model.ts", "utf8");
    const store = readFileSync("lib/booking-store.tsx", "utf8");
    const backup = readFileSync("lib/backup-import.ts", "utf8");
    const screen = readFileSync("app/float-settlements.tsx", "utf8");
    const settleModal = readFileSync("components/settlements/SettlementModal.tsx", "utf8");
    const expenses = readFileSync("app/expenses.tsx", "utf8");
    const userMgmt = readFileSync("app/user-management.tsx", "utf8");
    expect(model).toContain("staffFloatCommissionBreakdown");
    expect(model).toContain("staffBonus");
    expect(model).toContain('"commissions-bonuses"');
    expect(store).toContain("commissions-bonuses");
    expect(store).toContain("مدفوعة مقاصة من الكاش");
    expect(store).toContain("expense-commission-");
    expect(store).toContain("staffBonus");
    expect(backup).toContain("commissions-bonuses");
    expect(backup).toContain("staffBonus");
    expect(screen).toContain("settleBonus");
    expect(screen).toContain("handleBonusChange");
    expect(screen).toContain("onBonusChange");
    expect(settleModal).toContain("مكافأة إضافية أو خصم عهدة (اختياري)");
    expect(settleModal).toContain("العمولات والحوافز المستحقة للموظف");
    expect(settleModal).toContain("netDue");
    expect(expenses).toContain("عمولات ومكافآت موظفين");
    expect(userMgmt).toContain("نظام العمولات والحوافز (اختياري)");
    expect(userMgmt).toContain("مبلغ ثابت لكل حجز");
    expect(userMgmt).toContain("نسبة من قيمة التحصيل");
    expect(userMgmt).toContain("تُحسب فقط على الدفعات التي يُسند تحصيلها لهذا الموظف.");
  });
});