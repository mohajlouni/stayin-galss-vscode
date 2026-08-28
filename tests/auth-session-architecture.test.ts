import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const session = readFileSync(resolve(process.cwd(), "lib/auth-session.tsx"), "utf8");
const login = readFileSync(resolve(process.cwd(), "app/auth/login.tsx"), "utf8");
const authScreen = readFileSync(resolve(process.cwd(), "components/unified-auth-screen.tsx"), "utf8");
const root = readFileSync(resolve(process.cwd(), "app/_layout.tsx"), "utf8");
const gate = readFileSync(resolve(process.cwd(), "app/workspace-gate.tsx"), "utf8");
const selector = readFileSync(resolve(process.cwd(), "app/auth/select-workspace.tsx"), "utf8");
const workspaceAccess = readFileSync(resolve(process.cwd(), "lib/workspace-access.ts"), "utf8");
const routeAccessGate = readFileSync(resolve(process.cwd(), "components/route-access-gate.tsx"), "utf8");

describe("StayIn authentication and multi-tenant session foundation", () => {
  it("models the current user, active workspace, membership, and persisted session preferences", () => {
    expect(session).toContain("SessionUser");
    expect(session).toContain("SessionMembership");
    expect(session).toContain("PropertyGroup");
    expect(session).toContain("ActiveSession");
    expect(session).toContain("SESSION_PREFERENCES_KEY");
  });

  it("uses the secure identity flow, remembers the session, and offers biometric unlock only when available", () => {
    expect(login).toContain("UnifiedAuthScreen");
    expect(authScreen).toContain("startOAuthLogin");
    expect(authScreen).toContain("تذكرني");
    expect(authScreen).toContain("setRememberMe");
    expect(authScreen).toContain("activeSession.biometricsEnabled");
    expect(authScreen).toContain("unlockWithBiometrics");
    expect(session).toContain("LocalAuthentication.authenticateAsync");
    expect(session).toContain("hasHardwareAsync");
    expect(session).toContain("isEnrolledAsync");
  });

  it("keeps root navigation declarative and blocks private routes through a dedicated access gate", () => {
    expect(root).not.toContain("AuthNavigationGuard");
    expect(root).not.toContain("router.replace(");
    expect(root).toContain("<RouteAccessGate>");
    expect(root).toContain("stackScreenOptions");
    expect(root).toContain("useMemo");
    expect(root).toContain("screenOptions={stackScreenOptions}");
    expect(routeAccessGate).toContain("usePathname");
    expect(routeAccessGate).toContain("PUBLIC_ROUTE_PREFIXES");
    expect(routeAccessGate).toContain('<Redirect href="/auth/login" />');
    expect(routeAccessGate).not.toContain("router.replace(");
    expect(gate).toContain('href={routing.data?.destination === "dashboard" ? "/(tabs)" : "/auth/select-workspace"}');
    expect(selector).toContain('export { default } from "../workspace-select"');
  });

  it("shares one session source between routing and workspace access after logout", () => {
    expect(session).toContain("AuthSessionProvider");
    expect(root).toContain("<AuthSessionProvider>");
    expect(workspaceAccess).toContain('import { useAuthSession } from "@/lib/auth-session"');
    expect(workspaceAccess).toContain("const { currentUser, isAuthenticated, loading, refresh } = useAuthSession()");
    expect(workspaceAccess).toContain("GUEST_PERMISSIONS");
    expect(workspaceAccess).toContain("const permissions = !isAuthenticated");
    expect(gate).toContain('if (!isAuthenticated) return <Redirect href="/auth/login" />');
    expect(gate).toContain("if (!loading && !routing.isLoading)");
  });
});
