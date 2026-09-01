import { describe, expect, it } from "vitest";

import { deriveLoyaltyTier, JOD_PER_POINT, loyaltyMultiplier, loyaltyTierLabel, loyaltyTierPerkLabel, POINTS_PER_JOD, pointsBaseForAmount, pointsEarned, pointsValueJod, redemptionForSubtotal } from "../lib/loyalty";

describe("tier derivation", () => {
  it("starts everyone at bronze", () => {
    expect(deriveLoyaltyTier(0, 0)).toBe("bronze");
    expect(deriveLoyaltyTier(2, 200)).toBe("bronze");
  });

  it("promotes by stays or lifetime spend", () => {
    expect(deriveLoyaltyTier(3, 0)).toBe("silver");
    expect(deriveLoyaltyTier(2, 600)).toBe("silver");
    expect(deriveLoyaltyTier(6, 0)).toBe("gold");
    expect(deriveLoyaltyTier(4, 1300)).toBe("gold");
    expect(deriveLoyaltyTier(10, 0)).toBe("platinum");
    expect(deriveLoyaltyTier(2, 0)).toBe("bronze");
  });
});

describe("points math", () => {
  it("earns one point per 10 JOD of the base amount", () => {
    expect(POINTS_PER_JOD).toBe(10);
    expect(pointsBaseForAmount(55)).toBe(5);
    expect(pointsBaseForAmount(100)).toBe(10);
    expect(pointsBaseForAmount(-5)).toBe(0);
  });

  it("applies the tier multiplier", () => {
    expect(loyaltyMultiplier("bronze")).toBe(1);
    expect(loyaltyMultiplier("silver")).toBe(1.2);
    expect(loyaltyMultiplier("gold")).toBe(1.5);
    expect(loyaltyMultiplier("platinum")).toBe(2);
    expect(pointsEarned(100, "bronze")).toBe(10);
    expect(pointsEarned(100, "silver")).toBe(12);
    expect(pointsEarned(100, "gold")).toBe(15);
    expect(pointsEarned(100, "platinum")).toBe(20);
    expect(pointsEarned(30, "bronze")).toBe(3);
  });

  it("converts points to cashback value", () => {
    expect(JOD_PER_POINT).toBe(0.1);
    expect(pointsValueJod(10)).toBe(1);
    expect(pointsValueJod(55)).toBe(5.5);
    expect(pointsValueJod(0)).toBe(0);
    expect(pointsValueJod(-4)).toBe(0);
  });

  it("caps the redemption to the covered subtotal", () => {
    expect(redemptionForSubtotal(50, 4)).toEqual({ points: 40, amount: 4 });
    expect(redemptionForSubtotal(10, 20)).toEqual({ points: 10, amount: 1 });
    expect(redemptionForSubtotal(0, 5)).toEqual({ points: 0, amount: 0 });
    expect(redemptionForSubtotal(30, 0)).toEqual({ points: 0, amount: 0 });
    expect(redemptionForSubtotal(20, 2.5)).toEqual({ points: 20, amount: 2 });
    // A remainder that cannot pay a full 0.10 cashback point must not be
    // rounded up into an over-redemption (previously ceil() charged 0.60).
    expect(redemptionForSubtotal(100, 0.55)).toEqual({ points: 5, amount: 0.5 });
  });
});

describe("presentation", () => {
  it("labels tiers bilingually", () => {
    expect(loyaltyTierLabel("bronze", "ar")).toBe("برونزي");
    expect(loyaltyTierLabel("gold", "en")).toBe("Gold");
    expect(loyaltyTierLabel("platinum", "ar")).toBe("بلاتيني");
  });

  it("describes perks per tier", () => {
    expect(loyaltyTierPerkLabel("platinum", "ar")).toContain("مضاعفة");
    expect(loyaltyTierPerkLabel("gold", "en")).toContain("1.5");
    expect(loyaltyTierPerkLabel("bronze", "ar")).toContain("10");
  });
});