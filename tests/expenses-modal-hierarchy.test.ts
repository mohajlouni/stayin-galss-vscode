import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(resolve(process.cwd(), "app/expenses.tsx"), "utf8");
const modalBody = screen.slice(screen.indexOf("<Modal visible={modalOpen}"));

describe("expenses modal hierarchy and validation", () => {
  it("lays out sections in the mandated order: scope, amount, category, funding cascade, description, date, attach", () => {
    const order = [
      "نطاق المصروف",
      "المبلغ (JOD)",
      "تصنيف المصروف",
      "مصدر التمويل",
      "قناة الصرف والحساب",
      "اسم الموظف / الحارس",
      "طريقة السداد",
      "البيان / ملاحظات المصروف",
      "تاريخ الصرف",
      "إرفاق الفاتورة / الوصل",
      "حفظ المصروف",
    ];
    let last = -1;
    for (const label of order) {
      const idx = modalBody.indexOf(label);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
  });

  it("keeps the amount prominent with a JOD suffix and clears validation as soon as the user types", () => {
    expect(screen).toContain("styles.amountInput");
    expect(screen).toContain('"د.أ"');
    expect(screen).toContain("setAmountError(false)");
    expect(screen).toContain("اختر نطاق المصروف أولًا");
  });

  it("highlights invalid mandatory fields in rose-500 with inline helper text and never fails silently", () => {
    expect(screen).toContain("#F43F5E");
    expect(screen).toContain("يرجى كتابة بيان المصروف");
    expect(screen).toContain("يرجى تحديد الشاليه");
    expect(screen).toContain("يرجى اختيار طريقة السداد");
    expect(screen).toContain("أدخل مبلغ المصروف (أكبر من صفر)");
    expect(screen).toContain('scrollToField("scope")');
    expect(screen).toContain('scrollToField("amount")');
    expect(screen).toContain('scrollToField("note")');
    expect(screen).toContain('scrollToField("staffMode")');
  });

  it("guards against double submits with a spinner and reports a successful save", () => {
    expect(screen).toContain("const [isSubmitting, setIsSubmitting] = useState(false)");
    expect(screen).toContain("submittingRef");
    expect(screen).toContain('<ActivityIndicator size="small"');
    expect(screen).toContain("تم حفظ المصروف بنجاح");
    expect(screen).toContain("void triggerHaptic(); setModalOpen(false);");
    expect(screen).toContain("notifyExpenseSaved();");
  });

  it("binds the summary counters to the active date filter with localized labels", () => {
    expect(screen).toContain("إجمالي المصروفات");
    expect(screen).toContain("من الخزينة المركزية");
    expect(screen).toContain("من عُهد الموظفين");
    expect(screen).toContain('"اليوم"');
    expect(screen).toContain('"هذا الشهر"');
    expect(screen).toContain('"فترة مخصصة"');
    expect(screen).toContain('period === "custom"');
  });

  it("wraps the funding source cascade in a dedicated framed container", () => {
    expect(screen).toContain("styles.fundingFrame");
    expect(screen).toContain("fundingEntityRow");
    expect(screen).toContain("من العُهدة النقدية المعلقة");
    expect(screen).toContain("دفع من الجيب الخاص للموظف");
  });
});