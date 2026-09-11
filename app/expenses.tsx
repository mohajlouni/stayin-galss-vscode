import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, ToastAndroid, View, type LayoutChangeEvent } from "react-native";

import { ChaletSwitcher } from "@/components/chalet-switcher";
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
import { moveGregorianMonth } from "@/lib/gregorian-calendar";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceAccess } from "@/lib/workspace-access";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

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

type ExpensePeriod = "today" | "month" | "custom";
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

export default function ExpensesScreen() {
  const { expenses = [], chalets, settings, addExpense, updateExpense, deleteExpense, maintenanceTasks = [] } = useBookings();
  const { selectedChaletId } = useChaletScope();
  const { language, isRTL } = useI18n();
  const { triggerHaptic, formatDate, formatMonth } = useAppPreferences();
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
  const [period, setPeriod] = useState<ExpensePeriod>("month");
  const [todayAnchor, setTodayAnchor] = useState(todayISO());
  const [monthAnchor, setMonthAnchor] = useState(todayISO().slice(0, 7));
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
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
  const ownerAccounts = useMemo(() => activeOwnerTreasuryAccounts(settings), [settings]);
  const staffFloats = useMemo(() => activeStaffFloatAccounts(settings), [settings]);
  const channelAccounts = fundingChannel === "cliq" ? ownerAccounts.filter((account) => account.kind === "cliq") : fundingChannel === "iban" ? ownerAccounts.filter((account) => account.kind === "bank") : [];
  const allChaletsSelected = chalets.length > 0 && selectedChaletIds.length === chalets.length;
  const staffFloatLabel = staffFloatId ? staffFloats.find((account) => account.id === staffFloatId)?.label ?? null : null;
  const staffModeLabel = staffMode ? (STAFF_MODE_OPTIONS.find((option) => option.id === staffMode)?.[language === "ar" ? "ar" : "en"] ?? null) : null;
  const visibleExpenses = useMemo<DisplayExpense[]>(() => {
    const sharedLabel = language === "ar" ? "مصروف عام" : "Shared expense";
    const scoped = !selectedChaletId ? expenses.map((expense) => expense.generalAllocations?.length ? { ...expense, chaletId: "shared-expense-parent", chaletName: sharedLabel } : expense) : expenses.flatMap((expense) => {
      if (expense.chaletId === selectedChaletId) return [expense];
      const allocation = expense.generalAllocations?.find((item) => item.chaletId === selectedChaletId);
      return allocation ? [{ ...expense, chaletId: allocation.chaletId, chaletName: language === "ar" ? `جزء من مصروف عام · ${formatMoney(expense.amount, settings.currency)}` : `Share of ${formatMoney(expense.amount, settings.currency)} general expense`, amount: allocation.amount, sharedExpenseTotal: expense.amount, sharedUnitsCount: expense.generalAllocations?.length }] : [];
    });
    return scoped.filter((expense) => {
      const date = expense.date || expense.createdAt.slice(0, 10);
      if (period === "today") return date === todayAnchor;
      if (period === "custom") return date >= customStart && date <= customEnd;
      return date.startsWith(monthAnchor);
    }).sort((left, right) => (right.date || right.createdAt.slice(0, 10)).localeCompare(left.date || left.createdAt.slice(0, 10)) || right.createdAt.localeCompare(left.createdAt));
  }, [expenses, language, selectedChaletId, settings.currency, period, customStart, customEnd, todayAnchor, monthAnchor]);
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
  const monthAnchorYear = Number(monthAnchor.slice(0, 4));
  const monthAnchorNumber = Number(monthAnchor.slice(5, 7));
  const periodLabel = period === "today" ? `${language === "ar" ? "اليوم" : "Today"} · ${formatDate(todayAnchor)}` : period === "month" ? `${language === "ar" ? "هذا الشهر" : "This month"} · ${formatMonth(monthAnchorYear, monthAnchorNumber)}` : `${formatDate(customStart)} — ${formatDate(customEnd)}`;
  const backLabel = period === "today" ? (language === "ar" ? "اليوم السابق" : "Previous day") : (language === "ar" ? "الشهر السابق" : "Previous month");
  const forwardLabel = period === "today" ? (language === "ar" ? "اليوم التالي" : "Next day") : (language === "ar" ? "الشهر التالي" : "Next month");
  const loggedBy = user?.name?.trim() || (language === "ar" ? "مستخدم التطبيق" : "App user");

  useEffect(() => {
    void ImagePicker.getPendingResultAsync().then((result) => {
      if (!result || "code" in result || result.canceled || !result.assets?.[0]?.uri) return;
      setReceiptUri(result.assets[0].uri);
      setModalOpen(true);
    });
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
  const shiftPeriod = (direction: -1 | 1) => {
    if (period === "today") {
      setTodayAnchor((current) => addDays(current, direction));
    } else if (period === "month") {
      setMonthAnchor((current) => {
        const next = moveGregorianMonth(Number(current.slice(0, 4)), Number(current.slice(5, 7)), direction);
        return `${next.year}-${String(next.month).padStart(2, "0")}`;
      });
    }
  };
  const notifyExpenseSaved = () => {
    const message = language === "ar" ? "تم حفظ المصروف بنجاح" : "Expense saved successfully";
    if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
    else Alert.alert(language === "ar" ? "تم الحفظ" : "Saved", message);
  };
  const onDatePick = (_event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === "android") setDatePickerOpen(false);
    if (!value) return;
    setExpenseDate(`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`);
  };
  const chooseReceipt = async (source: "camera" | "library") => {
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(language === "ar" ? "إذن الكاميرا مطلوب" : "Camera permission required", language === "ar" ? "اسمح للكاميرا لالتقاط صورة الفاتورة." : "Allow camera access to take a receipt photo.");
          return;
        }
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.75 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.75 });
      if (!result.canceled && result.assets[0]?.uri) setReceiptUri(result.assets[0].uri);
    } catch {
      Alert.alert(language === "ar" ? "تعذر إرفاق الوصل" : "Could not attach receipt", language === "ar" ? "حاول اختيار الصورة مرة أخرى." : "Try selecting the image again.");
    }
  };
  const save = async () => {
    if (submittingRef.current) return;
    if (!selectedChaletIds.length) {
      setScopeError(true);
      scrollToField("scope");
      Alert.alert(language === "ar" ? "اختر نطاق المصروف" : "Choose expense scope", language === "ar" ? "اختر شاليهًا واحدًا على الأقل قبل إدخال المبلغ." : "Choose at least one chalet before entering the amount.");
      return;
    }
    const numeric = Number(amount.replace(",", "."));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setAmountError(true);
      scrollToField("amount");
      Alert.alert(language === "ar" ? "مبلغ غير صحيح" : "Invalid amount", language === "ar" ? "أدخل مبلغ مصروف أكبر من صفر." : "Enter an expense amount greater than zero.");
      return;
    }
    if (!category) {
      setCategoryError(true);
      scrollToField("category");
      Alert.alert(language === "ar" ? "اختر التصنيف" : "Choose a category", language === "ar" ? "يرجى اختيار تصنيف المصروف قبل المتابعة." : "Please choose the expense category first.");
      return;
    }
    if (!fundingEntity) {
      setFundingError(true);
      scrollToField("funding");
      Alert.alert(language === "ar" ? "اختر مصدر التمويل" : "Choose funding source", language === "ar" ? "حدد جهة التمويل: الخزينة المركزية للمالك أو عهدة موظف / حارس ميداني." : "Choose the funding entity: the owner treasury or a staff float.");
      return;
    }
    const staffEntity = fundingEntity === "staff";
    if (staffEntity) {
      if (!staffFloatId) {
        setStaffError(true);
        scrollToField("staff");
        Alert.alert(language === "ar" ? "اختر عهدة الموظف" : "Choose a staff float", language === "ar" ? "حدد الموظف / الحارس الذي سيدفع المصروف." : "Select the staff member who will pay this expense.");
        return;
      }
      if (!staffMode) {
        setStaffModeError(true);
        scrollToField("staffMode");
        Alert.alert(language === "ar" ? "اختر طريقة السداد" : "Choose how the staff pays", language === "ar" ? "حدد هل يُخصم من العهدة النقدية أم دُفع من جيب الموظف." : "Choose whether it is deducted from the held float or paid from the staff pocket.");
        return;
      }
    } else if (!fundingChannel) {
      setChannelError(true);
      scrollToField("channel");
      Alert.alert(language === "ar" ? "اختر طريقة الصرف" : "Choose payment method", language === "ar" ? "حدد كاش أو تحويل CliQ قبل حفظ المصروف." : "Choose Cash or CliQ transfer before saving the expense.");
      return;
    } else if (fundingChannel !== "vault-cash" && !ownerAccountId) {
      setChannelError(true);
      scrollToField("channel");
      Alert.alert(language === "ar" ? "اختر حساب الخزينة" : "Choose a treasury account", language === "ar" ? "حدد الحساب المفعل الذي سيُحمَّل عليه المصروف." : "Select the active account the expense will be charged to.");
      return;
    }
    if (!note.trim()) {
      setNoteError(true);
      scrollToField("note");
      Alert.alert(language === "ar" ? "البيان مطلوب" : "Description required", language === "ar" ? "أدخل بيانًا مختصرًا للمصروف." : "Add a short expense description.");
      return;
    }
    const normalizedDate = expenseDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || Number.isNaN(new Date(`${normalizedDate}T00:00:00.000Z`).getTime())) {
      Alert.alert(language === "ar" ? "تاريخ صرف غير صحيح" : "Invalid expense date", language === "ar" ? "حدد تاريخًا صحيحًا للمصروف." : "Choose a valid expense date.");
      return;
    }
    const scopedChalets = chalets.filter((item) => selectedChaletIds.includes(item.id));
    if (!scopedChalets.length) {
      Alert.alert(language === "ar" ? "اختر شاليهًا" : "Choose a chalet", language === "ar" ? "اختر الشاليه المرتبط بهذا المصروف للمتابعة." : "Choose the chalet related to this expense to continue.");
      return;
    }
    const chalet = scopedChalets.length === 1 ? scopedChalets[0] : undefined;
    const generalAllocations = scopedChalets.length > 1 ? splitExpenseAcrossChalets(numeric, scopedChalets) : undefined;
    if (scopedChalets.length > 1 && !generalAllocations?.length) {
      Alert.alert(language === "ar" ? "لا توجد وحدات" : "No units available", language === "ar" ? "أضف وحدة واحدة على الأقل قبل تسجيل مصروف عام." : "Add at least one unit before recording a shared expense.");
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
      const payload = { chaletId: chalet?.id, chaletName: chalet?.name, generalAllocations, amount: numeric, date: normalizedDate, category, note: note.trim(), paymentMethod: resolvedPaymentMethod, receiptUri: managedReceiptUri, fundingEntity: fundingEntity ?? undefined, fundingChannel: fundingChannelValue, fundingSourceId, fundingSourceLabel, isFloatExpense: staffEntity && staffMode === "float" ? true : undefined, isStaffReimbursement: staffEntity && staffMode === "reimbursement" ? true : undefined };
      if (editingExpenseId) await updateExpense(editingExpenseId, payload);
      else await addExpense(payload);
      void triggerHaptic(); setModalOpen(false);
      notifyExpenseSaved();
      resetForm();
    } catch {
      Alert.alert(language === "ar" ? "تعذر الحفظ" : "Could not save", language === "ar" ? "لا تملك صلاحية إضافة المصروف أو تعذر الحفظ." : "You do not have permission to add this expense or it could not be saved.");
    } finally {
      endSubmit();
    }
  };
  const remove = (expense: Expense) => {
    const linkedTaskTitle = expense.maintenanceTaskId ? maintenanceTasks.find((task) => task.id === expense.maintenanceTaskId)?.title : undefined;
    Alert.alert(language === "ar" ? "حذف المصروف" : "Delete expense", language === "ar" ? (linkedTaskTitle ? `هذا المصروف مرتبط بمهمة صيانة مكتملة (${linkedTaskTitle}). هل تريد حذف السند المالي وتصفير تكلفة المهمة؟` : "هل أنت متأكد من حذف هذا المصروف نهائيًا؟") : (linkedTaskTitle ? `This expense is linked to a completed maintenance task (${linkedTaskTitle}). Delete the voucher and reset the task cost to zero?` : "Delete this expense permanently?"), [{ text: language === "ar" ? "إلغاء" : "Cancel", style: "cancel" }, { text: language === "ar" ? "حذف" : "Delete", style: "destructive", onPress: () => void deleteExpense(expense.id).catch(() => Alert.alert(language === "ar" ? "تعذر الحذف" : "Could not delete", language === "ar" ? "لا تملك صلاحية حذف المصروف." : "You do not have permission to delete this expense.")) }]);
  };

  if (!can("view_financial_reports")) return <ScreenContainer><View style={[styles.locked, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="lock" size={30} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", marginTop: 9, textAlign: align }}>{language === "ar" ? "المصروفات للإدارة فقط" : "Expenses are for management only"}</Text></View></ScreenContainer>;
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><View style={styles.screen}>
    <View style={styles.headerWrap}><SubScreenHeader title={language === "ar" ? "المصروفات" : "Expenses"} action={{ label: language === "ar" ? "إضافة" : "Add", icon: "add", accessibilityLabel: language === "ar" ? "إضافة مصروف" : "Add expense", onPress: openForm }} /></View>
    <View style={styles.scope}><ChaletSwitcher /></View>
    
    <View style={[styles.navBar, { flexDirection: "row" }]}>{period !== "custom" ? <Pressable accessibilityRole="button" accessibilityLabel={isRTL ? forwardLabel : backLabel} onPress={() => shiftPeriod(isRTL ? 1 : -1)} style={[styles.periodArrow, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={22} color={colors.primary} /></Pressable> : <View style={styles.periodArrow} />}<View style={styles.navChips}><ChoiceChip active={period === "today"} label={language === "ar" ? "اليوم" : "Today"} onPress={() => { setPeriod("today"); setTodayAnchor(todayISO()); }} colors={colors} isRTL={isRTL} /><ChoiceChip active={period === "month"} label={language === "ar" ? "هذا الشهر" : "This month"} onPress={() => { setPeriod("month"); setMonthAnchor(todayISO().slice(0, 7)); }} colors={colors} isRTL={isRTL} /><ChoiceChip active={period === "custom"} label={language === "ar" ? "فترة مخصصة" : "Custom range"} onPress={() => setPeriod("custom")} colors={colors} isRTL={isRTL} /></View>{period !== "custom" ? <Pressable accessibilityRole="button" accessibilityLabel={isRTL ? backLabel : forwardLabel} onPress={() => shiftPeriod(isRTL ? -1 : 1)} style={[styles.periodArrow, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={colors.primary} /></Pressable> : <View style={styles.periodArrow} />}</View><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, marginTop: 5, marginHorizontal: 16, textAlign: align }}>{periodLabel}</Text>{period === "custom" ? <View style={[styles.customRange, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "بداية فترة المصروفات" : "Expense period start"} onPress={() => setRangePickerOpen(true)} style={[styles.rangeField, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="event" size={15} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 10.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "من" : "From"} · {formatDate(customStart)}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "نهاية فترة المصروفات" : "Expense period end"} onPress={() => setRangePickerOpen(true)} style={[styles.rangeField, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="event" size={15} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 10.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إلى" : "To"} · {formatDate(customEnd)}</Text></Pressable></View> : null}<View style={[styles.monthCounters, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><View style={styles.stat}><Text style={{ color: colors.muted, fontSize: 9.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إجمالي المصروفات" : "Total expenses"}</Text><Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", marginTop: 3, writingDirection: "ltr", textAlign: align }}>{formatMoney(total, settings.currency)}</Text></View><View style={styles.stat}><Text style={{ color: colors.muted, fontSize: 9.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "من الخزينة المركزية" : "From central treasury"}</Text><Text style={{ color: colors.primary, fontSize: 14, fontWeight: "900", marginTop: 3, writingDirection: "ltr", textAlign: align }}>{formatMoney(periodTreasuryTotal, settings.currency)}</Text></View><View style={styles.stat}><Text style={{ color: colors.muted, fontSize: 9.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "من عُهد الموظفين" : "From staff floats"}</Text><Text style={{ color: "#F59E0B", fontSize: 14, fontWeight: "900", marginTop: 3, writingDirection: "ltr", textAlign: align }}>{formatMoney(periodFloatTotal, settings.currency)}</Text></View>{periodReimbursementTotal > 0 ? <View style={styles.stat}><Text style={{ color: colors.muted, fontSize: 9.5, fontWeight: "800", textAlign: align }}>{language === "ar" ? "ذمم مستحقة لموظفين" : "Due to staff"}</Text><Text style={{ color: "#A855F7", fontSize: 14, fontWeight: "900", marginTop: 3, writingDirection: "ltr", textAlign: align }}>{formatMoney(periodReimbursementTotal, settings.currency)}</Text></View> : null}</View>
    <DateRangePicker visible={rangePickerOpen} start={customStart} end={customEnd} onClose={() => setRangePickerOpen(false)} onApply={applyRange} />
    <FlatList data={ledgerRows} keyExtractor={(row) => (row.kind === "header" ? `header-${row.date}` : row.item.id)} contentContainerStyle={styles.content} ListEmptyComponent={<View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="receipt-long" size={28} color={colors.muted} /><Text style={{ color: colors.foreground, fontWeight: "900", marginTop: 9, textAlign: align }}>{language === "ar" ? (selectedChaletId ? "لا توجد مصروفات لهذا الشاليه" : "لا توجد مصروفات مسجلة") : "No recorded expenses"}</Text></View>} renderItem={({ item }) => {
      if (item.kind === "header") return <View style={[styles.dateHeader, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}><MaterialIcons name="event" size={13} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 10.5, fontWeight: "900", writingDirection: "ltr" }}>{weekdayLabel(item.date, language)}، {formatDate(item.date)}</Text></View>;
      const meta = CATEGORY_META[item.item.category];
      const isGeneral = !item.item.chaletId;
      const mode = fundingModeFor(item.item);
      const modeMeta = FUNDING_MODE_META[mode];
      const entityLabel = item.item.fundingEntity === "staff" ? (item.item.fundingSourceLabel || (language === "ar" ? "عهدة موظف / حارس" : "Staff float")) : (language === "ar" ? "المالك" : "Owner");
      const categoryLabel = item.item.isStaffReimbursementSettled ? (language === "ar" ? "أخرى / تصفية ذمة موظف" : "Other / settle staff liability") : (language === "ar" ? meta.ar : meta.en);
      const modeLabel = item.item.isStaffReimbursementSettled ? (language === "ar" ? "تصفية ذمة موظف" : "Staff liability settled") : (language === "ar" ? modeMeta.ar : modeMeta.en);
      return <View style={[styles.expense, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.expenseHeader, { flexDirection: row }]}><View style={[styles.expenseIcon, { backgroundColor: "#F59E0B" + "18" }]}><MaterialIcons name={meta.icon} size={18} color="#F59E0B" /></View><View style={styles.flex}><View style={[styles.cardTopLine, { flexDirection: row }]}><View style={[styles.categoryBadge, { backgroundColor: colors.primary + "13" }]}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>{categoryLabel}</Text></View><View style={[styles.scopeBadge, { backgroundColor: isGeneral ? colors.muted + "18" : colors.success + "12" }]}><Text style={{ color: isGeneral ? colors.muted : colors.success, fontSize: 10, fontWeight: "900" }}>{isGeneral ? (language === "ar" ? "عام" : "General") : item.item.chaletName}</Text></View></View><Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", marginTop: 6, textAlign: align }}>{item.item.note}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 4, textAlign: align }}>{formatRecordedAt(item.item.createdAt, language)}</Text></View><View style={styles.amountWrap}><Text style={{ color: "#F59E0B", fontSize: 15, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(item.item.amount, settings.currency)}</Text><Text style={{ color: colors.muted, fontSize: 9, marginTop: 2, writingDirection: "ltr" }}>{item.item.paymentMethod === "click" ? "CliQ" : (language === "ar" ? "كاش" : "Cash")}</Text></View></View><View style={[styles.fundingRow, { flexDirection: row }]}>{mode === "reimbursement" ? <View style={[styles.modeBadge, { backgroundColor: "#A855F714" }]}><MaterialIcons name={modeMeta.icon} size={12} color="#A855F7" /><Text numberOfLines={1} style={{ color: "#A855F7", fontSize: 10, fontWeight: "900" }}>{language === "ar" ? `من الجيب الخاص · ${entityLabel}` : `Out of pocket · ${entityLabel}`}</Text></View> : mode === "float" ? <View style={[styles.modeBadge, { backgroundColor: "#F59E0B" + "1B" }]}><MaterialIcons name={modeMeta.icon} size={12} color="#F59E0B" /><Text numberOfLines={1} style={{ color: "#F59E0B", fontSize: 10, fontWeight: "900" }}>{language === "ar" ? `خصم من عهدة · ${entityLabel}` : `Float deduction · ${entityLabel}`}</Text></View> : <View style={[styles.modeBadge, { backgroundColor: "#10B98114" }]}><MaterialIcons name={modeMeta.icon} size={12} color="#10B981" /><Text numberOfLines={1} style={{ color: "#10B981", fontSize: 10, fontWeight: "900" }}>{language === "ar" ? `الخزينة المركزية · ${item.item.fundingChannel === "cliq" ? "تحويل CliQ" : item.item.fundingChannel === "iban" ? "حوالة بنكية" : "كاش نقدي"}` : `Central treasury · ${item.item.fundingChannel === "cliq" ? "CliQ" : item.item.fundingChannel === "iban" ? "Bank" : "Cash"}`}</Text></View>}{item.item.isStaffReimbursementSettled ? <View style={[styles.modeBadge, { backgroundColor: colors.primary + "13" }]}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>{modeLabel}</Text></View> : null}</View><View style={[styles.cardFooter, { flexDirection: row }]}><View style={[styles.loggedBadge, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="account-circle" size={15} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800" }}>{language === "ar" ? `المسجل: ${item.item.createdByName ?? "مستخدم التطبيق"}` : `By: ${item.item.createdByName ?? "App user"}`}</Text></View>{item.item.receiptUri ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "عرض الفاتورة" : "View invoice"} onPress={() => setReceiptPreviewUri(item.item.receiptUri!)} style={[styles.receiptButton, { borderColor: colors.border }]}><MaterialIcons name="receipt" size={14} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "الفاتورة" : "Invoice"}</Text></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تعديل المصروف" : "Edit expense"} onPress={() => openEdit(item.item)} style={[styles.edit, { backgroundColor: colors.primary + "14" }]}><MaterialIcons name="edit" size={17} color={colors.primary} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حذف المصروف" : "Delete expense"} onPress={() => remove(item.item)} style={[styles.delete, { backgroundColor: colors.error + "12" }]}><MaterialIcons name="delete-outline" size={17} color={colors.error} /></Pressable></View></View>;
    }} />
    <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => !isSubmitting && setModalOpen(false)}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: "#000000", shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: -8 }, elevation: 50 }]}><View style={[styles.modalHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900", textAlign: align }}>{editingExpenseId ? (language === "ar" ? "تعديل مصروف" : "Edit expense") : (language === "ar" ? "إضافة مصروف" : "Add expense")}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{editingExpenseId ? (language === "ar" ? `سيُسجل التعديل باسم: ${loggedBy}` : `Edit will be logged by: ${loggedBy}`) : (language === "ar" ? `سيُسجل باسم: ${loggedBy}` : `Logged by: ${loggedBy}`)}</Text></View><Pressable disabled={isSubmitting} onPress={() => setModalOpen(false)} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceMuted, opacity: pressed || isSubmitting ? 0.65 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><ScrollView ref={formScrollRef} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><View onLayout={registerField("scope")} style={[styles.fieldBlock, { borderColor: scopeError ? "#F43F5E" : colors.border, backgroundColor: scopeError ? "#F43F5E0D" : colors.surfaceMuted, shadowColor: "#F43F5E", shadowOpacity: scopeError ? 0.22 : 0, shadowRadius: scopeError ? 12 : 0, elevation: scopeError ? 6 : 0 }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "نطاق المصروف / الشاليه" : "Expense scope / chalet"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 4, textAlign: align }}>{language === "ar" ? "اختر شاليهًا واحدًا أو أكثر، أو فعّل «كافة الشاليهات» لمصروف عام." : "Select one or more chalets, or enable \"All properties\" for a general expense."}</Text><View style={styles.scopeChecklist}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allChaletsSelected }} accessibilityLabel={language === "ar" ? "كافة الشاليهات / مصروف عام" : "All properties / General expense"} onPress={toggleAllChalets} style={({ pressed }) => [styles.checkRow, { backgroundColor: allChaletsSelected ? colors.primary + "14" : colors.surface, borderColor: allChaletsSelected ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={allChaletsSelected ? "check-box" : "check-box-outline-blank"} size={18} color={allChaletsSelected ? colors.primary : colors.muted} /><Text numberOfLines={1} style={{ flex: 1, color: allChaletsSelected ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: isArabicLayout ? "right" : "left" }}>{language === "ar" ? "كافة الشاليهات / مصروف عام" : "All properties / General expense"}</Text><View style={[styles.filterDot, { backgroundColor: colors.primary }]} /></Pressable>{chalets.map((chalet) => { const chaletSelected = selectedChaletIds.includes(chalet.id); return <Pressable key={chalet.id} accessibilityRole="checkbox" accessibilityState={{ checked: chaletSelected }} accessibilityLabel={chalet.name} onPress={() => toggleChalet(chalet.id)} style={({ pressed }) => [styles.checkRow, { backgroundColor: chaletSelected ? colors.primary + "14" : colors.surface, borderColor: chaletSelected ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={chaletSelected ? "check-box" : "check-box-outline-blank"} size={18} color={chaletSelected ? colors.primary : colors.muted} /><Text numberOfLines={1} style={{ flex: 1, color: chaletSelected ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "800", textAlign: isArabicLayout ? "right" : "left" }}>{chalet.name}</Text><View style={[styles.filterDot, { backgroundColor: chalet.color }]} /></Pressable>; })}</View>{scopeError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى اختيار شاليه واحد على الأقل" : "Please select at least one chalet"}</Text> : null}</View><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "المبلغ (JOD)" : "Amount (JOD)"}</Text><View onLayout={registerField("amount")} style={[styles.fieldBlock, { borderColor: amountError ? "#F43F5E" : colors.border, backgroundColor: amountError ? "#F43F5E0D" : colors.surfaceMuted, shadowColor: "#F43F5E", shadowOpacity: amountError ? 0.22 : 0, shadowRadius: amountError ? 12 : 0, elevation: amountError ? 6 : 0 }]}><View style={[styles.amountRow, { flexDirection: row }]}><TextInput value={amount} onChangeText={(text) => { setAmount(text); setAmountError(false); }} keyboardType="decimal-pad" placeholder={language === "ar" ? "المبلغ (د.أ)" : "Amount (JOD)"} placeholderTextColor={colors.muted} style={[styles.input, styles.amountInput, { color: colors.foreground, borderColor: amountError ? "#F43F5E" : colors.border, backgroundColor: colors.surfaceMuted, textAlign: align, borderWidth: amountError ? 2 : 1 }]} /><View style={[styles.amountSuffix, { borderColor: amountError ? "#F43F5E" : colors.border, backgroundColor: colors.surfaceMuted, borderWidth: amountError ? 2 : 1 }]}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900" }}>{language === "ar" ? "د.أ" : "JOD"}</Text></View></View>{amountError ? <Text style={styles.fieldError}>{language === "ar" ? "أدخل مبلغ المصروف (أكبر من صفر)" : "Enter an expense amount greater than zero"}</Text> : null}</View><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "تصنيف المصروف" : "Expense category"}</Text><View onLayout={registerField("category")} style={[styles.fieldBlock, { borderColor: categoryError ? "#F43F5E" : colors.border, backgroundColor: categoryError ? "#F43F5E0D" : colors.surfaceMuted, shadowColor: "#F43F5E", shadowOpacity: categoryError ? 0.22 : 0, shadowRadius: categoryError ? 12 : 0, elevation: categoryError ? 6 : 0 }]}><ExpenseDropdownField value={category ? CATEGORY_META[category].ar : null} placeholder={language === "ar" ? "اختر التصنيف..." : "Choose a category..."} error={categoryError} icon={category ? CATEGORY_META[category].icon : undefined} onPress={() => setDropdown({ kind: "category" })} colors={colors} language={language} />{categoryError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى اختيار تصنيف المصروف" : "Please choose a category"}</Text> : null}</View><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "مصدر التمويل" : "Funding source"}</Text><View onLayout={registerField("funding")} style={[styles.fundingFrame, { borderColor: fundingError ? "#F43F5E" : colors.primary + "35", backgroundColor: fundingError ? "#F43F5E0D" : colors.primary + "08" }]}><ExpenseDropdownField value={fundingEntity ? expenseFundingEntityLabel(fundingEntity, language) : null} placeholder={language === "ar" ? "اختر مصدر التمويل..." : "Choose the funding source..."} error={fundingError} icon={fundingEntity === "staff" ? "person" : "account-balance"} onPress={() => setDropdown({ kind: "funding" })} colors={colors} language={language} />{fundingError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى تحديد مصدر التمويل" : "Please choose a funding source"}</Text> : null}{fundingEntity === "owner" ? <View onLayout={registerField("channel")} style={[styles.fieldBlock, { borderColor: channelError ? "#F43F5E" : colors.border, backgroundColor: channelError ? "#F43F5E0D" : colors.surfaceMuted, marginTop: 11 }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "قناة الصرف والحساب" : "Payment channel & account"}</Text><ExpenseDropdownField value={fundingChannel ? expenseFundingChannelLabel(fundingChannel, language) : null} placeholder={language === "ar" ? "اختر قناة الصرف..." : "Choose the payment channel..."} error={channelError} icon="payments" onPress={() => setDropdown({ kind: "channel" })} colors={colors} language={language} /><Text style={{ color: colors.muted, fontSize: 10, marginTop: 9, textAlign: align }}>{language === "ar" ? "القنوات المتاحة: نقد من صندوق الخزينة، تحويل عبر CliQ (المالك)، حوالة بنكية IBAN." : "Available channels: treasury cash, owner CliQ, bank transfer (IBAN)."}</Text>{fundingChannel && fundingChannel !== "vault-cash" ? <><Text style={{ color: colors.muted, fontSize: 10, marginTop: 9, textAlign: align }}>{language === "ar" ? "اختر الحساب المالي المفعل الذي سيُحمَّل عليه المصروف:" : "Select the active owner treasury account to be charged:"}</Text><View style={[styles.accountRow, { flexDirection: row }]}>{channelAccounts.length ? channelAccounts.map((account) => <ChoiceChip key={account.id} active={ownerAccountId === account.id} label={account.label} onPress={() => setOwnerAccountId(account.id)} colors={colors} isRTL={isRTL} />) : <Text style={{ color: colors.warning, fontSize: 10, textAlign: align }}>{language === "ar" ? "لا توجد حسابات مفعلة لهذه القناة — أضفها من «طرق الدفع والحسابات المالية»." : "No active accounts for this channel — add them under \"Payment methods & financial accounts\"."}</Text>}</View></> : null}{channelError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى اختيار قناة الصرف والحساب" : "Please choose the payment channel & account"}</Text> : null}</View> : null}{fundingEntity === "staff" ? <View onLayout={registerField("staff")} style={[styles.fieldBlock, { borderColor: staffError ? "#F43F5E" : colors.border, backgroundColor: staffError ? "#F43F5E0D" : colors.surfaceMuted, marginTop: 11 }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "اسم الموظف / الحارس" : "Staff / guard name"}</Text>{staffFloats.length ? <ExpenseDropdownField value={staffFloatLabel} placeholder={language === "ar" ? "اختر الموظف / الحارس..." : "Choose the staff / guard..."} error={staffError} icon="person" onPress={() => setDropdown({ kind: "staff" })} colors={colors} language={language} /> : <Text style={{ color: colors.warning, fontSize: 10, marginTop: 9, textAlign: align }}>{language === "ar" ? "لا توجد عُهد موظفين مفعلة — أضفها من «طرق الدفع والحسابات المالية»." : "No active staff floats — add them under \"Payment methods & financial accounts\"."}</Text>}{staffError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى اختيار الموظف / الحارس" : "Please choose the staff member"}</Text> : null}{staffFloatId ? <View onLayout={registerField("staffMode")} style={[styles.fieldBlock, { borderColor: staffModeError ? "#F43F5E" : colors.border, backgroundColor: staffModeError ? "#F43F5E0D" : colors.surfaceMuted, marginTop: 11 }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "طريقة السداد" : "Payment mode"}</Text><ExpenseDropdownField value={staffModeLabel} placeholder={language === "ar" ? "اختر طريقة السداد..." : "Choose the payment mode..."} error={staffModeError} icon={staffMode === "float" ? "account-balance-wallet" : staffMode === "reimbursement" ? "payments" : undefined} onPress={() => setDropdown({ kind: "staffMode" })} colors={colors} language={language} />{staffModeError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى اختيار طريقة السداد" : "Please choose a payment mode"}</Text> : null}<Text style={{ color: colors.muted, fontSize: 10, marginTop: 9, textAlign: align }}>{staffMode === "float" ? (language === "ar" ? "يُخصم المبلغ من عهدة الموظف ويظهر ضمن «المرجوع/الخصم» في تسوية العُهد." : "The amount is deducted from the staff float and shows under Refunded/deducted in float settlements.") : staffMode === "reimbursement" ? (language === "ar" ? "لا يُمسّ رصيد العهدة؛ يتحول المبلغ إلى ذمة على المالك تُردّ للموظف لاحقًا." : "The float balance is untouched; the amount becomes a liability due to the staff to be repaid later.") : null}</Text></View> : null}</View> : null}</View><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "البيان / ملاحظات المصروف" : "Expense description / notes"}</Text><View onLayout={registerField("note")} style={[styles.fieldBlock, { borderColor: noteError ? "#F43F5E" : colors.border, backgroundColor: noteError ? "#F43F5E0D" : colors.surfaceMuted, shadowColor: "#F43F5E", shadowOpacity: noteError ? 0.22 : 0, shadowRadius: noteError ? 12 : 0, elevation: noteError ? 6 : 0 }]}><TextInput value={note} onChangeText={(text) => { setNote(text); setNoteError(false); }} multiline placeholder={language === "ar" ? "اكتب وصف وبيان المصروف هنا..." : "Write the expense description and notes here..."} placeholderTextColor={colors.muted} style={[styles.input, styles.noteInput, { color: colors.foreground, borderColor: noteError ? "#F43F5E" : colors.border, backgroundColor: colors.surfaceMuted, textAlign: align, borderWidth: noteError ? 2 : 1 }]} />{noteError ? <Text style={styles.fieldError}>{language === "ar" ? "يرجى كتابة بيان المصروف" : "Please write an expense description"}</Text> : null}</View><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "تاريخ الصرف" : "Expense date"}</Text><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تغيير تاريخ الصرف" : "Change expense date"} onPress={() => setDatePickerOpen(true)} style={[styles.dateField, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}><MaterialIcons name="calendar-month" size={18} color={colors.primary} /><Text style={[styles.flex, { color: colors.foreground, fontSize: 13, fontWeight: "800", textAlign: align }]}>{weekdayLabel(expenseDate, language)}، {formatDate(expenseDate)}</Text><MaterialIcons name="keyboard-arrow-down" size={20} color={colors.muted} /></Pressable>{datePickerOpen ? <View style={[styles.inlineDatePicker, { backgroundColor: colors.background, borderColor: colors.border }]}><DateTimePicker mode="date" value={new Date(`${expenseDate}T12:00:00`)} is24Hour={false} locale="ar-JO" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={onDatePick} /><RipplePressable rippleColor={colors.background + "3D"} onPress={() => setDatePickerOpen(false)} style={({ pressed }) => [styles.donePicker, { backgroundColor: "#F59E0B", opacity: pressed ? 0.72 : 1 }]}><Text style={{ color: colors.background, fontSize: 12, fontWeight: "900" }}>{language === "ar" ? "تم" : "Done"}</Text></RipplePressable></View> : null}<Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "إرفاق الفاتورة / الوصل" : "Attach invoice / receipt"}</Text>{receiptUri ? <View style={[styles.selectedReceipt, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "عرض الفاتورة" : "View receipt"} onPress={() => setReceiptPreviewUri(receiptUri)}><Image source={{ uri: receiptUri }} style={styles.thumbnail} /></Pressable><View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 11, textAlign: align }}>{language === "ar" ? "تم إرفاق صورة الوصل" : "Receipt image attached"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 3, textAlign: align }}>{language === "ar" ? "اضغط الصورة للمعاينة." : "Tap image to preview."}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إزالة الفاتورة" : "Remove receipt"} onPress={() => setReceiptUri(undefined)} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}><MaterialIcons name="close" size={19} color={colors.error} /></Pressable></View> : <View style={[styles.attachmentChoices, { flexDirection: row }]}><AttachmentButton label={language === "ar" ? "الكاميرا" : "Camera"} icon="photo-camera" onPress={() => void chooseReceipt("camera")} colors={colors} /><AttachmentButton label={language === "ar" ? "المعرض" : "Gallery"} icon="photo-library" onPress={() => void chooseReceipt("library")} colors={colors} /></View>}<RipplePressable disabled={isSubmitting} rippleColor={colors.background + "3D"} onPress={() => void save()} style={({ pressed }) => [styles.save, { backgroundColor: "#F59E0B", opacity: pressed || isSubmitting ? 0.7 : 1 }]}>{isSubmitting ? <ActivityIndicator size="small" color={colors.background} /> : <MaterialIcons name="save" size={18} color={colors.background} />}<Text style={{ color: colors.background, fontSize: 13, fontWeight: "900" }}>{isSubmitting ? (language === "ar" ? "جارٍ الحفظ" : "Saving") : (editingExpenseId ? (language === "ar" ? "حفظ التعديلات" : "Save changes") : (language === "ar" ? "حفظ المصروف" : "Save expense"))}</Text></RipplePressable></ScrollView></View></View></Modal>
    <ExpenseDropdownSheet visible={dropdown?.kind === "category"} title={language === "ar" ? "تصنيف المصروف" : "Expense category"} options={EXPENSE_CATEGORIES.map((key) => ({ key, label: CATEGORY_META[key].ar, icon: CATEGORY_META[key].icon }))} selectedKey={category} onSelect={(key) => { setCategory(key as ExpenseCategory); setCategoryError(false); setDropdown(null); }} onCancel={() => setDropdown(null)} colors={colors} language={language} />
    <ExpenseDropdownSheet visible={dropdown?.kind === "funding"} title={language === "ar" ? "مصدر التمويل" : "Funding source"} options={EXPENSE_FUNDING_ENTITIES.map((entity) => ({ key: entity, label: expenseFundingEntityLabel(entity, language), icon: entity === "staff" ? "person" : "account-balance" }))} selectedKey={fundingEntity} onSelect={(key) => { setFundingEntity(key as ExpenseFundingEntity); setFundingChannel(null); setOwnerAccountId(null); setStaffFloatId(null); setStaffMode(null); setPaymentMethod(null); setFundingError(false); setChannelError(false); setStaffError(false); setStaffModeError(false); setDropdown(null); }} onCancel={() => setDropdown(null)} colors={colors} language={language} />
    <ExpenseDropdownSheet visible={dropdown?.kind === "channel"} title={language === "ar" ? "قناة الصرف والحساب" : "Payment channel"} options={EXPENSE_FUNDING_CHANNELS.map((channel) => ({ key: channel, label: expenseFundingChannelLabel(channel, language), icon: channel === "vault-cash" ? "payments" : channel === "cliq" ? "bolt" : "account-balance" }))} selectedKey={fundingChannel} onSelect={(key) => { setFundingChannel(key as ExpenseFundingChannel); setOwnerAccountId(null); setPaymentMethod(key === "vault-cash" ? "cash" : key === "cliq" ? "click" : null); setChannelError(false); setDropdown(null); }} onCancel={() => setDropdown(null)} colors={colors} language={language} />
    <ExpenseDropdownSheet visible={dropdown?.kind === "staff"} title={language === "ar" ? "اسم الموظف / الحارس" : "Staff / guard"} options={staffFloats.map((account) => ({ key: account.id, label: account.label, icon: "person" }))} selectedKey={staffFloatId} onSelect={(key) => { setStaffFloatId(key); setStaffError(false); setDropdown(null); }} onCancel={() => setDropdown(null)} colors={colors} language={language} />
    <ExpenseDropdownSheet visible={dropdown?.kind === "staffMode"} title={language === "ar" ? "طريقة السداد" : "Payment mode"} options={STAFF_MODE_OPTIONS.map((option) => ({ key: option.id, label: language === "ar" ? option.ar : option.en, icon: option.icon }))} selectedKey={staffMode} onSelect={(key) => { setStaffMode(key as "float" | "reimbursement"); setStaffModeError(false); setDropdown(null); }} onCancel={() => setDropdown(null)} colors={colors} language={language} />
    <Modal visible={Boolean(receiptPreviewUri)} transparent animationType="fade" onRequestClose={() => setReceiptPreviewUri(null)}><View style={styles.previewBackdrop}><View style={[styles.previewHeader, { flexDirection: row }]}><MaterialIcons name="receipt-long" size={18} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: align }}>{language === "ar" ? "معاينة الفاتورة" : "Receipt preview"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق المعاينة" : "Close preview"} onPress={() => setReceiptPreviewUri(null)} style={[styles.previewClose, { backgroundColor: colors.surface }]}><MaterialIcons name="close" size={23} color={colors.foreground} /></Pressable>{receiptPreviewUri ? <Image source={{ uri: receiptPreviewUri }} resizeMode="contain" style={styles.fullReceipt} /> : null}</View></Modal>
  </View></ScreenContainer>;
}

function ChoiceChip({ active, label, icon, onPress, colors, isRTL }: { active: boolean; label: string; icon?: IconName; onPress: () => void; colors: ReturnType<typeof useColors>; isRTL: boolean }) {
  const isArabicChip = isRTL || /[\u0600-\u06FF]/.test(label);
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.choiceChip, { backgroundColor: active ? colors.primary : colors.surfaceMuted, borderColor: active ? colors.primary : colors.border, flexDirection: isArabicChip ? "row-reverse" : "row", opacity: pressed ? 0.72 : 1 }]}>{active ? <MaterialIcons name="check-circle" size={15} color={colors.background} /> : null}{icon ? <MaterialIcons name={icon} size={15} color={active ? colors.background : colors.primary} /> : null}<Text style={{ color: active ? colors.background : colors.foreground, fontSize: 11, fontWeight: "900", textAlign: isArabicChip ? "right" : "left" }}>{label}</Text></Pressable>;
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
  screen: { flex: 1 }, navBar: { marginHorizontal: 16, marginTop: 12, alignItems: "center", justifyContent: "center", gap: 8 }, navChips: { flexDirection: "row", gap: 6, flexShrink: 1, alignItems: "center" }, periodNav: { marginHorizontal: 16, marginTop: 10, alignItems: "center", gap: 8 }, periodArrow: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 }, headerWrap: { paddingHorizontal: 16, paddingTop: 8 }, scope: { paddingHorizontal: 16, marginTop: 4 }, total: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 17, padding: 13, alignItems: "center", gap: 10 }, flex: { flex: 1, minWidth: 0 }, content: { padding: 16, paddingBottom: 120, gap: 8 }, empty: { minHeight: 135, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", padding: 15 }, expense: { borderWidth: 1, borderRadius: 16, padding: 12 }, expenseHeader: { alignItems: "flex-start", gap: 9 }, expenseIcon: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center" }, cardTopLine: { alignItems: "center", gap: 5, flexWrap: "wrap" }, categoryBadge: { minHeight: 23, borderRadius: 9, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" }, scopeBadge: { minHeight: 23, borderRadius: 9, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" }, amountWrap: { alignItems: "flex-end", minWidth: 72 }, fundingRow: { alignItems: "center", gap: 6, marginTop: 9, flexWrap: "wrap" }, entityBadge: { minHeight: 24, borderRadius: 9, paddingHorizontal: 8, alignItems: "center", gap: 4, flexDirection: "row" }, modeBadge: { minHeight: 24, borderRadius: 9, paddingHorizontal: 8, alignItems: "center", gap: 4, flexDirection: "row" }, cardFooter: { alignItems: "center", gap: 7, marginTop: 10 }, loggedBadge: { minHeight: 28, borderRadius: 9, paddingHorizontal: 8, alignItems: "center", gap: 4, flexDirection: "row", flex: 1 }, receiptButton: { minHeight: 28, borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, alignItems: "center", gap: 4, flexDirection: "row" }, edit: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 9 }, delete: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 9 }, dateHeader: { borderRadius: 9, paddingVertical: 5, paddingHorizontal: 9, alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 4 }, monthCounters: { marginHorizontal: 16, marginTop: 10, borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 }, stat: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 9, backgroundColor: undefined }, locked: { borderWidth: 1, borderRadius: 18, padding: 20, margin: 16, alignItems: "center" }, modalBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.92)", justifyContent: "flex-end" }, modal: { maxHeight: "91%", borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 }, modalHeader: { alignItems: "center", gap: 10 }, close: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" }, formContent: { paddingBottom: 10 }, scopeChoices: { paddingVertical: 9, alignItems: "flex-start" }, rtlChoiceRow: { flexDirection: "row", alignItems: "flex-end" }, input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 13, marginTop: 10 }, noteInput: { minHeight: 74, paddingTop: 11, textAlignVertical: "top" }, categories: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9, alignSelf: "flex-end" }, category: { minHeight: 34, borderRadius: 11, paddingHorizontal: 9, alignItems: "center", gap: 5 }, dateField: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", gap: 8, marginTop: 9 }, inlineDatePicker: { borderWidth: 1, borderRadius: 14, padding: 10, marginTop: 8, alignItems: "center", gap: 8 }, donePicker: { minHeight: 38, borderRadius: 11, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" }, fundingEntityRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 }, fundingChannelRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 }, accountRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 }, choiceChip: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, alignItems: "center", gap: 5 }, selectedReceipt: { borderWidth: 1, borderRadius: 14, padding: 10, alignItems: "center", gap: 10, marginTop: 9 }, thumbnail: { width: 52, height: 52, borderRadius: 10 }, attachmentChoices: { flexDirection: "row", gap: 8, marginTop: 9 }, attachmentButton: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, alignItems: "center", gap: 6, flexDirection: "row" }, save: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", gap: 6, flexDirection: "row", marginTop: 15 }, previewBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.88)", padding: 22, justifyContent: "center" }, previewHeader: { alignItems: "center", gap: 7, marginBottom: 12, alignSelf: "center" }, previewClose: { position: "absolute", top: 26, right: 20, width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, fullReceipt: { width: "100%", height: "68%", borderRadius: 16 }, amountInput: { fontSize: 19, fontWeight: "900" }, amountRow: { flexDirection: "row", alignItems: "center", gap: 8 }, amountSuffix: { minHeight: 48, paddingHorizontal: 13, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1 }, fieldBlock: { borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 11 }, fieldError: { color: "#F43F5E", fontSize: 10, fontWeight: "900", marginTop: 6, textAlign: "right" }, scopeChecklist: { marginTop: 10 }, checkRow: { minHeight: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, marginTop: 7, alignItems: "center", flexDirection: "row", gap: 9 }, filterDot: { width: 8, height: 8, borderRadius: 4 }, fundingFrame: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 9 }, periodRow: { marginHorizontal: 16, marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }, customRange: { marginHorizontal: 16, marginTop: 10, flexDirection: "row", gap: 8 }, rangeField: { minHeight: 44, flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, alignItems: "center", gap: 6 }, dropdownField: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", gap: 8, marginTop: 9 }, dropdownBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.92)", justifyContent: "flex-end" }, dropdownSheet: { maxHeight: "78%", borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 24 }, dropdownHeader: { alignItems: "center", gap: 10 }, dropdownOption: { minHeight: 50, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, alignItems: "center", gap: 9, marginTop: 8 }, dropdownCancel: { minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, flexDirection: "row" },
});