import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router, usePathname } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useAuthSession } from "@/lib/auth-session";

const CURRENCY_OPTIONS = ["د.أ", "ر.س", "د.إ", "$"] as const;

/**
 * Unified Workspace & Role Hub — the single mandatory entry screen for every
 * StayIn session. It replaced the scattered legacy gates (onboarding role
 * picker, create-workspace wizard, workspace-select picker, workspace-gate):
 *
 * - A brand-new account, an account that finished its email-OTP sign-up, or any
 *   session with no active workspace (activeWorkspaceId == null) lands here
 *   exclusively; RouteAccessGate refuses every internal route until one of the
 *   paths below resolves the state.
 * - Users with existing workspaces see their property cards for direct
 *   selection / switching, plus the same create + invite-code options.
 * - Owners create their first property through an inline quick Modal
 *   (name, currency, phone) and become the owner immediately.
 * - Employees / guards enter a 6-digit invite code right here on the page and
 *   are linked to the workspace + permissions on activation.
 */
export default function WorkspaceHubScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { isAuthenticated, loading, routing, user, logout } = useAuthSession();
  const { activeWorkspaceId } = useWorkspaceAccess();
  const pathname = usePathname();
  const utils = trpc.useUtils();
  const selectWorkspace = trpc.workspace.select.useMutation();
  const createWorkspace = trpc.workspace.create.useMutation();
  const acceptCode = trpc.workspace.acceptInvitationCode.useMutation();
  const setAlwaysPrompt = trpc.workspace.setAlwaysPrompt.useMutation();

  const [createVisible, setCreateVisible] = useState(false);
  const [wsName, setWsName] = useState("");
  const [wsPhone, setWsPhone] = useState("");
  const [wsCurrency, setWsCurrency] = useState<string>(CURRENCY_OPTIONS[0]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [switchBusy, setSwitchBusy] = useState<number | null>(null);

  const memberships = routing.data?.memberships ?? [];
  const workspaceCount = memberships.length;
  const activeWorkspace = routing.data?.activeWorkspace?.workspace ?? null;
  const alwaysPrompt = Boolean(routing.data?.alwaysPrompt);

  if (isAuthenticated && !routing.isLoading) {
    console.log(`[WorkspaceHub] userId=${user?.id ?? "none"} workspaces=${workspaceCount} path=${pathname} destination=${routing.data?.destination ?? "unknown"}`);
  }

  if (!isAuthenticated) return <Redirect href="/auth/login" />;
  // The unified hub doubles as the workspace switcher for the Super Admin too:
  // after the initial login lands them on /admin/master-control, choosing
  // "المنشأة النشطة" here lets the owner pick a workspace (from the Workspaces
  // Directory memberships) so /calendar, /units and the rest of the operational
  // app render real data instead of bouncing back to the command center.
  if (isAuthenticated && !loading && !routing.isLoading && routing.data?.destination === "restore") {
    return <Redirect href={{ pathname: "/restore-account", params: routing.data?.deletion?.scheduledFor ? { scheduledFor: routing.data.deletion.scheduledFor } : {} }} />;
  }
  if (isAuthenticated && !loading && !routing.isLoading && routing.data?.destination === "dashboard") {
    return <Redirect href="/(tabs)" />;
  }

  const handleLogout = () => {
    void logout();
    router.replace("/auth/login");
  };

  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const pickTitle = workspaceCount > 1 ? "اختر المنشأة للعمل" : "منشآتك";

  const resume = () => router.replace("/(tabs)");

  const select = async (workspaceId: number) => {
    setSwitchBusy(workspaceId);
    try {
      await selectWorkspace.mutateAsync({ workspaceId });
      await utils.workspace.invalidate();
      router.replace("/(tabs)");
    } catch {
      Alert.alert(language === "ar" ? "تعذر تغيير المنشأة" : "Could not switch property", language === "ar" ? "تحقق من صلاحية الوصول ثم حاول مرة أخرى." : "Check your access and try again.");
    } finally {
      setSwitchBusy(null);
    }
  };

  const create = async () => {
    if (isSubmitting) return;
    const trimmed = wsName.trim();
    if (trimmed.length < 2) {
      setFormError(language === "ar" ? "أدخل اسم المنشأة (مثال: قرية أمواج السياحية)." : "Enter a property name (e.g. Amaaj tourist village).");
      return;
    }
    const duplicate = memberships.some(({ workspace }) => workspace.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      setFormError(language === "ar" ? "يوجد لديك منشأة بهذا الاسم بالفعل. اختر اسمًا مختلفًا." : "You already have a property with this exact name. Choose a different one.");
      return;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      const result = await createWorkspace.mutateAsync({ name: trimmed, phone: wsPhone.trim(), currency: wsCurrency.trim() });
      // The backend already re-activates the freshly created workspace so the
      // subsequent invalidate immediately surfaces it as the active group.
      // A successful HTTP response closes the modal and clears the form BEFORE
      // any cache refresh: post-success invalidate is best-effort and must never
      // land in the catch below, otherwise the "تعذر إنشاء المنشأة" banner shows
      // even though the backend succeeded (false network error).
      setCreateVisible(false);
      setWsName("");
      setWsPhone("");
      setWsCurrency(CURRENCY_OPTIONS[0]);
      setWelcomeVisible(true);
      try {
        await utils.workspace.invalidate();
      } catch {
        // Cache refresh is best-effort; never mark a successful creation as failed.
      }
    } catch (error) {
      const trpcError = error as { data?: { code?: string } } | null;
      setFormError(
        trpcError?.data?.code === "CONFLICT"
          ? (language === "ar" ? "يوجد منشأة مسجلة مسبقاً بهذا الاسم، يرجى اختيار اسم مختلف." : "A property with this name is already registered. Please choose a different name.")
          : (language === "ar" ? "تعذر إنشاء المنشأة. تحقق من الاتصال أو جرّب اسمًا آخر." : "Could not create the property. Check your connection or try another name."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const activate = async () => {
    const code = inviteCode.replace(/\s+/g, "").trim();
    if (code.length !== 6) {
      setCodeError(language === "ar" ? "أدخل رمز الدعوة الكامل المكوّن من 6 أرقام." : "Enter the complete 6-digit invite code.");
      return;
    }
    setCodeBusy(true);
    setCodeError(null);
    try {
      await acceptCode.mutateAsync({ code });
      setInviteCode("");
      await utils.workspace.invalidate();
      router.replace("/(tabs)");
    } catch {
      setCodeError(language === "ar" ? "رمز الدعوة غير صالح أو منتهي الصلاحية. تأكد من الكود المرسل من المالك." : "The invite code is invalid or has expired. Check the code sent by the owner.");
    } finally {
      setCodeBusy(false);
    }
  };

  const toggleAlwaysPrompt = async (value: boolean) => {
    try {
      await setAlwaysPrompt.mutateAsync({ enabled: value });
      await utils.workspace.invalidate();
    } catch {
      Alert.alert(language === "ar" ? "تعذر حفظ التفضيل" : "Could not save the preference", language === "ar" ? "تحقق من اتصالك ثم أعد المحاولة." : "Check your connection and retry.");
    }
  };

  const roleLabel = (role: string) => role === "owner" ? (language === "ar" ? "المالك" : "Owner") : role === "admin" ? (language === "ar" ? "مدير" : "Manager") : role === "staff" ? (language === "ar" ? "موظف" : "Staff") : role === "caretaker" ? (language === "ar" ? "حارس" : "Caretaker") : (language === "ar" ? "ضيف" : "Guest");

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
        <View style={[styles.heroIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="hub" size={27} color={colors.primary} /></View>
        <Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "محور المنشأة والدور" : "Workspace & role hub"}</Text>
        <Text style={[styles.detail, { color: colors.muted, textAlign: align }]}>{language === "ar"
          ? "هذه بوابة العمل في StayIn: اختر منشأتك أو بدّل بين منشآتك، وأنشئ المنشأة الأولى لتصبح مالكًا، أو فعّل رمز دعوة الموظف والحارس لتصل إلى مهامك الميدانية."
          : "This is the StayIn entry hub: select or switch your property, create your first property to become its owner, or activate a staff / guard invite code to reach your field tasks."}</Text>
        {activeWorkspace ? <Pressable onPress={resume} style={({ pressed }) => [styles.resumeButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1, flexDirection: row }]}><MaterialIcons name="play-arrow" size={20} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{language === "ar" ? `استئناف العمل في ${activeWorkspace.name}` : `Resume in ${activeWorkspace.name}`}</Text></Pressable> : null}
      </View>

      {workspaceCount ? <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? pickTitle : (workspaceCount > 1 ? "Select a workspace to work" : "Your workspaces")}</Text>
        {workspaceCount > 1 ? <Text style={[styles.sectionDetail, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "لديك حق الوصول لأكثر من منشأة، اختر المنشأة المطلوبة للمتابعة." : "You can access more than one property — choose the one you want to continue with."}</Text> : null}
        {memberships.map(({ workspace, member }) => {
          const isActiveId = workspace.id === (activeWorkspaceId ?? activeWorkspace?.id);
          const busy = switchBusy === workspace.id || selectWorkspace.isPending;
          return <Pressable key={workspace.id} disabled={busy} onPress={() => void select(workspace.id)} style={({ pressed }) => [styles.workspaceCard, { backgroundColor: colors.surface, borderColor: isActiveId ? colors.primary : colors.border, opacity: pressed || busy ? 0.68 : 1, flexDirection: row }]}>
            <View style={[styles.workspaceIcon, { backgroundColor: (isActiveId ? colors.primary : colors.success) + "18" }]}><MaterialIcons name={isActiveId ? "check-circle" : "holiday-village"} size={21} color={isActiveId ? colors.primary : colors.success} /></View>
            <View style={styles.flex}>
              <Text style={[styles.workspaceName, { color: colors.foreground, textAlign: align }]}>{workspace.name}</Text>
              <Text style={[styles.workspaceMeta, { color: colors.muted, textAlign: align }]}>{`${roleLabel(member.role)}${workspace.currency ? ` · ${workspace.currency}` : ""}`}</Text>
            </View>
            <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={isActiveId ? colors.primary : colors.muted} />
          </Pressable>;
        })}
</View> : null}

      {workspaceCount ? <View style={[styles.section, styles.prefRow, { flexDirection: row }]}>
        <View style={styles.flex}>
          <Text style={[styles.prefTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "إظهار شاشة اختيار المنشآت دائماً عند تسجيل الدخول" : "Always show the property picker after sign-in"}</Text>
          <Text style={[styles.prefDetail, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "عند تفعيل هذا الخيار، سيتم نقلك لشاشة اختيار المنشأة في كل مرة تسجل فيها الدخول، حتى لو كانت لديك منشأة نشطة مسبقاً." : "When enabled you are sent to the property picker every time you sign in, even if a property is already active."}</Text>
        </View>
        <Switch value={alwaysPrompt} onValueChange={(value) => void toggleAlwaysPrompt(value)} trackColor={{ false: colors.surfaceMuted, true: colors.primary }} thumbColor={colors.background} disabled={setAlwaysPrompt.isPending} />
      </View> : null}

      <View style={[styles.section, { flexDirection: row }]}>
        {workspaceCount === 0 ? <Pressable onPress={() => { setCreateVisible(true); setFormError(null); }} style={({ pressed }) => [styles.optionCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "55", opacity: pressed ? 0.7 : 1 }]}>
          <View style={[styles.optionIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="add-business" size={23} color={colors.primary} /></View>
          <Text style={[styles.optionTitle, { color: colors.primary, textAlign: align }]}>{language === "ar" ? "إنشاء منشأة جديدة" : "Create a new property"}</Text>
          <Text style={[styles.optionDetail, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "منشأتك الأولى فقط في هذه البوابة: الاسم والعملة والهاتف، وتصبح مالكًا فور الحفظ. المنشآت الإضافية تُضاف من داخل التطبيق عبر «منشآتي»." : "Gateway creates only your first property: name, currency, and phone — you become the owner on save. Additional properties are added from inside your app via “My properties”."}</Text>
        </Pressable> : null}
        <View style={[styles.optionCard, { backgroundColor: colors.success + "10", borderColor: colors.success + "55" }]}>
          <View style={[styles.optionIcon, { backgroundColor: colors.success + "18" }]}><MaterialIcons name="badge" size={23} color={colors.success} /></View>
          <Text style={[styles.optionTitle, { color: colors.success, textAlign: align }]}>{language === "ar" ? "موظف / حارس — كود دعوة" : "Staff / guard — invite code"}</Text>
          <Text style={[styles.optionDetail, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "أدخل الرمز المكوّن من 6 أرقام المرسل من المالك." : "Enter the 6-digit code sent by the owner."}</Text>
          <TextInput value={inviteCode} onChangeText={(value) => { setInviteCode(value.replace(/[^\d]/g, "").slice(0, 6)); setCodeError(null); }} placeholder={language === "ar" ? "أدخل رمز الدعوة" : "Invite code"} keyboardType="number-pad" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: codeError ? colors.error : colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} accessibilityLabel={language === "ar" ? "أدخل رمز الدعوة" : "Enter invite code"} />
          {codeError ? <View accessibilityLiveRegion="polite" style={[styles.inlineError, { backgroundColor: colors.error + "12", flexDirection: row }]}><MaterialIcons name="error-outline" size={15} color={colors.error} /><Text style={[styles.flex, { color: colors.error, fontSize: 10, fontWeight: "800", textAlign: align }]}>{codeError}</Text></View> : null}
          <Pressable disabled={codeBusy} onPress={() => void activate()} style={({ pressed }) => [styles.optionPrimary, { backgroundColor: colors.success, opacity: pressed || codeBusy ? 0.66 : 1, flexDirection: row }]}>
            {codeBusy ? <ActivityIndicator color={colors.background} size="small" /> : <MaterialIcons name="vpn-key" size={17} color={colors.background} />}
            <Text style={{ color: colors.background, fontWeight: "900", fontSize: 12 }}>{codeBusy ? (language === "ar" ? "جارٍ التحقق…" : "Verifying…") : (language === "ar" ? "تفعيل والدخول" : "Activate & enter")}</Text>
          </Pressable>
        </View>
      </View>

      {loading || routing.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
    </ScrollView>

    <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.modalHeader}>
            <View style={[styles.modalIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="add-business" size={23} color={colors.primary} /></View>
            <View style={styles.flex}>
              <Text style={[styles.modalTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "إنشاء منشأتي الأولى" : "Create my first property"}</Text>
              <Text style={[styles.modalSubtitle, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "بمجرّد الحفظ تُعيَّن مالكًا وتُفتح لوحة التحكم لك." : "Saving assigns your Owner role and opens the dashboard."}</Text>
            </View>
            <Pressable onPress={() => setCreateVisible(false)} style={({ pressed }) => [styles.modalClose, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable>
          </View>

          <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "اسم المنشأة" : "Property name"}</Text>
          <TextInput value={wsName} onChangeText={(value) => { setWsName(value); setFormError(null); }} placeholder={language === "ar" ? "مثال: قرية أمواج السياحية" : "e.g. Amaaj tourist village"} placeholderTextColor={colors.muted} style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} accessibilityLabel={language === "ar" ? "اسم المنشأة" : "Property name"} />

          <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "رقم الهاتف (اختياري)" : "Phone number (optional)"}</Text>
          <TextInput value={wsPhone} onChangeText={setWsPhone} placeholder="+962 7X XXX XXXX" keyboardType="phone-pad" placeholderTextColor={colors.muted} style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} accessibilityLabel={language === "ar" ? "رقم الهاتف" : "Phone number"} />

          <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "العملة" : "Currency"}</Text>
          <View style={[styles.currencyRow, { flexDirection: row }]}>
            {CURRENCY_OPTIONS.map((option) => {
              const active = option === wsCurrency;
              return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setWsCurrency(option)} style={({ pressed }) => [styles.currencyChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: active ? colors.primary : colors.muted, fontWeight: "900", fontSize: 14 }}>{option}</Text></Pressable>;
            })}
          </View>

          {formError ? <View accessibilityLiveRegion="polite" style={[styles.inlineError, { backgroundColor: colors.error + "12", flexDirection: row }]}><MaterialIcons name="error-outline" size={16} color={colors.error} /><Text style={[styles.flex, { color: colors.error, fontSize: 11, fontWeight: "800", textAlign: align }]}>{formError}</Text></View> : null}

          <Pressable disabled={isSubmitting} onPress={() => void create()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed || isSubmitting ? 0.66 : 1, flexDirection: row }]}>
            {isSubmitting ? <ActivityIndicator color={colors.background} size="small" /> : <MaterialIcons name="storefront" size={19} color={colors.background} />}
            <Text style={{ color: colors.background, fontWeight: "900" }}>{isSubmitting ? (language === "ar" ? "جاري إنشاء المنشأة..." : "Creating your property...") : (language === "ar" ? "حفظ وتعييني مالكًا" : "Save and make me the owner")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>

    <Modal visible={welcomeVisible} transparent animationType="fade" onRequestClose={() => { setWelcomeVisible(false); router.replace("/(tabs)"); }}>
      <View style={styles.welcomeBackdrop}>
        <View style={[styles.welcomeCard, { backgroundColor: colors.surface, borderColor: colors.success + "66" }]}>
          <View style={[styles.welcomeIcon, { backgroundColor: colors.success + "16" }]}><Text style={styles.welcomeEmoji}>🌴</Text></View>
          <Text style={[styles.welcomeTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "مرحباً بك في عالم StayIn! 🌴" : "Welcome to the world of StayIn! 🌴"}</Text>
          <Text style={[styles.welcomeSubtitle, { color: colors.success, textAlign: align }]}>{language === "ar" ? "تم تأسيس منشأتك بنجاح وأصبحت المالك المعتمد." : "Your property was created successfully and you are now the approved owner."}</Text>
          <Text style={[styles.welcomeText, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "خطوتك التالية: ابدأ بإضافة وحداتك الإيجارية (مثل: شاليه، كوخ، مزرعة، جناح، أو خيمة) لتفعيل التقويم واستقبال الحجوزات بسهولة." : "Your next step: start adding your rental units (e.g. chalet, cabin, farm, suite, or tent) to activate the calendar and receive bookings with ease."}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace("/chalet-profile?mode=add" as never)} style={({ pressed }) => [styles.welcomePrimary, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1, flexDirection: row }]}><MaterialIcons name="add-home-work" size={20} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{language === "ar" ? "إضافة أول وحدة الآن ➔" : "Add your first unit now ➔"}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.replace("/(tabs)/calendar")} style={({ pressed }) => [styles.welcomeSecondary, { borderColor: colors.primary + "66", opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="calendar-month" size={19} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900" }}>{language === "ar" ? "استكشاف لوحة التحكم والتقويم" : "Explore the dashboard & calendar"}</Text></Pressable>
        </View>
      </View>
    </Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 44 },
  topBar: { alignItems: "center", gap: 9, marginBottom: 12 },
  logout: { minHeight: 36, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", gap: 6 },
  flex: { flex: 1, minWidth: 0 },
  hero: { borderWidth: 1, borderRadius: 22, padding: 17 },
  heroIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  title: { marginTop: 12, fontSize: 22, lineHeight: 30, fontWeight: "900" },
  detail: { marginTop: 6, fontSize: 12, lineHeight: 19 },
  resumeButton: { minHeight: 50, borderRadius: 14, marginTop: 14, alignItems: "center", justifyContent: "center", gap: 7 },
  section: { marginTop: 18, gap: 9 },
  sectionTitle: { fontSize: 14, lineHeight: 21, fontWeight: "900", marginBottom: 3 },
  sectionDetail: { fontSize: 11, lineHeight: 17, marginBottom: 3 },
  prefRow: { alignItems: "center", gap: 12 },
  prefTitle: { fontSize: 13, fontWeight: "900" },
  prefDetail: { marginTop: 3, fontSize: 10, lineHeight: 15 },
  workspaceCard: { minHeight: 68, alignItems: "center", gap: 11, borderWidth: 1, borderRadius: 17, padding: 12 },
  workspaceIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  workspaceName: { fontSize: 14, fontWeight: "900" },
  workspaceMeta: { marginTop: 3, fontSize: 11 },
  optionCard: { flex: 1, minHeight: 150, borderWidth: 1, borderRadius: 18, padding: 12 },
  optionIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  optionTitle: { marginTop: 9, fontSize: 13, fontWeight: "900" },
  optionDetail: { marginTop: 4, fontSize: 10, lineHeight: 15 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 11, marginTop: 10 },
  inlineError: { minHeight: 34, borderRadius: 10, padding: 8, alignItems: "center", gap: 6, marginTop: 8 },
  optionPrimary: { minHeight: 42, borderRadius: 12, marginTop: 10, alignItems: "center", justifyContent: "center", gap: 6 },
  loading: { marginTop: 30 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(5, 8, 15, 0.78)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", maxWidth: 440, borderRadius: 24, borderWidth: 1, padding: 16 },
  modalHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  modalIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modalTitle: { fontSize: 16, fontWeight: "900" },
  modalSubtitle: { marginTop: 3, fontSize: 11, lineHeight: 16 },
  modalClose: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  label: { fontSize: 12, fontWeight: "900", marginTop: 14 },
  modalInput: { minHeight: 48, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, marginTop: 6 },
  currencyRow: { gap: 8, marginTop: 8, flexWrap: "wrap" },
  currencyChip: { minWidth: 52, minHeight: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  primary: { minHeight: 52, borderRadius: 13, marginTop: 16, alignItems: "center", justifyContent: "center", gap: 7 },
  welcomeBackdrop: { flex: 1, backgroundColor: "rgba(5, 8, 15, 0.82)", alignItems: "center", justifyContent: "center", padding: 18 },
  welcomeCard: { width: "100%", maxWidth: 440, alignItems: "center", borderRadius: 26, borderWidth: 1, padding: 22 },
  welcomeIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  welcomeEmoji: { fontSize: 34, lineHeight: 40 },
  welcomeTitle: { marginTop: 13, fontSize: 19, lineHeight: 27, fontWeight: "900" },
  welcomeSubtitle: { marginTop: 5, fontSize: 13, lineHeight: 19, fontWeight: "800" },
  welcomeText: { marginTop: 11, fontSize: 12, lineHeight: 19 },
  welcomePrimary: { width: "100%", minHeight: 52, borderRadius: 15, marginTop: 18, alignItems: "center", justifyContent: "center", gap: 8 },
  welcomeSecondary: { width: "100%", minHeight: 48, borderRadius: 15, borderWidth: 1, marginTop: 10, alignItems: "center", justifyContent: "center", gap: 7 },
});