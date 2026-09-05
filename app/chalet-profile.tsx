import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { ChaletDeletePanel } from "@/components/chalet-delete-panel";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenBackButton } from "@/components/screen-back-button";
import { useColors } from "@/hooks/use-colors";
import { CHALET_COLORS, PROPERTY_TYPES, type PropertyType, type ReservedPeriodColorKey, ChaletShift, chaletLinkedBookingCount, chaletPerformanceSummary, formatMoney, getChaletShifts, isValidChaletColor, isValidChaletReferenceCode, isValidGoogleMapsUrl, isValidGuardianPhone, isValidUnitCode, normalizeChaletReferenceCode, propertyTypeIcon, propertyTypeLabel, suggestChaletReferenceCode } from "@/lib/booking-model";
import { useAppPreferences } from "@/lib/app-preferences";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKEND_DAYS = [{ value: 0, ar: "الأحد", en: "Sun" }, { value: 1, ar: "الإثنين", en: "Mon" }, { value: 2, ar: "الثلاثاء", en: "Tue" }, { value: 3, ar: "الأربعاء", en: "Wed" }, { value: 4, ar: "الخميس", en: "Thu" }, { value: 5, ar: "الجمعة", en: "Fri" }, { value: 6, ar: "السبت", en: "Sat" }];
const FIXED_PERIODS: Array<{ key: string; kind: ReservedPeriodColorKey; ar: string; en: string; color: string; defaultActive: boolean; startTime: string; endTime: string }> = [
  { key: "morning", kind: "morning", ar: "صباحي", en: "Morning", color: "#0284C7", defaultActive: true, startTime: "08:00", endTime: "16:00" },
  { key: "evening", kind: "evening", ar: "سهرة", en: "Evening", color: "#4F46E5", defaultActive: true, startTime: "22:00", endTime: "02:00" },
  { key: "full_day", kind: "full_day", ar: "يوم كامل", en: "Full day", color: "#10B981", defaultActive: true, startTime: "10:00", endTime: "22:00" },
  { key: "multi_day", kind: "overnight", ar: "عدة أيام", en: "Multi-day", color: "#8B5CF6", defaultActive: true, startTime: "10:00", endTime: "12:00" },
  { key: "event", kind: "event", ar: "مناسبة / تصوير", en: "Event / photo", color: "#F43F5E", defaultActive: false, startTime: "16:00", endTime: "23:00" },
  { key: "custom", kind: "custom", ar: "فترة مخصصة", en: "Custom period", color: "#F97316", defaultActive: false, startTime: "09:00", endTime: "17:00" },
];
/** رموز الفترات المعروضة في شارات ترويسة كروت الأسعار وتُستخدم داخل رقم الحجز الذكي. */
const PERIOD_CODE_BADGES: Record<string, string> = { morning: "M", evening: "N", full_day: "D", multi_day: "S", event: "C", custom: "X" };
function fixedPeriodIndexForShift(shift: Pick<ChaletShift, "name">): number {
  const value = shift.name.trim().toLowerCase();
  if (/صباح|morning/.test(value)) return 0;
  if (/سهرة|مساء|مسائي|ليل|evening|night/.test(value)) return 1;
  if (/يوم كامل|full day/.test(value)) return 2;
  if (/عدة أيام|عدة ايام|multi|مبيت|overnight|24/.test(value)) return 3;
  if (/مناسبة|تصوير|حدث|event|photo/.test(value)) return 4;
  if (/مخصص|custom/.test(value)) return 5;
  return -1;
}
function fixedShiftState(current: ChaletShift[]): ChaletShift[] {
  const source = new Map<number, ChaletShift>();
  current.forEach((shift) => {
    const slot = fixedPeriodIndexForShift(shift);
    if (slot >= 0 && !source.has(slot)) source.set(slot, shift);
  });
  return FIXED_PERIODS.map((period, index) => {
    const existing = source.get(index);
    return {
      id: existing?.id ?? `period-${period.key}`,
      name: period.ar,
      startTime: existing?.startTime ?? period.startTime,
      endTime: existing?.endTime ?? period.endTime,
      weekdayPrice: existing?.weekdayPrice ?? 0,
      weekendPrice: existing?.weekendPrice ?? 0,
      holidayPrice: existing?.holidayPrice,
      isActive: existing ? existing.isActive : period.defaultActive,
      color: period.color,
      periodKind: period.kind,
    } satisfies ChaletShift;
  });
}
function timeToDate(time: string) { const [hours, minutes] = time.split(":").map(Number); const date = new Date(2000, 0, 1, 0, 0, 0); date.setHours(hours || 0, minutes || 0, 0, 0); return date; }
function dateToTime(value: Date) { return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`; }

const shiftPaletteStyles = StyleSheet.create({
  paletteScroller: { marginTop: 9 },
  paletteContent: { gap: 9, paddingHorizontal: 1 },
  shiftColorSummary: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, alignItems: "center", gap: 9 },
  colorPreview: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#FFFFFF" },
  shiftColorPicker: { marginTop: 11 },
  shiftColorsScroller: { marginTop: 1 },
  shiftColorsContent: { gap: 8, paddingHorizontal: 1 },
  shiftHexRow: { gap: 8, marginTop: 12, alignItems: "center" },
  shiftHexInput: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14, writingDirection: "ltr", textAlign: "left" },
  shiftHexButton: { minWidth: 78, minHeight: 44, borderRadius: 12, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
});

export default function ChaletProfileScreen() {
  const { id, mode } = useLocalSearchParams<{ id?: string; mode?: "add" }>();
  const { chalets, bookings, settings, addChalet, updateChalet, deleteChalet } = useBookings();
  const { isRTL, language } = useI18n();
  const { deviceSettings, formatTime } = useAppPreferences();
  const colors = useColors();
  const existing = useMemo(() => chalets.find((chalet) => chalet.id === id), [chalets, id]);
  const isNew = mode === "add" || !existing;
  const performance = useMemo(() => existing ? chaletPerformanceSummary(existing.id, bookings) : undefined, [bookings, existing]);
  const linkedBookingCount = useMemo(() => existing ? chaletLinkedBookingCount(existing.id, bookings) : 0, [bookings, existing]);
  const isArabicLayout = language === "ar" || isRTL;
  const align = isArabicLayout ? "right" : "left";
  const row = isArabicLayout ? "row-reverse" : "row";
  const periodFieldsRow = isArabicLayout ? "row" : "row-reverse";
  const layoutDirection: "rtl" | "ltr" = isArabicLayout ? "rtl" : "ltr";
  const [name, setName] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("chalet");
  const [referenceCode, setReferenceCode] = useState("");
  const [color, setColor] = useState<string>(CHALET_COLORS[0]);
  const [customColor, setCustomColor] = useState("");
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [location, setLocation] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [nearWater, setNearWater] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [weekendDays, setWeekendDays] = useState<number[]>([5, 6]);
  const [shifts, setShifts] = useState<ChaletShift[]>(() => fixedShiftState([]));

  useEffect(() => {
    const resolvedColor = existing?.color ?? CHALET_COLORS[chalets.length % CHALET_COLORS.length];
    setName(existing?.name ?? "");
    setPropertyType(existing?.propertyType ?? "chalet");
    setReferenceCode(existing?.referenceCode ?? suggestChaletReferenceCode(chalets.filter((chalet) => chalet.id !== existing?.id).map((chalet) => chalet.referenceCode)));
    setColor(resolvedColor);
    setCustomColor(CHALET_COLORS.includes(resolvedColor as typeof CHALET_COLORS[number]) ? "" : resolvedColor);
    setImageUri(existing?.imageUri);
    setLocation(existing?.location ?? "");
    setLocationUrl(existing?.locationUrl ?? "");
    setLatitude(existing?.latitude != null ? String(existing.latitude) : "");
    setLongitude(existing?.longitude != null ? String(existing.longitude) : "");
    setGoogleMapsUrl(existing?.googleMapsUrl ?? "");
    setIsPublished(existing?.isPublished ?? false);
    setNearWater(existing?.nearWater ?? false);
    setGuardianName(existing?.guardianName ?? "");
    setGuardianPhone(existing?.guardianPhone ?? "");
    setContactPhone(existing?.contactPhone ?? "");
    setNotes(existing?.notes ?? "");
    setWeekendDays(existing?.weekendDays ?? settings.weekendDays ?? [5, 6]);
    setShifts(fixedShiftState(getChaletShifts(existing, settings)));
  }, [chalets, existing, settings]);

  const chooseImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.8 });
      if (!result.canceled && result.assets[0]?.uri) setImageUri(result.assets[0].uri);
    } catch { Alert.alert(language === "ar" ? "تعذر اختيار الصورة" : "Could not select image"); }
  };
  const updateShift = (id: string, field: "startTime" | "endTime" | "weekdayPrice" | "weekendPrice" | "holidayPrice", value: string) => setShifts((current) => current.map((shift) => {
    if (shift.id !== id) return shift;
    if (field === "weekdayPrice" || field === "weekendPrice" || field === "holidayPrice") return { ...shift, [field]: Math.max(0, Number(value || 0)) };
    return { ...shift, [field]: value };
  }));
  const updateShiftStatus = (id: string, isActive: boolean) => setShifts((current) => current.map((shift) => shift.id === id ? { ...shift, isActive } : shift));
  const [timePicker, setTimePicker] = useState<{ shiftId: string; field: "startTime" | "endTime"; value: string } | null>(null);
  const selectCustomColor = () => {
    const normalized = customColor.trim().toUpperCase();
    if (!isValidChaletColor(normalized)) return Alert.alert(language === "ar" ? "لون HEX غير صالح" : "Invalid HEX color", language === "ar" ? "استخدم صيغة مثل #0F8B83." : "Use a color such as #0F8B83.");
    setColor(normalized);
    setCustomColor(normalized);
  };
  const toggleWeekendDay = (day: number) => setWeekendDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((left, right) => left - right));
  const save = async () => {
    const normalizedCode = normalizeChaletReferenceCode(referenceCode);
    if (!name.trim()) return Alert.alert(language === "ar" ? "اسم الوحدة مطلوب" : "Property name required");
    if (!isValidChaletReferenceCode(normalizedCode) && !isValidUnitCode(normalizedCode)) return Alert.alert(language === "ar" ? "رمز الوحدة غير صالح" : "Invalid property code", language === "ar" ? "استخدم رمز U01..U99، أو صيغة قديمة من حرفين مثل N1 أو 01." : "Use U01..U99, or a legacy two-character code such as N1 or 01.");
    if (chalets.some((chalet) => chalet.id !== existing?.id && normalizeChaletReferenceCode(chalet.referenceCode) === normalizedCode)) return Alert.alert(language === "ar" ? "رمز الوحدة مستخدم" : "Property code in use");
    if (!isValidChaletColor(color)) return Alert.alert(language === "ar" ? "لون الوحدة غير صالح" : "Invalid property color");
    if (!isValidGoogleMapsUrl(locationUrl)) return Alert.alert(language === "ar" ? "رابط موقع غير صالح" : "Invalid Google Maps link");
    const parsedLatitude = latitude.trim() ? Number(latitude) : undefined;
    const parsedLongitude = longitude.trim() ? Number(longitude) : undefined;
    if (parsedLatitude !== undefined && (!Number.isFinite(parsedLatitude) || Math.abs(parsedLatitude) > 90)) return Alert.alert(language === "ar" ? "خط عرض غير صالح" : "Invalid latitude", language === "ar" ? "أدخل قيمة بين -90 و 90." : "Enter a value between -90 and 90.");
    if (parsedLongitude !== undefined && (!Number.isFinite(parsedLongitude) || Math.abs(parsedLongitude) > 180)) return Alert.alert(language === "ar" ? "خط طول غير صالح" : "Invalid longitude", language === "ar" ? "أدخل قيمة بين -180 و 180." : "Enter a value between -180 and 180.");
    if (!isValidGoogleMapsUrl(googleMapsUrl)) return Alert.alert(language === "ar" ? "رابط خريطة الضيوف غير صالح" : "Invalid guest map link");
    if (!isValidGuardianPhone(guardianPhone)) return Alert.alert(language === "ar" ? "رقم الحارس غير صالح" : "Invalid guardian phone");
    if (!shifts.length || shifts.some((shift) => !shift.name.trim() || !timePattern.test(shift.startTime) || !timePattern.test(shift.endTime) || !Number.isFinite(shift.weekdayPrice) || !Number.isFinite(shift.weekendPrice) || (shift.holidayPrice != null && !Number.isFinite(shift.holidayPrice)) || shift.weekdayPrice < 0 || shift.weekendPrice < 0 || (shift.holidayPrice != null && shift.holidayPrice < 0))) return Alert.alert(language === "ar" ? "بيانات الفترة غير صالحة" : "Invalid shift details", language === "ar" ? "أدخل اسمًا ووقتين صحيحين وأسعارًا صفرية أو موجبة لكل فترة." : "Enter a name, valid times, and non-negative prices for every shift.");
    const normalizedShifts = shifts.map((shift) => ({ ...shift, name: shift.name.trim() }));
    const details = { name, propertyType, referenceCode: normalizedCode, color, imageUri, location, locationUrl, guardianName, guardianPhone, contactPhone, notes, weekendDays, shifts: normalizedShifts, latitude: parsedLatitude, longitude: parsedLongitude, googleMapsUrl: googleMapsUrl.trim() || undefined, isPublished, nearWater };
    try { if (existing) await updateChalet({ ...existing, ...details }); else await addChalet(details); Keyboard.dismiss(); router.back(); }
    catch { Alert.alert(language === "ar" ? "تعذر الحفظ" : "Could not save", language === "ar" ? "تحقق من تفرّد اسم الشاليه ورمزه." : "Check the chalet name and code are unique."); }
  };
  const deleteCurrent = async () => { if (!existing) return; try { await deleteChalet(existing.id); router.replace("/chalet-management"); } catch { Alert.alert(language === "ar" ? "تعذر حذف الشاليه" : "Could not delete chalet"); } };
  const input = [styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: align as "left" | "right", writingDirection: layoutDirection }];
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];
  const label = (text: string) => <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{text}</Text>;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <View style={[styles.header, { flexDirection: row }]}><ScreenBackButton fallbackHref="/chalet-management" /><View style={styles.flex}><Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{isNew ? (language === "ar" ? "إضافة وحدة جديدة" : "Add new property") : (language === "ar" ? "ملف الوحدة / العقار" : "Property profile")}</Text><Text style={{ color: colors.muted, fontSize: 12, textAlign: align }}>{language === "ar" ? "الفترات والأسعار تخص هذه الوحدة فقط." : "Shifts and rates belong to this property only."}</Text></View></View>
    {!isNew && performance ? <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row }]}><Metric label={language === "ar" ? "حجوزات" : "Bookings"} value={String(performance.bookingCount)} colors={colors} align={align} /><Metric label={language === "ar" ? "أيام مشغولة" : "Occupied"} value={String(performance.occupiedDays)} colors={colors} align={align} /><Metric label={language === "ar" ? "إيراد" : "Revenue"} value={formatMoney(performance.rentalRevenue, settings.currency)} colors={colors} align={align} /></View> : null}
    <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "هوية الوحدة / العقار" : "Property identity"}</Text><View style={card}>
      <View style={[styles.imageRow, { flexDirection: row, borderColor: colors.border, backgroundColor: colors.background }]}>{imageUri ? <Image source={{ uri: imageUri }} contentFit="cover" style={styles.image} /> : <View style={[styles.imageFallback, { backgroundColor: color + "22" }]}><MaterialIcons name={propertyTypeIcon(propertyType)} size={29} color={color} /></View>}<View style={styles.flex}><Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "صورة الوحدة" : "Property photo"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 2, textAlign: align }}>{language === "ar" ? "اختيارية" : "Optional"}</Text><View style={[styles.photoActions, { flexDirection: row }]}><Pressable onPress={() => void chooseImage()} style={({ pressed }) => [styles.photoButton, { backgroundColor: colors.primary + "14", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="photo-library" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }}>{language === "ar" ? "اختيار صورة" : "Choose"}</Text></Pressable>{imageUri ? <Pressable onPress={() => setImageUri(undefined)} style={({ pressed }) => [styles.photoButton, { backgroundColor: colors.error + "12", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="delete-outline" size={16} color={colors.error} /><Text style={{ color: colors.error, fontSize: 11, fontWeight: "800" }}>{language === "ar" ? "إزالة" : "Remove"}</Text></Pressable> : null}</View></View></View>
      <View style={styles.field}>{label(language === "ar" ? "نوع العقار" : "Property type")}<Text style={[styles.hint, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "يظهر النوع ورمزه في بطاقات الحجز والتقويم." : "The type and icon appear in booking cards and calendar views."}</Text><View style={[styles.propertyTypeGrid, { flexDirection: row }]}>{PROPERTY_TYPES.map((type) => { const selected = propertyType === type; return <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setPropertyType(type)} style={({ pressed }) => [styles.propertyTypeChip, { backgroundColor: selected ? color + "1B" : colors.background, borderColor: selected ? color : colors.border, opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name={propertyTypeIcon(type)} size={17} color={selected ? color : colors.muted} /><Text numberOfLines={1} style={{ color: selected ? color : colors.muted, fontSize: 11, fontWeight: "900" }}>{propertyTypeLabel(type, language)}</Text></Pressable>; })}</View></View>
      <View style={styles.field}>{label(language === "ar" ? "اسم الوحدة / العقار" : "Property name")}<TextInput value={name} onChangeText={setName} placeholder={language === "ar" ? "مثال: مزرعة المايا أو فيلا النخلة" : "Example: Maya Farm or Palm Villa"} placeholderTextColor={colors.muted} style={input} /></View>
      <View style={styles.field}>{label(language === "ar" ? "رمز الوحدة" : "Property code")}<Text style={[styles.hint, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "مُرتب تلقائيًا ضمن المنشأة: U01، U02، U03… أو اتركه يُقترَح." : "Auto-sequenced per workspace: U01, U02, U03… or leave the suggestion."}</Text><TextInput value={referenceCode} onChangeText={(value) => setReferenceCode(normalizeChaletReferenceCode(value))} autoCapitalize="characters" maxLength={3} placeholder="U01" placeholderTextColor={colors.muted} style={[input, { writingDirection: "ltr", textAlign: "left" }]} /></View>
      <View style={styles.field}>{label(language === "ar" ? "لون العلامة" : "Brand color")}<ScrollView horizontal showsHorizontalScrollIndicator={false} style={shiftPaletteStyles.paletteScroller} contentContainerStyle={[shiftPaletteStyles.paletteContent, { flexDirection: row }]}>{CHALET_COLORS.map((item) => <Pressable key={item} onPress={() => { setColor(item); setCustomColor(""); }} style={[styles.colorCircle, { backgroundColor: item, borderColor: color === item ? colors.foreground : "transparent" }]}>{color === item ? <MaterialIcons name="check" size={18} color="#FFFFFF" /> : null}</Pressable>)}</ScrollView><Text style={[styles.hint, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "اسحب يمينًا أو يسارًا لاختيار اللون، أو أدخل لون HEX مخصصًا." : "Swipe horizontally or use a custom HEX color."}</Text><View style={[styles.hexRow, { flexDirection: row }]}><TextInput value={customColor} onChangeText={setCustomColor} autoCapitalize="characters" maxLength={7} placeholder="#0F8B83" placeholderTextColor={colors.muted} style={[styles.hexInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} /><Pressable onPress={selectCustomColor} style={({ pressed }) => [styles.hexButton, { backgroundColor: color, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="palette" size={16} color="#FFFFFF" /><Text style={styles.hexButtonText}>{language === "ar" ? "تطبيق" : "Apply"}</Text></Pressable></View></View>
    </View>
    <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "الموقع والتواصل" : "Location and contact"}</Text><View style={card}>
      <View style={styles.field}>{label(language === "ar" ? "العنوان" : "Address")}<TextInput value={location} onChangeText={setLocation} placeholder={language === "ar" ? "عمّان — طريق المطار" : "Amman — Airport Road"} placeholderTextColor={colors.muted} style={input} /></View>
      <View style={styles.field}>{label(language === "ar" ? "رابط Google Maps" : "Google Maps link")}<TextInput value={locationUrl} onChangeText={setLocationUrl} keyboardType="url" autoCapitalize="none" placeholder="https://maps.google.com/..." placeholderTextColor={colors.muted} style={input} /></View>
      <View style={[styles.dual, { flexDirection: row }]}><View style={styles.flex}>{label(language === "ar" ? "خط العرض" : "Latitude")}<TextInput value={latitude} onChangeText={setLatitude} keyboardType="decimal-pad" placeholder="31.96" placeholderTextColor={colors.muted} style={[input, { writingDirection: "ltr", textAlign: "left" }]} /></View><View style={styles.flex}>{label(language === "ar" ? "خط الطول" : "Longitude")}<TextInput value={longitude} onChangeText={setLongitude} keyboardType="decimal-pad" placeholder="35.93" placeholderTextColor={colors.muted} style={[input, { writingDirection: "ltr", textAlign: "left" }]} /></View></View>
      <View style={styles.field}>{label(language === "ar" ? "رابط خريطة الضيوف" : "Guest map link")}<Text style={[styles.hint, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "رابط خرائط Google مباشر يُعرض في تطبيق الضيوف." : "Direct Google Maps link shown in the guest app."}</Text><TextInput value={googleMapsUrl} onChangeText={setGoogleMapsUrl} keyboardType="url" autoCapitalize="none" placeholder="https://maps.google.com/..." placeholderTextColor={colors.muted} style={input} /></View>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: isPublished }} onPress={() => setIsPublished((current) => !current)} style={({ pressed }) => [styles.publishRow, { borderColor: colors.border, backgroundColor: colors.background, flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><View style={styles.flex}><Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "ظهور في تطبيق الضيوف" : "Visible in guest app"}</Text><Text style={[styles.hint, { color: colors.muted, textAlign: align }]}>{isPublished ? (language === "ar" ? "تُعرض الوحدة للجمهور في تطبيق الضيوف." : "Shown to the public in the guest app.") : (language === "ar" ? "مخفية حاليًا عن الجمهور." : "Currently hidden from the public.")}</Text></View><View style={[styles.statusPill, { backgroundColor: isPublished ? colors.primary + "20" : colors.surface, borderColor: isPublished ? colors.primary : colors.border, flexDirection: row }]}><View style={[styles.statusDot, { backgroundColor: isPublished ? colors.primary : colors.muted }]} /><Text style={{ color: isPublished ? colors.primary : colors.muted, fontSize: 12, fontWeight: "900" }}>{isPublished ? (language === "ar" ? "ظاهرة" : "Visible") : (language === "ar" ? "مخفية" : "Hidden")}</Text></View></Pressable>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: nearWater }} onPress={() => setNearWater((current) => !current)} style={({ pressed }) => [styles.publishRow, { borderColor: colors.border, backgroundColor: colors.background, flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><View style={styles.flex}><Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "قرب من مسطح مائي" : "Near a body of water"}</Text><Text style={[styles.hint, { color: colors.muted, textAlign: align }]}>{nearWater ? (language === "ar" ? "تفعَّل تنبيهات المدّ لليالي القمرية على هذه الوحدة." : "Lunar tide alerts are enabled for this property.") : (language === "ar" ? "لا تنبيهات مدّ لهذه الوحدة." : "No tide alerts for this property.")}</Text></View><MaterialIcons name={nearWater ? "waves" : "water-drop"} size={20} color={nearWater ? colors.primary : colors.muted} /></Pressable>
      <View style={[styles.dual, { flexDirection: row }]}><View style={styles.flex}>{label(language === "ar" ? "اسم الحارس" : "Guardian name")}<TextInput value={guardianName} onChangeText={setGuardianName} placeholder={language === "ar" ? "أبو أحمد" : "Ahmad"} placeholderTextColor={colors.muted} style={input} /></View><View style={styles.flex}>{label(language === "ar" ? "هاتف الحارس" : "Guardian phone")}<TextInput value={guardianPhone} onChangeText={setGuardianPhone} keyboardType="phone-pad" placeholder="07xxxxxxxx" placeholderTextColor={colors.muted} style={input} /></View></View>
      <View style={styles.field}>{label(language === "ar" ? "هاتف التواصل" : "Contact phone")}<TextInput value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" placeholder="07xxxxxxxx" placeholderTextColor={colors.muted} style={input} /></View>
      <View style={styles.field}>{label(language === "ar" ? "ملاحظات تشغيلية" : "Operational notes")}<TextInput value={notes} onChangeText={setNotes} multiline textAlignVertical="top" placeholder={language === "ar" ? "تعليمات الوصول أو رمز البوابة" : "Arrival instructions or gate code"} placeholderTextColor={colors.muted} style={[input, styles.notes]} /></View>
    </View>
    <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "الفترات والأسعار" : "Shifts and pricing"}</Text><Text style={[styles.description, { color: colors.muted, textAlign: align }]}>{language === "ar" ? `ست فترات ثابتة. حدّث الأوقات والأسعار وحالة كل فترة؛ الوقت يعرض بنظام ${deviceSettings.timeFormat === "12h" ? "12 ساعة" : "24 ساعة"}.` : `Exactly six fixed shifts. Update each period's times, prices, and status; times use the ${deviceSettings.timeFormat === "12h" ? "12-hour" : "24-hour"} system.`}</Text><View style={[styles.weekendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "أيام نهاية الأسبوع" : "Weekend days"}</Text><View style={styles.weekendDays}>{WEEKEND_DAYS.map((day) => { const selected = weekendDays.includes(day.value); return <Pressable key={day.value} onPress={() => toggleWeekendDay(day.value)} style={({ pressed }) => [styles.weekendDay, { borderColor: selected ? color : colors.border, backgroundColor: selected ? color + "22" : colors.background, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: selected ? color : colors.muted, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? day.ar : day.en}</Text></Pressable>; })}</View></View>
    {shifts.map((shift, index) => { const period = FIXED_PERIODS[index] ?? FIXED_PERIODS[FIXED_PERIODS.length - 1]!; const periodName = language === "ar" ? period.ar : period.en; const crossesMidnight = shift.startTime > shift.endTime; return <View key={shift.id} style={card}><View style={[styles.shiftHeader, { flexDirection: row, alignItems: "center", gap: 9 }]}><View style={[styles.shiftColorDot, { backgroundColor: shift.color }]} /><View style={styles.flex}><View style={[styles.shiftHeaderRow, { flexDirection: row, alignItems: "center", gap: 7 }]}><View style={[styles.periodCodeBadge, { backgroundColor: shift.color + "1F", borderColor: shift.color + "66" }]}><Text style={{ color: shift.color, fontSize: 11, fontWeight: "900" }}>[{PERIOD_CODE_BADGES[period.key] ?? "X"}]</Text></View><Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? `الفترة ${index + 1} · ${periodName}` : `Shift ${index + 1} · ${periodName}`}</Text></View></View><Pressable accessibilityRole="switch" accessibilityState={{ checked: shift.isActive }} accessibilityLabel={language === "ar" ? `حالة فترة ${periodName}` : `Status for ${periodName}`} onPress={() => updateShiftStatus(shift.id, !shift.isActive)} style={({ pressed }) => [styles.togglePill, { backgroundColor: shift.isActive ? shift.color + "22" : colors.surface, borderColor: shift.isActive ? shift.color : colors.border, flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><View style={[styles.statusDot, { backgroundColor: shift.isActive ? shift.color : colors.muted }]} /><Text style={{ color: shift.isActive ? shift.color : colors.muted, fontSize: 10, fontWeight: "900" }}>{shift.isActive ? (language === "ar" ? "مفعّلة" : "Active") : (language === "ar" ? "موقوفة" : "Paused")}</Text></Pressable></View>
      <View style={[styles.dual, { flexDirection: periodFieldsRow }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "وقت البداية / الدخول" : "Start / check-in"} onPress={() => setTimePicker({ shiftId: shift.id, field: "startTime", value: shift.startTime })} style={[styles.timeButton, { borderColor: colors.border, backgroundColor: colors.background, flexDirection: row }]}><MaterialIcons name="login" size={16} color={shift.color} /><View style={styles.flex}><Text style={[styles.hint, { color: colors.muted, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "وقت البداية / الدخول" : "Start / check-in"}</Text><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", textAlign: align }}>{formatTime(shift.startTime)}</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "وقت النهاية / المغادرة" : "End / check-out"} onPress={() => setTimePicker({ shiftId: shift.id, field: "endTime", value: shift.endTime })} style={[styles.timeButton, { borderColor: colors.border, backgroundColor: colors.background, flexDirection: row }]}><MaterialIcons name="logout" size={16} color={shift.color} /><View style={styles.flex}><Text style={[styles.hint, { color: colors.muted, textAlign: align, marginTop: 0 }]}>{language === "ar" ? "وقت النهاية / المغادرة" : "End / check-out"}</Text><View style={[styles.timeValueRow, { flexDirection: row, alignItems: "center", gap: 5 }]}><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", textAlign: align }}>{formatTime(shift.endTime)}</Text>{crossesMidnight ? <View style={[styles.nextDayBadge, { backgroundColor: shift.color + "1F" }]}><Text style={{ color: shift.color, fontSize: 8, fontWeight: "900" }}>{language === "ar" ? "اليوم التالي" : "Next day"}</Text></View> : null}</View></View></Pressable></View>
      <View style={[styles.dual, { flexDirection: periodFieldsRow }]}><View style={styles.flex}>{label(language === "ar" ? `سعر وسط الأسبوع (${settings.currency})` : `Weekday price (${settings.currency})`)}<TextInput value={shift.weekdayPrice ? String(shift.weekdayPrice) : ""} onChangeText={(value) => updateShift(shift.id, "weekdayPrice", value)} placeholder="0" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={input} /></View><View style={styles.flex}>{label(language === "ar" ? `سعر العطلة (${settings.currency})` : `Holiday price (${settings.currency})`)}<TextInput value={shift.holidayPrice ? String(shift.holidayPrice) : ""} onChangeText={(value) => updateShift(shift.id, "holidayPrice", value)} placeholder="0" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={input} /></View><View style={styles.flex}>{label(language === "ar" ? `سعر نهاية الأسبوع (${settings.currency})` : `Weekend price (${settings.currency})`)}<TextInput value={shift.weekendPrice ? String(shift.weekendPrice) : ""} onChangeText={(value) => updateShift(shift.id, "weekendPrice", value)} placeholder="0" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={input} /></View></View>
    </View>; })}
    {timePicker ? <View style={[styles.timePickerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{timePicker.field === "startTime" ? (language === "ar" ? "وقت البداية / الدخول" : "Start / check-in") : (language === "ar" ? "وقت النهاية / المغادرة" : "End / check-out")}</Text><DateTimePicker value={timeToDate(timePicker.value)} mode="time" is24Hour={deviceSettings.timeFormat === "24h"} locale="ar-JO" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={(_event: DateTimePickerEvent, date?: Date) => { if (date) updateShift(timePicker.shiftId, timePicker.field, dateToTime(date)); if (Platform.OS === "android") setTimePicker(null); }} /><Pressable onPress={() => setTimePicker(null)} style={[styles.timePickerDone, { backgroundColor: colors.primary }]}><Text style={{ color: colors.background, fontWeight: "900" }}>{language === "ar" ? "تم / حفظ" : "Done"}</Text></Pressable></View> : null}
    <Pressable onPress={() => void save()} style={({ pressed }) => [styles.save, { backgroundColor: colors.primary, opacity: pressed ? 0.76 : 1 }]}><Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>{language === "ar" ? "حفظ ملف الوحدة" : "Save property profile"}</Text></Pressable>
    {!isNew && existing ? <ChaletDeletePanel chaletName={existing.name} linkedBookingCount={linkedBookingCount} language={language} isRTL={isRTL} colors={colors} onDelete={deleteCurrent} /> : null}
  </ScrollView></ScreenContainer>;
}

function Metric({ label, value, colors, align }: { label: string; value: string; colors: ReturnType<typeof useColors>; align: "left" | "right" }) { return <View style={styles.metric}><Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: "900", fontSize: 12, textAlign: align }}>{value}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 3, textAlign: align }}>{label}</Text></View>; }

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 118 }, flex: { flex: 1, minWidth: 0 }, header: { alignItems: "center", gap: 12 }, title: { fontSize: 25, fontWeight: "900", lineHeight: 33 }, sectionTitle: { fontSize: 20, fontWeight: "900", lineHeight: 28, marginTop: 27, marginBottom: 4 }, description: { fontSize: 12, lineHeight: 19 }, summary: { borderWidth: 1, borderRadius: 18, marginTop: 18, padding: 11, gap: 6 }, metric: { flex: 1, minWidth: 0, padding: 5 }, card: { borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 10 }, imageRow: { borderWidth: 1, borderRadius: 15, padding: 11, gap: 11, alignItems: "center" }, image: { width: 78, height: 78, borderRadius: 14, flexShrink: 0 }, imageFallback: { width: 78, height: 78, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 }, photoActions: { flexWrap: "wrap", gap: 6, marginTop: 9 }, photoButton: { minHeight: 33, borderRadius: 10, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }, field: { marginTop: 17 }, label: { fontSize: 14, lineHeight: 21, fontWeight: "900" }, hint: { fontSize: 11, lineHeight: 17, marginTop: 3 }, propertyTypeGrid: { flexWrap: "wrap", gap: 8, marginTop: 9 }, propertyTypeChip: { width: "31%", minHeight: 42, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 6 }, input: { minHeight: 49, marginTop: 7, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, lineHeight: 22 }, notes: { minHeight: 98, paddingTop: 12 }, dual: { gap: 11, marginTop: 16 }, publishRow: { borderWidth: 1, borderRadius: 15, padding: 13, gap: 10, alignItems: "center", marginTop: 16 }, palette: { flexWrap: "wrap", gap: 9, marginTop: 9 }, colorCircle: { width: 38, height: 38, borderRadius: 20, borderWidth: 3, alignItems: "center", justifyContent: "center" }, hexRow: { gap: 8, marginTop: 7, alignItems: "center" }, hexInput: { flex: 1, minWidth: 0, minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 15, writingDirection: "ltr", textAlign: "left" }, hexButton: { minWidth: 86, minHeight: 48, borderRadius: 13, paddingHorizontal: 10, flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center" }, hexButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 }, weekendCard: { marginTop: 10, borderWidth: 1, borderRadius: 18, padding: 14 }, weekendDays: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginTop: 11 }, weekendDay: { minWidth: 68, minHeight: 36, paddingHorizontal: 9, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" }, shiftHeader: { alignItems: "flex-start", gap: 9 }, shiftHeaderRow: { flexWrap: "wrap" }, periodCodeBadge: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, alignItems: "center", justifyContent: "center" }, removeButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, timeInput: { writingDirection: "ltr", textAlign: "left" }, shiftSettings: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 16 }, shiftStatusPress: { alignItems: "center", gap: 12 }, statusPill: { minWidth: 92, minHeight: 36, borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", gap: 6 }, statusDot: { width: 9, height: 9, borderRadius: 5 }, shiftColorDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.55)" }, shiftNameInput: { minHeight: 34, marginTop: 3, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, fontSize: 13, fontWeight: "800" }, togglePill: { minHeight: 32, borderWidth: 1, borderRadius: 16, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", gap: 5 }, timeButton: { flex: 1, minWidth: 0, minHeight: 62, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center", gap: 7 }, timeValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, nextDayBadge: { minHeight: 16, borderRadius: 8, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" }, timePickerCard: { borderWidth: 1, borderRadius: 18, marginTop: 10, padding: 14, gap: 6 }, timePickerDone: { minHeight: 44, borderRadius: 12, alignSelf: "center", paddingHorizontal: 26, alignItems: "center", justifyContent: "center" }, shiftColorBlock: { marginTop: 14 }, shiftColors: { flexWrap: "wrap", gap: 8, marginTop: 8 }, shiftColorCircle: { width: 31, height: 31, borderRadius: 16, borderWidth: 3, alignItems: "center", justifyContent: "center" }, addShift: { minHeight: 51, borderWidth: 1, borderRadius: 16, marginTop: 13, alignItems: "center", justifyContent: "center", gap: 7 }, save: { minHeight: 55, borderRadius: 16, marginTop: 21, alignItems: "center", justifyContent: "center" },
});
