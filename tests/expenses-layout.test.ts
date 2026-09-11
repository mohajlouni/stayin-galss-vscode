import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(resolve(process.cwd(), "app/expenses.tsx"), "utf8");
const reports = readFileSync(resolve(process.cwd(), "app/(tabs)/reports.tsx"), "utf8");

describe("expenses management", () => {
  it("opens a full expense form with general scope and required financial fields", () => {
    expect(screen).toContain("إضافة مصروف");
    expect(screen).toContain("كافة الشاليهات / مصروف عام");
    expect(screen).toContain("رواتب ومكافآت");
    expect(screen).toContain("كهرباء ومياه");
    expect(screen).toContain("تحويل CliQ");
    expect(screen).toContain("البيان / ملاحظات المصروف");
    expect(screen).toContain("المبلغ (د.أ)");
    expect(screen).toContain("اختر نطاق المصروف");
  });

  it("supports camera and library receipt attachments with a preview and confirms destructive deletion", () => {
    expect(screen).toContain("launchCameraAsync");
    expect(screen).toContain("launchImageLibraryAsync");
    expect(screen).toContain("إرفاق الفاتورة / الوصل");
    expect(screen).toContain("معاينة الفاتورة");
    expect(screen).toContain("حذف المصروف");
  });

  it("renders expense cards with scope, payment method, actor, and receipt metadata", () => {
    expect(screen).toContain("المسجل:");
    expect(screen).toContain("الفاتورة");
    expect(screen).toContain("formatRecordedAt");
  });

  it("uses right-to-left choice rows and checkmarks for explicit scope, category, and payment selections", () => {
    expect(screen).toContain("rtlChoiceRow");
    expect(screen).toContain("alignSelf: \"flex-end\"");
    expect(screen).toContain('name="check-circle"');
    expect(screen).toContain('accessibilityRole="checkbox"');
    expect(screen).toContain('useState<"cash" | "click" | null>(null)');
    expect(screen).toContain("اختر طريقة الصرف");
    expect(screen).toContain("حدد كاش أو تحويل CliQ قبل حفظ المصروف");
  });

  it("links the reports screen to expenses and net profit", () => {
    expect(reports).toContain("إدارة المصروفات والربح الصافي");
    expect(reports).toContain("الربح الصافي");
  });

  it("offers the cascading funding source selector with treasury, float, and staff-pocket modes", () => {
    expect(screen).toContain("مصدر التمويل");
    expect(screen).toContain("الخزينة المركزية للمالك");
    expect(screen).toContain("عهدة موظف / حارس ميداني");
    expect(screen).toContain("نقد من صندوق الخزينة");
    expect(screen).toContain("حوالة بنكية IBAN");
    expect(screen).toContain("من العُهدة النقدية المعلقة");
    expect(screen).toContain("دفع من الجيب الخاص للموظف");
    expect(screen).toContain("تاريخ الصرف");
  });

  it("renders entity and funding-mode badges plus monthly treasury and float counters", () => {
    expect(screen).toContain("خزينة رئيسية");
    expect(screen).toContain("خصم من عهدة");
    expect(screen).toContain("ذمة للموظف");
    expect(screen).toContain("إجمالي المصروفات");
    expect(screen).toContain("من الخزينة المركزية");
    expect(screen).toContain("من عُهد الموظفين");
  });
});
