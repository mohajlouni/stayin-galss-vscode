import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const dashboard = () => read("app/maintenance-dashboard.tsx");
const picker = () => read("components/calendar-date-picker.tsx");
const highlight = () => read("components/ui/HighlightedText.tsx");

describe("maintenance universal smart search with amber underline highlight", () => {
  it("uses the comprehensive smart-search placeholder and accessibility label", () => {
    const source = dashboard();
    expect(source).toContain("بحث ذكي شامل (المهمة، الأصل، المنفذ، الشاليه، التكلفة، الملاحظات، التاريخ...)");
    expect(source).toContain('accessibilityLabel="بحث ذكي شامل"');
  });

  it("matches every task attribute through taskSearchText", () => {
    const source = dashboard();
    expect(source).toContain("const taskSearchText = (task: MaintenanceTask, language");
    expect(source).toContain("task.assetName");
    expect(source).toContain("task.performedByName");
    expect(source).toContain("task.assignedToStaffName");
    expect(source).toContain("task.chaletName");
    expect(source).toContain("task.nextDueDate");
    expect(source).toContain("task.note");
    expect(source).toContain("task.completionNotes");
    expect(source).toContain('`${task.actualCost} د.أ JOD`');
    expect(source).toContain("maintenancePerformerRoleLabel(task.performedByRole, language)");
    expect(source).toContain('"مكتملة" : "Completed"');
    expect(source).toContain("expenseFundingEntityLabel(task.expenseFundingEntity, language)");
    expect(source).toContain("expenseFundingChannelLabel(task.expenseFundingChannel, language)");
    expect(source).toContain("expenseFundingModeLabel(task.expenseFundingMode, language)");
    expect(source).toContain("maintenanceAttribution(task, language)?.label");
    expect(source).toContain("assetSearchText(asset, language)");
  });

  it("redirects the task and asset filters through the search helpers with language in deps", () => {
    const source = dashboard();
    expect(source).toContain("taskSearchText(task, language).includes(query)");
    expect(source).toContain("assetSearchText(asset, language).includes(query)");
    expect(source).toContain(", searchQuery, unitFilter, language]");
  });

  it("renders matched text segments with a subtle bold + amber underline (no yellow box)", () => {
    const source = highlight();
    expect(source).toContain("export function highlightSegments(text: string, query: string)");
    expect(source).not.toContain("backgroundColor: \"#FBBF24\"");
    expect(source).not.toContain("color: \"#0F172A\"");
    expect(source).toContain('textDecorationLine: "underline"');
    expect(source).toContain('textDecorationColor: "#F59E0B"');
    expect(source).toContain('fontWeight: "700"');
    const cards = dashboard();
    expect(cards).toContain("<HighlightedText text={task.title}");
    expect(cards).toContain("<HighlightedText text={unitLabel}");
    expect(cards).toContain('text={`${language === "ar" ? "التكلفة" : "Cost"}: ${task.actualCost');
    expect(cards).toContain("<HighlightedText text={attribution.label}");
    expect(cards).toContain("<HighlightedText text={asset.name}");
  });

  it("normalizes Arabic searches (tashkeel, alef, alef-maqsura) end to end", () => {
    const source = highlight();
    expect(source).toContain("export function normalizeArabic(input: string): string");
    expect(source).toContain("replace(/[أإآ]/g, \"ا\")");
    expect(source).toContain("replace(/ى/g, \"ي\")");
    expect(source).toContain("ARABIC_DIACRITICS_RE");
    const cards = dashboard();
    expect(source).toContain("normalizeWithMap");
    expect(cards).toContain("normalizeArabic(searchQuery)");
    expect(cards).toContain("query={searchQuery}");
  });

  it("shows a search feedback chip with the live result count and a clear button", () => {
    const source = dashboard();
    expect(source).toContain('"نتيجة مطابقة"');
    expect(source).toContain('"مسح البحث"');
    expect(source).toContain('onPress={() => setSearchQuery("")');
    expect(source).toContain("styles.feedbackChip");
  });
});

describe("month selector grid in the calendar picker", () => {
  it("ships the Arabic month names in order", () => {
    const source = picker();
    expect(source).toMatch(/MONTHS_AR = \["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"\]/);
  });

  it("cycles days -> month -> year via a single pickerMode state while keeping the yearMode pin", () => {
    const source = picker();
    expect(source).toContain('const [pickerMode, setPickerMode] = useState<"days" | "month" | "year">("days");');
    expect(source).toContain('const yearMode = pickerMode === "year";');
    expect(source).toContain('const monthMode = pickerMode === "month";');
    expect(source).toContain('"فتح اختيار الشهر"');
  });

  it("navigates with chevrons per-mode, a chooseMonth handler, and a month grid", () => {
    const source = picker();
    expect(source).toContain('if (pickerMode === "year") {');
    expect(source).toContain('setCursor((current) => ({ ...current, year: current.year + direction * 12 }))');
    expect(source).toContain("const chooseMonth = (month: number) =>");
    expect(source).toContain("<View style={styles.monthGrid}>");
    expect(source).toContain('"شهر" : "Month"} ${month}');
  });

  it("still exposes the pinned year-mode subtitle and month chevron labels", () => {
    const source = picker();
    expect(source).toContain("اختر السنة ثم عد لاختيار الشهر واليوم.");
    expect(source).toContain('(isRTL ? "الشهر التالي" : "الشهر السابق")');
    expect(source).toContain('(isRTL ? "الشهر السابق" : "الشهر التالي")');
  });
});

describe("custom range removed: the strip is a fixed 14-day window", () => {
  it("removes the custom range modal, its draft state and the amber custom-range band", () => {
    const source = dashboard();
    expect(source).not.toContain("rangeDraft");
    expect(source).not.toContain("setRangeDraft");
    expect(source).not.toContain("rollerRange.kind");
    expect(source).not.toContain("isCustomEdge");
    expect(source).not.toContain('"من تاريخ"');
    expect(source).not.toContain('"إلى تاريخ"');
    expect(source).not.toContain("openRangePanel");
    expect(source).not.toContain("applyCustomRange");
  });

  it("anchors the window exactly 2 days back from the anchor date for a fixed 14-day span", () => {
    const source = dashboard();
    expect(source).toContain("const startDate = new Date(`${anchorDate}T12:00:00`);");
    expect(source).toContain("startDate.setDate(startDate.getDate() - 2);");
    expect(source).toContain("while (out.length < 14)");
  });
});

describe("interactive strip chevrons", () => {
  it("keeps the pinned nudgeRoller calls while becoming reliably tappable", () => {
    const source = dashboard();
    expect(source).toContain("event?.stopPropagation?.(); nudgeRoller(1);");
    expect(source).toContain("event?.stopPropagation?.(); nudgeRoller(-1);");
    expect(source).toContain("pointerEvents=\"auto\"");
    expect(source).toContain("zIndex: 30");
    expect(source).toContain('{...mouseClick(() => nudgeRoller(1))}');
    expect(source).toContain('cursor: "pointer", userSelect: "none"');
  });
});

describe("roller anchor stepping (week chevrons move the strip)", () => {
  it("drives the chevrons through a real anchorDate state stepping exactly 7 days", () => {
    const source = dashboard();
    expect(source).toContain("const [anchorDate, setAnchorDate] = useState(");
    expect(source).toContain("setAnchorDate((current) => addDays(current, direction * 7));");
    expect(source).not.toContain("const subDays");
    expect(source).toContain("عرض النتائج في (الكل)");
  });
});

describe("overdue KPI sequential walk", () => {
  it("jumps to the oldest overdue task and shows the walk helper with next-button", () => {
    const source = dashboard();
    expect(source).toContain("const overdueTasks = useMemo(() => activeTasks");
    expect(source).toContain("const goToOverdue = (index: number) => {");
    expect(source).toContain("setAnchorDate(task.nextDueDate);");
    expect(source).toContain("عرض المهام المتأخرة: مهمة (");
    expect(source).toContain("الانتقال للتالية");
    expect(source).toContain('{...mouseClick(nextOverdue)}');
    expect(source).toContain("overdueIndex >= 0 && task.nextDueDate === dateFilter");
  });

  it("resets the timeline with the inline close, including the overdue walk state", () => {
    const source = dashboard();
    expect(source).toContain("const resetTimeline = () => {");
    expect(source).toContain("setOverdueIndex(-1);");
    expect(source).toContain("setDateFilter(null);");
    expect(source).toContain("setAnchorDate(todayISO);");
  });
});

describe("single-selected date chip in brand amber", () => {
  it("fills the picked day solid amber with white text over the dark slate base", () => {
    const source = dashboard();
    expect(source).toContain('singleSelected ? { backgroundColor: "#EA580C", borderColor: "#EA580C" }');
    expect(source).toContain('color: singleSelected ? "#FFFFFF"');
    expect(source).toContain('fontWeight: singleSelected || isToday ? "900"');
  });
});

describe("strip stays a fixed full-window (no truncation)", () => {
  it("always spans the same 14-day window anchored to the anchor date regardless of any filter", () => {
    const source = dashboard();
    expect(source).toContain("const startDate = new Date(`${anchorDate}T12:00:00`);");
    expect(source).not.toContain("const defaultEnd = addDays(todayISO, 59);");
    expect(source).not.toContain("buildDateRange");
    expect(source).not.toContain("padStart");
  });
});

describe("the calendar single-day selection matches the amber day strip", () => {
  it("uses solid amber for the selected day instead of the app primary colour", () => {
    const source = picker();
    expect(source).toContain('isSelected ? "#EA580C" : isToday');
    expect(source).toContain('isSelected ? "#FFFFFF" : isToday');
    expect(source).toContain('isSelected ? "#FFFFFF" : "#EA580C"');
  });
});