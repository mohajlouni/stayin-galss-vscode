import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, type Booking, type Expense, normalizeAppData, type Settings } from "../lib/booking-model";
import { staffFloatLedgerForFloat, staffFloatLedgerForPeriod } from "../lib/reporting";

const floatId = "staff-1";
const siblingFloatId = "staff-2";
const ownerAccountId = "treasury-vault";
const floatSettings: Settings = { businessName: "منشأة", businessPhone: "", currency: "د.أ", bookingTypes: DEFAULT_SETTINGS.bookingTypes, paymentMethods: [], paymentRouting: { ownerAccounts: [{ id: ownerAccountId, kind: "vault", label: "صندوق كاش الخزينة المركزية", detail: "الصندوق", isActive: true, isDefault: true }], staffFloats: [{ id: floatId, memberUserId: 7, memberName: "صدام", label: "نقطة صدام", isActive: true }, { id: siblingFloatId, memberUserId: 99, memberName: "أحمد", label: "نقطة أحمد", isActive: true }] } };

const floatExpense: Expense = { id: "e-float", chaletId: "c-1", chaletName: "النوح", amount: 20, date: "2026-08-22", category: "fuel-gas", note: "محروقات", fundingEntity: "staff", fundingSourceId: floatId, isFloatExpense: true, createdAt: "2026-08-26T12:00:00.000Z" };
const siblingExpense: Expense = { id: "e-sibling", chaletId: "c-1", chaletName: "النوح", amount: 9, date: "2026-08-23", category: "maintenance", note: "مصروف زميل", fundingEntity: "staff", fundingSourceId: siblingFloatId, isFloatExpense: true, createdAt: "2026-08-26T13:00:00.000Z" };

const booking: Booking = {
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
  payments: [{ id: "p1", amount: 110, date: "2026-08-26", recordedAt: "2026-08-26T09:00:00.000Z", paymentMethod: "cash-owner", recipientTargetId: `float-${floatId}` }],
  depositCollection: { id: "d1", amount: 15, date: "2026-08-26", recordedAt: "2026-08-26T10:00:00.000Z", paymentMethod: "cash-owner", recipientTargetId: `float-${floatId}` },
  notes: "",
  status: "confirmed",
  bookingReference: "#PER001",
  createdAt: "2026-08-26T08:00:00.000Z",
};

const settlement = { id: "s1", floatId, amount: 105, settledAt: "2026-08-28T10:00:00.000Z", settlementDate: "2026-08-28", recipientAccountId: ownerAccountId, recipientAccountLabel: "صندوق كاش الخزينة المركزية", channel: "vault" as const, coveredPaymentIds: ["p1", "d1"], coveredExpenseIds: ["e-float"] };

function buildData() {
  return normalizeAppData({ bookings: [booking], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], expenses: [floatExpense, siblingExpense], staffFloatSettlements: [settlement], settings: floatSettings });
}

describe("الفلاتر الدورية ومؤشرات كشف العهدة", () => {
  it("يرصد الكشف الكامل (الكل) كامل المؤشرات والرصيد الجاري الفعلي", () => {
    const data = buildData();
    const full = staffFloatLedgerForFloat(data, floatId);
    const metrics = staffFloatLedgerForPeriod(data, floatId, null);
    expect(metrics.entries).toHaveLength(4);
    expect(metrics.closingBalance).toBe(0);
    expect(metrics.collected).toBe(125);
    expect(metrics.expenses).toBe(20);
    expect(metrics.handedOver).toBe(105);
    expect(metrics.openingBalance).toBe(0);
    expect(metrics.entries.map((entry) => entry.runningBalance)).toEqual(full.entries.map((entry) => entry.runningBalance));
  });

  it("يعزل فترة 26-27 آب: رصيد افتتاحي 105 ويبقى الرصيد الجاري للحركات داخل الفترة هو الرصيد الفعلي الكامل", () => {
    const data = buildData();
    const metrics = staffFloatLedgerForPeriod(data, floatId, { start: "2026-08-26", end: "2026-08-27" });
    expect(metrics.entries.map((entry) => entry.kind)).toEqual(["rental-collected", "deposit-collected"]);
    expect(metrics.openingBalance).toBe(105);
    expect(metrics.closingBalance).toBe(125);
    expect(metrics.collected).toBe(125);
    expect(metrics.expenses).toBe(0);
    expect(metrics.handedOver).toBe(0);
    expect(metrics.entries.map((entry) => entry.runningBalance)).toEqual([110, 125]);
  });

  it("يشمل التوريد المؤكد عند التمديد إلى 28 آب ويصفّر الرصيد مع رصيد افتتاحي 105", () => {
    const data = buildData();
    const metrics = staffFloatLedgerForPeriod(data, floatId, { start: "2026-08-26", end: "2026-08-28" });
    expect(metrics.entries.map((entry) => entry.kind)).toEqual(["rental-collected", "deposit-collected", "settled-transfer"]);
    expect(metrics.openingBalance).toBe(105);
    expect(metrics.closingBalance).toBe(0);
    expect(metrics.handedOver).toBe(105);
  });

  it("فترة التوريد فقط (28/28): يفتتح الكشف برصيد 105 ويغلق بصفر", () => {
    const data = buildData();
    const metrics = staffFloatLedgerForPeriod(data, floatId, { start: "2026-08-28", end: "2026-08-28" });
    expect(metrics.entries.map((entry) => entry.kind)).toEqual(["settled-transfer"]);
    expect(metrics.openingBalance).toBe(105);
    expect(metrics.closingBalance).toBe(0);
    expect(metrics.entries[0].runningBalance).toBe(0);
  });

  it("لا يُدخل الفلترة مصروفات عهد الموظفين الآخرين ولا يمس بعزل العُهد", () => {
    const data = buildData();
    const metrics = staffFloatLedgerForPeriod(data, floatId, { start: "2026-08-22", end: "2026-08-28" });
    expect(metrics.entries.some((entry) => entry.id === "e-sibling")).toBe(false);
    expect(metrics.handedOver + metrics.collected - metrics.expenses).toBe(210);
  });

  it("يربط الواجهات والمكونات وكشف PDF الفلترة الدورية والمؤشرات الأربعة والأزرار المطلوبة", () => {
    const ledger = readFileSync("app/staff-float-ledger/[staffId].tsx", "utf8");
    const screen = readFileSync("app/float-settlements.tsx", "utf8");
    const settleModal = readFileSync("components/settlements/SettlementModal.tsx", "utf8");
    const drawer = readFileSync("components/settlements/StaffLedgerDrawer.tsx", "utf8");
    const pdf = readFileSync("lib/ledger-pdf.ts", "utf8");
    const reporting = readFileSync("lib/reporting.ts", "utf8");
    expect(ledger).toContain("اليوم");
    expect(ledger).toContain("هذا الأسبوع (7 أيام)");
    expect(ledger).toContain("هذا الشهر");
    expect(ledger).toContain("فترة مخصصة (من - إلى)");
    expect(ledger).toContain("الكل");
    expect(ledger).toContain("[ طباعة كشف الحساب 🖨️ / PDF ]");
    expect(ledger).toContain("الرصيد المعلق الحالي");
    expect(ledger).toContain("إجمالي المحصل (المستلم)");
    expect(ledger).toContain("إجمالي المصروفات (المرجوع / الخصم)");
    expect(ledger).toContain("إجمالي المورَّد للمالك");
    expect(ledger).toContain("DateRangePicker");
    expect(ledger).toContain("staffFloatLedgerForPeriod");
    expect(ledger).toContain("runningBalance");
    expect(screen).toContain('fallbackHref="/(tabs)/more"');
    expect(screen).toContain("أرشيف وسجل التسويات العامة 🗄️");
    expect(screen).not.toContain("[ أرشيف وسجل التسويات العامة 🗄️ ]");
    expect(settleModal).toContain('textAlign: "right"');
    expect(settleModal).toContain('writingDirection: "rtl"');
    expect(settleModal).toContain("StaffLedgerDrawer");
    expect(settleModal).toContain("معاينة الحركات المشمولة في شاشة مستقلة ↗");
    expect(drawer).toContain("[ إغلاق والعودة للتوريد ✕ ]");
    expect(drawer).toContain("runningBalance");
    expect(pdf).toContain("توقيع الموظف (المسلّم)");
    expect(pdf).toContain("توقيع الإدارة (المستلم)");
    expect(pdf).toContain("Print.printToFileAsync");
    expect(pdf).toContain("Sharing.shareAsync");
    expect(pdf).toContain("Inflow");
    expect(pdf).toContain("Outflow");
    expect(reporting).toContain("staffFloatLedgerForPeriod");
    expect(reporting).toContain("openingBalance");
  });
});