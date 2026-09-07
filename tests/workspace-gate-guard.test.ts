import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const routeAccessGate = read("components/route-access-gate.tsx");
const hub = read("app/workspace-hub.tsx");

describe("forced onboarding redirect into the unified workspace hub", () => {
  it("logs the user id, workspaces count, and current route before deciding a redirect", () => {
    expect(routeAccessGate).toContain("[RouteAccessGate]");
    expect(routeAccessGate).toContain("userId=");
    expect(routeAccessGate).toContain("workspaces=");
    expect(routeAccessGate).toContain("path=");
    expect(routeAccessGate).toContain("target=/workspace-hub");
  });

  it("redirects zero-workspace and selector users to /workspace-hub without a demo bypass", () => {
    expect(routeAccessGate).toContain('destination === "onboarding"');
    expect(routeAccessGate).toContain('<Redirect href="/workspace-hub" />');
    expect(routeAccessGate).toContain('destination === "selector"');
    expect(routeAccessGate).not.toContain("isDemo");
  });

  it("forces accounts inside the deletion grace period to the restore gateway", () => {
    expect(routeAccessGate).toContain('destination === "restore"');
    expect(routeAccessGate).toContain('pathname: "/restore-account"');
    expect(routeAccessGate).toContain("routing.data?.deletion?.scheduledFor");
    expect(routeAccessGate).toContain("/account-recovery");
  });

  it("offers a corner sign-out button and omits a back affordance so users cannot escape to empty pages", () => {
    expect(hub).toContain("useAuthSession");
    expect(hub).toContain("handleLogout");
    expect(hub).toContain("تسجيل الخروج");
    expect(hub).toContain('router.replace("/auth/login")');
    expect(hub).toContain("usePathname");
  });

  it("prints debugging info on the hub itself: user id, workspaces count, and current path", () => {
    expect(hub).toContain("[WorkspaceHub]");
    expect(hub).toContain("userId=");
    expect(hub).toContain("workspaces=");
    expect(hub).toContain("path=");
    expect(hub).toContain("destination=");
  });

  it("never renders protected layout routes while workspace routing is still loading (closes the onboarding race)", () => {
    expect(routeAccessGate).toContain("isRestrictedRoute(pathname)");
    expect(routeAccessGate).toContain("if (routing.isLoading)");
    expect(routeAccessGate).toContain("جارٍ تحميل بيانات المنشأة");
    expect(routeAccessGate).toContain('destination === "onboarding"');
    expect(routeAccessGate).toContain('<Redirect href="/workspace-hub" />');
    expect(routeAccessGate).toContain("routing.data?.memberships?.length");
  });
});