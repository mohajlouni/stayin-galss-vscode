import { Redirect, usePathname } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuthSession } from "@/lib/auth-session";
import { useColors } from "@/hooks/use-colors";

const PUBLIC_ROUTE_PREFIXES = ["/auth/", "/oauth/", "/legal/"] as const;
const PUBLIC_ROUTE_PATHS = new Set(["/auth", "/oauth", "/legal"]);

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTE_PATHS.has(pathname) || PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Declaratively blocks private routes while the root navigator remains free of
 * imperative redirects. This prevents the navigation feedback loop previously
 * caused by route replacement effects during navigator mounting.
 */
export function RouteAccessGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuthSession();
  const pathname = usePathname();
  const colors = useColors();

  if (loading) {
    return <View style={[styles.boot, { backgroundColor: colors.background }]} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.copy, { color: colors.muted }]}>جارٍ التحقق من الجلسة بأمان</Text>
    </View>;
  }

  if (!isAuthenticated && !isPublicRoute(pathname)) {
    return <Redirect href="/auth/login" />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  copy: { marginTop: 14, fontSize: 13, fontWeight: "800", textAlign: "center" },
});
