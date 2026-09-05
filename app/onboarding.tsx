import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router, usePathname } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useDemoMode } from "@/lib/demo-mode";
import { trpc } from "@/lib/trpc";
import { useAuthSession } from "@/lib/auth-session";

/**
 * Strict onboarding role gateway. Every zero-workspace account is forced here
 * by RouteAccessGate (typing any internal URL bounces straight back) and cannot
 * escape except by completing one of the three paths:
 * 1. Owner — enters the /create-workspace wizard (name + basic settings).
 * 2. Staff / guard — activates a 6-digit invite code sent by the owner.
 * 3. Demo — in-memory preview tour that never persists anything.
 *
 * A back affordance is intentionally omitted: nothing on this screen allows
 * navigating backwards, and the RouteAccessGate re-routes any protected path
 * back here while the user still has zero workspaces.
 */
export default function OnboardingScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { isAuthenticated, loading, routing, user, logout } = useAuthSession();
  const { isDemo, enterDemo, exitDemo } = useDemoMode();
  const pathname = usePathname();
  const workspaceCount = routing.data?.memberships?.length ?? 0;
  const acceptCode = trpc.workspace.acceptInvitationCode.useMutation();
  const [inviteCode, setInviteCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  if (isAuthenticated && !routing.isLoading) {
    console.log(`[OnboardingGate] userId=${user?.id ?? "none"} workspaces=${workspaceCount} path=${pathname} destination=${routing.data?.destination ?? "unknown"} demo=${isDemo}`);
  }

  if (!isAuthenticated) return <Redirect href="/auth/login" />;
  if (isAuthenticated && !loading && !routing.isLoading) {
    if (routing.data?.destination === "dashboard") return <Redirect href="/(tabs)" />;
    if (routing.data?.destination === "selector") return <Redirect href="/auth/select-workspace" />;
    if (routing.data?.destination === "restore") return <Redirect href="/restore-account" />;
  }

  const handleLogout = () => {
    void logout();
    router.replace("/auth/login");
  };

  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  const activateCode = async () => {
    const code = inviteCode.replace(/\s+/g, "").trim();
    if (code.length !== 6) {
      setCodeError(language === "ar" ? "أدخل رمز الدعوة الكامل المكوّن من 6 أرقام." : "Enter the complete 6-digit invite code.");
      return;
    }
    setCodeBusy(true);
    setCodeError(null);
    try {
      await acceptCode.mutateAsync({ code });
      exitDemo();
      await routing.refetch();
      router.replace("/(tabs)");
    } catch {
      setCodeError(language === "ar" ? "رمز الدعوة غير صالح أو منتهي الصلاحية. تأكد من الكود المرسل من المالك." : "The invite code is invalid or has expired. Check the code sent by the owner.");
    } finally {
      setCodeBusy(false);
    }
  };

  const startDemo = () => {
    enterDemo();
    router.replace("/(tabs)");
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.topBar, { flexDirection: row }]}>
        <View style={styles.flex} />
        <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تسجيل الخروج" : "Sign out"} onPress={handleLogout} style={({ pressed }) => [styles.logout, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
          <MaterialIcons name="logout" size={17} color={colors.muted} />
          <Text style={{ color: colors.muted, fontWeight: "800", fontSize: 12 }}>{language === "ar" ? "تسجيل الخروج" : "Sign out"}</Text>
        </Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "48" }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="apartment" size={26} color={colors.primary} /></View>
        <Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "كيف تريد استخدام StayIn؟" : "How do you want to use StayIn?"}</Text>
        <Text style={[styles.detail, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "اختر أحد الخيارات التالية للمتابعة. لا يمكنك تجاوز هذه الخطوة قبل اختيار دورك وربط منشأتك." : "Pick one of the options below to continue. You cannot skip this step before choosing your role and linking your property."}</Text>
      </View>

      <Pressable onPress={() => router.push("/create-workspace")} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row, opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.cardIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="storefront" size={22} color={colors.primary} /></View>
        <View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "900", textAlign: align }}>{language === "ar" ? "أنا صاحب منشأة / مالك" : "I own a property / owner"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "أنشئ منشأتك الأولى بالاسم والإعدادات الأساسية، وستصبح مالكها مباشرة." : "Create your first property with its name and basic settings, then become its owner."}</Text></View>
        <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={24} color={colors.muted} />
      </Pressable>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={{ flexDirection: row as "row" | "row-reverse" }}>
          <View style={[styles.cardIcon, { backgroundColor: colors.success + "18" }]}><MaterialIcons name="badge" size={22} color={colors.success} /></View>
          <View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "900", textAlign: align }}>{language === "ar" ? "أنا موظف / حارس لدي رمز دعوة" : "I am staff / a guard with an invite code"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "أدخل رمز الدعوة المكوّن من 6 أرقام المرسل من المالك لتفعيل المنشأة ورتبتك." : "Enter the 6-digit code sent by the owner to activate the property and your rank."}</Text></View>
        </View>
        <TextInput value={inviteCode} onChangeText={(value) => { setInviteCode(value.replace(/[^\d]/g, "").slice(0, 6)); setCodeError(null); }} placeholder={language === "ar" ? "رمز الدعوة — 6 أرقام" : "Invite code — 6 digits"} keyboardType="number-pad" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: codeError ? colors.error : colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} accessibilityLabel={language === "ar" ? "رمز الدعوة" : "Invite code"} />
        {codeError ? <View accessibilityLiveRegion="polite" style={[styles.inlineError, { backgroundColor: colors.error + "12", flexDirection: row }]}><MaterialIcons name="error-outline" size={16} color={colors.error} /><Text style={[styles.flex, { color: colors.error, fontSize: 11, fontWeight: "800", textAlign: align }]}>{codeError}</Text></View> : null}
        <Pressable disabled={codeBusy} onPress={() => void activateCode()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.success, opacity: pressed || codeBusy ? 0.66 : 1, flexDirection: row }]}>
          {codeBusy ? <ActivityIndicator color={colors.background} /> : <MaterialIcons name="vpn-key" size={19} color={colors.background} />}
          <Text style={{ color: colors.background, fontWeight: "900" }}>{codeBusy ? (language === "ar" ? "جارٍ التحقق…" : "Verifying…") : (language === "ar" ? "تفعيل رمز الدعوة" : "Activate invite code")}</Text>
        </Pressable>
      </View>

      <Pressable onPress={startDemo} style={({ pressed }) => [styles.card, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "48", flexDirection: row, opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.cardIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="explore" size={22} color={colors.primary} /></View>
        <View style={styles.flex}><Text style={{ color: colors.primary, fontWeight: "900", textAlign: align }}>{language === "ar" ? "👁️ استكشاف بجولة تجريبية (Demo)" : "👁️ Explore — demo tour"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "فعّل بيئة استعراضية ببيانات تجريبية لا تُحفظ في حسابك لترى إمكانيات النظام." : "Enable a preview environment with sample data that is never saved, to see what the system can do."}</Text></View>
        <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={24} color={colors.primary} />
      </Pressable>

      {loading || routing.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 44 }, topBar: { alignItems: "center", gap: 9, marginBottom: 12 }, logout: { minHeight: 36, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", gap: 6 }, hero: { borderWidth: 1, borderRadius: 22, padding: 17 }, heroIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" }, title: { marginTop: 12, fontSize: 22, lineHeight: 30, fontWeight: "900" }, detail: { marginTop: 6, fontSize: 12, lineHeight: 19 }, card: { minHeight: 82, alignItems: "center", gap: 11, borderWidth: 1, borderRadius: 18, padding: 12, marginTop: 12 }, cardIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 }, flex: { flex: 1, minWidth: 0 }, input: { minHeight: 50, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, marginTop: 10 }, inlineError: { minHeight: 38, borderRadius: 11, padding: 9, alignItems: "center", gap: 7, marginTop: 8 }, primary: { minHeight: 48, borderRadius: 13, marginTop: 10, alignItems: "center", justifyContent: "center", gap: 7 }, loading: { marginTop: 30 },
});