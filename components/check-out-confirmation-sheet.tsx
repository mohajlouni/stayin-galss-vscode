import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { GlowGlassCard } from "@/components/glow-glass-card";
import { type Booking, type CheckoutConfirmation, formatMoney, paymentMethodLabel, remainingRefundableDeposit, type PaymentMethod, PAYMENT_METHODS } from "@/lib/booking-model";

type Palette = { background: string; foreground: string; muted: string; primary: string; success: string; surface: string; surfaceMuted: string; warning: string; error: string };

const methodIcons: Record<PaymentMethod, keyof typeof MaterialIcons.glyphMap> = {
  "cash-owner": "person",
  "cash-guardian": "security",
  "bank-transfer": "account-balance",
  click: "account-balance-wallet",
  wallet: "account-balance-wallet",
};

export function CheckOutConfirmationSheet({ booking, colors, currency, language, isRTL, visible, saving, onClose, onConfirm }: { booking: Booking | null; colors: Palette; currency: string; language: "ar" | "en"; isRTL: boolean; visible: boolean; saving: boolean; onClose: () => void; onConfirm: (confirmation: CheckoutConfirmation) => void }) {
  const [inspectionPassed, setInspectionPassed] = useState(false);
  const [refundDeposit, setRefundDeposit] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState("");
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const depositHeld = booking ? remainingRefundableDeposit(booking) : 0;

  useEffect(() => {
    if (!visible) return;
    setInspectionPassed(false);
    setRefundDeposit(depositHeld > 0.005);
    setRefundAmount(depositHeld > 0.005 ? String(depositHeld) : "");
    setRefundMethod(null);
    setNote("");
  }, [visible, booking?.id, depositHeld]);

  if (!booking) return null;
  const amount = Number(refundAmount);
  const refundExceedsHeld = amount > depositHeld + 0.005;
  const validRefund = !refundDeposit || (Boolean(refundMethod) && Number.isFinite(amount) && amount > 0 && !refundExceedsHeld);
  const ready = inspectionPassed && validRefund;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !saving && onClose()} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} disabled={saving} onPress={onClose} />
        <GlowGlassCard radius={28} intensity={34} style={styles.sheet} contentStyle={styles.sheetContent}>
          <View style={[styles.header, { flexDirection: row }]}>
            <View style={[styles.icon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="fact-check" size={22} color={colors.primary} /></View>
            <View style={styles.flex}>
              <Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تأكيد مغادرة الضيف" : "Confirm guest checkout"}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3, textAlign: align }}>{language === "ar" ? `أكمل فحص شاليه ${booking.chaletName ?? "الضيف"} قبل إنهاء الإقامة.` : `Complete the chalet inspection before ending ${booking.customerName}'s stay.`}</Text>
            </View>
            <Pressable disabled={saving} onPress={onClose} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.55 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable>
          </View>

          <Pressable disabled={saving} accessibilityRole="checkbox" accessibilityState={{ checked: inspectionPassed }} onPress={() => setInspectionPassed((value) => !value)} style={({ pressed }) => [styles.inspection, { backgroundColor: inspectionPassed ? colors.success + "18" : colors.surfaceMuted, flexDirection: row, opacity: pressed || saving ? 0.7 : 1 }]}>
            <MaterialIcons name={inspectionPassed ? "check-box" : "check-box-outline-blank"} size={22} color={inspectionPassed ? colors.success : colors.muted} />
            <View style={styles.flex}>
              <Text style={{ color: inspectionPassed ? colors.success : colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تم فحص الشاليه واعتماد التسليم" : "Chalet inspected and handover approved"}</Text>
              <Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 3, textAlign: align }}>{language === "ar" ? "يلزم هذا التأكيد قبل نقل الحجز إلى منتهي الإقامة." : "This confirmation is required before ending the stay."}</Text>
            </View>
          </Pressable>

          {depositHeld > 0.005 ? <>
            <Pressable disabled={saving} accessibilityRole="checkbox" accessibilityState={{ checked: refundDeposit }} onPress={() => setRefundDeposit((value) => !value)} style={({ pressed }) => [styles.inspection, { backgroundColor: refundDeposit ? colors.success + "18" : colors.surfaceMuted, flexDirection: row, opacity: pressed || saving ? 0.7 : 1 }]}>
              <MaterialIcons name={refundDeposit ? "check-box" : "check-box-outline-blank"} size={22} color={refundDeposit ? colors.success : colors.muted} />
              <View style={styles.flex}>
                <Text style={{ color: refundDeposit ? colors.success : colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? `إرجاع التأمين الآن: ${formatMoney(depositHeld, currency)}` : `Refund deposit now: ${formatMoney(depositHeld, currency)}`}</Text>
                <Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 3, textAlign: align }}>{language === "ar" ? "يمكن تعديل مبلغ الاسترداد أو تركه محتجزًا مع كتابة السبب." : "You can adjust the refund amount or hold the deposit and add a reason."}</Text>
              </View>
            </Pressable>
            {refundDeposit ? <View style={[styles.refundPanel, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "900", textAlign: align }}>{language === "ar" ? "مبلغ الاسترداد" : "Refund amount"}</Text>
              <TextInput value={refundAmount} onChangeText={setRefundAmount} keyboardType="decimal-pad" editable={!saving} textAlign={align} style={[styles.input, { color: colors.foreground, backgroundColor: refundExceedsHeld ? colors.error + "14" : colors.surface }]} />
              <View style={[styles.methods, { flexDirection: row }]}>{PAYMENT_METHODS.map((method) => {
                const selected = refundMethod === method;
                return <Pressable key={method} disabled={saving} onPress={() => setRefundMethod(method)} style={({ pressed }) => [styles.method, { backgroundColor: selected ? colors.primary : colors.surface, opacity: pressed || saving ? 0.7 : 1 }]}><MaterialIcons name={methodIcons[method]} size={15} color={selected ? "#FFFFFF" : colors.muted} /><Text numberOfLines={1} style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 9, fontWeight: "800" }}>{paymentMethodLabel(method, language)}</Text></Pressable>;
              })}</View>
              {refundExceedsHeld ? <Text style={{ color: colors.error, fontSize: 10, marginTop: 5, textAlign: align }}>{language === "ar" ? "لا يمكن أن يتجاوز الاسترداد التأمين المحتجز." : "Refund cannot exceed the held deposit."}</Text> : null}
            </View> : null}
          </> : null}

          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", marginTop: 13, textAlign: align }}>{language === "ar" ? "ملاحظة الفحص أو سبب الاحتجاز (اختياري)" : "Inspection note or hold reason (optional)"}</Text>
          <TextInput value={note} onChangeText={setNote} editable={!saving} multiline maxLength={240} placeholder={language === "ar" ? "مثال: تم التسليم بحالة جيدة" : "Example: handed over in good condition"} placeholderTextColor={colors.muted} textAlignVertical="top" style={[styles.note, { color: colors.foreground, backgroundColor: colors.surfaceMuted, textAlign: align }]} />
          <View style={[styles.actions, { flexDirection: row }]}>
            <Pressable disabled={saving} onPress={onClose} style={({ pressed }) => [styles.secondary, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.58 : 1 }]}><Text style={{ color: colors.foreground, fontWeight: "900" }}>{language === "ar" ? "رجوع" : "Back"}</Text></Pressable>
            <Pressable disabled={!ready || saving} onPress={() => onConfirm({ inspectionPassed: true, inspectionNote: note.trim() || undefined, depositRefund: refundDeposit && refundMethod ? { amount, paymentMethod: refundMethod, note: note.trim() || undefined } : undefined })} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed || !ready || saving ? 0.55 : 1 }]}><MaterialIcons name={saving ? "hourglass-top" : "logout"} size={19} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{saving ? (language === "ar" ? "جارٍ الحفظ" : "Saving") : (language === "ar" ? "اعتماد المغادرة" : "Confirm checkout")}</Text></Pressable>
          </View>
        </GlowGlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(7, 20, 18, 0.62)" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetContent: { padding: 18, paddingBottom: 28 },
  header: { alignItems: "center", gap: 10 },
  flex: { flex: 1 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  close: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  inspection: { alignItems: "center", gap: 10, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 11, marginTop: 13 },
  refundPanel: { borderRadius: 18, padding: 11, marginTop: 9 },
  input: { minHeight: 42, borderRadius: 14, paddingHorizontal: 10, marginTop: 7, fontSize: 13 },
  methods: { gap: 6, marginTop: 9, flexWrap: "wrap" },
  method: { minHeight: 36, borderRadius: 13, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", gap: 3, flexDirection: "row" },
  note: { minHeight: 68, borderRadius: 16, padding: 11, marginTop: 7, fontSize: 12, lineHeight: 18 },
  actions: { gap: 9, marginTop: 16 },
  secondary: { flex: 1, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  primary: { flex: 1.45, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 7, flexDirection: "row" },
});
