import { describe, expect, it } from "vitest";

import { configuredRateForDate, DEFAULT_SETTINGS, type Chalet } from "../lib/booking-model";

describe("chalet-specific weekend days", () => {
  const chalet = { id: "c-1", name: "النخلة", color: "#A56DD1", createdAt: "2026-01-01", weekendDays: [0], periodPricing: { morning: { weekdayPrice: 50, weekendPrice: 90 }, evening: { weekdayPrice: 60, weekendPrice: 100 }, "24h": { weekdayPrice: 90, weekendPrice: 150 } } } satisfies Chalet;

  it("uses the chalet's selected weekend days ahead of the global setting", () => {
    const settings = { ...DEFAULT_SETTINGS, weekendDays: [5, 6] };
    expect(configuredRateForDate("morning", "2026-08-23", settings, chalet)).toBe(90);
    expect(configuredRateForDate("morning", "2026-08-21", settings, chalet)).toBe(50);
  });
});
