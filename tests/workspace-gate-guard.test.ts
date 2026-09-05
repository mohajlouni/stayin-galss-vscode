import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const routeAccessGate = read("components/route-access-gate.tsx");
const onboarding = read("app/onboarding.tsx");

describe("forced onboarding redirect into the strict role gateway", () => {
  it("logs the user id, workspaces count, and current route before deciding a redirect", () => {
    expect(routeAccessGate).toContain("[RouteAccessGate]");
    expect(routeAccessGate).toContain("userId=");
    expect(routeAccessGate).toContain("workspaces=");
    expect(routeAccessGate).toContain("path=");
    expect(routeAccessGate).toContain("target=/onboarding");
  });

  it("redirects zero-workspace users to /onboarding and only unlocks for demo mode", () => {
    expect(routeAccessGate).toContain('destination === "onboarding"');
    expect(routeAccessGate).toContain('<Redirect href="/onboarding" />');
    expect(routeAccessGate).toContain("isDemo");
  });

  it("forces accounts inside the deletion grace period to the restore gateway", () => {
    expect(routeAccessGate).toContain('destination === "restore"');
    expect(routeAccessGate).toContain('<Redirect href="/restore-account" />');
    expect(routeAccessGate).toContain("/account-recovery");
  });

  it("offers a corner sign-out button and omits a back affordance so users cannot escape to empty pages", () => {
    expect(onboarding).toContain("useAuthSession");
    expect(onboarding).toContain("handleLogout");
    expect(onboarding).toContain("تسجيل الخروج");
    expect(onboarding).toContain('router.replace("/auth/login")');
    expect(onboarding).toContain("usePathname");
  });

  it("prints debugging info on the gate itself: user id, workspaces count, and current path", () => {
    expect(onboarding).toContain("[OnboardingGate]");
    expect(onboarding).toContain("userId=");
    expect(onboarding).toContain("workspaces=");
    expect(onboarding).toContain("path=");
    expect(onboarding).toContain("destination=");
  });

  it("never renders protected layout routes while workspace routing is still loading (closes the onboarding race)", () => {
    expect(routeAccessGate).toContain("isRestrictedRoute(pathname)");
    expect(routeAccessGate).toContain("if (routing.isLoading)");
    expect(routeAccessGate).toContain("جارٍ تحميل بيانات المنشأة");
    expect(routeAccessGate).toContain('destination === "onboarding"');
    expect(routeAccessGate).toContain('<Redirect href="/onboarding" />');
    expect(routeAccessGate).toContain("routing.data?.memberships?.length");
  });
});