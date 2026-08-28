import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const detailSource = readSource("app/booking-detail.tsx");
const auditSource = readSource("app/audit-log.tsx");

describe("activity log rendering safeguards", () => {
  it("limits the booking-detail timeline to progressive groups of six", () => {
    expect(detailSource).toContain("const [visibleCount, setVisibleCount] = useState(6)");
    expect(detailSource).toContain("const matchingEntries = useMemo(() => {");
    expect(detailSource).toContain("const visibleEntries = matchingEntries.slice(0, visibleCount)");
    expect(detailSource).toContain("Math.min(count + 6, matchingEntries.length)");
  });

  it("keeps booking-detail scrolling non-clipped and responsive to taps", () => {
    expect(detailSource).toContain('removeClippedSubviews={false} keyboardShouldPersistTaps="handled"');
    expect(detailSource).toContain("useFocusEffect(useCallback(() => {");
  });

  it("renders the global audit log in bounded virtualized batches", () => {
    expect(auditSource).toContain("initialNumToRender={6}");
    expect(auditSource).toContain("maxToRenderPerBatch={5}");
    expect(auditSource).toContain("windowSize={5}");
    expect(auditSource).toContain("removeClippedSubviews={false}");
  });
});
