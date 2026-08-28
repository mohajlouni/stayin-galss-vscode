import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const detailSource = source("app/booking-detail.tsx");
const auditSource = source("app/audit-log.tsx");

describe("booking detail and action-log rendering", () => {
  it("refreshes operational time only while booking details are focused", () => {
    expect(detailSource).toContain("useFocusEffect(useCallback(() => {");
    expect(detailSource).toContain("setClock(Date.now())");
    expect(detailSource).toContain("return () => clearInterval(interval);");
  });

  it("renders the booking activity timeline in small progressive chunks", () => {
    expect(detailSource).toContain("useState(6)");
    expect(detailSource).toContain("const matchingEntries = useMemo(() => {");
    expect(detailSource).toContain("const visibleEntries = matchingEntries.slice(0, visibleCount)");
    expect(detailSource).toContain("const hiddenEntryCount = Math.max(0, matchingEntries.length - visibleEntries.length)");
    expect(detailSource).toContain("Math.min(count + 6, matchingEntries.length)");
    expect(detailSource).toContain("يتبقى ${hiddenEntryCount} حركة · عرض المزيد");
    expect(detailSource).toContain('placeholder={language === "ar" ? "ابحث في الحركات"');
    expect(detailSource).toContain('removeClippedSubviews={false} keyboardShouldPersistTaps="handled"');
  });

  it("keeps the full action log virtualized in controlled non-clipped batches", () => {
    expect(auditSource).toContain("initialNumToRender={6}");
    expect(auditSource).toContain("maxToRenderPerBatch={5}");
    expect(auditSource).toContain("windowSize={5}");
    expect(auditSource).toContain("removeClippedSubviews={false}");
  });
});
