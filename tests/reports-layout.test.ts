import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/(tabs)/reports.tsx"), "utf8");
const exportSource = readFileSync(resolve(process.cwd(), "lib/report-export.ts"), "utf8");

describe("financial reports layout", () => {
  it("uses contextual financial colors and keeps the deposit details together", () => {
    expect(source).toContain('collected: "#10B981"');
    expect(source).toContain('pending: "#F59E0B"');
    expect(source).toContain('deposit: "#06B6D4"');
    expect(source).toContain("<GlassSection style={styles.deposit}");
  });

  it("includes payment methods, all-chalet comparison, and export action", () => {
    expect(source).toContain("REPORT_PAYMENT_METHODS.map");
    expect(source).toContain("!selectedChaletId ? <GlassSection style={styles.section}");
    expect(source).toContain("exportFinancialReportPdf");
    expect(exportSource).toContain("Print.printToFileAsync");
    expect(exportSource).toContain("Sharing.shareAsync");
    expect(exportSource).toContain('throw new Error("report-popup-blocked")');
    expect(exportSource).toContain('throw new Error("report-sharing-unavailable")');
    expect(source).toContain('code === "report-popup-blocked"');
    expect(source).toContain("اسمح بالنوافذ المنبثقة");
  });

  it("uses fixed metric cells so Android renders every report metric inside the two-column grid", () => {
    expect(source).toContain("<View collapsable={false} style={styles.metricCell}>");
    expect(source).toContain('metricCell: { flexBasis: "48%", maxWidth: "48%"');
    expect(source).toContain('content: { padding: 16, paddingBottom: 36 }');
  });
});
