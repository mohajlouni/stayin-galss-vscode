import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/(tabs)/more.tsx"), "utf8");

describe("more screen layout", () => {
  it("groups every existing destination into a clear operational hierarchy", () => {
    expect(source).toContain("المنشأة والعمليات");
    expect(source).toContain("المالية والمدفوعات");
    expect(source).toContain("الفريق والأمان");
    expect(source).toContain("التواصل والإعدادات");
    expect(source).toContain("العملاء");
    expect(source).toContain("الدعم والمساعدة");
    expect(source).toContain('route: "/(tabs)/waitlist"');
    expect(source).not.toContain('route: "/booking-history"');
    expect(source).toContain('route: "/chalet-management"');
    expect(source).toContain('route: "/audit-log"');
    expect(source).toContain('route: "/(tabs)/settings"');
    expect(source).toContain('route: "/whatsapp-templates"');
    expect(source).toContain("قوالب رسائل الواتساب");
    expect(source).toContain("إدارة المستخدمين والصلاحيات");
    expect(source).toContain('route: "/user-management"');
    expect(source).toContain('route: "/suggestions"');
    expect(source).toContain("minHeight: 72");
    expect(source).toContain("MenuSection");
    expect(source).toContain("المنشأة النشطة");
    expect(source).toContain("activePropertyGroup?.name");
    expect(source).toContain("الإعدادات العامة والمزامنة");
    expect(source).toContain("طرق الدفع والحسابات المالية");
    expect(source).toContain("CliQ وIBAN");
    expect(source).toContain("مركز الاقتراحات والمساعدة");
    expect(source).toContain("CompactSyncIndicator");
    expect(source).toContain("متصل · المزامنة ممكنة");
    expect(source).toContain("useInternetAvailability");
  });

  it("navigates to internal tab destinations without pushing More underneath the next scene", () => {
    expect(source).toContain('const MORE_TAB_ROUTES = new Set<MenuRoute>(["/(tabs)/settings", "/(tabs)/waitlist"])');
    expect(source).toContain("if (MORE_TAB_ROUTES.has(route))");
    expect(source).toContain("router.navigate(route as never)");
    expect(source).toContain("onPress={() => openMoreRoute(item.route)}");
    expect(source).toContain('content: { flexGrow: 1, padding: 16, paddingBottom: 36 }');
  });
});
