import { describe, expect, it } from "vitest";

import { type UtilityReading } from "../lib/booking-model";
import { computeConsumedUnits, computeUtilityCost, findOpenUtilityReading, findUtilityReadingForBooking, summarizeUtilityReadings, UTILITY_RATES, UTILITY_THRESHOLDS, utilityTypeLabel } from "../lib/utility-readings";

const reading = (overrides: Partial<UtilityReading> = {}): UtilityReading => ({ id: "u-1", bookingId: "b-1", chaletId: "c-1", type: "electricity", checkInReading: 100, checkInRecordedAt: "2026-08-22T09:00:00Z", checkOutReading: 200, checkOutRecordedAt: "2026-08-22T18:00:00Z", consumedUnits: 100, unitRate: UTILITY_RATES.electricity, totalCost: 12, isExcessive: false, createdAt: "2026-08-22T09:00:00Z", ...overrides });

describe("utility rates", () => {
  it("applies the default unit rates", () => {
    expect(UTILITY_RATES.electricity).toBe(0.12);
    expect(UTILITY_RATES.water).toBe(0.75);
    expect(UTILITY_RATES.gas_fuel).toBe(0.9);
  });

  it("labels types bilingually", () => {
    expect(utilityTypeLabel("electricity", "ar")).toBe("كهرباء");
    expect(utilityTypeLabel("water", "en")).toBe("Water");
    expect(utilityTypeLabel("gas_fuel", "ar")).toBe("غاز ووقود");
  });
});

describe("consumption and cost computation", () => {
  it("never returns negative consumption", () => {
    expect(computeConsumedUnits(200, 100)).toBe(0);
    expect(computeConsumedUnits(100, 150)).toBe(50);
  });

  it("computes cost, rate and the excessive flag against the threshold", () => {
    expect(computeUtilityCost("electricity", 100, 200)).toEqual({ consumedUnits: 100, unitRate: 0.12, totalCost: 12, isExcessive: false });
    const excessive = computeUtilityCost("electricity", 100, 350);
    expect(excessive.consumedUnits).toBe(250);
    expect(excessive.isExcessive).toBe(true);
    expect(computeUtilityCost("water", 10, 60).isExcessive).toBe(true);
    expect(computeUtilityCost("gas_fuel", 5, 50).isExcessive).toBe(false);
  });

  it("keeps thresholds consistent", () => {
    expect(UTILITY_THRESHOLDS).toEqual({ electricity: 200, water: 40, gas_fuel: 100 });
  });
});

describe("summaries and lookups", () => {
  it("aggregates totals, excess count and per-chalet cost", () => {
    const summary = summarizeUtilityReadings([reading(), reading({ id: "u-2", bookingId: "b-2", chaletId: "c-2", type: "water", checkInReading: 200, checkOutReading: 300, consumedUnits: 100, unitRate: 0.75, totalCost: 75, isExcessive: true, checkInRecordedAt: "2026-08-23T09:00:00Z", checkOutRecordedAt: "2026-08-23T18:00:00Z", createdAt: "2026-08-23T09:00:00Z" })]);
    expect(summary.totalCost).toBe(87);
    expect(summary.excessCount).toBe(1);
    expect(summary.byChalet.get("c-1")).toBe(12);
    expect(summary.byChalet.get("c-2")).toBe(75);
  });

  it("computes cost from raw readings when totals are absent", () => {
    const summary = summarizeUtilityReadings([{ id: "u-3", bookingId: "b-3", chaletId: "c-3", type: "electricity", checkInReading: 0, checkInRecordedAt: "2026-08-24T09:00:00Z", checkOutReading: 50, checkOutRecordedAt: "2026-08-24T18:00:00Z", unitRate: 0.12, createdAt: "2026-08-24T09:00:00Z" }]);
    expect(summary.totalCost).toBe(6);
  });

  it("prefers the booking-specific open reading otherwise the first match", () => {
    const list = [reading({ id: "u-a", bookingId: "b-other", checkOutReading: undefined, checkInReading: 5 }), reading({ id: "u-b", bookingId: "b-1", checkOutReading: undefined, checkInReading: 9 })];
    expect(findOpenUtilityReading(list, "c-1", "electricity", "b-1")?.id).toBe("u-b");
    const sameChaletAnotherBooking = findOpenUtilityReading(list, "c-1", "electricity", "missing");
    expect(sameChaletAnotherBooking?.id).toBe("u-a");
    expect(findOpenUtilityReading(list, "c-x", "electricity", "b-1")).toBeUndefined();
  });

  it("filters readings by booking and unit type", () => {
    const list = [reading({ id: "u-1" }), reading({ id: "u-2", bookingId: "b-2", type: "water" })];
    expect(findUtilityReadingForBooking(list, "b-1").map((item) => item.id)).toEqual(["u-1"]);
    expect(findUtilityReadingForBooking(list, "b-2", "electricity")).toEqual([]);
  });
});