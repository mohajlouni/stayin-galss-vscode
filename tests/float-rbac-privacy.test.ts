import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, type Booking, type Expense, normalizeAppData, staffFloatOutstanding, type Settings } from "../lib/booking-model";
import { staffFloatLedgerForUser, staffFloatStatementsForUser } from "../lib/reporting";

const myFloatId = "staff-1";
const siblingFloatId = "staff-2";
const ownerAccountId = "treasury-vault";
const floatSettings: Settings = { businessName: "منشأة", businessPhone: "", currency: "د.أ", bookingTypes: DEFAULT_SETTINGS.bookingTypes, paymentMethods: [], paymentRouting: { ownerAccounts: [{ id: ownerAccountId, kind: "vault", label: "صندوق كاش الخزينة المركزية", detail: "الصندوق", isActive: true, isDefault: true }], staffFloats: [{ id: myFloatId, memberUserId: 7, memberName: "صدام", label: "نقطة صدام", isActive: true }, { id: siblingFloatId, memberUserId: 99, memberName: "أحمد", label: "نقطة أحمد", isActive: true }] } };

const myExpense: Expense = { id: "e-float", chaletId: "c-1", chaletName: "النوح", amount: 20, date: "2026-08-22", category: "fuel-gas", note: "محروقات", fundingEntity: "staff", fundingSourceId: myFloatId, isFloatExpense: true, isSettled: true, settlementId: "s1", createdAt: "2026-08-26T12:00:00.000Z" };
const siblingExpense: Expense = { id: "e-sibling", chaletId: "c-1", chaletName: "النوح", amount: 9, date: "2026-08-23", category: "maintenance", note: "مصروف زميل", fundingEntity: "staff", fundingSourceId: siblingFloatId, isFloatExpense: true, createdAt: "2026-08-26T13:00:00.000Z" };

const myBooking: Booking = {
  id: "booking-my",
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
  payments: [{ id: "p1", amount: 110, date: "2026-08-26", recordedAt: "2026-08-26T09:00:00.000Z", paymentMethod: "cash-owner", recipientTargetId: `float-${myFloatId}` }],
  depositCollection: { id: "d1", amount: 15, date: "2026-08-26", recordedAt: "2026-08-26T10:00:00.000Z", paymentMethod: "cash-owner", recipientTargetId: `float-${myFloatId}` },
  notes: "",
  status: "confirmed",
  bookingReference: "#RBAC001",
  createdAt: "2026-08-26T08:00:00.000Z",
};

const siblingBooking: Booking = {
  id: "booking-sibling",
  customerName: "خالد",
  phone: "0790000001",
  chaletId: "chalet-2",
  chaletName: "الغروب",
  startDate: "2026-08-26",
  endDate: "2026-08-26",
  bookingType: "evening",
  startTime: "22:00",
  endTime: "09:00",
  price: 120,
  payments: [{ id: "p2", amount: 40, date: "2026-08-26", paymentMethod: "cash-owner", recipientTargetId: `float-${siblingFloatId}` }],
  notes: "",
  status: "confirmed",
  createdAt: "2026-08-26T08:00:00.000Z",
};

const mySettlement = { id: "s1", floatId: myFloatId, amount: 105, settledAt: "2026-08-28T10:00:00.000Z", settlementDate: "2026-08-28", recipientAccountId: ownerAccountId, recipientAccountLabel: "صندوق كاش الخزينة المركزية", channel: "vault" as const, coveredPaymentIds: ["p1", "d1"], coveredExpenseIds: ["e-float"] };
const siblingSettlement = { id: "s2", floatId: siblingFloatId, amount: 40, settledAt: "2026-08-28T11:00:00.000Z", settlementDate: "2026-08-28", recipientAccountId: ownerAccountId, recipientAccountLabel: "صندوق كاش الخزينة المركزية", channel: "vault" as const };

describe("CRITICAL RBAC & PRIVACY ENFORCEMENT: عزل عهدة الموظف ولبس الإجراءات", () => {
  it("يعزل كشف العهدة على معرّف المستخدم — لا يسلّم أبدًا عهدة الزميل", () => {
    const data = normalizeAppData({ bookings: [myBooking, siblingBooking], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], expenses: [myExpense, siblingExpense], staffFloatSettlements: [mySettlement, siblingSettlement], settings: floatSettings });
    const mine = staffFloatStatementsForUser(data, 7);
    const sibling = staffFloatStatementsForUser(data, 99);
    expect(mine.every((statement) => statement.float.id === myFloatId)).toBe(true);
    expect(mine.some((statement) => statement.float.id === siblingFloatId)).toBe(false);
    expect(sibling.every((statement) => statement.float.id === siblingFloatId)).toBe(true);
    expect(mine[0]).toMatchObject({ collectedTotal: 125, paidOutTotal: 20, settledTotal: 105, outstanding: 0 });
    expect(staffFloatStatementsForUser(data, 404)).toEqual([]);
  });

  it("كشف الحساب الشخصي: ترتيب كرونولوجي وحركات موقّعة ورصيد جارٍ يطابق الذمة الفعلية", () => {
    const data = normalizeAppData({ bookings: [myBooking, siblingBooking], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], expenses: [myExpense, siblingExpense], staffFloatSettlements: [mySettlement, siblingSettlement], settings: floatSettings });
    const ledger = staffFloatLedgerForUser(data, 7);
    expect(ledger.float?.id).toBe(myFloatId);
    expect(ledger.entries.map((entry) => entry.kind)).toEqual(["rental-collected", "deposit-collected", "float-expense", "settled-transfer"]);
    expect(ledger.entries.map((entry) => entry.amount)).toEqual([110, 15, -20, -105]);
    expect(ledger.entries.map((entry) => entry.runningBalance)).toEqual([110, 125, 105, 0]);
    expect(ledger.netBalance).toBe(0);
    expect(ledger.netBalance).toBe(staffFloatOutstanding(data, myFloatId));
    expect(ledger.entries.some((entry) => entry.id === "e-sibling")).toBe(false);
  });

  it("الرصيد الجاري يعكس الذمة الفعلية دون تسوية (تحصيل ناقص مصروفات)", () => {
    const data = normalizeAppData({ bookings: [myBooking], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], expenses: [myExpense], staffFloatSettlements: [], settings: floatSettings });
    const ledger = staffFloatLedgerForUser(data, 7);
    expect(ledger.entries.map((entry) => entry.amount)).toEqual([110, 15, -20]);
    expect(ledger.netBalance).toBe(105);
    expect(ledger.netBalance).toBe(staffFloatOutstanding(data, myFloatId));
    expect(ledger.entries[2].runningBalance).toBe(105);
  });

  it("يفرض المخزن أن طلب التوريد يخص عهدة الموظف نفسه فقط (حارس لا يطلب على عهدة زميله)", () => {
    const store = readFileSync("lib/booking-store.tsx", "utf8");
    expect(store).toContain("ownsFloat");
    expect(store).toContain("!isManager && !ownsFloat");
    expect(store).toContain("memberUserId === user?.id");
    expect(store).toContain("float-request-forbidden");
    expect(store).toContain('if (!can("manage_payments")) throw new Error("manage-payments-forbidden")');
  });

  it("يخفي شاشة العُهد النظرة العامة عن الموظف ويعرض بطاقته فقط مع زرّي التوريد وكشف الحساب", () => {
    const screen = readFileSync("app/float-settlements.tsx", "utf8");
    const personal = readFileSync("app/staff-my-float.tsx", "utf8");
    expect(screen).toContain("isGlobalView");
    expect(screen).toContain("staffFloatStatementsForUser");
    expect(screen).toContain("طلب توريد وتسليم نقدية للمالك 📤");
    expect(screen).toContain("كشف حسابي وسجل الحركات 📑");
    expect(screen).toContain('router.push("/staff-my-float")');
    expect(screen).toContain("إجمالي العُهد المعلقة");
    expect(personal).toContain("staffFloatLedgerForUser");
    expect(personal).toContain("runningBalance");
    expect(personal).toContain("رصيدك الحالي (ذمة معلقة)");
  });

  it("يحجب الوصول إلى سجل الإجراءات العام (audit-log) عن غير المديرين على كل نقاط الدخول", () => {
    const settings = readFileSync("app/(tabs)/settings.tsx", "utf8");
    const more = readFileSync("app/(tabs)/more.tsx", "utf8");
    const audit = readFileSync("app/audit-log.tsx", "utf8");
    expect(settings).toContain('can("view_audit_logs")');
    expect(more).toContain('can("view_audit_logs") && flags.audit_logs');
    expect(audit).toContain('if (!can("view_audit_logs"))');
  });
});