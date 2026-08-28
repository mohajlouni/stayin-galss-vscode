import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ChaletSwitcher } from "@/components/chalet-switcher";
import { RipplePressable } from "@/components/ripple-pressable";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { EXPENSE_CATEGORIES, splitExpenseAcrossChalets, type Expense, type ExpenseCategory, formatMoney, todayISO } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useChaletScope } from "@/lib/chalet-scope";
import { persistExpenseReceipt } from "@/lib/expense-receipt";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceAccess } from "@/lib/workspace-access";

const CATEGORY_META: Record<ExpenseCategory, { ar: string; en: string; icon: React.ComponentProps<typeof MaterialIcons>["name"] }> = {
  "guards-salaries": { ar: "رواتب وحراس", en: "Salaries & guards", icon: "badge" },
  maintenance: { ar: "صيانة وإصلاحات", en: "Maintenance", icon: "build" },
  "cleaning-supplies": { ar: "مواد تنظيف", en: "Cleaning supplies", icon: "cleaning-services" },
  utilities: { ar: "فواتير وخدمات", en: "Utilities & services", icon: "bolt" },
  other: { ar: "أخرى", en: "Other", icon: "receipt-long" },
};

type ExpenseScope = "general" | string | null;
type DisplayExpense = Expense & { sharedExpenseTotal?: number; sharedUnitsCount?: number };

function formatRecordedAt(value: string, language: "ar" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString(language === "ar" ? "ar-JO" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })} · ${date.toLocaleTimeString(language === "ar" ? "ar-JO" : "en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function ExpensesScreen() {
  const { expenses = [], chalets, settings, addExpense, deleteExpense } = useBookings();
  const { selectedChaletId } = useChaletScope();
  const { language, isRTL } = useI18n();
  const { triggerHaptic } = useAppPreferences();
  const { can, user } = useWorkspaceAccess();
  const colors = useColors();
  const [modalOpen, setModalOpen] = useState(false);
  const [receiptPreviewUri, setReceiptPreviewUri] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("guards-salaries");
  const [scope, setScope] = useState<ExpenseScope>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "click" | null>(null);
  const [receiptUri, setReceiptUri] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const isArabicLayout = language === "ar" || isRTL;
  const align = isArabicLayout ? "right" : "left";
  const row = isArabicLayout ? "row-reverse" : "row";
  const visibleExpenses = useMemo<DisplayExpense[]>(() => {
    const sharedLabel = language === "ar" ? "مصروف عام" : "Shared expense";
    const scoped = !selectedChaletId ? expenses.map((expense) => expense.generalAllocations?.length ? { ...expense, chaletId: "shared-expense-parent", chaletName: sharedLabel } : expense) : expenses.flatMap((expense) => {
      if (expense.chaletId === selectedChaletId) return [expense];
      const allocation = expense.generalAllocations?.find((item) => item.chaletId === selectedChaletId);
      return allocation ? [{ ...expense, chaletId: allocation.chaletId, chaletName: language === "ar" ? `جزء من مصروف عام · ${formatMoney(expense.amount, settings.currency)}` : `Share of ${formatMoney(expense.amount, settings.currency)} general expense`, amount: allocation.amount, sharedExpenseTotal: expense.amount, sharedUnitsCount: expense.generalAllocations?.length }] : [];
    });
    return scoped.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [expenses, language, selectedChaletId, settings.currency]);
  const total = visibleExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const loggedBy = user?.name?.trim() || (language === "ar" ? "مستخدم التطبيق" : "App user");

  useEffect(() => {
    void ImagePicker.getPendingResultAsync().then((result) => {
      if (!result || "code" in result || result.canceled || !result.assets?.[0]?.uri) return;
      setReceiptUri(result.assets[0].uri);
      setModalOpen(true);
    });
  }, []);

  const openForm = () => {
    setAmount("");
    setNote("");
    setCategory("guards-salaries");
    setScope(null);
    setPaymentMethod(null);
    setReceiptUri(undefined);
    setModalOpen(true);
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
    if (!scope) {
      Alert.alert(language === "ar" ? "اختر نطاق المصروف" : "Choose expense scope", language === "ar" ? "اختر «مصروف عام» أو الشاليه الذي يخصه المصروف قبل إدخال المبلغ." : "Choose General expense or a chalet before entering the amount.");
      return;
    }
    const numeric = Number(amount.replace(",", "."));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      Alert.alert(language === "ar" ? "مبلغ غير صحيح" : "Invalid amount", language === "ar" ? "أدخل مبلغ مصروف أكبر من صفر." : "Enter an expense amount greater than zero.");
      return;
    }
    if (!note.trim()) {
      Alert.alert(language === "ar" ? "البيان مطلوب" : "Description required", language === "ar" ? "أدخل بيانًا مختصرًا للمصروف." : "Add a short expense description.");
      return;
    }
    if (!paymentMethod) {
      Alert.alert(language === "ar" ? "اختر طريقة الصرف" : "Choose payment method", language === "ar" ? "حدد كاش أو تحويل CliQ قبل حفظ المصروف." : "Choose Cash or CliQ transfer before saving the expense.");
      return;
    }
    const chalet = scope === "general" ? undefined : chalets.find((item) => item.id === scope);
    if (scope !== "general" && !chalet) {
      Alert.alert(language === "ar" ? "اختر شاليهًا" : "Choose a chalet", language === "ar" ? "اختر الشاليه المرتبط بهذا المصروف للمتابعة." : "Choose the chalet related to this expense to continue.");
      return;
    }
    const generalAllocations = scope === "general" ? splitExpenseAcrossChalets(numeric, chalets) : undefined;
    if (scope === "general" && !generalAllocations?.length) {
      Alert.alert(language === "ar" ? "لا توجد وحدات" : "No units available", language === "ar" ? "أضف وحدة واحدة على الأقل قبل تسجيل مصروف عام." : "Add at least one unit before recording a shared expense.");
      return;
    }
    const receiptKey = `expense-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setSaving(true);
    try {
      const managedReceiptUri = await persistExpenseReceipt(receiptUri, receiptKey);
      await addExpense({ chaletId: chalet?.id, chaletName: chalet?.name, generalAllocations, amount: numeric, date: todayISO(), category, note: note.trim(), paymentMethod, receiptUri: managedReceiptUri });
      void triggerHaptic(); setModalOpen(false);
    } catch {
      Alert.alert(language === "ar" ? "تعذر الحفظ" : "Could not save", language === "ar" ? "لا تملك صلاحية إضافة المصروف أو تعذر الحفظ." : "You do not have permission to add this expense or it could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  const remove = (id: string) => Alert.alert(language === "ar" ? "حذف المصروف" : "Delete expense", language === "ar" ? "هل تريد حذف هذا المصروف نهائيًا؟" : "Delete this expense permanently?", [{ text: language === "ar" ? "رجوع" : "Back", style: "cancel" }, { text: language === "ar" ? "حذف" : "Delete", style: "destructive", onPress: () => void deleteExpense(id).catch(() => Alert.alert(language === "ar" ? "تعذر الحذف" : "Could not delete", language === "ar" ? "لا تملك صلاحية حذف المصروف." : "You do not have permission to delete this expense.")) }]);

  if (!can("view_financial_reports")) return <ScreenContainer><View style={[styles.locked, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="lock" size={30} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", marginTop: 9, textAlign: align }}>{language === "ar" ? "المصروفات للإدارة فقط" : "Expenses are for management only"}</Text></View></ScreenContainer>;
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><View style={styles.screen}>
    <View style={styles.headerWrap}><SubScreenHeader title={language === "ar" ? "المصروفات" : "Expenses"} action={{ label: language === "ar" ? "إضافة" : "Add", icon: "add", accessibilityLabel: language === "ar" ? "إضافة مصروف" : "Add expense", onPress: openForm }} /></View>
    <View style={styles.scope}><ChaletSwitcher /></View>
    <View style={[styles.total, { backgroundColor: "#F59E0B" + "12", borderColor: "#F59E0B" + "65", flexDirection: row }]}><MaterialIcons name="receipt-long" size={20} color="#F59E0B" /><View style={styles.flex}><Text style={{ color: colors.muted, fontSize: 11, textAlign: align }}>{language === "ar" ? "إجمالي المصروفات المعروضة" : "Total displayed expenses"}</Text><Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "900", marginTop: 3, writingDirection: "ltr", textAlign: align }}>{formatMoney(total, settings.currency)}</Text></View></View>
    <FlatList data={visibleExpenses} keyExtractor={(item) => item.id} contentContainerStyle={styles.content} ListEmptyComponent={<View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="receipt-long" size={28} color={colors.muted} /><Text style={{ color: colors.foreground, fontWeight: "900", marginTop: 9, textAlign: align }}>{language === "ar" ? (selectedChaletId ? "لا توجد مصروفات لهذا الشاليه" : "لا توجد مصروفات مسجلة") : "No recorded expenses"}</Text></View>} renderItem={({ item }) => {
      const meta = CATEGORY_META[item.category];
      const isGeneral = !item.chaletId;
      return <View style={[styles.expense, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.expenseHeader, { flexDirection: row }]}><View style={[styles.expenseIcon, { backgroundColor: "#F59E0B" + "18" }]}><MaterialIcons name={meta.icon} size={18} color="#F59E0B" /></View><View style={styles.flex}><View style={[styles.cardTopLine, { flexDirection: row }]}><View style={[styles.categoryBadge, { backgroundColor: colors.primary + "13" }]}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? meta.ar : meta.en}</Text></View><View style={[styles.scopeBadge, { backgroundColor: isGeneral ? colors.muted + "18" : colors.success + "12" }]}><Text style={{ color: isGeneral ? colors.muted : colors.success, fontSize: 10, fontWeight: "900" }}>{isGeneral ? (language === "ar" ? "عام" : "General") : item.chaletName}</Text></View></View><Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", marginTop: 6, textAlign: align }}>{item.note}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 4, textAlign: align }}>{formatRecordedAt(item.createdAt, language)}</Text></View><View style={styles.amountWrap}><Text style={{ color: "#F59E0B", fontSize: 15, fontWeight: "900", writingDirection: "ltr" }}>{formatMoney(item.amount, settings.currency)}</Text><Text style={{ color: colors.muted, fontSize: 9, marginTop: 2 }}>{item.paymentMethod === "click" ? "CliQ" : (language === "ar" ? "كاش" : "Cash")}</Text></View></View><View style={[styles.cardFooter, { flexDirection: row }]}><View style={[styles.loggedBadge, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="account-circle" size={15} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800" }}>{language === "ar" ? `المسجل: ${item.createdByName ?? "مستخدم التطبيق"}` : `By: ${item.createdByName ?? "App user"}`}</Text></View>{item.receiptUri ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "معاينة الفاتورة" : "Preview receipt"} onPress={() => setReceiptPreviewUri(item.receiptUri!)} style={({ pressed }) => [styles.receiptButton, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "52", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="image" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "الفاتورة" : "Receipt"}</Text></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حذف المصروف" : "Delete expense"} onPress={() => remove(item.id)} style={({ pressed }) => [styles.delete, { backgroundColor: colors.error + "10", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="delete-outline" size={16} color={colors.error} /></Pressable></View></View>;
    }} />
    <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => !saving && setModalOpen(false)}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.modalHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900", textAlign: align }}>{language === "ar" ? "إضافة مصروف" : "Add expense"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? `سيُسجل باسم: ${loggedBy}` : `Logged by: ${loggedBy}`}</Text></View><Pressable disabled={saving} onPress={() => setModalOpen(false)} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.65 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View><ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "نطاق المصروف" : "Expense scope"}</Text><Text style={{ color: scope ? colors.muted : colors.warning, fontSize: 10, marginTop: 4, textAlign: align }}>{scope ? (language === "ar" ? "اخترت نطاق المصروف. يمكنك الآن إدخال المبلغ." : "Scope selected. You can now enter the amount.") : (language === "ar" ? "اختر «مصروف عام» أو شاليهًا قبل إدخال المبلغ." : "Choose General or a chalet before entering the amount.")}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.scopeChoices, { flexDirection: row }]}><View style={[styles.rtlChoiceRow, { flexDirection: row }]}><ChoiceChip active={scope === "general"} label={language === "ar" ? "جميع الشاليهات / مصروف عام" : "All chalets / General"} onPress={() => setScope("general")} colors={colors} isRTL={isRTL} /><>{chalets.map((chalet) => <ChoiceChip key={chalet.id} active={scope === chalet.id} label={chalet.name} onPress={() => setScope(chalet.id)} colors={colors} isRTL={isRTL} />)}</></View></ScrollView><TextInput editable={Boolean(scope)} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={scope ? (language === "ar" ? "المبلغ (د.أ)" : "Amount (JOD)") : (language === "ar" ? "اختر نطاق المصروف أولًا" : "Choose expense scope first")} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: scope ? colors.border : colors.warning + "80", backgroundColor: colors.surfaceMuted, textAlign: align, opacity: scope ? 1 : 0.58 }]} /><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "تصنيف المصروف" : "Expense category"}</Text><View style={[styles.categories, { flexDirection: row }]}>{EXPENSE_CATEGORIES.map((key) => <Pressable key={key} onPress={() => setCategory(key)} style={({ pressed }) => [styles.category, { backgroundColor: category === key ? "#F59E0B" : colors.surfaceMuted, borderColor: category === key ? "#F59E0B" : colors.border, flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={CATEGORY_META[key].icon} size={14} color={category === key ? colors.background : colors.muted} /><Text style={{ color: category === key ? colors.background : colors.foreground, fontSize: 10, fontWeight: "800" }}>{language === "ar" ? CATEGORY_META[key].ar : CATEGORY_META[key].en}</Text>{category === key ? <MaterialIcons name="check-circle" size={15} color={colors.background} /> : null}</Pressable>)}</View><TextInput value={note} onChangeText={setNote} multiline placeholder={language === "ar" ? "البيان / ملاحظات المصروف" : "Expense description / notes"} placeholderTextColor={colors.muted} style={[styles.input, styles.noteInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} /><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "طريقة الصرف" : "Payment method"}</Text><View style={[styles.methodRow, { flexDirection: row }]}><ChoiceChip active={paymentMethod === "cash"} label={language === "ar" ? "كاش" : "Cash"} icon="payments" onPress={() => setPaymentMethod("cash")} colors={colors} isRTL={isArabicLayout} /><ChoiceChip active={paymentMethod === "click"} label="تحويل CliQ" icon="account-balance" onPress={() => setPaymentMethod("click")} colors={colors} isRTL={isArabicLayout} /></View><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginTop: 13, textAlign: align }}>{language === "ar" ? "إرفاق الفاتورة / الوصل" : "Attach invoice / receipt"}</Text>{receiptUri ? <View style={[styles.selectedReceipt, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "عرض الفاتورة" : "View receipt"} onPress={() => setReceiptPreviewUri(receiptUri)}><Image source={{ uri: receiptUri }} style={styles.thumbnail} /></Pressable><View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 11, textAlign: align }}>{language === "ar" ? "تم إرفاق صورة الوصل" : "Receipt image attached"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 3, textAlign: align }}>{language === "ar" ? "اضغط الصورة للمعاينة." : "Tap image to preview."}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إزالة الفاتورة" : "Remove receipt"} onPress={() => setReceiptUri(undefined)} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}><MaterialIcons name="close" size={19} color={colors.error} /></Pressable></View> : <View style={[styles.attachmentChoices, { flexDirection: row }]}><AttachmentButton label={language === "ar" ? "الكاميرا" : "Camera"} icon="photo-camera" onPress={() => void chooseReceipt("camera")} colors={colors} /><AttachmentButton label={language === "ar" ? "المعرض" : "Gallery"} icon="photo-library" onPress={() => void chooseReceipt("library")} colors={colors} /></View>}<RipplePressable disabled={saving} rippleColor={colors.background + "3D"} onPress={() => void save()} style={({ pressed }) => [styles.save, { backgroundColor: "#F59E0B", opacity: pressed || saving ? 0.7 : 1 }]}><MaterialIcons name={saving ? "hourglass-top" : "save"} size={18} color={colors.background} /><Text style={{ color: colors.background, fontSize: 13, fontWeight: "900" }}>{saving ? (language === "ar" ? "جارٍ الحفظ" : "Saving") : (language === "ar" ? "حفظ المصروف" : "Save expense")}</Text></RipplePressable></ScrollView></View></View></Modal>
    <Modal visible={Boolean(receiptPreviewUri)} transparent animationType="fade" onRequestClose={() => setReceiptPreviewUri(null)}><View style={styles.previewBackdrop}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق المعاينة" : "Close preview"} onPress={() => setReceiptPreviewUri(null)} style={[styles.previewClose, { backgroundColor: colors.surface }]}><MaterialIcons name="close" size={23} color={colors.foreground} /></Pressable>{receiptPreviewUri ? <Image source={{ uri: receiptPreviewUri }} resizeMode="contain" style={styles.fullReceipt} /> : null}</View></Modal>
  </View></ScreenContainer>;
}

function ChoiceChip({ active, label, icon, onPress, colors, isRTL }: { active: boolean; label: string; icon?: React.ComponentProps<typeof MaterialIcons>["name"]; onPress: () => void; colors: ReturnType<typeof useColors>; isRTL: boolean }) {
  const isArabicChip = isRTL || /[\u0600-\u06FF]/.test(label);
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.choiceChip, { backgroundColor: active ? colors.primary : colors.surfaceMuted, borderColor: active ? colors.primary : colors.border, flexDirection: isArabicChip ? "row-reverse" : "row", opacity: pressed ? 0.72 : 1 }]}>{active ? <MaterialIcons name="check-circle" size={15} color={colors.background} /> : null}{icon ? <MaterialIcons name={icon} size={15} color={active ? colors.background : colors.primary} /> : null}<Text style={{ color: active ? colors.background : colors.foreground, fontSize: 11, fontWeight: "900", textAlign: isArabicChip ? "right" : "left" }}>{label}</Text></Pressable>;
}

function AttachmentButton({ label, icon, onPress, colors }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.attachmentButton, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "5A", opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={icon} size={19} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, headerWrap: { paddingHorizontal: 16, paddingTop: 8 }, scope: { paddingHorizontal: 16, marginTop: 4 }, total: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 17, padding: 13, alignItems: "center", gap: 10 }, flex: { flex: 1, minWidth: 0 }, content: { padding: 16, paddingBottom: 120, gap: 9 }, empty: { minHeight: 135, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", padding: 15 }, expense: { borderWidth: 1, borderRadius: 16, padding: 12 }, expenseHeader: { alignItems: "flex-start", gap: 9 }, expenseIcon: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center" }, cardTopLine: { alignItems: "center", gap: 5, flexWrap: "wrap" }, categoryBadge: { minHeight: 23, borderRadius: 9, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" }, scopeBadge: { minHeight: 23, borderRadius: 9, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" }, amountWrap: { alignItems: "flex-end", minWidth: 72 }, cardFooter: { alignItems: "center", gap: 7, marginTop: 10 }, loggedBadge: { minHeight: 28, borderRadius: 9, paddingHorizontal: 8, alignItems: "center", gap: 4, flexDirection: "row", flex: 1 }, receiptButton: { minHeight: 28, borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, alignItems: "center", gap: 4, flexDirection: "row" }, delete: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 9 }, locked: { borderWidth: 1, borderRadius: 18, padding: 20, margin: 16, alignItems: "center" }, modalBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.64)", justifyContent: "flex-end" }, modal: { maxHeight: "91%", borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 }, modalHeader: { alignItems: "center", gap: 10 }, close: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" }, formContent: { paddingBottom: 10 }, scopeChoices: { paddingVertical: 9, alignItems: "flex-start" }, rtlChoiceRow: { gap: 7, alignSelf: "flex-end" }, input: { minHeight: 47, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginTop: 11 }, noteInput: { minHeight: 76, paddingTop: 11, textAlignVertical: "top" }, categories: { flexWrap: "wrap", gap: 7, marginTop: 9, alignContent: "flex-start" }, category: { minHeight: 34, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", gap: 4 }, methodRow: { gap: 8, marginTop: 9, alignSelf: "flex-end" }, choiceChip: { minHeight: 35, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", gap: 5 }, attachmentChoices: { gap: 8, marginTop: 9 }, attachmentButton: { flex: 1, minHeight: 45, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }, selectedReceipt: { alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 13, padding: 8, marginTop: 9 }, thumbnail: { width: 52, height: 52, borderRadius: 9, backgroundColor: "#CBD5E1" }, save: { minHeight: 49, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 17, flexDirection: "row", gap: 7 }, previewBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.92)", alignItems: "center", justifyContent: "center", padding: 22 }, previewClose: { position: "absolute", top: 52, left: 22, zIndex: 2, width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" }, fullReceipt: { width: "100%", height: "78%" },
});
