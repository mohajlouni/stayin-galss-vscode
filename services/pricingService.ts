import { type Booking, type Chalet, type SpecialPriceRule, type Settings, configuredBookingPrice, configuredRateForDate } from "../lib/booking-model";

/** إعادة تصدير محرّك التسعير الحالي كنقطة واحدة — تُوسَّع لاحقًا بأسعار العطلات والعمولات. */
export { configuredBookingPrice, configuredRateForDate };

/** عمولة المنصة على مبلغ حسب نسبة مئوية (تقريب حِسِّي إلى منزلتين عشرية). */
export function computeMarketplaceCommission(amount: number, ratePercent: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(ratePercent) || ratePercent <= 0) return 0;
  return Math.round((amount * ratePercent) / 100 * 100) / 100;
}

/** المبلغ الصافي الذي يُحوَّل للمالك بعد خصم العمولة. */
export function computePayoutAmount(amount: number, commissionAmount: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(commissionAmount) || commissionAmount <= 0) return amount;
  return Math.max(0, Math.round((amount - commissionAmount) * 100) / 100);
}

export type { Booking, Chalet, SpecialPriceRule, Settings };