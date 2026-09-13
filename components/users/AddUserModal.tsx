import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { useColors } from "@/hooks/use-colors";
import { GRANULAR_PERMISSIONS, OPERATIONAL_PERMISSION_COUNT, capabilitiesForRole, capabilitiesToPermissions, type GranularCapability } from "@/lib/permissions";
import { normalizeUid, phoneKey } from "@/lib/staff-directory";
import type { WorkspacePermissions } from "@/shared/workspace-permissions";

/** دور العضو في المنشأة: موظف حجوزات / مدير تشغيلي / حارس (يُترجم إلى صلاحيات عبر رقم هاتفه). */
export type AddUserRole = "staff" | "mini-admin" | "guard";

type AddUserModalProps = {
  visible: boolean;
  language: "ar" | "en";
  isRTL: boolean;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  /** يعالج الحفظ والدعوة تلقائيًا (ربط العضو بمنشأته عبر رقم الهاتف) ويعيد رسالة خطأ مترجمة أو null عند النجاح. */
  onSubmit: (entry: { name: string; phone: string; role: AddUserRole; permissions: WorkspacePermissions }) => Promise<string | null>;
  /** يبحث عن حساب تطبيق مسجّل مسبقًا بالمعرّف الشخصي (userCode) ويعيد اسمه وهاتفه للتحقق المزدوج، أو null إذا لم يُعثر عليه. */
  lookupUserCode?: (code: string) => { name: string; phone: string } | null;
};

const ORANGE = "#F97316";
const FIELD_BORDER = "#334155";
const FIELD_BG = "rgba(15, 23, 42, 0.62)";

const ROLES: { id: AddUserRole; emoji: string; ar: string; en: string }[] = [
  { id: "guard", emoji: "🛡️", ar: "حارس / شفت", en: "Guard / shift" },
  { id: "staff", emoji: "💼", ar: "موظف حجوزات", en: "Booking staff" },
  { id: "mini-admin", emoji: "⚙️", ar: "مدير تشغيلي", en: "Operational manager" },
];

export default function AddUserModal({ visible, language, isRTL, colors, onClose, onSubmit, lookupUserCode }: AddUserModalProps) {
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [userCode, setUserCode] = useState("");
  const [role, setRole] = useState<AddUserRole>("staff");
  const [caps, setCaps] = useState<readonly GranularCapability[]>(() => capabilitiesForRole("staff"));
  const [permsOpen, setPermsOpen] = useState(false);
  const [focused, setFocused] = useState<"name" | "phone" | "userCode" | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName("");
    setPhone("");
    setUserCode("");
    setRole("staff");
    setCaps(capabilitiesForRole("staff"));
    setPermsOpen(false);
    setFocused(null);
    setPending(false);
  }, [visible]);

  const selectRole = (next: AddUserRole) => {
    setRole(next);
    setCaps(capabilitiesForRole(next));
  };

  const toggleCap = (key: GranularCapability) => setCaps((current) => (current.includes(key) ? current.filter((cap) => cap !== key) : [...current, key]));

  const activeCount = GRANULAR_PERMISSIONS.filter((perm) => caps.includes(perm.key)).length;

  const verification = userCode.trim()
    ? (() => {
        const resolved = lookupUserCode ? lookupUserCode(normalizeUid(userCode)) : null;
        if (!resolved || !resolved.phone.trim()) return { state: "unknown" as const };
        const matches = phone.trim().length >= 6 && phoneKey(resolved.phone) === phoneKey(phone);
        return matches ? { state: "matched" as const, name: resolved.name } : { state: "mismatch" as const, name: resolved.name, phone: resolved.phone };
      })()
    : null;

  const submit = async () => {
    if (name.trim().length < 2 || phone.trim().length < 6) {
      Alert.alert(language === "ar" ? "بيانات ناقصة" : "Missing details", language === "ar" ? "أدخل اسم العضو ورقم هاتفه بشكل صحيح." : "Enter the member's name and phone number.");
      return;
    }
    if (verification && verification.state !== "matched") {
      Alert.alert(language === "ar" ? "التحقق من الهوية فشل" : "Identity check failed", verification.state === "unknown" ? (language === "ar" ? "لا يوجد حساب مسجل بهذا المعرّف — اتركه فارغًا إذا كان العضو جديدًا ولم يسجل بعد." : "No registered account matches this user ID — leave it empty if the member hasn't registered yet.") : (language === "ar" ? `رقم الهاتف لا يتطابق مع هذا المعرّف — «${verification.name}» مسجل برقم آخر. راجع الرقم أو المعرّف.` : `The phone number doesn't match this user ID — "${verification.name}" is registered with another number. Review the phone or the ID.`));
      return;
    }
    setPending(true);
    try {
      const error = await onSubmit({ name, phone, role, permissions: capabilitiesToPermissions(caps) });
      if (error) {
        Alert.alert(language === "ar" ? "تعذر الحفظ والدعوة" : "Could not save & invite", error);
        return;
      }
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.header, { flexDirection: row }]}>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "إضافة عضو للفريق" : "Add team member"}</Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "أدخل اسم العضو ورقم هاتفه ورتبته — وسيُربط تلقائيًا بالمنشأة وعهدها عبر رقم الهاتف." : "Enter the member's name, phone, and role — they will be linked to your property automatically by phone."}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "اسم الموظف / العضو" : "Member name"}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              autoCorrect={false}
              onFocus={() => setFocused("name")}
              onBlur={() => setFocused(null)}
              placeholder={language === "ar" ? "مثال: أحمد، سارة" : "e.g. Ahmed, Sara"}
              placeholderTextColor={colors.muted}
              style={[styles.input, { backgroundColor: FIELD_BG, borderColor: focused === "name" ? ORANGE : FIELD_BORDER, borderWidth: focused === "name" ? 2 : 1, color: colors.foreground, textAlign: align }]}
            />

            <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "رقم الهاتف للتواصل" : "Contact phone number"}</Text>
            <Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 3, textAlign: align }}>{language === "ar" ? "رقم الهاتف هو المفتاح الأساسي لربط العهود والتحصيلات بالعضو." : "The phone is the primary key that links floats and collections to the member."}</Text>
            <View style={[styles.phoneRow, { backgroundColor: FIELD_BG, borderColor: focused === "phone" ? ORANGE : FIELD_BORDER, borderWidth: focused === "phone" ? 2 : 1 }]}>
              <View style={styles.prefixPill}><Text style={styles.prefixText}>+962</Text></View>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                onFocus={() => setFocused("phone")}
                onBlur={() => setFocused(null)}
                keyboardType="phone-pad"
                maxLength={20}
                placeholder="07XXXXXXXX"
                placeholderTextColor={colors.muted}
                style={[styles.phoneInput, { color: colors.foreground }]}
              />
            </View>

            <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "المعرّف الشخصي للمستخدم (اختياري للتأكيد)" : "User ID (optional, for confirmation)"}</Text>
            <Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 3, textAlign: align }}>{language === "ar" ? "للتحقق المزدوج إذا كان الموظف مسجلاً مسبقاً بالتطبيق لتجنب الخطأ برقم الهاتف." : "Double-checks if the employee is already registered on the app, to avoid a phone-number mistake."}</Text>
            <TextInput
              value={userCode}
              onChangeText={(text) => setUserCode(text.toUpperCase().slice(0, 24))}
              onFocus={() => setFocused("userCode")}
              onBlur={() => setFocused(null)}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={language === "ar" ? "مثال: U1024#" : "e.g. U1024#"}
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.inputMono, { backgroundColor: FIELD_BG, borderColor: focused === "userCode" ? ORANGE : FIELD_BORDER, borderWidth: focused === "userCode" ? 2 : 1, color: colors.foreground, writingDirection: "ltr", textAlign: "left" }]}
            />
            {verification && verification.state === "matched" ? (
              <View style={[styles.verifyBadge, { backgroundColor: colors.success + "14", borderColor: colors.success + "55", flexDirection: row }]}>
                <MaterialIcons name="verified" size={15} color={colors.success} />
                <Text style={{ color: colors.success, fontSize: 11.5, fontWeight: "900", flex: 1 }}>{language === "ar" ? "✓ تم التحقق: الحساب مطابق" : "✓ Verified: account matched"}</Text>
              </View>
            ) : null}
            {verification && verification.state !== "matched" ? (
              <View style={[styles.verifyBadge, { backgroundColor: colors.error + "12", borderColor: colors.error + "55", flexDirection: row }]}>
                <MaterialIcons name={verification.state === "unknown" ? "help-outline" : "error-outline"} size={15} color={colors.error} />
                <Text style={{ color: colors.error, fontSize: 11.5, fontWeight: "800", flex: 1 }}>{verification.state === "unknown" ? (language === "ar" ? "لا يوجد حساب مسجل بهذا المعرّف" : "No registered account with this user ID") : (language === "ar" ? "رقم الهاتف لا يتطابق مع هذا المعرّف" : "The phone number does not match this user ID")}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "الدور / الصلاحية" : "Role / permission"}</Text>
            <View style={[styles.roleRow, { flexDirection: row }]}>{ROLES.map((choice) => <Pressable key={choice.id} accessibilityRole="button" accessibilityState={{ selected: role === choice.id }} onPress={() => selectRole(choice.id)} style={({ pressed }) => [styles.roleChip, { backgroundColor: role === choice.id ? colors.primary + "1A" : colors.surfaceMuted + "3A", borderColor: role === choice.id ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: role === choice.id ? colors.primary : colors.muted, fontSize: 11, fontWeight: "800", textAlign: "center" }}>{`${choice.emoji} ${language === "ar" ? choice.ar : choice.en}`}</Text></Pressable>)}</View>

            <Pressable accessibilityRole="button" accessibilityState={{ expanded: permsOpen }} onPress={() => setPermsOpen((value) => !value)} style={({ pressed }) => [styles.permsHead, { backgroundColor: FIELD_BG, borderColor: FIELD_BORDER, flexDirection: row, opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="tune" size={16} color={colors.primary} />
              <Text style={[styles.flex, { color: colors.foreground, fontSize: 12.5, fontWeight: "900", textAlign: align }]}>{language === "ar" ? `تخصيص الصلاحيات (${activeCount} من ${OPERATIONAL_PERMISSION_COUNT} مفعلة)` : `Custom permissions (${activeCount} of ${OPERATIONAL_PERMISSION_COUNT} enabled)`}</Text>
              <MaterialIcons name={permsOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={20} color={colors.muted} />
            </Pressable>
            {permsOpen ? (
              <View style={[styles.permsPanel, { borderColor: FIELD_BORDER, backgroundColor: "rgba(15, 23, 42, 0.5)" }]}>
                {GRANULAR_PERMISSIONS.map((perm) => {
                  const active = caps.includes(perm.key);
                  return (
                    <View key={perm.key} style={[styles.permRow, { flexDirection: row }]}>
                      <MaterialIcons name={perm.icon} size={18} color={active ? colors.primary : colors.muted} />
                      <View style={styles.flex}>
                        <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }}>{language === "ar" ? perm.ar : perm.en}</Text>
                        {perm.managerOnly ? <Text style={{ color: colors.muted, fontSize: 9.5, marginTop: 1, textAlign: align }}>{language === "ar" ? "للمدير / المالك فقط" : "Manager / Owner only"}</Text> : null}
                      </View>
                      <AppToggle value={active} onValueChange={() => toggleCap(perm.key)} isRTL={isRTL} activeColor={colors.success} inactiveColor={FIELD_BORDER} accessibilityLabel={language === "ar" ? perm.ar : perm.en} />
                    </View>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>

          <Pressable accessibilityRole="button" disabled={pending} onPress={() => void submit()} style={({ pressed }) => [styles.submit, { backgroundColor: colors.primary, opacity: pending ? 0.5 : pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="send" size={18} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900", fontSize: 13 }}>{pending ? (language === "ar" ? "جارٍ الحفظ والدعوة..." : "Saving & inviting...") : (language === "ar" ? "حفظ وإرسال الدعوة" : "Save & send invitation")}</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2, 12, 10, 0.72)", justifyContent: "flex-end", padding: 12 },
  card: { maxHeight: "92%", borderWidth: 1, borderRadius: 24, padding: 15 },
  header: { alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { fontSize: 17, fontWeight: "900" },
  close: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 12.5, fontWeight: "800", marginTop: 13 },
  input: { minHeight: 48, borderRadius: 13, paddingHorizontal: 12, marginTop: 10 },
  inputMono: { fontFamily: "monospace" },
  phoneRow: { minHeight: 48, borderRadius: 13, marginTop: 10, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  prefixPill: { backgroundColor: "#1E293B", paddingHorizontal: 13, alignSelf: "stretch", justifyContent: "center", borderRightWidth: 1, borderRightColor: "rgba(255, 255, 255, 0.10)" },
  prefixText: { color: "#94A3B8", fontWeight: "900", fontSize: 14, writingDirection: "ltr" },
  phoneInput: { flex: 1, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, fontFamily: "monospace", color: "#FFFFFF", writingDirection: "ltr", textAlign: "left" },
  verifyBadge: { minHeight: 34, borderRadius: 11, borderWidth: 1, alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 8, marginTop: 9 },
  roleRow: { gap: 8, marginTop: 8 },
  roleChip: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, paddingHorizontal: 6 },
  permsHead: { minHeight: 46, borderRadius: 12, borderWidth: 1, alignItems: "center", gap: 9, paddingHorizontal: 12, marginTop: 12 },
  permsPanel: { borderRadius: 13, borderWidth: 1, padding: 8, marginTop: 8 },
  permRow: { minHeight: 46, alignItems: "center", gap: 9, paddingHorizontal: 6, paddingVertical: 5 },
  submit: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 },
  flex: { flex: 1, minWidth: 0 },
});