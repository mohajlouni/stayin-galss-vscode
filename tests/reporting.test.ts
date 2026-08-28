import { describe, expect, it } from "vitest";

import { type Booking, type Chalet } from "../lib/booking-model";
import { REPORT_PAYMENT_METHODS, selectReportBookings, summarizeFinancialReport } from "../lib/reporting";

const chalet = (id: string, name: string, color: string): Chalet => ({ id, name, color, createdAt: "2026-08-01T00:00:00.000Z" });
const booking = (overrides: Partial<Booking> = {}): Booking => ({ id: "b-1", customerName: "سامي", phone: "0790000000", chaletId: "c-1", startDate: "2026-08-22", endDate: "2026-08-22", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 120, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-22T08:00:00.000Z", ...overrides });

describe("financial report summaries", () => {
  it("separates paid and remaining rental values and groups supported payment methods", () => {
    const data = [booking({ payments: [{ id: "guardian", amount: 50, date: "2026-08-22", paymentMethod: "cash-guardian" }, { id: "cliq", amount: 20, date: "2026-08-22", paymentMethod: "click" }] }), booking({ id: "b-2", chaletId: "c-2", price: 80, payments: [{ id: "owner", amount: 80, date: "2026-08-22", paymentMethod: "cash-owner" }] })];
    const summary = summarizeFinancialReport(data, [chalet("c-1", "النوح", "#C87947"), chalet("c-2", "المايا", "#C9587A")]);
    expect(summary.paid).toBe(150);
    expect(summary.remaining).toBe(50);
    expect(summary.paymentMethods["cash-guardian"]).toBe(50);
    expect(summary.paymentMethods["cash-owner"]).toBe(80);
    expect(summary.paymentMethods.click).toBe(20);
    expect(REPORT_PAYMENT_METHODS).toEqual(["cash-guardian", "cash-owner", "click"]);
  });

  it("filters the selected period and excludes cancelled or waitlisted records", () => {
    const data = [booking(), booking({ id: "old", startDate: "2026-07-22" }), booking({ id: "cancelled", status: "cancelled" }), booking({ id: "waitlisted", status: "waitlisted" })];
    expect(selectReportBookings(data, "month", "2026-08-22").map((item) => item.id)).toEqual(["b-1"]);
  });
});
