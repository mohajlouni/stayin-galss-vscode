import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("unified workspaces & properties hub", () => {
  it("consolidates the two property rows in More into a single /workspaces entry", () => {
    const more = source("app/(tabs)/more.tsx");
    expect(more).toContain('title: language === "ar" ? "إدارة المنشآت والعقارات"');
    expect(more).toContain("تبديل المنشأة النشطة، تعديل البيانات، وإدارة الوحدات التابعة");
    expect(more).toContain('route: "/workspaces" as const');
    expect(more).toContain('icon: "business" as const');
    expect(more).not.toContain('"منشآتي وإدارة المنشآت"');
    expect(more).not.toContain('"إدارة الوحدات / العقارات"');
    expect(more).not.toContain('route: "/properties-hub" as const');
    expect(more).not.toContain('route: "/chalet-management" as const');
  });

  it("renders a custom RTL header with a deterministic back action to /more", () => {
    const screen = source("app/workspaces.tsx");
    const back = source("components/screen-back-button.tsx");
    expect(screen).toContain('ScreenBackButton fallbackHref="/(tabs)/more" returnToFallback');
    expect(screen).toContain('fallbackHref="/(tabs)/more"');
    expect(screen).toContain("returnToFallback");
    expect(screen).not.toContain("SubScreenHeader");
    expect(back).toContain("if (returnToFallback) router.replace(fallbackHref)");
  });

  it("anchors the page title on the right with the subtitle and a compact header", () => {
    const screen = source("app/workspaces.tsx");
    expect(screen).toContain('language === "ar" ? "إدارة المنشآت والعقارات" : "Properties & units hub"');
    expect(screen).toContain("تعديل المنشأة النشطة، تعديل البيانات، وإدارة الوحدات التابعة مباشرة.");
    expect(screen).toContain("headerTitle: { fontSize: 18, lineHeight: 24, fontWeight: \"900\" }");
    expect(screen).toContain("header: { minHeight: 54, alignItems: \"center\", gap: 12");
  });

  it("renders the workspaces directory on top with a compact add-property action", () => {
    const screen = source("app/workspaces.tsx");
    expect(screen).toContain("المنشآت المسجلة");
    expect(screen).toContain("+ إضافة منشأة جديدة");
    expect(screen).toContain("trpc.workspace.hub.useQuery");
    expect(screen).toContain("addButton: { minHeight: 36, borderRadius: 12");
    expect(screen).toContain("wsCard: { marginTop: 9, borderWidth: 1, borderRadius: 20, padding: 16, backgroundColor: SLATE_900_50 }");
  });

  it("keeps the workspace card as a strict RTL two-pole flow with an open middle area", () => {
    const screen = source("app/workspaces.tsx");
    expect(screen).toContain('wsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }');
    expect(screen).toContain("wsIdentity: { flexGrow: 1, flexShrink: 0, minWidth: 200 }");
    expect(screen).toContain('wsHead: { flexDirection: "row", alignItems: "center", gap: 4 }');
    expect(screen).toContain("nameCol: { flex: 1, minWidth: 0, gap: 4 }");
    expect(screen).toContain("wsLeft: { flexDirection: \"row\", alignItems: \"center\", gap: 10, flexShrink: 0 }");
    expect(screen).not.toContain("wsChips");
    expect(screen).not.toContain("wsPill");
  });

  it("anchors identity physically on the far right: 44px icon box, bold name, then the id pill below the title", () => {
    const screen = source("app/workspaces.tsx");
    expect(screen).toContain('wsIcon: { width: 44, height: 44, borderRadius: 12, borderWidth: 1');
    expect(screen).toContain('wsName: { fontSize: 16, lineHeight: 22, fontWeight: "700", color: SLATE_100 }');
    expect(screen).toContain('idPill: { alignSelf: "flex-start", minHeight: 20, borderRadius: 8');
    expect(screen).toContain('MaterialIcons name="business" size={22}');
  });

  it("shows the workspace id pill with a copy action and success feedback", () => {
    const screen = source("app/workspaces.tsx");
    expect(screen).toContain("workspaceIdText(card.workspaceId)");
    expect(screen).toContain('`#${String(workspaceId).padStart(6, "0")}`');
    expect(screen).toContain("copyWorkspaceId(card.workspaceId)");
    expect(screen).toContain("Clipboard.setStringAsync");
    expect(screen).toContain("const copied = copiedId === card.workspaceId;");
    expect(screen).toContain('name={copied ? "check" : "content-copy"}');
    expect(screen).toContain('borderColor: copied ? colors.success + "99" : SLATE_700');
    expect(screen).toContain("writingDirection: \"ltr\"");
  });

  it("places a dedicated bordered units-count square on the far left beside the controls", () => {
    const screen = source("app/workspaces.tsx");
    expect(screen).toContain('countTile: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderColor: ORANGE_500_40, backgroundColor: SLATE_900, alignItems: "center", justifyContent: "center", gap: 2 }');
    expect(screen).toContain('countLabel: { color: SLATE_400, fontSize: 10, fontWeight: "500" }');
    expect(screen).toContain('countNumber: { color: SLATE_100, fontSize: 16, lineHeight: 22, fontWeight: "700", writingDirection: "ltr" }');
    expect(screen).toContain('language === "ar" ? "الوحدات" : "Units"');
    expect(screen).toContain("{card.unitCount}");
    expect(screen).toContain("ORANGE_500_40");
  });

  it("aligns the far-left controls horizontally: units count, switch button, then pen edit square", () => {
    const screen = source("app/workspaces.tsx");
    const tile = screen.indexOf("styles.countTile");
    const work = screen.indexOf("styles.workButton");
    const edit = screen.indexOf("styles.editButton");
    expect(tile).toBeGreaterThan(-1);
    expect(work).toBeGreaterThan(-1);
    expect(edit).toBeGreaterThan(-1);
    expect(edit).toBeLessThan(work);
    expect(work).toBeLessThan(tile);
    expect(screen).toContain('borderColor: isActive ? colors.primary + "99" : SLATE_800_80');
    expect(screen).toContain("shadowOpacity: 0.16");
    expect(screen).toContain("المنشأة النشطة حالياً ✓");
    expect(screen).toContain('name="check-circle" size={13} color={colors.success}');
    expect(screen).toContain('language === "ar" ? "العمل على هذه المنشأة ➔"');
    expect(screen).toContain('activityBadge: { minHeight: 32, borderRadius: 12');
    expect(screen).toContain('workButton: { minHeight: 32, borderRadius: 12, paddingHorizontal: 14');
    expect(screen).toContain('editButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: SLATE_700');
    expect(screen).toContain('MaterialIcons name="edit" size={17} color={SLATE_300}');
    expect(screen).not.toContain("wsActions");
    expect(screen).not.toContain("تعديل البيانات ✎");
    expect(screen).toContain("router.replace(\"/(tabs)\")");
    expect(screen).toContain("router.push(`/property-detail?workspaceId=${card.workspaceId}` as never)");
  });

  it("shows the units of the active workspace beneath the directory with a dynamic section header", () => {
    const screen = source("app/workspaces.tsx");
    expect(screen).toContain("const { chalets, bookings, settings, hydrated } = useBookings();");
    expect(screen).toContain("أنت تعمل الآن على: ");
    expect(screen).toContain("وحدات");
    expect(screen).toContain("+ إضافة وحدة جديدة");
    expect(screen).toContain("chaletPerformanceSummary");
    expect(screen).toContain("const unitWord =");
    expect(screen).not.toContain("الوحدات التابعة لـ:");
  });

  it("orders the consolidated metrics as occupied days, bookings, then revenue", () => {
    const screen = source("app/workspaces.tsx");
    const days = screen.indexOf('language === "ar" ? "الأيام المشغولة:"');
    const bookings = screen.indexOf('language === "ar" ? "الحجوزات:"');
    const revenue = screen.indexOf('language === "ar" ? "الإيراد:"');
    expect(days).toBeGreaterThan(-1);
    expect(bookings).toBeGreaterThan(-1);
    expect(revenue).toBeGreaterThan(-1);
    expect(days).toBeLessThan(bookings);
    expect(bookings).toBeLessThan(revenue);
    expect(screen).toContain("formatMoney(performance.rentalRevenue, currency)");
  });

  it("anchors unit identity on the right: 40px icon, name, then unit number inline", () => {
    const screen = source("app/workspaces.tsx");
    expect(screen).toContain('unitIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1');
    expect(screen).toContain('unitName: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: SLATE_100');
    expect(screen).toContain('unitCode: { fontSize: 11, lineHeight: 16, color: SLATE_300, fontWeight: "600"');
    expect(screen).toContain('writingDirection: "ltr"');
    expect(screen).toContain("chalet.referenceCode");
    expect(screen).toContain("propertyTypeLabel(chalet.propertyType, language)");
    expect(screen).not.toContain("unitMeta");
    expect(screen).not.toContain("unitChip");
    expect(screen).not.toContain("بلا حارس");
  });

  it("renders the metrics pill with generous spacing and explicit RTL so labels are never cut off", () => {
    const screen = source("app/workspaces.tsx");
    expect(screen).toContain('unitStatsBar: { minHeight: 36, borderRadius: 12, borderWidth: 1, borderColor: SLATE_800_80, backgroundColor: SLATE_950_70, paddingHorizontal: 16, paddingVertical: 8, alignItems: "center", gap: 12');
    expect(screen).toContain("const textDirection = row === \"row-reverse\" ? \"rtl\" : \"ltr\";");
    expect(screen).toContain("statValue, { color: colors.success, writingDirection: textDirection }");
    expect(screen).toContain('<Text style={[styles.statDot, { color: SLATE_600 }]}>•</Text>');
    expect(screen).not.toContain("statChip");
  });

  it("aligns the far-left unit cluster: metrics, then the chalet/farm type badge, then the unit profile button", () => {
    const screen = source("app/workspaces.tsx");
    const stats = screen.indexOf("styles.unitStatsBar");
    const typeBadge = screen.indexOf("styles.typeBadge");
    const profile = screen.indexOf("styles.unitProfileButton");
    expect(stats).toBeGreaterThan(-1);
    expect(typeBadge).toBeGreaterThan(-1);
    expect(profile).toBeGreaterThan(-1);
    expect(stats).toBeLessThan(typeBadge);
    expect(typeBadge).toBeLessThan(profile);
    expect(screen).toContain('language === "ar" ? "الحجوزات:"');
    expect(screen).toContain("propertyTypeLabel(chalet.propertyType, language)");
    expect(screen).toContain('unitProfileButton: { minHeight: 32, borderRadius: 12, paddingHorizontal: 14');
  });

  it("opens the unit profile from the far-left profile button and keeps the add-unit action", () => {
    const screen = source("app/workspaces.tsx");
    expect(screen).toContain('accessibilityLabel={language === "ar" ? "ملف الوحدة" : "Unit profile"}');
    expect(screen).toContain("ملف الوحدة ➔");
    expect(screen).toContain('pathname: "/chalet-profile"');
    expect(screen).toContain('router.push("/chalet-profile?mode=add" as never)');
    expect(screen).not.toContain("تعديل بيانات الوحدة");
    expect(screen).not.toContain("openButton");
  });

  it("keeps all far-left controls compact at h-8 with no bloated vertical elements", () => {
    const screen = source("app/workspaces.tsx");
    expect(screen).toContain("minHeight: 32");
    expect(screen).not.toContain("minHeight: 72");
    expect(screen).not.toContain("actionPrimary");
    expect(screen).not.toContain("actionGhost");
    expect(screen).not.toContain("primaryButton");
  });
});