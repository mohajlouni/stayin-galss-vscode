import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  MAINTENANCE_AUDIT_ACTIONS,
  MAINTENANCE_PAYMENT_SOURCES,
  expenseSourceForPaymentSource,
  maintenanceAuditActionLabel,
  maintenancePaymentSourceLabel,
  maintenancePerformerRoleLabel,
  normalizeAppData,
  paymentSourceForExpenseSource,
  type MaintenanceAuditEntry,
  type MaintenanceTask,
  type Settings,
} from "../lib/booking-model";
import { isMaintenanceTaskClosed } from "../lib/maintenance";
import { isUnitFullyBlocked } from "../lib/maintenance-blocks";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const task = (overrides: Partial<MaintenanceTask> = {}): MaintenanceTask => ({
  id: "mt-1",
  chaletId: "ch-1",
  chaletName: "شاليه البحر",
  title: "صيانة التكييف",
  frequency: "monthly",
  nextDueDate: "2026-03-10",
  status: "in_progress",
  createdAt: "2026-03-01T08:00:00.000Z",
  ...overrides,
});

describe("maintenance task lifecycle closure", () => {
  it("treats completed and cancelled tasks as closed, active states as open", () => {
    expect(isMaintenanceTaskClosed(task({ status: "completed" }))).toBe(true);
    expect(isMaintenanceTaskClosed(task({ status: "cancelled" }))).toBe(true);
    expect(isMaintenanceTaskClosed(task({ status: "scheduled" }))).toBe(false);
    expect(isMaintenanceTaskClosed(task({ status: "in_progress" }))).toBe(false);
  });

  it("lets cancelling release the calendar block automatically", () => {
    const blocked = (status: MaintenanceTask["status"]) => [{ ...task(), status, blockBooking: true, blockPeriod: "full_day" as const, nextDueDate: "2026-03-10" }];
    expect(isUnitFullyBlocked(blocked("in_progress"), "2026-03-10", "ch-1")).toBe(true);
    expect(isUnitFullyBlocked(blocked("cancelled"), "2026-03-10", "ch-1")).toBe(false);
  });
});

describe("status and performer field normalization", () => {
  it("maps legacy pending status to scheduled and passes through the live statuses", () => {
    const base = { chalets: [], bookings: [], waitlist: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], settings: DEFAULT_SETTINGS as unknown as Settings, maintenanceTasks: [] as MaintenanceTask[] };
    expect(normalizeAppData({ ...base, maintenanceTasks: [task({ status: "pending" as MaintenanceTask["status"] })] }).maintenanceTasks?.[0]?.status).toBe("scheduled");
    expect(normalizeAppData({ ...base, maintenanceTasks: [task({ status: "in_progress" })] }).maintenanceTasks?.[0]?.status).toBe("in_progress");
    expect(normalizeAppData({ ...base, maintenanceTasks: [task({ status: "completed" })] }).maintenanceTasks?.[0]?.status).toBe("completed");
    expect(normalizeAppData({ ...base, maintenanceTasks: [task({ status: "cancelled" })] }).maintenanceTasks?.[0]?.status).toBe("cancelled");
  });

  it("preserves execution metadata through normalization and fills a legacy performer role for completed tasks", () => {
    const data = normalizeAppData({ chalets: [], bookings: [], waitlist: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], settings: DEFAULT_SETTINGS as unknown as Settings, maintenanceTasks: [task({ status: "completed", actualCost: 32, performedById: 7, performedByName: "أبو محمد", performedByRole: "staff", paymentSource: "staff_custody", completionNotes: "تم تنظيف الفلاتر" })] });
    const saved = data.maintenanceTasks?.[0];
    expect(saved?.actualCost).toBe(32);
    expect(saved?.performedById).toBe(7);
    expect(saved?.performedByName).toBe("أبو محمد");
    expect(saved?.performedByRole).toBe("staff");
    expect(saved?.paymentSource).toBe("staff_custody");
    expect(saved?.completionNotes).toBe("تم تنظيف الفلاتر");
  });

  it("keeps all-units tasks with an empty chaletId and never lets them block the calendar", () => {
    const data = normalizeAppData({ chalets: [], bookings: [], waitlist: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], settings: DEFAULT_SETTINGS as unknown as Settings, maintenanceTasks: [{ ...task({ chaletId: undefined }), targetScope: "all_units", blockBooking: true, blockPeriod: "full_day" }] });
    const saved = data.maintenanceTasks?.[0];
    expect(saved).toBeDefined();
    expect(saved?.targetScope).toBe("all_units");
    expect(saved?.chaletId).toBeUndefined();
    expect(saved?.blockBooking).toBe(false);
    expect(saved?.blockPeriod).toBeUndefined();
    expect(isUnitFullyBlocked([saved as MaintenanceTask], "2026-03-10", "ch-1")).toBe(false);
  });

  it("drops malformed all-units tasks missing both chaletId and targetScope", () => {
    const data = normalizeAppData({ chalets: [], bookings: [], waitlist: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], settings: DEFAULT_SETTINGS as unknown as Settings, maintenanceTasks: [{ ...task({ chaletId: undefined }), status: "scheduled" }] });
    expect(data.maintenanceTasks ?? []).toEqual([]);
  });

  it("keeps a single-unit task block while removing the all-units marker", () => {
    const data = normalizeAppData({ chalets: [], bookings: [], waitlist: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], settings: DEFAULT_SETTINGS as unknown as Settings, maintenanceTasks: [task({ blockBooking: true, blockPeriod: "full_day" })] });
    const saved = data.maintenanceTasks?.[0];
    expect(saved?.targetScope).toBeUndefined();
    expect(saved?.chaletId).toBe("ch-1");
    expect(saved?.blockBooking).toBe(true);
    expect(isUnitFullyBlocked([saved as MaintenanceTask], "2026-03-10", "ch-1")).toBe(true);
  });
});

describe("maintenance audit log normalization", () => {
  it("keeps well-formed entries, drops malformed ones, and sorts newest-first", () => {
    const valid: MaintenanceAuditEntry = { id: "maint-audit-1", taskId: "mt-1", userName: "أبو محمد", userRole: "owner", action: "created", timestamp: "2026-03-01T08:00:00.000Z" };
    const older: MaintenanceAuditEntry = { ...valid, id: "maint-audit-0", action: "expense_posted", timestamp: "2026-03-01T07:00:00.000Z", details: "أتم أبو محمد (المالك) المهمة بتكلفة 25 JOD - مُرحّل برقم #exp-1", userRole: "staff" };
    const data = normalizeAppData({ chalets: [], bookings: [], waitlist: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], settings: DEFAULT_SETTINGS as unknown as Settings, maintenanceAuditLog: [older, { ...valid, action: "bogus" as MaintenanceAuditEntry["action"] }, valid] });
    expect(data.maintenanceAuditLog?.map((entry) => entry.id)).toEqual(["maint-audit-1", "maint-audit-0"]);
    expect(data.maintenanceAuditLog?.[1]?.details).toBe("أتم أبو محمد (المالك) المهمة بتكلفة 25 JOD - مُرحّل برقم #exp-1");
  });

  it("defaults empty audit lists and normalizes a legacy performer role for completed tasks without one", () => {
    const data = normalizeAppData({ chalets: [], bookings: [], waitlist: [], turnoverTasks: [], specialPriceRules: [], auditLog: [], settings: DEFAULT_SETTINGS as unknown as Settings, maintenanceTasks: [task({ status: "completed", completedByName: "أبو محمد" })] });
    expect(data.maintenanceAuditLog).toEqual([]);
    expect(data.maintenanceTasks?.[0]?.performedByRole).toBe("staff");
  });
});

describe("payment source mapping", () => {
  it("maps every payment source to the matching operational expense source and back", () => {
    expect(expenseSourceForPaymentSource("owner_account")).toBe("owner-account");
    expect(expenseSourceForPaymentSource("staff_custody")).toBe("staff-float");
    expect(expenseSourceForPaymentSource("guard_custody")).toBe("guard-custody");
    for (const source of MAINTENANCE_PAYMENT_SOURCES) {
      expect(paymentSourceForExpenseSource(expenseSourceForPaymentSource(source))).toBe(source);
    }
  });

  it("localizes payment source and performer role labels", () => {
    expect(maintenancePaymentSourceLabel("owner_account", "ar")).toBe("حساب المنشأة / المالك (CliQ / كاش / بنك)");
    expect(maintenancePaymentSourceLabel("staff_custody", "ar")).toBe("عهدة الموظف");
    expect(maintenancePaymentSourceLabel("guard_custody", "en")).toBe("Guard custody");
    expect(maintenancePerformerRoleLabel("owner", "ar")).toBe("المالك");
    expect(maintenancePerformerRoleLabel("staff", "ar")).toBe("موظف المنشأة");
    expect(maintenancePerformerRoleLabel("guard", "en")).toBe("Guard");
  });
});

describe("maintenance audit action labels", () => {
  it("labels every lifecycle action in Arabic and English", () => {
    expect(MAINTENANCE_AUDIT_ACTIONS).toEqual(["created", "started", "completed", "cancelled", "expense_posted"]);
    expect(maintenanceAuditActionLabel("created", "ar")).toBe("تم الإنشاء");
    expect(maintenanceAuditActionLabel("started", "ar")).toBe("تم بدء العمل");
    expect(maintenanceAuditActionLabel("completed", "ar")).toBe("تم الإتمام والترحيل");
    expect(maintenanceAuditActionLabel("cancelled", "ar")).toBe("تم الإلغاء");
    expect(maintenanceAuditActionLabel("expense_posted", "ar")).toBe("تم ترحيل المصروف");
    expect(maintenanceAuditActionLabel("expense_posted", "en")).toBe("Expense posted");
  });
});

describe("STEP 4 lifecycle wiring sanity", () => {
  const source = read("app/maintenance-dashboard.tsx");
  const store = read("lib/booking-store.tsx");
  const model = read("lib/booking-model.ts");

  it("writes immutable audit entries on every lifecycle transition in the store", () => {
    expect(store).toContain("function maintenanceAuditEntry(");
    expect(store).toContain("maint-audit-");
    expect(store).toContain('"created"');
    expect(store).toContain('"started"');
    expect(store).toContain('"expense_posted"');
    expect(store).toContain('"cancelled"');
  });

  it("records actor roles by workspace rank in the store", () => {
    expect(store).toContain("actorRole");
    expect(store).toContain("maintenanceAuditLog");
  });

  it("persists the maintenance audit log in the data model and workspace sync", () => {
    expect(model).toContain("maintenanceAuditLog");
    const sync = read("lib/workspace-sync.ts");
    expect(sync).toContain("maintenanceAuditLog");
    const importData = read("lib/backup-import.ts");
    expect(importData).toContain("maintenanceAuditEntrySchema");
  });

  it("renders the executor and the per-task audit trail on the dashboard", () => {
    expect(source).toContain("منفّذ المهمة");
    expect(source).toContain("تم التنفيذ بواسطة");
    expect(source).toContain("سجل الإجراءات");
    expect(source).toContain("عرض سجل التدقيق");
    expect(source).toContain("maintenanceAuditLog");
  });
});

describe("STEP 5 refinement wiring", () => {
  const source = read("app/maintenance-dashboard.tsx");
  const store = read("lib/booking-store.tsx");
  const model = read("lib/booking-model.ts");
  const importData = read("lib/backup-import.ts");

  it("extends start, complete, and cancel RBAC to the caretaker in the store", () => {
    expect(store).toContain('if (!can("edit_bookings") && !isCaretaker) throw new Error("maintenance-management-forbidden")');
    expect(store).toContain('if (!can("edit_bookings") && !isCaretaker) throw new Error("maintenance-cancel-forbidden")');
    expect(store).toContain('if (!can("edit_bookings")) throw new Error("maintenance-management-forbidden")');
  });

  it("derives an operate gate from edit_bookings or the caretaker role in the dashboard", () => {
    expect(source).toContain("const canOperate = canManage || role === \"caretaker\"");
    expect(source).toContain("if (!canOperate || busy) return;");
    expect(source).toContain("canManage = can(\"edit_bookings\")");
  });

  it("models the all-units scope across the data layer", () => {
    expect(model).toContain("targetScope?: \"all_units\"");
    expect(model).toContain("chaletId: task.chaletId?.trim() || undefined");
    expect(model).toContain("blockBooking: task.blockBooking === true && task.targetScope !== \"all_units\"");
    expect(importData).toContain("targetScope: z.enum([\"all_units\"]).optional()");
  });

  it("renders the all-units scope and block-toggle guard in the task sheet", () => {
    expect(source).toContain("كافة الوحدات");
    expect(source).toContain("تشمل كافة الوحدات");
    expect(source).toContain("غير متاح لمهمة كافة الوحدات");
    expect(source).toContain('targetScope: resolved ? undefined : "all_units"');
  });

  it("guides the user toward a positive actual cost for auto posting", () => {
    expect(source).toContain("أدخل تكلفة فعلية أكبر من صفر لتفعيل الترحيل التلقائي للمصروفات.");
    expect(source).toContain("postExpense: value.trim() !== \"\" && Number(value) > 0");
  });

  it("confirms the cancel action with the explicit Arabic message", () => {
    expect(source).toContain("هل أنت متأكد من إلغاء هذه المهمة؟");
    expect(source).toContain("سيتم إتاحة الوحدة للحجز في التقويم");
  });
});

describe("STEP 6 action dropdown & unit filter wiring", () => {
  const source = read("app/maintenance-dashboard.tsx");
  const store = read("lib/booking-store.tsx");

  it("filters tasks by unit through a chip bar above the task list", () => {
    expect(source).toContain("const [unitFilter, setUnitFilter] = useState<string | null>(null);");
    expect(source).toContain("const visibleTasks = useMemo(");
    expect(source).toContain('task.targetScope === "all_units" || task.chaletId === unitFilter');
    expect(source).toContain('accessibilityLabel={language === "ar" ? "كافة الوحدات"');
    expect(source).toContain("chalets.map((chalet) =>");
    expect(source).toContain("لا توجد مهام صيانة لهذه الوحدة");
  });

  it("replaces the inline row with a primary action and a three-dots menu", () => {
    expect(source).toContain("const [menuFor, setMenuFor] = useState<string | null>(null);");
    expect(source).toContain('"more-vert"');
    expect(source).toContain('accessibilityLabel={language === "ar" ? "خيارات المهمة"');
    expect(source).toContain('"بدء العمل"');
    expect(source).toContain('"إتمام وإغلاق"');
    expect(source).toContain('accessibilityLabel={language === "ar" ? "عرض سجل التدقيق"');
    expect(source).toContain("task.status === \"scheduled\" && canManage");
  });

  it("locks editing once a task has started", () => {
    expect(source).toContain('task.status === "in_progress"');
    expect(source).toContain("لا يمكن تعديل تفاصيل مهمة بدأت بالفعل، يمكنك إتمامها أو إلغاؤها");
  });

  it("records cancellation with the responsible actor in the audit trail", () => {
    expect(store).toContain("تم إلغاء المهمة بواسطة ");
    expect(store).toContain('maintenanceAuditEntry(id, "cancelled"');
  });

  it("shows the audit log in an opaque centered card over a dark backdrop", () => {
    expect(source).toContain("auditOverlay");
    expect(source).toContain('backgroundColor: "rgba(0, 0, 0, 0.75)"');
    expect(source).toContain("auditCard");
    expect(source).toContain("maxWidth: 520");
  });
});

describe("STEP 7 archive tab & recurrence cadence filters", () => {
  const source = read("app/maintenance-dashboard.tsx");

  it("splits task tabs into active and completed archive with count badges", () => {
    expect(source).toContain('"active" | "archive" | "assets"');
    expect(source).toContain("المهام النشطة");
    expect(source).toContain("المهام المكتملة");
    expect(source).toContain("activeTasks.length");
    expect(source).toContain("stats.completed");
    expect(source).toContain('sortedTasks.filter((task) => task.status === "scheduled" || task.status === "in_progress")');
    expect(source).toContain('sortedTasks.filter((task) => task.status === "completed" || task.status === "cancelled")');
  });

  it("renders the single-row toolbar: quick search + unit & cadence dropdowns instead of chip strips", () => {
    expect(source).toContain("بحث سريع باسم المهمة أو الأصل");
    expect(source).toContain("const [searchQuery, setSearchQuery] = useState");
    expect(source).toContain("const [cadenceFilter, setCadenceFilter] = useState");
    expect(source).toContain("const [unitFilter, setUnitFilter] = useState<string | null>(null);");
    expect(source).toContain("قائمة الوحدات");
    expect(source).toContain("قائمة دورية الصيانة");
    expect(source).toContain("كافة الوحدات");
    expect(source).toContain("كافة الفترات");
    expect(source).toContain("يومية");
    expect(source).toContain("أسبوعية");
    expect(source).toContain("شهرية");
    expect(source).toContain("أخرى / موسمية");
    expect(source).toContain('matchesCadenceFilter(task.frequency, cadenceFilter)');
  });

  it("maps cadence buckets: other covers biweekly, custom, and once", () => {
    expect(source).toContain('cadence === "other" ? frequency === "biweekly" || frequency === "custom" || frequency === "once"');
  });

  it("renders archive cards with settlement badges and a single log action", () => {
    expect(source).toContain("archiveCard");
    expect(source).toContain("archiveLogBtn");
    expect(source).toContain("سجل الإجراءات");
    expect(source).toContain("تم التنفيذ بواسطة");
    expect(source).toContain("التكلفة");
    expect(source).toContain("سند صرف مرتبط");
    expect(source).toContain("تاريخ الإنجاز");
  });
});

describe("STEP 8 RTL tabs, single-row toolbar & recurring generation", () => {
  const source = read("app/maintenance-dashboard.tsx");
  const store = read("lib/booking-store.tsx");

  it("orders the tabs in strict RTL flow: assets right, active center, archive left", () => {
    const tabRowStart = source.indexOf("<View style={[styles.tabRow,");
    const tabRowEnd = source.indexOf("</View>", tabRowStart);
    const tabRow = source.slice(tabRowStart, tabRowEnd);
    expect(tabRow).toContain('name="inventory"');
    expect(tabRow.indexOf('name="list-alt"')).toBeGreaterThan(tabRow.indexOf('name="inventory"'));
    expect(tabRow).toContain('name="archive"');
    expect(tabRow.indexOf('name="archive"')).toBeGreaterThan(tabRow.indexOf('name="list-alt"'));
    expect(source).toContain("switchTab(\"assets\")");
  });

  it("selects multiple units via checkboxes and duplicates tasks per checked unit", () => {
    expect(source).toContain("الوحدات المستهدفة");
    expect(source).toContain("تحديد كافة الوحدات");
    expect(source).toContain("unitIds");
    expect(source).toContain('accessibilityRole="checkbox"');
    expect(source).toContain("for (const chaletId of targets)");
    expect(source).toContain('targetScope: resolved ? undefined : "all_units"');
  });

  it("duplicates assets per selected unit and gates saving on at least one selection", () => {
    expect(source).toContain("const targets = isEdit ? [draft.unitIds[0]] : draft.unitIds;");
    expect(source).toContain("if (!draft.name.trim() || !draft.unitIds.length) return;");
  });

  it("schedules the next occurrence on completion when the toggle is active (one-time tasks never recur)", () => {
    expect(source).toContain('scheduleNext: task.frequency === "once" ? false : true');
    expect(source).toContain("جدولة الاستحقاق القادم تلقائياً");
    expect(source).toContain("nextMaintenanceDueDate(completion.task)");
    expect(source).toContain("scheduleNext: completion.scheduleNext");
  });

  it("creates the recurring task in the store with scheduled status and its own audit entry", () => {
    expect(store).toContain("scheduleNext?: boolean");
    expect(store).toContain("const recurringTask: MaintenanceTask | undefined");
    expect(store).toContain('status: "scheduled" as const');
    expect(store).toContain("أُنشئت الدورة القادمة تلقائيًا");
  });
});

describe("STEP 9 floating action menu, RTL filter bar & compact card", () => {
  const source = read("app/maintenance-dashboard.tsx");

  it("renders the context menu as an absolutely-positioned floating popup, not an inline expanding row", () => {
    expect(source).toContain("menuAnchor");
    expect(source).toContain("floatMenu");
    expect(source).toContain("position: \"absolute\", left: 0, top: \"100%\", marginTop: 4, minWidth: 190");
    expect(source).toContain('accessibilityLabel={language === "ar" ? "إغلاق القائمة"');
    expect(source).toContain("style={StyleSheet.absoluteFill}");
    expect(source).not.toContain("menuPanel");
  });

  it("keeps the documented context-menu items: edit, cancel (red), and view audit trail", () => {
    expect(source).toContain('"تعديل المهمة"');
    expect(source).toContain('"إلغاء المهمة"');
    expect(source).toContain('"عرض سجل التدقيق"');
    expect(source).toContain("color={colors.error}");
  });

  it("nests the search icon inside the input bar and shows a clear button when text exists", () => {
    expect(source).toContain("بحث سريع باسم المهمة أو الأصل");
    expect(source).toContain('name="search"');
    expect(source).toContain("searchInput");
    expect(source).toContain('name="close"');
    expect(source).toContain("maxWidth: 480");
  });

  it("lays out the unified filter toolbar right-to-left: search then units then cadence", () => {
    const filterRowStart = source.indexOf("styles.filterRow");
    const filterRowEnd = source.indexOf("</View>", source.indexOf("قائمة دورية الصيانة"));
    const filterRow = source.slice(filterRowStart, filterRowEnd);
    expect(filterRow).toContain("searchInput");
    const searchIdx = filterRow.indexOf('name="search"');
    const unitIdx = filterRow.indexOf("قائمة الوحدات");
    const cadenceIdx = filterRow.indexOf("قائمة دورية الصيانة");
    expect(unitIdx).toBeGreaterThan(searchIdx);
    expect(cadenceIdx).toBeGreaterThan(unitIdx);
  });

  it("compacts the card: a right-side block (pill + menu) beside the action button, tightly spaced", () => {
    expect(source).toContain("cardSide");
    expect(source).toContain("cardSideTop");
    expect(source).toContain("badgeRow");
    expect(source).toContain("styles.statusPill");
    expect(source).toContain("styles.moreBtn");
    expect(source).toContain("styles.actionBtn");
  });
});

describe("STEP 10 floating overlays, form validation, audit modal & recurrence engine", () => {
  const source = read("app/maintenance-dashboard.tsx");
  const store = read("lib/booking-store.tsx");
  const model = read("lib/booking-model.ts");
  const maintenance = read("lib/maintenance.ts");
  const backupImport = read("lib/backup-import.ts");

  it("drops the toolbar dropdowns down out of flow at a high z-index and closes on outside click", () => {
    expect(source).toContain('top: "100%"');
    expect(source).toContain("zIndex: 50");
    expect(source).toContain('onPress={() => { setUnitMenuOpen(false); setCadenceMenuOpen(false); setMenuFor(null); }}');
    expect(source).toContain("unitMenuOpen || cadenceMenuOpen || menuFor");

    const toolbars = source.match(/styles\.toolbarMenu, \{ backgroundColor: colors\.surfaceMuted, borderColor: colors\.border, left: isRTL \? 0 : undefined, right: isRTL \? undefined : 0 \}/g) ?? [];
    expect(toolbars.length).toBeGreaterThanOrEqual(2);
  });

  it("localizes the recurrence model and treats one-time tasks as non-recurring", () => {
    expect(model).toContain('MaintenanceFrequency = "once" | "daily" | "weekly" | "biweekly" | "monthly" | "custom"');
    expect(maintenance).toContain('{ id: "once", label: ["اليوم فقط (مرة واحدة)", "Today only (one-time)"] }');
    expect(maintenance).toContain('if (task.frequency === "once") return 1;');
    expect(backupImport).toContain('z.enum(["once", "daily", "weekly", "biweekly", "monthly", "custom"])');
    expect(store).toContain('input.scheduleNext === true && task.frequency !== "once"');
  });

  it("defaults new tasks to once/today, leaves every unit unchecked, and shows the dynamic schedule notice", () => {
    expect(source).toContain('unitIds: [], allUnits: false, frequency: "once"');
    expect(source).toContain('frequencyHint(taskSheet.draft.frequency)');
    expect(source).toContain("styles.scheduleHint");
    expect(source).toContain("دون تكرار تلقائي");
  });

  it("renders the dynamic schedule explanation text for every recurrence option", () => {
    expect(source).toContain("ستُنفذ هذه المهمة لمرة واحدة فقط دون تكرار تلقائي.");
    expect(source).toContain("سيتكرر استحقاق هذه المهمة تلقائياً كل يوم للشاليهات المحددة فور إنجازها.");
    expect(source).toContain("سيتكرر استحقاق هذه المهمة تلقائياً كل أسبوع للشاليهات المحددة فور إنجازها.");
    expect(source).toContain("سيتكرر استحقاق هذه المهمة تلقائياً كل شهر للشاليهات المحددة فور إنجازها.");
    expect(source.match(/سيتكرر استحقاق هذه المهمة تلقائياً/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("shows the next-occurrence scheduling toggle only for recurring (non-once) tasks", () => {
    expect(source).toContain('completion.task.frequency !== "once" ? <Pressable accessibilityRole="button"');
    expect(source).toContain('scheduleNext: task.frequency === "once" ? false : true');
    expect(source).toContain("جدولة الاستحقاق القادم تلقائياً");
  });

  it("reports inline validation warnings when title or target units are missing on save", () => {
    expect(source).toContain("يرجى كتابة عنوان المهمة قبل الحفظ");
    expect(source).toContain("يرجى اختيار شاليه واحد على الأقل أو تحديد كافة الوحدات");
    expect(source).toContain("setTaskError(");
    expect(source).toContain('accessibilityLabel={language === "ar" ? "حفظ المهمة"');
    expect(source).toContain("disabled={saving} onPress={() => void saveTaskDraft()}");
    expect(source).toContain("styles.taskErrorBox");
  });

  it("renders each audit entry's action, user, role badge, and timestamp", () => {
    const locals = `const day = formatDate(entry.timestamp.slice(0, 10)) ?? entry.timestamp.slice(0, 10); const time = entry.timestamp.slice(11, 16); return \` · \${day}\${time ? \` · \${time}\` : ""}\`;`;
    expect(source).toContain("{maintenancePerformerRoleLabel(entry.userRole, language)}");
    expect(source).toContain('entry.userRole === "owner" ? colors.primary + "1A" : entry.userRole === "staff"');
    expect(source).toContain(locals);
  });
});

describe("FINAL STEP preventive-polish: vertical ellipsis, recurrence-cancel modal & card poles", () => {
  const source = read("app/maintenance-dashboard.tsx");
  const store = read("lib/booking-store.tsx");

  it("anchors the vertical ellipsis as the very last element (far-left in RTL) of the card row", () => {
    expect(source).toContain('"more-vert"');
    const optionsLabel = source.indexOf('accessibilityLabel={language === "ar" ? "خيارات المهمة"');
    const startWork = source.indexOf('accessibilityLabel={language === "ar" ? "بدء العمل"');
    const complete = source.indexOf('accessibilityLabel={language === "ar" ? "إتمام وإغلاق"');
    expect(optionsLabel).toBeGreaterThan(startWork);
    expect(optionsLabel).toBeGreaterThan(complete);
  });

  it("renders a solid opaque dark dropdown anchored under the ellipsis at a high z-index", () => {
    expect(source).toContain('backgroundColor: "#0f172a"');
    expect(source).toContain('borderColor: "rgba(51, 65, 85, 0.8)"');
    expect(source).toContain("marginTop: 4");
    expect(source).toContain("zIndex: 50");
  });

  it("keeps a plain confirm for one-time tasks and opens a dual-choice modal for recurring ones", () => {
    expect(source).toContain("هل أنت متأكد من إلغاء هذه المهمة؟");
    expect(source).toContain("إلغاء استحقاق اليوم فقط");
    expect(source).toContain("إلغاء وحذف الجدول المتكرر نهائياً");
    expect(source).toContain("إلغاء مهمة متكررة");
    expect(source).toContain('if (task.frequency === "once")');
  });

  it("wires instance-keep and series-terminate scopes into the store cancel action", () => {
    expect(store).toContain('cancelMaintenanceTask: (id: string, mode?: "instance" | "series")');
    expect(store).toContain('mode === "series"');
    expect(store).toContain("بعد إلغاء استحقاق اليوم");
    expect(store).toContain("إبقاء الجدولة المتكررة");
    expect(store).toContain("إنهاء الجدول المتكرر نهائياً");
  });
});

describe("ROLLER STEP: ultra-compact timeline strip & strict scope isolation", () => {
  const source = read("app/maintenance-dashboard.tsx");

  it("sits between the stats counters and the filter toolbar", () => {
    const statsIdx = source.indexOf("styles.statsRow");
    const rollerIdx = source.indexOf("styles.rollerStrip");
    const filterIdx = source.indexOf("styles.filterRow");
    expect(statsIdx).toBeGreaterThan(-1);
    expect(rollerIdx).toBeGreaterThan(statsIdx);
    expect(filterIdx).toBeGreaterThan(rollerIdx);
  });

  it("keeps the date chips ultra-compact at h-[60px] with day label, day number, and status dot", () => {
    expect(source).toContain("rollerChip");
    expect(source).toContain("minWidth: 50, maxWidth: 54, height: 60");
    expect(source).toContain("rollerDot");
    expect(source).toContain("ROLLER_WEEKDAYS");
    expect(source).toContain("date.slice(8, 10)");
  });

  it("shows the amber task dot ONLY on dates that actually have active maintenance tasks", () => {
    expect(source).toContain("activeTasks.some((task) => task.nextDueDate === date)");
    expect(source).toContain('backgroundColor: hasTaskOnDate ? "#F59E0B" : "transparent"');
    expect(source).not.toContain("overdue ? colors.error : colors.warning");
  });

  it("renders the compact horizon switcher: today, next 7 / 30 days, all, and a custom range picker", () => {
    expect(source).toContain('"اليوم"');
    expect(source).toContain('"خلال 7 أيام"');
    expect(source).toContain('"خلال 30 يوماً"');
    expect(source).toContain('"الكل"');
    expect(source).toContain("من - إلى");
    expect(source).toContain("CalendarDateField");
    expect(source).toContain('accessibilityLabel={language === "ar" ? "فترة مخصصة"');
  });

  it("filters the task list live by due date and toggles selection back to all", () => {
    expect(source).toContain("task.nextDueDate === dateFilter");
    expect(source).toContain('if (dateFilter !== null) return task.nextDueDate === dateFilter;');
    expect(source).toContain("setDateFilter(framed && singleSelected ? null : date)");
  });
});

describe("ROLLER STEP: continuous strip & independent horizon filtering", () => {
  const source = read("app/maintenance-dashboard.tsx");

  it("keeps the strip continuous regardless of the horizon filter (never collapses to 1 or 7 chips)", () => {
    expect(source).toContain("الشريط الزمني مستمر دائماً");
    expect(source).toContain("addDays(todayISO, 29)");
    expect(source).not.toContain('if (rollerRange.kind === "today") return [todayISO]');
    expect(source).not.toContain('if (rollerRange.kind === "7") return buildDateRange');
  });

  it("decouples the horizon preset from the strip and applies it only to the task list", () => {
    expect(source).toContain("setHorizon(id);");
    expect(source).toContain("setDateFilter(null);");
    expect(source).toContain('if (horizon === "today") return task.nextDueDate === todayISO;');
    expect(source).toContain('if (horizon === "7") return task.nextDueDate >= todayISO && task.nextDueDate <= addDays(todayISO, 6);');
    expect(source).toContain('if (horizon === "30") return task.nextDueDate >= todayISO && task.nextDueDate <= addDays(todayISO, 29);');
  });

  it("highlights the current horizon window and today on the always-visible strip", () => {
    expect(source).toContain('const inWindow = dateFilter === null &&');
    expect(source).toContain("const isToday = date === todayISO;");
    expect(source).toContain('const framed = isToday || singleSelected;');
  });

  it("clicking an individual date chip sets the filter strictly to that single date", () => {
    expect(source).toContain("singleSelected = dateFilter === date");
    expect(source).toContain("setDateFilter(framed && singleSelected ? null : date)");
  });
});

describe("ROLLER STEP: unified tiles, floating popover & card flow polish", () => {
  const source = read("app/maintenance-dashboard.tsx");

  it("renders every date in a uniform bordered tile (50-54w x 60h, rounded), never a bare floating number", () => {
    expect(source).toContain("minWidth: 50, maxWidth: 54, height: 60");
    expect(source).toContain("borderRadius: 14");
    expect(source).toContain("borderWidth: 1");
  });

  it("reserves the framed box for Today and prints 'اليوم' inside the tile instead of a floating badge", () => {
    expect(source).toContain('const framed = isToday || singleSelected;');
    expect(source).toContain('backgroundColor: colors.primary + "1A", borderColor: colors.primary + "CC"');
    expect(source).toContain('const topLabel = isToday ? (language === "ar" ? "اليوم" : "Today") : weekday;');
    expect(source).not.toContain("rollerTodayBadge");
  });

  it("adds smooth forward/backward scroll arrows that nudge the strip", () => {
    expect(source).toContain("nudgeRoller(320)");
    expect(source).toContain("nudgeRoller(-320)");
    expect(source).toContain("rollerArrow");
    expect(source).toContain("onScroll={(event) =>");
    expect(source).toContain("rollerOffsetRef.current = event.nativeEvent.contentOffset.x");
  });

  it("extends the continuous strip up to ~+60 days into the future", () => {
    expect(source).toContain("addDays(todayISO, 59)");
  });

  it("decouples the من - إلى range into a centered 100% opaque full-screen modal, never an inline popover", () => {
    expect(source).not.toContain("rollerRangePanel:");
    expect(source).not.toContain("rollerActionGhost:");
    expect(source).toContain("rangeModalBackdrop: { flex: 1, backgroundColor: \"rgba(0, 0, 0, 0.75)\"");
    expect(source).toContain("alignItems: \"center\", justifyContent: \"center\"");
    expect(source).toContain("rangeModalCard");
    expect(source).toContain('backgroundColor: "#0f172a"');
    expect(source).toContain('borderColor: "rgba(51, 65, 85, 0.9)"');
    expect(source).toContain("تحديد الفترة الزمنية");
    expect(source).toContain("من تاريخ");
    expect(source).toContain("إلى تاريخ");
    expect(source).toContain("تطبيق الفلترة");
    expect(source).toContain("<Modal visible={rangePanelOpen}");
    expect(source).toContain("onRequestClose={() => setRangePanelOpen(false)}");
    expect(source).toContain("StyleSheet.absoluteFill");
  });

  it("HOTFIX: renders the range modal shell with a strictly solid slate-900 background, opacity 1, and centered backdrop", () => {
    const cardLine = source.split("\n").find((line) => line.includes("rangeModalCard:"));
    expect(cardLine).toBeDefined();
    expect(cardLine).toContain("opacity: 1");
    expect(cardLine).toContain('maxWidth: 380');
    expect(cardLine).toContain("padding: 20");
    expect(source).toContain('style={[styles.rangeModalCard, { backgroundColor: "#0f172a"');
    expect(source).not.toContain('colors.surface, borderColor: colors.border }]}"><MaterialIcons name="date-range"');
  });

  it("HOTFIX: dims and captures outside taps with a full-screen backdrop so the toolbar dropdowns close cleanly", () => {
    expect(source).toContain('clickAway: { zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.2)" }');
    expect(source).toContain("content: { padding: 16, paddingBottom: 120, flexGrow: 1 }");
    expect(source).toContain('onPress={() => { setUnitMenuOpen(false); setCadenceMenuOpen(false); setMenuFor(null); }}');
    expect(source).toContain("StyleSheet.absoluteFill");
  });
});