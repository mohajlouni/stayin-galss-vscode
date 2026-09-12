import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Dimensions, FlatList, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, ToastAndroid, View, type LayoutChangeEvent } from "react-native";
import { confirmAction, showAlert } from "@/lib/confirm";

import { CalendarDatePicker } from "@/components/calendar-date-picker";
import { normalizeArabic } from "@/components/ui/HighlightedText";
import { HighlightedText } from "@/components/ui/HighlightedText";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { RipplePressable } from "@/components/ripple-pressable";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { EXPENSE_CATEGORIES, EXPENSE_FUNDING_CHANNELS, EXPENSE_FUNDING_ENTITIES, activeOwnerTreasuryAccounts, activeStaffFloatAccounts, expenseFundingChannelLabel, expenseFundingEntityLabel, splitExpenseAcrossChalets, type Expense, type ExpenseCategory, type ExpenseFundingChannel, type ExpenseFundingEntity, type ExpensePaymentMethod, formatMoney, todayISO, weekdayLabel, addDays } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useChaletScope } from "@/lib/chalet-scope";
import { persistExpenseReceipt } from "@/lib/expense-receipt";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import AsyncStorage from "@react-native-async-storage/async-storage";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

const EXPENSE_TEMPLATES_KEY = "stayin.expenses.templates.v1";
type ExpenseTemplate = { id: string; title: string; category?: ExpenseCategory | null; note?: string; amount?: string; paymentMethod?: ExpensePaymentMethod | null; fundingEntity?: ExpenseFundingEntity | null; fundingChannel?: ExpenseFundingChannel | null };

function expenseSearchText(expense: Expense, language: "ar" | "en"): string {
  const categoryLabel = CATEGORY_META[expense.category];
  const parts: string[] = [
    expense.note ?? "",
    categoryLabel.ar,
    categoryLabel.en,
    expense.chaletName ?? "",
    expense.fundingSourceLabel ?? "",
    expense.paymentMethod ?? "",
    expense.createdByName ?? "",
    `${expense.amount}`,
  ];
  if (expense.generalAllocations?.length) parts.push(language === "ar" ? "مصروف عام" : "shared expense");
  if (expense.isFloatExpense) parts.push(language === "ar" ? "خصم من عهدة" : "float deduction");
  if (expense.isStaffReimbursement) parts.push(language === "ar" ? "ذمة للموظف" : "staff reimbursement");
  return parts.join(" ");
}

const CATEGORY_META: Record<ExpenseCategory, { ar: string; en: string; icon: IconName }> = {
  maintenance: { ar: "صيانة وتشغيل", en: "Maintenance & operations", icon: "build" },
  "fuel-gas": { ar: "محروقات وغاز", en: "Fuel & gas", icon: "local-gas-station" },
  "cleaning-supplies": { ar: "مواد نظافة ومسبح", en: "Cleaning & pool supplies", icon: "cleaning-services" },
  utilities: { ar: "كهرباء ومياه", en: "Electricity & water", icon: "bolt" },
  hospitality: { ar: "ضيافة", en: "Hospitality", icon: "room-service" },
  "guards-salaries": { ar: "رواتب ومكافآت", en: "Salaries & bonuses", icon: "badge" },
  other: { ar: "أخرى", en: "Other", icon: "receipt-long" },
};

const FUNDING_MODE_META = {
  owner: { ar: "خزينة رئيسية", en: "Central treasury", icon: "account-balance" },
  float: { ar: "خصم من عهدة", en: "Float deduction", icon: "account-balance-wallet" },
  reimbursement: { ar: "ذمة للموظف", en: "Due to staff", icon: "payments" },
} as const;
type FundingMode = keyof typeof FUNDING_MODE_META;

function fundingModeFor(expense: Expense): FundingMode {
  if (expense.fundingEntity === "staff" && expense.isStaffReimbursement === true) return "reimbursement";
  if (expense.fundingEntity === "staff" && expense.isFloatExpense === true) return "float";
  return "owner";
}

type ExpensePeriod = "today" | "7" | "month" | "custom" | "all";
type DisplayExpense = Expense & { sharedExpenseTotal?: number; sharedUnitsCount?: number };
type LedgerRow = { kind: "header"; date: string } | { kind: "item"; item: DisplayExpense };

type ExpenseDropdownOpen = { kind: "scope" } | { kind: "category" } | { kind: "funding" } | { kind: "channel" } | { kind: "staff" } | { kind: "staffMode" } | null;

function formatRecordedAt(value: string, language: "ar" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString(language === "ar" ? "ar-JO" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })} · ${date.toLocaleTimeString(language === "ar" ? "ar-JO" : "en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

const STAFF_MODE_OPTIONS: { id: "float" | "reimbursement"; ar: string; en: string; icon: IconName }[] = [
  { id: "float", ar: "من العُهدة النقدية المعلقة", en: "From the held cash float", icon: "account-balance-wallet" },
  { id: "reimbursement", ar: "دفع من الجيب الخاص للموظف", en: "Paid from the staff pocket", icon: "payments" },
];

const PERIOD_FILTERS: { id: "today" | "7" | "month" | "custom" | "all"; ar: string; en: string }[] = [
  { id: "today", ar: "اليوم", en: "Today" },
  { id: "7", ar: "خلال 7 أيام", en: "Last 7 days" },
  { id: "month", ar: "هذا الشهر", en: "This month" },
  { id: "custom", ar: "فترة مخصصة", en: "Custom range" },
  { id: "all", ar: "كافة الفترات", en: "All periods" },
];

/** أيام الأسبوع المختصرة لشريط الأيام الأفقي في المصروفات (مطابق لروح شريط الصيانة). */
const STRIP_WEEKDAYS: Record<"ar" | "en", string[]> = {
  ar: ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

/** ربط نقر الفأرة الأصلي (ويب) مع إيقاف التصعيد؛ يُنشر داخل Pressable لضمان التوافق عبر المنصات. */
const mouseClick = (action: () => void) => ({ onClick: (event: { stopPropagation?: () => void }) => { event?.stopPropagation?.(); action(); } });

export default function ExpensesScreen() {
  const { expenses = [], chalets, settings, addExpense, updateExpense, deleteExpense, maintenanceTasks = [] } = useBookings();
  const { selectedChaletId, setSelectedChaletId } = useChaletScope();
  const { language, isRTL } = useI18n();
  const { triggerHaptic, formatDate } = useAppPreferences();
  const { can, user } = useWorkspaceAccess();
  const colors = useColors();
  const [modalOpen, setModalOpen] = useState(false);
  const [receiptPreviewUri, setReceiptPreviewUri] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [selectedChaletIds, setSelectedChaletIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "click" | null>(null);
  const [fundingEntity, setFundingEntity] = useState<ExpenseFundingEntity | null>(null);
  const [fundingChannel, setFundingChannel] = useState<ExpenseFundingChannel | null>(null);
  const [ownerAccountId, setOwnerAccountId] = useState<string | null>(null);
  const [staffFloatId, setStaffFloatId] = useState<string | null>(null);
  const [staffMode, setStaffMode] = useState<"float" | "reimbursement" | null>(null);
  const [receiptUri, setReceiptUri] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [dropdown, setDropdown] = useState<ExpenseDropdownOpen>(null);
  const [scopeError, setScopeError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const [noteError, setNoteError] = useState(false);
  const [fundingError, setFundingError] = useState(false);
  const [channelError, setChannelError] = useState(false);
  const [staffError, setStaffError] = useState(false);
  const [staffModeError, setStaffModeError] = useState(false);
  const [otherCategoryNote, setOtherCategoryNote] = useState("");
  const [otherCategoryError, setOtherCategoryError] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [expenseTemplates, setExpenseTemplates] = useState<ExpenseTemplate[]>([]);
  const [period, setPeriod] = useState<ExpensePeriod>("month");
  const [todayAnchor, setTodayAnchor] = useState(todayISO());
  const [monthAnchor, setMonthAnchor] = useState(todayISO().slice(0, 7));
  const [weekAnchor, setWeekAnchor] = useState(todayISO());
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stripCenter, setStripCenter] = useState(todayISO());
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [scopeMenuSide, setScopeMenuSide] = useState<"left" | "right">("right");
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [periodMenuSide, setPeriodMenuSide] = useState<"left" | "right">("right");
  const formScrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Record<string, number>>({});
  const registerField = (key: string) => (event: LayoutChangeEvent) => {
    fieldOffsets.current[key] = event.nativeEvent.layout.y;
  };
  const scrollToField = (key: string) => formScrollRef.current?.scrollTo({ y: Math.max(0, fieldOffsets.current[key] - 8), animated: true });
  const beginSubmit = () => {
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setIsSubmitting(true);
    return true;
  };
  const endSubmit = () => {
    submittingRef.current = false;
    setIsSubmitting(false);
  };
  const isArabicLayout = language === "ar" || isRTL;
  const align = isArabicLayout ? "right" : "left";
  const row = isArabicLayout ? "row-reverse" : "row";
  const winWidth = Dimensions.get("window").width;
  const ownerAccounts = useMemo(() => activeOwnerTreasuryAccounts(settings), [settings]);
  const staffFloats = useMemo(() => activeStaffFloatAccounts(settings), [settings]);
  const channelAccounts = fundingChannel === "cliq" ? ownerAccounts.filter((account) => account.kind === "cliq") : fundingChannel === "iban" ? ownerAccounts.filter((account) => account.kind === "bank") : [];
  const allChaletsSelected = chalets.length > 0 && selectedChaletIds.length === chalets.length;
  const staffFloatLabel = staffFloatId ? staffFloats.find((account) => account.id === staffFloatId)?.label ?? null : null;
  const staffModeLabel = staffMode ? (STAFF_MODE_OPTIONS.find((option) => option.id === staffMode)?.[language === "ar" ? "ar" : "en"] ?? null) : null;
  const scopedExpenses = useMemo<DisplayExpense[]>(() => {
    const sharedLabel = language === "ar" ? "مصروف عام" : "Shared expense";
    return !selectedChaletId ? expenses.map((expense) => expense.generalAllocations?.length ? { ...expense, chaletId: "shared-expense-parent", chaletName: sharedLabel } : expense) : expenses.flatMap((expense) => {
      if (expense.chaletId === selectedChaletId) return [expense];
      const allocation = expense.generalAllocations?.find((item) => item.chaletId === selectedChaletId);
      return allocation ? [{ ...expense, chaletId: allocation.chaletId, chaletName: language === "ar" ? `جزء من مصروف عام · ${formatMoney(expense.amount, settings.currency)}` : `Share of ${formatMoney(expense.amount, settings.currency)} general expense`, amount: allocation.amount, sharedExpenseTotal: expense.amount, sharedUnitsCount: expense.generalAllocations?.length }] : [];
    });
  }, [expenses, language, selectedChaletId, settings.currency]);
  /** تواريخ الأيام التي تحتوي مصروفات ضمن نطاق الشاليه الحالي (لنقاط شريط الأيام). */
  const scopedDateSet = useMemo(() => new Set(scopedExpenses.map((expense) => expense.date || expense.createdAt.slice(0, 10))), [scopedExpenses]);
  const visibleExpenses = useMemo<DisplayExpense[]>(() => scopedExpenses.filter((expense) => {
      const date = expense.date || expense.createdAt.slice(0, 10);
      if (period === "today") return date === todayAnchor;
      if (period === "7") {
        const start = addDays(weekAnchor, -6);
        return date >= start && date <= weekAnchor;
      }
      if (period === "custom") return date >= customStart && date <= customEnd;
      if (period === "all") return true;
      return date.startsWith(monthAnchor);
    }).filter((expense) => {
      const query = normalizeArabic(searchQuery);
      if (!query) return true;
      return normalizeArabic(expenseSearchText(expense, language)).includes(query);
    }).sort((left, right) => (right.date || right.createdAt.slice(0, 10)).localeCompare(left.date || left.createdAt.slice(0, 10)) || right.createdAt.localeCompare(left.createdAt)), [scopedExpenses, period, customStart, customEnd, todayAnchor, weekAnchor, monthAnchor, searchQuery]);
  /** نافذة 14 يومًا ممركزة على التاريخ النشط لشريط الأيام الأفقي. */
  const expenseStripDates = useMemo(() => {
    const out: string[] = [];
    let cursor = addDays(stripCenter, -2);
    while (out.length < 14) {
      out.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return out;
  }, [stripCenter]);
  const ledgerRows = useMemo<LedgerRow[]>(() => {
    const rows: LedgerRow[] = [];
    let lastDate = "";
    for (const item of visibleExpenses) {
      const date = item.date || item.createdAt.slice(0, 10);
      if (date !== lastDate) {
        rows.push({ kind: "header", date });
        lastDate = date;
      }
      rows.push({ kind: "item", item });
    }
    return rows;
  }, [visibleExpenses]);
  const total = visibleExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const periodTreasuryTotal = visibleExpenses.filter((expense) => expense.fundingEntity !== "staff").reduce((sum, expense) => sum + expense.amount, 0);
  const periodFloatTotal = visibleExpenses.filter((expense) => expense.isFloatExpense === true).reduce((sum, expense) => sum + expense.amount, 0);
  const periodReimbursementTotal = visibleExpenses.filter((expense) => expense.isStaffReimbursement === true).reduce((sum, expense) => sum + expense.amount, 0);
  const loggedBy = user?.name?.trim() || (language === "ar" ? "مستخدم التطبيق" : "App user");

  useEffect(() => {
    void ImagePicker.getPendingResultAsync().then((result) => {
      if (!result || "code" in result || result.canceled || !result.assets?.[0]?.uri) return;
      setReceiptUri(result.assets[0].uri);
      setModalOpen(true);
    });
    void AsyncStorage.getItem(EXPENSE_TEMPLATES_KEY).then((raw) => {
      if (raw) {
        try { setExpenseTemplates(JSON.parse(raw) as ExpenseTemplate[]); } catch { /* ignore */ }
      }
    }).catch(() => { /* ignore */ });
  }, []);

  const resetForm = () => {
    setAmount("");
    setNote("");
    setExpenseDate(todayISO());
    setDatePickerOpen(false);
    setCategory(null);
    setSelectedChaletIds([]);
    setPaymentMethod(null);
    setFundingEntity(null);
    setFundingChannel(null);
    setOwnerAccountId(null);
    setStaffFloatId(null);
    setStaffMode(null);
    setOtherCategoryNote("");
    setOtherCategoryError(false);
    setSaveAsTemplate(false);
    setReceiptUri(undefined);
    setEditingExpenseId(null);
    setDropdown(null);
    setScopeError(false);
    setAmountError(false);
    setCategoryError(false);
    setNoteError(false);
    setFundingError(false);
    setChannelError(false);
    setStaffError(false);
    setStaffModeError(false);
  };
  const openForm = () => {
    resetForm();
    setModalOpen(true);
  };
  const applyTemplate = (template: ExpenseTemplate) => {
    if (template.category) { setCategory(template.category); setCategoryError(false); setOtherCategoryError(false); }
    if (template.note) { setNote(template.note); setNoteError(false); }
    if (template.amount !== undefined && template.amount !== null) { setAmount(template.amount); setAmountError(false); }
    if (template.paymentMethod === "cash" || template.paymentMethod === "click") { setPaymentMethod(template.paymentMethod); }
    if (template.fundingEntity) { setFundingEntity(template.fundingEntity); setFundingError(false); setStaffMode(null); setStaffError(false); }
    if (template.fundingChannel) { setFundingChannel(template.fundingChannel); setChannelError(false); }
  };
  const openEdit = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setSelectedChaletIds(expense.generalAllocations?.length ? expense.generalAllocations.map((allocation) => allocation.chaletId) : expense.chaletId && expense.chaletId !== "shared-expense-parent" ? [expense.chaletId] : chalets.map((chalet) => chalet.id));
    setAmount(expense.amount ? `${expense.amount}` : "");
    setCategory(expense.category);
    setNote(expense.note ?? "");
    setExpenseDate(expense.date || todayISO());
    setPaymentMethod(expense.paymentMethod === "iban" ? null : (expense.paymentMethod ?? null));
    setFundingEntity(expense.fundingEntity ?? null);
    setFundingChannel(expense.fundingChannel ?? null);
    setOwnerAccountId(expense.fundingEntity === "owner" ? (expense.fundingSourceId ?? null) : null);
    setStaffFloatId(expense.fundingEntity === "staff" ? (expense.fundingSourceId ?? null) : null);
    setStaffMode(expense.isFloatExpense ? "float" : expense.isStaffReimbursement ? "reimbursement" : null);
    setOtherCategoryNote("");
    setOtherCategoryError(false);
    setReceiptUri(expense.receiptUri);
    setDropdown(null);
    setScopeError(false);
    setAmountError(false);
    setCategoryError(false);
    setNoteError(false);
    setFundingError(false);
    setChannelError(false);
    setStaffError(false);
    setStaffModeError(false);
    setModalOpen(true);
  };
  const toggleChalet = (id: string) => {
    setScopeError(false);
    setSelectedChaletIds((current) => (current.includes(id) ? current.filter((chaletId) => chaletId !== id) : [...current, id]));
  };
  const toggleAllChalets = () => {
    setScopeError(false);
    setSelectedChaletIds((current) => (current.length === chalets.length ? [] : chalets.map((chalet) => chalet.id)));
  };
  const applyRange = ({ start, end }: DateRange) => {
    setCustomStart(start);
    setCustomEnd(end);
    setRangePickerOpen(false);
  };
  /** اختيار يوم من شريط الأيام: يزامن الفلتر مع خلاصة المصروفات ويكرّ النافذة حوله. */
  const selectStripDay = (date: string) => {
    setPeriod("today");
    setTodayAnchor(date);
    setStripCenter(date);
  };
  /** إزاحة نافذة الشريط بمقدار 7 أيام (خطوة أسبوع كامل). */
  const nudgeStrip = (direction: 1 | -1) => {
    setStripCenter((current) => addDays(current, direction * 7));
  };
  /** يحسب اتجاه فتح قائمة الوحدات من مركز المرساة: إذا كانت في النصف الأيسر تُفتح لليمين والعكس، كي لا تتجاوز حافة الشاشة. */
  const measureScopeSide = (event: LayoutChangeEvent) => {
    const left = 16 + event.nativeEvent.layout.x;
    const width = event.nativeEvent.layout.width;
    setScopeMenuSide(left + width / 2 < winWidth / 2 ? "left" : "right");
  };
  /** يحسب اتجاه فتح قائمة الفترات (مطابق لمنطق قائمة الوحدات). */
  const measurePeriodSide = (event: LayoutChangeEvent) => {
    const left = 16 + event.nativeEvent.layout.x;
    const width = event.nativeEvent.layout.width;
    setPeriodMenuSide(left + width / 2 < winWidth / 2 ? "left" : "right");
  };
  /** يطبق فترة من القائمة المنسدلة بنفس منطق حبوب التواريخ أعلاه. */
  const applyPeriodFilter = (id: "today" | "7" | "month" | "custom" | "all") => {
    if (id === "today") { setTodayAnchor(todayISO()); setStripCenter(todayISO()); }
    if (id === "7") setWeekAnchor(todayISO());
    if (id === "month") setMonthAnchor(todayISO().slice(0, 7));
    setPeriod(id);
    setPeriodMenuOpen(false);
    if (id === "custom") setRangePickerOpen(true);
  };
  /** نص عنوان قائمة الفترات للمنسدلة الجديدة. */
  const periodMenuLabel = period === "today" ? (language === "ar" ? "اليوم" : "Today") : period === "7" ? (language === "ar" ? "خلال 7 أيام" : "Last 7 days") : period === "custom" ? (language === "ar" ? "فترة مخصصة" : "Custom range") : period === "all" ? (language === "ar" ? "كافة الفترات" : "All periods") : (language === "ar" ? "هذا الشهر" : "This month");
  const notifyExpenseSaved = () => {
    const message = language === "ar" ? "تم حفظ المصروف بنجاح" : "Expense saved successfully";
    if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
    else showAlert(language === "ar" ? "تم الحفظ" : "Saved", message);
  };
  const chooseReceipt = async (source: "camera" | "library") => {
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showAlert(language === "ar" ? "إذن الكاميرا مطلوب" : "Camera permission required", language === "ar" ? "اسمح للكاميرا لالتقاط صورة الفاتورة." : "Allow camera access to take a receipt photo.");
          return;
        }
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.75 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.75 });
      if (!result.canceled && result.assets[0]?.uri) setReceiptUri(result.assets[0].uri);
    } catch {
      showAlert(language === "ar" ? "تعذر إرفاق الوصل" : "Could not attach receipt", language === "ar" ? "حاول اختيار الصورة مرة أخرى." : "Try selecting the image again.");
    }
  };
  const save = async () => {
    if (submittingRef.current) return;
    if (!selectedChaletIds.length) {
      setScopeError(true);
      scrollToField("scope");
      showAlert(language === "ar" ? "اختر نطاق المصروف" : "Choose expense scope", language === "ar" ? "اختر شاليهًا واحدًا على الأقل قبل إدخال المبلغ." : "Choose at least one chalet before entering the amount.");
      return;
    }
    const numeric = Number(amount.replace(",", "."));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setAmountError(true);
      scrollToField("amount");
      showAlert(language === "ar" ? "مبلغ غير صحيح" : "Invalid amount", language === "ar" ? "أدخل مبلغ مصروف أكبر من صفر." : "Enter an expense amount greater than zero.");
      return;
    }
    if (!category) {
      setCategoryError(true);
      scrollToField("category");
      showAlert(language === "ar" ? "اختر التصنيف" : "Choose a category", language === "ar" ? "يرجى اختيار تصنيف المصروف قبل المتابعة." : "Please choose the expense category first.");
      return;
    }
    if (category === "other" && otherCategoryNote.trim().length < 3) {
      setOtherCategoryError(true);
      scrollToField("otherCategory");
      showAlert(language === "ar" ? "صنّف المصروف" : "Classify the expense", language === "ar" ? "اكتب نوع وتصنيف هذا المصروف (3 أحرف على الأقل)." : "Describe this custom expense type (at least 3 characters).");
      return;
    }
    if (!fundingEntity) {
      setFundingError(true);
      scrollToField("funding");
      showAlert(language === "ar" ? "اختر مصدر التمويل" : "Choose funding source", language === "ar" ? "حدد جهة التمويل: الخزينة المركزية للمالك أو عهدة موظف / حارس ميداني." : "Choose the funding entity: the owner treasury or a staff float.");
      return;
    }
    const staffEntity = fundingEntity === "staff";
    if (staffEntity) {
      if (!staffFloatId) {
        setStaffError(true);
        scrollToField("staff");
        showAlert(language === "ar" ? "اختر عهدة الموظف" : "Choose a staff float", language === "ar" ? "حدد الموظف / الحارس الذي سيدفع المصروف." : "Select the staff member who will pay this expense.");
        return;
      }
      if (!staffMode) {
        setStaffModeError(true);
        scrollToField("staffMode");
        showAlert(language === "ar" ? "اختر طريقة السداد" : "Choose how the staff pays", language === "ar" ? "حدد هل يُخصم من العهدة النقدية أم دُفع من جيب الموظف." : "Choose whether it is deducted from the held float or paid from the staff pocket.");
        return;
      }
    } else if (!fundingChannel) {
      setChannelError(true);
      scrollToField("channel");
      showAlert(language === "ar" ? "اختر طريقة الصرف" : "Choose payment method", language === "ar" ? "حدد كاش أو تحويل CliQ قبل حفظ المصروف." : "Choose Cash or CliQ transfer before saving the expense.");
      return;
    } else if (fundingChannel !== "vault-cash" && !ownerAccountId) {
      setChannelError(true);
      scrollToField("channel");
      showAlert(language === "ar" ? "اختر حساب الخزينة" : "Choose a treasury account", language === "ar" ? "حدد الحساب المفعل الذي سيُحمَّل عليه المصروف." : "Select the active account the expense will be charged to.");
      return;
    }
    if (note.trim().length < 3) {
      setNoteError(true);
      scrollToField("note");
      showAlert(language === "ar" ? "البيان مطلوب" : "Description required", language === "ar" ? "أدخل بيانًا إلزاميًا للمصروف (3 أحرف على الأقل)." : "Enter a required description (at least 3 characters).");
      return;
    }
    const normalizedDate = expenseDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || Number.isNaN(new Date(`${normalizedDate}T00:00:00.000Z`).getTime())) {
      showAlert(language === "ar" ? "تاريخ صرف غير صحيح" : "Invalid expense date", language === "ar" ? "حدد تاريخًا صحيحًا للمصروف." : "Choose a valid expense date.");
      return;
    }
    const scopedChalets = chalets.filter((item) => selectedChaletIds.includes(item.id));
    if (!scopedChalets.length) {
      showAlert(language === "ar" ? "اختر شاليهًا" : "Choose a chalet", language === "ar" ? "اختر الشاليه المرتبط بهذا المصروف للمتابعة." : "Choose the chalet related to this expense to continue.");
      return;
    }
    const chalet = scopedChalets.length === 1 ? scopedChalets[0] : undefined;
    const generalAllocations = scopedChalets.length > 1 ? splitExpenseAcrossChalets(numeric, scopedChalets) : undefined;
    if (scopedChalets.length > 1 && !generalAllocations?.length) {
      showAlert(language === "ar" ? "لا توجد وحدات" : "No units available", language === "ar" ? "أضف وحدة واحدة على الأقل قبل تسجيل مصروف عام." : "Add at least one unit before recording a shared expense.");
      return;
    }
    const resolvedPaymentMethod: ExpensePaymentMethod | undefined = !staffEntity ? (fundingChannel === "vault-cash" ? "cash" : fundingChannel === "cliq" ? "click" : undefined) : undefined;
    const ownerAccount = !staffEntity && ownerAccountId ? ownerAccounts.find((account) => account.id === ownerAccountId) : undefined;
    const staffFloat = staffEntity && staffFloatId ? staffFloats.find((account) => account.id === staffFloatId) : undefined;
    const fundingChannelValue = !staffEntity ? fundingChannel ?? undefined : undefined;
    const fundingSourceId = !staffEntity ? (fundingChannel === "vault-cash" ? undefined : ownerAccount?.id) : staffFloat?.id;
    const fundingSourceLabel = !staffEntity ? ownerAccount?.label : staffFloat?.label;
    const receiptKey = `expense-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (!beginSubmit()) return;
    try {
      const managedReceiptUri = await persistExpenseReceipt(receiptUri, receiptKey);
      const payload = { chaletId: chalet?.id, chaletName: chalet?.name, generalAllocations, amount: numeric, date: normalizedDate, category, note: category === "other" && otherCategoryNote.trim() ? (note.trim() ? `${otherCategoryNote.trim()} — ${note.trim()}` : otherCategoryNote.trim()) : note.trim(), paymentMethod: resolvedPaymentMethod, receiptUri: managedReceiptUri, fundingEntity: fundingEntity ?? undefined, fundingChannel: fundingChannelValue, fundingSourceId, fundingSourceLabel, isFloatExpense: staffEntity && staffMode === "float" ? true : undefined, isStaffReimbursement: staffEntity && staffMode === "reimbursement" ? true : undefined };
      if (editingExpenseId) await updateExpense(editingExpenseId, payload);
      else await addExpense(payload);
      if (saveAsTemplate && !editingExpenseId) {
        const templateTitle = (category === "other" && otherCategoryNote.trim() ? otherCategoryNote.trim() : note.trim()).slice(0, 40);
        const template: ExpenseTemplate = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: templateTitle, category, note: note.trim() || undefined, amount, paymentMethod: resolvedPaymentMethod ?? null, fundingEntity: fundingEntity ?? null, fundingChannel: !staffEntity ? (fundingChannel ?? null) : null };
        setExpenseTemplates((prev) => { const next = [template, ...prev].slice(0, 12); void AsyncStorage.setItem(EXPENSE_TEMPLATES_KEY, JSON.stringify(next)).catch(() => { /* ignore */ }); return next; });
      }
      void triggerHaptic(); setModalOpen(false);
      notifyExpenseSaved();
      resetForm();
    } catch {
      showAlert(language === "ar" ? "تعذر الحفظ" : "Could not save", language === "ar" ? "لا تملك صلاحية إضافة المصروف أو تعذر الحفظ." : "You do not have permission to add this expense or it could not be saved.");
    } finally {
      endSubmit();
    }
  };
  const remove = (expense: Expense) => {
    const linkedTaskTitle = expense.maintenanceTaskId ? maintenanceTasks.find((task) => task.id === expense.maintenanceTaskId)?.title : undefined;
    confirmAction({
      title: language === "ar" ? "حذف المصروف" : "Delete expense",
      message: language === "ar" ? (linkedTaskTitle ? `هذا المصروف مرتبط بمهمة صيانة مكتملة (${linkedTaskTitle}). هل تريد حذف السند المالي وتصفير تكلفة المهمة؟` : "هل أنت متأكد من حذف هذا المصروف نهائيًا؟") : (linkedTaskTitle ? `This expense is linked to a completed maintenance task (${linkedTaskTitle}). Delete the voucher and reset the task cost to zero?` : "Delete this expense permanently?"),
      cancelLabel: language === "ar" ? "إلغاء" : "Cancel",
      confirmLabel: language === "ar" ? "حذف" : "Delete",
      destructive: true,
      onConfirm: () => void deleteExpense(expense.id).catch(() => showAlert(language === "ar" ? "تعذر الحذف" : "Could not delete", language === "ar" ? "لا تملك صلاحية حذف المصروف." : "You do not have permission to delete this expense.")),
    });
  };

  if (!can("view_financial_reports")) return <ScreenContainer><View style={[styles.locked, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="lock" size={30} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", marginTop: 9, textAlign: align }}>{language === "ar" ? "المصروفات للإدارة فقط" : "Expenses are for management only"}</Text></View></ScreenContainer>;
  return <ScreenContainer edges={["top", "left", "right"]}><View style={styles.screen}>
    <View style={styles.headerWrap}><SubScreenHeader title={language === "ar" ? "المصروفات" : "Expenses"} /></View>
    <View style={[styles.monthCounters, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><View style={[styles.stat, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><Text style={{ color: colors.muted, fontSize: 9.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إجمالي المصروفات" : "Total expenses"}</Text><Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", marginTop: 3, writingDirection: "ltr", textAlign: align }}>{formatMoney(total, settings.currency)}</Text></View><View style={[styles.stat, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "55" }]}><Text style={{ color: colors.muted, fontSize: 9.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "من الخزينة المركزية" : "From central treasury"}</Text><Text style={{ color: colors.primary, fontSize: 14, fontWeight: "900", marginTop: 3, writingDirection: "ltr", textAlign: align }}>{formatMoney(periodTreasuryTotal, settings.currency)}</Text></View><View style={[styles.stat, { backgroundColor: "#F59E0B12", borderColor: "#F59E0B55" }]}><Text style={{ color: colors.muted, fontSize: 9.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "من عُهد الموظفين" : "From staff floats"}</Text><Text style={{ color: "#F59E0B", fontSize: 14, fontWeight: "900", marginTop: 3, writingDirection: "ltr", textAlign: align }}>{formatMoney(periodFloatTotal, settings.currency)}</Text></View>{periodReimbursementTotal > 0 ? <View style={[styles.stat, { backgroundColor: "#A855F712", borderColor: "#A855F755" }]}><Text style={{ color: colors.muted, fontSize: 9.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "ذمم مستحقة لموظفين" : "Due to staff"}</Text><Text style={{ color: "#A855F7", fontSize: 14, fontWeight: "900", marginTop: 3, writingDirection: "ltr", textAlign: align }}>{formatMoney(periodReimbursementTotal, settings.currency)}</Text></View> : null}</View>
    <View style={styles.timelineWrap}>
      <View style={[styles.dayStrip, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تمرير الأيام للخلف" : "Scroll days backward"} onPress={(event) => { event?.stopPropagation?.(); nudgeStrip(-1); }} {...mouseClick(() => nudgeStrip(-1))} disabled={false} pointerEvents="auto" style={({ pressed }) => [styles.stripArrow, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, opacity: pressed ? 0.6 : 1, position: "relative", zIndex: 30, elevation: 30, cursor: "pointer", userSelect: "none" }]}><MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={18} color="#EA580C" /></Pressable><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripContent}>{expenseStripDates.map((date) => { const selected = period === "today" && todayAnchor === date; const isToday = date === todayISO(); const hasExpense = scopedDateSet.has(date); const weekday = STRIP_WEEKDAYS[language === "ar" ? "ar" : "en"][new Date(`${date}T12:00:00Z`).getUTCDay()]; return <Pressable key={date} accessibilityRole="button" accessibilityLabel={language === "ar" ? `تاريخ ${date}` : `Date ${date}`} onPress={() => selectStripDay(date)} style={[styles.stripChip, selected ? { backgroundColor: "#EA580C", borderColor: "#EA580C" } : isToday ? { backgroundColor: "rgba(234, 88, 12, 0.15)", borderColor: "#EA580C", borderWidth: 2 } : { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><Text numberOfLines={1} style={{ color: selected ? "#FFFFFF" : isToday ? "#FDBA74" : "#94A3B8", fontSize: 9, fontWeight: selected || isToday ? "900" : "600", textAlign: "center" }}>{isToday ? (language === "ar" ? "اليوم" : "Today") : weekday}</Text><Text style={{ color: selected ? "#FFFFFF" : isToday ? "#FDBA74" : colors.foreground, fontSize: 13, fontWeight: selected || isToday ? "900" : "700", textAlign: "center" }}>{date.slice(8, 10)}</Text><View style={[styles.stripDot, { backgroundColor: hasExpense ? "#EA580C" : "transparent" }]} /></Pressable>; })}</ScrollView><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تمرير الأيام للأمام" : "Scroll days forward"} onPress={(event) => { event?.stopPropagation?.(); nudgeStrip(1); }} {...mouseClick(() => nudgeStrip(1))} disabled={false} pointerEvents="auto" style={({ pressed }) => [styles.stripArrow, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, opacity: pressed ? 0.6 : 1, position: "relative", zIndex: 30, elevation: 30, cursor: "pointer", userSelect: "none" }]}><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={18} color="#EA580C" /></Pressable></View>
    </View>
    <View style={[styles.filterRow, { flexDirection: "row", alignItems: "center", gap: 8, zIndex: scopeMenuOpen || periodMenuOpen ? 3 : 0 }]}>
            <View style={[styles.searchWrap, { flexDirection: row }]}><View style={[styles.searchBar, { backgroundColor: colors.surfaceMuted, borderColor: searchQuery.trim() ? "#F59E0B66" : colors.border, flexDirection: row }]}><MaterialIcons name="search" size={16} color={searchQuery.trim() ? "#F59E0B" : colors.muted} /><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder={language === "ar" ? "بحث ذكي شامل (البيان، التصنيف، الموظف، الشاليه، المبلغ، قناة الصرف)" : "Smart search across note, category, staff, chalet, amount, channel"} placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.foreground }]} /><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "مسح البحث" : "Clear search"} onPress={() => setSearchQuery("")} hitSlop={8}><MaterialIcons name="close" size={17} color={searchQuery.trim() ? colors.foreground : colors.muted} /></Pressable></View></View>
            <View onLayout={measureScopeSide} style={styles.scopeMenuAnchor}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "قائمة الوحدات" : "Unit list"} onPress={() => { setScopeMenuOpen((open) => !open); setPeriodMenuOpen(false); }} style={[styles.toolbarSelect, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="holiday-village" size={15} color={colors.primary} /><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 11, fontWeight: "800", flex: 1, textAlign: align }}>{selectedChaletId ? (chalets.find((chalet) => chalet.id === selectedChaletId)?.name ?? "—") : (language === "ar" ? "جميع الوحدات" : "All units")}</Text><MaterialIcons name={scopeMenuOpen ? "expand-less" : "expand-more"} size={16} color={colors.muted} /></Pressable>{scopeMenuOpen ? <View style={[styles.toolbarMenu, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, left: isRTL ? 0 : undefined, right: isRTL ? undefined : 0 }, { backgroundColor: colors.background, width: 220, elevation: 18, shadowColor: "#000000", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, left: scopeMenuSide === "left" ? 0 : undefined, right: scopeMenuSide === "left" ? undefined : 0 }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "جميع الوحدات" : "All units"} onPress={() => { void setSelectedChaletId(null); setScopeMenuOpen(false); }} style={({ pressed }) => [styles.toolbarRow, { backgroundColor: selectedChaletId === null ? colors.primary + "22" : pressed ? colors.surfaceMuted : "transparent", borderStartWidth: selectedChaletId === null ? 2 : 0, borderEndWidth: 0, borderStartColor: selectedChaletId === null ? colors.primary : "transparent", flexDirection: row }]}><MaterialIcons name="holiday-village" size={15} color={selectedChaletId === null ? colors.primary : colors.muted} /><Text style={{ flex: 1, color: selectedChaletId === null ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{language === "ar" ? "جميع الوحدات" : "All units"}</Text></Pressable>{chalets.map((chalet) => { const selected = selectedChaletId === chalet.id; return <Pressable key={chalet.id} accessibilityRole="button" accessibilityLabel={chalet.name} onPress={() => { void setSelectedChaletId(selected ? null : chalet.id); setScopeMenuOpen(false); }} style={({ pressed }) => [styles.toolbarRow, { backgroundColor: selected ? colors.primary + "22" : pressed ? colors.surfaceMuted : "transparent", borderStartWidth: selected ? 2 : 0, borderEndWidth: 0, borderStartColor: selected ? colors.primary : "transparent", flexDirection: row }]}><View style={[styles.filterDot, { backgroundColor: chalet.color }]} /><Text style={{ flex: 1, color: selected ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{chalet.name}</Text></Pressable>; })}</View> : null}</View>
            <View onLayout={measurePeriodSide} style={styles.periodMenuAnchor}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "قائمة الفترات" : "Period list"} onPress={() => { setPeriodMenuOpen((open) => !open); setScopeMenuOpen(false); }} style={[styles.toolbarSelect, { backgroundColor: colors.surfaceMuted, borderColor: period === "custom" ? "#EA580C" : colors.border, flexDirection: row }]}><MaterialIcons name="date-range" size={15} color={colors.primary} /><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 11, fontWeight: "800", flex: 1, textAlign: align }}>{periodMenuLabel}</Text><MaterialIcons name={periodMenuOpen ? "expand-less" : "expand-more"} size={16} color={colors.muted} /></Pressable>{periodMenuOpen ? <View style={[styles.toolbarMenu, { backgroundColor: colors.background, width: 190, elevation: 18, shadowColor: "#000000", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, left: periodMenuSide === "left" ? 0 : undefined, right: periodMenuSide === "left" ? undefined : 0 }]}>{PERIOD_FILTERS.map((option) => { const active = period === option.id; return <Pressable key={option.id} accessibilityRole="button" onPress={() => applyPeriodFilter(option.id)} style={({ pressed }) => [styles.toolbarRow, { backgroundColor: active ? colors.primary + "22" : pressed ? colors.surfaceMuted : "transparent", borderStartWidth: active ? 2 : 0, borderEndWidth: 0, borderStartColor: active ? colors.primary : "transparent", flexDirection: row }]}><MaterialIcons name={option.id === "custom" ? "date-range" : option.id === "all" ? "calendar-view-week" : option.id === "today" ? "today" : option.id === "7" ? "date-range" : "calendar-month"} size={15} color={active ? colors.primary : colors.muted} /><Text style={{ flex: 1, color: active ? colors.primary : colors.foreground, fontSize: 12, fontWeight: active ? "900" : "700", textAlign: align }}>{language === "ar" ? option.ar : option.en}</Text>{active ? <MaterialIcons name="check-circle" size={15} color={colors.primary} /> : null}</Pressable>; })}</View> : null}</View>
    </View>
    {scopeMenuOpen || periodMenuOpen ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={() => { setScopeMenuOpen(false); setPeriodMenuOpen(false); }} style={[StyleSheet.absoluteFill, styles.clickAway]} /> : null}
        {searchQuery.trim() ? <View style={[styles.searchSummary, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="filter-list" size={13} color="#F59E0B" /><Text numberOfLines={1} style={[styles.flex, { color: colors.foreground, fontSize: 10.5, fontWeight: "800", textAlign: align }]}>{language === "ar" ? `عرض (${visibleExpenses.length}) نتائج مطابقة لـ "${searchQuery.trim()}"` : `Showing (${visibleExpenses.length}) matches for "${searchQuery.trim()}"`}</Text><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "مسح البحث" : "Clear search"} onPress={() => setSearchQuery("")} hitSlop={8}><MaterialIcons name="close" size={15} color={colors.muted} /></Pressable></View> : null}
        {period === "custom" ? <View style={[styles.customRange, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "بداية فترة المصروفات" : "Expense period start"} onPress={() => setRangePickerOpen(true)} style={[styles.rangeField, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="event" size={15} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 10.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "من" : "From"} · {formatDate(customStart)}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "نهاية فترة المصروفات" : "Expense period end"} onPress={() => setRangePickerOpen(true)} style={[styles.rangeField, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="event" size={15} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 10.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إلى" : "To"} · {formatDate(customEnd)}</Text></Pressable></View> : null}
        <DateRangePicker visible={rangePickerOpen} start={customStart} end={customEnd} onClose={() => setRangePickerOpen(false)} onApply={applyRange} />
    <FlatList data={ledgerRows} showsVerticalScrollIndicator={false} keyExtractor={(row) => (row.kind === "header" ? `header-${row.date}` : row.item.id)} contentContainerStyle={styles.content} ListEmptyComponent={<View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="receipt-long" size={28} color={colors.muted} /><Text style={{ color: colors.foreground, fontWeight: "900", marginTop: 9, textAlign: align }}>{language === "ar" ? (selectedChaletId ? "لا توجد مصروفات لهذا الشاليه" : "لا توجد مصروفات مسجلة") : "No recorded expenses"}</Text></View>} renderItem={({ item, index }) => {
      if (item.kind === "header") return <View style={[styles.dateHeaderBar, { borderBottomColor: "rgba(30, 41, 59, 0.8)" }]}><View style={[styles.dateBadge, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}><MaterialIcons name="event" size={13} color="#F59E0B" /><Text style={{ color: colors.foreground, fontSize: 10.5, fontWeight: "900", writingDirection: "ltr" }}>{weekdayLabel(item.date, language)}، {formatDate(item.date)}</Text></View>{index === 0 ? <View style={[styles.dateHeaderActions, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "سجل الحركات (المصروفات)" : "Expenses activity log"} onPress={() => router.push("/audit-log?action=expense-added")} style={({ pressed, hovered }) => [styles.quickAction, hovered ? { borderColor: "#334155" } : null, pressed ? { transform: [{ scale: 0.95 }], opacity: 0.8 } : { opacity: 1 }]}><MaterialIcons name="receipt-long" size={15} color="#F59E0B" /><Text style={{ color: "#E2E8F0", fontSize: 12, fontWeight: "600" }}>{language === "ar" ? "سجل الحركات" : "Activity log"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تقارير المصروفات" : "Expenses reports"} onPress={() => router.push("/reports")} style={({ pressed, hovered }) => [styles.quickAction, hovered ? { borderColor: "#334155" } : null, pressed ? { transform: [{ scale: 0.95 }], opacity: 0.8 } : { opacity: 1 }]}><MaterialIcons name="bar-chart" size={15} color="#F59E0B" /><Text style={{ color: "#E2E8F0", fontSize: 12, fontWeight: "600" }}>{language === "ar" ? "تقارير المصروفات" : "Reports"}</Text></Pressable></View> : null}</View>;
      const meta = CATEGORY_META[item.item.category];
      const isGeneral = !item.item.chaletId;
      const mode = fundingModeFor(item.item);
      const modeMeta = FUNDING_MODE_META[mode];
      const entityLabel = item.item.fundingEntity === "staff" ? (item.item.fundingSourceLabel || (language === "ar" ? "عهدة موظف / حارس" : "Staff float")) : (language === "ar" ? "المالك" : "Owner");
      const categoryLabel = item.item.isStaffReimbursementSettled ? (language === "ar" ? "أخرى / تصفية ذمة موظف" : "Other / settle staff liability") : (language === "ar" ? meta.ar : meta.en);
      const modeLabel = item.item.isStaffReimbursementSettled ? (language === "ar" ? "تصفية ذمة موظف" : "Staff liability settled") : (language === "ar" ? modeMeta.ar : modeMeta.en);
      return <View style={[styles.expense, { backgroundColor: "rgba(15, 23, 42, 0.8)", borderColor: "#1E293B" }]}><View style={[styles.cardTopRow, { flexDirection: row }]}><Text style={[styles.cardAmount, { color: "#FBBF24" }]}>{formatMoney(item.item.amount, settings.currency)}</Text><View style={styles.cardBody}><View style={[styles.cardBadges, { flexDirection: row }]}><View style={[styles.categoryBadge, { backgroundColor: colors.primary + "13" }]}><MaterialIcons name={meta.icon} size={11} color={colors.primary} /><HighlightedText text={categoryLabel} query={searchQuery} numberOfLines={1} style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }} /></View><View style={[styles.scopeBadge, { backgroundColor: isGeneral ? colors.muted + "18" : colors.success + "12" }]}><MaterialIcons name="holiday-village" size={11} color={isGeneral ? colors.muted : colors.success} /><HighlightedText text={isGeneral ? (language === "ar" ? "عام" : "General") : (item.item.chaletName ?? "")} query={searchQuery} numberOfLines={1} style={{ color: isGeneral ? colors.muted : colors.success, fontSize: 10, fontWeight: "900" }} /></View>{mode === "reimbursement" ? <View style={[styles.modeBadge, { backgroundColor: "#A855F714" }]}><MaterialIcons name={modeMeta.icon} size={11} color="#A855F7" /><HighlightedText text={language === "ar" ? `من الجيب الخاص · ${entityLabel}` : `Out of pocket · ${entityLabel}`} query={searchQuery} numberOfLines={1} style={{ color: "#A855F7", fontSize: 10, fontWeight: "900" }} /></View> : mode === "float" ? <View style={[styles.modeBadge, { backgroundColor: "#F59E0B" + "1B" }]}><MaterialIcons name={modeMeta.icon} size={11} color="#F59E0B" /><HighlightedText text={language === "ar" ? `خصم من عهدة · ${entityLabel}` : `Float deduction · ${entityLabel}`} query={searchQuery} numberOfLines={1} style={{ color: "#F59E0B", fontSize: 10, fontWeight: "900" }} /></View> : <View style={[styles.modeBadge, { backgroundColor: "#10B98114" }]}><MaterialIcons name={modeMeta.icon} size={11} color="#10B981" /><HighlightedText text={language === "ar" ? `الخزينة المركزية · ${item.item.fundingChannel === "cliq" ? "تحويل CliQ" : item.item.fundingChannel === "iban" ? "حوالة بنكية" : "كاش نقدي"}` : `Central treasury · ${item.item.fundingChannel === "cliq" ? "CliQ" : item.item.fundingChannel === "iban" ? "Bank" : "Cash"}`} query={searchQuery} numberOfLines={1} style={{ color: "#10B981", fontSize: 10, fontWeight: "900" }} /></View>}{item.item.isStaffReimbursementSettled ? <View style={[styles.modeBadge, { backgroundColor: colors.primary + "13" }]}><HighlightedText text={modeLabel} query={searchQuery} numberOfLines={1} style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }} /></View> : null}</View><HighlightedText text={item.item.note ?? ""} query={searchQuery} numberOfLines={2} style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", marginTop: 8, textAlign: align }} /></View><View style={[styles.cardActions, { flexDirection: "column", gap: 6, alignItems: "center", justifyContent: "center" }]}>{item.item.receiptUri ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "عرض الفاتورة" : "View invoice"} onPress={() => setReceiptPreviewUri(item.item.receiptUri!)} style={[styles.iconAction, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name="receipt" size={16} color={colors.primary} /></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تعديل المصروف" : "Edit expense"} onPress={() => openEdit(item.item)} style={[styles.iconAction, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name="edit" size={16} color={colors.primary} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حذف المصروف" : "Delete expense"} onPress={() => remove(item.item)} style={[styles.iconAction, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name="delete-outline" size={16} color={colors.error} /></Pressable></View></View><View style={[styles.cardMeta, { flexDirection: row }]}>{item.item.createdByName ? <><HighlightedText text={`${language === "ar" ? "بواسطة:" : "by"}: ${item.item.createdByName}`} query={searchQuery} numberOfLines={1} style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }} /><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}> · </Text></> : null}<MaterialIcons name="schedule" size={12} color={colors.muted} /><HighlightedText text={formatRecordedAt(item.item.createdAt, language)} query={searchQuery} numberOfLines={1} style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }} /></View></View>;
    }} />
    <View style={[styles.dock, { backgroundColor: colors.background }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إضافة مصروف" : "Add expense"} onPress={openForm} style={({ pressed }) => [styles.dockButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}><MaterialIcons name="add-card" size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>{language === "ar" ? "إضافة مصروف جديد" : "Add new expense"}</Text></Pressable></View>
    <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => !isSubmitting && setModalOpen(false)}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: "#000000", shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: -8 }, elevation: 50 }]}><View style={[styles.modalHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900", textAlign: align }}>{editingExpenseId ? (language === "ar" ? "تعديل مصروف" : "Edit expense") : (language === "ar" ? "إضافة مصروف" : "Add expense")}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{editingExpenseId ? (language === "ar" ? `سيُسجل التعديل باسم: ${loggedBy}` : `Edit will be logged by: ${loggedBy}`) : (language === "ar" ? `سيُسجل باسم: ${loggedBy}` : `Logged by: ${loggedBy}`)}</Text></View><Pressable disabled={isSubmitting} onPress={() => setModalOpen(false)} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceMuted, opacity: pressed || isSubmitting ? 0.65 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><ScrollView ref={formScrollRef} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><View onLayout={registerField("scope")} style={[styles.fieldBlock, { borderColor: scopeError ? "#F43F5E" : colors.border, backgroundColor: scopeError ? "#F43F5E0D" : colors.surfaceMuted, shadowColor: "#F43F5E", shadowOpacity: scopeError ? 0.22 : 0, shadowRadius: scopeError ? 12 : 0, elevation: scopeError ? 6 : 0 }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "نطاق المصروف / الشاليه" : "Expense scope / chalet"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 4, textAlign: align }}>{language === "ar" ? "اختر شاليهًا واحدًا أو أكثر، أو فعّل «كافة الشاليهات» لمصروف عام." : "Select one or more chalets, or enable \"All properties\" for a general expense."}</Text><View style={styles.scopeChecklist}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allChaletsSelected }} accessibilityLabel={language === "ar" ? "كافة الشاليهات / مصروف عام" : "All properties / General expense"} onPress={toggleAllChalets} style={({ pressed }) => [styles.checkRow, { backgroundColor: allChaletsSelected ? colors.primary + "14" : colors.surface, borderColor: allChaletsSelected ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={allChaletsSelected ? "check-box" : "check-box-outline-blank"} size={18} color={allChaletsSelected ? colors.primary : colors.muted} /><Text numberOfLines={1} style={{ flex: 1, color: allChaletsSelected ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: isArabicLayout ? "right" : "left" }}>{language === "ar" ? "كافة الشاليهات / مصروف عام" : "All properties / General expense"}</Text><View style={[styles.filterDot, { backgroundColor: colors.primary }]} /></Pressable>{chalets.map((chalet) => { const chaletSelected = selectedChaletIds.includes(chalet.id); return <Pressable key={chalet.id} accessibilityRole="checkbox" accessibilityState={{ checked: chaletSelected }} accessibilityLabel={chalet.name} onPress={() => toggleChalet(chalet.id)} style={({ pressed }) => [styles.checkRow, { backgroundColor: chaletSelected ? colors.primary + "14" : colors.surface, borderColor: chaletSelected ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={chaletSelected ? "check-box" : "check-box-outline-blank"} size={18} color={chaletSelected ? colors.primary : colors.muted} /><Text numberOfLines={1} style={{ flex: 1, color: chaletSelected ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: isArabicLayout ? "right" : "left" }}>{chalet.name}</Text><View style={[styles.filterDot, { backgroundColor: chalet.color }]} /></Pressable>; })}</View>{scopeError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى اختيار شاليه واحد على الأقل" : "Please select at least one chalet"}</Text> : null}</View><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "المبلغ (JOD)" : "Amount (JOD)"}</Text><View onLayout={registerField("amount")} style={[styles.fieldBlock, { borderColor: amountError ? "#F43F5E" : colors.border, backgroundColor: amountError ? "#F43F5E0D" : colors.surfaceMuted, shadowColor: "#F43F5E", shadowOpacity: amountError ? 0.22 : 0, shadowRadius: amountError ? 12 : 0, elevation: amountError ? 6 : 0 }]}><View style={[styles.amountRow, { flexDirection: row }]}><TextInput value={amount} onChangeText={(text) => { setAmount(text); setAmountError(false); }} keyboardType="decimal-pad" placeholder={language === "ar" ? "المبلغ (د.أ)" : "Amount (JOD)"} placeholderTextColor={colors.muted} style={[styles.input, styles.amountInput, { color: colors.foreground, borderColor: amountError ? "#F43F5E" : colors.border, backgroundColor: colors.surfaceMuted, textAlign: align, borderWidth: amountError ? 2 : 1 }]} /><View style={[styles.amountSuffix, { borderColor: amountError ? "#F43F5E" : colors.border, backgroundColor: colors.surfaceMuted, borderWidth: amountError ? 2 : 1 }]}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900" }}>{language === "ar" ? "د.أ" : "JOD"}</Text></View></View>{amountError ? <Text style={styles.fieldError}>{language === "ar" ? "أدخل مبلغ المصروف (أكبر من صفر)" : "Enter an expense amount greater than zero"}</Text> : null}</View><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "تصنيف المصروف" : "Expense category"}</Text><View onLayout={registerField("category")} style={[styles.fieldBlock, { borderColor: categoryError ? "#F43F5E" : colors.border, backgroundColor: categoryError ? "#F43F5E0D" : colors.surfaceMuted, shadowColor: "#F43F5E", shadowOpacity: categoryError ? 0.22 : 0, shadowRadius: categoryError ? 12 : 0, elevation: categoryError ? 6 : 0 }]}><ExpenseDropdownField value={category ? CATEGORY_META[category].ar : null} placeholder={language === "ar" ? "اختر التصنيف..." : "Choose a category..."} error={categoryError} icon={category ? CATEGORY_META[category].icon : undefined} onPress={() => setDropdown({ kind: "category" })} colors={colors} language={language} />{categoryError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى اختيار تصنيف المصروف" : "Please choose a category"}</Text> : null}</View>{category === "other" ? <View onLayout={registerField("otherCategory")} style={styles.otherCategoryBox}><TextInput value={otherCategoryNote} onChangeText={(text) => { setOtherCategoryNote(text); if (otherCategoryError) setOtherCategoryError(false); }} multiline placeholder={language === "ar" ? "اكتب نوع وتصنيف هذا المصروف..." : "Describe the custom expense type..."} placeholderTextColor={colors.muted} style={[styles.input, { minHeight: 56, paddingTop: 10, textAlignVertical: "top", color: colors.foreground, borderColor: otherCategoryError ? "#F43F5E" : colors.border, backgroundColor: otherCategoryError ? "#F43F5E0D" : colors.surfaceMuted, textAlign: align, borderWidth: otherCategoryError ? 2 : 1 }]} />{otherCategoryError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى وصف نوع التصنيف (3 أحرف على الأقل)" : "Please describe the type (at least 3 characters)"}</Text> : null}</View> : null}<Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "مصدر التمويل" : "Funding source"}</Text><View onLayout={registerField("funding")} style={[styles.fundingFrame, { borderColor: fundingError ? "#F43F5E" : colors.primary + "35", backgroundColor: fundingError ? "#F43F5E0D" : colors.primary + "08" }]}><ExpenseDropdownField value={fundingEntity ? expenseFundingEntityLabel(fundingEntity, language) : null} placeholder={language === "ar" ? "اختر مصدر التمويل..." : "Choose the funding source..."} error={fundingError} icon={fundingEntity === "staff" ? "person" : "account-balance"} onPress={() => setDropdown({ kind: "funding" })} colors={colors} language={language} />{fundingError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى تحديد مصدر التمويل" : "Please choose a funding source"}</Text> : null}{fundingEntity === "owner" ? <View onLayout={registerField("channel")} style={[styles.fieldBlock, { borderColor: channelError ? "#F43F5E" : colors.border, backgroundColor: channelError ? "#F43F5E0D" : colors.surfaceMuted, marginTop: 11 }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "قناة الصرف والحساب" : "Payment channel & account"}</Text><ExpenseDropdownField value={fundingChannel ? expenseFundingChannelLabel(fundingChannel, language) : null} placeholder={language === "ar" ? "اختر قناة الصرف..." : "Choose the payment channel..."} error={channelError} icon="payments" onPress={() => setDropdown({ kind: "channel" })} colors={colors} language={language} /><Text style={{ color: colors.muted, fontSize: 10, marginTop: 9, textAlign: align }}>{language === "ar" ? "القنوات المتاحة: نقد من صندوق الخزينة، تحويل عبر CliQ (المالك)، حوالة بنكية IBAN." : "Available channels: treasury cash, owner CliQ, bank transfer (IBAN)."}</Text>{fundingChannel && fundingChannel !== "vault-cash" ? <><Text style={{ color: colors.muted, fontSize: 10, marginTop: 9, textAlign: align }}>{language === "ar" ? "اختر الحساب المالي المفعل الذي سيُحمَّل عليه المصروف:" : "Select the active owner treasury account to be charged:"}</Text><View style={[styles.accountRow, { flexDirection: row }]}>{channelAccounts.length ? channelAccounts.map((account) => <ChoiceChip key={account.id} active={ownerAccountId === account.id} label={account.label} onPress={() => setOwnerAccountId(account.id)} colors={colors} isRTL={isRTL} />) : <Text style={{ color: colors.warning, fontSize: 10, textAlign: align }}>{language === "ar" ? "لا توجد حسابات مفعلة لهذه القناة — أضفها من «طرق الدفع والحسابات المالية»." : "No active accounts for this channel — add them under \"Payment methods & financial accounts\"."}</Text>}</View></> : null}{channelError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى اختيار قناة الصرف والحساب" : "Please choose the payment channel & account"}</Text> : null}</View> : null}{fundingEntity === "staff" ? <View onLayout={registerField("staff")} style={[styles.fieldBlock, { borderColor: staffError ? "#F43F5E" : colors.border, backgroundColor: staffError ? "#F43F5E0D" : colors.surfaceMuted, marginTop: 11 }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "اسم الموظف / الحارس" : "Staff / guard name"}</Text>{staffFloats.length ? <ExpenseDropdownField value={staffFloatLabel} placeholder={language === "ar" ? "اختر الموظف / الحارس..." : "Choose the staff / guard..."} error={staffError} icon="person" onPress={() => setDropdown({ kind: "staff" })} colors={colors} language={language} /> : <Text style={{ color: colors.warning, fontSize: 10, marginTop: 9, textAlign: align }}>{language === "ar" ? "لا توجد عُهد موظفين مفعلة — أضفها من «طرق الدفع والحسابات المالية»." : "No active staff floats — add them under \"Payment methods & financial accounts\"."}</Text>}{staffError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى اختيار الموظف / الحارس" : "Please choose the staff member"}</Text> : null}{staffFloatId ? <View onLayout={registerField("staffMode")} style={[styles.fieldBlock, { borderColor: staffModeError ? "#F43F5E" : colors.border, backgroundColor: staffModeError ? "#F43F5E0D" : colors.surfaceMuted, marginTop: 11 }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "طريقة السداد" : "Payment mode"}</Text><ExpenseDropdownField value={staffModeLabel} placeholder={language === "ar" ? "اختر طريقة السداد..." : "Choose the payment mode..."} error={staffModeError} icon={staffMode === "float" ? "account-balance-wallet" : staffMode === "reimbursement" ? "payments" : undefined} onPress={() => setDropdown({ kind: "staffMode" })} colors={colors} language={language} />{staffModeError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى اختيار طريقة السداد" : "Please choose a payment mode"}</Text> : null}<Text style={{ color: colors.muted, fontSize: 10, marginTop: 9, textAlign: align }}>{staffMode === "float" ? (language === "ar" ? "يُخصم المبلغ من عهدة الموظف ويظهر ضمن «المرجوع/الخصم» في تسوية العُهد." : "The amount is deducted from the staff float and shows under Refunded/deducted in float settlements.") : staffMode === "reimbursement" ? (language === "ar" ? "لا يُمسّ رصيد العهدة؛ يتحول المبلغ إلى ذمة على المالك تُردّ للموظف لاحقًا." : "The float balance is untouched; the amount becomes a liability due to the staff to be repaid later.") : null}</Text></View> : null}</View> : null}</View><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "البيان / ملاحظات المصروف" : "Expense description / notes"}</Text><View onLayout={registerField("note")} style={[styles.fieldBlock, { borderColor: noteError ? "#F43F5E" : colors.border, backgroundColor: noteError ? "#F43F5E0D" : colors.surfaceMuted, shadowColor: "#F43F5E", shadowOpacity: noteError ? 0.22 : 0, shadowRadius: noteError ? 12 : 0, elevation: noteError ? 6 : 0 }]}><TextInput value={note} onChangeText={(text) => { setNote(text); setNoteError(false); }} multiline placeholder={language === "ar" ? "اكتب وصف وبيان المصروف هنا..." : "Write the expense description and notes here..."} placeholderTextColor={colors.muted} style={[styles.input, styles.noteInput, { color: colors.foreground, borderColor: noteError ? "#F43F5E" : colors.border, backgroundColor: colors.surfaceMuted, textAlign: align, borderWidth: noteError ? 2 : 1 }]} />{noteError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى كتابة بيان المصروف (3 أحرف على الأقل)" : "Please write an expense description (3+ characters)"}</Text> : null}</View><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: saveAsTemplate }} onPress={() => setSaveAsTemplate((value) => !value)} style={({ pressed }) => [styles.checkRow, { backgroundColor: saveAsTemplate ? colors.primary + "14" : colors.surface, borderColor: saveAsTemplate ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={saveAsTemplate ? "check-box" : "check-box-outline-blank"} size={18} color={saveAsTemplate ? colors.primary : colors.muted} /><Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "800", textAlign: align }}>{language === "ar" ? "حفظ كبند متكرر" : "Save as a recurring template"}</Text><Text style={[styles.flex, { color: colors.muted, fontSize: 10, fontWeight: "700", textAlign: align }]}>{language === "ar" ? "يلتقط التصنيف والبيان والمبلغ وطريقة السداد" : "Capture category, note, amount and payment"}</Text></Pressable>{expenseTemplates.length ? <View style={styles.templateChips}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textAlign: align }}>{language === "ar" ? "أو اختر بندًا محفوظًا:" : "Or pick a saved template:"}</Text><View style={styles.categories}>{expenseTemplates.slice(0, 6).map((template) => <Pressable key={template.id} onPress={() => applyTemplate(template)} style={({ pressed }) => [styles.categoryChip, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="receipt-long" size={13} color="#F59E0B" /><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 11, fontWeight: "800" }}>{template.title} · {language === "ar" ? (template.paymentMethod === "click" ? "كليك" : "كاش") : template.paymentMethod === "click" ? "Click" : "Cash"}</Text></Pressable>)}</View></View> : null}<Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "تاريخ الصرف" : "Expense date"}</Text><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تغيير تاريخ الصرف" : "Change expense date"} onPress={() => setDatePickerOpen(true)} style={[styles.dateField, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="calendar-month" size={18} color={colors.primary} /><Text style={[styles.flex, { color: colors.foreground, fontSize: 13, fontWeight: "800", textAlign: align }]}>{weekdayLabel(expenseDate, language)}، {formatDate(expenseDate)}</Text><MaterialIcons name="keyboard-arrow-down" size={20} color={colors.muted} /></Pressable>{datePickerOpen ? <CalendarDatePicker visible={datePickerOpen} value={expenseDate} onClose={() => setDatePickerOpen(false)} onSelect={(date) => { setExpenseDate(date); setDatePickerOpen(false); }} /> : null}<Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "إرفاق الفاتورة / الوصل" : "Attach invoice / receipt"}</Text>{receiptUri ? <View style={[styles.selectedReceipt, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "عرض الفاتورة" : "View receipt"} onPress={() => setReceiptPreviewUri(receiptUri)}><Image source={{ uri: receiptUri }} style={styles.thumbnail} /></Pressable><View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 11, textAlign: align }}>{language === "ar" ? "تم إرفاق صورة الوصل" : "Receipt image attached"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 3, textAlign: align }}>{language === "ar" ? "اضغط الصورة للمعاينة." : "Tap image to preview."}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إزالة الفاتورة" : "Remove receipt"} onPress={() => setReceiptUri(undefined)} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}><MaterialIcons name="close" size={19} color={colors.error} /></Pressable></View> : <View style={[styles.attachmentChoices, { flexDirection: row }]}><AttachmentButton label={language === "ar" ? "الكاميرا" : "Camera"} icon="photo-camera" onPress={() => void chooseReceipt("camera")} colors={colors} /><AttachmentButton label={language === "ar" ? "المعرض" : "Gallery"} icon="photo-library" onPress={() => void chooseReceipt("library")} colors={colors} /></View>}<RipplePressable disabled={isSubmitting} rippleColor={colors.background + "3D"} onPress={() => void save()} style={({ pressed }) => [styles.save, { backgroundColor: "#F59E0B", opacity: pressed || isSubmitting ? 0.7 : 1 }]}>{isSubmitting ? <ActivityIndicator size="small" color={colors.background} /> : <MaterialIcons name="save" size={18} color={colors.background} />}<Text style={{ color: colors.background, fontSize: 13, fontWeight: "900" }}>{isSubmitting ? (language === "ar" ? "جارٍ الحفظ" : "Saving") : (editingExpenseId ? (language === "ar" ? "حفظ التعديلات" : "Save changes") : (language === "ar" ? "حفظ المصروف" : "Save expense"))}</Text></RipplePressable></ScrollView></View></View></Modal>
    <ExpenseDropdownSheet visible={dropdown?.kind === "category"} title={language === "ar" ? "تصنيف المصروف" : "Expense category"} options={EXPENSE_CATEGORIES.map((key) => ({ key, label: CATEGORY_META[key].ar, icon: CATEGORY_META[key].icon }))} selectedKey={category} onSelect={(key) => { setCategory(key as ExpenseCategory); setCategoryError(false); setOtherCategoryError(false); setDropdown(null); }} onCancel={() => setDropdown(null)} colors={colors} language={language} />
    <ExpenseDropdownSheet visible={dropdown?.kind === "funding"} title={language === "ar" ? "مصدر التمويل" : "Funding source"} options={EXPENSE_FUNDING_ENTITIES.map((entity) => ({ key: entity, label: expenseFundingEntityLabel(entity, language), icon: entity === "staff" ? "person" : "account-balance" }))} selectedKey={fundingEntity} onSelect={(key) => { setFundingEntity(key as ExpenseFundingEntity); setFundingChannel(null); setOwnerAccountId(null); setStaffFloatId(null); setStaffMode(null); setPaymentMethod(null); setFundingError(false); setChannelError(false); setStaffError(false); setStaffModeError(false); setDropdown(null); }} onCancel={() => setDropdown(null)} colors={colors} language={language} />
    <ExpenseDropdownSheet visible={dropdown?.kind === "channel"} title={language === "ar" ? "قناة الصرف والحساب" : "Payment channel"} options={EXPENSE_FUNDING_CHANNELS.map((channel) => ({ key: channel, label: expenseFundingChannelLabel(channel, language), icon: channel === "vault-cash" ? "payments" : channel === "cliq" ? "bolt" : "account-balance" }))} selectedKey={fundingChannel} onSelect={(key) => { setFundingChannel(key as ExpenseFundingChannel); setOwnerAccountId(null); setPaymentMethod(key === "vault-cash" ? "cash" : key === "cliq" ? "click" : null); setChannelError(false); setDropdown(null); }} onCancel={() => setDropdown(null)} colors={colors} language={language} />
    <ExpenseDropdownSheet visible={dropdown?.kind === "staff"} title={language === "ar" ? "اسم الموظف / الحارس" : "Staff / guard"} options={staffFloats.map((account) => ({ key: account.id, label: account.label, icon: "person" }))} selectedKey={staffFloatId} onSelect={(key) => { setStaffFloatId(key); setStaffError(false); setDropdown(null); }} onCancel={() => setDropdown(null)} colors={colors} language={language} />
    <ExpenseDropdownSheet visible={dropdown?.kind === "staffMode"} title={language === "ar" ? "طريقة السداد" : "Payment mode"} options={STAFF_MODE_OPTIONS.map((option) => ({ key: option.id, label: language === "ar" ? option.ar : option.en, icon: option.icon }))} selectedKey={staffMode} onSelect={(key) => { setStaffMode(key as "float" | "reimbursement"); setStaffModeError(false); setDropdown(null); }} onCancel={() => setDropdown(null)} colors={colors} language={language} />
    <Modal visible={Boolean(receiptPreviewUri)} transparent animationType="fade" onRequestClose={() => setReceiptPreviewUri(null)}><View style={styles.previewBackdrop}><View style={[styles.previewHeader, { flexDirection: row }]}><MaterialIcons name="receipt-long" size={18} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: align }}>{language === "ar" ? "معاينة الفاتورة" : "Receipt preview"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق المعاينة" : "Close preview"} onPress={() => setReceiptPreviewUri(null)} style={[styles.previewClose, { backgroundColor: colors.surface }]}><MaterialIcons name="close" size={23} color={colors.foreground} /></Pressable>{receiptPreviewUri ? <Image source={{ uri: receiptPreviewUri }} resizeMode="contain" style={styles.fullReceipt} /> : null}</View></Modal>
  </View></ScreenContainer>;
}

function ChoiceChip({ active, label, icon, onPress, colors, isRTL, activeColor = colors.primary }: { active: boolean; label: string; icon?: IconName; onPress: () => void; colors: ReturnType<typeof useColors>; isRTL: boolean; activeColor?: string }) {
  const isArabicChip = isRTL || /[\u0600-\u06FF]/.test(label);
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.choiceChip, { backgroundColor: active ? activeColor : colors.surfaceMuted, borderColor: active ? activeColor : colors.border, flexDirection: isArabicChip ? "row-reverse" : "row", opacity: pressed ? 0.72 : 1 }]}>{active ? <MaterialIcons name="check-circle" size={15} color={colors.background} /> : null}{icon ? <MaterialIcons name={icon} size={15} color={active ? colors.background : colors.primary} /> : null}<Text style={{ color: active ? colors.background : colors.foreground, fontSize: 11, fontWeight: "900", textAlign: isArabicChip ? "right" : "left" }}>{label}</Text></Pressable>;
}

function AttachmentButton({ label, icon, onPress, colors }: { label: string; icon: IconName; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.attachmentButton, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "5A", opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={icon} size={19} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{label}</Text></Pressable>;
}

function ExpenseDropdownField({ value, placeholder, error, icon, onPress, colors, language }: { value: string | null; placeholder: string; error: boolean; icon?: IconName; onPress: () => void; colors: ReturnType<typeof useColors>; language: "ar" | "en" }) {
  const isArabic = language === "ar";
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.dropdownField, { borderColor: error ? "#F43F5E" : colors.border, backgroundColor: colors.surfaceMuted, flexDirection: isArabic ? "row-reverse" : "row", opacity: pressed ? 0.72 : 1 }]}>{icon ? <MaterialIcons name={icon} size={17} color={error ? "#F43F5E" : colors.primary} /> : null}<Text numberOfLines={1} style={{ flex: 1, color: value ? colors.foreground : colors.muted, fontSize: 12, fontWeight: value ? "800" : "700", textAlign: isArabic ? "right" : "left" }}>{value ?? placeholder}</Text><MaterialIcons name="keyboard-arrow-down" size={20} color={colors.muted} /></Pressable>;
}

function ExpenseDropdownSheet({ visible, title, options, selectedKey, onSelect, onCancel, colors, language }: { visible: boolean; title: string; options: { key: string; label: string; icon?: IconName }[]; selectedKey: string | null; onSelect: (key: string) => void; onCancel: () => void; colors: ReturnType<typeof useColors>; language: "ar" | "en" }) {
  const isArabic = language === "ar";
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}><View style={styles.dropdownBackdrop}><View style={[styles.dropdownSheet, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: "#000000", shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: -8 }, elevation: 50 }]}><View style={[styles.dropdownHeader, { flexDirection: isArabic ? "row-reverse" : "row" }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: isArabic ? "right" : "left" }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: isArabic ? "right" : "left" }}>{language === "ar" ? "اختر واحدًا من الخيارات" : "Pick one option"}</Text></View><Pressable accessibilityRole="button" onPress={onCancel} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={18} color={colors.muted} /></Pressable></View><ScrollView showsVerticalScrollIndicator={false}>{options.map((option) => { const active = option.key === selectedKey; return <Pressable key={option.key} accessibilityRole="button" onPress={() => onSelect(option.key)} style={({ pressed }) => [styles.dropdownOption, { backgroundColor: active ? colors.primary + "12" : "transparent", borderColor: active ? colors.primary + "55" : colors.border, flexDirection: isArabic ? "row-reverse" : "row", opacity: pressed ? 0.72 : 1 }]}>{option.icon ? <MaterialIcons name={option.icon} size={18} color={active ? colors.primary : colors.muted} /> : null}<Text style={{ flex: 1, color: active ? colors.primary : colors.foreground, fontSize: 13, fontWeight: active ? "900" : "700", textAlign: isArabic ? "right" : "left" }}>{option.label}</Text>{active ? <MaterialIcons name="check-circle" size={17} color={colors.primary} /> : null}</Pressable>; })}</ScrollView><RipplePressable rippleColor={colors.background + "3D"} onPress={onCancel} style={({ pressed }) => [styles.dropdownCancel, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="close" size={16} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, fontWeight: "900" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></RipplePressable></View></View></Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, timelineWrap: { marginHorizontal: 16, gap: 8 }, filterRow: { marginHorizontal: 16, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }, scopeMenuAnchor: { position: "relative", flexShrink: 1, maxWidth: 175, minWidth: 110 }, toolbarSelect: { minHeight: 40, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", gap: 5 }, toolbarMenu: { position: "absolute", top: "100%", marginTop: 8, minWidth: 200, maxWidth: 280, borderRadius: 12, borderWidth: 1, overflow: "hidden", zIndex: 50 }, toolbarRow: { minHeight: 40, paddingHorizontal: 12, alignItems: "center", gap: 8 }, clickAway: { zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.2)" }, headerWrap: { paddingHorizontal: 16, paddingTop: 8 },
  quickAction: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(15, 23, 42, 0.9)", borderWidth: 1, borderColor: "#1E293B", transitionProperty: "transform, border-color", transitionDuration: "120ms" },
  searchWrap: { flex: 1, minWidth: 0 },
  searchBar: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "space-between", flexDirection: "row", gap: 8 },
  searchInput: { flex: 1, fontSize: 12.5, fontWeight: "700", minWidth: 0, paddingVertical: 0 },
  searchSummary: { marginHorizontal: 16, marginTop: 8, minHeight: 30, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", gap: 6 }, dayStrip: { alignItems: "center", gap: 6 }, stripArrow: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 }, stripContent: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2, paddingVertical: 2 }, stripChip: { minWidth: 38, height: 54, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 4 }, stripDot: { width: 5, height: 5, borderRadius: 3, marginTop: 1 }, total: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 17, padding: 13, alignItems: "center", gap: 10 }, flex: { flex: 1, minWidth: 0 }, content: { padding: 16, paddingBottom: 120, gap: 8 }, empty: { minHeight: 135, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", padding: 15 }, expense: { borderWidth: 1, borderRadius: 16, padding: 10 }, cardTopRow: { alignItems: "flex-start", gap: 8 }, cardAmount: { fontSize: 18, fontWeight: "900", alignSelf: "flex-start" }, cardBadges: { flex: 1, alignItems: "center", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }, categoryBadge: { minHeight: 21, borderRadius: 9, paddingHorizontal: 6, alignItems: "center", gap: 3 }, scopeBadge: { minHeight: 21, borderRadius: 9, paddingHorizontal: 6, alignItems: "center", gap: 3 }, entityBadge: { minHeight: 24, borderRadius: 9, paddingHorizontal: 8, alignItems: "center", gap: 4, flexDirection: "row" }, modeBadge: { minHeight: 21, borderRadius: 9, paddingHorizontal: 7, alignItems: "center", gap: 4, flexDirection: "row" }, cardFooter: { alignItems: "center", gap: 7, marginTop: 9 }, cardActions: { alignItems: "center", gap: 6 }, cardMeta: { alignItems: "center", gap: 3 }, receiptButton: { minHeight: 28, borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, alignItems: "center", gap: 4, flexDirection: "row" }, edit: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 9 }, delete: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 9 }, dateHeaderBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(30, 41, 59, 0.8)", marginBottom: 8, gap: 8 }, dateBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 9, paddingVertical: 4, paddingHorizontal: 9 }, dateHeaderActions: { flexDirection: "row", alignItems: "center", gap: 6 }, monthCounters: { marginHorizontal: 16, marginTop: 10, gap: 8 }, stat: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 10, alignItems: "center" }, locked: { borderWidth: 1, borderRadius: 18, padding: 20, margin: 16, alignItems: "center" }, modalBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.92)", justifyContent: "flex-end" }, modal: { maxHeight: "91%", borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 }, modalHeader: { alignItems: "center", gap: 10 }, close: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" }, formContent: { paddingBottom: 10 }, scopeChoices: { paddingVertical: 9, alignItems: "flex-start" }, rtlChoiceRow: { flexDirection: "row", alignItems: "flex-end" }, input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 13, marginTop: 10 }, noteInput: { minHeight: 74, paddingTop: 11, textAlignVertical: "top" },
  otherCategoryBox: { marginTop: 9, gap: 4 },
  templateChips: { marginTop: 10, gap: 6 },
  categoryChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }, categories: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9, alignSelf: "flex-end" }, category: { minHeight: 34, borderRadius: 11, paddingHorizontal: 9, alignItems: "center", gap: 5 }, dateField: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", gap: 8, marginTop: 9 }, fundingEntityRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 }, fundingChannelRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 }, accountRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 }, choiceChip: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, alignItems: "center", gap: 5 }, selectedReceipt: { borderWidth: 1, borderRadius: 14, padding: 10, alignItems: "center", gap: 10, marginTop: 9 }, thumbnail: { width: 52, height: 52, borderRadius: 10 }, attachmentChoices: { flexDirection: "row", gap: 8, marginTop: 9 }, attachmentButton: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, alignItems: "center", gap: 6, flexDirection: "row" }, save: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", gap: 6, flexDirection: "row", marginTop: 15 }, previewBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.88)", padding: 22, justifyContent: "center" }, previewHeader: { alignItems: "center", gap: 7, marginBottom: 12, alignSelf: "center" }, previewClose: { position: "absolute", top: 26, right: 20, width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, fullReceipt: { width: "100%", height: "68%", borderRadius: 16 }, amountInput: { fontSize: 19, fontWeight: "900" }, amountRow: { flexDirection: "row", alignItems: "center", gap: 8 }, amountSuffix: { minHeight: 48, paddingHorizontal: 13, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1 }, fieldBlock: { borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 11 }, fieldError: { color: "#F43F5E", fontSize: 10, fontWeight: "900", marginTop: 6, textAlign: "right" }, scopeChecklist: { marginTop: 10 }, checkRow: { minHeight: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, marginTop: 7, alignItems: "center", flexDirection: "row", gap: 9 }, filterDot: { width: 8, height: 8, borderRadius: 4 }, fundingFrame: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 9 }, periodRow: { marginHorizontal: 16, marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }, customRange: { marginHorizontal: 16, marginTop: 10, flexDirection: "row", gap: 8 }, rangeField: { minHeight: 44, flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, alignItems: "center", gap: 6 }, dropdownField: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", gap: 8, marginTop: 9 }, dropdownBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.92)", justifyContent: "flex-end" }, dropdownSheet: { maxHeight: "78%", borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 24 }, dropdownHeader: { alignItems: "center", gap: 10 }, dropdownOption: { minHeight: 50, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, alignItems: "center", gap: 9, marginTop: 8 }, dropdownCancel: { minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, flexDirection: "row" },
  periodMenuAnchor: { position: "relative", flexShrink: 1, maxWidth: 150, minWidth: 105 },
  cardBody: { flex: 1, minWidth: 0, gap: 4 },
  iconAction: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 14, paddingBottom: 22, borderTopWidth: 1, borderTopColor: "rgba(128,150,140,0.14)" },
  dockButton: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
});