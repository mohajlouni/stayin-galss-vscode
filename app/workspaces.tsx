import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenBackButton } from "@/components/screen-back-button";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { useBookings } from "@/lib/booking-store";
import { chaletPerformanceSummary, formatMoney, propertyTypeIcon, propertyTypeLabel, type Chalet } from "@/lib/booking-model";

const CURRENCY_OPTIONS = ["JOD", "SAR", "USD", "AED", "EGP"] as const;

const SLATE_900 = "#0F172A";
const SLATE_900_50 = "#0F172A80";
const SLATE_900_80 = "#0F172ACC";
const SLATE_800_90 = "#1E293BE6";
const SLATE_800_80 = "#1E293BCC";
const SLATE_800 = "#1E293B";
const SLATE_700 = "#334155";
const SLATE_600 = "#475569";
const SLATE_400 = "#94A3B8";
const SLATE_300 = "#CBD5E1";
const SLATE_200 = "#E2E8F0";
const SLATE_100 = "#F1F5F9";
const SLATE_50 = "#F8FAFC";
const SLATE_950_70 = "#020617B3";
const ORANGE_500_40 = "#F9731666";

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

export default function WorkspacesScreen() {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { isAuthenticated, activeWorkspaceId } = useWorkspaceAccess();
  const { chalets, bookings, settings, hydrated } = useBookings();
  const hub = trpc.workspace.hub.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const selectWorkspace = trpc.workspace.select.useMutation();
  const createWorkspace = trpc.workspace.create.useMutation();
  const utils = trpc.useUtils();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [wsName, setWsName] = useState("");
  const [wsPhone, setWsPhone] = useState("");
  const [wsCurrency, setWsCurrency] = useState<string>(CURRENCY_OPTIONS[0]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const align: "left" | "right" = isRTL ? "right" : "left";
  const row: "row" | "row-reverse" = isRTL ? "row-reverse" : "row";

  useEffect(() => {
    if (copiedId === null) return undefined;
    const timer = setTimeout(() => setCopiedId(null), 1800);
    return () => clearTimeout(timer);
  }, [copiedId]);

  if (!isAuthenticated) return <Redirect href="/auth/login" />;

  const cards: HubCard[] = (hub.data?.memberships ?? []) as HubCard[];
  const activeCard = cards.find((card) => card.workspaceId === activeWorkspaceId) ?? cards.find((card) => card.isActive) ?? null;
  const loading = hub.isLoading || hub.isFetching;
  const unitWord = chalets.length === 1 ? (language === "ar" ? "وحدة" : "unit") : (language === "ar" ? "وحدات" : "units");

  const copyWorkspaceId = async (workspaceId: number) => {
    try {
      await Clipboard.setStringAsync(`#${workspaceId}`);
      setCopiedId(workspaceId);
    } catch {
      // Best-effort: never block the UI if the clipboard is unavailable.
    }
  };

  const workspaceIdText = (workspaceId: number) => `#${String(workspaceId).padStart(6, "0")}`;

  const applyThen = async (workspaceId: number, then: () => void) => {
    setBusyId(workspaceId);
    try {
      await selectWorkspace.mutateAsync({ workspaceId });
      await utils.workspace.invalidate();
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

  const renderEstablishmentHeader = () => <View style={[styles.sectionRow, { flexDirection: row }]}>
    <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "المنشآت المسجلة" : "Registered properties"}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إضافة منشأة جديدة" : "Add a new property"} onPress={() => { setCreateVisible(true); setFormError(null); }} style={({ pressed }) => [styles.addButton, { borderColor: colors.primary + "66", opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="add-business" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 11 }}>{language === "ar" ? "+ إضافة منشأة جديدة" : "+ Add a property"}</Text></Pressable>
  </View>;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[styles.header, { flexDirection: row }]}>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "إدارة المنشآت والعقارات" : "Properties & units hub"}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted, textAlign: align }]}>{language === "ar"
            ? "تعديل المنشأة النشطة، تعديل البيانات، وإدارة الوحدات التابعة مباشرة."
            : "Edit the active property, update its data, and manage its units directly."}</Text>
        </View>
        <ScreenBackButton fallbackHref="/(tabs)/more" returnToFallback />
      </View>

      {renderEstablishmentHeader()}

      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.muted, fontSize: 11 }}>{language === "ar" ? "جارٍ تحميل المنشآت…" : "Loading properties…"}</Text></View> : cards.length ? cards.map((card) => {
        const isActive = card.workspaceId === activeCard?.workspaceId;
        const busy = busyId === card.workspaceId || selectWorkspace.isPending;
        const accent = isActive ? colors.primary : colors.muted;
        const copied = copiedId === card.workspaceId;
        return <View key={card.workspaceId} style={[styles.wsCard, { borderColor: isActive ? colors.primary + "99" : SLATE_800_80 }, isActive && { shadowColor: colors.primary, shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 }]}>
          <View style={styles.wsRow}>
            <View style={styles.wsIdentity}>
              <View style={styles.wsHead}>
                <View style={[styles.wsIcon, { borderColor: SLATE_700 + "99" }]}><MaterialIcons name="business" size={22} color={accent} /></View>
                <View style={styles.nameCol}>
                  <Text numberOfLines={1} style={[styles.wsName, { textAlign: align }]}>{card.businessName || card.name}</Text>
                  <View style={[styles.idPill, { borderColor: copied ? colors.success + "99" : SLATE_700 }]}>
                    <Text numberOfLines={1} style={{ color: copied ? colors.success : SLATE_300, fontSize: 11, fontWeight: "700", writingDirection: "ltr" }}>{workspaceIdText(card.workspaceId)}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "نسخ معرف المنشأة" : "Copy workspace ID"} onPress={() => void copyWorkspaceId(card.workspaceId)} style={({ pressed }) => [styles.idCopy, { opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name={copied ? "check" : "content-copy"} size={11} color={copied ? colors.success : SLATE_400} /></Pressable>
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.wsLeft}>
              <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={language === "ar" ? "تعديل بيانات المنشأة" : "Edit property data"} onPress={() => void applyThen(card.workspaceId, () => router.push(`/property-detail?workspaceId=${card.workspaceId}` as never))} style={({ pressed }) => [styles.editButton, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}><MaterialIcons name="edit" size={17} color={SLATE_300} /></Pressable>
              {isActive ? <View style={[styles.activityBadge, { backgroundColor: colors.success + "1A", borderColor: colors.success + "4D" }]}><MaterialIcons name="check-circle" size={13} color={colors.success} /><Text style={{ color: colors.success, fontSize: 12, fontWeight: "600" }}>{language === "ar" ? "المنشأة النشطة حالياً ✓" : "Currently active property ✓"}</Text></View> : <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={language === "ar" ? "العمل على هذه المنشأة" : "Work on this property"} onPress={() => void applyThen(card.workspaceId, () => router.replace("/(tabs)"))} style={({ pressed }) => [styles.workButton, { backgroundColor: colors.primary, opacity: busy ? 0.5 : pressed ? 0.8 : 1, flexDirection: row }]}>{busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 12 }}>{language === "ar" ? "العمل على هذه المنشأة ➔" : "Work on this property ➔"}</Text>}</Pressable>}
              <View style={styles.countTile}>
                <Text numberOfLines={1} style={styles.countLabel}>{language === "ar" ? "الوحدات" : "Units"}</Text>
                <Text numberOfLines={1} style={styles.countNumber}>{card.unitCount}</Text>
              </View>
            </View>
          </View>
        </View>;
      }) : <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="domain-disabled" size={26} color={colors.primary} /><Text style={{ color: colors.foreground, fontWeight: "800", marginTop: 8 }}>{language === "ar" ? "لا توجد منشآت مسجلة بعد" : "No properties registered yet"}</Text><Pressable disabled={busyId !== null} accessibilityRole="button" onPress={() => { setCreateVisible(true); setFormError(null); }} style={({ pressed }) => [styles.emptyCta, { borderColor: colors.primary + "66", opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="add-business" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "إضافة منشأتك الأولى" : "Add your first property"}</Text></Pressable></View>}

      {activeCard ? <>
        <View style={[styles.workBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "44" }]}>
          <View style={[styles.workBannerIcon, { backgroundColor: colors.primary + "1F" }]}><MaterialIcons name="bolt" size={16} color={colors.primary} /></View>
          <Text style={[styles.workBannerText, { textAlign: align }]}>{language === "ar" ? "أنت تعمل الآن على: " : "You are working on: "}<Text style={{ color: colors.primary, fontWeight: "900" }}>{activeCard.businessName || activeCard.name}</Text></Text>
        </View>

        <View style={[styles.sectionRow, styles.unitsSectionRow, { flexDirection: row }]}>
          <View style={styles.sectionTitleCol}>
            <Text numberOfLines={1} style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? `وحدات ${activeCard.businessName || activeCard.name}` : `Units of ${activeCard.businessName || activeCard.name}`}</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted, textAlign: align }]}>{`${chalets.length} ${unitWord}`}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إضافة وحدة جديدة" : "Add a new unit"} onPress={() => router.push("/chalet-profile?mode=add" as never)} style={({ pressed }) => [styles.addButton, { borderColor: colors.primary + "66", opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="add-home-work" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 11 }}>{language === "ar" ? "+ إضافة وحدة جديدة" : "+ Add a unit"}</Text></Pressable>
        </View>

        {!hydrated ? <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.muted, fontSize: 11 }}>{language === "ar" ? "جارٍ تحميل الوحدات…" : "Loading units…"}</Text></View> : chalets.length ? chalets.map((chalet) => <UnitCard key={chalet.id} chalet={chalet} bookings={bookings} currency={settings.currency} colors={colors} language={language} align={align} row={row} />) : <View style={[styles.empty, styles.unitsEmpty, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="home-work" size={26} color={colors.primary} /><Text style={{ color: colors.foreground, fontWeight: "800", marginTop: 8 }}>{language === "ar" ? "لا توجد وحدات مسجلة لهذه المنشأة" : "No units registered for this property"}</Text><Pressable accessibilityRole="button" onPress={() => router.push("/chalet-profile?mode=add" as never)} style={({ pressed }) => [styles.emptyCta, { borderColor: colors.primary + "66", opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name="add-home-work" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "إضافة وحدة جديدة" : "Add a new unit"}</Text></Pressable></View>}
      </> : null}
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
            <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={() => setCreateVisible(false)} style={({ pressed }) => [styles.modalClose, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable>
          </View>

          <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "اسم المنشأة" : "Property name"}</Text>
          <TextInput value={wsName} onChangeText={(value) => { setWsName(value); setFormError(null); }} placeholder={language === "ar" ? "مثال: قرية أمواج السياحية" : "e.g. Amaaj tourist village"} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} accessibilityLabel={language === "ar" ? "اسم المنشأة" : "Property name"} />

          <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "رقم الهاتف (اختياري)" : "Phone number (optional)"}</Text>
          <TextInput value={wsPhone} onChangeText={setWsPhone} placeholder="+962 7X XXX XXX" keyboardType="phone-pad" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} accessibilityLabel={language === "ar" ? "رقم الهاتف" : "Phone number"} />

          <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "العملة" : "Currency"}</Text>
          <View style={[styles.currencyRow, { flexDirection: row }]}>
            {CURRENCY_OPTIONS.map((option) => {
              const active = option === wsCurrency;
              return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setWsCurrency(option)} style={({ pressed }) => [styles.currencyChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: active ? colors.primary : colors.muted, fontWeight: "900", fontSize: 13 }}>{option}</Text></Pressable>;
            })}
          </View>

          {formError ? <View accessibilityLiveRegion="polite" style={[styles.inlineError, { backgroundColor: colors.error + "12", flexDirection: row }]}><MaterialIcons name="error-outline" size={16} color={colors.error} /><Text style={[styles.flex, { color: colors.error, fontSize: 11, fontWeight: "800", textAlign: align }]}>{formError}</Text></View> : null}

          <Pressable disabled={isSubmitting} accessibilityRole="button" onPress={() => void create()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed || isSubmitting ? 0.66 : 1, flexDirection: row }]}>
            {isSubmitting ? <ActivityIndicator color={colors.background} size="small" /> : <MaterialIcons name="storefront" size={19} color={colors.background} />}
            <Text style={{ color: colors.background, fontWeight: "900" }}>{isSubmitting ? (language === "ar" ? "جاري إنشاء المنشأة..." : "Creating your property...") : (language === "ar" ? "حفظ وتعييني مالكًا" : "Save and make me the owner")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  </ScreenContainer>;
}

function UnitCard({ chalet, bookings, currency, colors, language, align, row }: { chalet: Chalet; bookings: ReadonlyArray<import("@/lib/booking-model").Booking>; currency: string; colors: ReturnType<typeof useColors>; language: "ar" | "en"; align: "left" | "right"; row: "row" | "row-reverse" }) {
  const performance = chaletPerformanceSummary(chalet.id, bookings as Parameters<typeof chaletPerformanceSummary>[1]);
  const codeText = chalet.referenceCode?.startsWith("#") ? chalet.referenceCode : chalet.referenceCode ? `#${chalet.referenceCode}` : (language === "ar" ? "بلا رمز" : "No code");
  const typeLabel = propertyTypeLabel(chalet.propertyType, language);
  const textDirection = row === "row-reverse" ? "rtl" : "ltr";
  return <View style={styles.unitCard}>
    <View style={[styles.unitRow, { flexDirection: row }]}>
      <View style={styles.unitIdentity}>
        <View style={[styles.unitHead, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
          <View style={[styles.unitIcon, { borderColor: SLATE_700 + "99" }]}><MaterialIcons name={propertyTypeIcon(chalet.propertyType)} size={18} color={chalet.color} /></View>
          <Text numberOfLines={1} style={[styles.unitName, { textAlign: align, writingDirection: textDirection }]}>{chalet.name}</Text>
          <Text numberOfLines={1} style={styles.unitCode}>{codeText}</Text>
        </View>
      </View>
      <View style={[styles.unitStatsBar, { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-evenly" }]}>
        <View style={styles.statGroup}>
          <Text style={[styles.statLabel, { writingDirection: textDirection }]}>{language === "ar" ? "الأيام المشغولة:" : "Occupied days:"}</Text>
          <Text style={[styles.statValue, { writingDirection: "ltr" }]}>{performance.occupiedDays}</Text>
        </View>
        <Text style={[styles.statDot, { color: SLATE_600 }]}>•</Text>
        <View style={styles.statGroup}>
          <Text style={[styles.statLabel, { writingDirection: textDirection }]}>{language === "ar" ? "الحجوزات:" : "Bookings:"}</Text>
          <Text style={[styles.statValue, { writingDirection: "ltr" }]}>{performance.bookingCount}</Text>
        </View>
        <Text style={[styles.statDot, { color: SLATE_600 }]}>•</Text>
        <View style={styles.statGroup}>
          <Text style={[styles.statLabel, { writingDirection: textDirection }]}>{language === "ar" ? "الإيراد:" : "Revenue:"}</Text>
          <Text style={[styles.statValue, { color: colors.success, writingDirection: textDirection }]}>{formatMoney(performance.rentalRevenue, currency)}</Text>
        </View>
      </View>
      <View style={[styles.unitActions, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
        <View style={[styles.typeBadge, { backgroundColor: chalet.color + "18", borderColor: chalet.color + "55" }]}><Text numberOfLines={1} style={{ color: chalet.color, fontSize: 11, fontWeight: "700" }}>{typeLabel}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "ملف الوحدة" : "Unit profile"} onPress={() => router.push({ pathname: "/chalet-profile", params: { id: chalet.id } } as never)} style={({ pressed }) => [styles.unitProfileButton, { opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>{language === "ar" ? "ملف الوحدة ➔" : "Unit profile ➔"}</Text></Pressable>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 44 },
  flex: { flex: 1, minWidth: 0 },
  header: { minHeight: 54, alignItems: "center", gap: 12, marginBottom: 2 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 18, lineHeight: 24, fontWeight: "900" },
  headerSubtitle: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  sectionRow: { alignItems: "center", justifyContent: "space-between", gap: 9, marginTop: 18, marginBottom: 8, flexWrap: "wrap" },
  unitsSectionRow: { marginTop: 6 },
  sectionTitleCol: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 14, lineHeight: 21, fontWeight: "900", alignSelf: "flex-start" },
  sectionSubtitle: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  addButton: { minHeight: 36, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", gap: 5, flexShrink: 0 },
  loadingRow: { minHeight: 88, alignItems: "center", justifyContent: "center", gap: 8, flexDirection: "row" },
  empty: { minHeight: 112, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 14 },
  unitsEmpty: { marginTop: 8 },
  emptyCta: { minHeight: 36, borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", gap: 5, marginTop: 10, flexDirection: "row" },
  wsCard: { marginTop: 9, borderWidth: 1, borderRadius: 20, padding: 16, backgroundColor: SLATE_900_50 },
  wsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" },
  wsIdentity: { flexGrow: 1, flexShrink: 0, minWidth: 200 },
  wsHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  wsIcon: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: SLATE_700, backgroundColor: SLATE_800, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  nameCol: { flex: 1, minWidth: 0, gap: 4 },
  wsName: { fontSize: 16, lineHeight: 22, fontWeight: "700", color: SLATE_100 },
  idPill: { alignSelf: "flex-start", minHeight: 20, borderRadius: 8, borderWidth: 1, borderColor: SLATE_700, backgroundColor: SLATE_800, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 4 },
  idCopy: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  wsLeft: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0 },
  countTile: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderColor: ORANGE_500_40, backgroundColor: SLATE_900, alignItems: "center", justifyContent: "center", gap: 2 },
  countLabel: { color: SLATE_400, fontSize: 10, fontWeight: "500" },
  countNumber: { color: SLATE_100, fontSize: 16, lineHeight: 22, fontWeight: "700", writingDirection: "ltr" },
  activityBadge: { minHeight: 32, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  workButton: { minHeight: 32, borderRadius: 12, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  editButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: SLATE_700, backgroundColor: SLATE_800, alignItems: "center", justifyContent: "center" },
  workBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
  workBannerIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  workBannerText: { flex: 1, minWidth: 0, color: SLATE_300, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  unitCard: { marginTop: 4, marginBottom: 8, borderWidth: 1, borderRadius: 20, padding: 12, backgroundColor: SLATE_900_50, borderColor: SLATE_800_80 },
  unitRow: { alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" },
  unitIdentity: { flexShrink: 0, minWidth: 170, flexGrow: 1, flexBasis: 0 },
  unitHead: { alignItems: "center", gap: 8 },
  unitIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: SLATE_700, backgroundColor: SLATE_800_80, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  unitName: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: SLATE_50, flexShrink: 1 },
  unitCode: { fontSize: 11, lineHeight: 16, color: SLATE_300, fontWeight: "600", marginTop: 1, writingDirection: "ltr", flexShrink: 1 },
  unitStatsBar: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: SLATE_800_80, backgroundColor: SLATE_950_70, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", gap: 10, flexShrink: 1, flexBasis: 200 },
  statGroup: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0, minWidth: 0 },
  statLabel: { color: SLATE_400, fontSize: 12, fontWeight: "500", flexShrink: 0 },
  statValue: { color: SLATE_100, fontSize: 12, fontWeight: "900", flexShrink: 0 },
  statDot: { fontSize: 12, fontWeight: "800", flexShrink: 0 },
  typeBadge: { minHeight: 22, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  unitActions: { flexShrink: 0 },
  unitProfileButton: { minHeight: 32, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: SLATE_700, backgroundColor: SLATE_800_90, alignItems: "center", justifyContent: "center", flexShrink: 0 },
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
});