import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

/** دور العضو في المنشأة: موظف حجوزات / مدير تشغيلي / حارس (يُترجم إلى صلاحيات عبر رقم هاتفه). */
export type AddUserRole = "staff" | "mini-admin" | "guard";

type AddUserModalProps = {
  visible: boolean;
  language: "ar" | "en";
  isRTL: boolean;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  /** يعالج الحفظ والدعوة تلقائيًا (ربط العضو بمنشأته عبر رقم الهاتف) ويعيد رسالة خطأ مترجمة أو null عند النجاح. */
  onSubmit: (entry: { name: string; phone: string; role: AddUserRole }) => Promise<string | null>;
};

const ROLES: { id: AddUserRole; icon: "badge" | "security" | "admin-panel-settings"; ar: string; en: string }[] = [
  { id: "guard", icon: "security", ar: "حارس", en: "Guard" },
  { id: "staff", icon: "badge", ar: "موظف حجوزات", en: "Booking staff" },
  { id: "mini-admin", icon: "admin-panel-settings", ar: "مدير تشغيلي", en: "Operational manager" },
];

export default function AddUserModal({ visible, language, isRTL, colors, onClose, onSubmit }: AddUserModalProps) {
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AddUserRole>("staff");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName("");
    setPhone("");
    setRole("staff");
    setPending(false);
  }, [visible]);

  const submit = async () => {
    if (name.trim().length < 2 || phone.trim().length < 6) {
      Alert.alert(language === "ar" ? "بيانات ناقصة" : "Missing details", language === "ar" ? "أدخل اسم العضو ورقم هاتفه بشكل صحيح." : "Enter the member's name and phone number.");
      return;
    }
    setPending(true);
    try {
      const error = await onSubmit({ name, phone, role });
      if (error) {
        Alert.alert(language === "ar" ? "تعذر الحفظ والدعوة" : "Could not save & invite", error);
        return;
      }
      onClose();
    } finally {
      setPending(false);
    }
  };

  return <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent><View style={styles.backdrop}><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={[styles.header, { flexDirection: row }]}><View style={styles.flex}><Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "إضافة عضو للفريق" : "Add team member"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "أدخل اسم العضو ورقم هاتفه ورتبته — وسيُربط تلقائيًا بالمنشأة وعهدها عبر رقم الهاتف." : "Enter the member's name, phone, and role — they will be linked to your property automatically by phone."}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View>

    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "اسم الموظف / العضو" : "Member name"}</Text>
      <TextInput value={name} onChangeText={setName} autoCorrect={false} placeholder={language === "ar" ? "مثال: أحمد، سارة" : "e.g. Ahmed, Sara"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />

      <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "رقم الهاتف للتواصل" : "Contact phone number"}</Text>
      <Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 3, textAlign: align }}>{language === "ar" ? "رقم الهاتف هو المفتاح الأساسي لربط العهود والتحصيلات بالعضو." : "The phone is the primary key that links floats and collections to the member."}</Text>
      <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} placeholder="07XXXXXXXX" placeholderTextColor={colors.muted} style={[styles.input, styles.inputMono, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: "left" }]} />

      <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "الدور / الصلاحية" : "Role / permission"}</Text>
      <View style={[styles.roleRow, { flexDirection: row }]}>{ROLES.map((choice) => <Pressable key={choice.id} accessibilityRole="button" accessibilityState={{ selected: role === choice.id }} onPress={() => setRole(choice.id)} style={({ pressed }) => [styles.roleChip, { backgroundColor: role === choice.id ? colors.primary + "1A" : colors.surfaceMuted + "3A", borderColor: role === choice.id ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={choice.icon} size={16} color={role === choice.id ? colors.primary : colors.muted} /><Text style={{ color: role === choice.id ? colors.primary : colors.muted, fontSize: 11, fontWeight: "800", textAlign: "center" }}>{language === "ar" ? choice.ar : choice.en}</Text></Pressable>)}</View>
    </ScrollView>

    <Pressable accessibilityRole="button" disabled={pending} onPress={() => void submit()} style={({ pressed }) => [styles.submit, { backgroundColor: colors.primary, opacity: pending ? 0.5 : pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="send" size={18} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 13 }}>{pending ? (language === "ar" ? "جارٍ الحفظ والدعوة..." : "Saving & inviting...") : (language === "ar" ? "حفظ وإرسال الدعوة" : "Save & send invitation")}</Text></Pressable>
  </View></View></Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2, 12, 10, 0.72)", justifyContent: "flex-end", padding: 12 },
  card: { maxHeight: "92%", borderWidth: 1, borderRadius: 24, padding: 15 },
  header: { alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { fontSize: 17, fontWeight: "900" },
  close: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 12.5, fontWeight: "800", marginTop: 13 },
  roleRow: { gap: 8, marginTop: 8 },
  roleChip: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, paddingHorizontal: 6 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, marginTop: 10 },
  inputMono: { fontFamily: "monospace" },
  submit: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 },
  flex: { flex: 1, minWidth: 0 },
});