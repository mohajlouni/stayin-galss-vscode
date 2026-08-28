import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { type Booking } from "../lib/booking-model";
import { summarizeFinancialReport } from "../lib/reporting";

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: "booking-payment-methods",
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
  payments: [{ id: "initial", amount: 40, date: "2026-08-26", paymentMethod: "cash-owner", note: "الدفعة الأولى من الإيجار" }],
  notes: "",
  status: "confirmed",
  createdAt: "2026-08-26T10:00:00.000Z",
  ...overrides,
});

describe("طرق دفع الحجز والتأمين", () => {
  it("يفصل تحصيل الإيجار عن طريقة استلام التأمين في الحسابات", () => {
    const summary = summarizeFinancialReport([booking()], [], []);
    expect(summary.paymentMethods["cash-owner"]).toBe(40);
    expect(summary.depositCollectionMethods["cash-guardian"]).toBe(70);
    expect(summary.depositCollectionMethods["cash-owner"]).toBe(0);
  });

  it("يوجه إضافة الوحدة لإدارة الوحدات ويتحقق من اختيار طريقتي الدفع", () => {
    const source = readFileSync("app/booking-form.tsx", "utf8");
    expect(source).toContain('router.push("/chalet-management" as never)');
    expect(source).toContain("لا يمكن حفظ الحجز قبل اختيار طريقة دفع الدفعة الأولى");
    expect(source).toContain("لا يمكن حفظ الحجز قبل اختيار طريقة استلام التأمين");
    expect(source).toContain("طريقة دفع الدفعة الأولى");
    expect(source).toContain("طريقة استلام التأمين");
  });
});
