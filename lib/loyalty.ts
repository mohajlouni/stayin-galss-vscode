import { DEFAULT_LOYALTY_PROGRAM_CONFIG, type LoyaltyProgramConfig, type LoyaltyTier } from "./booking-model";

/** Points earned per 1 JOD of stay value (10 JOD → 1 point). */
export const POINTS_PER_JOD = 10;
/** Cashback value of a single point in JOD. */
export const JOD_PER_POINT = 0.1;

export const SILVER_MIN_STAYS = 3;
export const SILVER_MIN_SPEND_JOD = 500;
export const GOLD_MIN_STAYS = 6;
export const GOLD_MIN_SPEND_JOD = 1200;
export const PLATINUM_MIN_STAYS = 10;

export const LOYALTY_TIER_ORDER = ["bronze", "silver", "gold", "platinum"] as const;

export function loyaltyMultiplier(tier: LoyaltyTier) {
  return tier === "platinum" ? 2 : tier === "gold" ? 1.5 : tier === "silver" ? 1.2 : 1;
}

/** Derives the tier from the customer's lifetime stats (stays / total spend in JOD). */
export function deriveLoyaltyTier(totalBookingsCount: number, totalSpent: number, config: LoyaltyProgramConfig = DEFAULT_LOYALTY_PROGRAM_CONFIG): LoyaltyTier {
  const stays = Math.max(0, Math.floor(totalBookingsCount || 0));
  const spent = Math.max(0, Number(totalSpent || 0));
  if (stays >= config.platinumMinStays) return "platinum";
  if (stays >= config.goldMinStays || spent > config.goldMinSpendJod) return "gold";
  if (stays >= config.silverMinStays || spent > config.silverMinSpendJod) return "silver";
  return "bronze";
}

/** Base (pre-multiplier) points for a paid stay amount, floor(amount / pointsPerJod). */
export function pointsBaseForAmount(amount: number, config: LoyaltyProgramConfig = DEFAULT_LOYALTY_PROGRAM_CONFIG) {
  return Math.max(0, Math.floor(amount / Math.max(1, config.pointsPerJod)));
}

/** Net points awarded after applying the tier multiplier. */
export function pointsEarned(amount: number, tier: LoyaltyTier, config: LoyaltyProgramConfig = DEFAULT_LOYALTY_PROGRAM_CONFIG) {
  return Math.floor(pointsBaseForAmount(Math.max(0, Number(amount || 0)), config) * loyaltyMultiplier(tier));
}

/** JOD cashback value of a points balance. */
export function pointsValueJod(points: number, config: LoyaltyProgramConfig = DEFAULT_LOYALTY_PROGRAM_CONFIG) {
  return Math.round(Math.max(0, Math.floor(points) * config.jodPerPoint) * 100) / 100;
}

/** Largest redeemable point block whose cash value does not exceed the subtotal. */
export function redemptionForSubtotal(pointsBalance: number, subtotal: number, config: LoyaltyProgramConfig = DEFAULT_LOYALTY_PROGRAM_CONFIG) {
  const balance = Math.max(0, Math.floor(pointsBalance || 0));
  const remaining = Math.max(0, Number(subtotal || 0));
  if (balance <= 0 || remaining <= 0) return { points: 0, amount: 0 };
  const affordable = Math.min(balance, Math.floor(remaining / Math.max(0.001, config.jodPerPoint)));
  const amount = pointsValueJod(affordable, config);
  return { points: affordable, amount: Math.min(amount, remaining) };
}

export function loyaltyTierLabel(tier: LoyaltyTier, language: "ar" | "en") {
  return ({ bronze: ["برونزي", "Bronze"], silver: ["فضي", "Silver"], gold: ["ذهبي", "Gold"], platinum: ["بلاتيني", "Platinum"] } as const)[tier][language === "ar" ? 0 : 1];
}

export function loyaltyTierIcon(tier: LoyaltyTier): "emoji-events" | "workspace-premium" | "star" | "military-tech" {
  return tier === "platinum" ? "military-tech" : tier === "gold" ? "star" : tier === "silver" ? "workspace-premium" : "emoji-events";
}

/** Perk description per tier (gold heats pool priority, platinum late checkout). */
export function loyaltyTierPerkLabel(tier: LoyaltyTier, language: "ar" | "en") {
  if (tier === "platinum") return language === "ar" ? "خروج متأخر مسموح + مضاعفة النقاط ×2" : "Late checkout allowed + 2× points";
  if (tier === "gold") return language === "ar" ? "أولوية تدفئة المسبح + نقاط ×1.5" : "Pool heating priority + 1.5× points";
  if (tier === "silver") return language === "ar" ? "نقاط ×1.2" : "1.2× points";
  return language === "ar" ? "اكسب نقطة لكل 10 د.أ" : "Earn 1 pt per 10 JOD";
}