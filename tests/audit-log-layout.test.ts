import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/audit-log.tsx"), "utf8");

describe("Audit log layout", () => {
  it("uses a compact filter trigger with explicit action and time choices", () => {
    expect(source).toContain("فلترة");
    expect(source).toContain("filterOpen");
    expect(source).toContain("styles.filterPanel");
    expect(source).toContain("styles.filterOptions");
  });

  it("renders structured cards with a colored action badge, chalet, details and footer", () => {
    expect(source).toContain("styles.actionBadge");
    expect(source).toContain("styles.chaletName");
    expect(source).toContain("styles.detailBlock");
    expect(source).toContain("styles.cardFooter");
    expect(source).toContain("بواسطة:");
    expect(source).toContain("formatAuditTimestamp");
  });

  it("formats payment updates as a right-to-left sentence without an arrow", () => {
    expect(source).toContain('تم تعديل ${paymentUpdate[1] || "دفعة الإيجار"} من ${paymentUpdate[2]} ${currency} إلى ${paymentUpdate[3]} ${currency}');
    expect(source).not.toContain("${paymentUpdate[1]} ← ${paymentUpdate[2]}");
  });

  it("provides a quick time range and expandable conversion details", () => {
    expect(source).toContain("const TIME_RANGES");
    expect(source).toContain("setTimeRange");
    expect(source).toContain("عرض التفاصيل");
    expect(source).toContain("styles.cardAccent");
  });

  it("keeps Arabic labels and their colons inside one right-to-left text flow", () => {
    expect(source).toContain("العميل: ${entry.subjectName}");
    expect(source).toContain("تحويل الحجز:");
    expect(source).not.toContain("styles.detailDot");
  });
});
