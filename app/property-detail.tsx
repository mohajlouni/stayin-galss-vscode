import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { type ComponentProps, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { SettingsRow, SettingsSwitch, SettingsStepper, SettingsValueBadge } from "@/components/settings-row";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { effectiveUtilityTracking, isValidBusinessLogoUrl, propertyTypeIcon, type Chalet, type Settings, type UtilityRatesConfig } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { UTILITY_TYPES, utilityTypeIcon, utilityTypeLabel } from "@/lib/utility-readings";

type IconName = ComponentProps<typeof MaterialIcons>["name"];

export default function PropertyDetailScreen() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId?: string }>();
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { settings, chalets, updateSettings } = useBookings();
  const { triggerHaptic } = useAppPreferences();
  const align: "right" | "left" = isRTL ? "right" : "left";
  const layoutDirection: "rtl" | "ltr" = isRTL ? "rtl" : "ltr";
  const row = isRTL ? "row-reverse" : "row";

  const utilityConfig = effectiveUtilityTracking(settings);
  const inputStyle: StyleProp<TextStyle> = [styles.input, { backgroundColor: colors.surfaceMuted, color: colors.foreground, textAlign: align, writingDirection: layoutDirection }];
  const sectionTitle = (value: string) => <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800", textAlign: align }}>{value}</Text>;
  const description = (value: string) => <Text style={{ color: colors.muted, marginTop: 5, fontSize: 12, lineHeight: 19, textAlign: align }}>{value}</Text>;

  const saveConfig = async (patch: Partial<Settings>) => {
    await updateSettings({ ...settings, ...patch });
    void triggerHaptic();
  };
  const saveUtility = (patch: Partial<UtilityRatesConfig>) => saveConfig({ utilityTracking: { ...utilityConfig, ...patch } });

  const openUnit = (chalet?: Chalet) => router.push(chalet ? { pathname: "/chalet-profile", params: { id: chalet.id } } as never : "/chalet-profile?mode=add" as never);

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={[styles.content, { direction: layoutDirection }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.headerWrap}><Text style={[styles.headerTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "بيانات المنشأة والوحدات" : "Property & units"}</Text></View>
      {description(`${language === "ar" ? "المنشأة النشطة" : "Active property"} · ${settings.businessName || settings.currency || "—"}${workspaceId ? ` (${language === "ar" ? "معرّف" : "id"}: ${workspaceId})` : ""}`)}

      <Section title={language === "ar" ? "بيانات المنشأة" : "Property profile"} icon="badge" colors={colors} align={align} isRTL={isRTL}>
        <BusinessForm settings={settings} inputStyle={inputStyle} sectionTitle={sectionTitle} description={description} colors={colors} align={align} row={row} onSaved={(message) => Alert.alert(language === "ar" ? "تم الحفظ" : "Saved", message)} />
      </Section>

      <Section title={language === "ar" ? "إدارة الوحدات والشاليهات" : "Units management"} icon="home-work" colors={colors} align={align} isRTL={isRTL}>
        <Text style={{ color: colors.muted, marginBottom: 12, fontSize: 12, lineHeight: 19, textAlign: align }}>{language === "ar" ? "الوحدات التابعة لهذه المنشأة فقط" : "Units belonging strictly to this property"}</Text>
        <Pressable onPress={() => openUnit()} style={({ pressed }) => [styles.addUnit, { backgroundColor: colors.primary, opacity: pressed ? 0.76 : 1, flexDirection: row }]}><MaterialIcons name="add" size={20} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{language === "ar" ? "إضافة وحدة / شاليه جديد" : "Add new unit / chalet"}</Text></Pressable>
        {chalets.length ? chalets.map((chalet) => <UnitRow key={chalet.id} chalet={chalet} colors={colors} language={language} align={align} row={row} onPress={() => openUnit(chalet)} />) : <View style={[styles.emptyUnits, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="home-work" size={24} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, marginTop: 8, textAlign: "center" }}>{language === "ar" ? "لا توجد وحدات بعد — أضف أول وحدة لهذه المنشأة." : "No units yet — add the first one for this property."}</Text></View>}
      </Section>

      <Section title={language === "ar" ? "إدارة طرق الدفع" : "Payment methods"} icon="payments" colors={colors} align={align} isRTL={isRTL}>
        <SettingsRow icon="account-balance-wallet" title={language === "ar" ? "طرق التحصيل وبيانات CliQ" : "Collection methods & CliQ data"} subtitle={language === "ar" ? "أضف أو عدّل أو أوقف طرق التحصيل وبيانات الحسابات لهذه المنشأة" : "Add, edit, pause collection methods and account data for this property"} onPress={() => router.push("/payment-methods" as never)} trailing={<SettingsValueBadge label={language === "ar" ? "إدارة" : "Manage"} />} />
      </Section>

      <Section title={language === "ar" ? "إعدادات الطاقة والعدادات" : "Utility rates & meters"} icon="bolt" colors={colors} align={align} isRTL={isRTL}>
        <SettingsSwitch icon="bolt" label={language === "ar" ? "تتبع استهلاك العدادات" : "Track meter consumption"} description={language === "ar" ? "تسجيل قراءات الدخول والخروج أثناء التسليم والاستلام وتكلفة الاستهلاك" : "Record check-in/out readings during delivery & checkout and bill consumption"} value={utilityConfig.enabled} onChange={(enabled) => void saveUtility({ enabled })} />
        {UTILITY_TYPES.map((type) => (
          <View key={type}>
            <SettingsRow
              icon={utilityTypeIcon(type)}
              title={utilityTypeLabel(type, language)}
              subtitle={language === "ar" ? "السعر لكل وحدة وسقف الاستهلاك" : "Unit rate & consumption cap"}
              disabled={!utilityConfig.enabled}
              trailing={<View style={styles.stepperColumn}>
                <SettingsStepper value={utilityConfig.rates[type] ?? 0} min={0} max={100} step={0.01} disabled={!utilityConfig.enabled} onChange={(rate) => void saveUtility({ rates: { ...utilityConfig.rates, [type]: rate } })} formatValue={(value) => `${value} ${settings.currency}`} />
                <SettingsStepper value={utilityConfig.thresholds[type] ?? 0} min={0} max={2000} step={10} disabled={!utilityConfig.enabled} onChange={(threshold) => void saveUtility({ thresholds: { ...utilityConfig.thresholds, [type]: threshold } })} formatValue={(value) => `${language === "ar" ? "حد" : "cap"} ${value}`} />
              </View>}
            />
            {description(language === "ar" ? `تنبيه الاستهلاك الزائد: القراءة تتجاوز ${utilityConfig.thresholds[type] ?? 0}` : `Excess alert: reading exceeds ${utilityConfig.thresholds[type] ?? 0}`)}
          </View>
        ))}
      </Section>
    </ScrollView>
  </ScreenContainer>;
}

function BusinessForm({ settings, inputStyle, sectionTitle, description, colors, align, row, onSaved }: { settings: Settings; inputStyle: StyleProp<TextStyle>; sectionTitle: (value: string) => React.ReactNode; description: (value: string) => React.ReactNode; colors: ReturnType<typeof useColors>; align: "left" | "right"; row: "row" | "row-reverse"; onSaved: (message: string) => void }) {
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

function UnitRow({ chalet, colors, language, align, row, onPress }: { chalet: Chalet; colors: ReturnType<typeof useColors>; language: "ar" | "en"; align: "left" | "right"; row: "row" | "row-reverse"; onPress: () => void }) {
  const typeIcon = propertyTypeIcon(chalet.propertyType);
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.unitRow, { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.72 : 1, flexDirection: row }]}>
    <View style={[styles.unitIcon, { backgroundColor: chalet.color + "1F" }]}><MaterialIcons name={typeIcon} size={18} color={chalet.color} /></View>
    <View style={styles.flex}><Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: "800", fontSize: 14, textAlign: align }}>{chalet.name}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{chalet.location || (language === "ar" ? "بلا موقع" : "No location")}</Text></View>
    <MaterialIcons name={language === "ar" ? "chevron-left" : "chevron-right"} size={22} color={colors.muted} />
  </Pressable>;
}

function Section({ title, icon, children, colors, align, isRTL }: { title: string; icon: IconName; children: React.ReactNode; colors: ReturnType<typeof useColors>; align: "left" | "right"; isRTL: boolean }) {
  return <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}><View style={[styles.iconBox, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name={icon} size={19} color={colors.primary} /></View><Text style={[styles.sectionTitleText, { color: colors.foreground, textAlign: align }]}>{title}</Text></View>{children}</View>;
}

function Field({ label, labelView, children, compact = false }: { label: string; labelView: (value: string) => React.ReactNode; children: React.ReactNode; compact?: boolean }) {
  return <View style={[styles.field, compact && styles.compactField]}>{labelView(label)}{children}</View>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 44 },
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
  stepperColumn: { alignItems: "flex-end", gap: 6 },
  save: { minHeight: 50, borderRadius: 16, marginTop: 16, alignItems: "center", justifyContent: "center" },
  addUnit: { minHeight: 52, borderRadius: 15, alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 12 },
  emptyUnits: { minHeight: 96, borderRadius: 16, alignItems: "center", justifyContent: "center", padding: 14 },
  unitRow: { minHeight: 62, alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 15, padding: 10, marginTop: 8 },
  unitIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
