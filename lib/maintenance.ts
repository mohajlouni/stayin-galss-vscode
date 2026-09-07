import { addDays, localDateISO, type MaintenanceFrequency, type MaintenanceTask, type MaintenanceTaskStatus, type AssetCondition } from "./booking-model";

export function maintenanceIntervalDays(task: Pick<MaintenanceTask, "frequency" | "customIntervalDays">) {
  if (task.frequency === "once") return 1;
  if (task.frequency === "custom") return Math.max(1, Math.abs(Math.round(Number(task.customIntervalDays) || 0))) || 1;
  return task.frequency === "daily" ? 1 : task.frequency === "weekly" ? 7 : task.frequency === "biweekly" ? 14 : 30;
}

export function advanceMaintenanceDueDate(current: string, intervalDays: number) {
  return addDays(current, Math.max(1, intervalDays));
}

/** Advances the schedule by the task frequency starting from the last completion or creation. */
export function nextMaintenanceDueDate(task: Pick<MaintenanceTask, "frequency" | "customIntervalDays" | "lastCompletedDate" | "createdAt">) {
  const base = task.lastCompletedDate ?? task.createdAt.slice(0, 10);
  return advanceMaintenanceDueDate(base, maintenanceIntervalDays(task));
}

export function maintenanceDueInDays(task: Pick<MaintenanceTask, "nextDueDate">, now = Date.now()) {
  const today = localDateISO(new Date(now));
  const due = task.nextDueDate.slice(0, 10);
  const diff = Math.round((new Date(`${due}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);
  return Number.isNaN(diff) ? Number.MAX_SAFE_INTEGER : diff;
}

/** المهمة ما زالت نشطة (غير مكتملة وغير ملغاة) — تُحسب ضمن المهام المفتوحة وتحجز التقويم. */
export function isMaintenanceTaskClosed(task: Pick<MaintenanceTask, "status">) {
  return task.status === "completed" || task.status === "cancelled";
}

export function isMaintenanceOverdue(task: Pick<MaintenanceTask, "nextDueDate" | "status">, now = Date.now()) {
  return !isMaintenanceTaskClosed(task) && maintenanceDueInDays(task, now) < 0;
}

export function isMaintenanceDueToday(task: Pick<MaintenanceTask, "nextDueDate" | "status">, now = Date.now()) {
  return !isMaintenanceTaskClosed(task) && maintenanceDueInDays(task, now) <= 0;
}

export function isMaintenanceUpcoming(task: Pick<MaintenanceTask, "nextDueDate" | "status">, now = Date.now(), horizonDays = 3) {
  const days = maintenanceDueInDays(task, now);
  return !isMaintenanceTaskClosed(task) && days > 0 && days <= horizonDays;
}

export function maintenanceTasksForChalet(tasks: MaintenanceTask[], chaletId: string | undefined) {
  if (!chaletId) return tasks;
  return tasks.filter((task) => task.chaletId === chaletId);
}

export type MaintenanceStats = { overdue: number; dueToday: number; upcoming: number; completed: number; total: number };

export function maintenanceStats(tasks: MaintenanceTask[], now = Date.now()): MaintenanceStats {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  let overdue = 0;
  let dueToday = 0;
  let upcoming = 0;
  tasks.forEach((task) => {
    if (isMaintenanceTaskClosed(task)) return;
    const days = maintenanceDueInDays(task, now);
    if (days < 0) overdue += 1;
    else if (days <= 0) dueToday += 1;
    else if (days <= 3) upcoming += 1;
  });
  return { overdue, dueToday, upcoming, completed, total };
}

export function maintenanceFrequencyLabel(frequency: MaintenanceFrequency, language: "ar" | "en") {
  return ({ once: ["مرة واحدة", "One-time"], daily: ["يوميًا", "Daily"], weekly: ["أسبوعيًا", "Weekly"], biweekly: ["كل أسبوعين", "Biweekly"], monthly: ["شهريًا", "Monthly"], custom: ["فترة مخصصة", "Custom"] } as const)[frequency][language === "ar" ? 0 : 1];
}

export function maintenanceTaskStatusLabel(status: MaintenanceTaskStatus, language: "ar" | "en") {
  return ({ scheduled: ["مجدولة", "Scheduled"], in_progress: ["قيد التنفيذ", "In progress"], completed: ["مكتملة", "Completed"], cancelled: ["ملغاة", "Cancelled"] } as const)[status][language === "ar" ? 0 : 1];
}

export function assetConditionLabel(condition: AssetCondition, language: "ar" | "en") {
  return ({ excellent: ["بحالة ممتازة", "Excellent"], good: ["بحالة جيدة", "Good"], needs_service: ["بحاجة لصيانة", "Needs service"] } as const)[condition][language === "ar" ? 0 : 1];
}

export const MAINTENANCE_FREQUENCIES: { id: MaintenanceFrequency; label: [string, string] }[] = [
  { id: "once", label: ["اليوم فقط (مرة واحدة)", "Today only (one-time)"] },
  { id: "daily", label: ["يوميًا", "Daily"] },
  { id: "weekly", label: ["أسبوعيًا", "Weekly"] },
  { id: "biweekly", label: ["كل أسبوعين", "Biweekly"] },
  { id: "monthly", label: ["شهريًا", "Monthly"] },
  { id: "custom", label: ["فترة مخصصة", "Custom"] },
];