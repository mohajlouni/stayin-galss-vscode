import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AdminSessionExpired } from "@/components/admin-session-expired";
import { CompactScreenHeader } from "@/components/compact-screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useWorkspaceAccess } from "@/lib/workspace-access";

const ERROR_MESSAGES: Record<string, string> = {
  "400": "طلب غير صالح",
  "401": "غير مصرح",
  "403": "ممنوع",
  "404": "غير موجود",
  "429": "طلبات كثيرة",
  "500": "خطأ خادم داخلي",
  "502": "بوابة معطلة",
  "503": "الخدمة غير متاحة",
  "504": "انتهت مهلة البوابة",
};

function errorLabel(statusCode: number): string {
  return ERROR_MESSAGES[String(statusCode)] ?? `رمز ${statusCode}`;
}

function errorColor(statusCode: number, colors: ReturnType<typeof useColors>): string {
  if (statusCode >= 500) return colors.error;
  if (statusCode >= 400) return colors.warning;
  if (statusCode >= 300) return colors.sky;
  return colors.success;
}

function formatArabicTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-JO");
}

export default function SystemHealthErrorsScreen() {
  const colors = useColors();
  const { isSuperAdmin, loading } = useWorkspaceAccess();
  const utils = trpc.useUtils();
  const health = trpc.systemDiagnostics.healthCheck.useQuery(undefined, { retry: false });
  const errors = trpc.systemDiagnostics.errors.useQuery(undefined, { retry: false });
  const [previewId, setPreviewId] = useState<number | null>(null);
  const resolveError = trpc.systemDiagnostics.resolveError.useMutation({
    onMutate: ({ id }) => { setPreviewId((current) => (current === id ? null : current)); },
    onSettled: () => void utils.systemDiagnostics.errors.invalidate(),
  });

  const preview = useMemo(() => errors.data?.find((entry) => entry.id === previewId) ?? null, [errors.data, previewId]);
  const databaseOnline = health.data?.database.status === "online";
  const authOnline = health.data?.auth === "online";
  const poolLabel = databaseOnline ? `⚠️ مجمع الاتصال المستخدم: ${health.data?.database.latencyMs ?? "—"}ms` : "لا يوجد مجمع اتصال متاح";

  if (loading) {
    return <ScreenContainer><View style={styles.center}><MaterialIcons name="monitor-heart" size={38} color={colors.error} /><Text style={{ color: colors.muted }}>جارٍ التحقق من صلاحية الإدارة العليا…</Text></View></ScreenContainer>;
  }
  if (health.error?.data?.code === "UNAUTHORIZED" || errors.error?.data?.code === "UNAUTHORIZED") {
    return <AdminSessionExpired />;
  }
  if (!isSuperAdmin) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <MaterialIcons name="lock-outline" size={40} color={colors.error} />
          <Text style={[styles.deniedTitle, { color: colors.foreground }]}>هذه اللوحة مخصصة لمدير النظام فقط</Text>
          <Text style={[styles.deniedText, { color: colors.muted }]}>تُفرض صلاحية الإدارة العليا من الخادم، ولا يكفي الوصول إلى هذا الرابط لفتح مرصد الأخطاء وصحة النظام.</Text>
          <Pressable onPress={() => router.replace("/admin/master-control")} style={[styles.backButton, { backgroundColor: colors.primary }]}><Text style={styles.whiteText}>العودة إلى مركز الإدارة العليا</Text></Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <CompactScreenHeader title="مركز رصد الأخطاء وصحة النظام" icon="monitor-heart" accentColor={colors.success} backHref="/admin/master-control" showDateTime={false} />
        <Text style={[styles.subtitle, { color: colors.muted }]}>مراقبة حية لجاهزية الخوادم وحركة استثناءات النظام البرمجية.</Text>

        <SectionTitle title="صحة النظام" colors={colors} icon="health-and-safety" color={colors.success} />
        <View style={styles.healthGrid}>
          <HealthCard
            icon="dns"
            label="قاعدة البيانات"
            value={health.isLoading ? "جارٍ الفحص…" : databaseOnline ? `🟢 متصل (${health.data?.database.latencyMs}ms)` : "🔴 غير متصل"}
            hint={poolLabel}
            tone={databaseOnline ? colors.success : colors.error}
            colors={colors}
          />
          <HealthCard
            icon="verified-user"
            label="محرك التوثيق"
            value={health.isLoading ? "جارٍ الفحص…" : authOnline ? "🟢 يعمل بكفاءة" : "🟠 متوقف"}
            hint="مُصدر الرموز المفعّل وخدمة الجلسات جاهزة"
            tone={authOnline ? colors.success : colors.warning}
            colors={colors}
          />
          <HealthCard
            icon="update"
            label="المهام الخلفية والتنظيف"
            value="🟢 مجدولة"
            hint={`تنظيف تلقائي للجلسات — المتبقية المنتهية: ${health.data?.backgroundJobs.expiredSessions ?? "—"}`}
            tone={colors.primary}
            colors={colors}
          />
        </View>
        <Text style={[styles.lastCheck, { color: colors.muted }]}>آخر فحص شامل: {formatArabicTime(health.data?.serverTime ?? null)}</Text>

        <SectionTitle title="مركز الأخطاء الحية" colors={colors} icon="error" color={colors.error} />
        <View style={[styles.sandbox, { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 17, borderWidth: 1, padding: 11, gap: 9 }]}>
          {errors.isLoading ? <View style={styles.centerSmall}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.muted, fontSize: 11 }}>جارٍ تحميل سجل الأخطاء…</Text></View>
            : !errors.data?.length ? <View style={styles.centerSmall}><MaterialIcons name="verified" size={24} color={colors.success} /><Text style={{ color: colors.muted, fontSize: 11, textAlign: "right" }}>لا توجد أخطاء غير مُحلّلة. النظام يعمل بسلاسة.</Text></View>
              : errors.data.map((entry) => (
                  <View key={entry.id} style={[styles.errorRow, { borderColor: entry.statusCode >= 500 ? colors.error + "66" : colors.border, backgroundColor: colors.surface }]}>
                    <View style={[styles.statusChip, { backgroundColor: errorColor(entry.statusCode, colors) + "18" }]}>
                      <Text style={[styles.statusChipText, { color: errorColor(entry.statusCode, colors) }]}>{entry.statusCode} {errorLabel(entry.statusCode)}</Text>
                    </View>
                    <Text style={[styles.endpoint, { color: colors.foreground }]} numberOfLines={1}>{entry.endpoint}</Text>
                    <View style={styles.flex}>
                      <View style={styles.metaRow}>
                        <View style={[styles.countChip, { backgroundColor: colors.primary + "14" }]}><MaterialIcons name="repeat" size={12} color={colors.primary} /><Text style={[styles.countChipText, { color: colors.primary }]}>تكرر {entry.occurrenceCount} مرة</Text></View>
                        <Text style={[styles.metaText, { color: colors.muted }]}>{formatArabicTime(entry.lastSeenAt)}</Text>
                      </View>
                      <Text style={[styles.metaText, { color: colors.muted }]}>{entry.userId ? `المستخدم المتأثر: #${entry.userId}` : "زائر غير مسجل"}</Text>
                    </View>
                    <View style={styles.actionsRow}>
                      <Pressable onPress={() => setPreviewId(entry.id)} style={({ pressed }) => [styles.smallButton, { borderColor: errorColor(entry.statusCode, colors) + "88", backgroundColor: errorColor(entry.statusCode, colors) + "10", opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="visibility" size={16} color={errorColor(entry.statusCode, colors)} /><Text style={[styles.smallButtonText, { color: errorColor(entry.statusCode, colors) }]}>معاينة التفاصيل</Text></Pressable>
                      <Pressable disabled={resolveError.isPending} onPress={() => resolveError.mutate({ id: entry.id })} style={({ pressed }) => [styles.smallButton, { borderColor: colors.success + "88", backgroundColor: colors.success + "10", opacity: pressed || resolveError.isPending ? 0.55 : 1 }]}><MaterialIcons name="check-circle" size={16} color={colors.success} /><Text style={[styles.smallButtonText, { color: colors.success }]}>تم الحل</Text></Pressable>
                    </View>
                  </View>
                ))}

          <Text style={[styles.guardNote, { color: colors.muted }]}>سجل الأخطاء يسجّل استثناءات الخادم الواردة من النقاط الخادمية. أي عملية حل تُسجل هنا وتُزال من العرض الحالي فورًا.</Text>
        </View>
      </ScrollView>

      <Modal transparent visible={previewId !== null} animationType="fade" onRequestClose={() => setPreviewId(null)}>
        <View style={styles.modalBackdrop}>
          {preview ? <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIcon, { backgroundColor: errorColor(preview.statusCode, colors) + "1F" }]}><MaterialIcons name="bug-report" size={22} color={errorColor(preview.statusCode, colors)} /></View>
              <View style={styles.flex}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{preview.statusCode} {errorLabel(preview.statusCode)}</Text>
                <Text style={[styles.endpoint, { color: colors.muted }]} numberOfLines={1}>{preview.endpoint}</Text>
              </View>
              <Pressable onPress={() => setPreviewId(null)} style={[styles.modalClose, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: colors.foreground }]}>رسالة الخطأ</Text>
              <View style={[styles.codeBox, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}><Text style={[styles.codeText, { color: colors.foreground }]}>{preview.errorMessage}</Text></View>
              <Text style={[styles.label, { color: colors.foreground }]}>أثر الاستدعاء</Text>
              <View style={[styles.codeBox, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>{preview.stackTrace ? <Text style={[styles.codeText, { color: colors.muted }]} selectable>{preview.stackTrace}</Text> : <Text style={[styles.metaText, { color: colors.muted }]}>لا يوجد أثر استدعاء محفوظ لهذا الخطأ.</Text>}</View>
              <Text style={[styles.label, { color: colors.foreground }]}>بيانات الطلب</Text>
              <View style={[styles.codeBox, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}><Text style={[styles.codeText, { color: colors.muted }]}>لا تُحفظ حمولة الطلب حفاظًا على الخصوصية.</Text></View>
              <Text style={[styles.metaText, { color: colors.muted }]}>المستخدم المتأثر: {preview.userId ? `#${preview.userId}` : "زائر غير مسجل"} · أول ظهور {formatArabicTime(preview.firstSeenAt)}</Text>
            </ScrollView>
            <Pressable onPress={() => resolveError.mutate({ id: preview.id })} style={({ pressed }) => [styles.resolveButton, { backgroundColor: colors.success, opacity: pressed || resolveError.isPending ? 0.6 : 1 }]}><MaterialIcons name="check-circle" size={18} color="#FFFFFF" /><Text style={styles.whiteText}>تم الحل — إزالة من العرض الحالي</Text></Pressable>
          </View> : null}
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function HealthCard({ icon, label, value, hint, tone, colors }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; value: string; hint: string; tone: string; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.healthCard, { borderColor: tone + "55", backgroundColor: tone + "0D" }]}><MaterialIcons name={icon} size={22} color={tone} /><Text style={[styles.healthLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.healthValue, { color: tone }]}>{value}</Text><Text style={[styles.healthHint, { color: colors.muted }]}>{hint}</Text></View>;
}

function SectionTitle({ title, colors, icon, color }: { title: string; colors: ReturnType<typeof useColors>; icon: React.ComponentProps<typeof MaterialIcons>["name"]; color: string }) {
  return <View style={styles.sectionHead}><MaterialIcons name={icon} size={19} color={color} /><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text></View>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 },
  centerSmall: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: 8 },
  deniedTitle: { fontSize: 19, fontWeight: "900", textAlign: "center" },
  deniedText: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  backButton: { minHeight: 46, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 8 },
  whiteText: { color: "#FFFFFF", fontWeight: "900" },
  subtitle: { marginTop: 10, fontSize: 12, lineHeight: 19, textAlign: "right" },
  sectionHead: { marginTop: 18, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "900", textAlign: "right" },
  healthGrid: { marginTop: 11, gap: 8 },
  healthCard: { minHeight: 128, borderRadius: 17, borderWidth: 1, padding: 13, gap: 5 },
  healthLabel: { fontSize: 11, fontWeight: "800" },
  healthValue: { fontSize: 16, fontWeight: "900" },
  healthHint: { fontSize: 10, lineHeight: 15 },
  lastCheck: { marginTop: 8, fontSize: 10, textAlign: "right" },
  sandbox: {},
  errorRow: { borderWidth: 1, borderRadius: 15, padding: 11, gap: 8 },
  statusChip: { alignSelf: "flex-start", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 },
  statusChipText: { fontSize: 11, fontWeight: "900" },
  endpoint: { fontSize: 12, fontWeight: "800" },
  flex: { flex: 1, minWidth: 0 },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  countChip: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 },
  countChipText: { fontSize: 9, fontWeight: "900" },
  metaText: { fontSize: 10, marginTop: 2 },
  actionsRow: { flexDirection: "row-reverse", gap: 8, marginTop: 3 },
  smallButton: { minHeight: 38, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  smallButtonText: { fontSize: 11, fontWeight: "900" },
  guardNote: { fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(5, 8, 15, 0.78)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", maxWidth: 460, borderRadius: 24, borderWidth: 1, padding: 15 },
  modalHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  modalIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modalTitle: { fontSize: 16, fontWeight: "900" },
  modalClose: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modalContent: { gap: 4, paddingTop: 12 },
  label: { fontSize: 12, fontWeight: "900", marginTop: 6 },
  codeBox: { borderRadius: 12, borderWidth: 1, padding: 10, marginTop: 5 },
  codeText: { fontSize: 11, lineHeight: 17 },
  resolveButton: { minHeight: 50, borderRadius: 14, marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
});