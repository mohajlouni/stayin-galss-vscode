import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, MAINTENANCE_PAYMENT_SOURCES, maintenanceExpenseSourceLabel, maintenancePaymentSourceLabel, normalizeAppData, type Expense, type MaintenanceExpenseSource, type MaintenanceTask, type Settings } from "../lib/booking-model";
import { buildMaintenanceExpense, maintenanceExpenseNote, shouldPromptMaintenanceExpense } from "../lib/maintenance-expense";
import { maintenanceFrequencyLabel, maintenanceIntervalDays } from "../lib/maintenance";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const task = (overrides: Partial<MaintenanceTask> = {}): MaintenanceTask => ({
  id: "mt-1",
  chaletId: "ch-1",
  chaletName: "شاليه البحر",
  title: "صيانة التكييف",
  frequency: "monthly",
  nextDueDate: "2026-03-10",
  status: "scheduled",
  createdAt: "2026-03-01T08:00:00.000Z",
  ...overrides,
});

describe("expense posting prompt condition", () => {
  it("prompts when the task has a positive cost and no linked expense", () => {
    expect(shouldPromptMaintenanceExpense(task({ cost: 25 }))).toBe(true);
  });

  it("skips the prompt when there is no cost, the task is done/cancelled, or an expense is already linked", () => {
    expect(shouldPromptMaintenanceExpense(task({}))).toBe(false);
    expect(shouldPromptMaintenanceExpense(task({ cost: 0 }))).toBe(false);
    expect(shouldPromptMaintenanceExpense(task({ cost: 25, status: "completed" }))).toBe(false);
    expect(shouldPromptMaintenanceExpense(task({ cost: 25, status: "cancelled" }))).toBe(false);
    expect(shouldPromptMaintenanceExpense(task({ cost: 25, expenseId: "expense-123" }))).toBe(false);
  });
});

describe("maintenance expense builder", () => {
  it("builds an operational 'maintenance' expense from the task with the linked source", () => {
    const expense = buildMaintenanceExpense({ id: "expense-1", task: task({ cost: 25.5 }), source: "staff-float", createdByName: "أبو محمد", createdAt: "2026-03-10T09:30:00.000Z" });
    expect(expense).toMatchObject<Partial<Expense>>({
      id: "expense-1",
      chaletId: "ch-1",
      chaletName: "شاليه البحر",
      amount: 25.5,
      date: "2026-03-10",
      category: "maintenance",
      note: "إتمام صيانة: صيانة التكييف - الوحدة: شاليه البحر",
      expenseSource: "staff-float",
      createdByName: "أبو محمد",
    });
    expect(expense.paymentMethod).toBeUndefined();
  });

  it("records the performer name inside the ledger note", () => {
    expect(maintenanceExpenseNote(task(), "أبو محمد")).toBe("إتمام صيانة: صيانة التكييف - الوحدة: شاليه البحر - بواسطة: أبو محمد");
    const expense = buildMaintenanceExpense({ id: "expense-1b", task: task({ cost: 40 }), source: "owner-account", performedByName: "أبو محمد", createdAt: "2026-03-10T09:30:00.000Z" });
    expect(expense.note).toBe("إتمام صيانة: صيانة التكييف - الوحدة: شاليه البحر - بواسطة: أبو محمد");
  });

  it("prefers the actual cost over the expected cost when both exist", () => {
    const expense = buildMaintenanceExpense({ id: "expense-1c", task: task({ cost: 40, actualCost: 55 }), source: "owner-account", createdAt: "2026-03-10T09:30:00.000Z" });
    expect(expense.amount).toBe(55);
    const expenseByAmount = buildMaintenanceExpense({ id: "expense-1d", task: task({ cost: 40, actualCost: 55 }), source: "owner-account", amount: 30, createdAt: "2026-03-10T09:30:00.000Z" });
    expect(expenseByAmount.amount).toBe(30);
  });

  it("sanitizes missing chalet info and falsy costs", () => {
    const expense = buildMaintenanceExpense({ id: "expense-2", task: task({ chaletId: "", chaletName: undefined, cost: 0 }), source: "guard-custody", createdAt: "2026-03-11T12:00:00.000Z" });
    expect(expense.chaletId).toBeUndefined();
    expect(expense.chaletName).toBeUndefined();
    expect(expense.amount).toBe(0);
  });
});

describe("biweekly recurrence", () => {
  it("advances on a 14-day interval and labels it 'كل أسبوعين'", () => {
    expect(maintenanceIntervalDays({ frequency: "biweekly" })).toBe(14);
    expect(maintenanceFrequencyLabel("biweekly", "ar")).toBe("كل أسبوعين");
    expect(maintenanceFrequencyLabel("biweekly", "en")).toBe("Biweekly");
  });
});

describe("data model normalization", () => {
  it("preserves expenseId and biweekly recurrence on tasks and expenseSource on expenses", () => {
    const data = normalizeAppData({
      chalets: [],
      bookings: [],
      waitlist: [],
      turnoverTasks: [],
      specialPriceRules: [],
      auditLog: [],
      settings: DEFAULT_SETTINGS as unknown as Settings,
      expenses: [{ id: "exp-1", amount: 12, date: "2026-03-10", category: "maintenance", note: "صيانة", expenseSource: "owner-account", createdAt: "2026-03-10T09:00:00.000Z" }],
      maintenanceTasks: [{ ...task({ cost: 12, expenseId: "exp-1", frequency: "biweekly" }) }],
    });
    expect(data.expenses?.[0]?.expenseSource).toBe("owner-account");
    expect(data.maintenanceTasks?.[0]?.expenseId).toBe("exp-1");
    expect(data.maintenanceTasks?.[0]?.frequency).toBe("biweekly");
  });

  it("drops invalid maintenance expense sources", () => {
    const data = normalizeAppData({ chalets: [], bookings: [], waitlist: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], settings: DEFAULT_SETTINGS as unknown as Settings, expenses: [{ id: "exp-1", amount: 12, date: "2026-03-10", category: "maintenance", expenseSource: "vendor-account" as MaintenanceExpenseSource, createdAt: "2026-03-10T09:00:00.000Z" }] });
    expect(data.expenses?.[0]?.expenseSource).toBeUndefined();
  });
});

describe("STEP 3 & 4 UI wiring sanity", () => {
  const source = read("app/maintenance-dashboard.tsx");
  const store = read("lib/booking-store.tsx");

  it("renders the completion-and-close modal with performer, cost, and payment source", () => {
    expect(source).toContain("إتمام وإغلاق مهمة الصيانة");
    expect(source).toContain("منفّذ المهمة");
    expect(source).toContain("التكلفة الفعلية");
    expect(source).toContain("مصدر الدفع");
    expect(source).toContain("تأكيد الإتمام والترحيل");
  });

  it("defaults the auto-post checkbox and writes it as an active ledger option", () => {
    expect(source).toContain("ترحيل تلقائي إلى سجل المصروفات تحت بند (صيانة وتشغيل)");
    expect(source).toContain("postExpense: true");
  });

  it("labels the three payment sources in Arabic and English", () => {
    expect(maintenanceExpenseSourceLabel("guard-custody", "ar")).toBe("عهدة الحارس");
    expect(maintenanceExpenseSourceLabel("staff-float", "ar")).toBe("عهدة الموظف");
    expect(maintenanceExpenseSourceLabel("owner-account", "ar")).toBe("حساب المالك");
    expect(maintenanceExpenseSourceLabel("guard-custody", "en")).toBe("Guard custody");
    expect(maintenancePaymentSourceLabel("staff_custody", "ar")).toBe("عهدة الموظف");
    expect(maintenancePaymentSourceLabel("owner_account", "ar")).toBe("حساب المنشأة / المالك (CliQ / كاش / بنك)");
    expect(maintenancePaymentSourceLabel("guard_custody", "en")).toBe("Guard custody");
    expect(MAINTENANCE_PAYMENT_SOURCES).toEqual(["owner_account", "staff_custody", "guard_custody"]);
  });

  it("wires the expense decision and the maintenance audit trail into the store", () => {
    expect(store).toContain("expenseSourceForPaymentSource");
    expect(store).toContain("buildMaintenanceExpense");
    expect(store).toContain("expense-added");
    expect(store).toContain("expenseId");
    expect(store).toContain("maintenanceAuditLog");
    expect(store).toContain("expense_posted");
    expect(store).toContain("startMaintenanceTask");
    expect(store).toContain("cancelMaintenanceTask");
    expect(store).toContain("completeMaintenanceTaskWithExpense");
  });

  it("renders the status lifecycle pills and per-task actions", () => {
    expect(source).toContain("مجدولة");
    expect(source).toContain("قيد التنفيذ");
    expect(source).toContain("مكتملة ومُرحّلة");
    expect(source).toContain("ملغاة");
    expect(source).toContain("بدء العمل");
    expect(source).toContain("إتمام وإغلاق");
    expect(source).toContain("إلغاء المهمة");
  });

  it("renders the quick preset chips for chalet operations", () => {
    expect(source).toContain("قوالب سريعة");
    expect(source).toContain("كلورة وفلترة المسبح");
    expect(source).toContain("تنظيف فلاتر المكيفات");
    expect(source).toContain("صيانة وقص الحديقة");
    expect(source).toContain("فحص المضخات والبويلر");
  });

  it("marks completed tasks with a posted expense and the executor on the card", () => {
    expect(source).toContain("مُرحَّل للمصروفات");
    expect(source).toContain("#مصروف");
    expect(source).toContain("تم التنفيذ بواسطة");
    expect(source).toContain("سجل الإجراءات");
  });
});

describe("funding-aware maintenance expense builder", () => {
  it("maps owner vault-cash funding to a cash payment with no tied account", () => {
    const expense = buildMaintenanceExpense({ id: "expense-o1", task: task({ cost: 30 }), fundingEntity: "owner", fundingChannel: "vault-cash", createdAt: "2026-03-10T09:30:00.000Z" });
    expect(expense).toMatchObject({ fundingEntity: "owner", fundingChannel: "vault-cash", paymentMethod: "cash", expenseSource: "owner-account", maintenanceTaskId: "mt-1", amount: 30 });
    expect(expense.fundingSourceId).toBeUndefined();
    expect(expense.isFloatExpense).toBeUndefined();
    expect(expense.isStaffReimbursement).toBeUndefined();
  });

  it("maps owner cliq/iban funding to the matching payment method and keeps the account", () => {
    const cliq = buildMaintenanceExpense({ id: "expense-o2", task: task({ cost: 30 }), fundingEntity: "owner", fundingChannel: "cliq", fundingSourceId: "treasury-1", fundingSourceLabel: "حساب CliQ", createdAt: "2026-03-10T09:30:00.000Z" });
    expect(cliq).toMatchObject({ paymentMethod: "click", fundingSourceId: "treasury-1", fundingSourceLabel: "حساب CliQ", fundingChannel: "cliq" });
    const iban = buildMaintenanceExpense({ id: "expense-o3", task: task({ cost: 30 }), fundingEntity: "owner", fundingChannel: "iban", fundingSourceId: "treasury-2", fundingSourceLabel: "حساب بنكي", createdAt: "2026-03-10T09:30:00.000Z" });
    expect(iban).toMatchObject({ paymentMethod: "iban", fundingSourceId: "treasury-2" });
  });

  it("flags a float deduction when staff is funded from the held float", () => {
    const expense = buildMaintenanceExpense({ id: "expense-s1", task: task({ cost: 30 }), fundingEntity: "staff", fundingSourceId: "staff-1", fundingSourceLabel: "نقطة الحارس", staffMode: "float", createdByName: "أبو محمد", createdAt: "2026-03-10T09:30:00.000Z" });
    expect(expense).toMatchObject({ isFloatExpense: true, expenseSource: "staff-float", fundingEntity: "staff", fundingSourceId: "staff-1", fundingSourceLabel: "نقطة الحارس", maintenanceTaskId: "mt-1" });
    expect(expense.paymentMethod).toBeUndefined();
    expect(expense.fundingChannel).toBeUndefined();
    expect(expense.isStaffReimbursement).toBeUndefined();
    expect(expense.createdByName).toBe("أبو محمد");
  });

  it("flags a staff reimbursement when paid from the employee's own pocket", () => {
    const expense = buildMaintenanceExpense({ id: "expense-s2", task: task({ cost: 30 }), fundingEntity: "staff", fundingSourceId: "staff-1", fundingSourceLabel: "نقطة الحارس", staffMode: "reimbursement", createdAt: "2026-03-10T09:30:00.000Z" });
    expect(expense).toMatchObject({ isStaffReimbursement: true, expenseSource: "staff-float" });
    expect(expense.isFloatExpense).toBeUndefined();
    expect(expense.paymentMethod).toBeUndefined();
  });

  it("records a zero-cost completion without a source, payment method, or funding flags", () => {
    const expense = buildMaintenanceExpense({ id: "expense-z1", task: task({ cost: 0, actualCost: 0 }), createdAt: "2026-03-10T09:30:00.000Z" });
    expect(expense.amount).toBe(0);
    expect(expense.expenseSource).toBeUndefined();
    expect(expense.paymentMethod).toBeUndefined();
    expect(expense.fundingEntity).toBeUndefined();
    expect(expense.isFloatExpense).toBeUndefined();
    expect(expense.isStaffReimbursement).toBeUndefined();
    expect(expense.maintenanceTaskId).toBe("mt-1");
  });
});

describe("maintenanceTaskId data persistence", () => {
  it("normalization keeps the linked maintenance task id", () => {
    const data = normalizeAppData({ chalets: [], bookings: [], waitlist: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], settings: DEFAULT_SETTINGS as unknown as Settings, expenses: [{ id: "exp-1", amount: 12, date: "2026-03-10", category: "maintenance", maintenanceTaskId: "mt-77", createdAt: "2026-03-10T09:00:00.000Z" }] });
    expect(data.expenses?.[0]?.maintenanceTaskId).toBe("mt-77");
  });

  it("normalization drops a non-string maintenanceTaskId", () => {
    const data = normalizeAppData({ chalets: [], bookings: [], waitlist: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], settings: DEFAULT_SETTINGS as unknown as Settings, expenses: [{ id: "exp-2", amount: 12, date: "2026-03-10", category: "maintenance", maintenanceTaskId: 123 as unknown as string, createdAt: "2026-03-10T09:00:00.000Z" }] });
    expect(data.expenses?.[0]?.maintenanceTaskId).toBeUndefined();
  });
});

describe("completion funding wiring (store + dashboard)", () => {
  const source = read("app/maintenance-dashboard.tsx");
  const store = read("lib/booking-store.tsx");
  const model = read("lib/booking-model.ts");
  const backup = read("lib/backup-import.ts");

  it("routes completed maintenance costs through createExpense with funding fields", () => {
    expect(store).toContain("createExpense(");
    expect(store).toContain("maintenance-funding-required");
    expect(store).toContain("funding?: { entity: \"owner\" | \"staff\"; channel?: ExpenseFundingChannel; sourceId?: string; sourceLabel?: string; mode?: \"float\" | \"reimbursement\" }");
    expect(store).toContain("await createExpense(buildMaintenanceExpense(");
  });

  it("persists the linked maintenance task id on the expense model and backup schema", () => {
    expect(model).toContain("maintenanceTaskId");
    expect(backup).toContain("maintenanceTaskId");
  });

  it("renders the unified funding selector with entity, channel, account, and staff mode steps", () => {
    expect(source).toContain("قناة الصرف من الخزينة");
    expect(source).toContain("الحساب المموَّل منه");
    expect(source).toContain("نقطة العهدة المخصوم منها");
    expect(source).toContain("خصم من العهدة النقدية المعلقة");
    expect(source).toContain("دفع من الجيب الخاص للموظف");
    expect(source).toContain("أكمل تحديد مصدر التمويل لتمكين الترحيل التلقائي.");
    expect(source).toContain("fundingReady(completion)");
  });

  it("replaces the three legacy payment radios with the cascade selector", () => {
    expect(source).not.toContain("maintenancePaymentSourceLabel(source, language)");
    expect(source).not.toContain("MAINTENANCE_PAYMENT_SOURCES.map");
  });
});