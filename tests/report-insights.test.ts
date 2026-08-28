import { describe, expect, it } from "vitest";

import { type Booking, type Chalet } from "../lib/booking-model";
import { buildReportBusinessInsights } from "../lib/report-insights";

const chalets: Chalet[] = [{ id: "c-1", name: "النوح", color: "#10B981", createdAt: "2026-08-01T10:00:00.000Z" }, { id: "c-2", name: "المايا", color: "#3B82F6", createdAt: "2026-08-01T10:00:00.000Z" }];
const booking = (overrides: Partial<Booking> = {}): Booking => ({ id: "b-1", customerName: "سامي", phone: "0790000000", chaletId: "c-1", startDate: "2026-08-22", endDate: "2026-08-22", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 100, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-20T10:00:00.000Z", ...overrides });

describe("report business insights", () => {
  it("calculates day-level occupancy and expected collection in the selected scope", () => {
    const insight = buildReportBusinessInsights([booking()], chalets, "today", "2026-08-22", undefined, new Date(2026, 7, 22, 10, 0).getTime());
    expect(insight.occupancyRate).toBe(50);
    expect(insight.expectedCollection).toBe(100);
    expect(insight.outstandingBookingCount).toBe(1);
  });

  it("flags a held deposit after checkout as an overdue deposit risk", () => {
    const insight = buildReportBusinessInsights([booking({ endDate: "2026-08-21", depositAmount: 50, status: "completed" })], [chalets[0]!], "all", "2026-08-22", "c-1", new Date(2026, 7, 22, 10, 0).getTime());
    expect(insight.overdueDepositAmount).toBe(50);
    expect(insight.overdueDepositCount).toBe(1);
  });
});
