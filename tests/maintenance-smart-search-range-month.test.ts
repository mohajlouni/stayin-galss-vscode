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

describe("custom range: no forced +1 month, amber pill, amber strip band", () => {
  it("opens the range panel with an empty end date instead of a forced future month", () => {
    const source = dashboard();
    expect(source).toContain("end: \"\"");
    expect(source).not.toContain("end: addDays(todayISO, 29)");
  });

  it("falls back to the start date when the end stays empty (single-day range)", () => {
    const source = dashboard();
    expect(source).toContain("const end = /^\\d{4}-\\d{2}-\\d{2}$/.test(rangeDraft.end) ? rangeDraft.end : start;");
  });

  it("passes the drafting range to both calendar fields in the range modal", () => {
    const source = dashboard();
    expect(source).toMatch(/CalendarDateField label=\{language === "ar" \? "من تاريخ" : "From date"}[\s\S]*?range=\{\{ start: rangeDraft.start, end: rangeDraft.end \}\}/);
    expect(source).toMatch(/CalendarDateField label=\{language === "ar" \? "إلى تاريخ" : "To date"}[\s\S]*?range=\{\{ start: rangeDraft.start, end: rangeDraft.end \}\}/);
  });

  it("highlights the active custom pill in solid amber with dark text", () => {
    const source = dashboard();
    expect(source).toContain('backgroundColor: rollerRange.kind === "custom" ? "#F59E0B" : colors.surface');
    expect(source).toContain('color={rollerRange.kind === "custom" ? "#0F172A" : colors.muted}');
    expect(source).toContain('fontWeight: rollerRange.kind === "custom" ? "900"');
  });

  it("paints the strip inside the applied range amber with solid edge days", () => {
    const source = dashboard();
    expect(source).toContain("const isCustomEdge = Boolean(customRange");
    expect(source).toContain("const isCustomInside = Boolean(customRange");
    expect(source).toContain('isCustomEdge ? { backgroundColor: "#F59E0B"');
    expect(source).toContain('isCustomInside ? { backgroundColor: "#F59E0B33"');
    expect(source).toContain('"#F59E0B4D"');
    expect(source).toContain('isCustomInside ? "#FCD34D"');
    expect(source).toContain("rollerRange.kind === \"custom\" && rollerRange.start && rollerRange.end");
  });
});

describe("interactive strip chevrons", () => {
  it("keeps the pinned nudgeRoller calls while becoming reliably tappable", () => {
    const source = dashboard();
    expect(source).toContain("event?.stopPropagation?.(); nudgeRoller(1);");
    expect(source).toContain("event?.stopPropagation?.(); nudgeRoller(-1);");
    expect(source).toContain('pointerEvents="auto"');
    expect(source).toContain("zIndex: 40");
    expect(source).toContain('cursor: "pointer", userSelect: "none"');
  });
});

describe("roller anchor stepping (week chevrons move the strip)", () => {
  it("drives the chevrons through a real anchorDate state stepping exactly 7 days", () => {
    const source = dashboard();
    expect(source).toContain("const [anchorDate, setAnchorDate] = useState(");
    expect(source).toContain("setAnchorDate((prev) => (weeks > 0 ? addDays(prev, 7) : subDays(prev, 7)));");
    expect(source).toContain("const subDays = (date: string, amount: number) => addDays(date, -amount);");
    expect(source).toContain("عرض النتائج في (الكل)");
  });

  it("re-anchors the strip when applying a custom range so the window sits around it", () => {
    const source = dashboard();
    expect(source).toContain("if (start) setAnchorDate(start);");
  });
});

describe("single-selected date chip in brand amber", () => {
  it("paints the picked day solid amber with slate-950 text and font-black weight", () => {
    const source = dashboard();
    expect(source).toContain("const topColor = singleSelected ? \"#0F172A\" : isCustomEdge ? \"#0F172A\"");
    expect(source).toContain("singleSelected ? { backgroundColor: \"#F59E0B\", borderColor: \"#F59E0B\", borderRadius: 12 }");
    expect(source).toContain('fontWeight: singleSelected ? "900"');
  });
});

describe("strip stays full-window around a custom range (no truncation)", () => {
  it("always spans the default today-window and pads ±14 days around custom bounds", () => {
    const source = dashboard();
    expect(source).toContain("const preStart = addDays(todayISO, -2);");
    expect(source).toContain("const defaultEnd = addDays(todayISO, 59);");
    expect(source).toContain("const padStart = addDays(rollerRange.start, -14);");
    expect(source).toContain("const padEnd = addDays(rollerRange.end, 14);");
    expect(source).toContain("return buildDateRange(start, end, 160);");
  });
});

describe("the calendar single-day selection matches the amber day strip", () => {
  it("uses solid amber for the selected day instead of the app primary colour", () => {
    const source = picker();
    expect(source).toContain('isSelected ? "#F59E0B" : isToday');
    expect(source).toContain('isSelected ? "#0F172A" : isToday');
    expect(source).toContain('isSelected ? "#0F172A" : colors.primary');
  });
});