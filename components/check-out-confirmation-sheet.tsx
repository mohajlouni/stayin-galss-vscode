import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { GlowGlassCard } from "@/components/glow-glass-card";
import { UtilityMeterCapture } from "@/components/utility-meter-capture";
import { type Asset, type Booking, type CheckoutConfirmation, formatMoney, paymentMethodLabel, remainingRefundableDeposit, type PaymentMethod, type UtilityMeterInput, PAYMENT_METHODS, effectiveUtilityTracking } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";

type Palette = { background: string; foreground: string; muted: string; primary: string; success: string; surface: string; surfaceMuted: string; warning: string; error: string };

const methodIcons: Record<PaymentMethod, keyof typeof MaterialIcons.glyphMap> = {
  "cash-owner": "person",
  "cash-guardian": "security",
  "bank-transfer": "account-balance",
  click: "account-balance-wallet",
  wallet: "account-balance-wallet",
};

export function CheckOutConfirmationSheet({ booking, colors, currency, language, isRTL, visible, saving, onClose, onConfirm, assets = [] }: { booking: Booking | null; colors: Palette; currency: string; language: "ar" | "en"; isRTL: boolean; visible: boolean; saving: boolean; onClose: () => void; onConfirm: (confirmation: CheckoutConfirmation) => void; assets?: Asset[] }) {
  const { settings } = useBookings();
  const utilityTrackingEnabled = effectiveUtilityTracking(settings).enabled;
  const [inspectionPassed, setInspectionPassed] = useState(false);
  const [assetResults, setAssetResults] = useState<Record<string, boolean>>({});
  const [refundDeposit, setRefundDeposit] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState("");
  const [meterInput, setMeterInput] = useState<UtilityMeterInput | undefined>();
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const depositHeld = booking ? remainingRefundableDeposit(booking) : 0;
  const chaletAssets = booking ? assets.filter((asset) => !asset.chaletId || asset.chaletId === booking.chaletId) : [];

  useEffect(() => {
    if (!visible) return;
    setInspectionPassed(false);
    setRefundDeposit(depositHeld > 0.005);
    setRefundAmount(depositHeld > 0.005 ? String(depositHeld) : "");
    setRefundMethod(null);
    setNote("");
    setMeterInput(undefined);
    setAssetResults(Object.fromEntries(chaletAssets.map((asset) => [asset.id, true])));
  }, [visible, booking?.id, depositHeld]);

  if (!booking) return null;
  const amount = Number(refundAmount);
  const refundExceedsHeld = amount > depositHeld + 0.005;
  const validRefund = !refundDeposit || (Boolean(refundMethod) && Number.isFinite(amount) && amount > 0 && !refundExceedsHeld);
  const ready = inspectionPassed && validRefund;
  const failedCount = chaletAssets.filter((asset) => assetResults[asset.id] === false).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !saving && onClose()} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} disabled={saving} onPress={onClose} />
        <GlowGlassCard radius={28} intensity={34} style={styles.sheet} contentStyle={styles.sheetContent}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
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

          {chaletAssets.length > 0 ? <View style={[styles.assetSection, { backgroundColor: colors.surfaceMuted }]}>
            <View style={[styles.assetSectionHeader, { flexDirection: row }]}><View style={[styles.icon, styles.smallIcon, { backgroundColor: colors.primary + "16" }]}><MaterialIcons name="inventory" size={18} color={colors.primary} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "فحص الأصول التفصيلي" : "Asset-level inspection"}</Text><Text style={{ color: failedCount ? colors.error : colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{failedCount ? (language === "ar" ? `${failedCount} أصل بحاجة للصيانة — سيُنشأ أمر إصلاح تلقائيًا` : `${failedCount} asset(s) need service — an auto repair task will be created`) : (language === "ar" ? "حدد الأصول المتضررة إن وُجدت" : "Mark any damaged assets")}</Text></View></View>
            {chaletAssets.map((asset) => {
              const passed = assetResults[asset.id] !== false;
              return <View key={asset.id} style={[styles.assetRow, { backgroundColor: colors.surface, borderColor: passed ? colors.surfaceMuted : colors.error + "66", flexDirection: row }]}>
                <View style={[styles.assetIcon, { backgroundColor: passed ? colors.success + "14" : colors.error + "14" }]}><MaterialIcons name={passed ? "check-circle" : "warning"} size={16} color={passed ? colors.success : colors.error} /></View>
                <Text numberOfLines={1} style={[styles.flex, { color: colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }]}>{asset.name}</Text>
                <View style={[styles.assetToggle, { flexDirection: row }]}>
                  <Pressable disabled={saving} accessibilityRole="button" accessibilityLabel={language === "ar" ? `${asset.name} سليم` : `${asset.name} passed`} onPress={() => setAssetResults((current) => ({ ...current, [asset.id]: true }))} style={({ pressed }) => [styles.assetChipPass, { backgroundColor: passed ? colors.success : colors.surfaceMuted, opacity: pressed || saving ? 0.7 : 1 }]}><MaterialIcons name="thumb-up" size={12} color={passed ? "#FFFFFF" : colors.muted} /><Text style={{ color: passed ? "#FFFFFF" : colors.muted, fontSize: 9, fontWeight: "900" }}>{language === "ar" ? "سليم" : "OK"}</Text></Pressable>
                  <Pressable disabled={saving} accessibilityRole="button" accessibilityLabel={language === "ar" ? `${asset.name} متضرر` : `${asset.name} damaged`} onPress={() => setAssetResults((current) => ({ ...current, [asset.id]: false }))} style={({ pressed }) => [styles.assetChipFail, { backgroundColor: !passed ? colors.error : colors.surfaceMuted, opacity: pressed || saving ? 0.7 : 1 }]}><MaterialIcons name="report" size={12} color={!passed ? "#FFFFFF" : colors.muted} /><Text style={{ color: !passed ? "#FFFFFF" : colors.muted, fontSize: 9, fontWeight: "900" }}>{language === "ar" ? "متضرر" : "Damage"}</Text></Pressable>
                </View>
              </View>;
            })}
          </View> : null}

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
          {utilityTrackingEnabled ? <UtilityMeterCapture colors={colors} language={language} isRTL={isRTL} saving={saving} value={meterInput} onChange={setMeterInput} title={language === "ar" ? "قراءة العداد النهائية" : "Closing meter reading"} /> : null}
          <View style={[styles.actions, { flexDirection: row }]}>
            <Pressable disabled={saving} onPress={onClose} style={({ pressed }) => [styles.secondary, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.58 : 1 }]}><Text style={{ color: colors.foreground, fontWeight: "900" }}>{language === "ar" ? "رجوع" : "Back"}</Text></Pressable>
            <Pressable disabled={!ready || saving} onPress={() => onConfirm({ inspectionPassed: true, inspectionNote: note.trim() || undefined, assetInspections: chaletAssets.length ? chaletAssets.map((asset) => ({ assetId: asset.id, assetName: asset.name, passed: assetResults[asset.id] !== false })) : undefined, depositRefund: refundDeposit && refundMethod ? { amount, paymentMethod: refundMethod, note: note.trim() || undefined } : undefined, utilityReading: meterInput })} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed || !ready || saving ? 0.55 : 1 }]}><MaterialIcons name={saving ? "hourglass-top" : "logout"} size={19} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{saving ? (language === "ar" ? "جارٍ الحفظ" : "Saving") : (language === "ar" ? "اعتماد المغادرة" : "Confirm checkout")}</Text></Pressable>
          </View>
          </ScrollView>
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
  smallIcon: { width: 32, height: 32, borderRadius: 11 },
  close: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  inspection: { alignItems: "center", gap: 10, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 11, marginTop: 13 },
  assetSection: { borderRadius: 18, padding: 11, marginTop: 9 },
  assetSectionHeader: { alignItems: "center", gap: 9, marginBottom: 8 },
  assetRow: { alignItems: "center", gap: 8, borderRadius: 13, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 8, marginTop: 7 },
  assetIcon: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  assetToggle: { gap: 5, alignItems: "center" },
  assetChipPass: { minHeight: 28, borderRadius: 9, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3 },
  assetChipFail: { minHeight: 28, borderRadius: 9, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3 },
  refundPanel: { borderRadius: 18, padding: 11, marginTop: 9 },
  input: { minHeight: 42, borderRadius: 14, paddingHorizontal: 10, marginTop: 7, fontSize: 13 },
  methods: { gap: 6, marginTop: 9, flexWrap: "wrap" },
  method: { minHeight: 36, borderRadius: 13, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", gap: 3, flexDirection: "row" },
  note: { minHeight: 68, borderRadius: 16, padding: 11, marginTop: 7, fontSize: 12, lineHeight: 18 },
  actions: { gap: 9, marginTop: 16 },
  secondary: { flex: 1, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  primary: { flex: 1.45, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 7, flexDirection: "row" },
});
