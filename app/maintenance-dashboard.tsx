import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenBackButton } from "@/components/screen-back-button";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { localDateISO, type Asset, type AssetCondition, type MaintenanceFrequency, type MaintenanceTask, type MaintenanceTaskStatus } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { addDays } from "@/lib/booking-model";
import { useI18n } from "@/lib/i18n";
import { assetConditionLabel, isMaintenanceDueToday, isMaintenanceOverdue, isMaintenanceUpcoming, MAINTENANCE_FREQUENCIES, maintenanceFrequencyLabel, maintenanceStats, maintenanceTaskStatusLabel } from "@/lib/maintenance";
import { useAppPreferences } from "@/lib/app-preferences";
import { useWorkspaceAccess } from "@/lib/workspace-access";

const ASSET_CATEGORIES = [
  { id: "appliances", label: ["الأجهزة الكهربائية", "Appliances"] },
  { id: "furniture", label: ["الأثاث والتجهيزات", "Furniture & fittings"] },
  { id: "plumbing", label: ["السباكة والكهرباء", "Plumbing & electrical"] },
  { id: "outdoor", label: ["الهواء الطلق", "Outdoor"] },
  { id: "other", label: ["أخرى", "Other"] },
] as const;

const ASSET_CONDITION_OPTIONS: { id: AssetCondition; icon: "verified" | "check-circle" | "warning" }[] = [
  { id: "excellent", icon: "verified" },
  { id: "good", icon: "check-circle" },
  { id: "needs_service", icon: "warning" },
];

type TaskDraft = { id?: string; title: string; chaletId: string; chaletName?: string; frequency: MaintenanceFrequency; nextDueDate: string; note?: string; cost?: string; customIntervalDays?: string };
type AssetDraft = { id?: string; name: string; chaletId: string; chaletName?: string; category: string; condition: AssetCondition; serialNumber?: string; purchaseCost?: string };

export default function MaintenanceDashboard() {
  const { maintenanceTasks, assets, chalets, saveMaintenanceTask, completeMaintenanceTask, deleteMaintenanceTask, saveAsset, deleteAsset } = useBookings();
  const { isRTL, language } = useI18n();
  const { triggerHaptic, formatDate } = useAppPreferences();
  const { can, user } = useWorkspaceAccess();
  const colors = useColors();
  const [tab, setTab] = useState<"tasks" | "assets">("tasks");
  const [taskSheet, setTaskSheet] = useState<{ mode: "create" | "edit"; draft: TaskDraft } | null>(null);
  const [assetSheet, setAssetSheet] = useState<{ mode: "create" | "edit"; draft: AssetDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<{ kind: "complete" | "delete-task" | "delete-asset"; id: string } | null>(null);
  const inFlight = useRef(false);

  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const canManage = can("edit_bookings");
  const now = useMemo(() => Date.now(), []);
  const stats = useMemo(() => maintenanceStats(maintenanceTasks ?? [], now), [maintenanceTasks, now]);

  const sortedTasks = useMemo(() => {
    const tasks = [...(maintenanceTasks ?? [])];
    tasks.sort((left, right) => {
      const leftDone = left.status === "completed" ? 1 : 0;
      const rightDone = right.status === "completed" ? 1 : 0;
      if (leftDone !== rightDone) return leftDone - rightDone;
      const leftDays = isMaintenanceOverdue(left, now) ? -1 : isMaintenanceDueToday(left, now) ? 0 : isMaintenanceUpcoming(left, now) ? 1 : 2;
      const rightDays = isMaintenanceOverdue(right, now) ? -1 : isMaintenanceDueToday(right, now) ? 0 : isMaintenanceUpcoming(right, now) ? 1 : 2;
      return leftDays - rightDays;
    });
    return tasks;
  }, [maintenanceTasks, now]);

  const openCreateTask = () => {
    if (!canManage) return;
    triggerHaptic();
    setTaskSheet({ mode: "create", draft: { title: "", chaletId: chalets[0]?.id ?? "", frequency: "monthly", nextDueDate: addDays(localDateISO(), 1), customIntervalDays: "30" } });
  };
  const openEditTaskSheet = (task: MaintenanceTask) => {
    if (!canManage) return;
    triggerHaptic();
    setTaskSheet({ mode: "edit", draft: { id: task.id, title: task.title, chaletId: task.chaletId, chaletName: task.chaletName, frequency: task.frequency, nextDueDate: task.nextDueDate, note: task.note, cost: task.cost !== undefined ? String(task.cost) : "", customIntervalDays: task.customIntervalDays !== undefined ? String(task.customIntervalDays) : "" } });
  };
  const closeTaskSheet = () => { if (!saving) setTaskSheet(null); };

  const saveTaskDraft = async () => {
    const sheet = taskSheet;
    if (!sheet || inFlight.current) return;
    const draft = sheet.draft;
    if (!draft.title.trim() || !draft.chaletId || !/^\d{4}-\d{2}-\d{2}$/.test(draft.nextDueDate)) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const chalet = chalets.find((item) => item.id === draft.chaletId);
      const customIntervalDays = draft.frequency === "custom" ? Math.max(1, Math.round(Number(draft.customIntervalDays) || 0)) || 1 : undefined;
      await saveMaintenanceTask({ id: draft.id, title: draft.title, chaletId: draft.chaletId, chaletName: chalet?.name ?? draft.chaletName, frequency: draft.frequency, nextDueDate: draft.nextDueDate, note: draft.note?.trim() || undefined, cost: draft.cost?.trim() ? Math.max(0, Number(draft.cost) || 0) : undefined, customIntervalDays, status: "pending" });
      setTaskSheet(null);
    } catch {
      Alert.alert(language === "ar" ? "تعذر الحفظ" : "Could not save", language === "ar" ? "حاول مرة أخرى بعد قليل." : "Please try again shortly.");
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  };

  const completeTask = async (task: MaintenanceTask) => {
    if (!canManage || busy) return;
    setBusy({ kind: "complete", id: task.id });
    try {
      await triggerHaptic();
      await completeMaintenanceTask(task.id, user?.name);
    } catch {
      Alert.alert(language === "ar" ? "تعذر الإنجاز" : "Could not complete", language === "ar" ? "حاول مرة أخرى بعد قليل." : "Please try again shortly.");
    } finally {
      setBusy(null);
    }
  };

  const removeTask = async (task: MaintenanceTask) => {
    if (!canManage || busy) return;
    Alert.alert(language === "ar" ? "حذف مهمة الصيانة" : "Delete maintenance task", language === "ar" ? `سيتم حذف «${task.title}» نهائيًا.` : `"${task.title}" will be permanently deleted.`, [
      { text: language === "ar" ? "إلغاء" : "Cancel", style: "cancel" },
      { text: language === "ar" ? "حذف" : "Delete", style: "destructive", onPress: async () => { setBusy({ kind: "delete-task", id: task.id }); try { await deleteMaintenanceTask(task.id); } catch { Alert.alert(language === "ar" ? "تعذر الحذف" : "Could not delete", language === "ar" ? "حاول مرة أخرى." : "Please try again."); } finally { setBusy(null); } } },
    ]);
  };

  const openCreateAsset = () => {
    if (!canManage) return;
    triggerHaptic();
    setAssetSheet({ mode: "create", draft: { name: "", chaletId: chalets[0]?.id ?? "", category: "appliances", condition: "good" } });
  };
  const openEditAssetSheet = (asset: Asset) => {
    if (!canManage) return;
    triggerHaptic();
    setAssetSheet({ mode: "edit", draft: { id: asset.id, name: asset.name, chaletId: asset.chaletId, chaletName: asset.chaletName, category: asset.category, condition: asset.condition, serialNumber: asset.serialNumber, purchaseCost: asset.purchaseCost !== undefined ? String(asset.purchaseCost) : "" } });
  };
  const closeAssetSheet = () => { if (!saving) setAssetSheet(null); };

  const saveAssetDraft = async () => {
    const sheet = assetSheet;
    if (!sheet || inFlight.current) return;
    const draft = sheet.draft;
    if (!draft.name.trim() || !draft.chaletId) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const chalet = chalets.find((item) => item.id === draft.chaletId);
      await saveAsset({ id: draft.id, name: draft.name, chaletId: draft.chaletId, chaletName: chalet?.name ?? draft.chaletName, category: draft.category, condition: draft.condition, serialNumber: draft.serialNumber?.trim() || undefined, purchaseCost: draft.purchaseCost?.trim() ? Math.max(0, Number(draft.purchaseCost) || 0) : undefined });
      setAssetSheet(null);
    } catch {
      Alert.alert(language === "ar" ? "تعذر الحفظ" : "Could not save", language === "ar" ? "حاول مرة أخرى بعد قليل." : "Please try again shortly.");
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  };

  const removeAsset = async (asset: Asset) => {
    if (!canManage || busy) return;
    Alert.alert(language === "ar" ? "حذف الأصل" : "Delete asset", language === "ar" ? `سيتم حذف «${asset.name}» مع فصل مهام الصيانة المرتبطة بالأصل.` : `"${asset.name}" will be deleted and linked maintenance tasks detached.`, [
      { text: language === "ar" ? "إلغاء" : "Cancel", style: "cancel" },
      { text: language === "ar" ? "حذف" : "Delete", style: "destructive", onPress: async () => { setBusy({ kind: "delete-asset", id: asset.id }); try { await deleteAsset(asset.id); } catch { Alert.alert(language === "ar" ? "تعذر الحذف" : "Could not delete", language === "ar" ? "حاول مرة أخرى." : "Please try again."); } finally { setBusy(null); } } },
    ]);
  };

  const dueBadge = (task: MaintenanceTask) => {
    if (task.status === "completed") return { icon: "done-all" as const, color: colors.success, label: maintenanceTaskStatusLabel("completed", language) };
    if (isMaintenanceOverdue(task, now)) return { icon: "new-releases" as const, color: colors.error, label: language === "ar" ? "متأخرة" : "Overdue" };
    if (isMaintenanceDueToday(task, now)) return { icon: "today" as const, color: colors.warning, label: language === "ar" ? "مستحقة اليوم" : "Due today" };
    if (isMaintenanceUpcoming(task, now)) return { icon: "schedule" as const, color: colors.primary, label: language === "ar" ? "قريبة" : "Upcoming" };
    return { icon: "event" as const, color: colors.muted, label: language === "ar" ? "لاحقًا" : "Later" };
  };

  const statCard = (label: string, value: number, color: string, icon: "new-releases" | "today" | "schedule" | "done-all") => <View style={[styles.statCard, { backgroundColor: color + "12", borderColor: color + "55" }]}><MaterialIcons name={icon} size={15} color={color} /><Text style={{ color, fontSize: 21, fontWeight: "900", marginTop: 6 }}>{value}</Text><Text style={{ color: colors.muted, fontSize: 9, fontWeight: "700" }}>{label}</Text></View>;

  return <ScreenContainer edges={["top", "left", "right"]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={[styles.header, { flexDirection: row }]}><ScreenBackButton fallbackHref="/(tabs)/more" /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "900", textAlign: align }}>{language === "ar" ? "الصيانة الوقائية" : "Preventive maintenance"}</Text><Text style={[styles.subtitle, { color: colors.muted, textAlign: align, marginTop: 3 }]}>{language === "ar" ? "جرد الأصول والجدولة الدورية ومتابعة الاستحقاق" : "Asset inventory, recurring schedules & due tracking"}</Text></View></View>
    <View style={[styles.statsRow, { flexDirection: row }]}>{statCard(language === "ar" ? "متأخرة" : "Overdue", stats.overdue, colors.error, "new-releases")}{statCard(language === "ar" ? "اليوم" : "Today", stats.dueToday, colors.warning, "today")}{statCard(language === "ar" ? "قريبة" : "Upcoming", stats.upcoming, colors.primary, "schedule")}{statCard(language === "ar" ? "مكتملة" : "Completed", stats.completed, colors.success, "done-all")}</View>

    <View style={[styles.tabRow, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}>
      <Pressable accessibilityRole="button" onPress={() => setTab("tasks")} style={[styles.tab, { backgroundColor: tab === "tasks" ? colors.primary : "transparent" }]}><MaterialIcons name="build" size={16} color={tab === "tasks" ? "#FFFFFF" : colors.muted} /><Text style={{ color: tab === "tasks" ? "#FFFFFF" : colors.muted, fontSize: 12, fontWeight: "900" }}>{language === "ar" ? `المهام (${(maintenanceTasks ?? []).length})` : `Tasks (${(maintenanceTasks ?? []).length})`}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setTab("assets")} style={[styles.tab, { backgroundColor: tab === "assets" ? colors.primary : "transparent" }]}><MaterialIcons name="inventory" size={16} color={tab === "assets" ? "#FFFFFF" : colors.muted} /><Text style={{ color: tab === "assets" ? "#FFFFFF" : colors.muted, fontSize: 12, fontWeight: "900" }}>{language === "ar" ? `الأصول (${(assets ?? []).length})` : `Assets (${(assets ?? []).length})`}</Text></Pressable>
    </View>

    {tab === "tasks" ? <>
      {sortedTasks.length ? sortedTasks.map((task) => {
        const badge = dueBadge(task);
        const editing = busy?.kind === "complete" && busy.id === task.id;
        return <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={task.title} onPress={() => openEditTaskSheet(task)} disabled={!canManage || Boolean(busy)} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: badge.color + "55", opacity: pressed ? 0.72 : 1 }]}>
          <View style={[styles.taskIcon, { backgroundColor: badge.color + "18" }]}><MaterialIcons name={badge.icon} size={20} color={badge.color} /></View>
          <View style={styles.flex}>
            <View style={[styles.cardTitleRow, { flexDirection: row }]}><Text numberOfLines={1} style={[styles.cardTitle, { color: colors.foreground, textAlign: align, flex: 1 }]}>{task.title}</Text><View style={[styles.badgePill, { backgroundColor: badge.color + "18" }]}><Text style={{ color: badge.color, fontSize: 9, fontWeight: "900" }}>{badge.label}</Text></View></View>
            <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted, textAlign: align }]}>{task.chaletName ?? "—"} · {maintenanceFrequencyLabel(task.frequency, language)}{task.assetName ? ` · ${task.assetName}` : ""}{task.status === "completed" && task.completedByName ? ` · ${task.completedByName}` : ""}</Text>
            <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "استحقاق" : "Due"}: {formatDate(task.nextDueDate) ?? task.nextDueDate}{task.cost ? ` · ${task.cost} ${language === "ar" ? "د.أ" : "JOD"}` : ""}</Text>
          </View>
          {task.status === "completed" ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حذف المهمة" : "Delete task"} onPress={() => removeTask(task)} disabled={Boolean(busy)} style={({ pressed }) => [styles.iconDanger, { opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="delete-outline" size={18} color={colors.muted} /></Pressable> : canManage ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إنجاز المهمة" : "Mark complete"} onPress={() => void completeTask(task)} disabled={Boolean(busy)} style={({ pressed }) => [styles.completeButton, { backgroundColor: editing ? colors.muted : colors.success, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={editing ? "hourglass-top" : "check"} size={16} color="#FFFFFF" /></Pressable> : null}
        </Pressable>;
      }) : <View style={styles.empty}><MaterialIcons name="handyman" size={38} color={colors.muted + "88"} /><Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800", marginTop: 12 }}>{language === "ar" ? "لا توجد مهام صيانة بعد" : "No maintenance tasks yet"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "center" }}>{language === "ar" ? "أنشئ مهمة دورية، وستظهر هنا عند استحقاقها مع تنبيه تلقائي." : "Create a recurring task; it will appear here when due with an automatic alert."}</Text></View>}
    </> : <>
      {(assets ?? []).length ? (assets ?? []).map((asset) => {
        const condition = ASSET_CONDITION_OPTIONS.find((item) => item.id === asset.condition);
        const conditionColor = asset.condition === "needs_service" ? colors.error : asset.condition === "excellent" ? colors.success : colors.primary;
        return <Pressable key={asset.id} accessibilityRole="button" accessibilityLabel={asset.name} onPress={() => openEditAssetSheet(asset)} disabled={!canManage || Boolean(busy)} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: asset.condition === "needs_service" ? colors.error + "66" : colors.border, opacity: pressed ? 0.72 : 1 }]}>
          <View style={[styles.taskIcon, { backgroundColor: conditionColor + "18" }]}><MaterialIcons name={condition?.icon ?? "inventory"} size={20} color={conditionColor} /></View>
          <View style={styles.flex}>
            <View style={[styles.cardTitleRow, { flexDirection: row }]}><Text numberOfLines={1} style={[styles.cardTitle, { color: colors.foreground, textAlign: align, flex: 1 }]}>{asset.name}</Text><View style={[styles.badgePill, { backgroundColor: conditionColor + "18" }]}><Text style={{ color: conditionColor, fontSize: 9, fontWeight: "900" }}>{assetConditionLabel(asset.condition, language)}</Text></View></View>
            <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted, textAlign: align }]}>{asset.chaletName ?? "—"} · {ASSET_CATEGORIES.find((item) => item.id === asset.category)?.label[language === "ar" ? 0 : 1] ?? asset.category}{asset.serialNumber ? ` · ${asset.serialNumber}` : ""}</Text>
            {asset.purchaseCost !== undefined ? <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "تكلفة الشراء" : "Purchase cost"}: {asset.purchaseCost} {language === "ar" ? "د.أ" : "JOD"}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حذف الأصل" : "Delete asset"} onPress={() => removeAsset(asset)} disabled={Boolean(busy)} style={({ pressed }) => [styles.iconDanger, { opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="delete-outline" size={18} color={colors.muted} /></Pressable>
        </Pressable>;
      }) : <View style={styles.empty}><MaterialIcons name="inventory" size={38} color={colors.muted + "88"} /><Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800", marginTop: 12 }}>{language === "ar" ? "لا توجد أصول مسجلة" : "No assets recorded"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "center" }}>{language === "ar" ? "رصد الأصول يتيح متابعة حالتها وإنشاء مهام صيانة مرتبطة بها." : "Tracking assets lets you follow their condition and create linked maintenance tasks."}</Text></View>}
    </>}

    {!canManage ? <View style={[styles.lockCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name="lock-outline" size={16} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 11, marginLeft: 6, textAlign: align }}>{language === "ar" ? "عرض الجدولة متاح؛ الإضافة والإنجاز والحذف خاص بالمالك والمديرين." : "Schedule viewing is open; adding, completing, and deleting are owner/manager only."}</Text></View> : null}
  </ScrollView>

  {canManage ? <View style={[styles.dock, { backgroundColor: colors.background }]}><Pressable accessibilityRole="button" accessibilityLabel={tab === "tasks" ? (language === "ar" ? "إضافة مهمة صيانة" : "Add maintenance task") : (language === "ar" ? "إضافة أصل" : "Add asset")} onPress={tab === "tasks" ? openCreateTask : openCreateAsset} style={({ pressed }) => [styles.dockButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}><MaterialIcons name={tab === "tasks" ? "build" : "inventory"} size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>{tab === "tasks" ? (language === "ar" ? "إضافة مهمة صيانة" : "Add maintenance task") : (language === "ar" ? "إضافة أصل" : "Add asset")}</Text></Pressable></View> : null}

  <Modal visible={Boolean(taskSheet)} transparent animationType="slide" onRequestClose={closeTaskSheet} statusBarTranslucent>
    {taskSheet ? <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} disabled={saving} onPress={closeTaskSheet} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.sheetHeader, { flexDirection: row }]}><View style={[styles.sheetIcon, { backgroundColor: colors.primary + "1A" }]}><MaterialIcons name="build" size={20} color={colors.primary} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{taskSheet.mode === "create" ? (language === "ar" ? "مهمة صيانة جديدة" : "New maintenance task") : (language === "ar" ? "تعديل المهمة" : "Edit task")}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={closeTaskSheet} disabled={saving} style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align }}>{language === "ar" ? "العنوان" : "Title"}</Text>
          <TextInput accessibilityLabel={language === "ar" ? "العنوان" : "Title"} value={taskSheet.draft.title} onChangeText={(value) => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, title: value } })} placeholder={language === "ar" ? "مثال: معالجة تفتفة المكيف الرئيسي" : "e.g. Service the main AC unit"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "الوحدة" : "Property"}</Text>
          <View style={[styles.chipWrap, { flexDirection: row }]}>{chalets.map((chalet) => { const selected = taskSheet.draft.chaletId === chalet.id; return <Pressable key={chalet.id} onPress={() => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, chaletId: chalet.id, chaletName: chalet.name } })} style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border }]}><Text style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 11, fontWeight: "900" }}>{chalet.name}</Text></Pressable>; })}</View>
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "الدورية" : "Frequency"}</Text>
          <View style={[styles.chipWrap, { flexDirection: row }]}>{MAINTENANCE_FREQUENCIES.map((freq) => { const selected = taskSheet.draft.frequency === freq.id; return <Pressable key={freq.id} onPress={() => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, frequency: freq.id } })} style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border }]}><Text style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 11, fontWeight: "900" }}>{freq.label[language === "ar" ? 0 : 1]}</Text></Pressable>; })}</View>
          {taskSheet.draft.frequency === "custom" ? <><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "عدد الأيام بين كل صيانة" : "Days between each visit"}</Text><TextInput accessibilityLabel={language === "ar" ? "عدد الأيام" : "Days"} value={taskSheet.draft.customIntervalDays} onChangeText={(value) => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, customIntervalDays: value } })} keyboardType="number-pad" placeholder="30" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /></> : null}
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "الاستحقاق القادم (درجة التاريخ YYYY-MM-DD)" : "Next due date (YYYY-MM-DD)"}</Text>
          <TextInput accessibilityLabel={language === "ar" ? "الاستحقاق القادم" : "Next due date"} value={taskSheet.draft.nextDueDate} onChangeText={(value) => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, nextDueDate: value } })} placeholder="2026-09-15" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "التكلفة المتوقعة (اختياري)" : "Estimated cost (optional)"}</Text>
          <TextInput accessibilityLabel={language === "ar" ? "التكلفة" : "Cost"} value={taskSheet.draft.cost} onChangeText={(value) => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, cost: value } })} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "ملاحظة (اختياري)" : "Note (optional)"}</Text>
          <TextInput accessibilityLabel={language === "ar" ? "ملاحظة" : "Note"} value={taskSheet.draft.note} onChangeText={(value) => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, note: value } })} multiline placeholder={language === "ar" ? "تفاصيل إضافية" : "Extra details"} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حفظ المهمة" : "Save task"} disabled={saving || !taskSheet.draft.title.trim() || !taskSheet.draft.chaletId || !/^\d{4}-\d{2}-\d{2}$/.test(taskSheet.draft.nextDueDate)} onPress={() => void saveTaskDraft()} style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}><MaterialIcons name="save" size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>{saving ? (language === "ar" ? "جارٍ الحفظ..." : "Saving...") : (language === "ar" ? "حفظ المهمة" : "Save task")}</Text></Pressable>
        </ScrollView>
      </View>
    </View> : null}
  </Modal>

  <Modal visible={Boolean(assetSheet)} transparent animationType="slide" onRequestClose={closeAssetSheet} statusBarTranslucent>
    {assetSheet ? <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} disabled={saving} onPress={closeAssetSheet} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.sheetHeader, { flexDirection: row }]}><View style={[styles.sheetIcon, { backgroundColor: colors.primary + "1A" }]}><MaterialIcons name="inventory" size={20} color={colors.primary} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{assetSheet.mode === "create" ? (language === "ar" ? "أصل جديد" : "New asset") : (language === "ar" ? "تعديل الأصل" : "Edit asset")}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={closeAssetSheet} disabled={saving} style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align }}>{language === "ar" ? "اسم الأصل" : "Asset name"}</Text>
          <TextInput accessibilityLabel={language === "ar" ? "اسم الأصل" : "Asset name"} value={assetSheet.draft.name} onChangeText={(value) => setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, name: value } })} placeholder={language === "ar" ? "مثال: مكيف صالة رئيسي" : "e.g. Main hall air conditioner"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "الوحدة" : "Property"}</Text>
          <View style={[styles.chipWrap, { flexDirection: row }]}>{chalets.map((chalet) => { const selected = assetSheet.draft.chaletId === chalet.id; return <Pressable key={chalet.id} onPress={() => setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, chaletId: chalet.id, chaletName: chalet.name } })} style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border }]}><Text style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 11, fontWeight: "900" }}>{chalet.name}</Text></Pressable>; })}</View>
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "التصنيف" : "Category"}</Text>
          <View style={[styles.chipWrap, { flexDirection: row }]}>{ASSET_CATEGORIES.map((category) => { const selected = assetSheet.draft.category === category.id; return <Pressable key={category.id} onPress={() => setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, category: category.id } })} style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border }]}><Text style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 11, fontWeight: "900" }}>{category.label[language === "ar" ? 0 : 1]}</Text></Pressable>; })}</View>
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "الحالة" : "Condition"}</Text>
          <View style={[styles.chipWrap, { flexDirection: row }]}>{ASSET_CONDITION_OPTIONS.map((condition) => { const selected = assetSheet.draft.condition === condition.id; const selectedColor = condition.id === "needs_service" ? colors.error : condition.id === "excellent" ? colors.success : colors.primary; return <Pressable key={condition.id} onPress={() => setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, condition: condition.id } })} style={[styles.chip, { backgroundColor: selected ? selectedColor : colors.surfaceMuted, borderColor: selected ? selectedColor : colors.border }]}><MaterialIcons name={condition.icon} size={13} color={selected ? "#FFFFFF" : colors.muted} /><Text style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 11, fontWeight: "900" }}>{assetConditionLabel(condition.id, language)}</Text></Pressable>; })}</View>
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "الرقم التسلسلي (اختياري)" : "Serial number (optional)"}</Text>
          <TextInput accessibilityLabel={language === "ar" ? "الرقم التسلسلي" : "Serial number"} value={assetSheet.draft.serialNumber} onChangeText={(value) => setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, serialNumber: value } })} placeholder={language === "ar" ? "اختياري" : "Optional"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "تكلفة الشراء (اختياري)" : "Purchase cost (optional)"}</Text>
          <TextInput accessibilityLabel={language === "ar" ? "تكلفة الشراء" : "Purchase cost"} value={assetSheet.draft.purchaseCost} onChangeText={(value) => setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, purchaseCost: value } })} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حفظ الأصل" : "Save asset"} disabled={saving || !assetSheet.draft.name.trim() || !assetSheet.draft.chaletId} onPress={() => void saveAssetDraft()} style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}><MaterialIcons name="save" size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>{saving ? (language === "ar" ? "جارٍ الحفظ..." : "Saving...") : (language === "ar" ? "حفظ الأصل" : "Save asset")}</Text></Pressable>
        </ScrollView>
      </View>
    </View> : null}
  </Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120 },
  flex: { flex: 1, minWidth: 0 },
  subtitle: { fontSize: 11, fontWeight: "600" },
  header: { alignItems: "center", gap: 10, marginBottom: 12 },
  statsRow: { gap: 8 },
  statCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 11, alignItems: "center" },
  tabRow: { borderRadius: 15, padding: 4, gap: 4, marginTop: 14 },
  tab: { flex: 1, minHeight: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  card: { borderRadius: 17, borderWidth: 1, padding: 12, marginTop: 9, alignItems: "center", gap: 10, flexDirection: "row" },
  taskIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardTitleRow: { alignItems: "center", gap: 7 },
  cardTitle: { fontSize: 14, fontWeight: "900" },
  cardMeta: { fontSize: 11, marginTop: 4, fontWeight: "600" },
  badgePill: { minHeight: 20, borderRadius: 10, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" },
  completeButton: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  iconDanger: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 42, paddingHorizontal: 24 },
  lockCard: { flexDirection: "row", alignItems: "center", borderRadius: 13, borderWidth: 1, padding: 10, marginTop: 12 },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 14, paddingBottom: 22, borderTopWidth: 1, borderTopColor: "rgba(128,150,140,0.14)" },
  dockButton: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  backdrop: { flex: 1, backgroundColor: "rgba(3, 7, 12, 0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, padding: 18, paddingBottom: 30, maxHeight: "88%" },
  sheetHeader: { alignItems: "center", gap: 10, marginBottom: 12 },
  sheetIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sheetBody: { gap: 3, paddingBottom: 10 },
  input: { minHeight: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, fontSize: 13, fontWeight: "700", marginTop: 5 },
  multiline: { minHeight: 76, textAlignVertical: "top", paddingTop: 11 },
  chipWrap: { flexWrap: "wrap", gap: 7, marginTop: 7 },
  chip: { minHeight: 36, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 },
  saveBtn: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, marginTop: 16 },
});