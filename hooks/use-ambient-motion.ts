import { usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

/**
 * مؤقّت الحركة الخلفية (Ambient Motion Gate)
 * ------------------------------------------
 * مشكلة الإقلاع: كل طبقة خلفية كانت تبدأ حلقة `withRepeat` فور تركيب الشاشة —
 * حتى على شاشات الدخول وأثناء تحميل الجلسة — فيتدافع عمل الـ UI thread مع
 * worklet الخلفية على أول إطار تفاعلي، ويظهر التطبيق بطيئًا في البداية.
 *
 * القاعدة الآن:
 * 1) لا حركة مستمرة أبدًا على مسارات الدخول/الاسترجاع العامة (`/auth/*` …) ولا
 *    قبل اكتمال الإقلاع.
 * 2) على Android تحديدًا (Expo dev client / Fabric + Reanimated 4) تبقى الأوربات
 *    ساكنة تمامًا حتى يكتمل الانتقال إلى تبويبات لوحة التحكم الرئيسية (نُسجّل
 *    ذلك مرة واحدة في متغيّر وحدة فيصبح مسموحًا بعدها في بقية الشاشات).
 * 3) تقليل الحركة أو خروج الشاشة عن التركيز يوقف الحلقة كما كان.
 */

/** مسارات عامة لا يجوز تشغيل حركة خلفية عليها. */
const AUTH_ROUTE_PREFIXES = ["/auth", "/oauth", "/legal", "/logout"] as const;

/**
 * تبويبات لوحة التحكم الرئيسية. expo-router يُسقط اسم المجموعة `(tabs)` من
 * المسار النهائي، فيكون مسار الصفحة الرئيسية `/` وبقية التبويبات باسمها فقط.
 */
const DASHBOARD_TAB_PATHS = ["/calendar", "/crm", "/bookings", "/reports", "/more", "/settings", "/waitlist"] as const;

/**
 * منصة Android هي التي كانت فيها حلقات الخلفية تُسقط الإطارات الأولى في
 * dev client، فنُبقي الخلفية ساكنة فيها حتى الوصول إلى تبويبات لوحة التحكم.
 */
export const DEFER_AMBIENT_LOOPS_ON_ANDROID = Platform.OS === "android";

let dashboardReached = false;

export function markDashboardReached() {
  dashboardReached = true;
}

export function hasReachedDashboard() {
  return dashboardReached;
}

export function isAuthRoute(pathname: string | null | undefined) {
  const path = pathname ?? "";
  return AUTH_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isDashboardTabRoute(pathname: string | null | undefined) {
  const path = pathname ?? "";
  if (path === "" || path === "/") return true;
  return DASHBOARD_TAB_PATHS.some((tab) => path === tab || path.startsWith(`${tab}/`));
}

/**
 * يقرر ما إذا كان يجوز لهذه الطبقة تشغيل حلقات الحركة الآن.
 * يُستدعى من كل طبقات الخلفية بالضبط مرة واحدة لكل طبقة، ولا يبدأ أي عمل نفسه.
 */
export function useAmbientMotionGate(isFocused: boolean, reduceMotion: boolean) {
  const pathname = usePathname();
  const [dashboardReady, setDashboardReady] = useState(hasReachedDashboard);

  useEffect(() => {
    if (dashboardReady || !isDashboardTabRoute(pathname)) return;
    markDashboardReached();
    setDashboardReady(true);
  }, [dashboardReady, pathname]);

  if (reduceMotion || !isFocused) return false;
  if (isAuthRoute(pathname)) return false;
  if (DEFER_AMBIENT_LOOPS_ON_ANDROID && !dashboardReady) return false;
  return true;
}
