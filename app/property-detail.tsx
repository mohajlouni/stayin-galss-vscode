import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { type ComponentProps, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { SettingsRow, SettingsValueBadge } from "@/components/settings-row";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { isValidBusinessLogoUrl, type Settings } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useWorkspaceAccess } from "@/lib/workspace-access";

type IconName = ComponentProps<typeof MaterialIcons>["name"];

export default function PropertyDetailScreen() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId?: string }>();
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { settings, chalets } = useBookings();
  const workspaceAccess = useWorkspaceAccess();
  const selectWorkspace = trpc.workspace.select.useMutation();
  const utils = trpc.useUtils();
  const { triggerHaptic } = useAppPreferences();
  const [idCopied, setIdCopied] = useState(false);
  const align: "right" | "left" = isRTL ? "right" : "left";
  const layoutDirection: "rtl" | "ltr" = isRTL ? "rtl" : "ltr";
  const row = isRTL ? "row-reverse" : "row";

  const paramWorkspaceId = workspaceId ? Number(workspaceId) : null;
  const activeWorkspaceId = workspaceAccess.activeWorkspaceId;
  // Route-param sync: when an edit screen is reached with an explicit
  // workspaceId that differs from the currently active context, switch the
  // active workspace first so the form is bound to THIS record — never a stale
  // cached snapshot from a previously edited property.
  const needsContextSwitch = paramWorkspaceId !== null && activeWorkspaceId !== null && Number.isInteger(paramWorkspaceId) && paramWorkspaceId > 0 && paramWorkspaceId !== activeWorkspaceId;
  const contextSwitching = needsContextSwitch || selectWorkspace.isPending;

  useEffect(() => {
    if (!needsContextSwitch) return;
    let cancelled = false;
    selectWorkspace.mutateAsync({ workspaceId: paramWorkspaceId! })
      .then(async () => { await utils.workspace.invalidate(); await workspaceAccess.refetchWorkspace(); })
      .catch(() => { if (!cancelled) Alert.alert(language === "ar" ? "تعذر فتح المنشأة" : "Could not open property", language === "ar" ? "لا تملك صلاحية الوصول إلى هذه المنشأة." : "You cannot access this property."); })
      .finally(() => { if (!cancelled) void triggerHaptic(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsContextSwitch]);

  useEffect(() => {
    if (!idCopied) return undefined;
    const id = setTimeout(() => setIdCopied(false), 1800);
    return () => clearTimeout(id);
  }, [idCopied]);

  const copyWorkspaceId = async () => {
    if (!workspaceId) return;
    try {
      await Clipboard.setStringAsync(`#${workspaceId}`);
      setIdCopied(true);
    } catch {
      // Best-effort: never block the UI if the clipboard is unavailable.
    }
  };

  const inputStyle: StyleProp<TextStyle> = [styles.input, { backgroundColor: colors.surfaceMuted, color: colors.foreground, textAlign: align, writingDirection: layoutDirection }];
  const sectionTitle = (value: string) => <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800", textAlign: align }}>{value}</Text>;
  const description = (value: string) => <Text style={{ color: colors.muted, marginTop: 5, fontSize: 12, lineHeight: 19, textAlign: align }}>{value}</Text>;

  const openUnitSummary = () => router.push("/chalet-management" as never);

  if (contextSwitching) {
    return <ScreenContainer edges={["top", "bottom", "left", "right"]}><View style={styles.switching}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.muted, marginTop: 10 }}>{language === "ar" ? "جارٍ تحميل بيانات المنشأة المطلوبة…" : "Loading the requested property data…"}</Text></View></ScreenContainer>;
  }

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={[styles.content, { direction: layoutDirection }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.headerWrap}><Text style={[styles.headerTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "بيانات المنشأة والوحدات" : "Property & units"}</Text></View>
      {description(`${language === "ar" ? "المنشأة النشطة" : "Active property"} · ${settings.businessName || settings.currency || "—"}`)}
      <View style={[styles.idHeaderBadge, { backgroundColor: colors.primary }]}><MaterialIcons name="pin" size={13} color="#FFFFFF" /><Text style={[styles.idHeaderBadgeText, { color: "#FFFFFF", textAlign: align }]}>{language === "ar" ? "رقم المنشأة: " : "Workspace ID: "}{workspaceId ? `#${workspaceId}` : "#—"}</Text></View>

      <Section title={language === "ar" ? "بيانات المنشأة" : "Property profile"} icon="badge" colors={colors} align={align} isRTL={isRTL}>
        <BusinessForm settings={settings} inputStyle={inputStyle} sectionTitle={sectionTitle} description={description} colors={colors} align={align} row={row} workspaceIdText={workspaceId ? `#${workspaceId}` : "#—"} idCopied={idCopied} onCopyId={() => void copyWorkspaceId()} onSaved={(message) => Alert.alert(language === "ar" ? "تم الحفظ" : "Saved", message)} />
      </Section>

      <Section title={language === "ar" ? "الوحدات والعقارات التابعة" : "Units & properties"} icon="home-work" colors={colors} align={align} isRTL={isRTL}>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: align }}>{language === "ar" ? `تضم هذه المنشأة ${chalets.length} وحدات.` : `This property contains ${chalets.length} units.`}</Text>
        <Pressable onPress={openUnitSummary} style={({ pressed }) => [styles.unitsAction, { backgroundColor: colors.primary, opacity: pressed ? 0.76 : 1, flexDirection: row }]}><MaterialIcons name="edit" size={18} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "800", paddingHorizontal: 6 }}>{language === "ar" ? "إدارة وتعديل الوحدات" : "Manage & edit units"}</Text></Pressable>
      </Section>

      <Section title={language === "ar" ? "إدارة طرق الدفع" : "Payment methods"} icon="payments" colors={colors} align={align} isRTL={isRTL}>
        <SettingsRow icon="account-balance-wallet" title={language === "ar" ? "طرق التحصيل وبيانات CliQ" : "Collection methods & CliQ data"} subtitle={language === "ar" ? "أضف أو عدّل أو أوقف طرق التحصيل وبيانات الحسابات لهذه المنشأة" : "Add, edit, pause collection methods and account data for this property"} onPress={() => router.push("/payment-methods" as never)} trailing={<SettingsValueBadge label={language === "ar" ? "إدارة" : "Manage"} />} />
      </Section>
    </ScrollView>
  </ScreenContainer>;
}

function BusinessForm({ settings, inputStyle, sectionTitle, description, colors, align, row, workspaceIdText, idCopied, onCopyId, onSaved }: { settings: Settings; inputStyle: StyleProp<TextStyle>; sectionTitle: (value: string) => React.ReactNode; description: (value: string) => React.ReactNode; colors: ReturnType<typeof useColors>; align: "left" | "right"; row: "row" | "row-reverse"; workspaceIdText: string; idCopied: boolean; onCopyId: () => void; onSaved: (message: string) => void }) {
  const { language } = useI18n();
  const { updateSettings } = useBookings();
  const { triggerHaptic } = useAppPreferences();
  const [name, setName] = useState(settings.businessName);
  const [phone, setPhone] = useState(settings.businessPhone);
  const [currency, setCurrency] = useState(settings.currency);
  const [logoUrl, setLogoUrl] = useState(settings.businessLogoUrl ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setName(settings.businessName); setPhone(settings.businessPhone); setCurrency(settings.currency); setLogoUrl(settings.businessLogoUrl ?? ""); }, [settings]);

  const save = async () => {
    if (!name.trim()) { onSaved(language === "ar" ? "اسم المنشأة مطلوب." : "Business name is required."); return; }
    if (!isValidBusinessLogoUrl(logoUrl)) { onSaved(language === "ar" ? "رابط شعار غير صالح — استخدم HTTPS أو اتركه فارغًا." : "Invalid logo URL — use HTTPS or leave empty."); return; }
    setSaving(true);
    try {
      await updateSettings({ ...settings, businessName: name.trim(), businessPhone: phone.trim(), currency: currency.trim() || settings.currency, businessLogoUrl: logoUrl.trim() || undefined });
      void triggerHaptic();
      onSaved(language === "ar" ? "تم حفظ بيانات المنشأة." : "Property profile saved.");
    } finally {
      setSaving(false);
    }
  };

  return <>
    <Field label={language === "ar" ? "رقم المنشأة التعريفي (ID)" : "Workspace reference ID"} labelView={sectionTitle}>
      <View style={[styles.idInputRow, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, flexDirection: row }]}>
        <TextInput value={workspaceIdText} editable={false} style={[styles.idInput, { color: colors.foreground, textAlign: align }]} />
        <Pressable onPress={onCopyId} hitSlop={6} style={({ pressed }) => [styles.idCopyBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1, flexDirection: row }]}><MaterialIcons name={idCopied ? "check" : "content-copy"} size={15} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>{idCopied ? (language === "ar" ? "تم" : "Copied") : (language === "ar" ? "نسخ" : "Copy")}</Text></Pressable>
      </View>
      {description(language === "ar" ? "الرقم المرجعي الثابت للمنشأة في النظام والعمليات المحاسبية." : "The property's permanent reference number in the system and accounting operations.")}
    </Field>
    <Field label={language === "ar" ? "اسم المنشأة" : "Business name"} labelView={sectionTitle}><TextInput value={name} onChangeText={setName} placeholderTextColor={colors.muted} style={inputStyle} /></Field>
    <Field label={language === "ar" ? "هاتف الإدارة" : "Management phone"} labelView={sectionTitle}><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07xxxxxxxx" placeholderTextColor={colors.muted} style={inputStyle} /></Field>
    <View style={[styles.dual, { flexDirection: row }]}>
      <View style={styles.flex}><Field label={language === "ar" ? "العملة الافتراضية" : "Default currency"} labelView={sectionTitle} compact><TextInput value={currency} onChangeText={setCurrency} placeholderTextColor={colors.muted} style={inputStyle} /></Field></View>
      <View style={styles.flex}><Field label={language === "ar" ? "رابط الشعار (اختياري)" : "Logo URL (optional)"} labelView={sectionTitle} compact><TextInput value={logoUrl} onChangeText={setLogoUrl} autoCapitalize="none" keyboardType="url" placeholder="https://..." placeholderTextColor={colors.muted} style={inputStyle} /></Field></View>
    </View>
    {description(language === "ar" ? "ملاحظة: هذه الإعدادات خاصة بهذه المنشأة وحدها." : "Note: these settings apply only to this property.")}
    <Pressable disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.save, { backgroundColor: colors.primary, opacity: saving ? 0.5 : pressed ? 0.76 : 1 }]}><Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{saving ? (language === "ar" ? "جارٍ الحفظ…" : "Saving…") : (language === "ar" ? "حفظ بيانات المنشأة" : "Save property profile")}</Text></Pressable>
  </>;
}

function Section({ title, icon, children, colors, align, isRTL }: { title: string; icon: IconName; children: React.ReactNode; colors: ReturnType<typeof useColors>; align: "left" | "right"; isRTL: boolean }) {
  return <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}><View style={[styles.iconBox, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name={icon} size={19} color={colors.primary} /></View><Text style={[styles.sectionTitleText, { color: colors.foreground, textAlign: align }]}>{title}</Text></View>{children}</View>;
}

function Field({ label, labelView, children, compact = false }: { label: string; labelView: (value: string) => React.ReactNode; children: React.ReactNode; compact?: boolean }) {
  return <View style={[styles.field, compact && styles.compactField]}>{labelView(label)}{children}</View>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 44 },
  switching: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  headerWrap: { marginBottom: 2 },
  headerTitle: { fontSize: 20, fontWeight: "900", lineHeight: 28 },
  section: { borderWidth: 1, borderRadius: 24, padding: 16, marginTop: 18 },
  sectionHeader: { alignItems: "center", gap: 9, marginBottom: 14 },
  sectionTitleText: { flex: 1, fontSize: 17, fontWeight: "900" },
  iconBox: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  field: { width: "100%", marginTop: 12 },
  compactField: { marginTop: 0 },
  flex: { flex: 1, minWidth: 0 },
  dual: { flexDirection: "row", gap: 10, marginTop: 14 },
  input: { width: "100%", minHeight: 48, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, marginTop: 8 },
  idHeaderBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 10 },
  idHeaderBadgeText: { fontSize: 13, fontWeight: "900", lineHeight: 18 },
  idInputRow: { minHeight: 48, borderRadius: 16, borderWidth: 1, marginTop: 8, paddingLeft: 12, paddingRight: 12, paddingVertical: 5, alignItems: "center", gap: 8 },
  idInput: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: "800" },
  idCopyBtn: { borderRadius: 11, gap: 5, alignItems: "center", justifyContent: "center", paddingHorizontal: 11, paddingVertical: 8 },
  save: { minHeight: 50, borderRadius: 16, marginTop: 16, alignItems: "center", justifyContent: "center" },
  unitsAction: { minHeight: 52, borderRadius: 15, alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 },
});
