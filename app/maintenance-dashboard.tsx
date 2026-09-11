import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from "react-native";

import { ScreenBackButton } from "@/components/screen-back-button";
import { ScreenContainer } from "@/components/screen-container";
import { CalendarDateField } from "@/components/calendar-date-picker";
import { CascadingSelectField, CascadingSelectSheet } from "@/components/ui/cascading-select";
import { useColors } from "@/hooks/use-colors";
import { localDateISO, addDays, formatMoney, activeStaffFloatAccounts, activeOwnerTreasuryAccounts, EXPENSE_FUNDING_CHANNELS, EXPENSE_FUNDING_ENTITIES, expenseFundingChannelLabel, expenseFundingEntityLabel, expenseFundingModeLabel, maintenanceAuditActionLabel, maintenancePerformerRoleLabel, type Asset, type AssetCondition, type ExpenseFundingChannel, type MaintenanceAuditAction, type MaintenanceAuditEntry, type MaintenanceBlockPeriod, type MaintenanceFrequency, type MaintenancePerformerRole, type MaintenanceTask, type MaintenanceTaskStatus } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { assetConditionLabel, isMaintenanceDueToday, isMaintenanceOverdue, isMaintenanceUpcoming, MAINTENANCE_FREQUENCIES, maintenanceFrequencyLabel, maintenanceStats, nextMaintenanceDueDate } from "@/lib/maintenance";
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

const BLOCK_PERIOD_OPTIONS: { id: MaintenanceBlockPeriod; label: [string, string] }[] = [
  { id: "full_day", label: ["يوم كامل", "Full day"] },
  { id: "morning", label: ["صباحي (M)", "Morning (M)"] },
  { id: "evening", label: ["مسائي (N)", "Evening (N)"] },
  { id: "overnight", label: ["مبيت / سهرة", "Overnight"] },
];

const MAINTENANCE_PRESETS: { title: string; frequency: MaintenanceFrequency; icon: "pool" | "ac-unit" | "yard" | "water-drop" }[] = [
  { title: "كلورة وفلترة المسبح", frequency: "weekly", icon: "pool" },
  { title: "تنظيف فلاتر المكيفات", frequency: "monthly", icon: "ac-unit" },
  { title: "صيانة وقص الحديقة", frequency: "biweekly", icon: "yard" },
  { title: "فحص المضخات والبويلر", frequency: "monthly", icon: "water-drop" },
];

/** فلاتر تكرار الصيانة: يومية / أسبوعية / شهرية / أخرى (كل أسبوعين وفترة مخصصة). */
const CADENCE_FILTERS: { id: "all" | "daily" | "weekly" | "monthly" | "other"; label: [string, string]; icon: "done-all" | "today" | "view-week" | "calendar-month" | "schedule" }[] = [
  { id: "all", label: ["كافة الفترات", "All periods"], icon: "done-all" },
  { id: "daily", label: ["يومية", "Daily"], icon: "today" },
  { id: "weekly", label: ["أسبوعية", "Weekly"], icon: "view-week" },
  { id: "monthly", label: ["شهرية", "Monthly"], icon: "calendar-month" },
  { id: "other", label: ["أخرى / موسمية", "Other / Seasonal"], icon: "schedule" },
];

const matchesCadenceFilter = (frequency: MaintenanceFrequency, cadence: "all" | "daily" | "weekly" | "monthly" | "other") => cadence === "all" ? true : cadence === "other" ? frequency === "biweekly" || frequency === "custom" || frequency === "once" : frequency === cadence;

/** أسماء أيام الأسبوع حسب فهرس getDay (0 = الأحد). */
const ROLLER_WEEKDAYS: { ar: string[]; en: string[] } = { ar: ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
/** مدى الشريط الزمني: اليوم / الأيام السبعة القادمة / الثلاثين القادمة / الكل / فترة مخصصة. */
type RollerRange = { kind: "today" | "7" | "30" | "all" | "custom"; start?: string; end?: string };
const ROLLER_RANGE_OPTIONS: { id: "today" | "7" | "30" | "all"; label: [string, string] }[] = [
  { id: "today", label: ["اليوم", "Today"] },
  { id: "7", label: ["خلال 7 أيام", "Next 7 days"] },
  { id: "30", label: ["خلال 30 يوماً", "Next 30 days"] },
  { id: "all", label: ["الكل", "All"] },
];
/** يبني قائمة تواريخ متسلسلة ضمن [start..end] مع سقف أمان ضد الأفق الضخم. */
const buildDateRange = (start: string, end: string, cap = 120) => {
  const list: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < cap && cursor) {
    list.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return list;
};

/** عرض الخلية الثابت (54) + الفجوة (6) = 60px، فيكون تحريك 7 أيام = 420px مضبوطاً تماماً على حدود الأيام. */
const ROLLER_PILL_STEP = 60;

type TaskDraft = { id?: string; title: string; unitIds: string[]; allUnits: boolean; chaletName?: string; frequency: MaintenanceFrequency; nextDueDate: string; note?: string; cost?: string; customIntervalDays?: string; blockBooking?: boolean; blockPeriod?: MaintenanceBlockPeriod };
type AssetDraft = { id?: string; name: string; unitIds: string[]; chaletName?: string; category: string; condition: AssetCondition; serialNumber?: string; purchaseCost?: string; /** ترحيل تكلفة الشراء كقيد مصروف (لأصل جديد فقط). */ linkExpense?: boolean; expenseChannel?: ExpenseFundingChannel | null; expenseAccountId?: string };
/** أخطاء التحقق الأحمر في نافذة الأصل: الاسم / الوحدات / مصدر الدفع المربوط. */
type AssetErrors = { name?: boolean; units?: boolean; expense?: boolean };
/** خيار منفّذ المهمة في نافذة الإتمام: المستخدم الحالي، عهدة موظف/حارس، أو حارس الوحدة. */
type PerformerOption = { id: string; name: string; role: MaintenancePerformerRole };
type CompletionDraft = { task: MaintenanceTask; performerId: string; actualCost: string; fundingEntity: "owner" | "staff" | null; fundingChannel: ExpenseFundingChannel | null; fundingSourceId: string; fundingSourceLabel: string; staffMode: "float" | "reimbursement" | null; postExpense: boolean; scheduleNext: boolean; notes: string };
/** اللوحة المنسدلة المفتوحة داخل نافذة الإتمام: منفّذ المهمة ثم سلسلة التمويل (جهة الصرف ← القناة/الموظف ← طريقة السداد). */
type CompletionDropdown = { kind: "performer" | "entity" | "channel" | "staff" | "staffMode" } | null;
/** قناة الصرف من الخزينة المركزية للمالك باختصارها على بطاقة المهمة (كاش / CliQ / IBAN). */
const treasuryChannelShort = (channel: ExpenseFundingChannel | undefined) => channel === "cliq" ? "CliQ" : channel === "iban" ? "IBAN" : channel === "vault-cash" ? "كاش" : "—";
/** طرق سداد الموظف من العهدة المتاحة في سلسلة التمويل، مع خيار الحجز والدّفع من الجيب الخاص. */
const COMPLETION_STAFF_MODES: { id: "float" | "reimbursement"; label: [string, string]; icon: "account-balance-wallet" | "payments" }[] = [
  { id: "float", label: ["خصم من العهدة النقدية المعلقة", "Deduct from the held float cash"], icon: "account-balance-wallet" },
  { id: "reimbursement", label: ["دفع من الجيب الخاص للموظف", "Paid from the staff-monthly own pocket"], icon: "payments" },
];
/** سطر إسناد طريقة الصرف على بطاقة المهمة المكتملة: خزينة المالك / عهدة موظف / جيب خاص (ذمة مستحقة). */
const maintenanceAttribution = (task: MaintenanceTask, language: "ar" | "en") => {
  const staff = task.expenseFundingSourceLabel?.trim() || task.performedByName?.trim();
  if (task.expenseFundingEntity === "owner" && task.expenseFundingChannel) {
    const short = treasuryChannelShort(task.expenseFundingChannel);
    return { label: language === "ar" ? `طريقة الصرف: الخزينة المركزية (${short})` : `Payment: owner treasury (${short})`, amber: false };
  }
  if (task.expenseFundingEntity === "staff" && task.expenseFundingMode && staff) {
    const mode = expenseFundingModeLabel(task.expenseFundingMode, language);
    const prefix = language === "ar" ? "دُفعت بواسطة" : "Paid by";
    return { label: `${prefix}: ${staff} • ${mode}`, amber: task.expenseFundingMode === "reimbursement" };
  }
  return null;
};

export default function MaintenanceDashboard() {
  const { maintenanceTasks, maintenanceAuditLog, assets, chalets, settings, addExpense, saveMaintenanceTask, startMaintenanceTask, completeMaintenanceTaskWithExpense, cancelMaintenanceTask, deleteMaintenanceTask, saveAsset, deleteAsset } = useBookings();
  const { isRTL, language } = useI18n();
  const { triggerHaptic, formatDate } = useAppPreferences();
  const { can, isManager, role, user } = useWorkspaceAccess();
  const colors = useColors();
  const [tab, setTab] = useState<"active" | "archive" | "assets">("active");
  const [taskSheet, setTaskSheet] = useState<{ mode: "create" | "edit"; draft: TaskDraft } | null>(null);
  const [assetSheet, setAssetSheet] = useState<{ mode: "create" | "edit"; draft: AssetDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [assetErrors, setAssetErrors] = useState<AssetErrors>({});
  const [busy, setBusy] = useState<{ kind: "complete" | "start" | "cancel" | "delete-task" | "delete-asset"; id: string } | null>(null);
  const [completion, setCompletion] = useState<CompletionDraft | null>(null);
  const [completionDropdown, setCompletionDropdown] = useState<CompletionDropdown>(null);
  const [performerError, setPerformerError] = useState(false);
  const [fundingError, setFundingError] = useState(false);
  const [channelError, setChannelError] = useState(false);
  const [staffError, setStaffError] = useState(false);
  const [staffModeError, setStaffModeError] = useState(false);
  const [notesError, setNotesError] = useState(false);
  /** إعادة فتح اللوحة نفسها عند ضغط الحقل مكرراً (إغلاق/فتح)، مع الحفاظ على آخر لوحة مفتوحة عند الإغلاق الكامل. */
  const toggleCompletionDropdown = (kind: NonNullable<CompletionDropdown>["kind"]) => setCompletionDropdown((current) => current?.kind === kind ? null : { kind });
  const completionScrollRef = useRef<ScrollView>(null);
  const completionOffsets = useRef<Record<string, number>>({});
  /** يسجّل الإزاحة الرأسية لكل حقل تحقق داخل نافذة الإتمام لتمرير سلس إلى أول حقل خاطئ. */
  const registerCompletionField = (key: string) => (event: LayoutChangeEvent) => { completionOffsets.current[key] = event.nativeEvent.layout.y; };
  const scrollToCompletionField = (key: string) => completionScrollRef.current?.scrollTo({ y: Math.max(0, completionOffsets.current[key] - 8), animated: true });
  const [auditFor, setAuditFor] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<MaintenanceTask | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [unitFilter, setUnitFilter] = useState<string | null>(null);
  const [cadenceFilter, setCadenceFilter] = useState<"all" | "daily" | "weekly" | "monthly" | "other">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [cadenceMenuOpen, setCadenceMenuOpen] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<"today" | "7" | "30" | "all">("all");
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [rollerRange, setRollerRange] = useState<RollerRange>({ kind: "all" });
  const [rangeDraft, setRangeDraft] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [rangePanelOpen, setRangePanelOpen] = useState(false);
  const rollerRef = useRef<ScrollView | null>(null);
  const rollerOffsetRef = useRef(0);
  const inFlight = useRef(false);

  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const canManage = can("edit_bookings");
  // بدء التنفيذ والإلغاء والإتمام متاحة للمالك/الموظفين والحراس بالتساوي؛ الإضافة والتحرير والحذف للمديرين/الموظفين فقط.
  const canOperate = canManage || role === "caretaker";
  const hasPositiveActualCost = (draft: CompletionDraft) => draft.actualCost.trim() !== "" && Number(draft.actualCost) > 0;
  const fundingReady = (draft: CompletionDraft) => {
    if (!hasPositiveActualCost(draft) || !draft.postExpense) return true;
    if (draft.fundingEntity === "staff") return Boolean(draft.fundingSourceId.trim()) && (draft.staffMode === "float" || draft.staffMode === "reimbursement");
    if (draft.fundingEntity === "owner") return draft.fundingChannel === "vault-cash" || ((draft.fundingChannel === "cliq" || draft.fundingChannel === "iban") && Boolean(draft.fundingSourceId.trim()));
    return false;
  };
  const completionNextDate = completion ? nextMaintenanceDueDate(completion.task) : "";
  const now = useMemo(() => Date.now(), []);
  const todayISO = localDateISO(new Date(now));
  const stats = useMemo(() => maintenanceStats(maintenanceTasks ?? [], now), [maintenanceTasks, now]);

  /** تواريخ الشريط الزمني الأفقي؛ يسبق اليوم دائماً يومان من الماضي ليبقى أسبوع التصفح مكتملاً، ويمتد حتى +59 يوماً. */
  /** الشريط الزمني مستمر دائماً: من [قبل يومين] ثم اليوم حتى +59 يوماً (62 خلية). لا يتقلص أبداً عند تبديل أفاق الفلترة. */
  const timelineDates = useMemo(() => {
    const preStart = addDays(todayISO, -2);
    const customStart = rollerRange.kind === "custom" && rollerRange.start ? rollerRange.start : "";
    const start = customStart && customStart < preStart ? customStart : preStart;
    const horizonEnd = rollerRange.kind === "custom" && rollerRange.end ? rollerRange.end : addDays(todayISO, 59);
    const end = horizonEnd >= start ? horizonEnd : addDays(todayISO, 59);
    return buildDateRange(start, end, 120);
  }, [rollerRange, todayISO]);

  /** قائمة المنفّذين المحتملين: المستخدم الحالي ثم عهدة الموظفين ثم حرّاس الوحدات، بدون تكرار. */
  const performerOptions = useMemo<PerformerOption[]>(() => {
    const options: PerformerOption[] = [];
    if (user?.name?.trim()) options.push({ id: "current", name: user.name.trim(), role: role === "owner" || role === "admin" ? "owner" : role === "caretaker" ? "guard" : "staff" });
    activeStaffFloatAccounts(settings).forEach((account) => {
      const name = account.memberName?.trim() || account.label.trim();
      if (name) options.push({ id: account.memberUserId != null ? `staff-${account.memberUserId}` : `staff-${account.id}`, name, role: "staff" });
    });
    const guardians = new Set<string>();
    chalets.forEach((chalet) => { const name = chalet.guardianName?.trim(); if (name) guardians.add(name); });
    guardians.forEach((name) => options.push({ id: `guard-${name}`, name, role: "guard" }));
    const seen = new Set<string>();
    return options.filter((option) => { if (seen.has(option.name)) return false; seen.add(option.name); return true; });
  }, [user, role, settings, chalets]);

  const fundingOwnerAccounts = useMemo(() => activeOwnerTreasuryAccounts(settings), [settings]);
  const fundingStaffFloats = useMemo(() => activeStaffFloatAccounts(settings), [settings]);

  /** يحل الحساب الافتراضي لشرائح تحويلات المالك من الخزينة (CliQ/IBAN): الحساب الافتراضي أولاً ثم أول حساب فعّال من نفس النوع. */
  const resolveOwnerAccount = (channel: ExpenseFundingChannel) => channel === "cliq" || channel === "iban" ? fundingOwnerAccounts.find((account) => account.kind === (channel === "cliq" ? "cliq" : "bank") && account.isDefault) ?? fundingOwnerAccounts.find((account) => account.kind === (channel === "cliq" ? "cliq" : "bank")) : undefined;

  const sortedTasks = useMemo(() => {
    const tasks = [...(maintenanceTasks ?? [])];
    tasks.sort((left, right) => {
      const leftDone = left.status === "completed" || left.status === "cancelled" ? 1 : 0;
      const rightDone = right.status === "completed" || right.status === "cancelled" ? 1 : 0;
      if (leftDone !== rightDone) return leftDone - rightDone;
      const leftDays = isMaintenanceOverdue(left, now) ? -1 : isMaintenanceDueToday(left, now) ? 0 : isMaintenanceUpcoming(left, now) ? 1 : 2;
      const rightDays = isMaintenanceOverdue(right, now) ? -1 : isMaintenanceDueToday(right, now) ? 0 : isMaintenanceUpcoming(right, now) ? 1 : 2;
      return leftDays - rightDays;
    });
    return tasks;
  }, [maintenanceTasks, now]);

  const activeTasks = useMemo(() => sortedTasks.filter((task) => task.status === "scheduled" || task.status === "in_progress"), [sortedTasks]);
  const archiveTasks = useMemo(() => sortedTasks.filter((task) => task.status === "completed" || task.status === "cancelled"), [sortedTasks]);
  const searchActive = searchQuery.trim() !== "";

  const visibleTasks = useMemo(() => {
    const pool = tab === "archive" ? archiveTasks : activeTasks;
    const query = searchQuery.trim().toLowerCase();
    const matchesDate = (task: MaintenanceTask) => {
      if (dateFilter !== null) return task.nextDueDate === dateFilter;
      if (horizon === "today") return task.nextDueDate === todayISO;
      if (horizon === "7") return task.nextDueDate >= todayISO && task.nextDueDate <= addDays(todayISO, 6);
      if (horizon === "30") return task.nextDueDate >= todayISO && task.nextDueDate <= addDays(todayISO, 29);
      return true;
    };
    return pool.filter((task) => matchesDate(task) && (unitFilter === null || task.targetScope === "all_units" || task.chaletId === unitFilter) && matchesCadenceFilter(task.frequency, cadenceFilter) && (query === "" || task.title.toLowerCase().includes(query) || (task.assetName ?? "").toLowerCase().includes(query)));
  }, [tab, activeTasks, archiveTasks, dateFilter, horizon, todayISO, unitFilter, cadenceFilter, searchQuery]);

  const visibleAssets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (assets ?? []).filter((asset) => (query === "" || asset.name.toLowerCase().includes(query)) && (unitFilter === null || asset.chaletId === unitFilter));
  }, [assets, searchQuery, unitFilter]);

  const switchTab = (next: "active" | "archive" | "assets") => { setTab(next); setMenuFor(null); setUnitMenuOpen(false); setCadenceMenuOpen(false); setDateFilter(null); setHorizon("all"); setRangePanelOpen(false); };

  const openCreateTask = () => {
    if (!canManage) return;
    triggerHaptic();
    setTaskError(null);
    setTaskSheet({ mode: "create", draft: { title: "", unitIds: [], allUnits: false, frequency: "once", nextDueDate: addDays(localDateISO(), 1), customIntervalDays: "30" } });
  };
  const openEditTaskSheet = (task: MaintenanceTask) => {
    if (!canManage) return;
    if (task.status === "in_progress") {
      Alert.alert(language === "ar" ? "لا يمكن تعديل المهمة" : "Cannot edit task", language === "ar" ? "لا يمكن تعديل تفاصيل مهمة بدأت بالفعل، يمكنك إتمامها أو إلغاؤها" : "Details of a task that already started cannot be edited; you can complete or cancel it.");
      return;
    }
    triggerHaptic();
    setTaskError(null);
    setTaskSheet({ mode: "edit", draft: { id: task.id, title: task.title, unitIds: task.targetScope === "all_units" ? chalets.map((chalet) => chalet.id) : (task.chaletId ? [task.chaletId] : []), allUnits: task.targetScope === "all_units", chaletName: task.chaletName, frequency: task.frequency, nextDueDate: task.nextDueDate, note: task.note, cost: task.cost !== undefined ? String(task.cost) : "", customIntervalDays: task.customIntervalDays !== undefined ? String(task.customIntervalDays) : "", blockBooking: task.blockBooking, blockPeriod: task.blockPeriod } });
  };
  const toggleTaskUnit = (id: string) => { if (!taskSheet) return; setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, unitIds: taskSheet.draft.unitIds.includes(id) ? taskSheet.draft.unitIds.filter((unitId) => unitId !== id) : [...taskSheet.draft.unitIds, id], allUnits: false } }); setTaskError(null); };
  const toggleAllTaskUnits = () => { if (!taskSheet) return; setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, allUnits: !taskSheet.draft.allUnits, unitIds: !taskSheet.draft.allUnits ? chalets.map((chalet) => chalet.id) : [] } }); setTaskError(null); };
  const closeTaskSheet = () => { if (!saving) { setTaskSheet(null); setTaskError(null); } };

  const saveTaskDraft = async () => {
    const sheet = taskSheet;
    if (!sheet || inFlight.current) return;
    const draft = sheet.draft;
    if (!draft.title.trim()) { setTaskError(language === "ar" ? "يرجى كتابة عنوان المهمة قبل الحفظ" : "Please type the task title before saving"); return; }
    if (!draft.allUnits && !draft.unitIds.length) { setTaskError(language === "ar" ? "يرجى اختيار شاليه واحد على الأقل أو تحديد كافة الوحدات" : "Please select at least one chalet or select all units"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.nextDueDate)) return;
    setTaskError(null);
    inFlight.current = true;
    setSaving(true);
    try {
      const customIntervalDays = draft.frequency === "custom" ? Math.max(1, Math.round(Number(draft.customIntervalDays) || 0)) || 1 : undefined;
      const isEdit = Boolean(draft.id);
      const targets = draft.allUnits ? [undefined] : (isEdit ? (draft.unitIds[0] ? [draft.unitIds[0]] : [""]) : draft.unitIds);
      for (const chaletId of targets) {
        const resolved = chaletId ?? "";
        const chalet = chalets.find((item) => item.id === resolved);
        await saveMaintenanceTask({ id: isEdit ? draft.id : undefined, title: draft.title, chaletId: resolved || undefined, chaletName: resolved ? (chalet?.name ?? draft.chaletName) : undefined, targetScope: resolved ? undefined : "all_units", frequency: draft.frequency, nextDueDate: draft.nextDueDate, note: draft.note?.trim() || undefined, cost: draft.cost?.trim() ? Math.max(0, Number(draft.cost) || 0) : undefined, customIntervalDays, status: "scheduled", blockBooking: !draft.allUnits && draft.blockBooking === true, blockPeriod: !draft.allUnits && draft.blockBooking === true ? (draft.blockPeriod ?? "full_day") : undefined });
      }
      setTaskSheet(null);
      setTaskError(null);
    } catch (error) {
      if (error instanceof Error && error.message === "maintenance-block-collision") {
        Alert.alert(language === "ar" ? "تعارض مع حجز" : "Booking collision", language === "ar" ? "يوجد حجز مؤكد مسبقاً للوحدة في هذا الموعد. يرجى نقل الحجز أو اختيار موعد آخر للصيانة." : "There is already a confirmed booking for this unit at that time. Please move the booking or pick a different maintenance date.");
      } else {
        Alert.alert(language === "ar" ? "تعذر الحفظ" : "Could not save", language === "ar" ? "حاول مرة أخرى بعد قليل." : "Please try again shortly.");
      }
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  };

  const startTask = async (task: MaintenanceTask) => {
    if (!canOperate || busy) return;
    setBusy({ kind: "start", id: task.id });
    try {
      await triggerHaptic();
      await startMaintenanceTask(task.id);
    } catch {
      Alert.alert(language === "ar" ? "تعذر بدء العمل" : "Could not start", language === "ar" ? "حاول مرة أخرى بعد قليل." : "Please try again shortly.");
    } finally {
      setBusy(null);
    }
  };

  const openCompletionModal = (task: MaintenanceTask) => {
    if (!canOperate || busy) return;
    triggerHaptic();
    setCompletion({ task, performerId: "", actualCost: task.actualCost !== undefined ? String(task.actualCost) : task.cost !== undefined ? String(task.cost) : "", fundingEntity: null, fundingChannel: null, fundingSourceId: "", fundingSourceLabel: "", staffMode: null, postExpense: true, scheduleNext: task.frequency === "once" ? false : true, notes: "" });
    setPerformerError(false);
    setFundingError(false);
    setChannelError(false);
    setStaffError(false);
    setStaffModeError(false);
    setNotesError(false);
    setCompletionDropdown(null);
  };

  const submitCompletion = async () => {
    if (!canOperate || busy || !completion) return;
    const performer = performerOptions.find((option) => option.id === completion.performerId);
    const needsFunding = completion.postExpense && hasPositiveActualCost(completion);
    const needsNotes = hasPositiveActualCost(completion);
    const notesValid = !needsNotes || completion.notes.trim().length >= 3;
    if (!performer || (needsFunding && !fundingReady(completion)) || !notesValid) {
      let firstInvalid: string | null = null;
      if (!performer) { setPerformerError(true); firstInvalid = "performer"; }
      if (needsFunding) {
        if (!completion.fundingEntity) { if (!firstInvalid) firstInvalid = "funding"; setFundingError(true); }
        else if (completion.fundingEntity === "owner") {
          if (!completion.fundingChannel || (completion.fundingChannel !== "vault-cash" && !resolveOwnerAccount(completion.fundingChannel))) { if (!firstInvalid) firstInvalid = "channel"; setChannelError(true); }
        } else {
          if (!completion.fundingSourceId.trim()) { if (!firstInvalid) firstInvalid = "staff"; setStaffError(true); }
          if (!completion.staffMode) { if (!firstInvalid) firstInvalid = "staffMode"; setStaffModeError(true); }
        }
      }
      if (!notesValid) { if (!firstInvalid) firstInvalid = "notes"; setNotesError(true); }
      if (firstInvalid) scrollToCompletionField(firstInvalid);
      else if (!performer) scrollToCompletionField("performer");
      return;
    }
    setBusy({ kind: "complete", id: completion.task.id });
    try {
      await triggerHaptic();
      const needsFunding = completion.postExpense && hasPositiveActualCost(completion);
      const ownerChannel = needsFunding && completion.fundingEntity === "owner" ? (completion.fundingChannel ?? undefined) : undefined;
      const ownerAccount = ownerChannel && ownerChannel !== "vault-cash" ? resolveOwnerAccount(ownerChannel) : undefined;
      await completeMaintenanceTaskWithExpense(completion.task.id, {
        performedByName: performer.name,
        performedByRole: performer.role,
        actualCost: completion.actualCost.trim() ? Math.max(0, Number(completion.actualCost) || 0) : undefined,
        funding: needsFunding ? { entity: completion.fundingEntity ?? "owner", channel: ownerChannel, sourceId: (completion.fundingEntity === "staff" ? completion.fundingSourceId.trim() || undefined : ownerAccount?.id) || undefined, sourceLabel: (completion.fundingEntity === "staff" ? completion.fundingSourceLabel.trim() || undefined : ownerAccount?.label) || undefined, mode: completion.fundingEntity === "staff" ? (completion.staffMode ?? undefined) : undefined } : undefined,
        completionNotes: completion.notes,
        postExpense: completion.postExpense,
        scheduleNext: completion.scheduleNext,
      });
      setCompletion(null);
    } catch (error) {
      if (error instanceof Error && error.message === "maintenance-already-completed") {
        Alert.alert(language === "ar" ? "اكتملت مسبقًا" : "Already completed", language === "ar" ? "تم ترحيل هذه المهمة من قبل." : "This task was already completed and posted.");
      } else {
        Alert.alert(language === "ar" ? "تعذر الإنجاز والترحيل" : "Could not complete", language === "ar" ? "حاول مرة أخرى بعد قليل." : "Please try again shortly.");
      }
    } finally {
      setBusy(null);
    }
  };

  const confirmCancel = async (task: MaintenanceTask, mode: "instance" | "series") => {
    if (!canOperate || busy) return;
    setCancelFor(null);
    setBusy({ kind: "cancel", id: task.id });
    try {
      await triggerHaptic();
      await cancelMaintenanceTask(task.id, mode);
    } catch {
      Alert.alert(language === "ar" ? "تعذر الإلغاء" : "Could not cancel", language === "ar" ? "حاول مرة أخرى." : "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const openCancelFlow = (task: MaintenanceTask) => {
    if (!canOperate || busy) return;
    triggerHaptic();
    if (task.frequency === "once") {
      Alert.alert(language === "ar" ? "إلغاء مهمة الصيانة" : "Cancel maintenance task", language === "ar" ? "هل أنت متأكد من إلغاء هذه المهمة؟\nسيتم إتاحة الوحدة للحجز في التقويم (يُحرَّر منع الصيانة تلقائيًا)." : `Are you sure you want to cancel this task?\nThe unit will be unblocked in the calendar automatically.`, [
        { text: language === "ar" ? "تراجع" : "Back", style: "cancel" },
        { text: language === "ar" ? "إلغاء المهمة" : "Cancel task", style: "destructive", onPress: () => void confirmCancel(task, "instance") },
      ]);
      return;
    }
    setCancelFor(task);
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
    setAssetErrors({});
    setAssetSheet({ mode: "create", draft: { name: "", unitIds: chalets.map((chalet) => chalet.id), category: "appliances", condition: "good", linkExpense: false, expenseChannel: null, expenseAccountId: "" } });
  };
  const openEditAssetSheet = (asset: Asset) => {
    if (!canManage) return;
    triggerHaptic();
    setAssetErrors({});
    setAssetSheet({ mode: "edit", draft: { id: asset.id, name: asset.name, unitIds: [asset.chaletId], chaletName: asset.chaletName, category: asset.category, condition: asset.condition, serialNumber: asset.serialNumber, purchaseCost: asset.purchaseCost !== undefined ? String(asset.purchaseCost) : "" } });
  };
  const toggleAssetUnit = (id: string) => { if (!assetSheet) return; setAssetErrors((prev) => ({ ...prev, units: false })); setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, unitIds: assetSheet.draft.unitIds.includes(id) ? assetSheet.draft.unitIds.filter((unitId) => unitId !== id) : [...assetSheet.draft.unitIds, id] } }); };
  const toggleAllAssetUnits = () => { if (!assetSheet) return; setAssetErrors((prev) => ({ ...prev, units: false })); setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, unitIds: assetSheet.draft.unitIds.length === chalets.length && chalets.length > 0 ? [] : chalets.map((chalet) => chalet.id) } }); };
  const closeAssetSheet = () => { if (!saving) { setAssetSheet(null); setAssetErrors({}); } };

  const toggleAssetExpenseLink = () => { if (!assetSheet) return; setAssetErrors((prev) => ({ ...prev, expense: false })); setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, linkExpense: !assetSheet.draft.linkExpense } }); };
  const selectAssetExpenseChannel = (channel: ExpenseFundingChannel) => { if (!assetSheet) return; setAssetErrors((prev) => ({ ...prev, expense: false })); setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, expenseChannel: channel, expenseAccountId: channel === "vault-cash" ? "" : assetSheet.draft.expenseAccountId } }); };
  const selectAssetExpenseAccount = (id: string) => { if (!assetSheet) return; setAssetErrors((prev) => ({ ...prev, expense: false })); setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, expenseAccountId: id } }); };

  const saveAssetDraft = async () => {
    const sheet = assetSheet;
    if (!sheet || inFlight.current) return;
    const draft = sheet.draft;
    if (!draft.name.trim() || !draft.unitIds.length) {
      setAssetErrors({ name: !draft.name.trim(), units: !draft.unitIds.length });
      return;
    }
    const isEdit = Boolean(draft.id);
    const rawCost = draft.purchaseCost?.trim() ? Math.max(0, Number(draft.purchaseCost) || 0) : 0;
    const linking = !isEdit && draft.linkExpense === true && rawCost > 0;
    if (linking) {
      const needsAccount = draft.expenseChannel !== "vault-cash";
      if (!draft.expenseChannel || (needsAccount && !draft.expenseAccountId?.trim())) {
        setAssetErrors((prev) => ({ ...prev, expense: true }));
        return;
      }
    }
    inFlight.current = true;
    setSaving(true);
    try {
      const targets = isEdit ? [draft.unitIds[0]] : draft.unitIds;
      const chaletNameFor = (id: string) => chalets.find((item) => item.id === id)?.name ?? draft.chaletName;
      for (const chaletId of targets) {
        await saveAsset({ id: isEdit ? draft.id : undefined, name: draft.name, chaletId, chaletName: chaletNameFor(chaletId), category: draft.category, condition: draft.condition, serialNumber: draft.serialNumber?.trim() || undefined, purchaseCost: rawCost || undefined });
      }
      if (linking) {
        const paymentMethod = draft.expenseChannel === "vault-cash" ? "cash" : draft.expenseChannel === "cliq" ? "click" : "iban";
        const fundingChannel = draft.expenseChannel ?? "vault-cash";
        const fundingAccount = fundingChannel !== "vault-cash" ? fundingOwnerAccounts.find((acc) => acc.id === draft.expenseAccountId) : undefined;
        const note = `شراء أصول وتجهيزات: ${draft.name.trim()}`;
        if (targets.length === 1) {
          await addExpense({ chaletId: targets[0], chaletName: chaletNameFor(targets[0]), amount: rawCost, date: todayISO, category: "other", note, paymentMethod, fundingEntity: "owner", fundingChannel, fundingSourceId: fundingAccount?.id, fundingSourceLabel: fundingAccount?.label });
        } else {
          const base = Math.floor((rawCost * 100) / targets.length) / 100;
          let remainder = Math.round(rawCost * 100) - Math.round(base * 100) * targets.length;
          const allocations: { chaletId: string; chaletName: string; amount: number }[] = targets.map((id) => ({ chaletId: id, chaletName: chaletNameFor(id) ?? "", amount: base }));
          for (const allocation of allocations) { if (remainder > 0) { allocation.amount = Math.round((allocation.amount + 0.01) * 100) / 100; remainder -= 1; } }
          await addExpense({ amount: rawCost, date: todayISO, category: "other", note, generalAllocations: allocations, paymentMethod, fundingEntity: "owner", fundingChannel, fundingSourceId: fundingAccount?.id, fundingSourceLabel: fundingAccount?.label });
        }
      }
      setAssetSheet(null);
      setAssetErrors({});
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

  const cardTone = (task: MaintenanceTask) => {
    if (task.status === "completed") return { icon: "done-all" as const, color: colors.success };
    if (task.status === "cancelled") return { icon: "cancel" as const, color: colors.muted };
    if (isMaintenanceOverdue(task, now)) return { icon: "new-releases" as const, color: colors.error };
    if (isMaintenanceDueToday(task, now)) return { icon: "today" as const, color: colors.warning };
    if (isMaintenanceUpcoming(task, now)) return { icon: "schedule" as const, color: colors.primary };
    return { icon: "event" as const, color: colors.muted };
  };

  const statusPillInfo = (status: MaintenanceTaskStatus) => status === "scheduled" ? { label: language === "ar" ? "مجدولة" : "Scheduled", color: colors.primary } : status === "in_progress" ? { label: language === "ar" ? "قيد التنفيذ" : "In progress", color: colors.warning } : status === "completed" ? { label: language === "ar" ? "مكتملة ومُرحّلة" : "Completed & posted", color: colors.success } : { label: language === "ar" ? "ملغاة" : "Cancelled", color: colors.muted };

  /** شرح الجدولة الديناميكي الذي يظهر تحت خيارات الدورية في نافذة إنشاء المهمة. */
  const frequencyHint = (frequency: MaintenanceFrequency) => ({ once: ["ستُنفذ هذه المهمة لمرة واحدة فقط دون تكرار تلقائي.", "This task will run only once without automatic recurrence."], daily: ["سيتكرر استحقاق هذه المهمة تلقائياً كل يوم للشاليهات المحددة فور إنجازها.", "This task's due date will automatically recur daily for the selected chalets once completed."], weekly: ["سيتكرر استحقاق هذه المهمة تلقائياً كل أسبوع للشاليهات المحددة فور إنجازها.", "This task's due date will automatically recur weekly for the selected chalets once completed."], biweekly: ["سيتكرر استحقاق هذه المهمة تلقائياً كل أسبوعين للشاليهات المحددة فور إنجازها.", "This task's due date will automatically recur every two weeks for the selected chalets once completed."], monthly: ["سيتكرر استحقاق هذه المهمة تلقائياً كل شهر للشاليهات المحددة فور إنجازها.", "This task's due date will automatically recur monthly for the selected chalets once completed."], custom: ["سيتكرر استحقاق هذه المهمة تلقائياً وفق الفاصل المخصص للشاليهات المحددة فور إنجازها.", "This task's due date will automatically recur on the custom interval for the selected chalets once completed."] } as const)[frequency][language === "ar" ? 0 : 1];

  const statCard = (label: string, value: number, color: string, icon: "new-releases" | "today" | "schedule" | "done-all") => <View style={[styles.statCard, { backgroundColor: color + "12", borderColor: color + "55" }]}><MaterialIcons name={icon} size={15} color={color} /><Text style={{ color, fontSize: 21, fontWeight: "900", marginTop: 6 }}>{value}</Text><Text style={{ color: colors.muted, fontSize: 9, fontWeight: "700" }}>{label}</Text></View>;

  /** يضبط أفق الفلترة لقائمة المهام أدناه فقط؛ الشريط الزمني يبقى مستمراً دون تغيير. */
  const selectHorizon = (id: "today" | "7" | "30" | "all") => {
    setHorizon(id);
    setDateFilter(null);
    if (id === "all") setRollerRange({ kind: "all" });
    if (id === "today" || id === "7") rollerRef.current?.scrollTo({ x: 0, animated: true });
    setRangePanelOpen(false);
  };
  /** يمرر الشريط الزمني أفقياً بمقدار أسبوع كامل (7 أيام) لكل ضغطة، ملتصقاً بحدود الأيام دون قصّ خلية. */
  const nudgeRoller = (weeks: number) => {
    const max = Math.max(0, (timelineDates.length - 7) * ROLLER_PILL_STEP);
    const target = Math.min(Math.max(rollerOffsetRef.current + weeks * 7 * ROLLER_PILL_STEP, 0), max);
    rollerRef.current?.scrollTo({ x: target, animated: true });
  };
  const openRangePanel = () => {
    if (!rangePanelOpen) setRangeDraft({ start: todayISO, end: addDays(todayISO, 29) });
    setRangePanelOpen(!rangePanelOpen);
  };
  const applyCustomRange = () => {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(rangeDraft.start) ? rangeDraft.start : "";
    const end = /^\d{4}-\d{2}-\d{2}$/.test(rangeDraft.end) ? rangeDraft.end : "";
    if (start && end && start <= end) setRollerRange({ kind: "custom", start, end });
    else if (start) setRollerRange({ kind: "custom", start, end: end >= start ? end : addDays(start, 29) });
    else setRollerRange({ kind: "all" });
    setRangePanelOpen(false);
  };

  return <ScreenContainer edges={["top", "left", "right"]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={[styles.header, { flexDirection: row }]}><ScreenBackButton fallbackHref="/(tabs)/more" /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "900", textAlign: align }}>{language === "ar" ? "الصيانة الوقائية" : "Preventive maintenance"}</Text><Text style={[styles.subtitle, { color: colors.muted, textAlign: align, marginTop: 3 }]}>{language === "ar" ? "جرد الأصول والجدولة الدورية ومتابعة الاستحقاق" : "Asset inventory, recurring schedules & due tracking"}</Text></View></View>
    <View style={[styles.statsRow, { flexDirection: row }]}>{statCard(language === "ar" ? "متأخرة" : "Overdue", stats.overdue, colors.error, "new-releases")}{statCard(language === "ar" ? "اليوم" : "Today", stats.dueToday, colors.warning, "today")}{statCard(language === "ar" ? "قريبة" : "Upcoming", stats.upcoming, colors.primary, "schedule")}{statCard(language === "ar" ? "مكتملة" : "Completed", stats.completed, colors.success, "done-all")}</View>

    <View style={[styles.tabRow, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}>
      <Pressable accessibilityRole="button" onPress={() => switchTab("assets")} style={[styles.tab, { backgroundColor: tab === "assets" ? colors.primary : "transparent" }]}><MaterialIcons name="inventory" size={15} color={tab === "assets" ? "#FFFFFF" : colors.muted} /><Text numberOfLines={1} style={{ color: tab === "assets" ? "#FFFFFF" : colors.muted, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? `الأصول (${(assets ?? []).length})` : `Assets (${(assets ?? []).length})`}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => switchTab("active")} style={[styles.tab, { backgroundColor: tab === "active" ? colors.primary : "transparent" }]}><MaterialIcons name="list-alt" size={15} color={tab === "active" ? "#FFFFFF" : colors.muted} /><Text numberOfLines={1} style={{ color: tab === "active" ? "#FFFFFF" : colors.muted, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? `المهام النشطة (${activeTasks.length})` : `Active (${activeTasks.length})`}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => switchTab("archive")} style={[styles.tab, { backgroundColor: tab === "archive" ? colors.primary : "transparent" }]}><MaterialIcons name="archive" size={15} color={tab === "archive" ? "#FFFFFF" : colors.muted} /><Text numberOfLines={1} style={{ color: tab === "archive" ? "#FFFFFF" : colors.muted, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? `المهام المكتملة (${stats.completed})` : `Completed (${stats.completed})`}</Text></Pressable>
    </View>

    <View style={styles.rollerWrap}>
      <View style={[styles.rollerToolbar, { flexDirection: row }]}>
        <View style={styles.rollerChips}>{ROLLER_RANGE_OPTIONS.map((option) => { const active = horizon === option.id; return <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={option.label[language === "ar" ? 0 : 1]} onPress={() => selectHorizon(option.id)} style={[styles.rollerRangeChip, { backgroundColor: active ? colors.primary + "1F" : colors.surface, borderColor: active ? colors.primary : colors.border }]}><Text style={{ color: active ? colors.primary : colors.muted, fontSize: 12, fontWeight: active ? "900" : "700" }}>{option.label[language === "ar" ? 0 : 1]}</Text></Pressable>; })}</View>
        <View style={styles.rollerRangeAnchor}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "فترة مخصصة" : "Custom range"} onPress={openRangePanel} style={[styles.rollerRangeChip, { backgroundColor: rollerRange.kind === "custom" ? colors.primary + "1F" : colors.surface, borderColor: rollerRange.kind === "custom" ? colors.primary : colors.border }]}><MaterialIcons name="date-range" size={14} color={rollerRange.kind === "custom" ? colors.primary : colors.muted} /><Text style={{ color: rollerRange.kind === "custom" ? colors.primary : colors.muted, fontSize: 12, fontWeight: rollerRange.kind === "custom" ? "900" : "700" }}>{language === "ar" ? "من - إلى" : "From - To"}</Text></Pressable></View>
      </View>
      <View style={[styles.rollerScroller, { flexDirection: row }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تمرير للأمام" : "Scroll forward"} onPress={() => nudgeRoller(1)} style={({ pressed }) => [styles.rollerArrow, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.primary} /></Pressable>
        <ScrollView ref={rollerRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rollerStrip} onScroll={(event) => { rollerOffsetRef.current = event.nativeEvent.contentOffset.x; }} scrollEventThrottle={32}>
          {timelineDates.map((date) => {
            const singleSelected = dateFilter === date;
            const isToday = date === todayISO;
            const inWindow = dateFilter === null && ((horizon === "today" && isToday) || (horizon === "7" && date >= todayISO && date <= addDays(todayISO, 6)) || (horizon === "30" && date >= todayISO && date <= addDays(todayISO, 29)));
            const framed = isToday || singleSelected;
            const hasTaskOnDate = activeTasks.some((task) => task.nextDueDate === date);
            const weekday = ROLLER_WEEKDAYS[language === "ar" ? "ar" : "en"][new Date(`${date}T12:00:00Z`).getUTCDay()];
            const topLabel = isToday ? (language === "ar" ? "اليوم" : "Today") : weekday;
            const strong = framed || inWindow;
            const topColor = strong ? colors.primary : "#94A3B8";
            const dayColor = strong ? colors.primary : "#94A3B8";
            return <Pressable key={date} accessibilityRole="button" accessibilityLabel={language === "ar" ? `تاريخ ${date}` : `Date ${date}`} onPress={() => setDateFilter(framed && singleSelected ? null : date)} style={[styles.rollerChip, { borderWidth: 1 }, framed ? { backgroundColor: colors.primary + "1A", borderColor: colors.primary + "CC" } : { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, framed && { shadowColor: colors.primary, shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }]}>
              <Text numberOfLines={1} style={{ color: topColor, fontSize: 10, fontWeight: strong ? "900" : "500", textAlign: "center" }}>{topLabel}</Text>
              <Text style={{ color: dayColor, fontSize: 14, fontWeight: strong ? "800" : "600", textAlign: "center" }}>{date.slice(8, 10)}</Text>
              <View style={[styles.rollerDot, { backgroundColor: hasTaskOnDate ? "#F59E0B" : "transparent" }]} />
              {isToday ? <View pointerEvents="none" style={[styles.rollerTodayUnderline, { backgroundColor: colors.primary }]} /> : null}
            </Pressable>;
          })}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تمرير للخلف" : "Scroll backward"} onPress={() => nudgeRoller(-1)} style={({ pressed }) => [styles.rollerArrow, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={18} color={colors.primary} /></Pressable>
      </View>
    </View>

    {tab === "assets" ? <View style={[styles.assetHelper, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row, alignItems: "flex-start", gap: 7, marginTop: 10 }]}>
      <MaterialIcons name="inventory-2" size={14} color="#94A3B8" style={{ marginTop: 2 }} />
      <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", lineHeight: 16, flex: 1, textAlign: align }}>{language === "ar" ? "سجل عتاد الشاليهات (مكيفات، مضخات، بويلرات، شاشات) لحصر الأجهزة ومواقعها ومتابعة تكاليف صيانتها دورياً." : "Track chalet assets (ACs, pumps, boilers, screens) — catalogue equipment, locations and recurring maintenance costs."}</Text>
    </View> : null}

    <View style={[styles.filterRow, { flexDirection: row, alignItems: "flex-start", gap: 8, zIndex: unitMenuOpen || cadenceMenuOpen ? 2 : 0 }]}>
      <View style={[styles.searchWrap, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}>
        <MaterialIcons name="search" size={16} color={colors.muted} />
        <TextInput accessibilityLabel={language === "ar" ? "بحث سريع" : "Quick search"} value={searchQuery} onChangeText={setSearchQuery} placeholder={language === "ar" ? "بحث سريع باسم المهمة أو الأصل..." : "Quick search by task or asset name..."} placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.foreground, textAlign: align }]} />
        {searchQuery ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "مسح البحث" : "Clear search"} onPress={() => setSearchQuery("")} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}><MaterialIcons name="close" size={16} color={colors.muted} /></Pressable> : null}
      </View>
      <View style={styles.toolbarMenuAnchor}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "قائمة الوحدات" : "Unit list"} onPress={() => { setUnitMenuOpen(!unitMenuOpen); setCadenceMenuOpen(false); setMenuFor(null); }} style={[styles.toolbarSelect, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="holiday-village" size={15} color={colors.primary} /><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 11, fontWeight: "800", flex: 1, textAlign: align }}>{unitFilter ? (chalets.find((chalet) => chalet.id === unitFilter)?.name ?? "—") : (language === "ar" ? "كافة الوحدات" : "All units")}</Text><MaterialIcons name={unitMenuOpen ? "expand-less" : "expand-more"} size={16} color={colors.muted} /></Pressable>
        {unitMenuOpen ? <View style={[styles.toolbarMenu, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, left: isRTL ? 0 : undefined, right: isRTL ? undefined : 0 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "كافة الوحدات" : "All units"} onPress={() => { setUnitFilter(null); setUnitMenuOpen(false); }} style={[styles.toolbarRow, { backgroundColor: unitFilter === null ? colors.primary + "14" : "transparent", flexDirection: row }]}><MaterialIcons name="holiday-village" size={15} color={unitFilter === null ? colors.primary : colors.muted} /><Text style={{ flex: 1, color: unitFilter === null ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{language === "ar" ? "كافة الوحدات" : "All units"}</Text></Pressable>
          {chalets.map((chalet) => { const selected = unitFilter === chalet.id; return <Pressable key={chalet.id} accessibilityRole="button" accessibilityLabel={chalet.name} onPress={() => { setUnitFilter(selected ? null : chalet.id); setUnitMenuOpen(false); }} style={[styles.toolbarRow, { backgroundColor: selected ? colors.primary + "14" : "transparent", flexDirection: row }]}><View style={[styles.filterDot, { backgroundColor: chalet.color }]} /><Text style={{ flex: 1, color: selected ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{chalet.name}</Text></Pressable>; })}
        </View> : null}
      </View>
      <View style={styles.toolbarMenuAnchor}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "قائمة دورية الصيانة" : "Recurrence list"} onPress={() => { setCadenceMenuOpen(!cadenceMenuOpen); setUnitMenuOpen(false); setMenuFor(null); }} style={[styles.toolbarSelect, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="schedule" size={15} color={colors.primary} /><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 11, fontWeight: "800", flex: 1, textAlign: align }}>{CADENCE_FILTERS.find((cadence) => cadence.id === cadenceFilter)?.label[language === "ar" ? 0 : 1] ?? (language === "ar" ? "كافة الفترات" : "All periods")}</Text><MaterialIcons name={cadenceMenuOpen ? "expand-less" : "expand-more"} size={16} color={colors.muted} /></Pressable>
        {cadenceMenuOpen ? <View style={[styles.toolbarMenu, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, left: isRTL ? 0 : undefined, right: isRTL ? undefined : 0 }]}>
          {CADENCE_FILTERS.map((cadence) => { const selected = cadenceFilter === cadence.id; return <Pressable key={cadence.id} accessibilityRole="button" accessibilityLabel={cadence.label[language === "ar" ? 0 : 1]} onPress={() => { setCadenceFilter(selected ? "all" : cadence.id); setCadenceMenuOpen(false); }} style={[styles.toolbarRow, { backgroundColor: selected ? colors.primary + "14" : "transparent", flexDirection: row }]}><MaterialIcons name={cadence.icon} size={15} color={selected ? colors.primary : colors.muted} /><Text style={{ flex: 1, color: selected ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{cadence.label[language === "ar" ? 0 : 1]}</Text></Pressable>; })}
        </View> : null}
      </View>
    </View>

    {unitMenuOpen || cadenceMenuOpen || menuFor ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={() => { setUnitMenuOpen(false); setCadenceMenuOpen(false); setMenuFor(null); }} style={[StyleSheet.absoluteFill, styles.clickAway]} /> : null}

    {tab === "active" ? <>
      {visibleTasks.length ? visibleTasks.map((task) => {
        const tone = cardTone(task);
        const pill = statusPillInfo(task.status);
        const editing = busy?.kind === "complete" && busy.id === task.id;
        const isClosed = task.status === "completed" || task.status === "cancelled";
        const menuOpen = menuFor === task.id;
        const posted = task.status === "completed" && Boolean(task.expenseId);
        const allUnits = task.targetScope === "all_units";
        const unitLabel = allUnits ? (language === "ar" ? "كافة الوحدات" : "All units") : task.chaletName ?? "—";
        const dueColor = isMaintenanceOverdue(task, now) ? colors.error : isMaintenanceDueToday(task, now) ? colors.warning : colors.primary;
        const attribution = maintenanceAttribution(task, language);
        return <View key={task.id} style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: tone.color + "55", zIndex: menuOpen ? 2 : 0 }]}>
          {menuOpen ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق القائمة" : "Close menu"} onPress={() => setMenuFor(null)} style={StyleSheet.absoluteFill} /> : null}
          <View style={[styles.cardRow, { alignItems: "flex-start" }]}>
            <View style={[styles.taskIcon, { backgroundColor: tone.color + "18" }]}><MaterialIcons name={tone.icon} size={20} color={tone.color} /></View>
            <View style={styles.flex}>
              <View style={[styles.cardTitleRow, { flexDirection: row }]}><Text numberOfLines={1} style={[styles.cardTitle, { color: colors.foreground, textAlign: align, flex: 1 }]}>{task.title}</Text>{allUnits ? <View style={[styles.badgePill, { backgroundColor: colors.primary + "18" }]}><Text style={{ color: colors.primary, fontSize: 9, fontWeight: "900" }}>{language === "ar" ? "تشمل كافة الوحدات" : "All units"}</Text></View> : null}{posted ? <View style={[styles.badgePill, { backgroundColor: colors.success + "18" }]}><Text style={{ color: colors.success, fontSize: 9, fontWeight: "900" }}>{language === "ar" ? "#مصروف" : "#Expense"}</Text></View> : null}</View>
              <View style={[styles.badgeRow, { flexDirection: row }]}>
                <View style={[styles.badgePill, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name="holiday-village" size={11} color={colors.muted} /><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 9, fontWeight: "800" }}>{unitLabel}</Text></View>
                <View style={[styles.badgePill, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name="refresh" size={11} color={colors.muted} /><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 9, fontWeight: "800" }}>{maintenanceFrequencyLabel(task.frequency, language)}</Text></View>
                <View style={[styles.badgePill, { backgroundColor: dueColor + "18", borderColor: dueColor + "44" }]}><MaterialIcons name="event" size={11} color={dueColor} /><Text numberOfLines={1} style={{ color: dueColor, fontSize: 9, fontWeight: "800" }}>{language === "ar" ? "استحقاق:" : "Due:"} {formatDate(task.nextDueDate) ?? task.nextDueDate}</Text></View>
                {posted ? <View style={[styles.badgePill, { backgroundColor: colors.success + "18", borderColor: colors.success + "44" }]}><MaterialIcons name="receipt-long" size={11} color={colors.success} /><Text numberOfLines={1} style={{ color: colors.success, fontSize: 9, fontWeight: "800" }}>{language === "ar" ? "مُرحَّل للمصروفات" : "Expense posted"}</Text></View> : null}
              </View>
              {task.actualCost !== undefined || task.cost ? <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "التكلفة" : "Cost"}: {task.actualCost ?? task.cost} {language === "ar" ? "د.أ" : "JOD"}{task.assetName ? ` · ${task.assetName}` : ""}</Text> : null}
              {task.status === "completed" && task.performedByName ? <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "تم التنفيذ بواسطة" : "Performed by"}: {task.performedByName}{task.performedByRole ? ` (${maintenancePerformerRoleLabel(task.performedByRole, language)})` : ""}</Text> : null}
              {attribution ? <View style={[styles.attributionRow, { backgroundColor: attribution.amber ? "#F59E0B14" : colors.surfaceMuted, borderColor: attribution.amber ? "#F59E0B55" : colors.border, flexDirection: row }]}><MaterialIcons name={attribution.amber ? "payments" : "account-balance-wallet"} size={12} color={attribution.amber ? "#F59E0B" : colors.muted} /><Text numberOfLines={2} style={[styles.attributionText, { color: attribution.amber ? "#F59E0B" : colors.muted, textAlign: align }]}>{attribution.label}</Text></View> : null}
            </View>
            <View style={[styles.cardSide, { alignItems: isRTL ? "flex-start" : "flex-end", gap: 7 }]}>
              <View style={[styles.cardSideTop, { flexDirection: row }]}>
                <View style={[styles.statusPill, { backgroundColor: pill.color + "18" }]}><Text style={{ color: pill.color, fontSize: 9, fontWeight: "900" }}>{pill.label}</Text></View>
              </View>
              {!isClosed && canOperate ? (task.status === "scheduled" ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "بدء العمل" : "Start work"} disabled={Boolean(busy)} onPress={() => void startTask(task)} style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={busy?.kind === "start" && busy.id === task.id ? "hourglass-top" : "play-arrow"} size={16} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "900" }}>{busy?.kind === "start" && busy.id === task.id ? (language === "ar" ? "جارٍ..." : "Starting...") : (language === "ar" ? "بدء العمل" : "Start work")}</Text></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إتمام وإغلاق" : "Complete & close"} disabled={Boolean(busy)} onPress={() => openCompletionModal(task)} style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.success, borderColor: colors.success, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={editing ? "hourglass-top" : "check"} size={16} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "900" }}>{editing ? (language === "ar" ? "جارٍ الترحيل..." : "Posting...") : (language === "ar" ? "إتمام وإغلاق" : "Complete & close")}</Text></Pressable>) : null}
            </View>
            <View style={[styles.menuAnchor, { alignSelf: "center" }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "خيارات المهمة" : "Task options"} onPress={() => { setMenuFor(menuOpen ? null : task.id); setUnitMenuOpen(false); setCadenceMenuOpen(false); }} style={({ pressed }) => [styles.moreBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name={menuOpen ? "close" : "more-vert"} size={18} color={colors.muted} /></Pressable>
              {menuOpen ? <View style={[styles.floatMenu, { left: isRTL ? 0 : undefined, right: isRTL ? undefined : 0 }]}>
                {task.status === "scheduled" && canManage ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تعديل المهمة" : "Edit task"} onPress={() => { setMenuFor(null); openEditTaskSheet(task); }} style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="edit" size={16} color={colors.primary} /><Text style={{ color: "#E2E8F0", fontSize: 12, fontWeight: "800", flex: 1, textAlign: align }}>{language === "ar" ? "تعديل المهمة" : "Edit task"}</Text></Pressable> : null}
                {!isClosed && canOperate ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إلغاء المهمة" : "Cancel task"} onPress={() => { setMenuFor(null); void openCancelFlow(task); }} style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="cancel" size={16} color={colors.error} /><Text style={{ color: colors.error, fontSize: 12, fontWeight: "800", flex: 1, textAlign: align }}>{language === "ar" ? "إلغاء المهمة" : "Cancel task"}</Text></Pressable> : null}
                {isClosed && canManage ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حذف المهمة" : "Delete task"} onPress={() => { setMenuFor(null); void removeTask(task); }} style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="delete-outline" size={16} color={colors.error} /><Text style={{ color: colors.error, fontSize: 12, fontWeight: "800", flex: 1, textAlign: align }}>{language === "ar" ? "حذف المهمة" : "Delete task"}</Text></Pressable> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "عرض سجل التدقيق" : "View audit trail"} onPress={() => { setMenuFor(null); setAuditFor(task.id); }} style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="history" size={16} color="#94A3B8" /><Text style={{ color: "#CBD5E1", fontSize: 12, fontWeight: "800", flex: 1, textAlign: align }}>{language === "ar" ? "عرض سجل التدقيق" : "View audit trail"}</Text></Pressable>
              </View> : null}
            </View>
          </View>
        </View>;
      }) : <View style={styles.empty}><MaterialIcons name="handyman" size={38} color={colors.muted + "88"} /><Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800", marginTop: 12, textAlign: "center" }}>{language === "ar" ? (searchActive ? "لا توجد نتائج مطابقة للبحث" : unitFilter !== null ? "لا توجد مهام صيانة لهذه الوحدة" : cadenceFilter !== "all" ? "لا توجد مهام صيانة مطابقة للتكرار المحدد" : "لا توجد مهام صيانة مجدولة لهذه المنشأة") : (searchActive ? "No results match your search" : unitFilter !== null ? "No maintenance tasks for this unit" : cadenceFilter !== "all" ? "No maintenance tasks match the selected recurrence" : "No scheduled maintenance tasks for this property")}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "center" }}>{language === "ar" ? (searchActive ? "حاول تغيير كلمات البحث أو امسح الحقل لعرض كل المهام." : unitFilter !== null ? "اختر وحدة أخرى من شريط الفلترة." : cadenceFilter !== "all" ? "اختر كافة الفترات لرؤية كل المهام." : chalets.length ? "أنشئ مهمة دورية، وستظهر هنا عند استحقاقها مع تنبيه تلقائي." : "يجب إضافة وحدة أولاً للمنشأة قبل تسجيل صيانة.") : (searchActive ? "Try different search terms or clear the field to show every task." : unitFilter !== null ? "Pick another unit from the filter bar." : cadenceFilter !== "all" ? "Select all periods to see every task." : chalets.length ? "Create a recurring task; it will appear here when due with an automatic alert." : "Add a unit to this property first to register maintenance.")}</Text>{canManage ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إضافة مهمة صيانة" : "Add maintenance task"} onPress={openCreateTask} style={({ pressed }) => [styles.emptyCta, { borderColor: colors.primary + "55", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="add" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 13 }}>{language === "ar" ? "إضافة مهمة صيانة" : "Add maintenance task"}</Text></Pressable> : null}</View>}
    </> : tab === "archive" ? <>
      {visibleTasks.length ? visibleTasks.map((task) => {
        const settled = task.status === "completed";
        const posted = settled && Boolean(task.expenseId);
        const allUnits = task.targetScope === "all_units";
        const unitLabel = allUnits ? (language === "ar" ? "كافة الوحدات" : "All units") : task.chaletName ?? "—";
        const settledDate = task.completedAt?.slice(0, 10) ?? task.lastCompletedDate ?? "";
        const attribution = maintenanceAttribution(task, language);
        return <View key={task.id} style={[styles.archiveCard, { backgroundColor: colors.surfaceMuted, borderColor: settled ? colors.success + "33" : colors.muted + "33" }]}>
          <View style={[styles.cardRow, { alignItems: "flex-start" }]}>
            <View style={[styles.archiveIcon, { backgroundColor: (settled ? colors.success : colors.muted) + "1A" }]}><MaterialIcons name={settled ? "done-all" : "cancel"} size={18} color={settled ? colors.success : colors.muted} /></View>
            <View style={styles.flex}>
              <View style={[styles.cardTitleRow, { flexDirection: row }]}><Text numberOfLines={1} style={[styles.cardTitle, { color: colors.foreground, textAlign: align, flex: 1 }]}>{task.title}</Text>{!settled ? <View style={[styles.badgePill, { backgroundColor: colors.muted + "18" }]}><Text style={{ color: colors.muted, fontSize: 9, fontWeight: "900" }}>{language === "ar" ? "ملغاة" : "Cancelled"}</Text></View> : posted ? <View style={[styles.badgePill, { backgroundColor: colors.success + "18" }]}><Text style={{ color: colors.success, fontSize: 9, fontWeight: "900" }}>{language === "ar" ? "سند صرف مرتبط" : "Receipt linked"}</Text></View> : null}</View>
              <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted, textAlign: align }]}>{unitLabel} · {maintenanceFrequencyLabel(task.frequency, language)}{task.assetName ? ` · ${task.assetName}` : ""}</Text>
              {settled && task.performedByName ? <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "تم التنفيذ بواسطة" : "Performed by"}: {task.performedByName}{task.performedByRole ? ` (${maintenancePerformerRoleLabel(task.performedByRole, language)})` : ""}</Text> : null}
              {settled && task.actualCost !== undefined ? <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "التكلفة" : "Cost"}: {task.actualCost} {language === "ar" ? "د.أ" : "JOD"}{posted ? ` · ${language === "ar" ? "سند صرف مرتبط" : "linked receipt"}` : ""}</Text> : null}
              {settled && attribution ? <View style={[styles.attributionRow, { backgroundColor: attribution.amber ? "#F59E0B14" : colors.surfaceMuted, borderColor: attribution.amber ? "#F59E0B55" : colors.border, flexDirection: row }]}><MaterialIcons name={attribution.amber ? "payments" : "account-balance-wallet"} size={12} color={attribution.amber ? "#F59E0B" : colors.muted} /><Text numberOfLines={2} style={[styles.attributionText, { color: attribution.amber ? "#F59E0B" : colors.muted, textAlign: align }]}>{attribution.label}</Text></View> : null}
              {settledDate ? <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted, textAlign: align }]}>{language === "ar" ? (settled ? "تاريخ الإنجاز" : "تاريخ الإغلاق") : (settled ? "Settled on" : "Closed on")}: {formatDate(settledDate) ?? settledDate}</Text> : null}
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "سجل الإجراءات" : "Action log"} onPress={() => setAuditFor(task.id)} style={({ pressed }) => [styles.archiveLogBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="history" size={15} color={colors.muted} /><Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "800" }}>{language === "ar" ? "سجل الإجراءات" : "Action log"}</Text></Pressable>
        </View>;
      }) : <View style={styles.empty}><MaterialIcons name="archive" size={38} color={colors.muted + "88"} /><Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800", marginTop: 12, textAlign: "center" }}>{language === "ar" ? (searchActive ? "لا توجد نتائج مطابقة في الأرشيف للبحث" : unitFilter !== null || cadenceFilter !== "all" ? "لا توجد مهام مكتملة مطابقة للفلاتر" : "لا توجد مهام مكتملة في الأرشيف بعد") : (searchActive ? "No archived results match your search" : unitFilter !== null || cadenceFilter !== "all" ? "No completed tasks match the filters" : "No completed tasks in the archive yet")}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "center" }}>{language === "ar" ? "عند إتمام مهمة من المهام النشطة، تُحفظ هنا مع سجل إجراءاتها وسند المصروف." : "Completing a task from the active list archives it here with its action log and receipt."}</Text></View>}
    </> : <>
      {visibleAssets.length ? visibleAssets.map((asset) => {
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
      }) : <View style={styles.empty}><MaterialIcons name="inventory" size={38} color={colors.muted + "88"} /><Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800", marginTop: 12, textAlign: "center" }}>{language === "ar" ? "لا توجد أصول مسجلة لهذه المنشأة حالياً" : "No assets registered for this property yet"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "center" }}>{language === "ar" ? (chalets.length ? "رصد الأصول يتيح متابعة حالتها وإنشاء مهام صيانة مرتبطة بها." : "يجب إضافة وحدة أولاً للمنشأة قبل تسجيل أصول.") : (chalets.length ? "Tracking assets lets you follow their condition and create linked maintenance tasks." : "Add a unit to this property first to register assets.")}</Text>{canManage ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إضافة أصل" : "Add asset"} onPress={openCreateAsset} style={({ pressed }) => [styles.emptyCta, { borderColor: colors.primary + "55", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="add" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 13 }}>{language === "ar" ? "إضافة أصل" : "Add asset"}</Text></Pressable> : null}</View>}
    </>}

    {!canManage ? <View style={[styles.lockCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name="lock-outline" size={16} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 11, marginLeft: 6, textAlign: align }}>{language === "ar" ? "عرض الجدولة متاح للجميع؛ إضافة وتحرير وحذف المهام للمالك والموظفين، بينما بدء التنفيذ والإلغاء والإتمام والترحيل متاح للمالك والموظفين والحراس." : "Schedule viewing is open to everyone; adding, editing, and deleting tasks are for owners/staff, while starting, cancelling, and completing with expense posting are open to owners, staff, and guards."}</Text></View> : null}
  </ScrollView>

  {canManage ? <View style={[styles.dock, { backgroundColor: colors.background }]}><Pressable accessibilityRole="button" accessibilityLabel={tab === "assets" ? (language === "ar" ? "إضافة أصل" : "Add asset") : (language === "ar" ? "إضافة مهمة صيانة" : "Add maintenance task")} onPress={tab === "assets" ? openCreateAsset : openCreateTask} style={({ pressed }) => [styles.dockButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}><MaterialIcons name={tab === "assets" ? "inventory" : "build"} size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>{tab === "assets" ? (language === "ar" ? "إضافة أصل" : "Add asset") : (language === "ar" ? "إضافة مهمة صيانة" : "Add maintenance task")}</Text></Pressable></View> : null}

  <Modal visible={Boolean(taskSheet)} transparent animationType="slide" onRequestClose={closeTaskSheet} statusBarTranslucent>
    {taskSheet ? <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} disabled={saving} onPress={closeTaskSheet} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.sheetHeader, { flexDirection: row }]}><View style={[styles.sheetIcon, { backgroundColor: colors.primary + "1A" }]}><MaterialIcons name="build" size={20} color={colors.primary} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{taskSheet.mode === "create" ? (language === "ar" ? "مهمة صيانة جديدة" : "New maintenance task") : (language === "ar" ? "تعديل المهمة" : "Edit task")}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={closeTaskSheet} disabled={saving} style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align }}>{language === "ar" ? "قوالب سريعة" : "Quick presets"}</Text>
          <View style={[styles.chipWrap, { flexDirection: row }]}>{MAINTENANCE_PRESETS.map((preset) => <Pressable key={preset.title} accessibilityRole="button" accessibilityLabel={`${language === "ar" ? "تعبئة من القالب" : "Apply preset"}: ${preset.title}`} onPress={() => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, title: preset.title, frequency: preset.frequency, customIntervalDays: undefined } })} style={[styles.presetChip, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name={preset.icon} size={15} color={colors.primary} /><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 11, fontWeight: "800", flexShrink: 1 }}>{preset.title}</Text></Pressable>)}</View>
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "العنوان" : "Title"}</Text>
          <TextInput accessibilityLabel={language === "ar" ? "العنوان" : "Title"} value={taskSheet.draft.title} onChangeText={(value) => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, title: value } })} placeholder={language === "ar" ? "مثال: معالجة تفتفة المكيف الرئيسي" : "e.g. Service the main AC unit"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "الوحدات المستهدفة" : "Target units"}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تحديد كافة الوحدات" : "Select all units"} onPress={toggleAllTaskUnits} style={[styles.checkRow, { backgroundColor: taskSheet.draft.allUnits ? colors.primary + "14" : colors.surfaceMuted, borderColor: taskSheet.draft.allUnits ? colors.primary : colors.border }]}><MaterialIcons name={taskSheet.draft.allUnits ? "check-box" : "check-box-outline-blank"} size={18} color={taskSheet.draft.allUnits ? colors.primary : colors.muted} /><Text style={{ flex: 1, color: taskSheet.draft.allUnits ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{language === "ar" ? "تحديد كافة الوحدات" : "Select all units"}</Text><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}>{chalets.length}</Text></Pressable>
          {chalets.map((chalet) => { const selected = taskSheet.draft.unitIds.includes(chalet.id); return <Pressable key={chalet.id} accessibilityRole="checkbox" accessibilityLabel={chalet.name} onPress={() => toggleTaskUnit(chalet.id)} style={[styles.checkRow, { backgroundColor: selected ? colors.primary + "14" : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border }]}><MaterialIcons name={selected ? "check-box" : "check-box-outline-blank"} size={18} color={selected ? colors.primary : colors.muted} /><Text style={{ flex: 1, color: selected ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{chalet.name}</Text><View style={[styles.filterDot, { backgroundColor: chalet.color }]} /></Pressable>; })}
          {!chalets.length ? <View style={[styles.unitWarning, { backgroundColor: colors.warning + "14", borderColor: colors.warning + "55" }]}><MaterialIcons name="error-outline" size={17} color={colors.warning} /><Text style={{ color: colors.warning, fontSize: 12, fontWeight: "800", marginLeft: 7, flex: 1, textAlign: align }}>{language === "ar" ? "يجب إضافة وحدة أولاً للمنشأة قبل تسجيل صيانة أو أصول" : "You must add a unit to this property before registering maintenance or assets."}</Text></View> : null}
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "الدورية" : "Frequency"}</Text>
          <View style={[styles.chipWrap, { flexDirection: row }]}>{MAINTENANCE_FREQUENCIES.map((freq) => { const selected = taskSheet.draft.frequency === freq.id; return <Pressable key={freq.id} accessibilityRole="button" accessibilityLabel={freq.label[language === "ar" ? 0 : 1]} onPress={() => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, frequency: freq.id } })} style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border }]}><Text style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 11, fontWeight: "900" }}>{freq.label[language === "ar" ? 0 : 1]}</Text></Pressable>; })}</View>
          <View style={[styles.scheduleHint, { backgroundColor: (taskSheet.draft.frequency === "once" ? colors.primary : colors.warning) + "12", borderColor: (taskSheet.draft.frequency === "once" ? colors.primary : colors.warning) + "55" }]}><MaterialIcons name="info-outline" size={16} color={taskSheet.draft.frequency === "once" ? colors.primary : colors.warning} /><Text style={{ color: taskSheet.draft.frequency === "once" ? colors.primary : colors.warning, fontSize: 11, fontWeight: "700", flex: 1, textAlign: align }}>{frequencyHint(taskSheet.draft.frequency)}</Text></View>
          {taskSheet.draft.frequency === "custom" ? <><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "عدد الأيام بين كل صيانة" : "Days between each visit"}</Text><TextInput accessibilityLabel={language === "ar" ? "عدد الأيام" : "Days"} value={taskSheet.draft.customIntervalDays} onChangeText={(value) => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, customIntervalDays: value } })} keyboardType="number-pad" placeholder="30" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /></> : null}
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "الاستحقاق القادم" : "Next due date"}</Text>
          <CalendarDateField label={language === "ar" ? "الاستحقاق القادم" : "Next due date"} value={taskSheet.draft.nextDueDate} onChange={(value) => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, nextDueDate: value } })} />
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "التكلفة المتوقعة (اختياري)" : "Estimated cost (optional)"}</Text>
          <TextInput accessibilityLabel={language === "ar" ? "التكلفة" : "Cost"} value={taskSheet.draft.cost} onChangeText={(value) => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, cost: value } })} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "ملاحظة (اختياري)" : "Note (optional)"}</Text>
          <TextInput accessibilityLabel={language === "ar" ? "ملاحظة" : "Note"} value={taskSheet.draft.note} onChangeText={(value) => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, note: value } })} multiline placeholder={language === "ar" ? "تفاصيل إضافية" : "Extra details"} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 14 }}>{language === "ar" ? "إيقاف حجز الوحدة أثناء الصيانة" : "Block unit during maintenance"}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إيقاف حجز الوحدة أثناء الصيانة" : "Block unit during maintenance"} disabled={taskSheet.draft.allUnits} onPress={() => { if (taskSheet.draft.allUnits) return; setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, blockBooking: taskSheet.draft.blockBooking !== true, blockPeriod: taskSheet.draft.blockBooking !== true ? "full_day" : undefined } }); }} style={({ pressed }) => [styles.chip, { flexDirection: row, borderColor: taskSheet.draft.allUnits ? colors.border : taskSheet.draft.blockBooking === true ? colors.primary : colors.border, backgroundColor: taskSheet.draft.allUnits ? colors.surfaceMuted : taskSheet.draft.blockBooking === true ? colors.primary + "18" : colors.surfaceMuted, opacity: taskSheet.draft.allUnits ? 0.45 : pressed ? 0.8 : 1, marginTop: 7 }]}>
            <MaterialIcons name={taskSheet.draft.allUnits ? "toggle-off" : (taskSheet.draft.blockBooking === true ? "toggle-on" : "toggle-off")} size={18} color={taskSheet.draft.allUnits ? colors.muted : taskSheet.draft.blockBooking === true ? colors.primary : colors.muted} />
            <Text style={{ color: taskSheet.draft.allUnits ? colors.muted : taskSheet.draft.blockBooking === true ? colors.primary : colors.muted, fontSize: 12, fontWeight: "800" }}>{language === "ar" ? (taskSheet.draft.allUnits ? "غير متاح لمهمة كافة الوحدات" : taskSheet.draft.blockBooking === true ? "مفعّل" : "غير مفعّل") : (taskSheet.draft.allUnits ? "Not available for all-units tasks" : taskSheet.draft.blockBooking === true ? "ON" : "OFF")}</Text>
          </Pressable>
          {taskSheet.draft.blockBooking === true && !taskSheet.draft.allUnits ? <><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "مدى المنع" : "Blocking scope"}</Text>
          <View style={[styles.chipWrap, { flexDirection: row }]}>{BLOCK_PERIOD_OPTIONS.map((option) => { const selected = (taskSheet.draft.blockPeriod ?? "full_day") === option.id; return <Pressable key={option.id} onPress={() => setTaskSheet({ ...taskSheet, draft: { ...taskSheet.draft, blockPeriod: option.id } })} style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border }]}><Text style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 11, fontWeight: "900" }}>{option.label[language === "ar" ? 0 : 1]}</Text></Pressable>; })}</View></> : null}
          {taskError ? <View style={[styles.taskErrorBox, { backgroundColor: colors.error + "14", borderColor: colors.error + "55" }]}><MaterialIcons name="error-outline" size={17} color={colors.error} /><Text style={{ color: colors.error, fontSize: 12, fontWeight: "800", marginLeft: 7, flex: 1, textAlign: align }}>{taskError}</Text></View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حفظ المهمة" : "Save task"} disabled={saving} onPress={() => void saveTaskDraft()} style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}><MaterialIcons name="save" size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>{saving ? (language === "ar" ? "جارٍ الحفظ..." : "Saving...") : (language === "ar" ? "حفظ المهمة" : "Save task")}</Text></Pressable>
        </ScrollView>
      </View>
    </View> : null}
  </Modal>

  <Modal visible={Boolean(completion)} transparent animationType="slide" onRequestClose={() => !busy && setCompletion(null)} statusBarTranslucent>
    {completion ? <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} disabled={Boolean(busy)} onPress={() => !busy && setCompletion(null)} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.sheetHeader, { flexDirection: row }]}><View style={[styles.sheetIcon, { backgroundColor: colors.success + "1A" }]}><MaterialIcons name="assignment-turned-in" size={20} color={colors.success} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{language === "ar" ? "إتمام وإغلاق مهمة الصيانة" : "Complete & close maintenance task"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={() => !busy && setCompletion(null)} disabled={Boolean(busy)} style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View>
        <ScrollView ref={completionScrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
          <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{completion.task.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 11, textAlign: align, marginTop: 2 }}>{completion.task.targetScope === "all_units" ? (language === "ar" ? "كافة الوحدات" : "All units") : completion.task.chaletName ?? "—"} · {maintenanceFrequencyLabel(completion.task.frequency, language)} · {language === "ar" ? "التكلفة المتوقعة" : "Expected cost"}: {formatMoney(completion.task.cost ?? 0, settings.currency)}</Text>
          <View onLayout={registerCompletionField("performer")} style={[styles.completionField, { borderColor: performerError ? "#F43F5E" : colors.border, backgroundColor: performerError ? "#F43F5E0D" : colors.surface }, performerError ? styles.invalidInputGlow : null]}>
            <Text style={[styles.completionFieldLabel, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "منفّذ المهمة" : "Performed by"}</Text>
            <CascadingSelectField value={performerOptions.find((option) => option.id === completion.performerId)?.name ?? null} placeholder={language === "ar" ? "اختر منفّذ المهمة..." : "Select task performer..."} error={performerError} icon="badge" onPress={() => toggleCompletionDropdown("performer")} colors={colors} language={language} />
            {performerOptions.length === 0 ? <Text style={styles.fieldError}>{language === "ar" ? "لا يوجد منفّذون متاحون" : "No performers available"}</Text> : null}
            {performerError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى تحديد منفّذ المهمة" : "Please select the task performer"}</Text> : null}
          </View>
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 14 }}>{language === "ar" ? "التكلفة الفعلية" : "Actual cost"}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 5 }}>
            <TextInput accessibilityLabel={language === "ar" ? "التكلفة الفعلية" : "Actual cost"} value={completion.actualCost} onChangeText={(value) => setCompletion({ ...completion, actualCost: value, postExpense: value.trim() !== "" && Number(value) > 0 })} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1, backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: "right", writingDirection: "rtl" }]} />
            <View style={{ height: 42, minWidth: 38, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>{language === "ar" ? "د.أ" : "JOD"}</Text></View>
          </View>
          {hasPositiveActualCost(completion) ? <>
            <View onLayout={registerCompletionField("funding")} style={[styles.completionField, { borderColor: fundingError ? "#F43F5E" : colors.border, backgroundColor: fundingError ? "#F43F5E0D" : colors.surface }, fundingError ? styles.invalidInputGlow : null]}>
              <Text style={[styles.completionFieldLabel, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "مصدر الدفع والتمويل" : "Payment & funding source"}</Text>
              <Text style={[styles.completionFieldHint, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "الخزينة المركزية للمالك أو عهدة موظف / حارس ميداني" : "Owner central treasury or a staff/guard cash float"}</Text>
              <CascadingSelectField value={completion.fundingEntity ? expenseFundingEntityLabel(completion.fundingEntity, language) : null} placeholder={language === "ar" ? "اختر جهة الصرف..." : "Choose payment source..."} error={fundingError} icon="account-balance" onPress={() => toggleCompletionDropdown("entity")} colors={colors} language={language} />
              {fundingError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى تحديد جهة الصرف والتمويل" : "Please choose the payment & funding source"}</Text> : null}
            </View>
            {completion.fundingEntity === "owner" ? <View onLayout={registerCompletionField("channel")} style={[styles.completionField, { borderColor: channelError ? "#F43F5E" : colors.border, backgroundColor: channelError ? "#F43F5E0D" : colors.surface }, channelError ? styles.invalidInputGlow : null]}>
              <Text style={[styles.completionFieldLabel, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "قناة الصرف والحساب" : "Withdrawal channel & account"}</Text>
              <CascadingSelectField value={completion.fundingChannel ? expenseFundingChannelLabel(completion.fundingChannel, language) : null} placeholder={language === "ar" ? "اختر قناة الصرف..." : "Choose withdrawal channel..."} error={channelError} icon="bolt" onPress={() => toggleCompletionDropdown("channel")} colors={colors} language={language} />
              {channelError ? <Text style={styles.fieldError}>{completion.fundingChannel === "cliq" || completion.fundingChannel === "iban" && !resolveOwnerAccount(completion.fundingChannel) ? (language === "ar" ? "لا توجد حسابات مفعلة لهذه القناة — فعّلها في إعدادات الدفع." : "No active accounts for this channel — enable them in payment settings.") : (language === "ar" ? "يرجى اختيار قناة الصرف والحساب" : "Please choose the withdrawal channel")}</Text> : null}
              {completion.fundingChannel && completion.fundingChannel !== "vault-cash" && resolveOwnerAccount(completion.fundingChannel) ? <Text style={[styles.completionFieldHint, { color: colors.muted, textAlign: align }]}>{language === "ar" ? `الحساب المموَّل منه: ${resolveOwnerAccount(completion.fundingChannel)?.label}` : `Funded from: ${resolveOwnerAccount(completion.fundingChannel)?.label}`}</Text> : null}
              {completion.fundingChannel && completion.fundingChannel !== "vault-cash" && !resolveOwnerAccount(completion.fundingChannel) ? <Text style={[styles.completionFieldHint, { color: colors.warning, textAlign: align }]}>{language === "ar" ? "لا توجد حسابات مفعلة لهذه القناة — فعّلها في إعدادات الدفع." : "No active accounts for this channel — enable them in payment settings."}</Text> : null}
            </View> : completion.fundingEntity === "staff" ? <>
              <View onLayout={registerCompletionField("staff")} style={[styles.completionField, { borderColor: staffError ? "#F43F5E" : colors.border, backgroundColor: staffError ? "#F43F5E0D" : colors.surface }, staffError ? styles.invalidInputGlow : null]}>
                <Text style={[styles.completionFieldLabel, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "اسم الموظف / الحارس" : "Staff / guard name"}</Text>
                <CascadingSelectField value={completion.fundingSourceLabel.trim() || null} placeholder={language === "ar" ? "اختر الموظف..." : "Choose the staff..."} error={staffError} icon="badge" onPress={() => toggleCompletionDropdown("staff")} colors={colors} language={language} />
                {staffError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى اختيار الموظف / الحارس" : "Please choose the staff / guard"}</Text> : null}
              </View>
              {completion.fundingSourceId.trim() ? <View onLayout={registerCompletionField("staffMode")} style={[styles.completionField, { borderColor: staffModeError ? "#F43F5E" : colors.border, backgroundColor: staffModeError ? "#F43F5E0D" : colors.surface }, staffModeError ? styles.invalidInputGlow : null]}>
                <Text style={[styles.completionFieldLabel, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "طريقة السداد" : "Payment mode"}</Text>
                <CascadingSelectField value={completion.staffMode ? COMPLETION_STAFF_MODES.find((mode) => mode.id === completion.staffMode)?.label[language === "ar" ? 0 : 1] ?? null : null} placeholder={language === "ar" ? "اختر طريقة السداد..." : "Choose payment mode..."} error={staffModeError} icon="account-balance-wallet" onPress={() => toggleCompletionDropdown("staffMode")} colors={colors} language={language} />
                {staffModeError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى اختيار طريقة السداد" : "Please choose the payment mode"}</Text> : null}
              </View> : null}
            </> : null}
            {!fundingReady(completion) ? <Text style={{ color: colors.warning, fontSize: 11, fontWeight: "800", marginTop: 6, textAlign: align }}>{language === "ar" ? "أكمل تحديد مصدر التمويل لتمكين الترحيل التلقائي." : "Complete the funding selection to enable automatic posting."}</Text> : null}
          </> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "الترحيل التلقائي للمصروفات" : "Auto post expense"} disabled={!hasPositiveActualCost(completion)} onPress={() => setCompletion({ ...completion, postExpense: !completion.postExpense })} style={[styles.checkRow, { backgroundColor: hasPositiveActualCost(completion) && completion.postExpense ? colors.success + "12" : colors.surfaceMuted, borderColor: hasPositiveActualCost(completion) && completion.postExpense ? colors.success : colors.border, opacity: hasPositiveActualCost(completion) ? 1 : 0.45 }]}><MaterialIcons name={hasPositiveActualCost(completion) && completion.postExpense ? "check-box" : "check-box-outline-blank"} size={18} color={hasPositiveActualCost(completion) && completion.postExpense ? colors.success : colors.muted} /><Text style={{ flex: 1, color: hasPositiveActualCost(completion) && completion.postExpense ? colors.success : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{language === "ar" ? "ترحيل تلقائي إلى سجل المصروفات تحت بند (صيانة وتشغيل)" : "Auto post to the expenses ledger under (Maintenance & operations)"}</Text></Pressable>
          {hasPositiveActualCost(completion) ? null : <Text style={{ color: colors.warning, fontSize: 11, fontWeight: "800", marginTop: 6, textAlign: align }}>{language === "ar" ? "أدخل تكلفة فعلية أكبر من صفر لتفعيل الترحيل التلقائي للمصروفات." : "Enter an actual cost greater than zero to enable automatic expense posting."}</Text>}
          {completion.task.frequency !== "once" ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "جدولة الاستحقاق القادم" : "Schedule next occurrence"} onPress={() => setCompletion({ ...completion, scheduleNext: !completion.scheduleNext })} style={[styles.checkRow, { backgroundColor: completion.scheduleNext ? colors.primary + "12" : colors.surfaceMuted, borderColor: completion.scheduleNext ? colors.primary : colors.border }]}><MaterialIcons name={completion.scheduleNext ? "check-box" : "check-box-outline-blank"} size={18} color={completion.scheduleNext ? colors.primary : colors.muted} /><Text style={{ flex: 1, color: completion.scheduleNext ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{language === "ar" ? `جدولة الاستحقاق القادم تلقائياً (تاريخ: ${formatDate(completionNextDate) ?? completionNextDate})` : `Automatically schedule the next occurrence (date: ${formatDate(completionNextDate) ?? completionNextDate})`}</Text></Pressable> : null}
          <View onLayout={registerCompletionField("notes")} style={[styles.completionField, { borderColor: notesError ? "#F43F5E" : colors.border, backgroundColor: notesError ? "#F43F5E0D" : colors.surface }, notesError ? styles.invalidInputGlow : null]}>
            <Text style={[styles.completionFieldLabel, { color: colors.foreground, textAlign: align }]}>{hasPositiveActualCost(completion) ? (language === "ar" ? "ملاحظات الإتمام وقطع الغيار" : "Completion notes & parts") : (language === "ar" ? "ملاحظات الإتمام (اختياري)" : "Completion notes (optional)")}</Text>
            <TextInput accessibilityLabel={language === "ar" ? "ملاحظات الإتمام" : "Completion notes"} value={completion.notes} onChangeText={(value) => { setNotesError(false); setCompletion({ ...completion, notes: value }); }} multiline placeholder={language === "ar" ? "ما تم إنجازه، قطع الغيار، ملاحظات إضافية..." : "What was done, parts, extra notes..."} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline, { backgroundColor: colors.surfaceMuted, borderColor: notesError ? "#F43F5E" : colors.border, color: colors.foreground, textAlign: align }, notesError ? styles.invalidInputGlow : null]} />
            {notesError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى كتابة بيان الصيانة وقطع الغيار (٣ أحرف على الأقل)" : "Please enter maintenance details & parts (min 3 characters)"}</Text> : null}
          </View>
          <CascadingSelectSheet visible={completionDropdown?.kind === "performer"} title={language === "ar" ? "منفّذ المهمة" : "Performed by"} options={performerOptions.map((option) => ({ key: option.id, label: option.name, icon: "person-outline" as const }))} selectedKey={completion.performerId || null} onSelect={(key) => { setPerformerError(false); setCompletion({ ...completion, performerId: key }); setCompletionDropdown(null); }} onCancel={() => setCompletionDropdown(null)} colors={colors} language={language} />
          <CascadingSelectSheet visible={completionDropdown?.kind === "entity"} title={language === "ar" ? "مصدر الدفع والتمويل" : "Payment & funding source"} options={EXPENSE_FUNDING_ENTITIES.map((entity) => ({ key: entity, label: expenseFundingEntityLabel(entity, language), icon: entity === "owner" ? ("account-balance" as const) : ("account-balance-wallet" as const) }))} selectedKey={completion.fundingEntity || null} onSelect={(key) => { setFundingError(false); setChannelError(false); setStaffError(false); setStaffModeError(false); setCompletion({ ...completion, fundingEntity: key as "owner" | "staff", fundingChannel: null, fundingSourceId: "", fundingSourceLabel: "", staffMode: null }); setCompletionDropdown(null); }} onCancel={() => setCompletionDropdown(null)} colors={colors} language={language} />
          <CascadingSelectSheet visible={completionDropdown?.kind === "channel"} title={language === "ar" ? "قناة الصرف والحساب" : "Withdrawal channel & account"} options={EXPENSE_FUNDING_CHANNELS.map((channel) => ({ key: channel, label: expenseFundingChannelLabel(channel, language), icon: channel === "vault-cash" ? ("point-of-sale" as const) : channel === "cliq" ? ("bolt" as const) : ("account-balance" as const) }))} selectedKey={completion.fundingChannel || null} onSelect={(key) => { setChannelError(false); const channel = key as ExpenseFundingChannel; const account = channel !== "vault-cash" ? resolveOwnerAccount(channel) : undefined; setCompletion({ ...completion, fundingChannel: channel, fundingSourceId: account?.id ?? "", fundingSourceLabel: account?.label ?? "" }); setCompletionDropdown(null); }} onCancel={() => setCompletionDropdown(null)} colors={colors} language={language} />
          <CascadingSelectSheet visible={completionDropdown?.kind === "staff"} title={language === "ar" ? "اسم الموظف / الحارس" : "Staff / guard name"} options={fundingStaffFloats.map((account) => ({ key: account.id, label: account.label, icon: "badge" as const }))} selectedKey={completion.fundingSourceId || null} onSelect={(key) => { setStaffError(false); const account = fundingStaffFloats.find((item) => item.id === key); setCompletion({ ...completion, fundingSourceId: key, fundingSourceLabel: account?.label ?? "" }); setCompletionDropdown(null); }} onCancel={() => setCompletionDropdown(null)} colors={colors} language={language} />
          <CascadingSelectSheet visible={completionDropdown?.kind === "staffMode"} title={language === "ar" ? "طريقة السداد" : "Payment mode"} options={COMPLETION_STAFF_MODES.map((mode) => ({ key: mode.id, label: mode.label[language === "ar" ? 0 : 1], icon: mode.icon }))} selectedKey={completion.staffMode || null} onSelect={(key) => { setStaffModeError(false); setCompletion({ ...completion, staffMode: key as "float" | "reimbursement" }); setCompletionDropdown(null); }} onCancel={() => setCompletionDropdown(null)} colors={colors} language={language} />
          <View style={[styles.completionActions, { flexDirection: row }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إلغاء" : "Cancel"} disabled={Boolean(busy)} onPress={() => setCompletion(null)} style={({ pressed }) => [styles.completionSecondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13 }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تأكيد الإتمام والترحيل" : "Confirm completion & posting"} disabled={Boolean(busy)} onPress={() => void submitCompletion()} style={({ pressed }) => [styles.completionPrimary, { backgroundColor: busy?.kind === "complete" ? colors.muted : colors.success, opacity: pressed ? 0.8 : 1 }]}><MaterialIcons name={busy?.kind === "complete" ? "hourglass-top" : "check"} size={16} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>{busy?.kind === "complete" ? (language === "ar" ? "جارٍ الترحيل..." : "Posting...") : (language === "ar" ? "تأكيد الإتمام والترحيل" : "Confirm completion & posting")}</Text></Pressable>
          </View>
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
          <TextInput accessibilityLabel={language === "ar" ? "اسم الأصل" : "Asset name"} value={assetSheet.draft.name} onChangeText={(value) => { setAssetErrors((prev) => ({ ...prev, name: false })); setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, name: value } }); }} placeholder={language === "ar" ? "مثال: مكيف صالة رئيسي" : "e.g. Main hall air conditioner"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: assetErrors.name ? "#F43F5E" : colors.border, color: colors.foreground, textAlign: align }, assetErrors.name ? styles.invalidInputGlow : null]} />
          {assetErrors.name ? <Text style={styles.fieldError}>{language === "ar" ? "يُرجى إدخال اسم الأصل" : "Please enter an asset name"}</Text> : null}
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "الوحدات المستهدفة" : "Target units"}</Text>
          {chalets.length ? <><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تحديد كافة الوحدات" : "Select all units"} onPress={toggleAllAssetUnits} style={[styles.checkRow, { backgroundColor: assetSheet.draft.unitIds.length === chalets.length ? colors.primary + "14" : colors.surfaceMuted, borderColor: assetErrors.units ? "#F43F5E" : assetSheet.draft.unitIds.length === chalets.length ? colors.primary : colors.border }]}><MaterialIcons name={assetSheet.draft.unitIds.length === chalets.length ? "check-box" : "check-box-outline-blank"} size={18} color={assetSheet.draft.unitIds.length === chalets.length ? colors.primary : colors.muted} /><Text style={{ flex: 1, color: assetSheet.draft.unitIds.length === chalets.length ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{language === "ar" ? "تحديد كافة الوحدات" : "Select all units"}</Text><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}>{chalets.length}</Text></Pressable>
          {chalets.map((chalet) => { const selected = assetSheet.draft.unitIds.includes(chalet.id); return <Pressable key={chalet.id} accessibilityRole="checkbox" accessibilityLabel={chalet.name} onPress={() => toggleAssetUnit(chalet.id)} style={[styles.checkRow, { backgroundColor: selected ? colors.primary + "14" : colors.surfaceMuted, borderColor: selected ? colors.primary : assetErrors.units ? "#F43F5E" : colors.border }]}><MaterialIcons name={selected ? "check-box" : "check-box-outline-blank"} size={18} color={selected ? colors.primary : colors.muted} /><Text style={{ flex: 1, color: selected ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{chalet.name}</Text><View style={[styles.filterDot, { backgroundColor: chalet.color }]} /></Pressable>; })}
          {assetErrors.units ? <Text style={styles.fieldError}>{language === "ar" ? "يُرجى اختيار وحدة واحدة على الأقل" : "Please select at least one unit"}</Text> : null}</> : <View style={[styles.unitWarning, { backgroundColor: colors.warning + "14", borderColor: colors.warning + "55" }]}><MaterialIcons name="error-outline" size={17} color={colors.warning} /><Text style={{ color: colors.warning, fontSize: 12, fontWeight: "800", marginLeft: 7, flex: 1, textAlign: align }}>{language === "ar" ? "يجب إضافة وحدة أولاً للمنشأة قبل تسجيل صيانة أو أصول" : "You must add a unit to this property before registering maintenance or assets."}</Text></View>}
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "التصنيف" : "Category"}</Text>
          <View style={[styles.chipWrap, { flexDirection: row }]}>{ASSET_CATEGORIES.map((category) => { const selected = assetSheet.draft.category === category.id; return <Pressable key={category.id} onPress={() => setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, category: category.id } })} style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border }]}><Text style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 11, fontWeight: "900" }}>{category.label[language === "ar" ? 0 : 1]}</Text></Pressable>; })}</View>
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "الحالة" : "Condition"}</Text>
          <View style={[styles.chipWrap, { flexDirection: row }]}>{ASSET_CONDITION_OPTIONS.map((condition) => { const selected = assetSheet.draft.condition === condition.id; const selectedColor = condition.id === "needs_service" ? colors.error : condition.id === "excellent" ? colors.success : colors.primary; return <Pressable key={condition.id} onPress={() => setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, condition: condition.id } })} style={[styles.chip, { backgroundColor: selected ? selectedColor : colors.surfaceMuted, borderColor: selected ? selectedColor : colors.border }]}><MaterialIcons name={condition.icon} size={13} color={selected ? "#FFFFFF" : colors.muted} /><Text style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 11, fontWeight: "900" }}>{assetConditionLabel(condition.id, language)}</Text></Pressable>; })}</View>
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "الرقم التسلسلي (اختياري)" : "Serial number (optional)"}</Text>
          <TextInput accessibilityLabel={language === "ar" ? "الرقم التسلسلي" : "Serial number"} value={assetSheet.draft.serialNumber} onChangeText={(value) => setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, serialNumber: value } })} placeholder={language === "ar" ? "اختياري" : "Optional"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "تكلفة الشراء (اختياري)" : "Purchase cost (optional)"}</Text>
          <TextInput accessibilityLabel={language === "ar" ? "تكلفة الشراء" : "Purchase cost"} value={assetSheet.draft.purchaseCost} onChangeText={(value) => setAssetSheet({ ...assetSheet, draft: { ...assetSheet.draft, purchaseCost: value } })} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
          {assetSheet.mode === "create" && Number(assetSheet.draft.purchaseCost || 0) > 0 ? <>
            <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "ترحيل تكلفة الشراء إلى سجل المصروفات" : "Post purchase cost to expenses ledger"} onPress={toggleAssetExpenseLink} style={[styles.checkRow, { backgroundColor: assetSheet.draft.linkExpense ? colors.success + "12" : colors.surfaceMuted, borderColor: assetSheet.draft.linkExpense ? colors.success : assetErrors.expense ? "#F43F5E" : colors.border }]}><MaterialIcons name={assetSheet.draft.linkExpense ? "check-box" : "check-box-outline-blank"} size={18} color={assetSheet.draft.linkExpense ? colors.success : colors.muted} /><Text style={{ flex: 1, color: assetSheet.draft.linkExpense ? colors.success : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{language === "ar" ? "ترحيل تكلفة الشراء إلى سجل المصروفات" : "Post the purchase cost to the expenses ledger"}</Text></Pressable>
            {assetSheet.draft.linkExpense ? <>
              <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, textAlign: align, marginTop: 12 }}>{language === "ar" ? "مصدر الدفع (من الخزينة المركزية للمالك)" : "Payment source (owner central treasury)"}</Text>
              <View style={[styles.chipWrap, { flexDirection: row }]}>{EXPENSE_FUNDING_CHANNELS.map((channel) => { const selected = assetSheet.draft.expenseChannel === channel; return <Pressable key={channel} accessibilityRole="button" accessibilityLabel={expenseFundingChannelLabel(channel, language)} onPress={() => selectAssetExpenseChannel(channel)} style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : assetErrors.expense ? "#F43F5E" : colors.border }]}><Text style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 11, fontWeight: "900" }}>{expenseFundingChannelLabel(channel, language)}</Text></Pressable>; })}</View>
              {assetSheet.draft.expenseChannel && assetSheet.draft.expenseChannel !== "vault-cash" ? (() => { const accounts = fundingOwnerAccounts.filter((account) => (assetSheet.draft.expenseChannel === "cliq" && account.kind === "cliq") || (assetSheet.draft.expenseChannel === "iban" && account.kind === "bank")); return accounts.length ? <View style={[styles.chipWrap, { flexDirection: row }]}>{accounts.map((account) => { const selected = assetSheet.draft.expenseAccountId === account.id; return <Pressable key={account.id} accessibilityRole="button" accessibilityLabel={account.label} onPress={() => selectAssetExpenseAccount(account.id)} style={[styles.radioRow, { backgroundColor: selected ? colors.primary + "14" : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border }]}><MaterialIcons name={selected ? "radio-button-checked" : "radio-button-unchecked"} size={17} color={selected ? colors.primary : colors.muted} /><Text numberOfLines={1} style={{ flex: 1, color: selected ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{account.label}</Text></Pressable>; })}</View> : <Text style={{ color: colors.warning, fontSize: 11, fontWeight: "800", marginTop: 6, textAlign: align }}>{language === "ar" ? "لا توجد حسابات مفعلة لهذه القناة — أضفها من «طرق الدفع والحسابات المالية»." : "No active accounts for this channel — add them in payment settings."}</Text>; })() : null}
              {assetErrors.expense ? <Text style={styles.fieldError}>{!assetSheet.draft.expenseChannel ? (language === "ar" ? "يُرجى اختيار مصدر الدفع" : "Please choose a payment source") : (language === "ar" ? "يُرجى اختيار الحساب المالي المفعل" : "Please choose an active financial account")}</Text> : null}
              <View style={[styles.scheduleHint, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "55", marginTop: 8 }]}>
                <MaterialIcons name="info-outline" size={15} color={colors.primary} />
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", flex: 1, textAlign: align }}>{language === "ar" ? `سيُسجَّل قيد مصروف بند «أخرى / شراء أصول وتجهيزات» بقيمة ${Number(assetSheet.draft.purchaseCost).toLocaleString()} د.أ.` : `A general expense under "Other / Asset Purchase" will be recorded for ${Number(assetSheet.draft.purchaseCost).toLocaleString()} JOD.`}</Text>
              </View>
            </> : null}
          </> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حفظ الأصل" : "Save asset"} disabled={saving} onPress={() => void saveAssetDraft()} style={({ pressed }) => [styles.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary, opacity: pressed ? 0.8 : 1 }]}><MaterialIcons name="save" size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>{saving ? (language === "ar" ? "جارٍ الحفظ..." : "Saving...") : (language === "ar" ? "حفظ الأصل" : "Save asset")}</Text></Pressable>
        </ScrollView>
      </View>
    </View> : null}
  </Modal>

  <Modal visible={Boolean(auditFor)} transparent animationType="fade" onRequestClose={() => setAuditFor(null)} statusBarTranslucent>
    {auditFor ? <View style={styles.auditOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setAuditFor(null)} />
      <View style={[styles.auditCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.auditCardHeader, { flexDirection: row }]}><View style={[styles.auditCardTitleRow, { flexDirection: row }]}><View style={[styles.sheetIcon, { backgroundColor: colors.primary + "1A" }]}><MaterialIcons name="history" size={20} color={colors.primary} /></View><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align, flex: 1 }}>{language === "ar" ? "سجل الإجراءات" : "Action log"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={() => setAuditFor(null)} style={({ pressed }) => [styles.closeBtn, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="close" size={20} color={colors.foreground} /></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.auditSheetBody}>
          {(() => {
            const task = maintenanceTasks?.find((t) => t.id === auditFor);
            if (!task) return null;
            const entries = (maintenanceAuditLog ?? []).filter((entry) => entry.taskId === auditFor);
            const dot = (action: MaintenanceAuditAction) => action === "completed" || action === "expense_posted" ? colors.success : action === "cancelled" ? colors.error : colors.warning;
            if (!entries.length) return <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", paddingVertical: 24 }}>{language === "ar" ? "لا توجد إجراءات مسجلة بعد." : "No recorded actions yet."}</Text>;
            return entries.map((entry) => <View key={entry.id} style={[styles.auditRow, { flexDirection: row }]}><View style={[styles.auditIcon, { backgroundColor: dot(entry.action) + "1A" }]}><MaterialIcons name="check" size={14} color={dot(entry.action)} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{maintenanceAuditActionLabel(entry.action, language)}{entry.details ? <Text style={{ color: colors.muted, fontWeight: "600" }}> — {entry.details}</Text> : null}</Text><View style={[styles.auditMetaRow, { flexDirection: row, marginTop: 3 }]}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>{entry.userName}</Text>{entry.userRole ? <View style={[styles.roleTag, { backgroundColor: entry.userRole === "owner" ? colors.primary + "1A" : entry.userRole === "staff" ? colors.warning + "1A" : colors.success + "1A" }]}><Text style={{ color: entry.userRole === "owner" ? colors.primary : entry.userRole === "staff" ? "#B45309" : colors.success, fontSize: 9, fontWeight: "900" }}>{maintenancePerformerRoleLabel(entry.userRole, language)}</Text></View> : null}<Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>{(() => { const day = formatDate(entry.timestamp.slice(0, 10)) ?? entry.timestamp.slice(0, 10); const time = entry.timestamp.slice(11, 16); return ` · ${day}${time ? ` · ${time}` : ""}`; })()}</Text></View></View></View>);
          })()}
        </ScrollView>
      </View>
    </View> : null}
  </Modal>

  <Modal visible={Boolean(cancelFor)} transparent animationType="fade" onRequestClose={() => !busy && setCancelFor(null)} statusBarTranslucent>
    {cancelFor ? <View style={styles.auditOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => !busy && setCancelFor(null)} />
      <View style={[styles.cancelCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.auditCardHeader, { flexDirection: row }]}><View style={[styles.sheetIcon, { backgroundColor: colors.error + "1A" }]}><MaterialIcons name="cancel" size={20} color={colors.error} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{language === "ar" ? "إلغاء مهمة متكررة" : "Cancel recurring task"}</Text><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600", textAlign: align, marginTop: 2 }}>{maintenanceFrequencyLabel(cancelFor.frequency, language)} · {cancelFor.title}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={() => setCancelFor(null)} disabled={Boolean(busy)} style={({ pressed }) => [styles.closeBtn, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="close" size={20} color={colors.foreground} /></Pressable></View>
        <Text style={{ color: colors.muted, fontSize: 12, textAlign: align, lineHeight: 19 }}>{language === "ar" ? "هذه مهمة دورية. اختر كيف تريد التعامل مع الجدولة المتبقية:" : "This is a recurring maintenance task. Choose how to handle the remaining schedule:"}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إلغاء استحقاق اليوم فقط" : "Cancel today's occurrence only"} disabled={Boolean(busy)} onPress={() => void confirmCancel(cancelFor, "instance")} style={({ pressed }) => [styles.cancelChoice, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "0F", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="event-available" size={18} color={colors.primary} /><View style={styles.flex}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "إلغاء استحقاق اليوم فقط" : "Cancel today's occurrence only"}</Text><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600", textAlign: align, marginTop: 2 }}>{language === "ar" ? "تُلغى مهمة اليوم وتستمر الجدولة للدورات القادمة تلقائياً." : "Cancels today's task; following recurrences continue automatically."}</Text></View></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إلغاء وحذف الجدول المتكرر نهائياً" : "Cancel & terminate the schedule permanently"} disabled={Boolean(busy)} onPress={() => void confirmCancel(cancelFor, "series")} style={({ pressed }) => [styles.cancelChoice, { borderColor: colors.error + "66", backgroundColor: colors.error + "0F", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="delete-sweep" size={18} color={colors.error} /><View style={styles.flex}><Text style={{ color: colors.error, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "إلغاء وحذف الجدول المتكرر نهائياً" : "Cancel & terminate the schedule permanently"}</Text><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600", textAlign: align, marginTop: 2 }}>{language === "ar" ? "تُلغى المهمة وتتوقف جميع الدورات القادمة لهذا الجدول نهائياً." : "Cancels this task and stops every future occurrence of this schedule permanently."}</Text></View></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} disabled={Boolean(busy)} onPress={() => setCancelFor(null)} style={({ pressed }) => [styles.cancelDismiss, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800" }}>{language === "ar" ? "إغلاق" : "Close"}</Text></Pressable>
      </View>
    </View> : null}
  </Modal>

  <Modal visible={rangePanelOpen} transparent animationType="fade" onRequestClose={() => setRangePanelOpen(false)} statusBarTranslucent>
    <View style={styles.rangeModalBackdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setRangePanelOpen(false)} />
      <View style={[styles.rangeModalCard, { backgroundColor: "#0f172a", borderColor: "rgba(51, 65, 85, 0.9)" }]}>
        <View style={[styles.rangeModalHeader, { flexDirection: row }]}>
          <View style={[styles.rangeModalTitleIcon, { backgroundColor: colors.primary + "1A" }]}><MaterialIcons name="date-range" size={19} color={colors.primary} /></View>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align, flex: 1 }}>{language === "ar" ? "تحديد الفترة الزمنية" : "Set time range"}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={() => setRangePanelOpen(false)} style={({ pressed }) => [styles.rangeModalClose, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="close" size={19} color={colors.foreground} /></Pressable>
        </View>
        <View style={styles.rangeModalField}><CalendarDateField label={language === "ar" ? "من تاريخ" : "From date"} value={rangeDraft.start} onChange={(value) => setRangeDraft({ ...rangeDraft, start: value })} /></View>
        <View style={styles.rangeModalField}><CalendarDateField label={language === "ar" ? "إلى تاريخ" : "To date"} value={rangeDraft.end} onChange={(value) => setRangeDraft({ ...rangeDraft, end: value })} /></View>
        <View style={[styles.rangeModalNote, { backgroundColor: colors.surfaceMuted + "80", borderColor: colors.border + "AA" }]}><MaterialIcons name="info-outline" size={15} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", flex: 1, textAlign: align }}>{language === "ar" ? "تحصر الفلترة المهام ضمن هذا النطاق على الشريط وقائمة المهام." : "Filters the strip and task list within this range."}</Text></View>
        <View style={[styles.rangeModalActions, { flexDirection: row }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إلغاء" : "Cancel"} onPress={() => setRangePanelOpen(false)} style={({ pressed }) => [styles.rangeModalCancel, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تطبيق الفلترة" : "Apply filter"} onPress={applyCustomRange} style={({ pressed }) => [styles.rangeModalApply, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}><MaterialIcons name="filter-alt" size={17} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>{language === "ar" ? "تطبيق الفلترة" : "Apply filter"}</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120, flexGrow: 1 },
  flex: { flex: 1, minWidth: 0 },
  subtitle: { fontSize: 11, fontWeight: "600" },
  header: { alignItems: "center", gap: 10, marginBottom: 12 },
  statsRow: { gap: 8 },
  statCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 11, alignItems: "center" },
  tabRow: { borderRadius: 15, padding: 4, gap: 4, marginTop: 14 },
  tab: { flex: 1, minHeight: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  card: { borderRadius: 17, borderWidth: 1, padding: 12, marginTop: 9, alignItems: "center", gap: 10, flexDirection: "row" },
  taskCard: { borderRadius: 17, borderWidth: 1, padding: 12, marginTop: 9 },
  cardRow: { alignItems: "center", gap: 10, flexDirection: "row" },
  cardSide: { paddingLeft: 8, alignItems: "center" },
  cardSideTop: { alignItems: "center", gap: 6 },
  badgeRow: { flexWrap: "wrap", gap: 6, marginTop: 5 },
  taskIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardTitleRow: { alignItems: "center", gap: 7 },
  cardTitle: { fontSize: 14, fontWeight: "900" },
  cardMeta: { fontSize: 11, marginTop: 4, fontWeight: "600" },
  statusPill: { minHeight: 22, borderRadius: 11, paddingHorizontal: 9, alignItems: "center", justifyContent: "center" },
  badgePill: { minHeight: 20, borderRadius: 10, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" },
  iconAction: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  iconDanger: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  actionBtn: { minHeight: 36, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  auditToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 8 },
  auditWrap: { borderRadius: 12, borderWidth: 1, padding: 10, marginTop: 8, gap: 9 },
  auditOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)", alignItems: "center", justifyContent: "center", padding: 20 },
  auditCard: { width: "100%", maxWidth: 520, maxHeight: "78%", borderRadius: 22, borderWidth: 1, padding: 20, shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 20 },
  auditCardHeader: { alignItems: "center", gap: 12, marginBottom: 14 },
  auditCardTitleRow: { alignItems: "center", gap: 10, minWidth: 0, flex: 1 },
  cancelCard: { width: "100%", maxWidth: 400, borderRadius: 22, borderWidth: 1, padding: 20, shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 20 },
  cancelChoice: { minHeight: 62, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, marginTop: 11, alignItems: "center", flexDirection: "row", gap: 10 },
  cancelDismiss: { minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 12 },
  filterRow: { marginTop: 12 },
  clickAway: { zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.2)" },
  rollerWrap: { marginTop: 13 },
  rollerToolbar: { alignItems: "center", gap: 7, marginBottom: 8 },
  rollerChips: { flex: 1, minWidth: 0, alignItems: "center", gap: 6, flexWrap: "wrap", flexDirection: "row" },
  rollerRangeChip: { minHeight: 30, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 },
  rollerRangeAnchor: { position: "relative", flexShrink: 0 },
  rangeModalBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)", alignItems: "center", justifyContent: "center", padding: 16 },
  rangeModalCard: { width: "100%", maxWidth: 380, borderRadius: 16, borderWidth: 1, padding: 20, gap: 14, opacity: 1, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 24 },
  rangeModalHeader: { alignItems: "center", gap: 10 },
  rangeModalTitleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rangeModalClose: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rangeModalField: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 6, overflow: "hidden", backgroundColor: "#0f172a" },
  rangeModalNote: { minHeight: 38, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", flexDirection: "row", gap: 7 },
  rangeModalActions: { gap: 9, marginTop: 2 },
  rangeModalApply: { flex: 1, minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  rangeModalCancel: { minWidth: 106, minHeight: 46, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  rollerScroller: { alignItems: "center", gap: 6 },
  rollerArrow: { width: 34, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, flexShrink: 0 },
  rollerStrip: { flexDirection: "row", gap: 6, paddingVertical: 3, paddingHorizontal: 2 },
  rollerChip: { width: 54, minWidth: 50, maxWidth: 54, height: 60, borderRadius: 14, borderWidth: 1, paddingVertical: 6, alignItems: "center", justifyContent: "center", gap: 2 },
  rollerDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  rollerTodayUnderline: { position: "absolute", bottom: 5, left: 9, right: 9, height: 2.5, borderRadius: 2 },
  invalidInputGlow: { borderWidth: 2, shadowColor: "#F43F5E", shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  fieldError: { color: "#F43F5E", fontSize: 10, fontWeight: "800", marginTop: 5, textAlign: "right" },
  assetHelper: { minHeight: 36, borderRadius: 12, borderWidth: 1, padding: 10 },
  filterDot: { width: 8, height: 8, borderRadius: 4 },
  searchWrap: { flex: 1, minWidth: 0, maxWidth: 480, alignItems: "center", gap: 6, minHeight: 40, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: "700", padding: 0 },
  toolbarMenuAnchor: { position: "relative", flexShrink: 1, maxWidth: 175, minWidth: 110 },
  toolbarSelect: { minHeight: 40, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", gap: 5 },
  toolbarMenu: { position: "absolute", top: "100%", marginTop: 8, minWidth: 200, maxWidth: 280, borderRadius: 12, borderWidth: 1, overflow: "hidden", zIndex: 50 },
  toolbarRow: { minHeight: 40, paddingHorizontal: 12, alignItems: "center", gap: 8 },
  moreBtn: { width: 40, height: 36, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  menuAnchor: { position: "relative", zIndex: 50 },
  floatMenu: { position: "absolute", left: 0, top: "100%", marginTop: 4, minWidth: 190, maxWidth: 240, borderRadius: 12, borderWidth: 1, padding: 6, flexDirection: "column", gap: 4, zIndex: 50, backgroundColor: "#0f172a", borderColor: "rgba(51, 65, 85, 0.8)", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  menuItem: { minHeight: 42, paddingHorizontal: 12, alignItems: "center", flexDirection: "row", gap: 9, borderRadius: 9 },
  archiveCard: { borderRadius: 15, borderWidth: 1, padding: 11, marginTop: 8, gap: 8 },
  archiveIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  archiveLogBtn: { minHeight: 34, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, alignSelf: "flex-start", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  auditSheetBody: { gap: 12, paddingBottom: 10 },
  auditRow: { alignItems: "flex-start", gap: 8 },
  auditIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 42, paddingHorizontal: 24 },
  emptyCta: { minHeight: 44, borderRadius: 13, borderWidth: 1, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, marginTop: 14 },
  unitWarning: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 10, marginTop: 7 },
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
  presetChip: { minHeight: 34, borderRadius: 12, borderWidth: 1, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, maxWidth: "100%" },
  performerSelect: { minHeight: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, marginTop: 5, alignItems: "center", flexDirection: "row", gap: 8 },
  performerMenu: { borderRadius: 13, borderWidth: 1, marginTop: 5, overflow: "hidden" },
  performerRow: { minHeight: 44, paddingHorizontal: 12, alignItems: "center", flexDirection: "row", gap: 8 },
  roleTag: { minHeight: 18, borderRadius: 9, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" },
  radioRow: { minHeight: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, marginTop: 7, alignItems: "center", flexDirection: "row", gap: 9 },
  fundingRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 7 },
  fundingChip: { minHeight: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 11, alignItems: "center", flexDirection: "row", gap: 7, flexGrow: 1, flexBasis: "44%" },
  checkRow: { minHeight: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, marginTop: 7, alignItems: "center", flexDirection: "row", gap: 9 },
  taskErrorBox: { flexDirection: "row", alignItems: "center", borderRadius: 13, borderWidth: 1, padding: 11, marginTop: 14 },
  scheduleHint: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, borderWidth: 1, padding: 10, marginTop: 8 },
  auditMetaRow: { alignItems: "center", gap: 6, flexWrap: "wrap" },
  completionActions: { gap: 9, marginTop: 18 },
  completionPrimary: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  completionSecondary: { minWidth: 96, minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  completionField: { borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 11 },
  completionFieldLabel: { fontSize: 12, fontWeight: "900", marginBottom: 4 },
  completionFieldHint: { fontSize: 10, marginBottom: 3, fontWeight: "700" },
  attributionRow: { marginTop: 7, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", gap: 6 },
  attributionText: { flex: 1, fontSize: 10, fontWeight: "800" },
  saveBtn: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, marginTop: 16 },
});