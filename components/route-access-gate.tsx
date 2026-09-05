import { Redirect, usePathname } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuthSession } from "@/lib/auth-session";
import { useDemoMode } from "@/lib/demo-mode";
import { useColors } from "@/hooks/use-colors";

const PUBLIC_ROUTE_PREFIXES = ["/auth/", "/oauth/", "/legal/"] as const;
const PUBLIC_ROUTE_PATHS = new Set(["/auth", "/oauth", "/legal"]);

/**
 * Routes every protected screen to the correct gateway while the authenticated
 * session is still being routed. Any path left out of these sets is treated as
 * an internal route and is refused until the routing decision resolves.
 */
const GATEWAY_ROUTE_PATHS = new Set(["/onboarding", "/create-workspace", "/restore-account", "/account-recovery", "/auth/select-workspace"]);

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
 *   /restore-account gateway (every internal URL bounces back there).
 * - A zero-workspace account (destination "onboarding") is locked to the
 *   /onboarding role gateway. Manually typing any internal URL (/calendar,
 *   /units, /finance, /settings, ...) returns the user here immediately.
 * - A completed account (>= 1 workspace) reaches the dashboard directly.
 * The in-memory demo tour is the only bypass: it unlocks protected routes so
 * the preview can be browsed without ever persisting anything.
 */
export function RouteAccessGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, routing, user } = useAuthSession();
  const { isDemo } = useDemoMode();
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

  // Authenticated and not in demo mode: on any protected route we refuse to
  // render app content until a workspace routing decision is known. While the
  // workspace fetch is still loading we show a boot screen instead of letting a
  // fresh zero-workspace account briefly fall through to an empty Calendar /
  // Units / Dashboard (the race). Once resolved the destination decides the
  // gateway: restore -> /restore-account, onboarding -> /onboarding, selector
  // -> /auth/select-workspace. Only demo mode unlocks protected routes.
  if (isAuthenticated && !isDemo && isRestrictedRoute(pathname)) {
    if (routing.isLoading) {
      console.log(`[RouteAccessGate] Pending workspace routing -> userId=${user?.id ?? "none"} path=${pathname} loading=true`);
      return <View style={[styles.boot, { backgroundColor: colors.background }]} accessibilityLiveRegion="polite">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.copy, { color: colors.muted }]}>جارٍ تحميل بيانات المنشأة</Text>
      </View>;
    }
    const destination = routing.data?.destination;
    if (destination === "restore") {
      console.log(`[RouteAccessGate] Restore-pending redirect -> userId=${user?.id ?? "none"} path=${pathname} target=/restore-account`);
      return <Redirect href="/restore-account" />;
    }
    if (destination === "onboarding") {
      console.log(`[RouteAccessGate] Zero-workspace redirect -> userId=${user?.id ?? "none"} workspaces=${workspaceCount} path=${pathname} target=/onboarding`);
      return <Redirect href="/onboarding" />;
    }
    if (destination === "selector") {
      console.log(`[RouteAccessGate] Selector redirect -> userId=${user?.id ?? "none"} workspaces=${workspaceCount} path=${pathname} target=/auth/select-workspace`);
      return <Redirect href="/auth/select-workspace" />;
    }
  }

  if (isAuthenticated && !routing.isLoading) {
    console.log(`[RouteAccessGate] Route allowed -> userId=${user?.id ?? "none"} workspaces=${workspaceCount} path=${pathname} destination=${routing.data?.destination ?? "unknown"} demo=${isDemo}`);
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  copy: { marginTop: 14, fontSize: 13, fontWeight: "800", textAlign: "center" },
});