import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { useColors } from "@/hooks/use-colors";

type Group = {
  key: "operational" | "customers-financial" | "structural";
  ar: string;
  en: string;
  items: { key: string; ar: string; en: string }[];
};

const GROUPS: Group[] = [
  {
    key: "operational",
    ar: "القسم الأول: السجلات التشغيلية والخدمية",
    en: "Operational & service records",
    items: [
      { key: "bookings", ar: "الحجوزات والتقويم ومواعيد الإشغال", en: "Bookings & Calendar" },
      { key: "waitlist", ar: "طلبات وقائمة الانتظار", en: "Guest Waitlist" },
      { key: "maintenance", ar: "الصيانة الوقائية والأصول وجرد المعدات", en: "Maintenance & Asset Logs" },
      { key: "notifications", ar: "مركز الإشعارات والتنبيهات السابقة", en: "Notification History" },
    ],
  },
  {
    key: "customers-financial",
    ar: "القسم الثاني: العملاء والماليات",
    en: "Customers & financials",
    items: [
      { key: "customers", ar: "قاعدة العملاء وسجل النزلاء والقائمة السوداء", en: "Customer CRM & Guest Records" },
      { key: "loyalty", ar: "برنامج الولاء والنقاط ومكافآت الضيوف", en: "Loyalty Points & Tiers" },
      { key: "financials", ar: "السجلات المالية (سندات القبض، المصروفات، وتصفية العهد)", en: "Financial records" },
      { key: "analytics", ar: "التقارير والإحصائيات التراكمية", en: "Analytics & Reports" },
    ],
  },
  {
    key: "structural",
    ar: "القسم الثالث: الأصول والمنشأة (إجراء هيكلي)",
    en: "Assets & workspace (structural)",
    items: [
      { key: "units", ar: "حذف كافة الوحدات والعقارات التابعة لهذه المنشأة", en: "Delete Units" },
      { key: "workspace", ar: "حذف المنشأة بالكامل من الحساب", en: "Delete Workspace Entirely" },
    ],
  },
];

export function WorkspacePurgeModal({ visible, onClose, onExecuted }: { visible: boolean; onClose: () => void; onExecuted: (summary: string, deleted: boolean) => void }) {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { purgeWorkspaceRecords } = useBookings();
  const { isSuperAdmin } = useWorkspaceAccess();
  const utils = trpc.useUtils();
  const workspace = trpc.workspace.me.useQuery(undefined, { enabled: visible, retry: false });
  const hub = trpc.workspace.hub.useQuery(undefined, { enabled: visible, retry: false });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [challenge, setChallenge] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const align = isRTL ? "right" : "left";

  useEffect(() => {
    if (visible) {
      setSelected({});
      setChallenge("");
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  const workspaceInfo = workspace.data?.workspace ?? null;
  const workspaceName = workspaceInfo?.name ?? (language === "ar" ? "منشأتك الحالية" : "your current property");
  const workspaceId = workspaceInfo?.id;
  const ownedCount = (hub.data?.memberships ?? []).filter((entry) => entry.role === "owner").length;
  const isOnlyOwnedWorkspace = ownedCount <= 1;
  const selectedKeys = GROUPS.flatMap((group) => group.items).filter((item) => selected[item.key]).map((item) => item.key);
  const isWorkspaceSelected = Boolean(selected.workspace);
  const isResetBlocked = isWorkspaceSelected && isOnlyOwnedWorkspace && ownedCount >= 1;
  const challengeOk = isWorkspaceSelected ? challenge === "حذف" : challenge === "تصفير";
  const canExecute = selectedKeys.length > 0 && challengeOk && !busy && !isResetBlocked;

  const selectAllRecords = () => {
    const next: Record<string, boolean> = {};
    GROUPS.forEach((group) => group.items.forEach((item) => { if (group.key !== "structural") next[item.key] = true; }));
    setSelected(next);
  };

  const executePurge = async () => {
    setError(null);
    if (isResetBlocked) {
      setError(language === "ar" ? "لا يمكن حذف المنشأة الوحيدة المملوكة لحسابك. أنشئ منشأة أخرى أولًا أو احذف سجلاتها فقط." : "You cannot delete your only owned workspace. Create another one first, or purge its records instead.");
      return;
    }
    setBusy(true);
    try {
      const result = await purgeWorkspaceRecords(selectedKeys, challenge.trim());
      if (result.deleted) {
        void utils.workspace.invalidate();
        onExecuted(language === "ar" ? `تم حذف المنشأة «${result.deletedWorkspaceName ?? workspaceName}» وكل بياناتها نهائيًا.` : `Workspace "${result.deletedWorkspaceName ?? workspaceName}" and all its data were permanently deleted.`, true);
        return;
      }
      void utils.workspace.invalidate();
      const removed = result.removed;
      const detail = Object.entries(removed).filter(([, count]) => count > 0).map(([key, count]) => `${key}: ${count}`).join(" · ");
      onExecuted(language === "ar" ? `تم تصفير بيانات المنشأة بنجاح${detail ? ` · ${detail}` : ""}.` : `Workspace records purged successfully${detail ? ` · ${detail}` : ""}.`, false);
    } catch (purgeError) {
      setError(purgeError instanceof Error ? purgeError.message : language === "ar" ? "تعذر تصفير البيانات. حاول مرة أخرى." : "Could not purge the data. Try again.");
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => !busy && onClose()}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { borderColor: isWorkspaceSelected ? "#F87171" : "#1E293B" }]}>
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: isWorkspaceSelected ? "#F87171" + "18" : "#0F8B83" + "18" }]}><MaterialIcons name="cleaning-services" size={22} color={isWorkspaceSelected ? "#F87171" : "#0F8B83"} /></View>
            <View style={styles.flex}>
              <Text style={{ color: "#F1F5F9", fontSize: 17, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تصفير وإدارة بيانات منشأة" : "Workspace purge manager"}</Text>
              <Text style={{ color: "#38BDF8", fontSize: 12, fontWeight: "800", marginTop: 3, textAlign: align }}>{language === "ar" ? `المنشأة: ${workspaceName} (معرف: #${workspaceId ?? "—"})` : `Property: ${workspaceName} (ID: #${workspaceId ?? "—"})`}</Text>
            </View>
            <Pressable accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={onClose} disabled={busy} style={({ pressed }) => [styles.close, { backgroundColor: "#1E293B", opacity: pressed || busy ? 0.7 : 1 }]}><MaterialIcons name="close" size={19} color="#CBD5E1" /></Pressable>
          </View>
          <View style={[styles.warning, { borderColor: "#FACC15" + "55" }]}><MaterialIcons name="warning" size={17} color="#FACC15" /><Text style={{ color: "#FACC15", fontSize: 11, lineHeight: 17, fontWeight: "700", flex: 1, textAlign: align }}>{language === "ar" ? "حدد بدقة البيانات التي ترغب في مسحها لهذه المنشأة وحدها." : "Carefully choose exactly which data to erase for this property alone."}</Text></View>

          {workspaceId === null ? (
            <Text style={{ color: "#94A3B8", fontSize: 12, textAlign: "center", marginVertical: 18 }}>{language === "ar" ? "لا توجد منشأة نشطة مرتبطة بهذا الحساب لتصفيرها." : "No active property is attached to this account to purge."}</Text>
          ) : (
            <>
              <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 14 }}>
                {GROUPS.map((group) => (
                  <View key={group.key}>
                    <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "800", marginBottom: 7, textAlign: align }}>{group.key === "structural" ? `${group.ar} ⚠️` : group.ar}</Text>
                    {group.items.map((item) => {
                      const checked = Boolean(selected[item.key]);
                      const tone = item.key === "workspace" ? "#F87171" : item.key === "units" ? "#FB923C" : "#0F8B83";
                      const itemBlocked = item.key === "workspace" && isOnlyOwnedWorkspace && ownedCount >= 1;
                      return (
                        <Pressable key={item.key} disabled={busy} onPress={() => setSelected((prev) => ({ ...prev, [item.key]: !prev[item.key] }))} style={({ pressed }) => [styles.checkRow, { borderColor: checked ? tone + "88" : "#1E293B", flexDirection: isRTL ? "row-reverse" : "row", opacity: itemBlocked ? 0.55 : pressed ? 0.7 : 1 }]}>
                          <MaterialIcons name={checked ? "check-box" : "check-box-outline-blank"} size={22} color={checked ? tone : "#475569"} />
                          <View style={styles.flex}>
                            <Text style={{ color: checked ? tone : "#E2E8F0", fontSize: 13, fontWeight: "800", textAlign: align }}>{item.ar}</Text>
                            <Text style={{ color: "#64748B", fontSize: 10, marginTop: 2, textAlign: align }}>{item.en}</Text>
                          </View>
                          {itemBlocked ? <MaterialIcons name="lock" size={16} color="#64748B" /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>

              <Pressable onPress={selectAllRecords} disabled={busy} style={({ pressed }) => [styles.selectAll, { borderColor: "#0F8B83" + "77", flexDirection: isRTL ? "row-reverse" : "row", opacity: pressed || busy ? 0.7 : 1 }]}><MaterialIcons name="done-all" size={18} color="#0F8B83" /><Text style={{ color: "#0F8B83", fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "تحديد كافة السجلات والبيانات" : "Select all records & data"}</Text></Pressable>

              <View style={{ marginTop: 14 }}>
                <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 6, textAlign: align }}>{language === "ar" ? `اكتب كلمة "تصفير" لتأكيد مسح السجلات، أو كلمة "حذف" إذا اخترت حذف المنشأة:` : `Type "تصفير" to confirm erasing records, or "حذف" if you chose to delete the workspace:`}</Text>
                <TextInput value={challenge} onChangeText={setChallenge} editable={!busy} autoCapitalize="none" autoCorrect={false} placeholder="اكتب هنا للتأكيد..." placeholderTextColor="#475569" style={[styles.challengeInput, { color: "#F1F5F9", backgroundColor: "#1E293B", borderColor: challengeOk ? "#0F8B83" : error ? "#F87171" : "#334155", textAlign: align }]} />
                {isWorkspaceSelected && isOnlyOwnedWorkspace && ownedCount >= 1 ? <Text style={{ color: "#F87171", fontSize: 10, fontWeight: "700", marginTop: 6, textAlign: align }}>{language === "ar" ? "لا يمكن حذف هذه المنشأة لأنها الوحيدة المملوكة لحسابك. احذف سجلاتها فقط أو أنشئ منشأة أخرى أولًا." : "You cannot delete this workspace because it is your only owned one. Purge its records only, or create another workspace first."}</Text> : null}
              </View>

              {error ? <View accessibilityLiveRegion="polite" style={[styles.errorBox, { borderColor: "#F87171" + "66" }]}><MaterialIcons name="error-outline" size={16} color="#F87171" /><Text style={{ color: "#F87171", fontWeight: "800", fontSize: 11, flex: 1, textAlign: align }}>{error}</Text></View> : null}

              <View style={[styles.actions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <Pressable disabled={busy} onPress={onClose} style={({ pressed }) => [styles.secondary, { borderColor: "#334155", opacity: pressed || busy ? 0.6 : 1 }]}><Text style={{ color: "#F1F5F9", fontWeight: "900" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable>
                <Pressable disabled={!canExecute} onPress={() => void executePurge()} style={({ pressed }) => [styles.primary, { backgroundColor: isWorkspaceSelected ? "#DC2626" : "#B91C1C", opacity: !canExecute ? 0.42 : pressed ? 0.75 : 1 }]}><Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center", fontSize: 13 }}>{busy ? <ActivityIndicator color="#FFF" size="small" /> : (language === "ar" ? "تنفيذ التصفير" : "Execute purge")}</Text></Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center", padding: 16, zIndex: 70 },
  sheet: { width: "100%", maxWidth: 448, maxHeight: "92%", backgroundColor: "#121417", borderWidth: 1, borderRadius: 22, padding: 18, shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 18 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  headerIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  close: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  warning: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 12 },
  checkRow: { minHeight: 52, borderWidth: 1, borderRadius: 13, padding: 10, gap: 9, alignItems: "center", marginTop: 6 },
  selectAll: { minHeight: 46, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", gap: 7, marginTop: 14 },
  challengeInput: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 13 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 12 },
  actions: { gap: 10, marginTop: 16 },
  secondary: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  primary: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 9 },
});