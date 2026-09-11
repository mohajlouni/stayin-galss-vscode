import { type Expense, type ExpenseFundingChannel, type ExpenseFundingEntity, type ExpensePaymentMethod, type MaintenanceExpenseSource, type MaintenanceTask } from "./booking-model";

/**
 * هل تُرحَّل تكلفة المهمة تلقائيًا عند إتمامها؟
 * الشرط: مهمة غير مكتملة وغير ملغاة، أي تكلفة > 0، ولم يُرحَّل مصروف سابق لها.
 */
export function shouldPromptMaintenanceExpense(task: MaintenanceTask): boolean {
  return task.status !== "completed" && task.status !== "cancelled" && (task.cost ?? 0) > 0 && !task.expenseId;
}

/** وصف قيد المصروف وفق القالب: إتمام صيانة: {title} - الوحدة: {unit} (بواسطة: {performer}). */
export function maintenanceExpenseNote(task: Pick<MaintenanceTask, "title" | "chaletName">, performedByName?: string) {
  const parts = [`إتمام صيانة: ${task.title.trim().slice(0, 120)}`, `الوحدة: ${task.chaletName?.trim() || "—"}`];
  if (performedByName?.trim()) parts.push(`بواسطة: ${performedByName.trim()}`);
  return parts.join(" - ").slice(0, 400);
}

/** ترجمة وضع السداد (عهدة / جيب) إلى حقول التمويل في قيد المصروف. */
export function maintenanceFundingFlags(mode: "float" | "reimbursement") {
  return mode === "float" ? { isFloatExpense: true, isStaffReimbursement: undefined } : { isFloatExpense: undefined, isStaffReimbursement: true };
}

/** بناء قيد مصروف تشغيلي من إتمام مهمة صيانة (الفئة: صيانة وتشغيل) بالتكلفة الفعلية. */
export function buildMaintenanceExpense(params: {
  id: string;
  task: MaintenanceTask;
  /** المصدر القديم للتوافق (حساب المالك / عهدة الموظف / عهدة الحارس). */
  source?: MaintenanceExpenseSource;
  createdByName?: string;
  createdAt: string;
  /** التكلفة الفعلية المدخلة عند الإتمام؛ تُرجع إلى cost المتوقعة لو لم تُحدَّد. */
  amount?: number;
  /** اسم منفّذ المهمة لإظهاره داخل وصف القيد. */
  performedByName?: string;
  /** جهة التمويل: الخزينة المركزية للمالك أو عهدة موظف / حارس ميداني. */
  fundingEntity?: ExpenseFundingEntity;
  /** قناة الصرف عند تمويل المالك (كاش الخزينة / CliQ / IBAN). */
  fundingChannel?: ExpenseFundingChannel;
  /** الحساب المموَّل منه (حساب مالك مفعّل أو نقطة عهدة موظف). */
  fundingSourceId?: string;
  /** اسم ملتقط للمصدر ليستقر في التقارير. */
  fundingSourceLabel?: string;
  /** خصم من العهدة النقدية المعلقة أو دفع من جيب الموظف. */
  staffMode?: "float" | "reimbursement";
}): Expense {
  const amount = Number.isFinite(Number(params.amount)) && Number(params.amount) >= 0 ? Number(params.amount) : Number(params.task.actualCost);
  const entity = params.fundingEntity;
  const mode = params.staffMode;
  const source: MaintenanceExpenseSource | undefined = params.source ?? (entity === "owner" ? "owner-account" : entity === "staff" ? "staff-float" : undefined);
  const paymentMethod: ExpensePaymentMethod | undefined = entity !== "staff" ? (params.fundingChannel === "vault-cash" ? "cash" : params.fundingChannel === "cliq" ? "click" : params.fundingChannel === "iban" ? "iban" : undefined) : undefined;
  const flags = mode === "float" || mode === "reimbursement" ? maintenanceFundingFlags(mode) : { isFloatExpense: undefined, isStaffReimbursement: undefined };
  return {
    id: params.id,
    chaletId: params.task.chaletId?.trim() || undefined,
    chaletName: params.task.chaletName?.trim() || undefined,
    amount: Math.max(0, Math.round((amount > 0 ? amount : Number(params.task.cost || 0)) * 100) / 100),
    date: params.createdAt.slice(0, 10),
    category: "maintenance",
    note: maintenanceExpenseNote(params.task, params.performedByName),
    paymentMethod,
    expenseSource: source,
    maintenanceTaskId: params.task.id,
    fundingEntity: entity,
    fundingChannel: entity !== "staff" ? params.fundingChannel : undefined,
    fundingSourceId: params.fundingSourceId?.trim() || undefined,
    fundingSourceLabel: params.fundingSourceLabel?.trim() || undefined,
    ...flags,
    createdAt: params.createdAt,
    createdByName: params.createdByName,
  };
}