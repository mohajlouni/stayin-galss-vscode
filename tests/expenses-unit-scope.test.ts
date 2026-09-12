import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(resolve(process.cwd(), "app/expenses.tsx"), "utf8");

describe("expenses multi-unit checkbox scope, opaque modal, and summary/badge polish", () => {
  it("replaces the single-select scope dropdown with per-unit checkbox rows plus an all-chalets master row", () => {
    expect(screen).toContain("const [selectedChaletIds, setSelectedChaletIds] = useState<string[]>([])");
    expect(screen).toContain('accessibilityRole="checkbox"');
    expect(screen).toContain("accessibilityState={{ checked: allChaletsSelected }}");
    expect(screen).toContain("كافة الشاليهات / مصروف عام");
    expect(screen).toContain("toggleAllChalets");
    expect(screen).toContain("toggleChalet(chalet.id)");
    expect(screen).toContain("selectedChaletIds.includes(chalet.id)");
    expect(screen).toContain('"check-box-outline-blank"');
  });

  it("keeps the amount field editable immediately without any scope placeholder lock", () => {
    expect(screen).not.toContain("editable={Boolean(scope)}");
    expect(screen).not.toContain("اختر نطاق المصروف أولًا");
    expect(screen).toContain('placeholder={language === "ar" ? "المبلغ (د.أ)" : "Amount (JOD)"}');
    expect(screen).not.toContain("setScope(null)");
  });

  it("enforces zero-default dropdown placeholders for category, funding entity, staff, and payment mode", () => {
    expect(screen).toContain("اختر التصنيف...");
    expect(screen).toContain("اختر مصدر التمويل...");
    expect(screen).toContain("اختر الموظف / الحارس...");
    expect(screen).toContain("اختر طريقة السداد...");
  });

  it("saves single-chalet and multi-chalet expenses with correct allocation semantics", () => {
    expect(screen).toContain("const scopedChalets = chalets.filter((item) => selectedChaletIds.includes(item.id));");
    expect(screen).toContain("const chalet = scopedChalets.length === 1 ? scopedChalets[0] : undefined;");
    expect(screen).toContain("scopedChalets.length > 1 ? splitExpenseAcrossChalets(numeric, scopedChalets) : undefined");
    expect(screen).toContain("if (!selectedChaletIds.length)");
    expect(screen).toContain("يرجى اختيار شاليه واحد على الأقل");
    expect(screen).toContain("أضف وحدة واحدة على الأقل قبل تسجيل مصروف عام");
  });

  it("re-populates the selected units when editing an existing expense", () => {
    expect(screen).toContain("expense.generalAllocations.map((allocation) => allocation.chaletId)");
    expect(screen).toContain("expense.chaletId && expense.chaletId !== \"shared-expense-parent\" ? [expense.chaletId]");
    expect(screen).toContain("chalets.map((chalet) => chalet.id)");
  });

  it("renders an opaque modal backdrop and solid elevated sheets", () => {
    expect(screen).toContain('backgroundColor: "rgba(2,6,23,0.92)"');
    expect(screen).toContain("shadowRadius: 32");
    expect(screen).toContain("elevation: 50");
    expect(screen).toContain("shadowOffset: { width: 0, height: -8 }");
  });

  it("shows the three primary financial metrics in a balanced grid without a duplicate total card", () => {
    expect(screen).not.toContain("إجمالي المصروفات المعروضة");
    expect(screen).toContain("styles.monthCounters");
    expect(screen).toContain("إجمالي المصروفات");
    expect(screen).toContain("من الخزينة المركزية");
    expect(screen).toContain("من عُهد الموظفين");
    expect(screen).toContain("periodTreasuryTotal");
    expect(screen).toContain("periodFloatTotal");
  });

  it("adds an optional due-to-staff reimbursement metric when out-of-pocket expenses exist", () => {
    expect(screen).toContain("const periodReimbursementTotal = visibleExpenses.filter((expense) => expense.isStaffReimbursement === true)");
    expect(screen).toContain("ذمم مستحقة لموظفين");
    expect(screen).toContain('color: "#A855F7"');
  });

  it("combines the range chip, period pills, and 14-day strip into one unified timeline", () => {
    expect(screen).toContain("styles.timelineChips");
    expect(screen).toContain("styles.timelineWrap");
    expect(screen).not.toContain("styles.navBar");
    expect(screen).not.toContain("styles.periodRow");
    expect(screen).toContain("اليوم");
    expect(screen).toContain("هذا الشهر");
    expect(screen).toContain("فترة مخصصة");
  });

  it("shows distinct funding badges: amber float, violet out-of-pocket, emerald treasury with channel", () => {
    expect(screen).toContain("خصم من عهدة · ${entityLabel}");
    expect(screen).toContain("من الجيب الخاص · ${entityLabel}");
    expect(screen).toContain("الخزينة المركزية · ");
    expect(screen).toContain('color: "#F59E0B"');
    expect(screen).toContain('color: "#10B981"');
    expect(screen).toContain('color: "#A855F7"');
    expect(screen).toContain('"تحويل CliQ"');
    expect(screen).toContain('"حوالة بنكية"');
  });

  it("confirms deletion of a linked maintenance expense with the task title and a safe unlink call", () => {
    expect(screen).toContain("maintenanceTasks.find((task) => task.id === expense.maintenanceTaskId)?.title");
    expect(screen).toContain("هذا المصروف مرتبط بمهمة صيانة مكتملة");
    expect(screen).toContain("هل تريد حذف السند المالي وتصفير تكلفة المهمة؟");
    expect(screen).toContain("deleteExpense(expense.id)");
  });
});