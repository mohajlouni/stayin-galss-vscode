import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(resolve(process.cwd(), "app/expenses.tsx"), "utf8");
const audit = readFileSync(resolve(process.cwd(), "app/audit-log.tsx"), "utf8");

describe("expenses master polish", () => {
  it("requires a free-text classification when the category is 'أخرى' and merges it into the note", () => {
    expect(screen).toContain('registerField("otherCategory")');
    expect(screen).toContain("اكتب نوع وتصنيف هذا المصروف...");
    expect(screen).toContain("يرجى وصف نوع التصنيف (3 أحرف على الأقل)");
    expect(screen).toContain("otherCategoryNote.trim().length < 3");
    expect(screen).toContain("اكتب نوع وتصنيف هذا المصروف (3 أحرف على الأقل).");
    expect(screen).toMatch(/category === "other" && otherCategoryNote\.trim\(\)/);
  });

  it("enforces a 3-character description and offers saving a recurring template", () => {
    expect(screen).toContain("if (note.trim().length < 3) {");
    expect(screen).toContain("أدخل بيانًا إلزاميًا للمصروف (3 أحرف على الأقل).");
    expect(screen).toContain("يرجى كتابة بيان المصروف (3 أحرف على الأقل)");
    expect(screen).toContain("حفظ كبند متكرر");
    expect(screen).toContain("أو اختر بندًا محفوظًا:");
    expect(screen).toContain("applyTemplate");
    expect(screen).toContain("stayin.expenses.templates.v1");
  });

  it("replaces the native date drawer with the interactive calendar grid", () => {
    expect(screen).toContain("<CalendarDatePicker visible={datePickerOpen}");
    expect(screen).toContain('onSelect={(date) => { setExpenseDate(date); setDatePickerOpen(false); }}');
    expect(screen).not.toContain("from \"@react-native-community/datetimepicker\"");
    expect(screen).not.toContain("inlineDatePicker");
    expect(screen).not.toContain("donePicker");
  });

  it("adds universal smart search with a result chip and a clear control", () => {
    expect(screen).toContain('import { normalizeArabic } from "@/components/ui/HighlightedText";');
    expect(screen).toContain("function expenseSearchText");
    expect(screen).toContain("بحث ذكي شامل");
    expect(screen).toContain('عرض (${visibleExpenses.length}) نتائج مطابقة لـ');
    expect(screen).toContain("مسح البحث");
  });

  it("extends the period bar to include the last 7 days and all records with stepping", () => {
    expect(screen).toContain('type ExpensePeriod = "today" | "7" | "month" | "custom" | "all";');
    expect(screen).toContain("const [weekAnchor, setWeekAnchor] = useState(todayISO());");
    expect(screen).toContain("addDays(weekAnchor, -6)");
    expect(screen).toContain("setWeekAnchor(todayISO());");
    expect(screen).toContain("خلال 7 أيام");
    expect(screen).toContain('active={period === "all"}');
    expect(screen).toContain("nudgeStrip(-1)");
    expect(screen).toContain('{period === "custom"');
  });

  it("links the header to the pre-filtered audit log and the reports view", () => {
    expect(screen).toContain('router.push("/audit-log?action=expense-added")');
    expect(screen).toContain('router.push("/reports")');
    expect(screen).toContain("سجل الحركات");
    expect(screen).toContain("تقارير المصروفات");
  });

  it("pre-filters the audit log from the deep-linked action parameter", () => {
    expect(audit).toContain('import { useLocalSearchParams } from "expo-router";');
    expect(audit).toContain("initialFilter");
  });
});