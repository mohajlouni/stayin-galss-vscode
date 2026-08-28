import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { GlowGlassCard } from "@/components/glow-glass-card";
import { type Booking, type CheckInConfirmation, type PaymentMethod, formatMoney, refundableDepositAmount, remainingAmount } from "@/lib/booking-model";

type Palette = {
  background: string;
  border: string;
  foreground: string;
  muted: string;
  primary: string;
  success: string;
  surface: string;
  surfaceMuted: string;
  warning: string;
  error: string;
};

type Props = {
  booking: Booking | null;
  colors: Palette;
  currency: string;
  language: "ar" | "en";
  isRTL: boolean;
  visible: boolean;
  saving: boolean;
  formatDate: (date: string) => string;
  formatTime: (time: string) => string;
  onClose: () => void;
  onConfirm: (confirmation: CheckInConfirmation) => void;
};

const PAYMENT_METHODS: { id: PaymentMethod; icon: "person" | "payments" | "flash-on"; ar: string; en: string }[] = [
  { id: "cash-owner", icon: "person", ar: "نقدًا بيد المالك", en: "Cash with owner" },
  { id: "cash-guardian", icon: "payments", ar: "نقدًا بيد الحارس", en: "Cash with guardian" },
  { id: "click", icon: "flash-on", ar: "تحويل CliQ", en: "CliQ transfer" },
];

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTimeKey(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function CheckInConfirmationSheet({ booking, colors, currency, language, isRTL, visible, saving, formatDate, formatTime, onClose, onConfirm }: Props) {
  const [arrivalAt, setArrivalAt] = useState(() => new Date().toISOString());
  const [rentalPaymentMethod, setRentalPaymentMethod] = useState<PaymentMethod | null>(null);
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<PaymentMethod | null>(null);
  const [identityNote, setIdentityNote] = useState("");
  const [identityImageUri, setIdentityImageUri] = useState<string | undefined>();
  const [identitySelecting, setIdentitySelecting] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const rentalBalance = booking ? remainingAmount(booking) : 0;
  const depositAmount = booking ? refundableDepositAmount(booking) : 0;
  const needsRentalPayment = rentalBalance > 0.005;
  const needsDepositPayment = depositAmount > 0.005;
  const readyToConfirm = (!needsRentalPayment || Boolean(rentalPaymentMethod)) && (!needsDepositPayment || Boolean(depositPaymentMethod));

  useEffect(() => {
    if (!visible) return;
    setArrivalAt(new Date().toISOString());
    setRentalPaymentMethod(null);
    setDepositPaymentMethod(booking?.depositPaymentMethod ?? null);
    setIdentityNote("");
    setIdentityImageUri(undefined);
  }, [booking?.depositPaymentMethod, booking?.id, visible]);

  if (!booking) return null;

  const arrival = new Date(arrivalAt);
  const arrivalLabel = Number.isNaN(arrival.getTime()) ? "—" : `${formatDate(localDateKey(arrival))} · ${formatTime(localTimeKey(arrival))}`;
  const selectIdentity = async (source: "camera" | "library") => {
    try {
      setIdentitySelecting(true);
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== "granted") {
          Alert.alert(language === "ar" ? "إذن الكاميرا مطلوب" : "Camera permission required", language === "ar" ? "اسمح للكاميرا بتصوير هوية الضيف." : "Allow camera access to photograph the guest ID.");
          return;
        }
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.75 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.75 });
      if (!result.canceled && result.assets[0]?.uri) setIdentityImageUri(result.assets[0].uri);
    } catch {
      Alert.alert(language === "ar" ? "تعذر إرفاق الهوية" : "Could not attach ID", language === "ar" ? "حاول التقاط أو اختيار الصورة مرة أخرى." : "Try taking or selecting the image again.");
    } finally {
      setIdentitySelecting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!saving) onClose(); }} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} disabled={saving} onPress={onClose} />
        <GlowGlassCard radius={28} intensity={34} style={styles.sheet} contentStyle={styles.sheetContent}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={[styles.header, { flexDirection: row }]}>
              <View style={[styles.icon, { backgroundColor: colors.success + "18" }]}><MaterialIcons name="how-to-reg" size={22} color={colors.success} /></View>
              <View style={styles.flex}>
                <Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تأكيد وصول الضيف" : "Confirm guest arrival"}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3, textAlign: align }}>{language === "ar" ? `تسجيل وصول ${booking.customerName} وتوثيق الاستلام.` : `Record ${booking.customerName}'s arrival and collection.`}</Text>
              </View>
              <Pressable disabled={saving} onPress={onClose} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.55 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable>
            </View>

            <View style={[styles.arrivalTime, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}>
              <MaterialIcons name="schedule" size={18} color={colors.primary} />
              <View style={styles.flex}>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900", textAlign: align }}>{language === "ar" ? "وقت الوصول الفعلي" : "Actual arrival time"}</Text>
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800", marginTop: 3, textAlign: align }}>{arrivalLabel}</Text>
              </View>
            </View>

            <PaymentMethodCard title={language === "ar" ? "دفعة المتبقي عند الوصول" : "Remaining balance at arrival"} amount={rentalBalance} currency={currency} required={needsRentalPayment} method={rentalPaymentMethod} onSelect={setRentalPaymentMethod} color={colors.success} colors={colors} language={language} isRTL={isRTL} saving={saving} />
            <PaymentMethodCard title={language === "ar" ? "استلام التأمين" : "Security deposit collection"} amount={depositAmount} currency={currency} required={needsDepositPayment} method={depositPaymentMethod} onSelect={setDepositPaymentMethod} color={colors.warning} colors={colors} language={language} isRTL={isRTL} saving={saving} />

            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", marginTop: 15, textAlign: align }}>{language === "ar" ? "هوية الضيف (اختياري)" : "Guest ID (optional)"}</Text>
            <View style={[styles.identityActions, { flexDirection: row }]}>
              <Pressable disabled={saving || identitySelecting} onPress={() => void selectIdentity("camera")} style={({ pressed }) => [styles.identityButton, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving || identitySelecting ? 0.58 : 1 }]}><MaterialIcons name="photo-camera" size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? "التقاط صورة" : "Camera"}</Text></Pressable>
              <Pressable disabled={saving || identitySelecting} onPress={() => void selectIdentity("library")} style={({ pressed }) => [styles.identityButton, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving || identitySelecting ? 0.58 : 1 }]}><MaterialIcons name="add-photo-alternate" size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? "رفع صورة" : "Upload"}</Text></Pressable>
              {identityImageUri ? <Pressable disabled={saving} onPress={() => setIdentityImageUri(undefined)} style={({ pressed }) => [styles.removeImage, { backgroundColor: colors.error + "12", opacity: pressed || saving ? 0.58 : 1 }]}><MaterialIcons name="delete-outline" size={18} color={colors.error} /></Pressable> : null}
            </View>
            {identityImageUri ? <Image source={{ uri: identityImageUri }} accessibilityLabel={language === "ar" ? "معاينة صورة هوية الضيف" : "Guest ID preview"} style={styles.identityPreview} /> : <Text style={{ color: colors.muted, fontSize: 10, marginTop: 5, textAlign: align }}>{language === "ar" ? "يُحفظ المرجع محليًا مع الحجز؛ استخدمه فقط بموافقة الضيف وسياسة المنشأة." : "The reference is saved locally with the booking; use only with consent and your property policy."}</Text>}
            <TextInput value={identityNote} onChangeText={setIdentityNote} editable={!saving} multiline maxLength={240} placeholder={language === "ar" ? "ملاحظة هوية أو استلام (اختياري)" : "ID or handover note (optional)"} placeholderTextColor={colors.muted} textAlignVertical="top" style={[styles.note, { color: colors.foreground, backgroundColor: colors.surfaceMuted, textAlign: align }]} />
            <Text style={{ color: readyToConfirm ? colors.muted : colors.warning, fontSize: 11, marginTop: 8, textAlign: align }}>{readyToConfirm ? (language === "ar" ? "جاهز لتأكيد الوصول." : "Ready to confirm arrival.") : (language === "ar" ? "اختر طريقة الاستلام لكل مبلغ ظاهر قبل التأكيد." : "Choose a method for each displayed amount before confirming.")}</Text>

            <View style={[styles.actions, { flexDirection: row }]}>
              <Pressable disabled={saving} onPress={onClose} style={({ pressed }) => [styles.secondary, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.58 : 1 }]}><Text style={{ color: colors.foreground, fontWeight: "900" }}>{language === "ar" ? "رجوع" : "Back"}</Text></Pressable>
              <Pressable disabled={!readyToConfirm || saving} onPress={() => onConfirm({ actualArrivalAt: arrivalAt, rentalBalanceVerified: !needsRentalPayment || Boolean(rentalPaymentMethod), rentalBalancePaymentMethod: rentalPaymentMethod ?? undefined, securityDepositVerified: !needsDepositPayment || Boolean(depositPaymentMethod), securityDepositPaymentMethod: depositPaymentMethod ?? undefined, identityNote: identityNote.trim() || undefined, identityImageUri })} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed || !readyToConfirm || saving ? 0.55 : 1 }]}><MaterialIcons name={saving ? "hourglass-top" : "login"} size={19} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{saving ? (language === "ar" ? "جارٍ الحفظ" : "Saving") : (language === "ar" ? "تأكيد الوصول" : "Confirm arrival")}</Text></Pressable>
            </View>
          </ScrollView>
        </GlowGlassCard>
      </View>
    </Modal>
  );
}

function PaymentMethodCard({ title, amount, currency, required, method, onSelect, color, colors, language, isRTL, saving }: { title: string; amount: number; currency: string; required: boolean; method: PaymentMethod | null; onSelect: (method: PaymentMethod) => void; color: string; colors: Palette; language: "ar" | "en"; isRTL: boolean; saving: boolean }) {
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  return (
    <View style={[styles.paymentCard, { backgroundColor: colors.surfaceMuted }]}>
      <View style={[styles.paymentHeader, { flexDirection: row }]}>
        <View style={[styles.paymentIcon, { backgroundColor: color + "19" }]}><MaterialIcons name={required ? "payments" : "check-circle"} size={18} color={color} /></View>
        <View style={styles.flex}>
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{title}</Text>
          <Text style={{ color: required ? color : colors.muted, fontSize: 15, fontWeight: "900", marginTop: 3, textAlign: align }}>{required ? formatMoney(amount, currency) : language === "ar" ? "لا يوجد مبلغ مطلوب" : "No amount due"}</Text>
        </View>
      </View>
      {required ? <><Text style={{ color: colors.muted, fontSize: 11, marginTop: 10, textAlign: align }}>{language === "ar" ? "اختر طريقة الاستلام لتأكيد هذه الدفعة" : "Select a collection method to confirm this payment"}</Text><View style={[styles.methodChoices, { flexDirection: row }]}>{PAYMENT_METHODS.map((option) => { const selected = method === option.id; return <Pressable key={option.id} disabled={saving} onPress={() => onSelect(option.id)} style={({ pressed }) => [styles.methodChoice, { backgroundColor: selected ? colors.primary : colors.background, opacity: pressed || saving ? 0.58 : 1 }]}><MaterialIcons name={option.icon} size={16} color={selected ? "#FFFFFF" : colors.muted} /><Text numberOfLines={2} style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 10, lineHeight: 14, fontWeight: "900", textAlign: "center" }}>{language === "ar" ? option.ar : option.en}</Text>{selected ? <MaterialIcons name="check-circle" size={14} color="#FFFFFF" /> : null}</Pressable>; })}</View></> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(7, 20, 18, 0.62)" },
  sheet: { maxHeight: "93%", borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 },
  scrollContent: { paddingBottom: 18 },
  header: { alignItems: "center", gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  close: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  arrivalTime: { alignItems: "center", gap: 10, borderRadius: 18, padding: 12, marginTop: 15 },
  paymentCard: { borderRadius: 18, padding: 12, marginTop: 11 },
  paymentHeader: { alignItems: "center", gap: 9 },
  paymentIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  methodChoices: { gap: 7, marginTop: 8 },
  methodChoice: { flex: 1, minWidth: 0, minHeight: 66, borderRadius: 15, paddingHorizontal: 5, paddingVertical: 7, alignItems: "center", justifyContent: "center", gap: 4 },
  identityActions: { gap: 7, marginTop: 7 },
  identityButton: { flex: 1, minHeight: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  removeImage: { width: 42, minHeight: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  identityPreview: { width: "100%", height: 128, borderRadius: 16, marginTop: 8, resizeMode: "cover" },
  note: { minHeight: 62, borderRadius: 16, padding: 11, marginTop: 9, fontSize: 12, lineHeight: 18 },
  actions: { gap: 9, marginTop: 16 },
  secondary: { flex: 1, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  primary: { flex: 1.45, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 7, flexDirection: "row" },
});
