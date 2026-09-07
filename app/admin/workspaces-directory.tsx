import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AdminSessionExpired } from "@/components/admin-session-expired";
import { CompactScreenHeader } from "@/components/compact-screen-header";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Filter = "all" | "active" | "empty";

export default function WorkspacesDirectoryScreen() {
  const colors = useColors();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const overview = trpc.masterControl.overview.useQuery(undefined, { retry: false });
  const directory = trpc.masterControl.directory.useQuery({ query: search }, { enabled: search.trim().length >= 1, retry: false });
  const options = trpc.masterControl.workspaceOptions.useQuery({ workspaceId: expandedId ?? 0 }, { enabled: Boolean(expandedId), retry: false });

  const totalWorkspaces = overview.data?.workspaces.length ?? 0;
  const activeMembers = overview.data?.workspaces.reduce((sum, entry) => sum + entry.memberCount, 0) ?? 0;
  const emptyWorkspaces = overview.data?.workspaces.filter((entry) => entry.memberCount === 0).length ?? 0;

  const filteredEntries = (overview.data?.workspaces ?? []).filter((entry) => filter === "all" ? true : filter === "active" ? entry.memberCount > 0 : entry.memberCount === 0);
  const results = directory.data ?? [];
  const isSearching = search.trim().length >= 1;

  const isAuthDenied = Boolean(overview.error) && !overview.isLoading && overview.error?.data?.code === "FORBIDDEN";
  const loadError = overview.error && !overview.isLoading && !isAuthDenied && overview.error?.data?.code !== "UNAUTHORIZED";

  if (overview.isLoading) return <ScreenContainer><View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.muted }}>جارٍ تحميل دليل المنشآت…</Text></View></ScreenContainer>;
  if (overview.error?.data?.code === "UNAUTHORIZED") return <AdminSessionExpired />;
  if (isAuthDenied) return <ScreenContainer><View style={styles.center}><MaterialIcons name="lock-outline" size={38} color={colors.error} /><Text style={[styles.deniedTitle, { color: colors.foreground }]}>هذه اللوحة مخصصة لمدير النظام فقط</Text><Text style={[styles.deniedText, { color: colors.muted }]}>تُفرض صلاحية الإدارة العليا من الخادم، ولا يكفي الوصول إلى هذا الرابط لفتح دليل المنشآت.</Text><Pressable onPress={() => router.replace("/admin/master-control")} style={[styles.backButton, { backgroundColor: colors.primary }]}><Text style={styles.whiteText}>العودة إلى مركز الإدارة العليا</Text></Pressable></View></ScreenContainer>;
  if (loadError) return <ScreenContainer><View style={styles.center}><MaterialIcons name="error-outline" size={38} color={colors.error} /><Text style={[styles.deniedTitle, { color: colors.foreground }]}>تعذّر تحميل دليل المنشآت</Text><Text style={[styles.deniedText, { color: colors.muted }]}>{overview.error?.message ?? "حدث خطأ أثناء جلب البيانات من الخادم."}</Text><Pressable onPress={() => void overview.refetch()} style={[styles.backButton, { backgroundColor: colors.primary }]}><Text style={styles.whiteText}>إعادة المحاولة</Text></Pressable><Pressable onPress={() => router.replace("/admin/master-control")} style={[styles.cancelButton, { borderColor: colors.border }]}><Text style={{ color: colors.muted, fontWeight: "800" }}>العودة</Text></Pressable></View></ScreenContainer>;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <CompactScreenHeader title="دليل المنشآت وإدارة المستأجرين" icon="domain" accentColor={colors.primary} backHref="/admin/master-control" showDateTime={false} />
    <View style={[styles.notice, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "55" }]}><MaterialIcons name="corporate-fare" size={21} color={colors.primary} /><Text style={[styles.noticeText, { color: colors.foreground }]}>مفهرس شامل لمنشآت StayIn: الحالة الفعلية للأعضاء النشطين، الوحدات، والمعرّفات، مع روابط تحكم تشغيلية سريعة لكل منشأة.</Text></View>

    <View style={styles.metrics}><Metric label="إجمالي المنشآت" value={String(totalWorkspaces)} color={colors.primary} /><Metric label="الأعضاء النشطون" value={String(activeMembers)} color={colors.success} /><Metric label="المنشآت الفارغة" value={String(emptyWorkspaces)} color={colors.warning} /></View>

    <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="search" size={20} color={colors.primary} /><TextInput value={search} onChangeText={setSearch} placeholder="ابحث باسم المنشأة، هاتف المالك، أو المعرف..." placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} textAlign="right" style={[styles.searchInput, { color: colors.foreground }]} />{search ? <Pressable onPress={() => setSearch("")}><MaterialIcons name="close" size={18} color={colors.muted} /></Pressable> : null}</View>

    <View style={styles.pills}>{(Object.keys(FILTER_PILLS) as Filter[]).map((key) => <Pressable key={key} onPress={() => setFilter(key)} style={[styles.pill, { backgroundColor: filter === key ? colors.primary : colors.surface, borderColor: filter === key ? colors.primary : colors.border }]}><Text style={{ color: filter === key ? colors.background : colors.foreground, fontWeight: "900", fontSize: 11 }}>{FILTER_PILLS[key]}</Text></Pressable>)}</View>

    {isSearching ? <>
      {directory.isLoading ? <View style={styles.searchState}><ActivityIndicator color={colors.primary} /><Text style={[styles.hint, { color: colors.muted }]}>جارٍ البحث في المنشآت والأعضاء…</Text></View> : results.length ? results.map((entry) => <DirectoryRow key={entry.workspace.id} entry={entry} colors={colors} />) : <View style={[styles.emptyRow, { borderColor: colors.border, backgroundColor: colors.surface }]}><MaterialIcons name="search-off" size={22} color={colors.muted} /><Text style={[styles.emptyRowText, { color: colors.muted }]}>لا توجد نتائج مطابقة.</Text></View>}
    </> : <>
      {filteredEntries.length ? filteredEntries.map((entry) => <WorkspaceCard key={entry.workspace.id} entry={entry} expanded={expandedId === entry.workspace.id} units={options.data?.units ?? []} unitsLoading={options.isLoading && expandedId === entry.workspace.id} colors={colors} onToggle={() => setExpandedId((current) => current === entry.workspace.id ? null : entry.workspace.id)} />) : <View style={[styles.emptyRow, { borderColor: colors.border, backgroundColor: colors.surface }]}><MaterialIcons name="domain-disabled" size={22} color={colors.muted} /><Text style={[styles.emptyRowText, { color: colors.muted }]}>لا توجد منشآت ضمن هذا التصنيف.</Text></View>}
    </>}
  </ScrollView></ScreenContainer>;
}

const FILTER_PILLS: Record<Filter, string> = { all: "الكل", active: "المنشآت النشطة", empty: "المنشآت الفارغة (0 أعضاء)" };

function WorkspaceCard({ entry, expanded, units, unitsLoading, colors, onToggle }: { entry: { workspace: { id: number; name: string }; memberCount: number; snapshot: { version: number } | null }; expanded: boolean; units: Array<{ id: string; name: string; color: string }>; unitsLoading: boolean; colors: ReturnType<typeof useColors>; onToggle: () => void }) {
  const open = () => { router.push({ pathname: "/admin/master-control", params: { workspace: String(entry.workspace.id) } }); };
  return <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
    <View style={styles.cardTop}><View style={styles.flex}><Text style={[styles.cardTitle, { color: colors.foreground }]}>{entry.workspace.name}</Text><Text style={[styles.cardSub, { color: colors.muted }]}>{entry.memberCount > 0 ? `${entry.memberCount} عضو نشط · ${entry.snapshot ? `إصدار ${entry.snapshot.version}` : "لا توجد لقطة متزامنة"}` : "منشأة فارغة (0 أعضاء)"}</Text></View><Pressable style={({ pressed }) => [styles.switchButton, { borderColor: colors.primary, backgroundColor: colors.primary + "10", opacity: pressed ? 0.6 : 1 }]} onPress={open}><MaterialIcons name="tune" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 10 }}>إدارة المنشأة</Text></Pressable></View>
    <Pressable onPress={onToggle} style={[styles.expandToggle, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}><MaterialIcons name={expanded ? "expand-less" : "expand-more"} size={16} color={colors.primary} /><Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 11 }}>{expanded ? "إخفاء الوحدات" : "عرض الوحدات"}</Text></Pressable>
    {expanded ? <View style={styles.units}>{unitsLoading ? <Text style={[styles.hint, { color: colors.muted }]}>جارٍ تحميل الوحدات…</Text> : units.length ? units.map((unit) => <View key={unit.id} style={styles.unitRow}><View style={[styles.unitDot, { backgroundColor: unit.color || colors.primary }]} /><Text style={[styles.unitName, { color: colors.foreground }]}>{unit.name}</Text></View>) : <Text style={[styles.hint, { color: colors.muted }]}>لا توجد وحدات مسجلة لهذه المنشأة.</Text>}</View> : null}
  </View>;
}

function DirectoryRow({ entry, colors }: { entry: { workspace: { id: number; name: string }; matchingMembers: Array<{ displayName: string; phone: string | null; role: string }> }; colors: ReturnType<typeof useColors> }) {
  const open = () => { router.push({ pathname: "/admin/master-control", params: { workspace: String(entry.workspace.id) } }); };
  return <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
    <View style={styles.cardTop}><View style={styles.flex}><Text style={[styles.cardTitle, { color: colors.foreground }]}>{entry.workspace.name}</Text><Text style={[styles.cardSub, { color: colors.muted }]}>المنشأة #{entry.workspace.id} · نتيجة بحث مطابقة</Text></View><Pressable style={({ pressed }) => [styles.switchButton, { borderColor: colors.primary, backgroundColor: colors.primary + "10", opacity: pressed ? 0.6 : 1 }]} onPress={open}><MaterialIcons name="tune" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 10 }}>إدارة المنشأة</Text></Pressable></View>
    {entry.matchingMembers.length ? entry.matchingMembers.map((member, i) => <View key={i} style={styles.memberMatch}><MaterialIcons name="person" size={15} color={colors.success} /><Text style={[styles.memberMatchText, { color: colors.foreground }]}>{member.displayName}{member.phone ? ` (${member.phone})` : ""} · {member.role}</Text></View>) : null}
  </View>;
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) { return <View style={[styles.metric, { borderColor: color + "66", backgroundColor: color + "10" }]}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120 }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 }, deniedTitle: { fontSize: 19, fontWeight: "900", textAlign: "center" }, deniedText: { fontSize: 13, lineHeight: 20, textAlign: "center" }, backButton: { minHeight: 46, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 8 }, cancelButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 6 }, whiteText: { color: "#FFFFFF", fontWeight: "900" },
  notice: { marginTop: 14, borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: "row-reverse", gap: 9, alignItems: "center" }, noticeText: { flex: 1, fontSize: 11, fontWeight: "800", textAlign: "right", lineHeight: 17 },
  metrics: { flexDirection: "row-reverse", gap: 8, marginTop: 14 }, metric: { flex: 1, minHeight: 64, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" }, metricValue: { fontSize: 20, fontWeight: "900" }, metricLabel: { color: "#94A3B8", fontSize: 10, fontWeight: "800", marginTop: 3 },
  searchBox: { minHeight: 47, marginTop: 14, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", gap: 8 }, searchInput: { flex: 1, fontSize: 12, textAlign: "right" },
  pills: { flexDirection: "row-reverse", gap: 7, marginTop: 12, flexWrap: "wrap" }, pill: { minHeight: 34, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, justifyContent: "center", alignItems: "center" },
  searchState: { marginTop: 16, alignItems: "center", gap: 8 }, hint: { fontSize: 11, lineHeight: 17, textAlign: "right" },
  card: { marginTop: 12, borderWidth: 1, borderRadius: 15, padding: 11, gap: 8 }, cardTop: { flexDirection: "row-reverse", alignItems: "center", gap: 8 }, flex: { flex: 1, minWidth: 0 }, cardTitle: { fontSize: 13, fontWeight: "900", textAlign: "right" }, cardSub: { fontSize: 10, marginTop: 3, textAlign: "right" },
  switchButton: { minHeight: 32, borderRadius: 10, borderWidth: 1, paddingHorizontal: 9, flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  expandToggle: { minHeight: 36, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5 }, units: { gap: 6 }, unitRow: { flexDirection: "row-reverse", alignItems: "center", gap: 7 }, unitDot: { width: 10, height: 10, borderRadius: 5 }, unitName: { fontSize: 11, fontWeight: "800", textAlign: "right" },
  memberMatch: { flexDirection: "row-reverse", alignItems: "center", gap: 6 }, memberMatchText: { fontSize: 11, fontWeight: "800", textAlign: "right" },
  emptyRow: { marginTop: 16, minHeight: 96, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 14 }, emptyRowText: { fontSize: 12, lineHeight: 19, textAlign: "center" },
});