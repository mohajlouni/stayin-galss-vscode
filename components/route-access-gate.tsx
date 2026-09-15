import { memo, useEffect, useMemo, useRef, type ReactNode } from "react";
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

function isOnboardingRoute(pathname: string) {
  return pathname === "/onboarding" || pathname.startsWith("/onboarding/");
}

/**
 * قرار البوابة كاملًا: يُحسب في دالة نقية داخل useMemo، ويحمل معه سطر التشخيص
 * الوحيد الخاص به، فلا يُطبع شيء أثناء الرسم نفسه.
 */
type GateDecision =
  | { kind: "session-boot"; log: string }
  | { kind: "routing-boot"; log: string }
  | { kind: "auth-redirect"; log: string }
  | { kind: "super-admin-trap"; log: string }
  | { kind: "onboarding-trap"; log: string; target: "/calendar" | "/workspace-hub" }
  | { kind: "restore-redirect"; log: string; scheduledFor?: string }
  | { kind: "hub-redirect"; log: string }
  | { kind: "allow"; log: string };

/**
 * شاشات الانتظار والتحويلات: مكوّنات ثابتة الهوية (memo) خارج جسم البوابة.
 * `<Redirect>` في expo-router يعتمد على `useFocusEffect`، أي أن كل إعادة رسم
 * جديدة للعنصر تُعيد تنفيذ `router.replace` من جديد. حين كانت تُبنى داخل جسم
 * البوابة كانت كل إعادة رسم للسياق (جلسة/نمط/مسار) تُطلق تنقّلًا مكررًا حتى
 * يُغلق المسار الهدف — وهو ما ظهر كحلقة فحص جلسة زائدة. الآن تُعاد النتيجة نفسها
 * بلا إعادة رسم، فيُنفّذ التحويل مرة واحدة عند تركيبه فقط.
 */

const SessionBootScreen = memo(function SessionBootScreen() {
  const colors = useColors();
  return (
    <View style={[styles.boot, { backgroundColor: colors.background }]} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.copy, { color: colors.muted }]}>جارٍ التحقق من الجلسة بأمان</Text>
    </View>
  );
});

const WorkspaceBootScreen = memo(function WorkspaceBootScreen() {
  const colors = useColors();
  return (
    <View style={[styles.boot, { backgroundColor: colors.background }]} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.copy, { color: colors.muted }]}>جارٍ تحميل بيانات المنشأة</Text>
    </View>
  );
});

const LoginRedirect = memo(function LoginRedirect() {
  return <Redirect href="/auth/login" />;
});

const WorkspaceHubRedirect = memo(function WorkspaceHubRedirect() {
  return <Redirect href="/workspace-hub" />;
});

const MasterControlRedirect = memo(function MasterControlRedirect() {
  return <Redirect href="/admin/master-control" />;
});

const OnboardingTargetRedirect = memo(function OnboardingTargetRedirect({ target }: { target: "/calendar" | "/workspace-hub" }) {
  return <Redirect href={target} />;
});

const RestoreAccountRedirect = memo(function RestoreAccountRedirect({ scheduledFor }: { scheduledFor?: string }) {
  return <Redirect href={{ pathname: "/restore-account", params: scheduledFor ? { scheduledFor } : {} }} />;
});

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
export function RouteAccessGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, routing, user } = useAuthSession();
  const pathname = usePathname();
  const workspaceCount = routing.data?.memberships?.length ?? 0;
  const destination = routing.data?.destination;
  const scheduledFor = routing.data?.deletion?.scheduledFor ?? undefined;
  const userId = user?.id ?? "none";

  // يُحسم المسار مرة واحدة لكل حساب: بعد أول إجابة عن مسار المنشأة لا تُعرض شاشة
  // الانتظار مرة أخرى عند أي إعادة جلب لاحقة، فلا وميض ولا دورات فحص متكررة،
  // مع بقاء كل قواعد التحويل فعّالة كما هي. ويُصفَّر الحسم عند تغيّر الحساب.
  const gate = useRef<{ owner: string | number; settled: boolean }>({ owner: userId, settled: false });
  if (gate.current.owner !== userId) gate.current = { owner: userId, settled: false };
  if (isAuthenticated && !loading && !routing.isLoading) gate.current.settled = true;
  const routingSettled = gate.current.settled;

  // القرار يُحسب مرة واحدة لكل تغيّر فعلي في مدخلاته (دالة نقية بلا طبع أو تنقّل).
  const decision = useMemo<GateDecision>(() => {
    const target = workspaceCount >= 1 ? "/calendar" : "/workspace-hub";
    if (loading) {
      return { kind: "session-boot", log: `[RouteAccessGate] Session check pending -> userId=${userId} workspaces=${workspaceCount} path=${pathname} loading=true` };
    }

    if (!isAuthenticated && !isPublicRoute(pathname)) {
      return { kind: "auth-redirect", log: `[RouteAccessGate] Unauth redirect -> userId=${userId} workspaces=${workspaceCount} path=${pathname} target=/auth/login` };
    }

    // SUPER ADMIN TRAP GUARD: the root Super Admin (#U1000) is a full-system
    // fixture account and can never be funneled into the tenant onboarding
    // gateway. Any attempt to visit /onboarding (typing the URL, a stale deep
    // link, a leftover redirect) bounces straight to the Master Control Center.
    if (isAuthenticated && isSuperAdminUser(user) && isOnboardingRoute(pathname)) {
      return { kind: "super-admin-trap", log: `[RouteAccessGate] Super admin onboarding trap -> userId=${userId} workspaces=${workspaceCount} path=${pathname} target=/admin/master-control` };
    }

    // EXISTING-ACCOUNT ONBOARDING TRAP: /onboarding is the brand-new-account
    // initialization surface only (zero workspaces, no roles). A signed-in owner
    // or staff member who already manages properties must never see the
    // new-user portal — typing the URL bounces them to their active dashboard, and
    // a zero-workspace account falls back to the unified hub.
    if (isAuthenticated && isOnboardingRoute(pathname)) {
      return { kind: "onboarding-trap", target, log: `[RouteAccessGate] Onboarding reserved for new accounts -> userId=${userId} workspaces=${workspaceCount} path=${pathname} target=${target}` };
    }

    // Authenticated: on any protected route we refuse to render app content until
    // a workspace routing decision is known. While the workspace fetch is still
    // loading we show a boot screen instead of letting a fresh zero-workspace
    // account briefly fall through to an empty Calendar / Units / Dashboard (the
    // race). Once resolved the destination decides the gateway: restore ->
    // /restore-account, onboarding -> /workspace-hub, selector -> /workspace-hub.
    if (isAuthenticated && isRestrictedRoute(pathname)) {
      if (routing.isLoading) {
        if (!routingSettled) {
          return { kind: "routing-boot", log: `[RouteAccessGate] Pending workspace routing -> userId=${userId} workspaces=${workspaceCount} path=${pathname} loading=true` };
        }
      }
      // Home and every tenant route are never intercepted here — including for the
      // Super Admin. The command center is reached ONLY from the initial login
      // action (login destination "admin" lands there once) or from the dedicated
      // [مركز الإدارة العليا] button in the top navigation. Visiting "/", the
      // /calendar, or any operational screen never rubber-bands back to
      // /admin/master-control during in-app navigation.
      if (destination === "restore") {
        return { kind: "restore-redirect", scheduledFor, log: `[RouteAccessGate] Restore-pending redirect -> userId=${userId} workspaces=${workspaceCount} path=${pathname} target=/restore-account` };
      } else if (destination === "onboarding") {
        return { kind: "hub-redirect", log: `[RouteAccessGate] Zero-workspace redirect -> userId=${userId} workspaces=${workspaceCount} path=${pathname} target=/workspace-hub` };
      } else if (destination === "selector") {
        return { kind: "hub-redirect", log: `[RouteAccessGate] Selector redirect -> userId=${userId} workspaces=${workspaceCount} path=${pathname} target=/workspace-hub` };
      }
    }

    return { kind: "allow", log: `[RouteAccessGate] Route allowed -> userId=${userId} workspaces=${workspaceCount} path=${pathname} destination=${destination ?? "unknown"}` };
  }, [destination, isAuthenticated, loading, pathname, routing.isLoading, routingSettled, scheduledFor, user, userId, workspaceCount]);

  // الطبع خارج دورة الرسم: سطر تشخيصي واحد لكل قرار جديد بدل سطر في كل رسم.
  useEffect(() => {
    console.log(decision.log);
  }, [decision.log]);

  if (decision.kind === "session-boot") return <SessionBootScreen />;
  if (decision.kind === "routing-boot") return <WorkspaceBootScreen />;
  if (decision.kind === "auth-redirect") return <LoginRedirect />;
  if (decision.kind === "super-admin-trap") return <MasterControlRedirect />;
  if (decision.kind === "onboarding-trap") return <OnboardingTargetRedirect target={decision.target} />;
  if (decision.kind === "restore-redirect") return <RestoreAccountRedirect scheduledFor={decision.scheduledFor} />;
  if (decision.kind === "hub-redirect") return <WorkspaceHubRedirect />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  copy: { marginTop: 14, fontSize: 13, fontWeight: "800", textAlign: "center" },
});