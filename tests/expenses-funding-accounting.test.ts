import { describe, expect, it } from "vitest";

import { parseBackupData, serializeBackup } from "../lib/backup-import";
import { DEFAULT_SETTINGS, type Booking, type Expense, normalizeAppData, staffFloatPaidOutTotal, staffFloatReimbursementTotal, type Settings } from "../lib/booking-model";
import { summarizeFinancialReport } from "../lib/reporting";

const floatId = "staff-1";
const floatSettings: Settings = { businessName: "منشأة", businessPhone: "", currency: "د.أ", bookingTypes: DEFAULT_SETTINGS.bookingTypes, paymentMethods: [], paymentRouting: { staffFloats: [{ id: floatId, memberUserId: 7, memberName: "عصام", label: "نقطة الحارس", isActive: true }] } };

const floatExpense: Expense = { id: "e-float", chaletId: "c-1", chaletName: "النوح", amount: 20, date: "2026-08-22", category: "fuel-gas", note: "غاز للشاليه", fundingEntity: "staff", fundingSourceId: floatId, fundingSourceLabel: "نقطة الحارس", isFloatExpense: true, createdAt: "2026-08-22T12:00:00.000Z" };
const pocketExpense: Expense = { id: "e-pocket", chaletId: "c-1", chaletName: "النوح", amount: 12, date: "2026-08-22", category: "maintenance", note: "إصلاح عاجل من جيب الموظف", fundingEntity: "staff", fundingSourceId: floatId, fundingSourceLabel: "نقطة الحارس", isStaffReimbursement: true, maintenanceTaskId: "mt-9", createdAt: "2026-08-22T12:00:00.000Z" };
const ownerCliqExpense: Expense = { id: "e-owner", chaletId: "c-1", chaletName: "النوح", amount: 9, date: "2026-08-22", category: "hospitality", note: "ضيافة", fundingEntity: "owner", fundingChannel: "cliq", fundingSourceId: "treasury-1", fundingSourceLabel: "حساب المالك CliQ", createdAt: "2026-08-22T12:00:00.000Z" };

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: "booking-funding-test",
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
  payments: [{ id: "p1", amount: 110, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: "float-staff-1" }],
  notes: "",
  status: "confirmed",
  createdAt: "2026-08-26T10:00:00.000Z",
  ...overrides,
});

describe("multi-source expense funding engine", () => {
  it("يحفظ التطبيع حقول التمويل والتصنيفات الجديدة للمصروف", () => {
    const data = normalizeAppData({ bookings: [], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], expenses: [floatExpense, pocketExpense, ownerCliqExpense], settings: floatSettings });
    const expenses = data.expenses ?? [];
    expect(expenses).toHaveLength(3);
    expect(expenses[0]).toMatchObject({ category: "fuel-gas", fundingEntity: "staff", fundingSourceId: floatId, fundingSourceLabel: "نقطة الحارس", isFloatExpense: true });
    expect(expenses[1]).toMatchObject({ category: "maintenance", fundingEntity: "staff", fundingSourceId: floatId, isStaffReimbursement: true });
    expect(expenses[2]).toMatchObject({ category: "hospitality", fundingEntity: "owner", fundingChannel: "cliq", fundingSourceId: "treasury-1", fundingSourceLabel: "حساب المالك CliQ" });
  });

  it("يدرج المصروف المخصوم من العهدة ضمن «المرجوع/الخصم» دون إحصاء المدفوع من الجيب أو حساب المالك", () => {
    expect(staffFloatPaidOutTotal({ bookings: [] }, floatId)).toBe(0);
    expect(staffFloatPaidOutTotal({ bookings: [], expenses: [floatExpense, pocketExpense, ownerCliqExpense] }, floatId)).toBe(20);
  });

  it("يحسب ذمة المالك للموظف عن المصروفات المدفوعة من الجيب", () => {
    expect(staffFloatReimbursementTotal({ expenses: [floatExpense, pocketExpense, ownerCliqExpense] }, floatId)).toBe(12);
    expect(staffFloatReimbursementTotal({ expenses: [floatExpense, ownerCliqExpense] }, floatId)).toBe(0);
  });

  it("يعكس كشف العهدة وملخص التقرير مصروفات العهدة وذمم الموظفين", () => {
    const summary = summarizeFinancialReport([booking()], [], [floatExpense, pocketExpense, ownerCliqExpense], { settings: floatSettings });
    const statement = summary.staffFloatStatements[0];
    expect(statement).toMatchObject({ collectedTotal: 110, paidOutTotal: 20, outstanding: 90, reimbursementDue: 12 });
    expect(summary.staffReimbursementDue).toBe(12);
  });

  it("يحافظ النسخ الاحتياطي على حقول التمويل في قيد المصروف (نقل واستعادة)", () => {
    const normalized = normalizeAppData({ bookings: [], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], expenses: [floatExpense, pocketExpense, ownerCliqExpense], settings: floatSettings });
    const raw = serializeBackup(normalized);
    const restored = parseBackupData(raw).expenses ?? [];
    expect(restored).toHaveLength(3);
    expect(restored[0]).toMatchObject({ category: "fuel-gas", fundingEntity: "staff", isFloatExpense: true, fundingSourceId: floatId });
    expect(restored[1]).toMatchObject({ category: "maintenance", isStaffReimbursement: true, maintenanceTaskId: "mt-9" });
    expect(restored[2]).toMatchObject({ category: "hospitality", fundingChannel: "cliq", fundingSourceId: "treasury-1" });
  });
});