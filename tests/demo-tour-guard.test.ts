import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const bookingStore = read("lib/booking-store.tsx");
const routeAccessGate = read("components/route-access-gate.tsx");
const hub = read("app/workspace-hub.tsx");
const rootLayout = read("app/_layout.tsx");
const featureFlags = read("lib/feature-flags.ts");
const userManagement = read("app/user-management.tsx");
const featureRouteGuard = read("components/feature-route-guard.tsx");

describe("mock-data-free foundation: demo tour removed, real workspace data only", () => {
  it("deletes the demo provider, mock dataset module, and all demo wiring from the store", () => {
    expect(bookingStore).not.toContain("buildDemoAppData");
    expect(bookingStore).not.toContain("useDemoMode");
    expect(bookingStore).not.toContain("isDemo");
    expect(bookingStore).not.toContain("showDemoNotice");
    expect(bookingStore).toContain("trpc.workspace.data.useQuery");
    expect(bookingStore).toContain("scopedStorageKey");
  });

  it("no longer ships sample fixtures or the demo identity anywhere", () => {
    const sources = [bookingStore, routeAccessGate, hub, rootLayout, featureFlags, userManagement, featureRouteGuard];
    sources.forEach((source) => {
      expect(source).not.toContain("مزرعة الهدى");
      expect(source).not.toContain("demo-booking");
      expect(source).not.toContain("demo-chalet");
      expect(source).not.toContain("demo-exp");
    });
  });

  it("locks zero-workspace users to the unified hub for real accounts only", () => {
    expect(routeAccessGate).toContain('destination === "onboarding"');
    expect(routeAccessGate).toContain('<Redirect href="/workspace-hub" />');
    expect(routeAccessGate).not.toContain("useDemoMode");
    expect(routeAccessGate).not.toContain("isDemo");
  });

  it("removes the demo preview entry and provider banner from the hub and root layout", () => {
    expect(hub).not.toContain("تجربة استعراضية");
    expect(hub).not.toContain("enterDemo");
    expect(hub).not.toContain("useDemoMode");
    expect(rootLayout).not.toContain("<DemoModeProvider>");
    expect(rootLayout).not.toContain("<DemoBanner />");
    expect(rootLayout).not.toContain("الوضع التجريبي");
  });

  it("evaluates feature flags straight from the server with no demo escape hatch", () => {
    expect(featureFlags).not.toContain("useDemoMode");
    expect(featureFlags).not.toContain("isDemo");
    expect(userManagement).not.toContain("exitDemo");
    expect(featureRouteGuard).not.toContain("isDemo");
  });
});