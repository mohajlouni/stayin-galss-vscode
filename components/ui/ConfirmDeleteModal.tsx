import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type ConfirmDeleteModalProps = {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  language: "ar" | "en";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDeleteModal({ visible, title, description, confirmLabel, cancelLabel, language, busy = false, onConfirm, onCancel }: ConfirmDeleteModalProps) {
  const isArabic = language === "ar";
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!busy) onCancel(); }}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <View style={styles.headerIcon}>
            <MaterialIcons name="warning" size={26} color="#F43F5E" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={[styles.actions, { flexDirection: isArabic ? "row-reverse" : "row" }]}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onConfirm} style={({ pressed, hovered }) => [styles.confirm, hovered && !busy && styles.confirmHover, pressed && !busy && styles.pressed]}>
              <Text style={styles.confirmLabel}>{confirmLabel}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={({ pressed, hovered }) => [styles.cancel, hovered && !busy && styles.cancelHover, pressed && !busy && styles.pressed]}>
              <Text style={styles.cancelLabel}>{cancelLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.7)", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50, elevation: 50 },
  dialog: { width: "100%", maxWidth: 384, borderRadius: 16, backgroundColor: "#0F172A", borderWidth: 1, borderColor: "#1E293B", padding: 20, shadowColor: "#000000", shadowOpacity: 0.55, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 24 },
  headerIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(244, 63, 94, 0.15)", alignItems: "center", justifyContent: "center", marginBottom: 12, alignSelf: "center" },
  title: { fontSize: 18, fontWeight: "bold", color: "#FFFFFF", textAlign: "center", marginBottom: 8 },
  description: { fontSize: 14, color: "#CBD5E1", textAlign: "center", lineHeight: 22, marginBottom: 20 },
  actions: { alignItems: "center", gap: 12, width: "100%" },
  confirm: { flex: 1, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#E11D48", alignItems: "center", justifyContent: "center", transitionProperty: "transform, background-color", transitionDuration: "120ms" },
  confirmHover: { backgroundColor: "#BE123C" },
  cancel: { flex: 1, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#1E293B", alignItems: "center", justifyContent: "center", transitionProperty: "transform, background-color", transitionDuration: "120ms" },
  cancelHover: { backgroundColor: "#334155" },
  pressed: { transform: [{ scale: 0.95 }] },
  confirmLabel: { color: "#FFFFFF", fontWeight: "bold", fontSize: 14 },
  cancelLabel: { color: "#CBD5E1", fontWeight: "600", fontSize: 14 },
});