import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { suggestOnbookUid } from "@/lib/staff-directory";

export type AddUserTrack = "app" | "onbook";

/** صلاحية مسبقة لدعوة عضو التطبيق: staff / mini-admin / guard (يُترجم إلى دور Guard + صلاحيات). */
export type AddUserPreset = "staff" | "mini-admin" | "guard";

type AddUserModalProps = {
  visible: boolean;
  language: "ar" | "en";
  isRTL: boolean;
  colors: ReturnType<typeof useColors>;
  /** أكواد المعرّفات المشغولة (أعضاء التطبيق + منتسبي الكتاب) لعرض معاينة UID الفوري. */
  takenUidCodes: string[];
  onClose: () => void;
  /** مسار التطبيق (Track A): ينشئ دعوة موظف عبر الخادم ويعيد نتيجة النجاح. */
  onInviteAppUser: (name: string, phone: string, preset: AddUserPreset) => Promise<boolean>;
  /** مسار الكتاب (Track B): يضيف منتسبًا محليًا ويعيد رسالة خطأ مترجمة أو null عند النجاح. */
  onAddOnbookStaff: (entry: { name: string; phone: string }) => Promise<string | null>;
};

const INVITE_PRESETS: { id: AddUserPreset; icon: "badge" | "admin-panel-settings" | "security"; ar: string; en: string }[] = [
  { id: "staff", icon: "badge", ar: "موظف حجوزات", en: "Booking staff" },
  { id: "mini-admin", icon: "admin-panel-settings", ar: "مدير تشغيلي", en: "Mini-admin" },
  { id: "guard", icon: "security", ar: "حارس / ضيف", en: "Guard / guest" },
];

export default function AddUserModal({ visible, language, isRTL, colors, takenUidCodes, onClose, onInviteAppUser, onAddOnbookStaff }: AddUserModalProps) {
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const [track, setTrack] = useState<AddUserTrack>("app");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [preset, setPreset] = useState<AddUserPreset>("staff");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTrack("app");
    setName("");
    setPhone("");
    setPreset("staff");
    setPending(false);
  }, [visible]);

  const previewUid = track === "onbook" ? suggestOnbookUid("staff", takenUidCodes) : "";

  const submitApp = async () => {
    if (name.trim().length < 2 || phone.trim().length < 6) {
      Alert.alert(language === "ar" ? "بيانات ناقصة" : "Missing details", language === "ar" ? "أدخل اسم الموظف ورقم هاتفه بشكل صحيح." : "Enter the employee name and phone number.");
      return;
    }
    setPending(true);
    try {
      const ok = await onInviteAppUser(name, phone, preset);
      if (ok) onClose();
    } finally {
      setPending(false);
    }
  };

  const submitOnbook = async () => {
    if (name.trim().length < 2 || phone.trim().length < 6) {
      Alert.alert(language === "ar" ? "بيانات ناقصة" : "Missing details", language === "ar" ? "أدخل اسم المنتسب ورقم هاتفه بشكل صحيح." : "Enter the staff name and phone number.");
      return;
    }
    setPending(true);
    try {
      const error = await onAddOnbookStaff({ name, phone });
      if (error) {
        Alert.alert(language === "ar" ? "تعذر الإضافة" : "Could not add", error);
        return;
      }
      onClose();
    } finally {
      setPending(false);
    }
  };

  return <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent><View style={styles.backdrop}><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={[styles.header, { flexDirection: row }]}><View style={styles.flex}><Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "إضافة عضو للفريق" : "Add team member"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "سجّل عضو تطبيق بدعوة، أو منتسبًا ميدانيًا على الكتاب بدون حساب." : "Invite an app member or register field staff on the book without an account."}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View>

    <View style={[styles.tabs, { flexDirection: row }]}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: track === "app" }} onPress={() => setTrack("app")} style={[styles.tab, { backgroundColor: track === "app" ? colors.primary + "1A" : colors.surfaceMuted + "3A", borderColor: track === "app" ? colors.primary : colors.border }]}><MaterialIcons name="smartphone" size={17} color={track === "app" ? colors.primary : colors.muted} /><Text style={{ color: track === "app" ? colors.primary : colors.muted, fontSize: 11.5, fontWeight: "900", textAlign: "center" }}>{language === "ar" ? "مستخدم تطبيق" : "App user"}</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: track === "onbook" }} onPress={() => setTrack("onbook")} style={[styles.tab, { backgroundColor: track === "onbook" ? ("#0EA5E9" + "1A") : colors.surfaceMuted + "3A", borderColor: track === "onbook" ? "#0EA5E9" : colors.border }]}><MaterialIcons name="badge" size={17} color={track === "onbook" ? "#0EA5E9" : colors.muted} /><Text style={{ color: track === "onbook" ? "#0EA5E9" : colors.muted, fontSize: 11.5, fontWeight: "900", textAlign: "center" }}>{language === "ar" ? "منتسب على الكتاب" : "On-book staff"}</Text></Pressable>
    </View>

    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {track === "app" ? <View>
        <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "عبر دعوة تطبيق" : "Via app invitation"}</Text>
        <Text style={{ color: colors.muted, fontSize: 11.5, lineHeight: 18, marginTop: 2, textAlign: align }}>{language === "ar" ? "يستلم الموظف رمز دعوة من 6 أرقام ويُفعّل حسابه في التطبيق. اختر الصلاحية المسبقة للدعوة." : "The employee receives a 6-digit invite (PIN) to activate their account in the app. Pick the preset permissions for the invite."}</Text>
        <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "الصلاحية المسبقة" : "Permission preset"}</Text>
        <View style={[styles.roleRow, { flexDirection: row }]}>{INVITE_PRESETS.map((choice) => <Pressable key={choice.id} accessibilityRole="button" accessibilityState={{ selected: preset === choice.id }} onPress={() => setPreset(choice.id)} style={({ pressed }) => [styles.roleChip, { backgroundColor: preset === choice.id ? colors.primary + "1A" : colors.surfaceMuted + "3A", borderColor: preset === choice.id ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={choice.icon} size={16} color={preset === choice.id ? colors.primary : colors.muted} /><Text style={{ color: preset === choice.id ? colors.primary : colors.muted, fontSize: 11, fontWeight: "800", textAlign: "center" }}>{language === "ar" ? choice.ar : choice.en}</Text></Pressable>)}</View>
        <TextInput value={name} onChangeText={setName} placeholder={language === "ar" ? "اسم الموظف" : "Employee name"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
        <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder={language === "ar" ? "رقم الهاتف" : "Phone number"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
      </View> : <View>
        <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "بدون حساب تطبيق (على الكتاب)" : "Without an app account (on the book)"}</Text>
        <Text style={{ color: colors.muted, fontSize: 11.5, lineHeight: 18, marginTop: 2, textAlign: align }}>{language === "ar" ? "يُسجَّل على الجهاز محليًا برتبة موظف لربط العُهد والتحصيلات، ويحصل على معرّف ميداني تلقائي. يمكنه لاحقًا تفعيل تطبيق عبر /auth/claim-staff-account." : "Registered locally on this device as field staff to bind custody floats instantly, and given an automatic field ID. They can later claim an app account via /auth/claim-staff-account."}</Text>
        <View style={[styles.uidPreview, { backgroundColor: "#0EA5E9" + "0D", borderColor: "#0EA5E9" + "45", flexDirection: row }]}><MaterialIcons name="badge" size={16} color="#0EA5E9" /><Text style={[styles.flex, { color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: align }]}>{language === "ar" ? "المعرّف الميداني (غير قابل للتعديل):" : "Field ID (read-only):"}</Text><Text style={{ color: "#0EA5E9", fontSize: 13, fontWeight: "900", writingDirection: "ltr" }}>#{previewUid}</Text></View>
        <TextInput value={name} onChangeText={setName} placeholder={language === "ar" ? "اسم المنتسب / النقطة" : "Staff / point name"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
        <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder={language === "ar" ? "رقم الهاتف للتواصل" : "Contact phone number"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
      </View>}
    </ScrollView>

    <Pressable accessibilityRole="button" disabled={pending} onPress={() => void (track === "app" ? submitApp() : submitOnbook())} style={({ pressed }) => [styles.submit, { backgroundColor: colors.primary, opacity: pending ? 0.5 : pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name={track === "app" ? "forward-to-inbox" : "person-add"} size={18} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 13 }}>{pending ? (language === "ar" ? "جارٍ الحفظ..." : "Saving...") : track === "app" ? (language === "ar" ? "إنشاء دعوة التطبيق" : "Create app invitation") : (language === "ar" ? "إضافة المنتسب" : "Add on-book staff")}</Text></Pressable>
  </View></View></Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2, 12, 10, 0.72)", justifyContent: "flex-end", padding: 12 },
  card: { maxHeight: "92%", borderWidth: 1, borderRadius: 24, padding: 15 },
  header: { alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { fontSize: 17, fontWeight: "900" },
  close: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  tabs: { gap: 8, marginTop: 13 },
  tab: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 8 },
  sectionTitle: { fontSize: 13.5, fontWeight: "900", marginTop: 15 },
  label: { fontSize: 12.5, fontWeight: "800", marginTop: 13 },
  roleRow: { gap: 8, marginTop: 8 },
  roleChip: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, paddingHorizontal: 6 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, marginTop: 10 },
  uidPreview: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 10, alignItems: "center", gap: 7, marginTop: 11 },
  submit: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 },
  flex: { flex: 1, minWidth: 0 },
});