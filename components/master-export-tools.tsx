import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { startOAuthLogin } from "@/constants/oauth";
import { useColors } from "@/hooks/use-colors";
import { exportMasterWorkspaceExcel } from "@/lib/master-workspace-excel";
import { trpc } from "@/lib/trpc";

type Props = { workspaceId: number; disabled?: boolean; onCompleted: (message: string) => Promise<void> };

export function MasterExportTools({ workspaceId, disabled = false, onCompleted }: Props) {
  const colors = useColors();
  const [userId, setUserId] = useState("");
  const [channel, setChannel] = useState<"phone" | "email" | "pin">("email");
  const exportWorkspace = trpc.masterControl.exportWorkspace.useMutation();
  const identityReset = trpc.masterControl.requestIdentityReset.useMutation();
  const exportExcel = async () => {
    try {
      const data = await exportWorkspace.mutateAsync({ workspaceId, confirmation: "EXPORT-WORKSPACE" });
      const result = await exportMasterWorkspaceExcel(data);
      await onCompleted(result.shared ? "تم إنشاء ملف Excel وفتح المشاركة. شاركه عبر قناة موثوقة فقط." : `تم تنزيل ملف Excel: ${result.filename}`);
    } catch (error) {
      Alert.alert("تعذر تصدير Excel", error instanceof Error && error.message === "workspace-excel-sharing-unavailable" ? "المشاركة غير متاحة على هذا الجهاز. جرّب التصدير من المتصفح أو من جهاز يدعم المشاركة." : "تعذر إنشاء الملف. تحقق من اتصالك وصلاحية الإدارة ثم أعد المحاولة.");
    }
  };
  const resetIdentity = async () => {
    const parsed = Number(userId);
    if (!Number.isInteger(parsed) || parsed <= 0) return Alert.alert("معرف المستخدم مطلوب", "أدخل معرف المستخدم الرقمي قبل تسجيل طلب إعادة ضبط الهوية.");
    try {
      await identityReset.mutateAsync({ confirmation: "ADMIN-OVERRIDE", userId: parsed, channel });
      await startOAuthLogin();
      await onCompleted("سُجل طلب إعادة الضبط وفتحت بوابة الهوية الآمنة لإكماله. لا تُحفظ كلمات المرور أو PIN داخل StayIn.");
    } catch {
      Alert.alert("تعذر فتح بوابة الهوية", "سُجل الطلب في سجل التدقيق عند نجاحه، لكن بوابة OAuth غير متاحة حاليًا. تحقق من إعداد الهوية ثم أعد المحاولة.");
    }
  };
  const busy = disabled || exportWorkspace.isPending || identityReset.isPending;
  return <View style={[styles.wrap, { borderColor: colors.success + "88", backgroundColor: colors.success + "08" }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>التصدير والهوية الآمنة</Text><Text style={[styles.hint, { color: colors.muted }]}>يتضمن Excel بيانات المنشأة المختارة فقط. تُسجل طلبات إعادة الضبط ثم تُسلّم إلى OAuth؛ لا تُنشأ بيانات اعتماد محلية.</Text>
    <Pressable disabled={busy} onPress={() => Alert.alert("تصدير Excel", "سيُنشأ ملف Excel من بيانات المنشأة المختارة. تأكد من وجهة المشاركة قبل المتابعة.", [{ text: "إلغاء", style: "cancel" }, { text: "تصدير", onPress: () => void exportExcel() }])} style={[styles.button, { backgroundColor: colors.success, opacity: busy ? 0.5 : 1 }]}><MaterialIcons name="table-view" color={colors.background} size={19} /><Text style={{ color: colors.background, fontWeight: "900" }}>تصدير ملف Excel</Text></Pressable>
    <View style={[styles.divider, { backgroundColor: colors.border }]} />
    <Text style={[styles.label, { color: colors.foreground }]}>طلب إعادة ضبط الهوية</Text><TextInput value={userId} onChangeText={setUserId} keyboardType="number-pad" textAlign="right" placeholder="معرف المستخدم الرقمي" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} />
    <View style={styles.channels}>{(["phone", "email", "pin"] as const).map((item) => <Pressable key={item} onPress={() => setChannel(item)} style={[styles.channel, { backgroundColor: channel === item ? colors.primary : colors.surface, borderColor: channel === item ? colors.primary : colors.border }]}><Text style={{ color: channel === item ? colors.background : colors.foreground, fontWeight: "900", fontSize: 11 }}>{item === "email" ? "البريد" : item === "phone" ? "الهاتف" : "رمز الدخول"}</Text></Pressable>)}</View>
    <Pressable disabled={busy} onPress={() => Alert.alert("إعادة ضبط الهوية", "سيُسجل الطلب أولًا ثم تُفتح بوابة OAuth. لا يمكن لـ StayIn عرض أو تعديل كلمة مرور أو PIN محليًا.", [{ text: "إلغاء", style: "cancel" }, { text: "متابعة", onPress: () => void resetIdentity() }])} style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }]}><MaterialIcons name="open-in-new" color={colors.background} size={19} /><Text style={{ color: colors.background, fontWeight: "900" }}>تسجيل الطلب وفتح بوابة الهوية</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({ wrap: { marginTop: 12, borderWidth: 1, borderRadius: 17, padding: 12, gap: 9 }, title: { fontSize: 14, fontWeight: "900", textAlign: "right" }, label: { fontSize: 12, fontWeight: "900", textAlign: "right" }, hint: { fontSize: 10, lineHeight: 16, textAlign: "right" }, input: { minHeight: 43, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, fontSize: 12 }, channels: { flexDirection: "row-reverse", gap: 7 }, channel: { flex: 1, minHeight: 37, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" }, button: { minHeight: 45, borderRadius: 13, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 }, divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 } });
