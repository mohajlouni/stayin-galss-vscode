import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { computeMarketplaceCommission, computePayoutAmount } from "../services/pricingService";
import { findBookingConflicts, hasBookingConflict } from "../services/availabilityService";
import { type Booking } from "../lib/booking-model";

const project = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const booking = (overrides: Partial<Booking> = {}) =>
  ({
    id: "b-1",
    customerName: "سارة",
    phone: "0790000000",
    chaletId: "chalet-1",
    chaletName: "الوحدة",
    startDate: "2026-09-01",
    endDate: "2026-09-02",
    bookingType: "morning",
    startTime: "09:00",
    endTime: "21:00",
    price: 120,
    depositAmount: 30,
    status: "confirmed",
    ...overrides,
  }) as Booking;

describe("centralized availability service", () => {
  it("detects conflicts and availability through the same engine as the screens", () => {
    const draft = { id: "draft", chaletId: "chalet-1", chaletName: "الوحدة", startDate: "2026-09-01", endDate: "2026-09-02", bookingType: "morning" as const, startTime: "09:00", endTime: "21:00" };
    const other = booking({ id: "b-2" });
    const cancelled = booking({ id: "b-3", status: "cancelled" });
    expect(findBookingConflicts(draft, [other, cancelled])).toHaveLength(1);
    expect(hasBookingConflict(draft, [other])).toBe(true);
    expect(hasBookingConflict(draft, [cancelled])).toBe(false);
  });

  it("routes the shared validation entry point through the availability service", () => {
    const validation = project("lib/booking-validation.ts");
    expect(validation).toContain('import { findBookingConflicts } from "../services/availabilityService";');
    expect(validation).toContain("return findBookingConflicts(draft, others, ignoreId);");
  });

  it("wires the manual booking form through both services without breaking its guard strings", () => {
    const form = project("app/booking-form.tsx");
    expect(form).toContain('import { hasBookingConflict } from "@/services/availabilityService";');
    expect(form).toContain('import { configuredBookingPrice } from "@/services/pricingService";');
    expect(form).toContain("hasBookingConflict(draft, [booking])");
    expect(form).toContain("const automaticPrice = useMemo(() => configuredBookingPrice(");
  });
});

describe("centralized pricing service", () => {
  it("re-exports the existing pricing engine used by the booking screen", () => {
    const service = project("services/pricingService.ts");
    expect(service).toContain("configuredBookingPrice");
    expect(service).toContain("configuredRateForDate");
  });

  it("computes marketplace commission and owner payout deterministically", () => {
    expect(computeMarketplaceCommission(150, 10)).toBe(15);
    expect(computeMarketplaceCommission(250, 5)).toBe(12.5);
    expect(computeMarketplaceCommission(0, 10)).toBe(0);
    expect(computeMarketplaceCommission(150, 0)).toBe(0);
    expect(computePayoutAmount(150, 15)).toBe(135);
    expect(computePayoutAmount(50, 60)).toBe(0);
  });
});