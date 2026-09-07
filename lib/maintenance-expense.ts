import { type Expense, type MaintenanceExpenseSource, type MaintenanceTask } from "./booking-model";

/**
 * هل تُرحَّل تكلفة المهمة تلقائيًا عند إتمامها؟
 * الشرط: مهمة غير مكتملة وغير ملغاة، أي تكلفة > 0، ولم يُرحَّل مصروف سابق لها.
 */
export function shouldPromptMaintenanceExpense(task: MaintenanceTask): boolean {
  return task.status !== "completed" && task.status !== "cancelled" && (task.cost ?? 0) > 0 && !task.expenseId;
}

/** وصف قيد المصروف وفق القالب: صيانة دورية: {title} - الوحدة: {unit} (بواسطة: {performer}). */
export function maintenanceExpenseNote(task: Pick<MaintenanceTask, "title" | "chaletName">, performedByName?: string) {
  const parts = [`صيانة دورية: ${task.title.trim().slice(0, 120)}`, `الوحدة: ${task.chaletName?.trim() || "—"}`];
  if (performedByName?.trim()) parts.push(`بواسطة: ${performedByName.trim()}`);
  return parts.join(" - ").slice(0, 400);
}

/** بناء قيد مصروف تشغيلي من إتمام مهمة صيانة (الفئة: صيانة وتشغيل) بالتكلفة الفعلية. */
export function buildMaintenanceExpense(params: {
  id: string;
  task: MaintenanceTask;
  source: MaintenanceExpenseSource;
  createdByName?: string;
  createdAt: string;
  /** التكلفة الفعلية المدخلة عند الإتمام؛ تُرجع إلى cost المتوقعة لو لم تُحدَّد. */
  amount?: number;
  /** اسم منفّذ المهمة لإظهاره داخل وصف القيد. */
  performedByName?: string;
}): Expense {
  const amount = Number.isFinite(Number(params.amount)) && Number(params.amount) >= 0 ? Number(params.amount) : Number(params.task.actualCost);
  return {
    id: params.id,
    chaletId: params.task.chaletId?.trim() || undefined,
    chaletName: params.task.chaletName?.trim() || undefined,
    amount: Math.max(0, Math.round((amount > 0 ? amount : Number(params.task.cost || 0)) * 100) / 100),
    date: params.createdAt.slice(0, 10),
    category: "maintenance",
    note: maintenanceExpenseNote(params.task, params.performedByName),
    expenseSource: params.source,
    createdAt: params.createdAt,
    createdByName: params.createdByName,
  };
}