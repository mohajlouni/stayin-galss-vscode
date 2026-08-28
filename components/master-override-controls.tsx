import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Props = { workspaceId: number; disabled?: boolean; onCompleted: (message: string) => Promise<void> };
type PickerTarget = "arrival-date" | "departure-date" | "arrival-time" | "departure-time";
const statuses = ["confirmed", "checked-in", "checked-out", "cancelled", "waiting"] as const;
const EMERALD = "#10B981";
const DEEP_EMERALD = "#059669";
const SOFT_SURFACE = "#162521";

function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function time24(value: Date) { return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`; }
function asDate(date: string, time = "12:00") { const [year, month, day] = date.split("-").map(Number); const [hours, minutes] = time.split(":").map(Number); return new Date(year || 2000, (month || 1) - 1, day || 1, hours || 0, minutes || 0); }
function displayDate(value: Date) { return new Intl.DateTimeFormat("ar-JO", { weekday: "short", year: "numeric", month: "short", day: "numeric" }).format(value); }
function displayTime(value: Date) { return new Intl.DateTimeFormat("ar-JO", { hour: "numeric", minute: "2-digit" }).format(value); }

export function MasterOverrideControls({ workspaceId, disabled = false, onCompleted }: Props) {
  const colors = useColors();
  const options = trpc.masterControl.workspaceOptions.useQuery({ workspaceId }, { retry: false });
  const [selector, setSelector] = useState<"booking" | "unit" | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [bookingId, setBookingId] = useState("");
  const [bookingLabel, setBookingLabel] = useState("اختر حجزًا نشطًا");
  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [chaletId, setChaletId] = useState("");
  const [unitLabel, setUnitLabel] = useState("اختر وحدة أو عقارًا");
  const [arrivalDate, setArrivalDate] = useState(new Date());
  const [departureDate, setDepartureDate] = useState(new Date());
  const [arrivalTime, setArrivalTime] = useState(asDate("2000-01-01", "12:00"));
  const [departureTime, setDepartureTime] = useState(asDate("2000-01-01", "12:00"));
  const [price, setPrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [refund, setRefund] = useState("");
  const [status, setStatus] = useState<(typeof statuses)[number]>("confirmed");
  const [expenseId, setExpenseId] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const bookingMutation = trpc.masterControl.overrideBooking.useMutation();
  const expenseMutation = trpc.masterControl.overrideExpense.useMutation();
  const deleteExpense = trpc.masterControl.deleteExpense.useMutation();
  const busy = disabled || bookingMutation.isPending || expenseMutation.isPending || deleteExpense.isPending;
  const selectedBooking = useMemo(() => options.data?.bookings.find((item) => item.id === bookingId) ?? null, [bookingId, options.data?.bookings]);
  const confirm = (title: string, detail: string, action: () => Promise<void>) => Alert.alert(title, detail, [{ text: "إلغاء", style: "cancel" }, { text: "تأكيد التعديل", style: "default", onPress: () => void action() }]);
  const chooseBooking = (booking: NonNullable<typeof options.data>["bookings"][number]) => {
    setBookingId(booking.id); setBookingLabel(`${booking.customerName} — ${booking.chaletName} · ${booking.startDate}`); setGuestName(booking.customerName); setPhone(booking.phone || "");
    setChaletId(booking.chaletId ?? ""); setUnitLabel(booking.chaletName ?? "وحدة غير مسماة"); setArrivalDate(asDate(booking.startDate)); setDepartureDate(asDate(booking.endDate)); setArrivalTime(asDate("2000-01-01", booking.startTime)); setDepartureTime(asDate("2000-01-01", booking.endTime)); setPrice(String(booking.price)); setDeposit(booking.depositAmount ? String(booking.depositAmount) : ""); setStatus(booking.status === "waitlisted" ? "waiting" : booking.status === "completed" ? "checked-out" : booking.status === "cancelled" ? "cancelled" : "confirmed"); setSelector(null);
  };
  const chooseUnit = (unit: NonNullable<typeof options.data>["units"][number]) => { setChaletId(unit.id); setUnitLabel(unit.name); setSelector(null); };
  const updateBooking = async () => {
    if (!bookingId) return Alert.alert("اختر الحجز", "اختر الحجز من القائمة المرئية قبل تنفيذ أي تدخل إداري.");
    const parsedPrice = price.trim() ? Number(price) : undefined; const parsedDeposit = deposit.trim() ? Number(deposit) : undefined; const parsedRefund = refund.trim() ? Number(refund) : undefined;
    if ([parsedPrice, parsedDeposit, parsedRefund].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) return Alert.alert("قيمة مالية غير صالحة", "أدخل رقمًا موجبًا أو صفرًا فقط.");
    const patch = { customerName: guestName.trim() || undefined, phone: phone.trim() || undefined, chaletId: chaletId || undefined, startDate: isoDate(arrivalDate), endDate: isoDate(departureDate), startTime: time24(arrivalTime), endTime: time24(departureTime), price: parsedPrice, depositAmount: parsedDeposit, refundDeposit: parsedRefund && parsedRefund > 0 ? { amount: parsedRefund, paymentMethod: "cash-owner" as const, note: "استرداد إداري موثق" } : undefined, status };
    try { await bookingMutation.mutateAsync({ confirmation: "ADMIN-OVERRIDE", workspaceId, bookingId, resolveConflicts: status === "cancelled", patch }); await onCompleted("تم حفظ تدخل الحجز مع نسخة استرداد وسجل تدقيق خادمي."); }
    catch { Alert.alert("تعذر تعديل الحجز", "تحقق من التواريخ أو استخدم الاستعادة إذا كان هناك تعارض يحتاج قرارًا صريحًا."); }
  };
  const updateExpense = async () => {
    if (!expenseAmount.trim() || !Number.isFinite(Number(expenseAmount)) || Number(expenseAmount) <= 0) return Alert.alert("قيمة المصروف مطلوبة", "أدخل مبلغًا صحيحًا أكبر من صفر.");
    try { await expenseMutation.mutateAsync({ confirmation: "ADMIN-OVERRIDE", workspaceId, expense: { id: expenseId.trim() || undefined, amount: Number(expenseAmount), date: new Date().toISOString(), category: "other", paymentMethod: "cash", note: "تعديل إداري موثق" } }); await onCompleted("تم حفظ المصروف مع نسخة استرداد وسجل تدقيق خادمي."); }
    catch { Alert.alert("تعذر حفظ المصروف", "تحقق من بيانات المصروف ثم أعد المحاولة."); }
  };
  const removeExpense = async () => {
    if (!expenseId.trim()) return Alert.alert("معرف المصروف مطلوب", "أدخل معرف المصروف الداخلي قبل الحذف.");
    try { await deleteExpense.mutateAsync({ confirmation: "ADMIN-OVERRIDE", workspaceId, expenseId: expenseId.trim() }); await onCompleted("تم حذف المصروف مع الاحتفاظ بنقطة استرداد قبل الحذف."); }
    catch { Alert.alert("تعذر حذف المصروف", "تحقق من معرف المصروف ثم أعد المحاولة."); }
  };
  const pickerValue = picker === "arrival-date" ? arrivalDate : picker === "departure-date" ? departureDate : picker === "arrival-time" ? arrivalTime : departureTime;
  const pickerMode = picker?.includes("time") ? "time" : "date";
  const onPick = (_event: DateTimePickerEvent, value?: Date) => { if (Platform.OS === "android") setPicker(null); if (!value || !picker) return; if (picker === "arrival-date") setArrivalDate(value); else if (picker === "departure-date") setDepartureDate(value); else if (picker === "arrival-time") setArrivalTime(value); else setDepartureTime(value); };

  return <View style={[styles.wrap, { borderColor: EMERALD + "70", backgroundColor: SOFT_SURFACE }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>تدخلات الحجز والدفتر المالي</Text><Text style={[styles.hint, { color: colors.muted }]}>اختر الحجز والوحدة من القوائم. تُنشأ نقطة استرداد تلقائيًا، وتُسجل هوية مدير النظام والإجراء.</Text>
    <VisualPicker label="الحجز" value={bookingLabel} icon="event-note" colors={colors} onPress={() => setSelector("booking")} /><View style={styles.two}><Field label="اسم الضيف" value={guestName} onChangeText={setGuestName} placeholder="اختياري" colors={colors} /><Field label="هاتف الضيف" value={phone} onChangeText={setPhone} placeholder="اختياري" colors={colors} /></View>
    <View style={styles.two}><VisualPicker label="الوحدة / العقار" value={unitLabel} icon="holiday-village" colors={colors} onPress={() => setSelector("unit")} /><Field label="إجمالي الإيجار" value={price} onChangeText={setPrice} placeholder="د.أ" colors={colors} keyboardType="decimal-pad" /></View>
    <View style={styles.two}><DatePickerField label="تاريخ الوصول" value={displayDate(arrivalDate)} icon="calendar-month" colors={colors} onPress={() => setPicker("arrival-date")} /><DatePickerField label="تاريخ المغادرة" value={displayDate(departureDate)} icon="event-available" colors={colors} onPress={() => setPicker("departure-date")} /></View>
    <View style={styles.two}><DatePickerField label="وقت الوصول" value={displayTime(arrivalTime)} icon="schedule" colors={colors} onPress={() => setPicker("arrival-time")} /><DatePickerField label="وقت المغادرة" value={displayTime(departureTime)} icon="more-time" colors={colors} onPress={() => setPicker("departure-time")} /></View>
    <View style={styles.two}><Field label="تأمين محتجز" value={deposit} onChangeText={setDeposit} placeholder="اختياري" colors={colors} keyboardType="decimal-pad" /><Field label="استرداد تأمين" value={refund} onChangeText={setRefund} placeholder="اختياري" colors={colors} keyboardType="decimal-pad" /></View>
    <View style={styles.statuses}>{statuses.map((item) => <Pressable key={item} onPress={() => setStatus(item)} style={[styles.status, { backgroundColor: status === item ? EMERALD : "transparent", borderColor: status === item ? EMERALD : colors.border }]}><Text style={{ color: status === item ? "#FFFFFF" : colors.foreground, fontSize: 10, fontWeight: "900" }}>{statusLabel(item)}</Text></Pressable>)}</View>
    <Pressable disabled={busy} onPress={() => confirm("تدخل إداري في الحجز", "سيعدل الحجز المختار ويُنشئ نسخة استرداد قبل التعديل.", updateBooking)} style={[styles.button, { backgroundColor: DEEP_EMERALD, opacity: busy ? 0.5 : 1 }]}><MaterialIcons name="edit-calendar" size={19} color="#FFFFFF" /><Text style={styles.buttonText}>حفظ تدخل الحجز</Text></Pressable>
    <View style={[styles.divider, { backgroundColor: colors.border }]} />
    <Text style={[styles.subTitle, { color: colors.foreground }]}>المصروفات والمرفقات</Text><View style={styles.two}><Field label="معرف المصروف" value={expenseId} onChangeText={setExpenseId} placeholder="للتعديل أو الحذف" colors={colors} /><Field label="المبلغ" value={expenseAmount} onChangeText={setExpenseAmount} placeholder="د.أ" colors={colors} keyboardType="decimal-pad" /></View>
    <Pressable disabled={busy} onPress={() => confirm("حفظ مصروف إداري", "سيُضاف أو يعدل مصروف بفئة «أخرى» مع نسخة استرداد قبل التعديل.", updateExpense)} style={[styles.button, { backgroundColor: EMERALD, opacity: busy ? 0.5 : 1 }]}><MaterialIcons name="request-quote" size={19} color="#FFFFFF" /><Text style={styles.buttonText}>حفظ المصروف</Text></Pressable>
    <Pressable disabled={busy} onPress={() => confirm("حذف مصروف", "سيحذف المصروف المحدد بعد إنشاء نسخة استرداد.", removeExpense)} style={[styles.delete, { borderColor: colors.error + "B3", opacity: busy ? 0.5 : 1 }]}><MaterialIcons name="delete-outline" size={19} color={colors.error} /><Text style={{ color: colors.error, fontWeight: "900" }}>حذف المصروف المحدد</Text></Pressable>
    {picker && <View style={[styles.inlinePicker, { backgroundColor: colors.background, borderColor: colors.border }]}><DateTimePicker value={pickerValue} mode={pickerMode} is24Hour={false} locale="ar-JO" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={onPick} /><Pressable onPress={() => setPicker(null)} style={[styles.closePicker, { backgroundColor: EMERALD }]}><Text style={styles.buttonText}>تم</Text></Pressable></View>}
    <Modal visible={selector !== null} animationType="slide" transparent onRequestClose={() => setSelector(null)}><View style={styles.modalShade}><View style={[styles.modalCard, { backgroundColor: SOFT_SURFACE, borderColor: colors.border }]}><View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: colors.foreground }]}>{selector === "booking" ? "اختر حجزًا نشطًا" : "اختر وحدة أو عقارًا"}</Text><Pressable onPress={() => setSelector(null)}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable></View><ScrollView contentContainerStyle={styles.modalList}>{selector === "booking" ? options.data?.bookings.length ? options.data.bookings.map((booking) => <Pressable key={booking.id} onPress={() => chooseBooking(booking)} style={[styles.optionRow, { borderColor: colors.border, backgroundColor: colors.background }]}><MaterialIcons name="event" size={20} color={EMERALD} /><View style={styles.optionGrow}><Text style={[styles.optionTitle, { color: colors.foreground }]}>{booking.customerName} — {booking.chaletName}</Text><Text style={[styles.optionMeta, { color: colors.muted }]}>{booking.startDate} · {booking.startTime} إلى {booking.endDate} · {booking.endTime}</Text></View></Pressable>) : <Text style={[styles.empty, { color: colors.muted }]}>لا توجد حجوزات نشطة قابلة للاختيار.</Text> : options.data?.units.map((unit) => <Pressable key={unit.id} onPress={() => chooseUnit(unit)} style={[styles.optionRow, { borderColor: colors.border, backgroundColor: colors.background }]}><View style={[styles.colorDot, { backgroundColor: unit.color || EMERALD }]} /><View style={styles.optionGrow}><Text style={[styles.optionTitle, { color: colors.foreground }]}>{unit.name}</Text><Text style={[styles.optionMeta, { color: colors.muted }]}>{unit.propertyType === "chalet" ? "شاليه" : "وحدة / عقار"}</Text></View></Pressable>)}</ScrollView></View></View></Modal>
  </View>;
}

function VisualPicker({ label, value, icon, colors, onPress }: { label: string; value: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; colors: ReturnType<typeof useColors>; onPress: () => void }) { return <View style={styles.field}><Text style={[styles.label, { color: colors.muted }]}>{label}</Text><Pressable onPress={onPress} style={[styles.pickerField, { borderColor: colors.border, backgroundColor: colors.surface }]}><MaterialIcons name={icon} size={18} color={EMERALD} /><Text numberOfLines={1} style={[styles.pickerText, { color: colors.foreground }]}>{value}</Text><MaterialIcons name="expand-more" size={18} color={colors.muted} /></Pressable></View>; }
function DatePickerField({ label, value, icon, colors, onPress }: { label: string; value: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; colors: ReturnType<typeof useColors>; onPress: () => void }) { return <View style={styles.field}><Text style={[styles.label, { color: colors.muted }]}>{label}</Text><Pressable onPress={onPress} style={[styles.pickerField, { borderColor: colors.border, backgroundColor: colors.surface }]}><MaterialIcons name={icon} size={18} color={EMERALD} /><Text numberOfLines={1} style={[styles.pickerText, { color: colors.foreground }]}>{value}</Text></Pressable></View>; }
function Field({ label, value, onChangeText, placeholder, colors, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; colors: ReturnType<typeof useColors>; keyboardType?: "decimal-pad" }) { return <View style={styles.field}><Text style={[styles.label, { color: colors.muted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} textAlign="right" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} /></View>; }
function statusLabel(status: (typeof statuses)[number]) { return status === "confirmed" ? "مؤكد" : status === "checked-in" ? "تم الوصول" : status === "checked-out" ? "تمت المغادرة" : status === "cancelled" ? "ملغي" : "انتظار"; }

const styles = StyleSheet.create({ wrap: { marginTop: 12, borderWidth: 1, borderRadius: 18, padding: 12, gap: 10 }, title: { fontSize: 14, fontWeight: "900", textAlign: "right" }, subTitle: { fontSize: 12, fontWeight: "900", textAlign: "right" }, hint: { fontSize: 10, lineHeight: 16, textAlign: "right" }, two: { flexDirection: "row-reverse", gap: 8 }, field: { flex: 1, minWidth: 0 }, label: { fontSize: 10, fontWeight: "800", textAlign: "right", marginBottom: 4 }, input: { minHeight: 43, borderWidth: 1, borderRadius: 11, paddingHorizontal: 9, fontSize: 11 }, pickerField: { minHeight: 43, borderWidth: 1, borderRadius: 11, paddingHorizontal: 9, flexDirection: "row-reverse", alignItems: "center", gap: 6 }, pickerText: { flex: 1, fontSize: 10, textAlign: "right", fontWeight: "700" }, statuses: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }, status: { minHeight: 33, paddingHorizontal: 9, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" }, button: { minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 7 }, buttonText: { color: "#FFFFFF", fontWeight: "900" }, delete: { minHeight: 42, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 7 }, divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 }, inlinePicker: { borderWidth: 1, borderRadius: 14, padding: 8, alignItems: "center" }, closePicker: { minWidth: 84, minHeight: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }, modalShade: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" }, modalCard: { maxHeight: "72%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 16 }, modalHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, modalTitle: { fontSize: 16, fontWeight: "900" }, modalList: { gap: 8, paddingBottom: 22 }, optionRow: { minHeight: 62, borderWidth: 1, borderRadius: 13, padding: 10, flexDirection: "row-reverse", alignItems: "center", gap: 9 }, optionGrow: { flex: 1 }, optionTitle: { textAlign: "right", fontSize: 12, fontWeight: "900" }, optionMeta: { textAlign: "right", fontSize: 10, marginTop: 4 }, empty: { textAlign: "center", paddingVertical: 24 }, colorDot: { width: 17, height: 17, borderRadius: 9 } });
