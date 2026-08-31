import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";

import { GlowGlassCard } from "@/components/glow-glass-card";
import { SignaturePad } from "@/components/signature-pad";
import { useColors } from "@/hooks/use-colors";
import { type Booking, type Settings, formatMoney, DEFAULT_DEVICE_SETTINGS } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { contractTermsSnapshot, decodeSignatureStrokes } from "@/lib/contracts";
import { shareContractPdf } from "@/lib/contracts-pdf";
import { useWorkspaceAccess } from "@/lib/workspace-access";

function SignaturePreview({ base64, colors }: { base64?: string; colors: ReturnType<typeof useColors> }) {
  const strokes = decodeSignatureStrokes(base64);
  if (!strokes.length) return <Text style={{ color: colors.muted, fontSize: 11 }}>—</Text>;
  return <View style={{ height: 110, borderRadius: 12, backgroundColor: colors.surface, padding: 6 }}><Svg width="100%" height="100%" viewBox="0 0 360 120"><Polyline points={strokes.flat().map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} stroke={colors.foreground} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg></View>;
}

export function ContractAgreementModal({ booking, settings, language, isRTL, colors, visible, saving, onClose }: { booking: Booking | null; settings: Settings; language: "ar" | "en"; isRTL: boolean; colors: ReturnType<typeof useColors>; visible: boolean; saving: boolean; onClose: () => void }) {
  const { contracts, signContract } = useBookings();
  const { can } = useWorkspaceAccess();
  const contractTerms = settings.device?.stayContractTerms ?? DEFAULT_DEVICE_SETTINGS.stayContractTerms;
  const [signerName, setSignerName] = useState("");
  const [signatureBase64, setSignatureBase64] = useState<string | undefined>(undefined);
  const [justSigned, setJustSigned] = useState(false);
  const [sharing, setSharing] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const signedContract = booking ? contracts?.find((contract) => contract.bookingId === booking.id && contract.status === "signed") : undefined;
  const isSigned = Boolean(signedContract) || justSigned;
  const canSign = booking ? can("edit_bookings") && booking.status !== "cancelled" && booking.status !== "completed" : false;

  const close = () => { if (!saving && !sharing) onClose(); };

  const confirmSignature = async () => {
    if (!booking || !signatureBase64 || !signerName.trim()) return;
    try {
      const termsSnapshot = contractTermsSnapshot(booking, settings, contractTerms);
      await signContract({ bookingId: booking.id, guestSignatureBase64: signatureBase64, termsSnapshot, signedByName: signerName.trim() });
      setJustSigned(true);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "contract-already-signed") return Alert.alert(language === "ar" ? "العقد موقّع مسبقًا" : "Contract already signed", language === "ar" ? "تم توثيق توقيع هذا الحجز مسبقًا." : "This booking's agreement has already been signed.");
      if (code.endsWith("-forbidden")) return Alert.alert(language === "ar" ? "صلاحية مطلوبة" : "Permission required", language === "ar" ? "لا تملك صلاحية توثيق العقود. اطلب من المدير تفعيلها." : "You do not have permission to sign contracts.");
      Alert.alert(language === "ar" ? "تعذر حفظ العقد" : "Could not save contract", language === "ar" ? "حاول مرة أخرى بعد قليل." : "Please try again shortly.");
    }
  };

  const sharePdf = async () => {
    if (!booking) return;
    const contract = signedContract;
    if (!contract) return;
    setSharing(true);
    try {
      await shareContractPdf({
        businessName: settings.businessName,
        businessLogoUrl: settings.businessLogoUrl,
        guestName: contract.guestName,
        phone: contract.guestPhone,
        chaletName: contract.chaletName,
        bookingReference: contract.bookingReference,
        bookingTypeLabel: settings.bookingTypes[contract.bookingType]?.label ?? contract.bookingType,
        startDateLabel: contract.startDate,
        endDateLabel: contract.endDate,
        rentalTotal: formatMoney(contract.rentalTotal, settings.currency),
        depositAmount: formatMoney(contract.depositAmount, settings.currency),
        terms: contract.termsSnapshot,
        signatureBase64: contract.guestSignatureBase64,
        signedByName: contract.signedByName,
        signedAtLabel: contract.signedAt ? new Date(contract.signedAt).toLocaleString(language === "ar" ? "ar-JO" : "en-GB") : undefined,
      });
    } catch {
      Alert.alert(language === "ar" ? "تعذر توليد الملف" : "Could not generate file", language === "ar" ? "لا تتوفر الطباعة أو المشاركة على هذا الجهاز." : "Printing or sharing is not available on this device.");
    } finally {
      setSharing(false);
    }
  };

  const terms = (isSigned ? signedContract?.termsSnapshot : contractTermsSnapshot(booking ?? ({} as Booking), settings, contractTerms)) ?? "";

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} disabled={saving || sharing} onPress={close} />
      <GlowGlassCard radius={28} intensity={34} style={styles.sheet} contentStyle={styles.sheetContent}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 18 }}>
          <View style={[styles.header, { flexDirection: row }]}>
            <View style={[styles.headerIcon, { backgroundColor: colors.primary + "1A" }]}><MaterialIcons name="description" size={22} color={colors.primary} /></View>
            <View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{language === "ar" ? "عقد الإيجار الرقمي" : "Digital lease agreement"}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, marginTop: 2, textAlign: align }}>{booking?.chaletName ?? settings.businessName}{booking?.bookingReference ? ` · #${booking.bookingReference}` : ""}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={close} disabled={saving || sharing} style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="close" size={21} color={colors.muted} /></Pressable>
          </View>

          {!booking ? null : <>
            <View style={[styles.identity, { flexDirection: row }]}>
              <View style={styles.flex}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? "الضيف" : "Guest"}</Text><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", marginTop: 3, textAlign: align }}>{booking.customerName}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, writingDirection: "ltr", textAlign: align }}>{booking.phone}</Text></View>
              <View style={styles.flex}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? "الفترة" : "Period"}</Text><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", marginTop: 3, textAlign: align }}>{booking.startDate} ← {booking.endDate}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{settings.bookingTypes[booking.bookingType]?.label ?? booking.bookingType} · {booking.startTime} – {booking.endTime}</Text></View>
            </View>

            <View style={[styles.money, { flexDirection: row }]}>
              <View style={[styles.moneyBox, { backgroundColor: colors.surfaceMuted }]}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إجمالي الإيجار" : "Rental total"}</Text><Text style={{ color: colors.primary, fontSize: 16, fontWeight: "900", marginTop: 3 }}>{formatMoney(booking.price, settings.currency)}</Text></View>
              <View style={[styles.moneyBox, { backgroundColor: colors.surfaceMuted }]}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{language === "ar" ? "تأمين مسترد" : "Refundable deposit"}</Text><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", marginTop: 3 }}>{formatMoney(booking.depositAmount ?? 0, settings.currency)}</Text></View>
            </View>

            {isSigned ? (
              <View style={styles.section}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align, marginBottom: 9 }}>{language === "ar" ? "شروط التعاقد الموقَّعة" : "Signed terms"}</Text>
                {terms.split(/\r?\n/).filter(Boolean).map((term, index) => <Text key={index} style={{ color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: align }}>{term}</Text>)}
                <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align, marginTop: 13, marginBottom: 6 }}>{language === "ar" ? "توقيع الضيف" : "Guest signature"}</Text>
                <SignaturePreview base64={signedContract?.guestSignatureBase64} colors={colors} />
                <Text style={{ color: colors.muted, fontSize: 11, marginTop: 7, textAlign: align }}>{[signedContract?.signedByName, signedContract?.signedAt].filter(Boolean).join(" · ")}</Text>
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align, marginBottom: 9 }}>{language === "ar" ? "شروط الإقامة والالتزامات" : "Stay terms & commitments"}</Text>
                {terms.split(/\r?\n/).filter(Boolean).map((term, index) => <Text key={index} style={{ color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: align }}>{term}</Text>)}
              </View>
            )}

            {!isSigned && canSign ? (
              <View style={styles.section}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align, marginBottom: 9 }}>{language === "ar" ? "توقيع الضيف الإلكتروني" : "Guest electronic signature"}</Text>
                <TextInput value={signerName} onChangeText={setSignerName} placeholder={language === "ar" ? "اسم الموقّع (الضيف)" : "Signer name (guest)"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
                <View style={{ marginTop: 10 }}><SignaturePad language={language} onChange={setSignatureBase64} /></View>
                <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "توثيق التوقيع وحفظ العقد" : "Confirm signature and save contract"} disabled={saving || sharing || !signatureBase64 || !signerName.trim()} onPress={() => void confirmSignature()} style={({ pressed }) => [styles.confirmButton, { backgroundColor: signatureBase64 && signerName.trim() ? colors.primary : colors.muted, opacity: pressed ? 0.8 : 1 }]}><MaterialIcons name="verified" size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "900" }}>{saving || sharing ? (language === "ar" ? "جارٍ الحفظ..." : "Saving...") : (language === "ar" ? "إمضاء وتوثيق العقد" : "Sign & save contract")}</Text></Pressable>
              </View>
            ) : !isSigned && !canSign ? (
              <View style={[styles.section, { alignItems: "center" }]}><MaterialIcons name="lock-outline" size={22} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, marginTop: 6, textAlign: "center" }}>{language === "ar" ? "لا يمكن توثيق توقيع لهذا الحجز في هذه المرحلة." : "Signature capture is not available for this booking at this stage."}</Text></View>
            ) : null}

            {isSigned ? (
              <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "مشاركة العقد PDF" : "Share contract PDF"} disabled={sharing || saving} onPress={() => void sharePdf()} style={({ pressed }) => [styles.confirmButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}><MaterialIcons name="ios-share" size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "900" }}>{sharing ? (language === "ar" ? "جارٍ التوليد..." : "Generating...") : (language === "ar" ? "مشاركة العقد PDF" : "Share contract PDF")}</Text></Pressable>
            ) : null}
          </>}
        </ScrollView>
      </GlowGlassCard>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(3, 7, 12, 0.55)", justifyContent: "flex-end" },
  sheet: { maxHeight: "88%", borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  sheetContent: { padding: 18 },
  header: { alignItems: "center", gap: 10, marginBottom: 14 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  closeButton: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  identity: { gap: 10, paddingVertical: 4 },
  money: { gap: 10, marginTop: 12 },
  moneyBox: { flex: 1, minWidth: 0, borderRadius: 14, padding: 12 },
  section: { marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: "rgba(128,150,140,0.2)", padding: 13 },
  input: { minHeight: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, fontWeight: "700" },
  confirmButton: { minHeight: 48, borderRadius: 15, marginTop: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
});