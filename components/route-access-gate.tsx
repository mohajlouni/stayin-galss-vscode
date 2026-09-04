import { Redirect, usePathname } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuthSession } from "@/lib/auth-session";
import { useDemoMode } from "@/lib/demo-mode";
import { useColors } from "@/hooks/use-colors";

const PUBLIC_ROUTE_PREFIXES = ["/auth/", "/oauth/", "/legal/"] as const;
const PUBLIC_ROUTE_PATHS = new Set(["/auth", "/oauth", "/legal"]);

const ONBOARDING_FREE_PATHS = new Set(["/workspace-gate", "/auth/select-workspace", "/user-management"]);

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTE_PATHS.has(pathname) || PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isZeroWorkspaceProtected(pathname: string) {
  if (isPublicRoute(pathname)) return false;
  if (ONBOARDING_FREE_PATHS.has(pathname)) return false;
  return true;
}

/**
 * Declaratively blocks private routes while the root navigator remains free of
 * imperative redirects. This prevents the navigation feedback loop previously
 * caused by route replacement effects during navigator mounting.
 *
 * On top of authentication, users with zero workspace memberships (destination
 * "onboarding") are locked to the workspace setup gate unless they opted into
 * the in-memory demo tour, which lets them browse the full app preview.
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

  if (isAuthenticated && !isDemo && !routing.isLoading && routing.data?.destination === "onboarding" && isZeroWorkspaceProtected(pathname)) {
    console.log(`[RouteAccessGate] Zero-workspace redirect -> userId=${user?.id ?? "none"} workspaces=${workspaceCount} path=${pathname} target=/workspace-gate`);
    return <Redirect href="/workspace-gate" />;
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
