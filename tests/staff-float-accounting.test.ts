import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, type Booking, normalizeAppData, staffFloatAccounts, staffFloatCollectedTotal, staffFloatPaidOutTotal, staffFloatSettledTotal, staffFloatOutstanding, type Settings } from "../lib/booking-model";
import { summarizeFinancialReport } from "../lib/reporting";

const floatAccount = { id: "staff-1", memberUserId: 7, memberName: "عصام", label: "نقطة الحارس", cliqAlias: "0791234567", maxFloatLimit: 500, isActive: true };
const floatSettings: Settings = { businessName: "منشأة", businessPhone: "", currency: "د.أ", bookingTypes: DEFAULT_SETTINGS.bookingTypes, paymentMethods: [], paymentRouting: { staffFloats: [floatAccount] } };

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
  payments: [{ id: "initial", amount: 40, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" }],
  notes: "",
  status: "confirmed",
  createdAt: "2026-08-26T10:00:00.000Z",
  ...overrides,
});

describe("العُهد النقدية ومحاسبة التأمين", () => {
  it("تفرز المستلم عبر العهدة (إيجار وتأمين) عن الحساب المباشر للمالك", () => {
    const collected = booking({ payments: [{ id: "p1", amount: 40, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" }], depositCollection: { id: "d1", amount: 70, date: "2026-08-26", paymentMethod: "cash-guardian", recipientTargetId: "float-staff-1" } });
    expect(staffFloatCollectedTotal({ bookings: [collected] }, "staff-1")).toBe(110);
    expect(staffFloatAccounts(floatSettings).map((account) => account.label)).toContain("نقطة الحارس");
    expect(staffFloatCollectedTotal({ bookings: [{ ...collected, payments: [{ id: "p2", amount: 30, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "owner" }], depositCollection: { ...collected.depositCollection!, recipientTargetId: "owner" } }] }, "staff-1")).toBe(0);
  });

  it("تحسب الرصيد المعلق للعهدة = المستلم - (إرجاع التأمين + خصم الأضرار) - المورَّد للمالك", () => {
    const withRefundAndComp = booking({
      depositCollection: { id: "d1", amount: 70, date: "2026-08-26", paymentMethod: "cash-guardian", recipientTargetId: "float-staff-1" },
      depositRefunds: [{ id: "r1", amount: 10, date: "2026-08-26", paymentMethod: "cash-owner", sourceFloatId: "staff-1", recordedAt: "2026-08-27T10:00:00.000Z" }],
      depositCompensation: { amount: 15, date: "2026-08-26", sourceFloatId: "staff-1", recordedAt: "2026-08-27T10:00:00.000Z" },
    });
    const data = { bookings: [withRefundAndComp], staffFloatSettlements: [{ id: "s1", floatId: "staff-1", amount: 50, settledAt: "2026-08-28T10:00:00.000Z", settledByName: "المالك" }] };
    expect(staffFloatPaidOutTotal(data, "staff-1")).toBe(25);
    expect(staffFloatSettledTotal(data, "staff-1")).toBe(50);
    expect(staffFloatOutstanding(data, "staff-1")).toBe(110 - 25 - 50);
  });

  it("تمرر ملخص التقرير المالي: كشف العهدة، إيراد التعويضات، والتحصيل المباشر للمالك", () => {
    const floatBooked = booking({ payments: [{ id: "p1", amount: 40, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" }], depositCollection: { id: "d1", amount: 70, date: "2026-08-26", paymentMethod: "cash-guardian", recipientTargetId: "float-staff-1" }, depositCompensation: { amount: 15, date: "2026-08-26", sourceFloatId: "staff-1", recordedAt: "2026-08-27T10:00:00.000Z" } });
    const ownerBooked = booking({ id: "booking-owner-direct", payments: [{ id: "p2", amount: 30, date: "2026-08-26", paymentMethod: "click", recipientTargetId: "owner" }], depositCollection: { id: "d2", amount: 20, date: "2026-08-26", paymentMethod: "click", recipientTargetId: "owner" } });
    const summary = summarizeFinancialReport([floatBooked, ownerBooked], [], [], { settlements: [{ id: "s1", floatId: "staff-1", amount: 50, settledAt: "2026-08-28T10:00:00.000Z" }], settings: floatSettings });
    expect(summary.ownerDirectReceived).toBe(50);
    expect(summary.compensationRevenue).toBe(15);
    expect(summary.staffFloatCollected).toBe(110);
    expect(summary.staffFloatStatements[0]).toMatchObject({ collectedTotal: 110, paidOutTotal: 15, settledTotal: 50, outstanding: 45 });
    expect(summary.depositCompensations[0]).toMatchObject({ amount: 15, sourceFloatId: "staff-1", customerName: "أحمد" });
  });

  it("تحافظ التطبيع على عُهد الإعدادات والتسويات ووجهة الاستلام في النسخ الاحتياطي", () => {
    const data = normalizeAppData({
      bookings: [booking({ payments: [{ id: "p1", amount: 40, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" }] })],
      waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], staffFloatSettlements: [{ id: "s1", floatId: "staff-1", amount: 50, settledAt: "2026-08-28T10:00:00.000Z" }],
      settings: floatSettings,
    });
    expect(data.settings.paymentRouting?.staffFloats?.[0]).toMatchObject({ id: "staff-1", label: "نقطة الحارس", memberUserId: 7, maxFloatLimit: 500, isActive: true });
    expect(data.bookings[0].payments[0].recipientTargetId).toBe("float-staff-1");
    expect(data.staffFloatSettlements?.[0].floatId).toBe("staff-1");
  });

  it("تربط الواجهات والمخزن تسوية العهد والخصم النسي والبدجات المعتمدة", () => {
    const model = readFileSync("lib/booking-model.ts", "utf8");
    const store = readFileSync("lib/booking-store.tsx", "utf8");
    const backup = readFileSync("lib/backup-import.ts", "utf8");
    const management = readFileSync("app/payment-methods.tsx", "utf8");
    const form = readFileSync("app/booking-form.tsx", "utf8");
    const checkout = readFileSync("components/check-out-confirmation-sheet.tsx", "utf8");
    const settlements = readFileSync("app/float-settlements.tsx", "utf8");
    const reports = readFileSync("app/(tabs)/reports.tsx", "utf8");
    const more = readFileSync("app/(tabs)/more.tsx", "utf8");
    expect(model).toContain("recipientTargetId");
    expect(model).toContain("StaffFloatAccount");
    expect(model).toContain("staffFloatOutstanding");
    expect(model).toContain('"float-settled"');
    expect(model).toContain('"deposit-compensation-recorded"');
    expect(model).toContain('"staff-float-account-saved"');
    expect(store).toContain("settleStaffFloat");
    expect(store).toContain("recordDepositCompensation");
    expect(store).toContain("float-account-not-found");
    expect(store).toContain("float-nothing-to-settle");
    expect(store).toContain('action: "deposit-compensation-recorded" as AuditAction');
    expect(store).toContain("تسوية وتوريد عهدة");
    expect(backup).toContain("staffFloats");
    expect(backup).toContain("staffFloatSettlements");
    expect(backup).toContain('.regex(/^(?:owner|member-\\d+|float-[a-zA-Z0-9-]{1,64})$/)');
    expect(management).toContain("تستقر الدفعات مباشرة في إيرادات الخزينة العامة للمنشأة");
    expect(management).toContain("المبالغ المستلمة هنا تُسجل كذمة مالية/عهدة معلقة على الموظف لحين التوريد والتسوية مع المالك");
    expect(management).toContain("إضافة نقطة تحصيل موظف");
    expect(management).toContain("الموظف المرتبط");
    expect(management).toContain("الحد الأقصى المسموح للعهدة");
    expect(management).toContain("accessibilityLabel=\"direct-cliq-toggle\"");
    expect(management).toContain("accessibilityLabel=\"direct-bank-toggle\"");
    expect(management).toContain("accessibilityLabel=\"direct-cash-toggle\"");
    expect(form).toContain("recipientTargetId");
    expect(form).toContain("activeStaffFloatAccounts");
    expect(form).toContain("float-${account.id}");
    expect(checkout).toContain("خصم أضرار / غرامات من التأمين");
    expect(checkout).toContain("إيرادات تعويضات");
    expect(checkout).toContain("depositCompensation");
    expect(settlements).toContain("تسوية العُهد النقدية");
    expect(settlements).toContain("تسوية وتوريد العهدة للمالك");
    expect(settlements).toContain("settleStaffFloat");
    expect(reports).toContain("كشف عُهد الفريق");
    expect(reports).toContain("إيراد تعويضات");
    expect(more).toContain('route: "/float-settlements"');
    expect(more).toContain("account-balance-wallet");
  });
});