import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { ThemeColorPalette } from "@/constants/theme";

const HOLD_DURATION_MS = 3000;

type ChaletDeletePanelProps = {
  chaletName: string;
  linkedBookingCount: number;
  language: "ar" | "en";
  isRTL: boolean;
  colors: ThemeColorPalette;
  onDelete: () => Promise<void>;
};

export function ChaletDeletePanel({ chaletName, linkedBookingCount, language, isRTL, colors, onDelete }: ChaletDeletePanelProps) {
  const [visible, setVisible] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";

  const clearHold = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const close = () => {
    if (isDeleting) return;
    clearHold();
    setHoldProgress(0);
    setVisible(false);
  };
  const completeDelete = async () => {
    clearHold();
    setHoldProgress(1);
    setIsDeleting(true);
    try {
      await onDelete();
      setVisible(false);
    } finally {
      setIsDeleting(false);
      setHoldProgress(0);
    }
  };
  const beginHold = () => {
    if (isDeleting || timer.current) return;
    startedAt.current = Date.now();
    timer.current = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt.current) / HOLD_DURATION_MS);
      setHoldProgress(progress);
      if (progress >= 1) void completeDelete();
    }, 40);
  };
  const cancelHold = () => {
    if (isDeleting) return;
    clearHold();
    setHoldProgress(0);
  };

  useEffect(() => () => clearHold(), []);

  const hasBookings = linkedBookingCount > 0;
  const title = language === "ar" ? "حذف الشاليه" : "Delete chalet";
  const warning = hasBookings
    ? (language === "ar" ? `يوجد ${linkedBookingCount} حجز مرتبط بهذا الشاليه.` : `${linkedBookingCount} booking(s) are linked to this chalet.`)
    : (language === "ar" ? "لا توجد حجوزات مرتبطة بهذا الشاليه." : "There are no bookings linked to this chalet.");

  return <View style={[styles.dangerSection, { borderColor: colors.error + "88", backgroundColor: colors.error + "0D" }]}>
    <View style={[styles.dangerHeader, { flexDirection: row }]}><View style={[styles.dangerIcon, { backgroundColor: colors.error + "18" }]}><MaterialIcons name="delete-outline" size={21} color={colors.error} /></View><View style={styles.flex}><Text style={[styles.dangerTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "منطقة الخطر" : "Danger zone"}</Text><Text style={[styles.dangerDescription, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "سيُحذف الشاليه من القائمة، بينما تبقى حجوزاته محفوظة في السجل." : "The chalet is removed from the list; its bookings remain in history."}</Text></View></View>
    <Pressable onPress={() => setVisible(true)} style={({ pressed }) => [styles.openDelete, { borderColor: colors.error, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="delete-outline" size={18} color={colors.error} /><Text style={{ color: colors.error, fontSize: 13, fontWeight: "900" }}>{title}</Text></Pressable>
    <Modal animationType="fade" transparent visible={visible} onRequestClose={close}>
      <View style={styles.modalBackdrop}><View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.error + "AA" }]}>
        <View style={[styles.modalIcon, { backgroundColor: colors.error + "18" }]}><MaterialIcons name="warning-amber" size={28} color={colors.error} /></View>
        <Text style={[styles.modalTitle, { color: colors.foreground, textAlign: "center" }]}>{language === "ar" ? `حذف ${chaletName}؟` : `Delete ${chaletName}?`}</Text>
        <Text style={[styles.modalCopy, { color: colors.muted, textAlign: "center" }]}>{warning}</Text>
        {hasBookings ? <Text style={[styles.bookingNotice, { color: colors.warning, backgroundColor: colors.warning + "14" }]}>{language === "ar" ? "لن تُحذف الحجوزات أو دفعاتها؛ ستبقى في السجل للرجوع إليها." : "Bookings and payments will not be deleted; they remain in history."}</Text> : null}
        <Text style={[styles.holdHint, { color: colors.muted }]}>{language === "ar" ? "اضغط باستمرار 3 ثوانٍ لتأكيد الحذف." : "Hold for 3 seconds to confirm deletion."}</Text>
        <Pressable disabled={isDeleting} onPressIn={beginHold} onPressOut={cancelHold} style={({ pressed }) => [styles.holdButton, { backgroundColor: colors.error, opacity: isDeleting ? 0.72 : pressed ? 0.86 : 1 }]}>
          <View style={[styles.holdProgress, { width: `${holdProgress * 100}%`, backgroundColor: "#0000002E" }]} />
          <MaterialIcons name="delete-forever" size={20} color="#FFFFFF" /><Text style={styles.holdText}>{isDeleting ? (language === "ar" ? "جارٍ الحذف…" : "Deleting…") : (language === "ar" ? "اضغط مطولًا للحذف" : "Hold to delete")}</Text>
        </Pressable>
        <Pressable disabled={isDeleting} onPress={close} style={styles.cancelButton}><Text style={{ color: colors.muted, fontSize: 13, fontWeight: "900" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  dangerSection: { marginTop: 28, padding: 15, borderRadius: 18, borderWidth: 1 },
  dangerHeader: { alignItems: "flex-start", gap: 11 },
  dangerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dangerTitle: { fontSize: 15, lineHeight: 22, fontWeight: "900" },
  dangerDescription: { fontSize: 11, lineHeight: 17, marginTop: 2 },
  openDelete: { minHeight: 42, marginTop: 14, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "#000000B8" },
  modalCard: { borderWidth: 1, borderRadius: 22, padding: 20, alignItems: "center" },
  modalIcon: { width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 20, lineHeight: 28, fontWeight: "900", marginTop: 13 },
  modalCopy: { fontSize: 13, lineHeight: 20, marginTop: 7 },
  bookingNotice: { overflow: "hidden", borderRadius: 10, fontSize: 11, lineHeight: 18, fontWeight: "700", paddingHorizontal: 11, paddingVertical: 8, marginTop: 12, textAlign: "center" },
  holdHint: { fontSize: 11, lineHeight: 18, marginTop: 15, textAlign: "center" },
  holdButton: { width: "100%", minHeight: 52, borderRadius: 14, overflow: "hidden", marginTop: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  holdProgress: { position: "absolute", top: 0, bottom: 0, left: 0 },
  holdText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  cancelButton: { minHeight: 42, marginTop: 6, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
});
