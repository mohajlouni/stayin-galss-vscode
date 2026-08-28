import { describe, expect, it } from "vitest";

import { splitExpenseAcrossChalets, type Booking, type Chalet, type Expense } from "../lib/booking-model";
import { selectReportExpenses, summarizeFinancialReport } from "../lib/reporting";

const chalet: Chalet = { id: "c-1", name: "النوح", color: "#10B981", createdAt: "2026-08-01T10:00:00.000Z" };
const booking: Booking = { id: "b-1", customerName: "سامي", phone: "0790000000", chaletId: "c-1", startDate: "2026-08-22", endDate: "2026-08-22", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 300, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-20T10:00:00.000Z" };
const expenses: Expense[] = [{ id: "e-1", chaletId: "c-1", chaletName: "النوح", amount: 75, date: "2026-08-22", category: "cleaning-supplies", createdAt: "2026-08-22T12:00:00.000Z" }, { id: "e-2", chaletId: "c-2", chaletName: "المايا", amount: 40, date: "2026-07-20", category: "maintenance", createdAt: "2026-07-20T12:00:00.000Z" }];

describe("expense reporting", () => {
  it("filters expenses by report range and chalet", () => {
    expect(selectReportExpenses(expenses, "today", "2026-08-22", "c-1").map((expense) => expense.id)).toEqual(["e-1"]);
    expect(selectReportExpenses(expenses, "month", "2026-08-22").map((expense) => expense.id)).toEqual(["e-1"]);
  });

  it("subtracts expenses from rental revenue for net profit and chalet comparison", () => {
    const summary = summarizeFinancialReport([booking], [chalet], [expenses[0]!]);
    expect(summary.expenses).toBe(75);
    expect(summary.netProfit).toBe(225);
    expect(summary.chaletPerformance[0]).toMatchObject({ expenses: 75, netProfit: 225 });
  });

  it("stores exact general-expense shares and shows only the selected unit share in reports", () => {
    const units: Chalet[] = [chalet, { id: "c-2", name: "المايا", color: "#6366F1", createdAt: "2026-08-01T10:00:00.000Z" }, { id: "c-3", name: "غزال", color: "#F43F5E", createdAt: "2026-08-01T10:00:00.000Z" }];
    const shared: Expense = { id: "shared-1", amount: 100, date: "2026-08-22", category: "utilities", createdAt: "2026-08-22T12:00:00.000Z", generalAllocations: splitExpenseAcrossChalets(100, units) };
    expect(shared.generalAllocations?.map((allocation) => allocation.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(shared.generalAllocations?.reduce((sum, allocation) => sum + allocation.amount, 0)).toBeCloseTo(100, 2);
    expect(selectReportExpenses([shared], "today", "2026-08-22", "c-2")).toMatchObject([{ chaletId: "c-2", amount: 33.33 }]);
    expect(selectReportExpenses([shared], "today", "2026-08-22")).toEqual([shared]);
    expect(summarizeFinancialReport([], units, [shared]).expenses).toBe(100);
  });
});
