import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { useEffect, useState, type ComponentProps } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { CompactScreenHeader } from "@/components/compact-screen-header";
import { AdminSessionExpired } from "@/components/admin-session-expired";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { SUPER_ADMIN_USER_CODE } from "@/lib/user-code";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { GLOBAL_FEATURE_FLAG_KEYS, type GlobalFeatureFlagKey } from "@/shared/feature-flags";

type FeatureIcon = ComponentProps<typeof MaterialIcons>["name"];

const KILL_META: Record<GlobalFeatureFlagKey, { label: string; icon: FeatureIcon; color: string }> = {
  feat_maintenance: { label: "الصيانة والوقاية والأصول", icon: "build", color: "#F59E0B" },
  feat_notifications: { label: "مركز الإشعارات العام", icon: "notifications-active", color: "#60A5FA" },
  feat_loyalty_suite: { label: "برامج الولاء وقاعدة العملاء والقائمة السوداء", icon: "workspace-premium", color: "#F472B6" },
  feat_lunar_calendar: { label: "لوحة القمر والتقويم الهجري", icon: "nightlight", color: "#A78BFA" },
  feat_customers_blacklist: { label: "قاعدة العملاء وسجل القائمة السوداء", icon: "group", color: "#FCA5A5" },
  feat_automation_weather: { label: "الأتمتة ومتابعة الطقس", icon: "wb-cloudy", color: "#22D3EE" },
  feat_guest_checkin: { label: "إجراءات تسجيل وصول الضيف (Check-in)", icon: "login", color: "#34D399" },
  feat_cleaning_inspection: { label: "شاشة التنظيف والفحص الميداني", icon: "cleaning-services", color: "#4ADE80" },
  feat_advanced_tools: { label: "شاشة الأدوات المتقدمة وحالات الطوارئ", icon: "health-and-safety", color: "#F87171" },
  feat_digital_contracts: { label: "وحدة العقود والإقرارات الإلكترونية", icon: "description", color: "#38BDF8" },
  feat_invoicing_receipts: { label: "محرك الفواتير وسندات القبض", icon: "receipt-long", color: "#E879F9" },
  feat_whatsapp_integration: { label: "تكامل محادثات واتساب الآلية", icon: "chat", color: "#FBBF24" },
  feat_audit_log: { label: "شاشة تدقيق سجل العمليات والأمان (Audit Log)", icon: "history", color: "#A3E635" },
};

function parseKillDetails(details?: string | null): { flag?: string; enabled?: boolean } {
  if (!details) return {};
  try {
    const parsed = JSON.parse(details);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export default function MasterBlackoutScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const { isSuperAdmin, loading } = useWorkspaceAccess();
  const utils = trpc.useUtils();
  const overview = trpc.masterControl.overview.useQuery(undefined, { retry: false });
  const flagsList = trpc.featureControl.global.list.useQuery(undefined, { retry: false });
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingFlag, setPendingFlag] = useState<GlobalFeatureFlagKey | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<GlobalFeatureFlagKey | null>(null);

  useEffect(() => {
    if (!savedMessage && !errorMessage) return;
    const timer = setTimeout(() => {
      setSavedMessage(null);
      setErrorMessage(null);
    }, 2600);
    return () => clearTimeout(timer);
  }, [savedMessage, errorMessage]);

  const globalToggle = trpc.featureControl.global.update.useMutation({
    retry: false,
    onMutate: async ({ flag, enabled }) => {
      setPendingFlag(flag);
      await utils.featureControl.global.list.cancel();
      const previous = utils.featureControl.global.list.getData();
      if (previous) utils.featureControl.global.list.setData(undefined, { ...previous, [flag]: enabled });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      setPendingFlag(null);
      if (context?.previous) utils.featureControl.global.list.setData(undefined, context.previous);
      setSavedMessage(null);
      setErrorMessage(
        isRTL ? "تعذر تطبيق الحجب المركزي — تعذر حفظ الحالة الآن. تحقق من اتصالك بالسيرفر وأعد المحاولة." : "Kill-switch failed — could not save the state right now. Check your connection and try again.",
      );
    },
    onSuccess: (_data, variables) => {
      setPendingFlag(null);
      setSavedMessage(
        variables.enabled
          ? (isRTL ? "تم تفعيل الميزة عالميًا." : "Feature enabled globally.")
          : (isRTL ? "تم الحجب المركزي للميزة." : "Kill-switch activated."),
      );
    },
    onSettled: () => {
      setPendingFlag(null);
      void utils.featureControl.global.list.invalidate();
    },
  });

  const toggleKill = (flag: GlobalFeatureFlagKey, next: boolean) => {
    if (!isSuperAdmin) return;
    if (next) {
      globalToggle.mutate({ flag, enabled: true });
      return;
    }
    setConfirmTarget(flag);
  };

  const confirmDisable = () => {
    if (!confirmTarget) return;
    const flag = confirmTarget;
    setConfirmTarget(null);
    globalToggle.mutate({ flag, enabled: false });
  };

  const enabledCount = flagsList.isSuccess ? GLOBAL_FEATURE_FLAG_KEYS.filter((flag) => Boolean(flagsList.data?.[flag])).length : null;
  const killAudit = overview.data?.audit.filter((entry) => entry.action === "feature-flag-updated").slice(0, 6) ?? [];

  if (loading) {
    return <ScreenContainer><View style={styles.center}><MaterialIcons name="gpp-bad" size={36} color={colors.error} /><Text style={{ color: colors.muted }}>جارٍ التحقق من صلاحية الإدارة العليا…</Text></View></ScreenContainer>;
  }
  if (overview.error?.data?.code === "UNAUTHORIZED" || flagsList.error?.data?.code === "UNAUTHORIZED") {
    return <AdminSessionExpired />;
  }
  if (!isSuperAdmin) {
    return <ScreenContainer><View style={styles.center}><MaterialIcons name="lock-outline" size={40} color={colors.error} /><Text style={[styles.deniedTitle, { color: colors.foreground }]}>هذه اللوحة مخصصة لمدير النظام فقط</Text><Text style={[styles.deniedText, { color: colors.muted }]}>تُفرض صلاحية الإدارة العليا من الخادم ولا تكفي معرفة الرابط. الحجب المركزي مقتصر على حساب السوبر أدمن #U1000 حصرًا.</Text><Pressable onPress={() => router.replace("/(tabs)/more")} style={[styles.backButton, { backgroundColor: colors.primary }]}><Text style={styles.whiteText}>العودة إلى المزيد</Text></Pressable></View></ScreenContainer>;
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <CompactScreenHeader title="إدارة الحجب المركزي والتعليق الشامل للوحدات" icon="gpp-bad" accentColor={colors.error} backHref="/admin/master-control" showDateTime={false} />
        <View style={[styles.notice, { borderColor: colors.error + "66", backgroundColor: colors.error + "12" }]}>
          <MaterialIcons name="verified-user" size={21} color={colors.error} />
          <View style={styles.flex}>
            <Text style={[styles.noticeText, { color: colors.foreground }]}>صلاحية حصرية لحساب السوبر أدمن {`#U${SUPER_ADMIN_USER_CODE}`} — الحجب المركزي يعلو تفضيلات الملاك ويُطبَّق فورًا في كل المنشآت، وتُسجَّل كل عملية في سجل الإدارة العليا.</Text>
          </View>
        </View>
        <GlassPane style={{ marginTop: 14 }}>
          <View style={styles.frameHeader}>
            <View style={[styles.frameIcon, { backgroundColor: colors.error + "22" }]}>
              <MaterialIcons name="do-not-disturb" size={22} color={colors.error} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.frameTitle, { color: colors.foreground }]}>لوحة الحجب المركزي للإدارة العليا</Text>
              <Text style={[styles.frameSubtitle, { color: colors.muted }]}>الحجب المركزي يتجاوز تفضيلات الملاك ويُطبق فورًا في كل المنشآت والوحدات.</Text>
            </View>
          </View>
          <View style={styles.metrics}>
            <Metric label="مفعّلة" value={enabledCount == null ? "…" : String(enabledCount)} color={colors.success} />
            <Metric label="محجوبة" value={enabledCount == null ? "…" : String(GLOBAL_FEATURE_FLAG_KEYS.length - enabledCount)} color={colors.error} />
            <Metric label="عمليات حجب" value={enabledCount == null ? "…" : String(GLOBAL_FEATURE_FLAG_KEYS.length - enabledCount)} color={colors.primary} />
          </View>
          <View style={styles.killList}>
            {flagsList.isLoading || (flagsList.isFetching && !flagsList.data) ? (
              <View style={styles.statusRow}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={[styles.statusText, { color: colors.muted }]}>جارٍ تحميل حالات الميزات…</Text>
              </View>
            ) : flagsList.isError ? (
              <View style={[styles.statusRow, { borderColor: colors.error + "55", backgroundColor: colors.error + "0A" }]}>
                <MaterialIcons name="cloud-off" size={19} color={colors.error} />
                <View style={styles.flex}>
                  <Text style={[styles.statusText, { color: colors.foreground }]}>تعذر تحميل حالات الميزات من الخادم.</Text>
                  <Text style={[styles.statusHint, { color: colors.muted }]}>تحقق من اتصالك بالسيرفر ثم أعد المحاولة. المفاتيح لن تُلمس حتى تعود البيانات.</Text>
                  {flagsList.error?.message ? <Text style={[styles.statusErrorDetail, { color: colors.error }]}>{flagsList.error.message}</Text> : null}
                </View>
                <Pressable onPress={() => flagsList.refetch()} style={({ pressed }) => [styles.statusRetry, { backgroundColor: colors.primary + "18", opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={[styles.statusRetryText, { color: colors.primary }]}>إعادة المحاولة</Text>
                </Pressable>
              </View>
            ) : (
              GLOBAL_FEATURE_FLAG_KEYS.map((flag) => {
              const meta = KILL_META[flag];
              const enabled = Boolean(flagsList.data?.[flag]);
              return (
                <View key={flag} style={[styles.row, { borderColor: enabled ? colors.glassRim : "rgba(239, 68, 68, 0.25)", backgroundColor: enabled ? colors.glassInset : colors.error + "08" }]}>
                  <View style={[styles.rowIcon, { backgroundColor: `${meta.color}22` }]}>
                    <MaterialIcons name={meta.icon} size={20} color={meta.color} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.rowLabel, { color: colors.foreground }]}>{meta.label}</Text>
                    <Text style={[styles.rowHint, { color: enabled ? colors.success : colors.error }]}>{enabled ? "مفعّلة عالميًا" : "محجوبة — مركزيًا"}</Text>
                  </View>
                  <AppToggle value={enabled} onValueChange={(next) => toggleKill(flag, next)} isRTL={isRTL} activeColor={colors.success} inactiveColor={colors.error} disabled={pendingFlag === flag} accessibilityLabel={meta.label} />
                </View>
              );
            })
            )}
          </View>
          {errorMessage ? <Text style={[styles.errorToast, { color: colors.error }]}>{errorMessage}</Text> : null}
          {savedMessage ? <Text style={[styles.savedToast, { color: colors.success }]}>{savedMessage}</Text> : null}
        </GlassPane>
        <GlassPane style={{ marginTop: 16 }}>
          <View style={styles.sectionHead}>
            <MaterialIcons name="history" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>سجل عمليات الحجب الأخيرة</Text>
          </View>
          {killAudit.length ? killAudit.map((entry) => {
            const details = parseKillDetails(entry.details);
            const meta = details.flag && KILL_META[details.flag as GlobalFeatureFlagKey];
            const disabled = details.enabled === false;
            return (
              <View key={entry.id} style={[styles.auditRow, { borderColor: disabled ? "rgba(239, 68, 68, 0.25)" : colors.border, backgroundColor: colors.surface }]}>
                <MaterialIcons name={disabled ? "do-not-disturb" : "verified"} size={18} color={disabled ? colors.error : colors.success} />
                <View style={styles.flex}>
                  <Text style={[styles.auditTitle, { color: colors.foreground }]}>{disabled ? "حجب مركزي" : "إلغاء حجب مركزي"}{meta ? ` — ${meta.label}` : ""}</Text>
                  <Text style={[styles.auditHint, { color: colors.muted }]}>{entry.actorName} · {new Date(entry.createdAt).toLocaleString("ar-JO")}</Text>
                </View>
              </View>
            );
          }) : <Text style={[styles.emptyText, { color: colors.muted }]}>لا توجد عمليات حجب مركزي مسجلة بعد.</Text>}
          <Text style={[styles.guardNote, { color: colors.muted }]}>أي ميزة تُعطّل من هذه اللوحة تُحجب عن كل المستخدمين فورًا (قوائم + روابط مباشرة) حتى لو حاول المالك تفعيلها. الحالة الأصلية محفوظة في قاعدة البيانات ويُعاد تفعيلها بنفس المفتاح.</Text>
        </GlassPane>
      </ScrollView>
      <Modal visible={Boolean(confirmTarget)} transparent animationType="fade" onRequestClose={() => setConfirmTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHead}>
              <MaterialIcons name="gpp-bad" size={22} color={colors.error} />
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{isRTL ? "تأكيد الحجب المركزي" : "Confirm global kill-switch"}</Text>
            </View>
            <Text style={[styles.modalBody, { color: colors.foreground }]}>
              {confirmTarget ? (isRTL ? `سيتم تعطيل «${KILL_META[confirmTarget].label}» فورًا في كل المنشآت ولجميع المستخدمين بمن فيهم الملاك، وتختفي من القوائم مع منع الوصول المباشر لشاشاتها.` : `"${KILL_META[confirmTarget].label}" will be disabled across all workspaces for every user including owners. It will disappear from menus and direct access will be blocked.`) : ""}
            </Text>
            <View style={styles.modalActions}>
              <Pressable disabled={globalToggle.isPending} onPress={() => setConfirmTarget(null)} style={({ pressed }) => [styles.modalButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={{ color: colors.muted, fontWeight: "900" }}>{isRTL ? "إلغاء" : "Cancel"}</Text>
              </Pressable>
              <Pressable disabled={globalToggle.isPending} onPress={() => confirmDisable()} style={({ pressed }) => [styles.modalButton, { backgroundColor: colors.error, opacity: pressed ? 0.78 : 1 }]}>
                <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{isRTL ? "تعطيل الميزة" : "Disable feature"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function GlassPane({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255, 255, 255, 0.10)", backgroundColor: "rgba(13, 17, 26, 0.72)", overflow: "hidden", padding: 14 }, style]}>
      {Platform.OS !== "android" ? <BlurView intensity={30} tint="dark" pointerEvents="none" style={StyleSheet.absoluteFill} /> : null}
      <View pointerEvents="none" style={styles.reflectionShine} />
      <View style={{ gap: 6 }}>{children}</View>
    </View>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return <View style={[styles.metric, { borderColor: color + "66", backgroundColor: color + "10" }]}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 },
  deniedTitle: { fontSize: 19, fontWeight: "900", textAlign: "center" },
  deniedText: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  backButton: { minHeight: 46, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 8 },
  whiteText: { color: "#FFFFFF", fontWeight: "900" },
  notice: { marginTop: 12, borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: "row-reverse", gap: 9, alignItems: "center" },
  noticeText: { flex: 1, fontSize: 11, fontWeight: "800", textAlign: "right", lineHeight: 17 },
  flex: { flex: 1, minWidth: 0 },
  reflectionShine: { position: "absolute", top: -18, left: 0, right: 0, height: 36, borderRadius: 999, backgroundColor: "rgba(255, 255, 255, 0.09)" },
  frameHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 11 },
  frameIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  frameTitle: { fontSize: 16, fontWeight: "900", textAlign: "right" },
  frameSubtitle: { fontSize: 12, lineHeight: 18, marginTop: 2, textAlign: "right" },
  metrics: { flexDirection: "row-reverse", gap: 8, marginTop: 13 },
  metric: { flex: 1, minHeight: 68, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  metricValue: { fontSize: 21, fontWeight: "900" },
  metricLabel: { color: "#94A3B8", fontSize: 10, fontWeight: "800", marginTop: 3 },
  killList: { marginTop: 12, gap: 8 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, minHeight: 62, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 9 },
  rowIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rowLabel: { fontSize: 13, fontWeight: "800", lineHeight: 19, textAlign: "right" },
  rowHint: { fontSize: 11, lineHeight: 15, marginTop: 3, textAlign: "right", fontWeight: "800" },
  savedToast: { marginTop: 13, fontSize: 12, fontWeight: "800", textAlign: "right" },
  errorToast: { marginTop: 13, fontSize: 12, fontWeight: "900", textAlign: "right" },
  modalOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0, 0, 0, 0.55)" },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 18, gap: 12 },
  modalHead: { flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  modalTitle: { fontSize: 15, fontWeight: "900", textAlign: "right", flex: 1 },
  modalBody: { fontSize: 12, lineHeight: 19, textAlign: "right" },
  modalActions: { flexDirection: "row", gap: 9, justifyContent: "flex-end", marginTop: 4 },
  sectionHead: { flexDirection: "row-reverse", alignItems: "center", gap: 9, marginBottom: 9 },
  sectionTitle: { fontSize: 15, fontWeight: "900", textAlign: "right" },
  auditRow: { minHeight: 56, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  auditTitle: { fontSize: 12, fontWeight: "900", textAlign: "right" },
  auditHint: { fontSize: 10, marginTop: 2, textAlign: "right" },
  emptyText: { fontSize: 12, textAlign: "right", paddingVertical: 6 },
  guardNote: { fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 10 },
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, minHeight: 64, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12 },
  statusText: { flex: 1, fontSize: 12, fontWeight: "800", textAlign: "right" },
  statusHint: { fontSize: 10, lineHeight: 15, marginTop: 2, textAlign: "right" },
  statusRetry: { minHeight: 34, borderRadius: 10, paddingHorizontal: 11, justifyContent: "center", alignItems: "center" },
  statusRetryText: { fontSize: 11, fontWeight: "900" },
  statusErrorDetail: { fontSize: 10, lineHeight: 14, marginTop: 3, textAlign: "right" },
  modalButton: { minHeight: 44, minWidth: 104, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth },
});