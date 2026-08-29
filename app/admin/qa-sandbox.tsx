import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { CompactScreenHeader } from "@/components/compact-screen-header";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const ACTORS = ["super-admin", "owner", "staff", "guest"] as const;
type Actor = (typeof ACTORS)[number];

export default function QaSandboxScreen() {
  const colors = useColors();
  const [actor, setActor] = useState<Actor>("super-admin");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const status = trpc.masterControl.qaSandbox.status.useQuery(undefined, { retry: false });
  const seed = trpc.masterControl.qaSandbox.seed.useMutation();
  const preview = trpc.masterControl.qaSandbox.preview.useMutation();
  const selectWorkspace = trpc.workspace.select.useMutation();
  const facilities = status.data?.facilities ?? [];
  const selectedWorkspace = useMemo(() => facilities.find((facility) => facility.workspaceId === selectedWorkspaceId) ?? facilities.find((facility) => facility.workspaceId !== null) ?? null, [facilities, selectedWorkspaceId]);
  const activeWorkspaceId = selectedWorkspace?.workspaceId ?? null;
  const actorAccount = actor === "super-admin" ? null : status.data?.accounts.find((account) => account.key === actor) ?? null;
  const hasAccess = (workspaceId: number | null) => actor === "super-admin" || Boolean(actorAccount?.memberships.some((membership) => membership.workspaceId === workspaceId && membership.status === "active"));
  const busy = seed.isPending || preview.isPending || selectWorkspace.isPending;

  const createSandbox = async () => {
    try {
      const next = await seed.mutateAsync();
      await status.refetch();
      setSelectedWorkspaceId(next.facilities.find((facility) => facility.workspaceId !== null)?.workspaceId ?? null);
      setMessage("اكتملت تهيئة البيئة التجريبية. يمكن إعادة تنفيذها بأمان؛ لا تُنشئ منشآت أو عضويات مكررة.");
    } catch {
      setMessage("تعذر إنشاء بيئة الاختبار. تأكد من صلاحية الإدارة العليا واتصال الخادم ثم حاول مرة أخرى.");
    }
  };

  const runPreview = async () => {
    if (!activeWorkspaceId) return;
    try {
      await preview.mutateAsync({ actor, workspaceId: activeWorkspaceId });
      setMessage("تم تحميل معاينة الدور المختار. هذه معاينة مقيدة ومُسجّلة، ولا تغيّر جلسة OAuth أو صلاحيات أي حساب حقيقي.");
    } catch {
      setMessage("هذا الحساب التجريبي لا يملك وصولًا نشطًا إلى المنشأة المحددة.");
    }
  };

  const switchToWorkspace = async () => {
    if (!activeWorkspaceId) return;
    try {
      await selectWorkspace.mutateAsync({ workspaceId: activeWorkspaceId });
      setSelectedWorkspaceId(activeWorkspaceId);
      setMessage(`تم التبديل فعليًا إلى "${selectedWorkspace?.name ?? "المنشأة"}". افتح شاشة الحجوزات للعمل على بياناتها الحقيقية.`);
      router.replace("/");
    } catch {
      setMessage("تعذر التبديل إلى هذه المنشأة. تأكد من وجود عضوية نشطة فيها.");
    }
  };

  if (status.isLoading) return <ScreenContainer><View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.muted }}>جارٍ تحميل بيئة الاختبار…</Text></View></ScreenContainer>;
  if (status.error) return <ScreenContainer><View style={styles.center}><MaterialIcons name="lock-outline" size={36} color={colors.error} /><Text style={[styles.denied, { color: colors.foreground }]}>بيئة الاختبار مخصصة للإدارة العليا</Text><Pressable onPress={() => router.replace("/admin/master-control")} style={[styles.back, { backgroundColor: colors.primary }]}><Text style={styles.whiteText}>العودة إلى الإدارة العليا</Text></Pressable></View></ScreenContainer>;

  const result = preview.data;
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <CompactScreenHeader title="مختبر الأدوار والمنشآت" icon="science" accentColor={colors.primary} backHref="/admin/master-control" showDateTime={false} />
    <View style={[styles.notice, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "55" }]}><MaterialIcons name="shield" size={21} color={colors.primary} /><Text style={[styles.noticeText, { color: colors.foreground }]}>يُنشئ المختبر بيانات منفصلة تحمل وسم الاختبار فقط. لا يُعدّ تسجيل دخول بديلًا، ولا يتجاوز OAuth، ولا يمنح الحسابات التجريبية كلمات مرور أو رموز وصول.</Text></View>

    <Card title="1. تهيئة البيئة التجريبية" colors={colors}><Text style={[styles.detail, { color: colors.muted }]}>ينشئ زر واحد «قرية النخلة» بوحدتين، و«شاليهات الواحة» بوحدة، وحجوزات مستقلة لكل منشأة. كما يربط موظف الحجوزات `staff@test.com` بالمنشأتين.</Text><Pressable disabled={busy} onPress={() => Alert.alert("تهيئة بيئة الاختبار", "ستُنشأ أو تُحدّث بيانات تجريبية معزولة فقط. لن تُحذف بيانات المنشآت الفعلية.", [{ text: "إلغاء", style: "cancel" }, { text: "توليد البيئة", onPress: () => void createSandbox() }])} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed || busy ? 0.62 : 1 }]}><MaterialIcons name="auto-fix-high" size={20} color={colors.background} /><Text style={[styles.primaryText, { color: colors.background }]}>{seed.isPending ? "جارٍ التهيئة…" : "توليد بيئة الاختبار التجريبية"}</Text></Pressable>
      {status.data?.ready ? <View style={styles.metrics}>{facilities.map((facility) => <Metric key={facility.key} label={facility.name} value={`${facility.units} وحدة · ${facility.bookings} حجوزات`} color={colors.primary} />)}</View> : <Text style={[styles.warning, { color: colors.warning }]}>لم تُنشأ البيئة بعد. ابدأ بالتوليد لمعاينة الحسابات والمنشآت التجريبية.</Text>}</Card>

    <Card title="2. اختيار الهوية التجريبية" colors={colors}><Text style={[styles.detail, { color: colors.muted }]}>المحاكي يحمّل صلاحيات الدور وبيانات المنشأة المختارة ضمن المختبر فقط؛ لا يبدل الحساب الحقيقي ولا ينفّذ عمليات تشغيلية.</Text><View style={styles.actorGrid}>{ACTORS.map((item) => <Pressable key={item} onPress={() => { setActor(item); setMessage(null); }} disabled={!status.data?.ready} style={({ pressed }) => [styles.actor, { backgroundColor: actor === item ? colors.primary : colors.surface, borderColor: actor === item ? colors.primary : colors.border, opacity: pressed || !status.data?.ready ? 0.62 : 1 }]}><MaterialIcons name={actorIcon(item)} size={18} color={actor === item ? colors.background : colors.primary} /><Text style={{ color: actor === item ? colors.background : colors.foreground, fontSize: 11, fontWeight: "900" }}>{actorLabel(item)}</Text></Pressable>)}</View>{actorAccount ? <View style={[styles.account, { backgroundColor: colors.primary + "0D", borderColor: colors.primary + "44" }]}><Text style={[styles.accountTitle, { color: colors.foreground }]}>{actorAccount.displayName}</Text><Text style={[styles.accountText, { color: colors.muted }]}>{actorAccount.email} · {actorAccount.memberships.length} منشآت فعالة</Text></View> : <View style={[styles.account, { backgroundColor: colors.primary + "0D", borderColor: colors.primary + "44" }]}><Text style={[styles.accountTitle, { color: colors.foreground }]}>مدير النظام</Text><Text style={[styles.accountText, { color: colors.muted }]}>يستعرض جميع بيئات الاختبار دون تغيير الجلسة أو العضويات.</Text></View>}</Card>

    <Card title="3. اختيار المنشأة للعمل" colors={colors}><Text style={[styles.detail, { color: colors.muted }]}>يعيد هذا القسم استخدام محدد «اختر المنشأة للعمل» المعتمد: زر «التبديل والعمل في هذه المنشأة» يبدّل فعليًا بيئة عمل مدير النظام إلى منشأة الاختبار المحددة، بينما يحاكي زر المعاينة أدوار الحسابات التجريبية دون تغيير الجلسة.</Text><View style={styles.facilityList}>{facilities.map((facility) => { const allowed = hasAccess(facility.workspaceId); const selected = activeWorkspaceId === facility.workspaceId; return <Pressable key={facility.key} disabled={!facility.workspaceId || !allowed || busy} onPress={() => { setSelectedWorkspaceId(facility.workspaceId); setMessage(null); }} style={({ pressed }) => [styles.facility, { backgroundColor: selected ? colors.primary + "12" : colors.surface, borderColor: selected ? colors.primary : colors.border, opacity: pressed || !allowed || !facility.workspaceId ? 0.48 : 1 }]}><View style={styles.flex}><Text style={[styles.facilityName, { color: colors.foreground }]}>{facility.name}</Text><Text style={[styles.facilityText, { color: colors.muted }]}>{facility.workspaceId ? `${facility.units} وحدة · ${facility.bookings} حجوزات · إصدار ${facility.snapshotVersion ?? 0}` : "بانتظار التهيئة"}</Text>{!allowed && facility.workspaceId ? <Text style={[styles.deniedAccess, { color: colors.error }]}>لا يملك هذا الدور عضوية في هذه المنشأة</Text> : null}</View><MaterialIcons name={selected ? "check-circle" : allowed ? "swap-horiz" : "lock-outline"} size={22} color={selected ? colors.primary : allowed ? colors.muted : colors.error} /></Pressable>; })}</View><Pressable disabled={busy || !activeWorkspaceId || !hasAccess(activeWorkspaceId)} onPress={() => void runPreview()} style={({ pressed }) => [styles.previewButton, { borderColor: colors.primary, backgroundColor: colors.primary + "10", opacity: pressed || busy || !activeWorkspaceId || !hasAccess(activeWorkspaceId) ? 0.5 : 1 }]}><MaterialIcons name="visibility" size={20} color={colors.primary} /><Text style={[styles.previewText, { color: colors.primary }]}>{preview.isPending ? "جارٍ تحميل المعاينة…" : "معاينة عزل المنشأة وصلاحيات الدور"}</Text><MaterialIcons name="chevron-left" size={20} color={colors.primary} /></Pressable><Pressable disabled={busy || !activeWorkspaceId || !hasAccess(activeWorkspaceId)} onPress={() => void switchToWorkspace()} style={({ pressed }) => [styles.previewButton, { borderColor: colors.success, backgroundColor: colors.success + "10", opacity: pressed || busy || !activeWorkspaceId || !hasAccess(activeWorkspaceId) ? 0.5 : 1 }]}><MaterialIcons name="swap-horiz" size={20} color={colors.success} /><Text style={[styles.previewText, { color: colors.success }]}>{selectWorkspace.isPending ? "جارٍ التبديل…" : "التبديل والعمل في هذه المنشأة"}</Text></Pressable></Card>

    {result ? <Card title="نتيجة المحاكاة" colors={colors}><View style={[styles.resultHeader, { backgroundColor: colors.success + "10", borderColor: colors.success + "55" }]}><MaterialIcons name="verified" size={20} color={colors.success} /><View style={styles.flex}><Text style={[styles.resultTitle, { color: colors.foreground }]}>{actorLabel(result.actor)} · {result.workspace.name}</Text><Text style={[styles.resultText, { color: colors.muted }]}>{result.account.displayName} — عرض مقيد دون تغيير الجلسة</Text></View></View><Text style={[styles.sectionLabel, { color: colors.foreground }]}>الوحدات المرئية ({result.isolation.units.length})</Text>{result.isolation.units.map((unit) => <PreviewRow key={unit.id} icon="holiday-village" text={unit.name} colors={colors} />)}<Text style={[styles.sectionLabel, { color: colors.foreground }]}>الحجوزات المعزولة ({result.isolation.bookings.length})</Text>{result.isolation.bookings.map((booking) => <PreviewRow key={booking.id} icon="event" text={`${booking.customerName} · ${booking.chaletName} · ${booking.startDate}`} colors={colors} />)}<Text style={[styles.sectionLabel, { color: colors.foreground }]}>قالب واتساب الخاص بالمنشأة</Text><Text style={[styles.template, { color: colors.muted, backgroundColor: colors.surfaceMuted, borderColor: colors.border }]} numberOfLines={3}>{result.isolation.whatsAppBaseHeaderTemplate}</Text><Text style={[styles.sectionLabel, { color: colors.foreground }]}>الصلاحيات الفعّالة في المعاينة</Text><View style={styles.permissionGrid}>{Object.entries(result.permissions).filter(([, granted]) => granted).map(([permission]) => <View key={permission} style={[styles.permission, { backgroundColor: colors.success + "12", borderColor: colors.success + "55" }]}><MaterialIcons name="check" size={14} color={colors.success} /><Text style={[styles.permissionText, { color: colors.foreground }]}>{permissionLabel(permission)}</Text></View>)}</View></Card> : null}
    {message ? <View style={[styles.message, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "55" }]}><MaterialIcons name="info-outline" size={18} color={colors.primary} /><Text style={[styles.messageText, { color: colors.foreground }]}>{message}</Text></View> : null}
  </ScrollView></ScreenContainer>;
}

function Card({ title, colors, children }: { title: string; colors: ReturnType<typeof useColors>; children: React.ReactNode }) { return <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text><GlowGlassCard style={styles.card} contentStyle={styles.cardContent}>{children}</GlowGlassCard></View>; }
function Metric({ label, value, color }: { label: string; value: string; color: string }) { return <View style={[styles.metric, { backgroundColor: color + "0F", borderColor: color + "44" }]}><Text style={[styles.metricLabel, { color }]}>{label}</Text><Text style={[styles.metricValue, { color: "#94A3B8" }]}>{value}</Text></View>; }
function PreviewRow({ icon, text, colors }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; text: string; colors: ReturnType<typeof useColors> }) { return <View style={[styles.previewRow, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name={icon} size={17} color={colors.primary} /><Text style={[styles.previewRowText, { color: colors.foreground }]}>{text}</Text></View>; }
function actorLabel(actor: Actor) { return actor === "super-admin" ? "مدير النظام" : actor === "owner" ? "مالك المنشأة" : actor === "staff" ? "موظف مشترك" : "حارس ميداني"; }
function actorIcon(actor: Actor): React.ComponentProps<typeof MaterialIcons>["name"] { return actor === "super-admin" ? "admin-panel-settings" : actor === "owner" ? "workspace-premium" : actor === "staff" ? "support-agent" : "security"; }
function permissionLabel(key: string) { return ({ view_financial_reports: "عرض المالية", manage_payments: "إدارة الدفعات", refund_security_deposits: "استرداد التأمين", create_bookings: "إنشاء حجز", edit_bookings: "تعديل حجز", cancel_delete_bookings: "إلغاء/حذف", view_audit_logs: "سجل التدقيق" } as Record<string, string>)[key] ?? key; }

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120 }, center: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center", gap: 12 }, denied: { fontSize: 18, fontWeight: "900", textAlign: "center" }, back: { minHeight: 46, borderRadius: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" }, whiteText: { color: "#FFFFFF", fontWeight: "900" }, notice: { marginTop: 14, borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: "row-reverse", gap: 9, alignItems: "center" }, noticeText: { flex: 1, fontSize: 11, lineHeight: 18, fontWeight: "800", textAlign: "right" }, section: { marginTop: 18 }, sectionTitle: { marginBottom: 8, fontSize: 15, fontWeight: "900", textAlign: "right" }, card: { borderRadius: 18 }, cardContent: { padding: 12, gap: 10 }, detail: { fontSize: 11, lineHeight: 18, textAlign: "right" }, primary: { minHeight: 50, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 }, primaryText: { fontSize: 13, fontWeight: "900" }, metrics: { gap: 7 }, metric: { minHeight: 50, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, justifyContent: "center" }, metricLabel: { fontSize: 11, fontWeight: "900", textAlign: "right" }, metricValue: { marginTop: 3, fontSize: 10, textAlign: "right" }, warning: { fontSize: 11, lineHeight: 18, textAlign: "right", fontWeight: "800" }, actorGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 }, actor: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row-reverse", alignItems: "center", gap: 5 }, account: { borderWidth: 1, borderRadius: 12, padding: 10 }, accountTitle: { fontSize: 12, fontWeight: "900", textAlign: "right" }, accountText: { marginTop: 3, fontSize: 10, textAlign: "right" }, facilityList: { gap: 7 }, facility: { minHeight: 63, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", gap: 9 }, flex: { flex: 1, minWidth: 0 }, facilityName: { fontSize: 13, fontWeight: "900", textAlign: "right" }, facilityText: { marginTop: 3, fontSize: 10, textAlign: "right" }, deniedAccess: { marginTop: 3, fontSize: 9, fontWeight: "800", textAlign: "right" }, previewButton: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", gap: 8 }, previewText: { flex: 1, fontSize: 12, fontWeight: "900", textAlign: "right" }, resultHeader: { minHeight: 58, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, flexDirection: "row-reverse", alignItems: "center", gap: 8 }, resultTitle: { fontSize: 12, fontWeight: "900", textAlign: "right" }, resultText: { marginTop: 3, fontSize: 10, textAlign: "right" }, sectionLabel: { marginTop: 4, fontSize: 11, fontWeight: "900", textAlign: "right" }, previewRow: { minHeight: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, flexDirection: "row-reverse", alignItems: "center", gap: 7 }, previewRowText: { flex: 1, fontSize: 10, fontWeight: "800", textAlign: "right" }, template: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 10, lineHeight: 16, textAlign: "right" }, permissionGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }, permission: { minHeight: 30, borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, flexDirection: "row-reverse", alignItems: "center", gap: 4 }, permissionText: { fontSize: 9, fontWeight: "800" }, message: { marginTop: 18, borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 8 }, messageText: { flex: 1, fontSize: 11, lineHeight: 17, fontWeight: "800", textAlign: "right" },
});
