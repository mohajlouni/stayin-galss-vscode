import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("workspace settings: utilities removal, explicit workspace ID, and units summary", () => {
  it("removes the utility & meter settings section completely", () => {
    const screen = source("app/property-detail.tsx");
    expect(screen).not.toContain("إعدادات الطاقة والعدادات");
    expect(screen).not.toContain("تتبع استهلاك العدادات");
    expect(screen).not.toContain("تنبيه الاستهلاك الزائد");
    expect(screen).not.toContain('utilityTypeIcon');
    expect(screen).not.toContain("effectiveUtilityTracking");
    expect(screen).not.toContain("UTILITY_TYPES");
    expect(screen).not.toContain("SettingsSwitch");
    expect(screen).not.toContain("SettingsStepper");
    expect(screen).not.toContain("stepperColumn");
    expect(screen).not.toContain("addUnit");
    expect(screen).not.toContain("emptyUnits");
    expect(screen).not.toContain("unitRow");
    expect(screen).not.toContain("unitIcon");
  });

  it("keeps the save payload for the property profile intact", () => {
    const screen = source("app/property-detail.tsx");
    expect(screen).toContain("حفظ بيانات المنشأة");
    expect(screen).toContain("await updateSettings({ ...settings, businessName: name.trim(), businessPhone: phone.trim(), currency: currency.trim() || settings.currency, businessLogoUrl: logoUrl.trim() || undefined });");
  });

  it("renders a prominent header badge with the dynamic workspace id", () => {
    const screen = source("app/property-detail.tsx");
    expect(screen).toContain("رقم المنشأة: ");
    expect(screen).toContain("workspaceId ? `#${workspaceId}` : \"#—\"");
    expect(screen).toContain("idHeaderBadge");
    expect(screen).toContain("idHeaderBadgeText");
    expect(screen).toContain('name="pin"');
  });

  it("shows a dedicated read-only workspace reference ID field with a one-click copy button", () => {
    const screen = source("app/property-detail.tsx");
    expect(screen).toContain("رقم المنشأة التعريفي (ID)");
    expect(screen).toContain('editable={false}');
    expect(screen).toContain("الرقم المرجعي الثابت للمنشأة في النظام والعمليات المحاسبية.");
    expect(screen).toContain("await Clipboard.setStringAsync(`#${workspaceId}`)");
    expect(screen).toContain('idCopied ? "check" : "content-copy"');
    expect(screen).toContain('idCopied ? (language === "ar" ? "تم" : "Copied") : (language === "ar" ? "نسخ" : "Copy")');
    expect(screen).toContain('import * as Clipboard from "expo-clipboard"');
  });

  it("replaces the embedded units list with a summary card linking to units management", () => {
    const screen = source("app/property-detail.tsx");
    expect(screen).toContain("الوحدات والعقارات التابعة");
    expect(screen).toContain("تضم هذه المنشأة ${chalets.length} وحدات.");
    expect(screen).toContain("إدارة وتعديل الوحدات");
    expect(screen).toContain('router.push("/chalet-management" as never)');
    expect(screen).not.toContain("إضافة وحدة / شاليه جديد");
    expect(screen).not.toContain("شاليه النخيل");
  });

  it("preserves the route-param context sync from the deletion refactor", () => {
    const screen = source("app/property-detail.tsx");
    expect(screen).toContain("useLocalSearchParams<{ workspaceId?: string }>()");
    expect(screen).toContain("paramWorkspaceId !== null && activeWorkspaceId !== null");
    expect(screen).toContain("selectWorkspace.mutateAsync({ workspaceId: paramWorkspaceId! })");
    expect(screen).toContain("await utils.workspace.invalidate();");
    expect(screen).toContain("جارٍ تحميل بيانات المنشأة المطلوبة…");
  });
});