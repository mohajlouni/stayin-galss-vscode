import {
  type Booking,
  type ChaletShift,
  type MaintenanceBlockPeriod,
  type MaintenanceTask,
  findConflicts,
  getActiveChaletShifts,
  reservedPeriodColorKeyForShift,
  type Settings,
} from "./booking-model";

/**
 * ربط فترات الصيانة مع شرائح الوحدة في التقويم التشغيلي.
 *
 * - full_day: يحجب اليوم كاملًا (كل الفترات).
 * - morning : يحجب فترة الصباح (نوع الحجز morning).
 * - evening : يحجب الفترة المسائية (نوع الحجز evening).
 * - overnight: يحجب فترات المبيت/اليوم الكامل/عدة أيام (overnight / full_day).
 *
 * المنع مشتق من بيانات المهام الحالية (blockBooking && blockPeriod) وليس من صفوف
 * منفصلة، لذا حذف/إلغاء/إعادة جدولة المهمة يحرر الكتلة تلقائيًا من دون تنظيف يدوي.
 */

/** مدة المنع الحالية للمهمة، أو undefined إن كانت دون منع أو مكتملة أو ملغاة. */
export function taskBlockPeriod(task: Pick<MaintenanceTask, "blockBooking" | "blockPeriod" | "status">): MaintenanceBlockPeriod | undefined {
  if (task.status === "completed" || task.status === "cancelled" || task.blockBooking !== true) return undefined;
  return task.blockPeriod ?? "full_day";
}

/** هل كتلة المنع تشمل الفترة المعطاة (periodKind)؟ */
export function maintenanceBlockCoversPeriod(block: MaintenanceBlockPeriod, periodKind: ReturnType<typeof reservedPeriodColorKeyForShift>): boolean {
  if (block === "full_day") return true;
  if (block === "morning") return periodKind === "morning";
  if (block === "evening") return periodKind === "evening";
  if (block === "overnight") return periodKind === "overnight" || periodKind === "full_day";
  return false;
}

/** جميع مهام الصيانة النشطة (غير المكتملة وغير الملغاة) التي تحجب الوحدة في تاريخ معيّن. */
export function maintenanceBlocksForDate(tasks: readonly MaintenanceTask[], date: string): MaintenanceTask[] {
  return tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled" && task.blockBooking === true && task.nextDueDate.slice(0, 10) === date);
}

/** مهام الصيانة التي تحجب الوحدة في تاريخ معين. */
export function maintenanceBlocksForChaletDate(tasks: readonly MaintenanceTask[], date: string, chaletId: string): MaintenanceTask[] {
  return maintenanceBlocksForDate(tasks, date).filter((task) => task.chaletId === chaletId);
}

/** هل توجد مهمة يوم كامل تحجب الوحدة بالكامل في ذلك التاريخ؟ */
export function isUnitFullyBlocked(tasks: readonly MaintenanceTask[], date: string, chaletId: string): boolean {
  return maintenanceBlocksForChaletDate(tasks, date, chaletId).some((task) => taskBlockPeriod(task) === "full_day");
}

/** هل توجد مهمة تحجب الشريحة المعطاة للوحدة في التاريخ؟ */
export function isShiftMaintenanceBlocked(
  tasks: readonly MaintenanceTask[],
  date: string,
  chaletId: string,
  shift: Pick<ChaletShift, "id" | "name" | "periodKind">,
): boolean {
  const periodKind = reservedPeriodColorKeyForShift(shift);
  return maintenanceBlocksForChaletDate(tasks, date, chaletId).some((task) => maintenanceBlockCoversPeriod(taskBlockPeriod(task) ?? "full_day", periodKind));
}

/** بناء مرشّح حجز يعادل فترة المنع بأوقات الشريحة الفعلية لفحص التضارب. */
function blockCandidateForShift(block: MaintenanceBlockPeriod, date: string, chaletId: string, shift: ChaletShift) {
  const bookingType = block === "morning" ? ("morning" as const) : block === "evening" ? ("evening" as const) : ("24h" as const);
  return { chaletId, startDate: date, endDate: date, bookingType, shiftId: shift.id, startTime: shift.startTime, endTime: shift.endTime };
}

/**
 * هل تتعارض المهمة المانعة مع أي حجز نشط على الوحدة في تاريخ الاستحقاق؟
 * ignoreTaskId يتجاهل مهمة قيد التعديل (لا تنطبق هنا لأن المنع لا يخزَّن كحجز).
 */
export function hasMaintenanceCollision(
  task: Pick<MaintenanceTask, "chaletId" | "nextDueDate" | "status" | "blockBooking" | "blockPeriod">,
  bookings: readonly Booking[],
  settings: Settings,
  ignoreId?: string,
): boolean {
  const block = taskBlockPeriod(task);
  const date = task.nextDueDate.slice(0, 10);
  if (!block || !task.chaletId || !date) return false;
  const active = bookings.filter((booking) => booking.status !== "cancelled" && booking.status !== "completed" && booking.status !== "waitlisted");
  if (!active.length) return false;
  const shift = getActiveChaletShifts(undefined, settings).find((item) => maintenanceBlockCoversPeriod(block, reservedPeriodColorKeyForShift(item)));
  const candidate = shift
    ? blockCandidateForShift(block, date, task.chaletId, shift)
    : { chaletId: task.chaletId, startDate: date, endDate: date, bookingType: "24h" as const, startTime: "00:00", endTime: "23:59" };
  return findConflicts(candidate, active, ignoreId).length > 0;
}

/**
 * هل يُمنع إيداع حجز (في تاريخ معيّن وبفترة معيّنة) لأن مهمة صيانة نشطة تحجب
 * الوحدة؟ workerForBookingType يكشف الفترة المعنية من نوع الحجز/الشريحة.
 */
export function isBookingDateMaintenanceBlocked(
  tasks: readonly MaintenanceTask[],
  date: string,
  chaletId: string,
  periodKey: ReturnType<typeof reservedPeriodColorKeyForShift>,
): boolean {
  return maintenanceBlocksForChaletDate(tasks, date, chaletId).some((task) => maintenanceBlockCoversPeriod(taskBlockPeriod(task) ?? "full_day", periodKey));
}
