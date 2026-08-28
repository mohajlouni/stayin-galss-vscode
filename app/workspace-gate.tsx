import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useWorkspaceAccess } from "@/lib/workspace-access";

/** Routes a signed-in identity to onboarding, tenant selection, or the active dashboard. */
export default function WorkspaceGateScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { isAuthenticated, loading } = useWorkspaceAccess();
  const routing = trpc.workspace.routing.useQuery(undefined, { enabled: isAuthenticated, retry: false });

  if (!isAuthenticated) return <Redirect href="/auth/login" />;
  if (!loading && !routing.isLoading) {
    return <Redirect href={routing.data?.destination === "dashboard" ? "/(tabs)" : "/auth/select-workspace"} />;
  }

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <View style={styles.content}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.title, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>{language === "ar" ? "جارٍ تجهيز مساحة العمل" : "Preparing your workspace"}</Text>
      <Text style={[styles.detail, { color: colors.muted, textAlign: isRTL ? "right" : "left" }]}>{language === "ar" ? "نتحقق من العضوية والمنشأة النشطة بأمان." : "Securely checking your membership and active property group."}</Text>
    </View>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  title: { marginTop: 18, fontSize: 19, lineHeight: 26, fontWeight: "900" },
  detail: { maxWidth: 290, marginTop: 7, fontSize: 13, lineHeight: 20 },
});
