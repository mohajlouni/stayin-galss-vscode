import { Redirect, usePathname } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuthSession } from "@/lib/auth-session";
import { useColors } from "@/hooks/use-colors";
import { isSuperAdminUser } from "@/lib/super-admin";

const PUBLIC_ROUTE_PREFIXES = ["/auth/", "/oauth/", "/legal/"] as const;
const PUBLIC_ROUTE_PATHS = new Set(["/auth", "/oauth", "/legal", "/logout"]);

/**
 * Routes every protected screen to the correct gateway while the authenticated
 * session is still being routed. Any path left out of these sets is treated as
 * an internal route and is refused until the routing decision resolves.
 */
const GATEWAY_ROUTE_PATHS = new Set(["/workspace-hub", "/restore-account", "/account-recovery"]);

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTE_PATHS.has(pathname) || PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isRestrictedRoute(pathname: string) {
  if (isPublicRoute(pathname)) return false;
  if (GATEWAY_ROUTE_PATHS.has(pathname)) return false;
  return true;
}

/**
 * Declaratively blocks private routes while the root navigator remains free of
 * imperative redirects. This prevents the navigation feedback loop previously
 * caused by route replacement effects during navigator mounting.
 *
 * On top of authentication, this is the STRICT onboarding route guard:
 * - An account inside its 14-day deletion grace period is locked to the
* /restore-account gateway (every internal URL bounces back there).
 * - A zero-workspace account (destination "onboarding") is locked to the
 *   /workspace-hub gateway. Manually typing any internal URL (/calendar,
 *   /units, /finance, /settings, ...) returns the user here immediately.
 * - A completed account (>= 1 workspace) reaches the dashboard directly.
 */
export function RouteAccessGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, routing, user } = useAuthSession();
  const pathname = usePathname();
  const colors = useColors();
  const workspaceCount = routing.data?.memberships?.length ?? 0;

  if (loading) {
    return <View style={[styles.boot, { backgroundColor: colors.background }]} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.copy, { color: colors.muted }]}>جارٍ التحقق من الجلسة بأمان</Text>
    </View>;
  }

  if (!isAuthenticated && !isPublicRoute(pathname)) {
    console.log(`[RouteAccessGate] Unauth redirect -> userId=${user?.id ?? "none"} path=${pathname} target=/auth/login`);
    return <Redirect href="/auth/login" />;
  }

  // SUPER ADMIN TRAP GUARD: the root Super Admin (#U1000) is a full-system
  // fixture account and can never be funneled into the tenant onboarding
  // gateway. Any attempt to visit /onboarding (typing the URL, a stale deep
  // link, a leftover redirect) bounces straight to the Master Control Center.
  if (isAuthenticated && isSuperAdminUser(user) && (pathname === "/onboarding" || pathname.startsWith("/onboarding/"))) {
    console.log(`[RouteAccessGate] Super admin onboarding trap -> userId=${user?.id ?? "none"} path=${pathname} target=/admin/master-control`);
    return <Redirect href="/admin/master-control" />;
  }

  // EXISTING-ACCOUNT ONBOARDING TRAP: /onboarding is the brand-new-account
  // initialization surface only (zero workspaces, no roles). A signed-in owner
  // or staff member who already manages properties must never see the
  // new-user portal — typing the URL bounces them to their active dashboard, and
  // a zero-workspace account falls back to the unified hub.
  if (isAuthenticated && (pathname === "/onboarding" || pathname.startsWith("/onboarding/"))) {
    const target = workspaceCount >= 1 ? "/calendar" : "/workspace-hub";
    console.log(`[RouteAccessGate] Onboarding reserved for new accounts -> userId=${user?.id ?? "none"} workspaces=${workspaceCount} path=${pathname} target=${target}`);
    return <Redirect href={target} />;
  }

// Authenticated: on any protected route we refuse to render app content until
// a workspace routing decision is known. While the workspace fetch is still
// loading we show a boot screen instead of letting a fresh zero-workspace
// account briefly fall through to an empty Calendar / Units / Dashboard (the
// race). Once resolved the destination decides the gateway: restore ->
// /restore-account, onboarding -> /workspace-hub, selector -> /workspace-hub.
if (isAuthenticated && isRestrictedRoute(pathname)) {
    if (routing.isLoading) {
      console.log(`[RouteAccessGate] Pending workspace routing -> userId=${user?.id ?? "none"} path=${pathname} loading=true`);
      return <View style={[styles.boot, { backgroundColor: colors.background }]} accessibilityLiveRegion="polite">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.copy, { color: colors.muted }]}>جارٍ تحميل بيانات المنشأة</Text>
      </View>;
    }
    const destination = routing.data?.destination;
    // Home and every tenant route are never intercepted here — including for the
    // Super Admin. The command center is reached ONLY from the initial login
    // action (login destination "admin" lands there once) or from the dedicated
    // [مركز الإدارة العليا] button in the top navigation. Visiting "/", the
    // /calendar, or any operational screen never rubber-bands back to
    // /admin/master-control during in-app navigation.
    if (destination === "restore") {
      console.log(`[RouteAccessGate] Restore-pending redirect -> userId=${user?.id ?? "none"} path=${pathname} target=/restore-account`);
      return <Redirect href={{ pathname: "/restore-account", params: routing.data?.deletion?.scheduledFor ? { scheduledFor: routing.data.deletion.scheduledFor } : {} }} />;
    } else if (destination === "onboarding") {
      console.log(`[RouteAccessGate] Zero-workspace redirect -> userId=${user?.id ?? "none"} workspaces=${workspaceCount} path=${pathname} target=/workspace-hub`);
      return <Redirect href="/workspace-hub" />;
    } else if (destination === "selector") {
      console.log(`[RouteAccessGate] Selector redirect -> userId=${user?.id ?? "none"} workspaces=${workspaceCount} path=${pathname} target=/workspace-hub`);
      return <Redirect href="/workspace-hub" />;
    }
  }

  if (isAuthenticated && !routing.isLoading) {
    console.log(`[RouteAccessGate] Route allowed -> userId=${user?.id ?? "none"} workspaces=${workspaceCount} path=${pathname} destination=${routing.data?.destination ?? "unknown"}`);
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  copy: { marginTop: 14, fontSize: 13, fontWeight: "800", textAlign: "center" },
});