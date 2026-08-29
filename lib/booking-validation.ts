import { type Booking, type BookingType, findConflicts } from "./booking-model";
import { normalizeInternationalPhone } from "./phone-number";
import { z } from "zod";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** تحقق صارم بمخطط Zod جاهز لتوحيد الفحص في النماذج والواجهة والخدمة التوفّرية لاحقًا. */
export const bookingDraftSchema = z.object({
  customerName: z.string().trim().min(2, "اسم العميل مطلوب (حرفان على الأقل)").max(255),
  phone: z.string().trim().min(6, "رقم الهاتف غير صحيح").max(32),
  chaletId: z.string().min(1, "اختر الشاليه"),
  startDate: z.string().regex(DAY_PATTERN, "تاريخ البداية غير صحيح"),
  endDate: z.string().regex(DAY_PATTERN, "تاريخ النهاية غير صحيح"),
  bookingType: z.enum(["morning", "evening", "24h", "custom", "multi-day"]),
  startTime: z.union([z.string().regex(TIME_PATTERN, "وقت البداية غير صحيح"), z.literal(""), z.undefined()]),
  endTime: z.union([z.string().regex(TIME_PATTERN, "وقت النهاية غير صحيح"), z.literal(""), z.undefined()]),
  price: z.number().positive("سعر الفترة يجب أن يكون أكبر من صفر"),
  depositAmount: z.number().min(0, "التأمين لا يمكن أن يكون سالبًا"),
});

export type BookingDraftInput = {
  customerName?: string;
  phone?: string | null;
  chaletId?: string;
  startDate?: string;
  endDate?: string;
  bookingType?: BookingType;
  startTime?: string;
  endTime?: string;
  price?: number;
  depositAmount?: number;
};

export type BookingValidationResult =
  | { ok: true; normalizedPhone: string }
  | { ok: false; field: string; message: string };

/** فحص موحّد لمسودة الحجز: الاسم، الهاتف المطبَّع دوليًا، التواريخ والأوقات، السعر والتأمين. */
export function validateBookingInput(input: BookingDraftInput): BookingValidationResult {
  const name = (input.customerName ?? "").trim();
  if (name.length < 2) return { ok: false, field: "customerName", message: "اسم العميل مطلوب (حرفان على الأقل)" };
  const phone = normalizeInternationalPhone(input.phone);
  if (phone.error) return { ok: false, field: "phone", message: "رقم الهاتف غير صحيح" };
  if (!input.chaletId) return { ok: false, field: "chaletId", message: "اختر الشاليه" };
  if (typeof input.startDate !== "string" || !DAY_PATTERN.test(input.startDate) || typeof input.endDate !== "string" || !DAY_PATTERN.test(input.endDate)) {
    return { ok: false, field: "endDate", message: "تواريخ الفترة غير صحيحة (الصيغة YYYY-MM-DD)" };
  }
  const isEmptyTime = (value?: string) => typeof value !== "string" || value.trim() === "";
  if (!isEmptyTime(input.startTime) && !TIME_PATTERN.test(input.startTime as string)) return { ok: false, field: "startTime", message: "وقت البداية غير صحيح" };
  if (!isEmptyTime(input.endTime) && !TIME_PATTERN.test(input.endTime as string)) return { ok: false, field: "endTime", message: "وقت النهاية غير صحيح" };
  if (!Number.isFinite(input.price) || Number(input.price) <= 0) return { ok: false, field: "price", message: "سعر الفترة يجب أن يكون أكبر من صفر" };
  if (Number(input.depositAmount) < 0) return { ok: false, field: "depositAmount", message: "التأمين لا يمكن أن يكون سالبًا" };
  return { ok: true, normalizedPhone: phone.value ?? "" };
}

/** نقطة دخول مركزية لفحص توفر الوحدة وتعارض الفترات (أساس خدمة الإتاحية المستقبلية). */
export function findBookingDateConflicts(draft: Booking, others: Booking[], ignoreId?: string): Booking[] {
  return findConflicts(draft, others, ignoreId);
}