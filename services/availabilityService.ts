import { type Booking, findConflicts, hasConflict } from "../lib/booking-model";

/** إعادة تصدير للشاشات المرتبطة بنصوص تحقق ثابتة (bookings.tsx / waitlist.tsx) مع بقاء المصدر واحدًا هو الخدمة. */
export { findConflicts, hasConflict };

export type AvailabilityCandidate = Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType" | "shiftId"> & { chaletId?: string; chaletName?: string };

/** المصدر المركزي لفحص تضارب الفترات (صباحي / سهرة / يوم كامل / عدة أيام) — تستدعيه لوحة الإدارة حالًا وواجهة الضيوف مستقبلًا. */
export function findBookingConflicts(candidate: AvailabilityCandidate, bookings: Booking[], ignoreId?: string): Booking[] {
  return findConflicts(candidate, bookings, ignoreId);
}

/** هل فترة الحجز متاحة بلا تضارب مع حجز نشط آخر؟ */
export function isBookingSlotAvailable(candidate: AvailabilityCandidate, bookings: Booking[], ignoreId?: string): boolean {
  return !hasConflict(candidate, bookings, ignoreId);
}

/** مكافئ hasConflict على مستوى الخدمة لفحوص الواجهة. */
export function hasBookingConflict(candidate: AvailabilityCandidate, bookings: Booking[], ignoreId?: string): boolean {
  return hasConflict(candidate, bookings, ignoreId);
}