import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const source = read("app/maintenance-dashboard.tsx");

describe("maintenance mobile UI/UX sync", () => {
  it("renders the toolbar dropdowns fully solid so no background ghosts bleed through", () => {
    expect(source).toContain("backgroundColor: colors.background, width: 220, elevation: 18");
    expect(source).toContain('shadowColor: "#000000"');
    expect(source).toContain("shadowOpacity: 0.35");
    const solid = source.match(/backgroundColor: colors\.background, width: 220, elevation: 18/g) ?? [];
    expect(solid.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the pinned translucent popover object intact while overriding via a third style element", () => {
    const pinned = source.match(/styles\.toolbarMenu, \{ backgroundColor: colors\.surfaceMuted, borderColor: colors\.border, left: isRTL \? 0 : undefined, right: isRTL \? undefined : 0 \}/g) ?? [];
    expect(pinned.length).toBeGreaterThanOrEqual(2);
    const order = (needle: string) => source.indexOf(needle);
    expect(order("styles.toolbarMenu, { backgroundColor: colors.surfaceMuted, borderColor: colors.border")).toBeLessThan(order("backgroundColor: colors.background, width: 220, elevation: 18"));
  });

  it("bounds each dropdown inside the screen by flipping the open side from the anchor's measured center", () => {
    expect(source).toContain('onLayout={measureMenuSide("unit")}');
    expect(source).toContain('onLayout={measureMenuSide("cadence")}');
    expect(source).toContain("menuSides.unit === \"left\" ? 0 : undefined, right: menuSides.unit === \"left\" ? undefined : 0");
    expect(source).toContain("menuSides.cadence === \"left\" ? 0 : undefined, right: menuSides.cadence === \"left\" ? undefined : 0");
    expect(source).toContain("winWidth");
    expect(source).toContain("Dimensions.get(\"window\").width");
    expect(source).toContain("left + width / 2 < winWidth / 2 ? \"left\" : \"right\"");
  });

  it("auto-centers the active day chip on tap, Today nav and overdue jumps", () => {
    expect(source).toContain("const centerRollerOnDate = useCallback(");
    expect(source).toContain("index * ROLLER_PILL_STEP - 3 * ROLLER_PILL_STEP");
    expect(source).toContain("(timelineDates.length - 7) * ROLLER_PILL_STEP");
    expect(source).toContain("anchorDate, timelineDates");
    expect(source).toMatch(/centerRollerOnDate\(dateFilter\);[\s\S]*?horizon === "today"\) centerRollerOnDate\(todayISO\)/);
  });

  it("keeps a single clear control (inside the feedback chip, not duplicated in the input)", () => {
    const clears = source.match(/onPress=\{\(\) => setSearchQuery\(""\)\}/g) ?? [];
    expect(clears.length).toBe(1);
    expect(source).toContain('onPress={() => setSearchQuery("")}');
    expect(source).toContain("styles.searchWrap");
    const searchWrap = source.slice(source.indexOf("styles.searchWrap"), source.indexOf("</View>", source.indexOf("styles.searchWrap")));
    expect(searchWrap).toContain('name="search"');
    expect(searchWrap).not.toContain('name="close"');
    expect(source).toContain('name="close"');
  });

  it("moves the feedback + zero-hit chips onto their own line below the filter toolbar", () => {
    expect(source.lastIndexOf("styles.feedbackChip")).toBeGreaterThan(source.indexOf("قائمة دورية الصيانة"));
    expect(source.indexOf("styles.zeroHitShortcut")).toBeGreaterThan(source.indexOf("قائمة دورية الصيانة"));
  });

  it("pluralizes the search summary without braces inside the labels", () => {
    expect(source).toContain("نتيجة مطابقة");
    expect(source).toContain("نتائج مطابقة");
    expect(source).toContain("visibleAssets.length === 1");
    expect(source).toContain("visibleTasks.length === 1");
    expect(source).toContain("matching task");
    expect(source).toContain('"${searchQuery.trim()}"`}');
  });
});