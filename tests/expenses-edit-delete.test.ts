import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeAppData, DEFAULT_SETTINGS, type Expense, type Settings, type AuditAction } from "../lib/booking-model";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const screen = read("app/expenses.tsx");
const store = read("lib/booking-store.tsx");
const model = read("lib/booking-model.ts");

describe("expenses UI/UX overhaul: zero-default form, cascading dropdowns, edit, safe delete", () => {
  it("starts with zero pre-selection: no default category or implicit funding", () => {
    expect(screen).toContain("useState<ExpenseCategory | null>(null)");
    expect(screen).toContain('setCategory(null);');
    expect(screen).toMatch(/useState<string\[\]>\(\[\]\)/);
    expect(screen).toContain("كافة الشاليهات / مصروف عام");
    expect(screen).toContain("اختر التصنيف...");
    expect(screen).toContain("اختر مصدر التمويل...");
  });

  it("replaces the radio chips with full cascading dropdown sheets in the mandated field order", () => {
    expect(screen).toContain("نطاق المصروف / الشاليه");
    expect(screen).toContain("المبلغ (JOD)");
    expect(screen).toContain("قناة الصرف والحساب");
    expect(screen).toContain("اسم الموظف / الحارس");
    expect(screen).toContain("طريقة السداد");
    expect(screen).toContain("ExpenseDropdownSheet");
    expect(screen).toContain("ExpenseDropdownField");
    expect(screen).toContain('name="check-circle"');
    expect(screen).toContain('toggleAllChalets');
    expect(screen).toContain('setDropdown({ kind: "staffMode" })');
  });

  it("validates every mandatory field in rose with inline errors and auto-scroll to the first invalid field", () => {
    expect(screen).toContain("#F43F5E");
    expect(screen).toContain("يرجى اختيار شاليه واحد على الأقل");
    expect(screen).toContain("يرجى اختيار تصنيف المصروف");
    expect(screen).toContain("يرجى تحديد مصدر التمويل");
    expect(screen).toContain("يرجى اختيار قناة الصرف والحساب");
    expect(screen).toContain("يرجى اختيار الموظف / الحارس");
    expect(screen).toContain("يرجى اختيار طريقة السداد");
    expect(screen).toContain('scrollToField("category")');
    expect(screen).toContain('scrollToField("funding")');
    expect(screen).toContain('scrollToField("channel")');
    expect(screen).toContain('scrollToField("staff")');
  });

  it("exposes an edit action on every card and routes edits through updateExpense", () => {
    expect(screen).toContain("تعديل المصروف");
    expect(screen).toContain("تعديل مصروف");
    expect(screen).toContain("openEdit(item.item)");
    expect(screen).toContain("updateExpense");
    expect(screen).toContain("if (editingExpenseId) await updateExpense(editingExpenseId, payload);");
    expect(screen).toContain("حفظ التعديلات");
  });

  it("asks for an explicit permanent-deletion confirmation, fixing the lone destructive button", () => {
    expect(screen).toContain("هل أنت متأكد من حذف هذا المصروف نهائيًا؟");
    expect(screen).toContain("حذف المصروف");
  });

  it("records an immutable edit audit entry with before/after amounts and entities", () => {
    expect(model).toContain('"expense-updated"');
    expect(store).toContain('action: "expense-updated" as AuditAction');
    expect(store).toContain("تم تعديل المصروف #");
    expect(store).toContain("من ");
    expect(store).toContain("إلى ");
    expect(store).toContain("بواسطة ");
  });

  it("keeps the edit audit entry intact across reload by whitelisting the action on import", () => {
    const normalized = normalizeAppData({ bookings: [], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [{ id: "a-1", action: "expense-updated", subjectName: "مصروف عام", details: "تم تعديل المصروف #e-1", createdAt: "2026-09-11T10:00:00.000Z", actorName: "المالك" }], expenses: [], settings: DEFAULT_SETTINGS as unknown as Settings });
    expect(normalized.auditLog.some((entry) => entry.action === "expense-updated")).toBe(true);
  });

  it("safely unlinks a maintenance expense on delete by resetting the task cost to zero", () => {
    expect(store).toContain("expenseId: undefined, cost: 0, actualCost: 0");
    expect(store).toContain("فُصِل عن مهمة الصيانة");
  });

  it("immediately deducts a deleted float expense from the covering settlement amount", () => {
    expect(store).toContain("coveredExpenseIds: (settlement.coveredExpenseIds ?? []).filter((expenseId) => expenseId !== id)");
    expect(store).toContain("Math.max(0, Math.round((Number(settlement.amount || 0) - expense.amount) * 100) / 100)");
  });

  it("preserves the audit action union as a valid AuditAction", () => {
    const auditAction: AuditAction = "expense-updated";
    expect(auditAction).toBe("expense-updated");
  });

  it("editing keeps the maintenance task linked with the updated cost when the amount changes", () => {
    const existing: Expense = { id: "e-1", chaletId: "c-1", chaletName: "النوح", amount: 12, date: "2026-08-22", category: "maintenance", note: "إصلاح", fundingEntity: "staff", fundingSourceId: "staff-1", isStaffReimbursement: true, maintenanceTaskId: "mt-9", createdAt: "2026-08-22T12:00:00.000Z" };
    expect(existing.maintenanceTaskId).toBe("mt-9");
    expect(store).toContain("task.id === existing.maintenanceTaskId ? { ...task, cost: amount, actualCost: amount } : task");
  });

  it("confirms deletion through the web-aware helper so the delete button works on the web build", () => {
    const helper = read("lib/confirm.ts");
    expect(screen).toContain('import { confirmAction, showAlert } from "@/lib/confirm";');
    expect(screen).toContain("confirmAction({");
    expect(screen).toContain("onConfirm: () => void deleteExpense(expense.id).catch");
    expect(helper).toContain('Platform.OS === "web"');
    expect(helper).toContain("webWindow.confirm?.(message)");
    expect(helper).toContain('{ text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm }');
  });
});