import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { CompactScreenHeader } from "@/components/compact-screen-header";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useWorkspaceAccess } from "@/lib/workspace-access";

const CURRENCY_OPTIONS = ["JOD", "SAR", "USD", "AED", "EGP"];

const DELETE_TOOLTIP = "لا يمكن حذف هذه المنشأة؛ يجب أن يحتوي حسابك على منشأة واحدة نشطة على الأقل.";
const DELETE_TITLE = "تأكيد حذف المنشأة نهائياً";
const DELETE_WARNING = "تحذير: سيتم حذف المنشأة وجميع سجلات الحجز والوحدات التابعة لها نهائياً.";
const DELETE_CHALLENGE = "لتأكيد الحذف، اكتب كلمة 'حذف' أو 'DELETE' أدناه:";

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

function roleBadgeLabel(role: string, language: "ar" | "en") {
  if (role === "owner") return language === "ar" ? "مالك" : "Owner";
  if (role === "admin") return language === "ar" ? "مشرف" : "Supervisor";
  if (role === "staff") return language === "ar" ? "موظف" : "Staff";
  if (role === "caretaker") return language === "ar" ? "حارس" : "Caretaker";
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
  const createWorkspace = trpc.workspace.create.useMutation();
  const deleteWorkspace = trpc.workspace.delete.useMutation();
  const utils = trpc.useUtils();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [wsName, setWsName] = useState("");
  const [wsPhone, setWsPhone] = useState("");
  const [wsCurrency, setWsCurrency] = useState<string>(CURRENCY_OPTIONS[0]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HubCard | null>(null);
  const [challenge, setChallenge] = useState("");
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

  const create = async () => {
    if (isSubmitting) return;
    const trimmed = wsName.trim();
    if (trimmed.length < 2) {
      setFormError(language === "ar" ? "أدخل اسم المنشأة (مثال: قرية أمواج السياحية)." : "Enter a property name (e.g. Amaaj tourist village).");
      return;
    }
    const duplicate = cards.some((card) => card.name.trim().toLowerCase() === trimmed.toLowerCase() || card.businessName.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      setFormError(language === "ar" ? "يوجد لديك منشأة بهذا الاسم بالفعل. اختر اسمًا مختلفًا." : "You already have a property with this exact name. Choose a different one.");
      return;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      const result = await createWorkspace.mutateAsync({ name: trimmed, phone: wsPhone.trim(), currency: wsCurrency.trim() });
      // A successful HTTP response closes the modal immediately and clears the
      // form — before any cache refresh. Post-success house-keeping (activation
      // select + refetch) is best-effort and must NEVER surface as a creation
      // failure, otherwise the "تعذر إنشاء المنشأة" banner appears even though
      // the backend succeeded (false network error).
      setCreateVisible(false);
      setWsName("");
      setWsPhone("");
      setWsCurrency(CURRENCY_OPTIONS[0]);
      const newId = result.workspace?.id ?? result.member?.workspaceId;
      try {
        if (newId != null) {
          try { await selectWorkspace.mutateAsync({ workspaceId: newId }); } catch { /* created workspace is already active server-side */ }
        }
        await hub.refetch();
      } catch {
        // Cache refresh is best-effort; never mark a successful creation as failed.
      }
    } catch (error) {
      const trpcError = error as { data?: { code?: string } } | null;
      setFormError(
        trpcError?.data?.code === "CONFLICT"
          ? (language === "ar" ? "يوجد منشأة مسجلة مسبقاً بهذا الاسم، يرجى اختيار اسم مختلف." : "A property with this name is already registered. Please choose a different name.")
          : (language === "ar" ? "تعذر إنشاء المنشأة. تحقق من الاتصال أو جرّب اسمًا آخر." : "Could not create the property. Check your connection or try another name."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestDelete = (card: HubCard) => {
    setDeleteTarget(card);
    setChallenge("");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (challenge !== "حذف" && challenge !== "DELETE") {
      Alert.alert(DELETE_TITLE, language === "ar" ? "اكتب كلمة 'حذف' أو 'DELETE' بالضبط للمتابعة." : "Type exactly “حذف” or “DELETE” to continue.");
      return;
    }
    try {
      await deleteWorkspace.mutateAsync({ workspaceId: deleteTarget.workspaceId, confirmation: challenge });
      setDeleteTarget(null);
      setChallenge("");
      await utils.workspace.invalidate();
      await hub.refetch();
      Alert.alert(language === "ar" ? "تم حذف المنشأة 🗑️" : "Property deleted 🗑️", language === "ar" ? "تم حذف المنشأة وجميع سجلات الحجز والوحدات التابعة لها نهائياً." : "The property and all its bookings and units were permanently deleted.");
    } catch {
      Alert.alert(language === "ar" ? "تعذر حذف المنشأة" : "Could not delete property", language === "ar" ? "تعذر حذف المنشأة. تحقق من اتصالك أو من أنك المالك المعتمد، ثم أعد المحاولة." : "Could not delete the property. Check your connection or your owner role, then retry.");
    }
  };

  const cards: HubCard[] = (hub.data?.memberships ?? []) as HubCard[];
  const loading = hub.isLoading || hub.isFetching;
  const ownedCount = cards.filter((card) => card.role === "owner").length;
  const activeCount = cards.filter((card) => card.isActive).length;
  const challengeLocked = challenge !== "حذف" && challenge !== "DELETE";

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <CompactScreenHeader title={language === "ar" ? "منشآتي" : "Properties hub"} icon="business" accentColor={colors.primary} backHref="/workspace-hub" showDateTime={false} />

      <GlowGlassCard glowColor={colors.primary} radius={26} contentStyle={styles.bannerContent}>
        <View style={[styles.banner, { flexDirection: row }]}>
          <View style={[styles.bannerIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="holiday-village" size={27} color={colors.primary} /></View>
          <View style={styles.flex}>
            <View style={[styles.titleRow, { flexDirection: row }]}><Text style={[styles.bannerTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "منشآتك ومساحات العمل" : "Your properties & workspaces"}</Text>{!loading ? <View style={[styles.counterBadge, { backgroundColor: colors.primary + "16", borderColor: colors.primary + "55" }]}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>[{activeCount} {language === "ar" ? (activeCount === 1 ? "منشأة نشطة" : "منشآت نشطة") : (activeCount === 1 ? "active property" : "active properties")}]</Text></View> : null}</View>
            <Text style={[styles.bannerSubtitle, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "إدارة شاملة لعقاراتك، تبديل بيئة العمل المباشرة، وتعديل إعدادات الحجوزات والعملات." : "End-to-end management of your real estate: switch the live work context and edit booking & currency settings."}</Text>
          </View>
        </View>
      </GlowGlassCard>

      {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : cards.length ? <>
        <View style={[styles.sectionRow, { flexDirection: row }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "المنشآت" : "Properties"}</Text>
          <Pressable onPress={() => { setCreateVisible(true); setFormError(null); }} style={({ pressed }) => [styles.addProperty, { borderColor: colors.primary + "66", opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="add-business" size={17} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "+ إضافة منشأة جديدة" : "+ Add a new property"}</Text></Pressable>
        </View>
        {cards.map((card) => <PropertyCard key={card.workspaceId} card={card} colors={colors} language={language} align={align} row={row} busy={busyId === card.workspaceId || selectWorkspace.isPending} canDelete={card.role === "owner" && ownedCount > 1} ownedCount={ownedCount} onWork={() => void applyThen(card.workspaceId, () => router.replace("/(tabs)"))} onManage={() => void applyThen(card.workspaceId, () => router.push(`/property-detail?workspaceId=${card.workspaceId}` as never))} onDelete={() => requestDelete(card)} />)}
      </> : <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="business" size={28} color={colors.primary} /><Text style={{ color: colors.foreground, fontWeight: "800", marginTop: 9 }}>{language === "ar" ? "لا توجد منشآت بعد" : "No properties yet"}</Text><Pressable onPress={() => router.push("/workspace-hub" as never)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginTop: 12 })}><Text style={{ color: colors.primary, fontWeight: "900" }}>{language === "ar" ? "إنشاء مجموعة منشآت" : "Create a property group"}</Text></Pressable></View>}
    </ScrollView>

    <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.modalHeader, { flexDirection: row }]}>
            <View style={[styles.modalIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="add-business" size={23} color={colors.primary} /></View>
            <View style={styles.flex}>
              <Text style={[styles.modalTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "إضافة منشأة جديدة" : "Add a new property"}</Text>
              <Text style={[styles.modalSubtitle, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "أنشئ منشأة إضافية وتصبح مالكها المعتمد فور الحفظ." : "Create an extra property and become its approved owner on save."}</Text>
            </View>
            <Pressable onPress={() => setCreateVisible(false)} style={({ pressed }) => [styles.modalClose, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable>
          </View>

          <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "اسم المنشأة" : "Property name"}</Text>
          <TextInput value={wsName} onChangeText={(value) => { setWsName(value); setFormError(null); }} placeholder={language === "ar" ? "مثال: قرية أمواج السياحية" : "e.g. Amaaj tourist village"} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} accessibilityLabel={language === "ar" ? "اسم المنشأة" : "Property name"} />

          <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "رقم الهاتف (اختياري)" : "Phone number (optional)"}</Text>
          <TextInput value={wsPhone} onChangeText={setWsPhone} placeholder="+962 7X XXX XXXX" keyboardType="phone-pad" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} accessibilityLabel={language === "ar" ? "رقم الهاتف" : "Phone number"} />

          <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "العملة" : "Currency"}</Text>
          <View style={[styles.currencyRow, { flexDirection: row }]}>
            {CURRENCY_OPTIONS.map((option) => {
              const active = option === wsCurrency;
              return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setWsCurrency(option)} style={({ pressed }) => [styles.currencyChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: active ? colors.primary : colors.muted, fontWeight: "900", fontSize: 14 }}>{option}</Text></Pressable>;
            })}
          </View>

          {formError ? <View accessibilityLiveRegion="polite" style={[styles.inlineError, { backgroundColor: colors.error + "12", flexDirection: row }]}><MaterialIcons name="error-outline" size={16} color={colors.error} /><Text style={[styles.flex, { color: colors.error, fontSize: 11, fontWeight: "800", textAlign: align }]}>{formError}</Text></View> : null}

          <Pressable disabled={isSubmitting} onPress={() => void create()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed || isSubmitting ? 0.66 : 1, flexDirection: row }]}>
            {isSubmitting ? <ActivityIndicator color={colors.background} size="small" /> : <MaterialIcons name="storefront" size={19} color={colors.background} />}
            <Text style={{ color: colors.background, fontWeight: "900" }}>{isSubmitting ? (language === "ar" ? "جاري إنشاء المنشأة..." : "Creating your property...") : (language === "ar" ? "حفظ وتعييني مالكًا" : "Save and make me the owner")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>

    <Modal visible={Boolean(deleteTarget)} transparent animationType="fade" onRequestClose={() => { if (!deleteWorkspace.isPending) setDeleteTarget(null); }}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.error + "66" }]}>
          <View style={[styles.modalHeader, { flexDirection: row }]}>
            <View style={[styles.modalIcon, { backgroundColor: colors.error + "18" }]}><MaterialIcons name="delete-forever" size={23} color={colors.error} /></View>
            <View style={styles.flex}>
              <Text style={[styles.modalTitle, { color: colors.foreground, textAlign: align }]}>{DELETE_TITLE}</Text>
              <Text style={[styles.modalSubtitle, { color: colors.muted, textAlign: align }]}>{deleteTarget ? deleteTarget.businessName || deleteTarget.name : ""}</Text>
            </View>
            <Pressable disabled={deleteWorkspace.isPending} onPress={() => setDeleteTarget(null)} style={({ pressed }) => [styles.modalClose, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable>
          </View>

          <View style={[styles.deleteWarning, { backgroundColor: colors.error + "12", borderColor: colors.error + "55", flexDirection: row }]}><MaterialIcons name="warning-amber" size={20} color={colors.error} /><Text style={[styles.flex, { color: colors.foreground, fontSize: 11, lineHeight: 18, fontWeight: "800", textAlign: align }]}>{DELETE_WARNING}</Text></View>

          <Text style={[styles.challengeLabel, { color: colors.foreground, textAlign: align }]}>{DELETE_CHALLENGE}</Text>
          <TextInput value={challenge} onChangeText={setChallenge} autoCapitalize="characters" autoCorrect={false} placeholder={isRTL ? "حذف" : "DELETE"} placeholderTextColor={colors.muted} style={[styles.challengeInput, { color: colors.error, borderColor: challengeLocked ? colors.border : colors.error, backgroundColor: colors.surfaceMuted, textAlign: align }]} accessibilityLabel={language === "ar" ? "اكتب كلمة الحذف" : "Type the deletion word"} />

          <Pressable disabled={challengeLocked || deleteWorkspace.isPending} onPress={() => void confirmDelete()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.error, opacity: challengeLocked || deleteWorkspace.isPending ? 0.45 : pressed ? 0.78 : 1, flexDirection: row }]}>
            {deleteWorkspace.isPending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <MaterialIcons name="delete-forever" size={19} color="#FFFFFF" />}
            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{deleteWorkspace.isPending ? (language === "ar" ? "جاري الحذف..." : "Deleting...") : (language === "ar" ? "حذف نهائي" : "Delete permanently")}</Text>
          </Pressable>
          <Pressable disabled={deleteWorkspace.isPending} onPress={() => setDeleteTarget(null)} style={({ pressed }) => [styles.cancel, { borderColor: colors.border, opacity: pressed ? 0.7 : 1, flexDirection: row }]}><Text style={{ color: colors.muted, fontWeight: "900" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable>
        </View>
      </View>
    </Modal>
  </ScreenContainer>;
}

function PropertyCard({ card, colors, language, align, row, busy, canDelete, ownedCount, onWork, onManage, onDelete }: { card: HubCard; colors: ReturnType<typeof useColors>; language: "ar" | "en"; align: "left" | "right"; row: "row" | "row-reverse"; busy: boolean; canDelete: boolean; ownedCount: number; onWork: () => void; onManage: () => void; onDelete: () => void }) {
  const canManage = isManagerRole(card.role);
  const accent = card.isActive ? colors.success : colors.primary;
  const roleColor = card.role === "owner" ? colors.success : card.role === "admin" ? colors.primary : colors.warning;
  const unitWord = card.unitCount === 1 ? (language === "ar" ? "وحدة" : "unit") : (language === "ar" ? "وحدات" : "units");

  return <GlowGlassCard glowColor={accent} active={card.isActive} radius={22} contentStyle={styles.cardPadding}>
    <View style={[styles.cardTop, { flexDirection: row }]}>
      <View style={[styles.cardHead, { flexDirection: row }]}>
        {card.logoUrl ? <Image source={{ uri: card.logoUrl }} contentFit="cover" style={styles.logo} /> : <View style={[styles.logoFallback, { backgroundColor: accent + "1A" }]}><MaterialIcons name="holiday-village" size={22} color={accent} /></View>}
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.foreground, textAlign: align }]}>{card.businessName || card.name}</Text>
          <View style={[styles.badges, { flexDirection: row }]}>
            <View style={[styles.badge, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name="currency-exchange" size={11} color={colors.muted} /><Text style={[styles.badgeText, { color: colors.foreground }]}>{card.currency ?? (language === "ar" ? "بلا عملة" : "No currency")}</Text></View>
            <View style={[styles.badge, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name="home-work" size={11} color={colors.muted} /><Text style={[styles.badgeText, { color: colors.foreground }]}>{card.unitCount} {unitWord}</Text></View>
            <View style={[styles.badge, { backgroundColor: roleColor + "18", borderColor: roleColor + "55" }]}><MaterialIcons name="shield" size={11} color={roleColor} /><Text style={[styles.badgeText, { color: roleColor }]}>{roleBadgeLabel(card.role, language)}</Text></View>
          </View>
        </View>
      </View>
    </View>

    {card.isActive ? <View style={[styles.activeBadge, { backgroundColor: colors.success + "16", borderColor: colors.success + "88" }]}><Text style={[styles.activeBadgeText, { color: colors.success, textShadowColor: colors.success }]}>{language === "ar" ? "🟢 المنشأة النشطة حالياً" : "🟢 Currently active property"}</Text></View> : null}

    <View style={[styles.actions, { flexDirection: row }]}>
      {canManage ? <Pressable disabled={busy} onPress={onManage} style={({ pressed }) => [styles.actionPrimary, { backgroundColor: colors.primary, opacity: busy ? 0.5 : pressed ? 0.78 : 1, flexDirection: row }]}><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "إدارة وتعديل المنشأة ✏️" : "Manage & edit property ✏️"}</Text></Pressable> : null}
      <Pressable disabled={busy} onPress={onWork} style={({ pressed }) => [styles.actionGhost, { borderColor: accent + "66", opacity: busy ? 0.5 : pressed ? 0.72 : 1, flexDirection: row }]}><Text style={{ color: accent, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "العمل على هذه المنشأة ➔" : "Work on this property ➔"}</Text></Pressable>
    </View>

    {card.role === "owner" ? <View style={[styles.deleteRow, { flexDirection: row }]}>
      <Pressable disabled={!canDelete || busy} onPress={onDelete} style={({ pressed }) => [styles.deleteButton, { borderColor: canDelete ? colors.error + "77" : colors.border, opacity: pressed && canDelete ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="delete" size={16} color={canDelete ? colors.error : colors.muted} /><Text style={{ color: canDelete ? colors.error : colors.muted, fontWeight: "900", fontSize: 11 }}>{language === "ar" ? "حذف المنشأة" : "Delete property"}</Text></Pressable>
      {ownedCount <= 1 ? <Text style={[styles.deleteTooltip, { color: colors.muted, textAlign: align }]}>{DELETE_TOOLTIP}</Text> : null}
    </View> : null}
  </GlowGlassCard>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 44 },
  bannerContent: { padding: 16 },
  banner: { alignItems: "center", gap: 12 },
  bannerIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  flex: { flex: 1, minWidth: 0 },
  titleRow: { alignItems: "center", gap: 9, flexWrap: "wrap" },
  bannerTitle: { fontSize: 18, lineHeight: 26, fontWeight: "900", flexShrink: 1 },
  counterBadge: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  bannerSubtitle: { marginTop: 5, fontSize: 11, lineHeight: 17 },
  loading: { marginTop: 34 },
  sectionRow: { alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 22, marginBottom: 8 },
  sectionTitle: { fontSize: 14, lineHeight: 21, fontWeight: "900" },
  addProperty: { minHeight: 38, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", gap: 5, flexShrink: 0 },
  cardPadding: { padding: 15 },
  cardTop: { alignItems: "center" },
  cardHead: { alignItems: "center", gap: 11, flex: 1, minWidth: 0 },
  logo: { width: 47, height: 47, borderRadius: 15, flexShrink: 0 },
  logoFallback: { width: 47, height: 47, borderRadius: 15, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardTitle: { fontSize: 14, lineHeight: 21, fontWeight: "900" },
  badges: { gap: 6, marginTop: 7, flexWrap: "wrap" },
  badge: { borderRadius: 9, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row-reverse", alignItems: "center", gap: 4, flexShrink: 0 },
  badgeText: { fontSize: 10, fontWeight: "900" },
  activeBadge: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 6, marginTop: 11, alignItems: "center" },
  activeBadgeText: { fontSize: 11, fontWeight: "900", textShadowRadius: 7 },
  actions: { marginTop: 13, gap: 9 },
  actionPrimary: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 6 },
  actionGhost: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  deleteRow: { alignItems: "center", gap: 9, marginTop: 12 },
  deleteButton: { minHeight: 38, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", gap: 5, flexShrink: 0 },
  deleteTooltip: { flex: 1, minWidth: 0, fontSize: 10, lineHeight: 15 },
  empty: { minHeight: 170, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 16 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(5, 8, 15, 0.82)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", maxWidth: 460, borderRadius: 24, borderWidth: 1, padding: 20 },
  modalHeader: { alignItems: "center", gap: 11 },
  modalIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modalTitle: { fontSize: 17, lineHeight: 24, fontWeight: "900" },
  modalSubtitle: { marginTop: 3, fontSize: 11, lineHeight: 16 },
  modalClose: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  label: { marginTop: 15, fontSize: 12, lineHeight: 18, fontWeight: "800" },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, marginTop: 5, fontSize: 14 },
  currencyRow: { gap: 8, marginTop: 5 },
  currencyChip: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  inlineError: { marginTop: 12, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9, gap: 6, alignItems: "center" },
  primary: { minHeight: 52, borderRadius: 13, marginTop: 16, alignItems: "center", justifyContent: "center", gap: 7 },
  cancel: { minHeight: 46, borderRadius: 13, borderWidth: 1, marginTop: 10, alignItems: "center", justifyContent: "center" },
  deleteWarning: { marginTop: 15, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, gap: 8, alignItems: "center" },
  challengeLabel: { marginTop: 15, fontSize: 12, lineHeight: 18, fontWeight: "800" },
  challengeInput: { minHeight: 50, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, marginTop: 6, fontSize: 15, fontWeight: "900" },
});