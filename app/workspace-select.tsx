import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useWorkspaceAccess } from "@/lib/workspace-access";

/** Lets a signed-in identity select an existing property group or create a new owned group. */
export default function WorkspaceSelectScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { isAuthenticated } = useWorkspaceAccess();
  const routing = trpc.workspace.routing.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const selectWorkspace = trpc.workspace.select.useMutation();
  const createWorkspace = trpc.workspace.create.useMutation();
  const [name, setName] = useState("");
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  if (!isAuthenticated) return <Redirect href="/auth/login" />;
  if (routing.data?.destination === "dashboard") return <Redirect href="/(tabs)" />;

  const select = async (workspaceId: number) => {
    try {
      await selectWorkspace.mutateAsync({ workspaceId });
      await routing.refetch();
      router.replace("/(tabs)");
    } catch {
      Alert.alert(language === "ar" ? "تعذر تغيير المجموعة" : "Could not switch group", language === "ar" ? "تحقق من صلاحية الوصول ثم حاول مرة أخرى." : "Check your access and try again.");
    }
  };
  const create = async () => {
    if (name.trim().length < 2) {
      Alert.alert(language === "ar" ? "اسم مطلوب" : "Name required", language === "ar" ? "أدخل اسم مجموعة المنشآت." : "Enter a property group name.");
      return;
    }
    try {
      await createWorkspace.mutateAsync({ name: name.trim() });
      await routing.refetch();
      router.replace("/(tabs)");
    } catch {
      Alert.alert(language === "ar" ? "تعذر إنشاء المجموعة" : "Could not create group", language === "ar" ? "حاول باسم آخر أو تحقق من الاتصال." : "Try another name or check your connection.");
    }
  };

  const memberships = routing.data?.memberships ?? [];
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.hero, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "48" }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="business" size={25} color={colors.primary} /></View>
        <Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? (memberships.length > 1 ? "اختر المنشأة للعمل" : "اختر مجموعة المنشآت") : "Choose a property group"}</Text>
        <Text style={[styles.detail, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "تفصل المجموعة حجوزاتها وتقاريرها وسجلها وفريقها عن أي مجموعة أخرى." : "Each group keeps its bookings, reports, activity, and team isolated."}</Text>
      </View>

      {routing.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : memberships.length ? <>
        <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "مجموعاتك" : "Your groups"}</Text>
        {memberships.map(({ workspace, member }) => <Pressable key={workspace.id} disabled={selectWorkspace.isPending} onPress={() => void select(workspace.id)} style={({ pressed }) => [styles.workspaceCard, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row, opacity: pressed || selectWorkspace.isPending ? 0.68 : 1 }]}>
          <View style={[styles.workspaceIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="holiday-village" size={22} color={colors.primary} /></View>
          <View style={styles.flex}><Text style={[styles.workspaceName, { color: colors.foreground, textAlign: align }]}>{workspace.name}</Text><Text style={[styles.workspaceMeta, { color: colors.muted, textAlign: align }]}>{language === "ar" ? `دورك: ${member.role === "owner" ? "المالك" : member.role === "admin" ? "مدير" : member.role === "staff" ? "موظف" : "ضيف"}` : `Role: ${member.role}`}</Text></View>
          <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={24} color={colors.muted} />
        </Pressable>)}
      </> : null}

      <View style={[styles.createCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>{memberships.length ? (language === "ar" ? "إضافة مجموعة جديدة" : "Add a new group") : (language === "ar" ? "أنشئ مجموعتك الأولى" : "Create your first group")}</Text>
        <Text style={[styles.formDetail, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "ستصبح مالك المجموعة الجديدة، ويمكنك دعوت فريقها لاحقًا." : "You will own the new group and can invite its team later."}</Text>
        <TextInput value={name} onChangeText={setName} placeholder={language === "ar" ? "مثال: مجموعة شاليهات النوح" : "e.g. Al-Noah Chalets"} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} />
        <Pressable disabled={createWorkspace.isPending} onPress={() => void create()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed || createWorkspace.isPending ? 0.66 : 1 }]}><MaterialIcons name="add-business" size={19} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{createWorkspace.isPending ? (language === "ar" ? "جارٍ الإنشاء" : "Creating") : (language === "ar" ? "إنشاء مجموعة المنشآت" : "Create property group")}</Text></Pressable>
        {!memberships.length ? <Pressable onPress={() => router.push("/user-management")} style={({ pressed }) => [styles.inviteLink, { opacity: pressed ? 0.68 : 1 }]}><Text style={{ color: colors.primary, fontWeight: "800", textAlign: "center" }}>{language === "ar" ? "لديك دعوة؟ فعّلها من هنا" : "Have an invitation? Activate it here"}</Text></Pressable> : null}
      </View>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 44 }, hero: { borderWidth: 1, borderRadius: 22, padding: 17 }, heroIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" }, title: { marginTop: 12, fontSize: 22, lineHeight: 30, fontWeight: "900" }, detail: { marginTop: 6, fontSize: 12, lineHeight: 19 }, loading: { marginTop: 34 }, sectionTitle: { marginTop: 22, marginBottom: 8, fontSize: 14, lineHeight: 21, fontWeight: "900" }, workspaceCard: { minHeight: 76, alignItems: "center", gap: 11, borderWidth: 1, borderRadius: 18, padding: 12, marginBottom: 8 }, workspaceIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, workspaceName: { fontSize: 15, fontWeight: "900" }, workspaceMeta: { marginTop: 4, fontSize: 11 }, createCard: { marginTop: 16, borderWidth: 1, borderRadius: 20, padding: 14 }, formDetail: { fontSize: 12, lineHeight: 18, marginBottom: 12 }, input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12 }, primary: { minHeight: 50, borderRadius: 13, marginTop: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, inviteLink: { marginTop: 14, paddingVertical: 7 },
});
