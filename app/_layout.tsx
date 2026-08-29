import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";

import { AppErrorBoundary } from "@/components/error-boundary";
import { useColors } from "@/hooks/use-colors";
import { AppPreferencesProvider } from "@/lib/app-preferences";
import { BookingProvider, useBookings } from "@/lib/booking-store";
import { ChaletScopeProvider } from "@/lib/chalet-scope";
import { ThemeProvider } from "@/lib/theme-provider";
import { UndoDeleteBanner } from "@/components/undo-delete-banner";
import { createTRPCClient, trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { useInternetAvailability } from "@/lib/network-status";
import { AuthSessionProvider } from "@/lib/auth-session";
import { RouteAccessGate } from "@/components/route-access-gate";

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <TrpcProvider>
        <AuthSessionProvider>
          <BookingProvider>
            <ChaletScopeProvider>
              <AppPreferencesProvider>
                <ThemeProvider>
                  <RouteAccessGate>
                    <AppNavigator />
                  </RouteAccessGate>
                </ThemeProvider>
              </AppPreferencesProvider>
            </ChaletScopeProvider>
          </BookingProvider>
        </AuthSessionProvider>
      </TrpcProvider>
    </AppErrorBoundary>
  );
}

function TrpcProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createTRPCClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

function AppNavigator() {
  const colors = useColors();
  const [reduceMotion, setReduceMotion] = useState(false);
  const stackScreenOptions = useMemo(() => ({
    headerShown: false,
    animation: reduceMotion ? "none" as const : "fade_from_bottom" as const,
    contentStyle: { backgroundColor: colors.background },
  }), [colors.background, reduceMotion]);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (active) setReduceMotion(enabled); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  return <><StatusBar style="auto" /><Stack screenOptions={stackScreenOptions} /><WorkspaceSyncBanner /><UndoDeleteBanner /></>;
}

function WorkspaceSyncBanner() {
  const { syncConflict, refreshWorkspaceData } = useBookings();
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const internetAvailability = useInternetAvailability();
  const [refreshing, setRefreshing] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  if (!syncConflict) return null;
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await refreshWorkspaceData(); } finally { setRefreshing(false); }
  };
  const internetReachable = internetAvailability === true;
  return <View pointerEvents="box-none" style={styles.syncLayer}><View style={[styles.syncBanner, { backgroundColor: colors.warning + "F2", flexDirection: row }]}><View style={styles.syncCopy}><Text style={{ color: colors.background, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تعارض في مزامنة البيانات" : "Workspace sync conflict"}</Text><Text style={{ color: colors.background, fontSize: 10, lineHeight: 15, marginTop: 2, opacity: 0.94, textAlign: align }}>{language === "ar" ? "حُفظت نسخة إنقاذ محلية. يعني ذلك أن جهازًا آخر حفظ بيانات أحدث؛ اضغط تحميل النسخة الأحدث ثم راجع الحجوزات. لن تُحذف بياناتك المحلية قبل إنشاء نسخة الإنقاذ." : "A local rescue copy was saved. Another device has newer data; load the latest workspace copy and review bookings. Your local data is not deleted before rescue backup."}</Text><Text style={{ color: colors.background, fontSize: 10, fontWeight: "800", marginTop: 3, opacity: 0.94, textAlign: align }}>{internetReachable ? (language === "ar" ? "الإنترنت متاح، يمكنك تحميل النسخة الأحدث الآن." : "Internet is available. You can load the latest copy now.") : (language === "ar" ? "لا يوجد اتصال بالإنترنت؛ اتصل ثم حاول تحميل النسخة الأحدث." : "You are offline. Connect to the internet, then load the latest copy.")}</Text></View><Pressable disabled={refreshing || !internetReachable} onPress={() => void refresh()} style={({ pressed }) => [styles.syncButton, { backgroundColor: colors.background, opacity: pressed || refreshing || !internetReachable ? 0.55 : 1 }]}><Text style={{ color: colors.warning, fontSize: 11, fontWeight: "900" }}>{refreshing ? (language === "ar" ? "جارٍ التحميل" : "Loading") : (language === "ar" ? "تحميل الأحدث" : "Load latest")}</Text></Pressable></View></View>;
}

const styles = StyleSheet.create({ syncLayer: { position: "absolute", top: 8, left: 12, right: 12, zIndex: 50 }, syncBanner: { borderRadius: 15, padding: 10, alignItems: "center", gap: 10, elevation: 7, shadowColor: "#0B1F1B", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, syncCopy: { flex: 1, minWidth: 0 }, syncButton: { minHeight: 34, borderRadius: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: 11, flexShrink: 0 } });
