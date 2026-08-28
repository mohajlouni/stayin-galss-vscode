import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { permissionsForWorkspaceRole } from "@/shared/workspace-permissions";

type Props = { workspaceId: number; disabled?: boolean; onAssigned: (message: string) => Promise<void> };

export function MasterUserSearch({ workspaceId, disabled = false, onAssigned }: Props) {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: number; name: string | null; phone: string | null; email: string | null } | null>(null);
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const search = trpc.masterControl.searchUsers.useQuery({ query }, { enabled: query.trim().length >= 2, retry: false });
  const assign = trpc.masterControl.assignMembership.useMutation();
  const submit = async () => {
    if (!selected) return Alert.alert("اختر مستخدمًا", "ابحث بالاسم أو الهاتف أو البريد ثم اختر حسابًا واحدًا.");
    if (!selected.phone) return Alert.alert("رقم الهاتف مطلوب", "لا يمكن إسناد عضوية تشغيلية إلى حساب لا يملك رقم هاتف موثقًا.");
    try {
      await assign.mutateAsync({ confirmation: "ADMIN-OVERRIDE", workspaceId, userId: selected.id, displayName: selected.name?.trim() || "مستخدم StayIn", phone: selected.phone, role, permissions: permissionsForWorkspaceRole(role), status: "active" });
      setQuery(""); setSelected(null); await onAssigned("تم إسناد المستخدم للمنشأة وتسجيل الإجراء في سجل الإدارة العليا.");
    } catch { Alert.alert("تعذر إسناد العضوية", "تحقق من المستخدم والمنشأة، أو راجع سجل التدقيق لمعرفة سبب الرفض."); }
  };
  return <View style={[styles.wrap, { borderColor: colors.primary + "88", backgroundColor: colors.primary + "08" }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>بحث وإسناد مستخدم</Text><Text style={[styles.hint, { color: colors.muted }]}>ابحث بالاسم أو الهاتف أو البريد. لا يمكن منح دور المالك من هذه الأداة.</Text>
    <TextInput value={query} onChangeText={(value) => { setQuery(value); setSelected(null); }} placeholder="ابحث باسم أو هاتف أو بريد" placeholderTextColor={colors.muted} textAlign="right" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
    {query.trim().length >= 2 && <View style={styles.results}>{search.isLoading ? <Text style={{ color: colors.muted, textAlign: "right" }}>جارٍ البحث…</Text> : search.data?.map((user) => <Pressable key={user.id} onPress={() => setSelected(user)} style={[styles.result, { borderColor: selected?.id === user.id ? colors.primary : colors.border, backgroundColor: selected?.id === user.id ? colors.primary + "17" : colors.surface }]}><View style={styles.grow}><Text style={[styles.name, { color: colors.foreground }]}>{user.name || "مستخدم بلا اسم"}</Text><Text style={[styles.meta, { color: colors.muted }]}>{user.phone || user.email || "لا توجد وسيلة تواصل"}</Text></View><MaterialIcons name={selected?.id === user.id ? "check-circle" : "person-outline"} size={20} color={selected?.id === user.id ? colors.primary : colors.muted} /></Pressable>)}</View>}
    {selected && <Text style={[styles.selected, { color: colors.success }]}>تم اختيار: {selected.name || selected.email || `المستخدم #${selected.id}`}</Text>}
    <View style={styles.roles}>{(["staff", "admin"] as const).map((item) => <Pressable key={item} onPress={() => setRole(item)} style={[styles.role, { borderColor: role === item ? colors.primary : colors.border, backgroundColor: role === item ? colors.primary : colors.surface }]}><Text style={{ color: role === item ? colors.background : colors.foreground, fontWeight: "900" }}>{item === "admin" ? "مدير منشأة" : "موظف"}</Text></Pressable>)}</View>
    <Pressable disabled={disabled || assign.isPending} onPress={() => Alert.alert("إسناد عضوية", `سيمنح الحساب دور «${role === "admin" ? "مدير منشأة" : "موظف"}» في المنشأة المختارة فقط.`, [{ text: "إلغاء", style: "cancel" }, { text: "تأكيد", onPress: () => void submit() }])} style={[styles.button, { backgroundColor: colors.primary, opacity: disabled || assign.isPending ? 0.5 : 1 }]}><MaterialIcons name="person-add-alt-1" color={colors.background} size={19} /><Text style={{ color: colors.background, fontWeight: "900" }}>إسناد للمنشأة</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({ wrap: { marginTop: 12, borderWidth: 1, borderRadius: 17, padding: 12, gap: 9 }, title: { fontSize: 14, fontWeight: "900", textAlign: "right" }, hint: { fontSize: 10, lineHeight: 16, textAlign: "right" }, input: { minHeight: 43, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, fontSize: 12 }, results: { gap: 6 }, result: { minHeight: 48, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, flexDirection: "row-reverse", alignItems: "center", gap: 8 }, grow: { flex: 1 }, name: { textAlign: "right", fontSize: 12, fontWeight: "900" }, meta: { textAlign: "right", fontSize: 10, marginTop: 2 }, selected: { textAlign: "right", fontWeight: "800", fontSize: 11 }, roles: { flexDirection: "row-reverse", gap: 8 }, role: { flex: 1, minHeight: 39, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" }, button: { minHeight: 45, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 7 } });
