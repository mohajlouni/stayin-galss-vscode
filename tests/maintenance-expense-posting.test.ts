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
      note: "صيانة دورية: صيانة التكييف - الوحدة: شاليه البحر",
      expenseSource: "staff-float",
      createdByName: "أبو محمد",
    });
    expect(expense.paymentMethod).toBeUndefined();
  });

  it("records the performer name inside the ledger note", () => {
    expect(maintenanceExpenseNote(task(), "أبو محمد")).toBe("صيانة دورية: صيانة التكييف - الوحدة: شاليه البحر - بواسطة: أبو محمد");
    const expense = buildMaintenanceExpense({ id: "expense-1b", task: task({ cost: 40 }), source: "owner-account", performedByName: "أبو محمد", createdAt: "2026-03-10T09:30:00.000Z" });
    expect(expense.note).toBe("صيانة دورية: صيانة التكييف - الوحدة: شاليه البحر - بواسطة: أبو محمد");
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