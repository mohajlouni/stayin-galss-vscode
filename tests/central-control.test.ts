import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("central control — feature & operational unit master card", () => {
  it("defines the shared flag registry with global kills, workspace preferences, and route guards", () => {
    const shared = source("shared/feature-flags.ts");
    expect(shared).toContain("feat_maintenance");
    expect(shared).toContain("feat_notifications");
    expect(shared).toContain("feat_loyalty_suite");
    expect(shared).toContain("feat_lunar_calendar");
    expect(shared).toContain("feat_customers_blacklist");
    expect(shared).toContain("feat_automation_weather");
    expect(shared).toContain("feat_guest_checkin");
    expect(shared).toContain("feat_cleaning_inspection");
    expect(shared).toContain("feat_advanced_tools");
    expect(shared).toContain("feat_digital_contracts");
    expect(shared).toContain("feat_invoicing_receipts");
    expect(shared).toContain("feat_whatsapp_integration");
    expect(shared).toContain("feat_audit_log");
    expect(shared).toContain("maintenance_assets");
    expect(shared).toContain("notifications_center");
    expect(shared).toContain("loyalty_points");
    expect(shared).toContain("/maintenance-dashboard");
    expect(shared).toContain("/notifications");
    expect(shared).toContain("/loyalty");
    expect(shared).toContain("/settings/advanced-tools");
    expect(shared).toContain("/audit-log");
    expect(shared).toContain("mergeGlobalOverPreference");
  });

  it("persists kills and workspace preferences in dedicated database tables", () => {
    const schema = source("drizzle/schema.ts");
    const db = source("server/db.ts");
    expect(schema).toContain("stayInGlobalFeatureFlags");
    expect(schema).toContain("stayInWorkspaceFeatureSettings");
    expect(db).toContain("ensureGlobalFeatureFlagsTable");
    expect(db).toContain("ensureWorkspaceFeatureSettingsTable");
    expect(db).toContain("listGlobalFeatureFlags");
    expect(db).toContain("updateGlobalFeatureFlag");
    expect(db).toContain("getWorkspaceFeatureSettings");
    expect(db).toContain("setWorkspaceFeatureSetting");
    expect(db).toContain("getEffectiveFeatureFlags");
  });

  it("ensures the flag tables at server startup", () => {
    const core = source("server/_core/index.ts");
    expect(core).toContain("ensureGlobalFeatureFlagsTable");
    expect(core).toContain("ensureWorkspaceFeatureSettingsTable");
  });

  it("exposes protected feature-control procedures and audits global kills", () => {
    const router = source("server/routers.ts");
    expect(router).toContain("featureControl: router");
    expect(router).toContain("global: router");
    expect(router).toContain("list: protectedProcedure");
    expect(router).toContain("update: adminProcedure");
    expect(router).toContain("workspace: router");
    expect(router).toContain("effective: protectedProcedure");
    expect(router).toContain('action: "feature-flag-updated"');
  });

  it("folds global kills over workspace preferences for every user", () => {
    const flags = source("lib/feature-flags.ts");
    expect(flags).toContain("useGlobalFeatureFlags");
    expect(flags).toContain("useWorkspaceFeaturePreferences");
    expect(flags).toContain("mapEffectiveToLegacy");
    expect(flags).toContain("mergeGlobalOverPreference");
  });

  it("renders the master card with owner preferences only — the super-admin kill frame was extracted out", () => {
    const screen = source("app/feature-control.tsx");
    expect(screen).toContain("مركز التحكم في الميزات والوحدات التشغيلية");
    expect(screen).toContain("إدارة تفعيل وتعطيل الشاشات والأدوات في النظام بضغطة زر واحدة.");
    expect(screen).toContain("ميزات تحكم المالك / المستخدم");
    expect(screen).toContain("مُعطّل من الإدارة العليا — الحجب المركزي يعلو تفضيلاتك");
    expect(screen).toContain("useWorkspaceFeaturePreferences");
    expect(screen).not.toContain("لوحة الحجب المركزي للإدارة العليا");
    expect(screen).not.toContain("GLOBAL_FEATURE_FLAG_KEYS");
    expect(screen).not.toContain("isSuperAdmin");
  });

  it("labels every workspace preference in Arabic (global kill labels live in the standalone master blackout panel)", () => {
    const screen = source("app/feature-control.tsx");
    expect(screen).toContain("الصيانة والوقاية وإدارة الأصول");
    expect(screen).toContain("مركز الإشعارات والتنبيهات المخصصة");
    expect(screen).toContain("برامج الولاء والنقاط والكاش باك");
  });

  it("blocks direct access to killed screens with a protected route guard mounted at the root", () => {
    const guard = source("components/feature-route-guard.tsx");
    const layout = source("app/_layout.tsx");
    expect(guard).toContain("هذه الميزة غير متاحة حالياً");
    expect(guard).toContain("useGlobalFeatureFlags");
    expect(layout).toContain("<FeatureRouteGuard />");
    expect(layout).not.toContain("router.replace(");
  });

  it("gates sidebar entries so disabled features disappear from the More screen", () => {
    const more = source("app/(tabs)/more.tsx");
    expect(more).toContain("flags.master_control");
    expect(more).toContain('route: "/feature-control"');
    expect(more).toContain("flags.notifications");
    expect(more).toContain("مركز التحكم في الميزات");
  });

  it("links the master card from the system tab of the admin master control", () => {
    const master = source("app/admin/master-control.tsx");
    expect(master).toContain("مركز التحكم في الميزات");
    expect(master).toContain("فتح مركز التحكم في الميزات");
    expect(master).toContain('router.push("/feature-control"');
  });

  it("respects kills inside settings and home widgets", () => {
    const settings = source("app/(tabs)/settings.tsx");
    const home = source("components/home-top-widget.tsx");
    const index = source("app/(tabs)/index.tsx");
    expect(settings).toContain("lunarPhaseEnabled");
    expect(settings).toContain("contractsEnabled");
    expect(settings).toContain("whatsappIntegrationEnabled");
    expect(settings).toContain("loyaltyFlowEnabled");
    expect(settings).toContain("crmEnabled");
    expect(settings).toContain("weatherFlowEnabled");
    expect(settings).toContain("guestCheckInEnabled");
    expect(settings).toContain("cleaningFlowEnabled");
    expect(settings).toContain("notificationsFlowEnabled");
    expect(home).toContain("globalFlags.feat_automation_weather");
    expect(home).toContain("deviceSettings.showLunarPhase && globalFlags.feat_lunar_calendar");
    expect(index).toContain("cleaningFlowEnabled");
    expect(index).toContain("guestCheckInEnabled");
  });
});