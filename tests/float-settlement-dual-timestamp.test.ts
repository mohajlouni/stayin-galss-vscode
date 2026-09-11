import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, type Booking, type Expense, normalizeAppData, type Settings } from "../lib/booking-model";
import { settlementArchiveEntries, staffFloatLedgerForFloat, staffFloatLedgerForUser } from "../lib/reporting";

const myFloatId = "staff-1";
const siblingFloatId = "staff-2";
const ownerAccountId = "treasury-vault";
const floatSettings: Settings = { businessName: "منشأة", businessPhone: "", currency: "د.أ", bookingTypes: DEFAULT_SETTINGS.bookingTypes, paymentMethods: [], paymentRouting: { ownerAccounts: [{ id: ownerAccountId, kind: "vault", label: "صندوق كاش الخزينة المركزية", detail: "الصندوق", isActive: true, isDefault: true }], staffFloats: [{ id: myFloatId, memberUserId: 7, memberName: "صدام", label: "نقطة صدام", isActive: true }, { id: siblingFloatId, memberUserId: 99, memberName: "أحمد", label: "نقطة أحمد", isActive: true }] } };

const myExpense: Expense = { id: "e-float", chaletId: "c-1", chaletName: "النوح", amount: 20, date: "2026-08-22", category: "fuel-gas", note: "محروقات", fundingEntity: "staff", fundingSourceId: myFloatId, isFloatExpense: true, isSettled: true, settlementId: "s1", createdAt: "2026-08-26T12:00:00.000Z" };

const myBooking: Booking = {
  id: "booking-my",
  customerName: "خالد",
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
  payments: [{ id: "p1", amount: 110, date: "2026-08-26", recordedAt: "2026-08-26T09:00:00.000Z", paymentMethod: "cash-owner", recipientTargetId: `float-${myFloatId}`, settlementId: "s1" }],
  depositCollection: { id: "d1", amount: 15, date: "2026-08-26", recordedAt: "2026-08-26T10:00:00.000Z", paymentMethod: "cash-owner", recipientTargetId: `float-${myFloatId}`, settlementId: "s1" },
  notes: "",
  status: "confirmed",
  bookingReference: "#DUAL001",
  createdAt: "2026-08-26T08:00:00.000Z",
};

const mySettlement = { id: "s1", floatId: myFloatId, amount: 105, settledAt: "2026-08-28T10:30:00.000Z", createdAt: "2026-08-28T10:30:00.000Z", settlementDate: "2026-08-28", recipientAccountId: ownerAccountId, recipientAccountLabel: "صندوق كاش الخزينة المركزية", channel: "vault" as const, coveredPaymentIds: ["p1", "d1"], coveredExpenseIds: ["e-float"] };
const siblingSettlement = { id: "s2", floatId: siblingFloatId, amount: 40, settledAt: "2026-08-27T09:00:00.000Z", createdAt: "2026-08-27T09:05:00.000Z", settlementDate: "2026-08-27", recipientAccountId: ownerAccountId, recipientAccountLabel: "حساب المالك (CliQ)", channel: "cliq" as const };

describe("CRITICAL MASTER OVERHAUL: الطابع الزمني المزدوج وأرشيف التسويات العامة", () => {
  it("يُثبِّت سجل التسوية طابعًا زمنيًا حقيقيًا (createdAt) بجانب تاريخ التسوية (settlementDate) ويحافظ عليه التطبيع", () => {
    const data = normalizeAppData({ bookings: [myBooking], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], expenses: [myExpense], staffFloatSettlements: [mySettlement], settings: floatSettings });
    expect(data.staffFloatSettlements?.[0]).toMatchObject({ settlementDate: "2026-08-28", createdAt: "2026-08-28T10:30:00.000Z", settledAt: "2026-08-28T10:30:00.000Z" });
  });

  it("يسجّل المخزن createdAt لحظة التنفيذ في التوريد المباشر والطلب المعلق ويعيد صياغة رسالة التدقيق بالصيغة المزدوجة", () => {
    const store = readFileSync("lib/booking-store.tsx", "utf8");
    const model = readFileSync("lib/booking-model.ts", "utf8");
    const backup = readFileSync("lib/backup-import.ts", "utf8");
    expect(store).toContain("createdAt: settledAt");
    expect(store).toContain("createdAt: requestedAt");
    expect(store).toContain("قام المالك بتسجيل توريد عهدة بقيمة");
    expect(store).toContain("من الموظف");
    expect(store).toContain("بتاريخ تسوية ${settlementDate} في ${settledAt}");
    expect(model).toContain("createdAt?: string");
    expect(backup).toContain("createdAt: z.string().datetime().optional()");
  });

  it("يبني أرشيف التسويات العامة بالحجوزات المغلقة والمصروفات المشمولة ومرتبًا تنازليًا مع أسماء الموظفين", () => {
    const data = normalizeAppData({ bookings: [myBooking], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], expenses: [myExpense], staffFloatSettlements: [mySettlement, siblingSettlement], settings: floatSettings });
    const archive = settlementArchiveEntries(data);
    expect(archive.map((entry) => entry.settlement.id)).toEqual(["s1", "s2"]);
    const first = archive[0];
    expect(first.memberName).toBe("صدام");
    expect(first.floatLabel).toBe("نقطة صدام");
    expect(first.bookings).toHaveLength(2);
    expect(first.bookings[0]).toMatchObject({ bookingId: "booking-my", customerName: "خالد", amount: 110 });
    expect(first.bookings[1]).toMatchObject({ bookingId: "booking-my", customerName: "خالد", amount: 15 });
    expect(first.expenses).toHaveLength(1);
    expect(first.expenses[0]).toMatchObject({ expenseId: "e-float", note: "محروقات", amount: 20 });
    expect(archive[1].settlement.channel).toBe("cliq");
  });

  it("يعطي كشف الحساب المعرّف بالعهدة النتيجة ذاتها لصاحبها عبر كشف المستخدم الإسنادي", () => {
    const data = normalizeAppData({ bookings: [myBooking], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], expenses: [myExpense], staffFloatSettlements: [mySettlement], settings: floatSettings });
    const byFloat = staffFloatLedgerForFloat(data, myFloatId);
    const byUser = staffFloatLedgerForUser(data, 7);
    expect(byFloat.float?.id).toBe(myFloatId);
    expect(byFloat.entries.map((entry) => entry.amount)).toEqual([110, 15, -20, -105]);
    expect(byUser.entries.map((entry) => entry.runningBalance)).toEqual(byFloat.entries.map((entry) => entry.runningBalance));
    expect(byUser.float?.id).toBe(byFloat.float?.id);
    expect(staffFloatLedgerForFloat(data, "staff-missing").entries).toEqual([]);
  });
});