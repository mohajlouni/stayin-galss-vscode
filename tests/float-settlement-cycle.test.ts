import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseBackupData, serializeBackup } from "../lib/backup-import";
import { DEFAULT_SETTINGS, type Booking, type Expense, normalizeAppData, staffFloatOutstanding, staffFloatReimbursementPaidTotal, staffFloatReimbursementTotal, type Settings } from "../lib/booking-model";
import { staffFloatStatements } from "../lib/reporting";

const floatId = "staff-1";
const ownerAccountId = "treasury-vault";
const floatSettings: Settings = { businessName: "منشأة", businessPhone: "", currency: "د.أ", bookingTypes: DEFAULT_SETTINGS.bookingTypes, paymentMethods: [], paymentRouting: { ownerAccounts: [{ id: ownerAccountId, kind: "vault", label: "صندوق كاش الخزينة المركزية", detail: "الصندوق", isActive: true, isDefault: true }], staffFloats: [{ id: floatId, memberUserId: 7, memberName: "صدام", label: "نقطة صدام", isActive: true }] } };

const floatExpense: Expense = { id: "e-float", chaletId: "c-1", chaletName: "النوح", amount: 20, date: "2026-08-22", category: "fuel-gas", note: "محروقات", fundingEntity: "staff", fundingSourceId: floatId, isFloatExpense: true, isSettled: true, settlementId: "float-settlement-1", createdAt: "2026-08-22T12:00:00.000Z" };
const pocketExpense: Expense = { id: "e-pocket", chaletId: "c-1", chaletName: "النوح", amount: 12, date: "2026-08-22", category: "maintenance", note: "إصلاح من جيب الموظف", fundingEntity: "staff", fundingSourceId: floatId, isStaffReimbursement: true, reimbursementSettled: true, reimbursementSettledById: "e-compensation", createdAt: "2026-08-22T12:00:00.000Z" };
const compensationExpense: Expense = { id: "e-compensation", amount: 12, date: "2026-08-23", category: "other", note: "تصفية ذمة موظف", paymentMethod: "iban", fundingEntity: "owner", fundingChannel: "iban", fundingSourceId: ownerAccountId, fundingSourceLabel: "صندوق كاش الخزينة المركزية", isStaffReimbursementSettled: true, clearsReimbursementForFloatId: floatId, reimbursementChannel: "bank", createdAt: "2026-08-23T10:00:00.000Z", createdByName: "المالك" };

const bookingWithSettledReceipt: Booking = {
  id: "booking-settle-test",
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
  payments: [{ id: "p1", amount: 110, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1", settlementId: "float-settlement-1" }],
  depositCollection: { id: "d1", amount: 15, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1", settlementId: "float-settlement-1" },
  notes: "",
  status: "confirmed",
  bookingReference: "#002618205",
  createdAt: "2026-08-26T10:00:00.000Z",
};

describe("دورة تسوية العهدة وبيع الاتجاه الثاني (ذمم الموظفين)", () => {
  it("تبقى الذمم المسوّاة خارج المطالبة ويُحتسب قيد التعويض ضمن المدفوع للموظف", () => {
    expect(staffFloatReimbursementTotal({ expenses: [pocketExpense, compensationExpense] }, floatId)).toBe(0);
    expect(staffFloatReimbursementTotal({ expenses: [{ ...pocketExpense, reimbursementSettled: undefined }, compensationExpense] }, floatId)).toBe(12);
    expect(staffFloatReimbursementPaidTotal({ expenses: [pocketExpense, compensationExpense] }, floatId)).toBe(12);
  });

  it("يعكس دفعة البيع سجل التسوية والمصروفات المسوّاة في تصفير الرصيد المعلق", () => {
    const data = normalizeAppData({ bookings: [bookingWithSettledReceipt], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], expenses: [floatExpense, pocketExpense, compensationExpense], staffFloatSettlements: [{ id: "float-settlement-1", floatId, amount: 105, settledAt: "2026-08-28T10:00:00.000Z", settlementDate: "2026-08-28", recipientAccountId: ownerAccountId, recipientAccountLabel: "صندوق كاش الخزينة المركزية", channel: "vault", coveredPaymentIds: ["p1", "d1"], coveredExpenseIds: ["e-float"] }], settings: floatSettings });
    expect(data.bookings[0].payments[0].settlementId).toBe("float-settlement-1");
    expect(data.bookings[0].depositCollection?.settlementId).toBe("float-settlement-1");
    expect((data.expenses ?? []).find((expense) => expense.id === "e-float")).toMatchObject({ isSettled: true, settlementId: "float-settlement-1" });
    expect(data.staffFloatSettlements?.[0]).toMatchObject({ settlementDate: "2026-08-28", recipientAccountLabel: "صندوق كاش الخزينة المركزية", channel: "vault" });
    expect(staffFloatOutstanding(data, floatId)).toBe(0);
  });

  it("يحافظ النسخ الاحتياطي على سجلات التسوية ووصلات الاعتمادات الجديدة", () => {
    const normalized = normalizeAppData({ bookings: [bookingWithSettledReceipt], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], expenses: [floatExpense, pocketExpense, compensationExpense], staffFloatSettlements: [{ id: "float-settlement-1", floatId, amount: 105, settledAt: "2026-08-28T10:00:00.000Z", settlementDate: "2026-08-28", recipientAccountId: ownerAccountId, recipientAccountLabel: "صندوق كاش الخزينة المركزية", channel: "cliq", coveredPaymentIds: ["p1", "d1"], coveredExpenseIds: ["e-float"] }], settings: floatSettings });
    const restored = parseBackupData(serializeBackup(normalized));
    expect(restored.bookings[0].payments[0].settlementId).toBe("float-settlement-1");
    expect(restored.staffFloatSettlements?.[0]).toMatchObject({ settlementDate: "2026-08-28", recipientAccountLabel: "صندوق كاش الخزينة المركزية", channel: "cliq" });
    const compensation = (restored.expenses ?? []).find((expense) => expense.id === "e-compensation");
    expect(compensation).toMatchObject({ paymentMethod: "iban", fundingChannel: "iban", isStaffReimbursementSettled: true, clearsReimbursementForFloatId: floatId, reimbursementChannel: "bank" });
    expect((restored.expenses ?? []).find((expense) => expense.id === "e-float")).toMatchObject({ isSettled: true, settlementId: "float-settlement-1" });
  });

  it("يعكس كشف العهدة التعويضات المصروفة وحقول حساب الاستلام في سجل التسويات", () => {
    const statements = staffFloatStatements({ bookings: [bookingWithSettledReceipt], expenses: [floatExpense, pocketExpense, compensationExpense], staffFloatSettlements: [{ id: "float-settlement-1", floatId, amount: 105, settledAt: "2026-08-28T10:00:00.000Z", settlementDate: "2026-08-28", recipientAccountLabel: "صندوق كاش الخزينة المركزية", channel: "vault" }], settings: floatSettings });
    const statement = statements.find((entry) => entry.float.id === floatId);
    expect(statement).toBeDefined();
    expect(statement).toMatchObject({ collectedTotal: 125, paidOutTotal: 20, settledTotal: 105, outstanding: 0, reimbursementDue: 0, reimbursementPaid: 12 });
    expect(statement?.settlements[0]).toMatchObject({ recipientAccountLabel: "صندوق كاش الخزينة المركزية", channel: "vault", settlementDate: "2026-08-28" });
  });

  it("تربط الواجهات والمخزن والنماذج سجلات التسوية وقيد تعويض الموظف", () => {
    const model = readFileSync("lib/booking-model.ts", "utf8");
    const store = readFileSync("lib/booking-store.tsx", "utf8");
    const backup = readFileSync("lib/backup-import.ts", "utf8");
    const screen = readFileSync("app/float-settlements.tsx", "utf8");
    const expenses = readFileSync("app/expenses.tsx", "utf8");
    const audit = readFileSync("app/audit-log.tsx", "utf8");
    expect(model).toContain("FloatSettlementRecord");
    expect(model).toContain("FloatSettlementChannel");
    expect(model).toContain("coveredPaymentIds");
    expect(model).toContain("isStaffReimbursementSettled");
    expect(model).toContain("staffFloatReimbursementPaidTotal");
    expect(model).toContain('"staff-reimbursement-paid"');
    expect(store).toContain("settleStaffReimbursement");
    expect(store).toContain("float-no-reimbursement-due");
    expect(store).toContain('action: "staff-reimbursement-paid" as AuditAction');
    expect(store).toContain("isSettled: true, settlementId");
    expect(store).toContain("settlementDate");
    expect(backup).toContain("coveredPaymentIds");
    expect(backup).toContain("clearsReimbursementForFloatId");
    expect(backup).toContain('"staff-reimbursement-paid"');
    expect(screen).toContain("settleStaffReimbursement");
    expect(screen).toContain("أرشيف وسجل التسويات العامة 🗄️");
    expect(screen).toContain("/settlements-history");
    expect(screen).toContain("صرف تعويض للموظف / تصفية الذمة");
    expect(screen).toContain("إجمالي المحصل");
    expect(screen).toContain("المخصوم كفواتير مصاريف");
    expect(screen).toContain("صافي المبلغ المطلوب توريده");
    expect(screen).toContain("تاريخ التسوية");
    expect(screen).toContain("تاريخ الصرف");
    expect(expenses).toContain("أخرى / تصفية ذمة موظف");
    expect(expenses).toContain("تصفية ذمة موظف");
    expect(audit).toContain('"staff-reimbursement-paid"');
  });
});