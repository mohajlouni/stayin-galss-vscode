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
import { useWorkspaceAccess } from "@/lib/workspace-access";

/**
 * Locked workspace setup gate. Users with zero property-group memberships are
 * forced here (via RouteAccessGate) and must either create a property, activate
 * an invitation, or explore the fully in-memory demo tour before the app unlocks.
 *
 * A back affordance is intentionally omitted and guarded: the RouteAccessGate
 * re-routes any protected path back here whenever the user still has zero
 * workspaces, so there is no way to slip out into empty/broken pages.
 */
export default function WorkspaceGateScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { isAuthenticated, loading } = useWorkspaceAccess();
  const { user, logout } = useAuthSession();
  const { isDemo, enterDemo, exitDemo } = useDemoMode();
  const pathname = usePathname();
  const routing = trpc.workspace.routing.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const workspaceCount = routing.data?.memberships?.length ?? 0;

  if (isAuthenticated && !routing.isLoading) {
    console.log(`[WorkspaceGate] userId=${user?.id ?? "none"} workspaces=${workspaceCount} path=${pathname} destination=${routing.data?.destination ?? "unknown"} demo=${isDemo}`);
  }

  const handleLogout = () => {
    void logout();
    router.replace("/auth/login");
  };
  const createWorkspace = trpc.workspace.create.useMutation();
  const [name, setName] = useState("");
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  if (!isAuthenticated) return <Redirect href="/auth/login" />;
  if (!loading && !routing.isLoading) {
    if (!isDemo && routing.data?.destination === "dashboard") {
      return <Redirect href={routing.data?.destination === "dashboard" ? "/(tabs)" : "/auth/select-workspace"} />;
    }
    if (isDemo) {
      return <Redirect href={routing.data?.destination === "dashboard" ? "/(tabs)" : "/(tabs)"} />;
    }
  }

  const create = async () => {
    if (name.trim().length < 2) {
      Alert.alert(language === "ar" ? "اسم مطلوب" : "Name required", language === "ar" ? "أدخل اسم مجموعة المنشآت." : "Enter a property group name.");
      return;
    }
    try {
      await createWorkspace.mutateAsync({ name: name.trim() });
      exitDemo();
      await routing.refetch();
      router.replace("/(tabs)");
    } catch {
      Alert.alert(language === "ar" ? "تعذر إنشاء المجموعة" : "Could not create group", language === "ar" ? "حاول باسم آخر أو تحقق من الاتصال." : "Try another name or check your connection.");
    }
  };

  const startDemo = () => {
    enterDemo();
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
        <View style={[styles.heroIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="lock" size={26} color={colors.primary} /></View>
        <Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "أنشئ منشأتك للبدء" : "Set up your property to start"}</Text>
        <Text style={[styles.detail, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "لا توجد منشأة مرتبطة بحسابك بعد. أنشئ مجموعة منشآت، فعّل دعوة، أو استكشف التطبيق ببيانات تجريبية." : "No property is linked to your account yet. Create a group, activate an invitation, or explore the app with preview data."}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "أنشئ مجموعتك الأولى" : "Create your first group"}</Text>
        <Text style={[styles.formDetail, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "ستصبح مالك المجموعة الجديدة، ويمكنك دعوة فريقها لاحقًا." : "You will own the new group and can invite its team later."}</Text>
        <TextInput value={name} onChangeText={setName} placeholder={language === "ar" ? "مثال: مجموعة شاليهات النوح" : "e.g. Al-Noah Chalets"} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} />
        <Pressable disabled={createWorkspace.isPending} onPress={() => void create()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed || createWorkspace.isPending ? 0.66 : 1, flexDirection: row }]}><MaterialIcons name="add-business" size={19} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{createWorkspace.isPending ? (language === "ar" ? "جارٍ الإنشاء" : "Creating") : (language === "ar" ? "إنشاء مجموعة المنشآت" : "Create property group")}</Text></Pressable>
      </View>

      <Pressable onPress={() => router.push("/user-management")} style={({ pressed }) => [styles.rowAction, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row, opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.rowIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="mail" size={21} color={colors.primary} /></View>
        <View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "900", textAlign: align }}>{language === "ar" ? "لديك دعوة؟" : "Have an invitation?"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "فعّل رمز الدعوة المرسل إليك من المالك." : "Activate the invitation code sent by the owner."}</Text></View>
        <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={24} color={colors.muted} />
      </Pressable>

      <Pressable onPress={startDemo} style={({ pressed }) => [styles.rowAction, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "48", flexDirection: row, opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.rowIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="explore" size={21} color={colors.primary} /></View>
        <View style={styles.flex}><Text style={{ color: colors.primary, fontWeight: "900", textAlign: align }}>{language === "ar" ? "👁️ استكشف التطبيق — جولة تجريبية" : "👁️ Explore the app — demo tour"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "تصفّح بيانات استعراضية بدون حفظ أي شيء في حسابك." : "Browse preview data without saving anything to your account."}</Text></View>
        <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={24} color={colors.primary} />
      </Pressable>

      {loading || routing.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 44 }, topBar: { alignItems: "center", gap: 9, marginBottom: 12 }, logout: { minHeight: 36, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", gap: 6 }, hero: { borderWidth: 1, borderRadius: 22, padding: 17 }, heroIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" }, title: { marginTop: 12, fontSize: 22, lineHeight: 30, fontWeight: "900" }, detail: { marginTop: 6, fontSize: 12, lineHeight: 19 }, card: { marginTop: 16, borderWidth: 1, borderRadius: 20, padding: 14 }, sectionTitle: { marginTop: 22, marginBottom: 8, fontSize: 14, lineHeight: 21, fontWeight: "900" }, formDetail: { fontSize: 12, lineHeight: 18, marginBottom: 12 }, input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12 }, primary: { minHeight: 50, borderRadius: 13, marginTop: 10, alignItems: "center", justifyContent: "center", gap: 7 }, rowAction: { minHeight: 74, alignItems: "center", gap: 11, borderWidth: 1, borderRadius: 18, padding: 12, marginTop: 12 }, rowIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, loading: { marginTop: 30 },
});
