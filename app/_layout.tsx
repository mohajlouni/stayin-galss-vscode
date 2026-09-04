import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, I18nManager, Pressable, StyleSheet, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
import { Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold, Tajawal_900Black } from "@expo-google-fonts/tajawal";
import { Cairo_400Regular, Cairo_500Medium, Cairo_600SemiBold, Cairo_700Bold, Cairo_800ExtraBold, Cairo_900Black } from "@expo-google-fonts/cairo";
import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold } from "@expo-google-fonts/ibm-plex-sans-arabic";

import { AppErrorBoundary } from "@/components/error-boundary";
import { useColors } from "@/hooks/use-colors";
import { AppPreferencesProvider } from "@/lib/app-preferences";
import { BookingProvider, useBookings } from "@/lib/booking-store";
import { ChaletScopeProvider } from "@/lib/chalet-scope";
import { useDemoMode } from "@/lib/demo-mode";
import { DemoModeProvider } from "@/lib/demo-mode";
import { ThemeProvider } from "@/lib/theme-provider";
import { UndoDeleteBanner } from "@/components/undo-delete-banner";
import { createTRPCClient, trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { useInternetAvailability } from "@/lib/network-status";
import { AuthSessionProvider } from "@/lib/auth-session";
import { RouteAccessGate } from "@/components/route-access-gate";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  
  useEffect(() => {
    let mounted = true;
    const loadFonts = async () => {
      try {
await Font.loadAsync({
        "Tajawal-Regular": Tajawal_400Regular,
        "Tajawal-Medium": Tajawal_500Medium,
        "Tajawal-SemiBold": Tajawal_700Bold,
        "Tajawal-Bold": Tajawal_800ExtraBold,
        "Tajawal-Black": Tajawal_900Black,
        "Cairo-Regular": Cairo_400Regular,
        "Cairo-Medium": Cairo_500Medium,
        "Cairo-SemiBold": Cairo_600SemiBold,
        "Cairo-Bold": Cairo_700Bold,
        "Cairo-ExtraBold": Cairo_800ExtraBold,
        "Cairo-Black": Cairo_900Black,
        "IBM-Plex-Sans-Arabic-Regular": IBMPlexSansArabic_400Regular,
        "IBM-Plex-Sans-Arabic-Medium": IBMPlexSansArabic_500Medium,
        "IBM-Plex-Sans-Arabic-SemiBold": IBMPlexSansArabic_600SemiBold,
        "IBM-Plex-Sans-Arabic-Bold": IBMPlexSansArabic_700Bold,
      });
        if (mounted) {
          setFontsLoaded(true);
          await SplashScreen.hideAsync();
        }
      } catch (e) {
        console.warn("Font loading failed, falling back to system fonts", e);
        if (mounted) {
          setFontsLoaded(true);
          await SplashScreen.hideAsync();
        }
      }
    };
    loadFonts();
    return () => { mounted = false; };
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="auto" />
        <Text style={styles.loadingText}>جاري تحميل التطبيق…</Text>
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <TrpcProvider>
        <AuthSessionProvider>
          <DemoModeProvider>
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
          </DemoModeProvider>
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
  return <><StatusBar style="auto" /><Stack screenOptions={stackScreenOptions} /><DemoBanner /><DemoNotice /><WorkspaceSyncBanner /><UndoDeleteBanner /></>;
}

function DemoBanner() {
  const { isDemo, exitDemo } = useDemoMode();
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  if (!isDemo) return null;
  const exit = () => {
    exitDemo();
  };
  return <View pointerEvents="box-none" style={styles.demoLayer}><View style={[styles.demoBanner, { backgroundColor: colors.primary, flexDirection: row }]}><Pressable onPress={exit} style={({ pressed }) => [styles.demoCopy, { opacity: pressed ? 0.85 : 1 }]}><Text style={{ color: colors.background, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "👁️ الوضع التجريبي مفعّل — بيانات استعراضية غير محفوظة" : "👁️ Demo mode — preview data, nothing saved"}</Text><Text style={{ color: colors.background, fontSize: 10, lineHeight: 15, marginTop: 2, opacity: 0.94, textAlign: align }}>{language === "ar" ? "كل ما تفعله هنا يظهر فقط أثناء الجولة ولا يُحفظ في حسابك." : "Everything you do here stays in-memory and is never saved to your account."}</Text></Pressable><Pressable onPress={exit} style={({ pressed }) => [styles.demoExit, { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? "تأسيس منشأتك الحقيقية الآن" : "Set up your real property"}</Text></Pressable></View></View>;
}

function DemoNotice() {
  const { isDemo, demoNotice, clearDemoNotice } = useDemoMode();
  const { isRTL, language } = useI18n();
  const colors = useColors();
  const align = isRTL ? "right" : "left";
  useEffect(() => {
    if (!demoNotice) return;
    const timer = setTimeout(() => clearDemoNotice(), 3200);
    return () => clearTimeout(timer);
  }, [demoNotice, clearDemoNotice]);
  if (!demoNotice) return null;
  return <View pointerEvents="box-none" style={styles.noticeLayer}><View style={[styles.noticeToast, { backgroundColor: colors.foreground, opacity: isDemo ? 0.97 : 0.97 }]}><Text style={{ color: colors.background, fontSize: 12, lineHeight: 18, fontWeight: "800", textAlign: align }}>{language === "ar" ? demoNotice : "This is a demo feature and will not be saved. Create your real property to use it."}</Text></View></View>;
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

const styles = StyleSheet.create({ 
  demoLayer: { position: "absolute", top: 8, left: 12, right: 12, zIndex: 55 }, 
  demoBanner: { borderRadius: 15, padding: 10, alignItems: "center", gap: 10, elevation: 7, shadowColor: "#0B1F1B", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, 
  demoCopy: { flex: 1, minWidth: 0 }, 
  demoExit: { minHeight: 34, borderRadius: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: 11, flexShrink: 0 },
  noticeLayer: { position: "absolute", left: 16, right: 16, bottom: 26, zIndex: 60 }, 
  noticeToast: { borderRadius: 14, padding: 13, elevation: 8, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  syncLayer: { position: "absolute", top: 8, left: 12, right: 12, zIndex: 50 }, 
  syncBanner: { borderRadius: 15, padding: 10, alignItems: "center", gap: 10, elevation: 7, shadowColor: "#0B1F1B", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, 
  syncCopy: { flex: 1, minWidth: 0 }, 
  syncButton: { minHeight: 34, borderRadius: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: 11, flexShrink: 0 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#070B10" },
  loadingText: { color: "#FF6B47", fontSize: 16, fontWeight: "600", fontFamily: "Tajawal-Medium" },
});
