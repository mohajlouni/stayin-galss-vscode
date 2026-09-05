import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { CompactScreenHeader } from "@/components/compact-screen-header";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Tab = "pending" | "archive";

export default function ManageDeletionsScreen() {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [query, setQuery] = useState("");
  const [previewKey, setPreviewKey] = useState("");
  const [modal, setModal] = useState<{ open: boolean; contact: string }>({ open: false, contact: "" });
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const pending = trpc.masterControl.pendingDeletions.useQuery(undefined, { retry: false });
  const archived = trpc.masterControl.removedAccounts.useQuery({ limit: 100 }, { retry: false });
  const pendingCount = trpc.masterControl.pendingDeletionCount.useQuery(undefined, { retry: false });
  const preview = trpc.masterControl.previewPurge.useQuery({ contact: previewKey }, { enabled: previewKey.trim().length >= 1, retry: false });
  const purge = trpc.masterControl.purgeUserByContact.useMutation();

  const previewData = preview.data?.ok ? preview.data : undefined;
  const previewError = preview.data && !preview.data.ok ? preview.data : undefined;
  const busy = purge.isPending;

  const refreshAll = async () => {
    await Promise.all([pending.refetch(), archived.refetch(), pendingCount.refetch()]);
  };

  const runPreview = () => {
    const c = query.trim();
    if (!c) { setMessage("أدخل البريد أو الهاتف أو المعرّف للحساب المطلوب."); return; }
    setPreviewKey(c);
    setTyped("");
  };

  const openModalByContact = (contact: string) => {
    setModal({ open: true, contact });
    setTyped("");
    setPreviewKey(contact);
  };

  const doPurge = async () => {
    const confirmText = typed.trim();
    if (confirmText !== "حذف" && confirmText !== "DELETE") { setMessage("اكتب «حذف» أو «DELETE» لتفعيل الزر."); return; }
    try {
      const result = await purge.mutateAsync({ contact: modal.contact, typedConfirmation: confirmText });
      setModal({ open: false, contact: "" });
      setTyped("");
      setQuery("");
      setPreviewKey("");
      if (result.ok) setMessage(`تم الحذف النهائي لحساب ${result.user.name || result.user.email || `#${result.user.id}`} بلا رجعة.`);
      else setMessage(result.error ?? "تعذر تنفيذ الحذف.");
      await refreshAll();
    } catch {
      setMessage("تعذر تنفيذ الحذف. تحقق من الاتصال وصلاحية الإدارة العليا.");
    }
  };

  const remainingLabel = (remainingMs: number) => {
    if (remainingMs <= 0) return "انتهت المهلة";
    const totalHours = Math.floor(remainingMs / 3600000);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `${days} يوم و ${hours} ساعة`;
  };

  const isAuthDenied = Boolean(pending.error) && !pending.isLoading && (pending.error?.data?.code === "FORBIDDEN" || pending.error?.data?.code === "UNAUTHORIZED");
  const loadError = pending.error && !pending.isLoading && !isAuthDenied;

  if (pending.isLoading) return <ScreenContainer><View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.muted }}>جارٍ تحميل قائمة طلبات الحذف…</Text></View></ScreenContainer>;
  if (isAuthDenied) return <ScreenContainer><View style={styles.center}><MaterialIcons name="lock-outline" size={38} color={colors.error} /><Text style={[styles.deniedTitle, { color: colors.foreground }]}>هذه الصفحة مخصصة لمدير النظام فقط</Text><Text style={[styles.deniedText, { color: colors.muted }]}>تُفرض صلاحية الإدارة العليا من الخادم، ولا يكفي الوصول إلى هذا الرابط لفتح أدوات الحذف.</Text><Pressable onPress={() => router.replace("/admin/master-control")} style={[styles.backButton, { backgroundColor: colors.primary }]}><Text style={styles.whiteText}>العودة إلى مركز الإدارة العليا</Text></Pressable></View></ScreenContainer>;
  if (loadError) return <ScreenContainer><View style={styles.center}><MaterialIcons name="error-outline" size={38} color={colors.error} /><Text style={[styles.deniedTitle, { color: colors.foreground }]}>تعذّر تحميل قائمة الحذف</Text><Text style={[styles.deniedText, { color: colors.muted }]}>{pending.error?.message ?? "حدث خطأ أثناء جلب البيانات من الخادم."}</Text><Pressable onPress={() => void pending.refetch()} style={[styles.backButton, { backgroundColor: colors.primary }]}><Text style={styles.whiteText}>إعادة المحاولة</Text></Pressable><Pressable onPress={() => router.replace("/admin/master-control")} style={[styles.cancelButton, { borderColor: colors.border }]}><Text style={{ color: colors.muted, fontWeight: "800" }}>العودة</Text></Pressable></View></ScreenContainer>;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <CompactScreenHeader title="إدارة عمليات الحذف" icon="delete-forever" accentColor={colors.error} backHref="/admin/master-control" showDateTime={false} />
    <View style={[styles.notice, { backgroundColor: colors.error + "10", borderColor: colors.error + "55" }]}><MaterialIcons name="warning" size={21} color={colors.error} /><Text style={[styles.noticeText, { color: colors.foreground }]}>كل حذف هنا نهائي وبلا رجعة ويُسجَّل في أرشيف المحذوفات مع اسم منفّذ الإجراء. يجب كتابة «حذف» أو «DELETE» لتأكيد أي عملية حذف.</Text></View>
    <View style={styles.metrics}><Metric label="قيد المهلة" value={String(pendingCount.data ?? pending.data?.length ?? 0)} color={colors.error} /><Metric label="محذوفة نهائيًا" value={String(archived.data?.length ?? 0)} color={colors.primary} /></View>

    <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>{(["pending", "archive"] as Tab[]).map((tab) => <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, { backgroundColor: activeTab === tab ? colors.error : "transparent" }]}><MaterialIcons name={tab === "pending" ? "hourglass-empty" : "archive"} size={16} color={activeTab === tab ? colors.background : colors.muted} /><Text style={{ color: activeTab === tab ? colors.background : colors.foreground, fontSize: 11, fontWeight: "900" }}>{tab === "pending" ? "قيد المهلة (١٤ يومًا)" : "سجل المحذوفات"}</Text></Pressable>)}</View>

    <Section title="بحث مباشر" colors={colors}><View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="search" size={20} color={colors.primary} /><TextInput value={query} onChangeText={setQuery} placeholder="البريد الإلكتروني أو رقم الهاتف أو معرف المستخدم" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} textAlign="right" style={[styles.searchInput, { color: colors.foreground }]} />{query ? <Pressable onPress={() => { setQuery(""); setPreviewKey(""); }}><MaterialIcons name="close" size={18} color={colors.muted} /></Pressable> : null}</View><ActionButton label="معاينة الحساب" icon="preview" color={colors.primary} disabled={busy || !query.trim()} onPress={runPreview} />{preview.isLoading ? <Text style={[styles.hint, { color: colors.muted }]}>جارٍ المعاينة…</Text> : previewError ? <Text style={[styles.hint, { color: colors.error }]}>{previewError.error}</Text> : previewData ? <><View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.error + "55" }]}><View style={styles.flex}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{previewData.user.name || "مستخدم بدون اسم"}</Text><Text style={[styles.rowText, { color: colors.muted }]}>#{previewData.user.id} · {previewData.user.email || "—"} · {previewData.user.phone || "—"}</Text></View></View><Text style={[styles.smallTitle, { color: colors.foreground }]}>السجلات المرتبطة التي ستُمسح</Text><View style={styles.metrics}><Metric label="طلبات" value={String(previewData.counts.deletionRequests ?? 0)} color={colors.error} /><Metric label="عضويات" value={String(previewData.counts.memberships ?? 0)} color={colors.error} /><Metric label="منشآت" value={String(previewData.counts.activeWorkspaces ?? 0)} color={colors.error} /><Metric label="جلسات" value={String(previewData.counts.sessions ?? 0)} color={colors.error} /></View><ActionButton label="حذف نهائي الآن" icon="delete-forever" color={colors.error} disabled={busy} onPress={() => openModalByContact(query.trim())} /></> : <Text style={[styles.hint, { color: colors.muted }]}>اضغط «معاينة الحساب» لعرض كل السجلات المرتبطة قبل الحذف.</Text>}</Section>

    {activeTab === "pending" ? <Section title="الحسابات قيد مهلة الـ ١٤ يومًا" colors={colors}>{pending.data?.length ? pending.data.map((item) => <View key={item.userId} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.flex}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.email || `#${item.userId}`}</Text><Text style={[styles.rowText, { color: colors.muted }]}>طلبت الحذف: {new Date(item.requestedAt).toLocaleString("ar-JO")} · تلقائي بعد: {remainingLabel(item.remainingMs)}</Text></View><Pressable onPress={() => openModalByContact(String(item.userId))} disabled={busy} style={[styles.miniDanger, { borderColor: colors.error + "88", backgroundColor: colors.error + "10", opacity: busy ? 0.5 : 1 }]}><MaterialIcons name="delete-forever" size={16} color={colors.error} /><Text style={{ color: colors.error, fontWeight: "900", fontSize: 10 }}>حذف نهائي الآن</Text></Pressable></View>) : <Text style={[styles.hint, { color: colors.muted }]}>لا توجد حسابات قيد المهلة حاليًا.</Text>}</Section> : null}

    {activeTab === "archive" ? <Section title="سجل المحذوفات (إزالة بلا رجعة)" colors={colors}>{archived.data?.length ? archived.data.map((item) => <View key={item.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.flex}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.email || item.name || "حساب محذوف"}</Text><Text style={[styles.rowText, { color: colors.muted }]}>حُذف: {new Date(item.removedAt).toLocaleString("ar-JO")} · بواسطة: {item.actorName}{item.removed.memberships ? ` · ${item.removed.memberships} عضوية` : ""}</Text></View><MaterialIcons name="check-circle-outline" size={20} color={colors.primary} /></View>) : <Text style={[styles.hint, { color: colors.muted }]}>لا توجد حسابات محذوفة نهائيًا بعد.</Text>}</Section> : null}

    {message ? <View style={[styles.message, { backgroundColor: colors.error + "10", borderColor: colors.error + "55" }]}><MaterialIcons name="info-outline" size={18} color={colors.error} /><Text style={[styles.messageText, { color: colors.foreground }]}>{message}</Text></View> : null}
  </ScrollView>
  <Modal visible={modal.open} transparent animationType="fade" onRequestClose={() => { if (!busy) setModal({ open: false, contact: "" }); }}>
    <View style={[styles.modalBackdrop, { backgroundColor: "#000000" + "CC" }]}>
      <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.error + "77" }]}>
        <View style={[styles.modalIconWrap, { backgroundColor: colors.error + "14" }]}><MaterialIcons name="delete-forever" size={38} color={colors.error} /></View>
        <Text style={[styles.modalTitle, { color: colors.foreground }]}>حذف نهائي لا رجعة فيه</Text>
        <Text style={[styles.modalText, { color: colors.muted }]}>سيتم شطب الحساب {modal.contact} وتصفير جميع بياناته وارتباطاته نهائيًا من قاعدة البيانات. لا يمكن استرجاع أي شيء بعد هذا الإجراء.</Text>
        {preview.isLoading ? <ActivityIndicator color={colors.error} /> : previewData ? <View style={[styles.modalCounts, { backgroundColor: colors.error + "10", borderColor: colors.error + "44" }]}><Text style={[styles.modalCountsText, { color: colors.foreground }]}>السجلات المرتبطة التي ستُمسح: {footerCounts(previewData)}</Text></View> : null}
        <TextInput value={typed} onChangeText={setTyped} placeholder="اكتب «حذف» أو «DELETE» للتأكيد" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} textAlign="center" style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
        <Pressable disabled={busy || (typed.trim() !== "حذف" && typed.trim() !== "DELETE")} onPress={() => void doPurge()} style={[styles.modalConfirm, { backgroundColor: colors.error, opacity: busy || (typed.trim() !== "حذف" && typed.trim() !== "DELETE") ? 0.45 : 1 }]}><MaterialIcons name="delete-forever" size={19} color="#FFFFFF" /><Text style={[styles.modalConfirmText, { color: "#FFFFFF" }]}>{busy ? "جارٍ الحذف…" : "تأكيد الحذف النهائي"}</Text></Pressable>
        <Pressable disabled={busy} onPress={() => setModal({ open: false, contact: "" })} style={[styles.modalCancel, { borderColor: colors.border }]}><Text style={{ color: colors.muted, fontWeight: "800" }}>إلغاء</Text></Pressable>
      </View>
    </View>
  </Modal>
</ScreenContainer>;
}

function footerCounts(data: { counts: Record<string, number> }) {
  const c = data.counts;
  const total = (c.deletionRequests ?? 0) + (c.memberships ?? 0) + (c.activeWorkspaces ?? 0) + (c.invitations ?? 0) + (c.ownerPins ?? 0) + (c.sessions ?? 0);
  if (total === 0) return "لا توجد سجلات مرتبطة إضافية";
  return `${total} سجلًا (${c.deletionRequests ?? 0} طلب حذف، ${c.memberships ?? 0} عضوية، ${c.activeWorkspaces ?? 0} منشأة نشطة، ${c.sessions ?? 0} جلسة)`;
}

function Section({ title, colors, children }: { title: string; colors: ReturnType<typeof useColors>; children: React.ReactNode }) { return <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text><GlowGlassCard style={styles.sectionBody} contentStyle={styles.sectionBodyContent}>{children}</GlowGlassCard></View>; }
function Metric({ label, value, color }: { label: string; value: string; color: string }) { return <View style={[styles.metric, { borderColor: color + "66", backgroundColor: color + "10" }]}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function ActionButton({ label, icon, color, disabled, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; color: string; disabled: boolean; onPress: () => void }) { return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionButton, { borderColor: color + "88", backgroundColor: color + "10", opacity: pressed || disabled ? 0.5 : 1 }]}><MaterialIcons name={icon} size={20} color={color} /><Text style={[styles.actionText, { color }]}>{label}</Text><MaterialIcons name="chevron-left" size={20} color={color} /></Pressable>; }

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120 }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 }, deniedTitle: { fontSize: 19, fontWeight: "900", textAlign: "center" }, deniedText: { fontSize: 13, lineHeight: 20, textAlign: "center" }, backButton: { minHeight: 46, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 8 }, cancelButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 6 }, whiteText: { color: "#FFFFFF", fontWeight: "900" },
  notice: { marginTop: 14, borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: "row-reverse", gap: 9, alignItems: "center" }, noticeText: { flex: 1, fontSize: 11, fontWeight: "800", textAlign: "right", lineHeight: 17 },
  metrics: { flexDirection: "row-reverse", gap: 8, marginTop: 12 }, metric: { flex: 1, minHeight: 64, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" }, metricValue: { fontSize: 20, fontWeight: "900" }, metricLabel: { color: "#94A3B8", fontSize: 10, fontWeight: "800", marginTop: 3 },
  tabs: { marginTop: 16, flexDirection: "row-reverse", borderRadius: 13, borderWidth: 1, padding: 4, gap: 4 }, tab: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 5 },
  section: { marginTop: 18 }, sectionTitle: { fontSize: 15, fontWeight: "900", textAlign: "right", marginBottom: 8 }, sectionBody: { borderRadius: 18 }, sectionBodyContent: { padding: 11, gap: 9 }, smallTitle: { fontSize: 12, fontWeight: "900", textAlign: "right", marginTop: 4 },
  searchBox: { minHeight: 47, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", gap: 8 }, searchInput: { flex: 1, fontSize: 12, textAlign: "right" },
  row: { minHeight: 58, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row-reverse", alignItems: "center", gap: 8 }, flex: { flex: 1, minWidth: 0 }, rowTitle: { fontSize: 13, fontWeight: "900", textAlign: "right" }, rowText: { fontSize: 10, marginTop: 3, textAlign: "right" }, hint: { fontSize: 11, lineHeight: 17, textAlign: "right" },
  miniDanger: { minHeight: 34, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 4 },
  actionButton: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", gap: 9 }, actionText: { flex: 1, fontSize: 12, textAlign: "right", fontWeight: "900" },
  message: { marginTop: 18, padding: 12, borderWidth: 1, borderRadius: 14, flexDirection: "row-reverse", alignItems: "center", gap: 8 }, messageText: { flex: 1, fontSize: 11, lineHeight: 17, textAlign: "right", fontWeight: "800" },
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }, modalCard: { width: "100%", maxWidth: 460, borderRadius: 20, borderWidth: 1, padding: 20, gap: 12 }, modalIconWrap: { alignSelf: "center", width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center" }, modalTitle: { fontSize: 17, fontWeight: "900", textAlign: "center" }, modalText: { fontSize: 12, lineHeight: 19, textAlign: "center" },
  modalCounts: { borderRadius: 12, borderWidth: 1, padding: 10 }, modalCountsText: { fontSize: 11, textAlign: "right", fontWeight: "800", lineHeight: 17 }, modalInput: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 13, fontWeight: "800" }, modalConfirm: { minHeight: 50, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 7 }, modalConfirmText: { fontWeight: "900", fontSize: 14 }, modalCancel: { minHeight: 44, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
