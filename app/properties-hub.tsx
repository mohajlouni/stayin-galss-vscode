import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { CompactScreenHeader } from "@/components/compact-screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useWorkspaceAccess } from "@/lib/workspace-access";

type HubCard = {
  workspaceId: number;
  name: string;
  businessName: string;
  businessPhone: string;
  currency: string | null;
  logoUrl: string | null;
  role: string;
  unitCount: number;
  isActive: boolean;
};

function roleLabel(role: string, language: "ar" | "en") {
  if (role === "owner") return language === "ar" ? "المالك" : "Owner";
  if (role === "admin") return language === "ar" ? "مدير" : "Manager";
  if (role === "staff") return language === "ar" ? "موظف" : "Staff";
  return language === "ar" ? "ضيف" : "Guest";
}

function isManagerRole(role: string) {
  return role === "owner" || role === "admin";
}

export default function PropertiesHubScreen() {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { isAuthenticated } = useWorkspaceAccess();
  const hub = trpc.workspace.hub.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const selectWorkspace = trpc.workspace.select.useMutation();
  const [busyId, setBusyId] = useState<number | null>(null);
  const align: "right" | "left" = isRTL ? "right" : "left";
  const row: "row" | "row-reverse" = isRTL ? "row-reverse" : "row";

  if (!isAuthenticated) return <Redirect href="/auth/login" />;

  const applyThen = async (workspaceId: number, then: () => void) => {
    setBusyId(workspaceId);
    try {
      await selectWorkspace.mutateAsync({ workspaceId });
      await hub.refetch();
      then();
    } catch {
      Alert.alert(language === "ar" ? "تعذر تغيير المنشأة" : "Could not switch property", language === "ar" ? "تحقق من صلاحية الوصول ثم حاول مرة أخرى." : "Check your access and try again.");
    } finally {
      setBusyId(null);
    }
  };

  const cards: HubCard[] = (hub.data?.memberships ?? []) as HubCard[];
  const loading = hub.isLoading || hub.isFetching;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <CompactScreenHeader title={language === "ar" ? "منشآتي" : "Properties hub"} icon="business" accentColor={colors.primary} backHref="/auth/select-workspace" showDateTime={false} />

      <View style={[styles.hero, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "48" }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="holiday-village" size={25} color={colors.primary} /></View>
        <Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "إدارة المنشآت" : "Manage properties"}</Text>
        <Text style={[styles.detail, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "اختر المنشأة التي ستعمل عليها، أو عدّل وحداتها وبياناتها وطرق دفعها وعداداتها." : "Pick the property to work on, or edit its units, business profile, payment methods, and meters."}</Text>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : cards.length ? <>
        <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "المنشآت" : "Properties"}</Text>
        {cards.map((card) => <PropertyCard key={card.workspaceId} card={card} colors={colors} language={language} align={align} row={row} busy={busyId === card.workspaceId || selectWorkspace.isPending} onWork={() => void applyThen(card.workspaceId, () => router.replace("/(tabs)"))} onManage={() => void applyThen(card.workspaceId, () => router.push(`/property-detail?workspaceId=${card.workspaceId}` as never))} />)}
      </> : <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="business" size={28} color={colors.primary} /><Text style={{ color: colors.foreground, fontWeight: "800", marginTop: 9 }}>{language === "ar" ? "لا توجد منشآت بعد" : "No properties yet"}</Text><Pressable onPress={() => router.push("/auth/select-workspace" as never)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginTop: 12 })}><Text style={{ color: colors.primary, fontWeight: "900" }}>{language === "ar" ? "إنشاء مجموعة منشآت" : "Create a property group"}</Text></Pressable></View>}
    </ScrollView>
  </ScreenContainer>;
}

function PropertyCard({ card, colors, language, align, row, busy, onWork, onManage }: { card: HubCard; colors: ReturnType<typeof useColors>; language: "ar" | "en"; align: "left" | "right"; row: "row" | "row-reverse"; busy: boolean; onWork: () => void; onManage: () => void }) {
  const canManage = isManagerRole(card.role);
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={[styles.cardTop, { flexDirection: row }]}>
      {card.logoUrl ? <Image source={{ uri: card.logoUrl }} contentFit="cover" style={styles.logo} /> : <View style={[styles.logoFallback, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="holiday-village" size={22} color={colors.primary} /></View>}
      <View style={styles.flex}>
        <View style={[styles.nameRow, { flexDirection: row }]}><Text numberOfLines={1} style={[styles.flex, { color: colors.foreground, textAlign: align }]}>{card.businessName || card.name}</Text>{card.isActive ? <View style={[styles.activeBadge, { backgroundColor: colors.success + "18" }]}><Text style={{ color: colors.success, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "النشطة" : "Active"}</Text></View> : null}</View>
        <Text style={[styles.meta, { color: colors.muted, textAlign: align }]}>{card.unitCount} {language === "ar" ? "وحدة" : "units"} · {card.currency ?? (language === "ar" ? "بلا عملة" : "No currency")}</Text>
        <Text style={[styles.meta, { color: colors.muted, textAlign: align }]}>{card.businessPhone || (language === "ar" ? "بلا هاتف إدارة" : "No management phone")} · {roleLabel(card.role, language)}</Text>
      </View>
    </View>

    <View style={[styles.actions, { flexDirection: row }]}>
      {canManage ? <Pressable disabled={busy} onPress={onManage} style={({ pressed }) => [styles.actionPrimary, { backgroundColor: colors.primary, opacity: busy ? 0.5 : pressed ? 0.78 : 1 }]}><MaterialIcons name="edit" size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "إدارة وتعديل المنشأة" : "Manage property"}</Text></Pressable> : null}
      <Pressable disabled={busy} onPress={onWork} style={({ pressed }) => [styles.actionGhost, { borderColor: colors.primary + "66", opacity: busy ? 0.5 : pressed ? 0.72 : 1 }]}><MaterialIcons name="play-arrow" size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "العمل على هذه المنشأة" : "Work here"}</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 44 },
  hero: { borderWidth: 1, borderRadius: 22, padding: 17, marginTop: 16 },
  heroIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  title: { marginTop: 12, fontSize: 21, lineHeight: 28, fontWeight: "900" },
  detail: { marginTop: 6, fontSize: 12, lineHeight: 19 },
  loading: { marginTop: 34 },
  sectionTitle: { marginTop: 22, marginBottom: 8, fontSize: 14, lineHeight: 21, fontWeight: "900" },
  card: { borderWidth: 1, borderRadius: 21, padding: 15, marginTop: 12 },
  cardTop: { alignItems: "center", gap: 11 },
  logo: { width: 47, height: 47, borderRadius: 15, flexShrink: 0 },
  logoFallback: { width: 47, height: 47, borderRadius: 15, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  flex: { flex: 1, minWidth: 0 },
  nameRow: { alignItems: "center", gap: 8 },
  activeBadge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  meta: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  actions: { marginTop: 14, gap: 9 },
  actionPrimary: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  actionGhost: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  empty: { minHeight: 170, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 16 },
});
