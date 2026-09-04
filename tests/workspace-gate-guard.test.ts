import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const routeAccessGate = read("components/route-access-gate.tsx");
const workspaceGate = read("app/workspace-gate.tsx");

describe("forced onboarding redirect into the workspace setup gate", () => {
  it("logs the user id, workspaces count, and current route before deciding a redirect", () => {
    expect(routeAccessGate).toContain("[RouteAccessGate]");
    expect(routeAccessGate).toContain("userId=");
    expect(routeAccessGate).toContain("workspaces=");
    expect(routeAccessGate).toContain("path=");
    expect(routeAccessGate).toContain("target=/workspace-gate");
  });

  it("redirects zero-workspace users to /workspace-gate and only unlocks for demo mode", () => {
    expect(routeAccessGate).toContain('destination === "onboarding"');
    expect(routeAccessGate).toContain('<Redirect href="/workspace-gate" />');
    expect(routeAccessGate).toContain("isDemo");
  });

  it("offers a corner sign-out button and omits a back affordance so users cannot escape to empty pages", () => {
    expect(workspaceGate).toContain("useAuthSession");
    expect(workspaceGate).toContain("handleLogout");
    expect(workspaceGate).toContain("تسجيل الخروج");
    expect(workspaceGate).toContain('router.replace("/auth/login")');
    expect(workspaceGate).toContain("usePathname");
  });

  it("prints debugging info on the gate itself: user id, workspaces count, and current path", () => {
    expect(workspaceGate).toContain("[WorkspaceGate]");
    expect(workspaceGate).toContain("userId=");
    expect(workspaceGate).toContain("workspaces=");
    expect(workspaceGate).toContain("path=");
    expect(workspaceGate).toContain("destination=");
  });
});
