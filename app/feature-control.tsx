import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState, type ComponentProps } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { useWorkspaceFeaturePreferences } from "@/lib/feature-flags";
import { trpc } from "@/lib/trpc";
import { WORKSPACE_FEATURE_PREFERENCE_KEYS, type WorkspaceFeaturePreferenceKey } from "@/shared/feature-flags";

type FeatureIcon = ComponentProps<typeof MaterialIcons>["name"];

const PREFERENCE_META: Record<WorkspaceFeaturePreferenceKey, { label: string; hint: string; icon: FeatureIcon; color: string }> = {
  maintenance_assets: { label: "الصيانة والوقاية وإدارة الأصول", hint: "تفعيل قوائم الصيانة الدورية والأصول المعتمدة في ملف المنشأة.", icon: "build", color: "#F59E0B" },
  notifications_center: { label: "مركز الإشعارات والتنبيهات المخصصة", hint: "تفعيل مركز الإشعارات للطوارئ والدفعات والصيانة وحالة الطقس.", icon: "notifications-active", color: "#60A5FA" },
  loyalty_points: { label: "برامج الولاء والنقاط والكاش باك", hint: "تفعيل نقاط الولاء للعملاء الدائمين وتحويلات الكاش باك.", icon: "workspace-premium", color: "#F472B6" },
};

export default function FeatureControlScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const { isOwner, activeWorkspaceId } = useWorkspaceAccess();
  const prefs = useWorkspaceFeaturePreferences(activeWorkspaceId);
  const utils = trpc.useUtils();
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!savedMessage) return;
    const timer = setTimeout(() => setSavedMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [savedMessage]);

  useEffect(() => {
    void utils.featureControl.workspace.get.invalidate({ workspaceId: activeWorkspaceId ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prefToggle = trpc.featureControl.workspace.update.useMutation({
    onMutate: async ({ workspaceId, flag, enabled }) => {
      await utils.featureControl.workspace.get.cancel({ workspaceId });
      const previous = utils.featureControl.workspace.get.getData({ workspaceId });
      utils.featureControl.workspace.get.setData({ workspaceId }, { ...(utils.featureControl.workspace.get.getData({ workspaceId }) ?? {}), [flag]: enabled });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined && activeWorkspaceId) utils.featureControl.workspace.get.setData({ workspaceId: activeWorkspaceId }, context.previous);
    },
    onSettled: () => {
      if (activeWorkspaceId) void utils.featureControl.workspace.get.invalidate({ workspaceId: activeWorkspaceId });
    },
  });

  const togglePreference = (flag: WorkspaceFeaturePreferenceKey, next: boolean) => {
    if (!activeWorkspaceId || !isOwner) return;
    prefToggle.mutate({ workspaceId: activeWorkspaceId, flag, enabled: next });
    setSavedMessage(isRTL ? "تم حفظ تفضيلاتك الخاصة بهذه المنشأة." : "Preferences saved for this property.");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubScreenHeader title={isRTL ? "مركز التحكم" : "Feature Control"} fallbackHref="/(tabs)/more" />
      <ScrollView contentContainerStyle={styles.content}>
        <GlowGlassCard glowColor="#FF6B47" style={{ marginBottom: 18 }}>
          <View style={styles.masterCardRow}>
            <View style={[styles.masterIcon, { backgroundColor: "#FF6B4722" }]}>
              <MaterialIcons name="tune" size={30} color="#FF6B47" />
            </View>
            <View style={styles.masterCopy}>
              <Text style={[styles.masterVersion, { color: "#FF6B47" }]}>{isRTL ? "سيد التشغيل الاحترافي" : "Professional Control Suite"}</Text>
              <Text style={[styles.masterTitle, { color: colors.foreground }]}>مركز التحكم في الميزات والوحدات التشغيلية</Text>
              <Text style={[styles.masterDesc, { color: colors.muted }]}>إدارة تفعيل وتعطيل الشاشات والأدوات في النظام بضغطة زر واحدة.</Text>
            </View>
          </View>
          {savedMessage ? <Text style={[styles.savedToast, { color: colors.success }]}>{savedMessage}</Text> : null}
        </GlowGlassCard>

        <SectionHeader
          icon="toggle-on"
          iconColor="#60A5FA"
          title={isRTL ? "ميزات تحكم المالك / المستخدم" : "User Preferences"}
          subtitle={isOwner ? (isRTL ? "تفضيلاتك تحفظ في قاعدة بيانات المنشأة وتنطبق على جميع أعضاء الفريق." : "Saved to the workspace database and applied to all team members.") : (isRTL ? "للمالك الصلاحية الكاملة للتعديل، وبقية المستخدمين يرون الحالة النهائية فقط." : "Owners have full edit rights; other members see the final state.")}
        />
        <GlowGlassCard glowTone="subtle" style={{ marginBottom: 18 }}>
          <View style={styles.sectionBody}>
            {WORKSPACE_FEATURE_PREFERENCE_KEYS.map((flag) => {
              const meta = PREFERENCE_META[flag];
              const effective = prefs.effectivePreferences[flag];
              const killed = !effective && prefs.preferences[flag] === true;
              const canEdit = isOwner && !killed;
              return (
                <View key={flag} style={[styles.row, { borderBottomColor: colors.glassRim }]}>
                  <View style={[styles.rowIcon, { backgroundColor: `${meta.color}22` }]}>
                    <MaterialIcons name={meta.icon} size={21} color={meta.color} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowLabel, { color: colors.foreground }]}>{meta.label}</Text>
                    <Text style={[styles.rowHint, { color: colors.muted }]}>{meta.hint}</Text>
                    {killed ? <Text style={[styles.killTag, { color: colors.error }]}>مُعطّل من الإدارة العليا — الحجب المركزي يعلو تفضيلاتك</Text> : null}
                  </View>
                  <AppToggle
                    value={effective}
                    onValueChange={(next) => togglePreference(flag, next)}
                    isRTL={isRTL}
                    activeColor={colors.success}
                    inactiveColor="#3A3F47"
                    disabled={!canEdit}
                    accessibilityLabel={meta.label}
                  />
                </View>
              );
            })}
          </View>
        </GlowGlassCard>
      </ScrollView>
    </View>
  );
}

function SectionHeader({ icon, iconColor, title, subtitle }: { icon: FeatureIcon; iconColor: string; title: string; subtitle: string }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: `${iconColor}22` }]}>
        <MaterialIcons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.sectionCopy}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  masterCardRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  masterIcon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  masterCopy: { flex: 1, minWidth: 0, gap: 4 },
  masterVersion: { fontSize: 12, fontWeight: "900" },
  masterTitle: { fontSize: 18, fontWeight: "900", lineHeight: 24 },
  masterDesc: { fontSize: 13, lineHeight: 20 },
  savedToast: { marginTop: 12, fontSize: 12, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10, paddingHorizontal: 2 },
  sectionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 16, fontWeight: "900" },
  sectionSubtitle: { fontSize: 12, color: "#9AA4AD", lineHeight: 17, marginTop: 2 },
  sectionBody: { paddingHorizontal: 14, paddingTop: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  rowIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { fontSize: 14, fontWeight: "800", lineHeight: 20 },
  rowHint: { fontSize: 11, lineHeight: 16 },
  killTag: { fontSize: 11, fontWeight: "800", lineHeight: 16, marginTop: 2 },
});