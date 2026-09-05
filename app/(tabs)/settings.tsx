import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import Constants from "expo-constants";
import { type ComponentProps, useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator, type StyleProp, type TextStyle } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { ThemedText } from "@/components/themed-text";
import { AppToggle } from "@/components/app-toggle";
import { SettingsRow, SettingsSwitch, SettingsStepper, SettingsValueBadge } from "@/components/settings-row";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { getApiBaseUrl } from "@/constants/oauth";
import { DEFAULT_WHATSAPP_DISCLAIMER, DEFAULT_WHATSAPP_MESSAGE_OPTIONS, effectiveContractPolicy, effectiveHolidayPricing, effectiveLoyaltyProgram, effectiveWeatherAdvisory, type ContractPolicyConfig, type HolidayPricingConfig, type LoyaltyProgramConfig, type Settings, type WeatherAdvisoryConfig, type WhatsAppMessageOptions } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { useGlobalFeatureFlags, useWorkspaceFeatureFlags } from "@/lib/feature-flags";

type IconName = ComponentProps<typeof MaterialIcons>["name"];

const WHATSAPP_OPTIONS = [
  { key: "includeGuestAndChalet", ar: "الضيف والشاليه", en: "Guest & chalet" },
  { key: "includeSchedule", ar: "الموعد", en: "Schedule" },
  { key: "includeFinancials", ar: "المبالغ", en: "Financials" },
  { key: "includeLocation", ar: "الموقع", en: "Location" },
  { key: "includeContacts", ar: "جهات الاتصال", en: "Contacts" },
] as const;

const DAY_FORMATS = [
  { value: "ar-short", labelAr: "سب · أح · إث", labelEn: "Arabic short" },
  { value: "ar-letter", labelAr: "س · ح · ن", labelEn: "Arabic initials" },
  { value: "en-short", labelAr: "Sat · Sun · Mon", labelEn: "Sat · Sun · Mon" },
  { value: "en-letter", labelAr: "S · S · M", labelEn: "S · S · M" },
] as const;

const SUPER_ADMIN_PHONE = "0797402940";

export default function SettingsScreen() {
  const { settings, updateSettings, exportBackup, openBackupForPreview } = useBookings();
  const { isRTL, language } = useI18n();
  const { deviceSettings, deviceLanguage, deviceTimezone, formatDate, formatTime, updateDeviceSettings, triggerHaptic, languageChangeStatus, acknowledgeLanguageChange, restartApp } = useAppPreferences();
  const { isManager, activeWorkspaceId } = useWorkspaceAccess();
  const globalFlags = useGlobalFeatureFlags();
  const featureFlags = useWorkspaceFeatureFlags(activeWorkspaceId);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const loadDemoData = async () => {
    setLoadingDemo(true);
    try {
      await fetch(`${getApiBaseUrl()}/api/dev/seed`, { method: "POST" });
      Alert.alert(language === "ar" ? "تم تحميل البيانات التجريبية" : "Demo data loaded", language === "ar" ? "تم إنشاء حجوزات وشاليهات وبيانات تقارير تجريبية واقعية" : "Realistic demo bookings, chalets, and report data created");
    } catch {
      Alert.alert(language === "ar" ? "تعذر تحميل البيانات" : "Failed to load demo data", language === "ar" ? "تأكد من تشغيل الخادم على المنفذ 3000" : "Make sure the server is running on port 3000");
    } finally {
      setLoadingDemo(false);
    }
  };
  const colors = useColors();
  const align: "right" | "left" = isRTL ? "right" : "left";
  const layoutDirection: "rtl" | "ltr" = isRTL ? "rtl" : "ltr";
  const row = isRTL ? "row-reverse" : "row";

  const [whatsAppEnabled, setWhatsAppEnabled] = useState(settings.whatsAppEnabled ?? false);
  const [ownerPhone, setOwnerPhone] = useState(settings.ownerPhone ?? "");
  const [enableDisclaimer, setEnableDisclaimer] = useState(settings.enableDisclaimer ?? true);
  const [disclaimerText, setDisclaimerText] = useState(settings.disclaimerText ?? DEFAULT_WHATSAPP_DISCLAIMER);
  const [whatsAppOptions, setWhatsAppOptions] = useState<WhatsAppMessageOptions>({ ...DEFAULT_WHATSAPP_MESSAGE_OPTIONS, ...(settings.whatsAppOptions ?? {}) });
  const [timezone, setTimezone] = useState(deviceSettings.timezone || deviceTimezone);

  useEffect(() => {
    setWhatsAppEnabled(settings.whatsAppEnabled ?? false);
    setOwnerPhone(settings.ownerPhone ?? "");
    setEnableDisclaimer(settings.enableDisclaimer ?? true);
    setDisclaimerText(settings.disclaimerText ?? DEFAULT_WHATSAPP_DISCLAIMER);
    setWhatsAppOptions({ ...DEFAULT_WHATSAPP_MESSAGE_OPTIONS, ...(settings.whatsAppOptions ?? {}) });
  }, [settings]);
  useEffect(() => setTimezone(deviceSettings.timezone || deviceTimezone), [deviceSettings.timezone, deviceTimezone]);

  const inputStyle: StyleProp<TextStyle> = [styles.input, { backgroundColor: colors.surfaceMuted, color: colors.foreground, textAlign: align, writingDirection: layoutDirection }];
  const sectionTitle = (value: string) => <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800", textAlign: align }}>{value}</Text>;
  const description = (value: string) => <Text style={{ color: colors.muted, marginTop: 5, fontSize: 12, lineHeight: 19, textAlign: align }}>{value}</Text>;
  const guestCheckInModeHistory = deviceSettings.guestCheckInModeHistory;
  const formatModeChangeTime = (changedAt: string) => {
    const change = new Date(changedAt);
    if (Number.isNaN(change.getTime())) return "—";
    const date = `${change.getFullYear()}-${String(change.getMonth() + 1).padStart(2, "0")}-${String(change.getDate()).padStart(2, "0")}`;
    const time = `${String(change.getHours()).padStart(2, "0")}:${String(change.getMinutes()).padStart(2, "0")}`;
    return `${formatDate(date)} · ${formatTime(time)}`;
  };

  const changeNotifications = async (enabled: boolean) => {
    if (enabled && Platform.OS !== "web") {
      const { requestCheckoutNotificationPermission } = await import("@/lib/checkout-notifications");
      const granted = await requestCheckoutNotificationPermission();
      if (!granted) {
        Alert.alert(language === "ar" ? "لم يتم منح الإذن" : "Permission not granted");
        return;
      }
    }
    await updateDeviceSettings({ notificationsEnabled: enabled });
  };

  const updateMessageOption = (key: keyof WhatsAppMessageOptions, value: boolean) => setWhatsAppOptions((current) => ({ ...current, [key]: value }));

  const loyaltyConfig = effectiveLoyaltyProgram(settings);
  const holidayConfig = effectiveHolidayPricing(settings);
  const contractConfig = effectiveContractPolicy(settings);
  const weatherConfig = effectiveWeatherAdvisory(settings);
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const configLocked = !isManager;
  const lunarPhaseEnabled = globalFlags.feat_lunar_calendar;
  const weatherFlowEnabled = globalFlags.feat_automation_weather;
  const guestCheckInEnabled = globalFlags.feat_guest_checkin;
  const cleaningFlowEnabled = globalFlags.feat_cleaning_inspection;
  const contractsEnabled = globalFlags.feat_digital_contracts;
  const whatsappIntegrationEnabled = globalFlags.feat_whatsapp_integration;
  const crmEnabled = globalFlags.feat_customers_blacklist && globalFlags.feat_loyalty_suite;
  const loyaltyFlowEnabled = featureFlags.loyalty;
  const notificationsFlowEnabled = featureFlags.notifications;

  const saveConfig = async (patch: Partial<Settings>) => {
    await updateSettings({ ...settings, ...patch });
    void triggerHaptic();
  };
  const saveLoyalty = (patch: Partial<LoyaltyProgramConfig>) => saveConfig({ loyaltyProgram: { ...loyaltyConfig, ...patch } });
  const saveHoliday = (patch: Partial<HolidayPricingConfig>) => saveConfig({ holidayPricing: { ...holidayConfig, ...patch } });
  const saveContract = (patch: Partial<ContractPolicyConfig>) => saveConfig({ contractPolicy: { ...contractConfig, ...patch } });
  const saveWeather = (patch: Partial<WeatherAdvisoryConfig>) => saveConfig({ weatherAdvisory: { ...weatherConfig, ...patch } });

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={[styles.content, { direction: layoutDirection }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <SubScreenHeader title={language === "ar" ? "الإعدادات" : "Settings"} />

        <Section title={language === "ar" ? "المنشأة والوحدات" : "Chalet & property"} icon="business" colors={colors} align={align} isRTL={isRTL}>
          <View style={[styles.currentCard, { backgroundColor: colors.primary + "0F", borderColor: colors.primary + "44" }]}>
            <View style={[styles.currentIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="holiday-village" size={20} color={colors.primary} /></View>
            <View style={styles.flex}>
              <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", textAlign: align }}>{language === "ar" ? "المنشأة الحالية" : "Current property"}</Text>
              <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", marginTop: 3, textAlign: align }}>{settings.businessName || (language === "ar" ? "منشأة بدون اسم" : "Unnamed property")}</Text>
            </View>
          </View>
          <Pressable onPress={() => router.push(activeWorkspaceId ? (`/property-detail?workspaceId=${activeWorkspaceId}` as never) : ("/properties-hub" as never))} style={({ pressed }) => [styles.manageButton, { backgroundColor: colors.primary, opacity: pressed ? 0.76 : 1, flexDirection: row }]}>
            <MaterialIcons name="edit-location-alt" size={20} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{language === "ar" ? "إدارة وحدات وبيانات المنشأة" : "Manage property units & profile"}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/properties-hub" as never)} style={({ pressed }) => [styles.hubLink, { flexDirection: row, opacity: pressed ? 0.7 : 1 }]}>
            <MaterialIcons name="business" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "إدارة منشآتي وتبديل المنشأة" : "Manage my properties / switch property"}</Text>
          </Pressable>
        </Section>

        <Section title={language === "ar" ? "التقويم والتسعير الذكي" : "Calendar & smart pricing"} icon="calendar-month" colors={colors} align={align} isRTL={isRTL}>
          {sectionTitle(language === "ar" ? "تفضيلات العرض والتقويم" : "Display & calendar preferences")}
          {sectionTitle(language === "ar" ? "تنسيق أسماء أيام الأسبوع" : "Weekday label format")}
          <View style={[styles.choiceWrap, { flexDirection: row }]}>{DAY_FORMATS.map((choice) => <Choice key={choice.value} compact label={language === "ar" ? choice.labelAr : choice.labelEn} selected={deviceSettings.weekdayFormat === choice.value} onPress={() => void updateDeviceSettings({ weekdayFormat: choice.value })} colors={colors} />)}</View>
          {description(language === "ar" ? "كيف تظهر أسماء الأيام أعلى شبكة التقويم مع محاذاة ثابتة للأعمدة السبعة." : "How weekday names appear above the calendar grid with fixed seven-column alignment.")}

          <View style={styles.divider} />

          {sectionTitle(language === "ar" ? "التنسيق العام" : "General format")}
          <View style={[styles.choiceRow, { flexDirection: row }]}><Choice label="12h" selected={deviceSettings.timeFormat === "12h"} onPress={() => void updateDeviceSettings({ timeFormat: "12h" })} colors={colors} /><Choice label="24h" selected={deviceSettings.timeFormat === "24h"} onPress={() => void updateDeviceSettings({ timeFormat: "24h" })} colors={colors} /></View>
          <View style={[styles.choiceWrap, { flexDirection: row }]}>{([{ value: "DD/MM/YYYY", label: "18/08/2026" }, { value: "YYYY-MM-DD", label: "2026-08-18" }, { value: "english-month", label: "18 August 2026" }, { value: "arabic-gregorian", label: language === "ar" ? "18 أغسطس 2026" : "18 August 2026" }] as const).map((choice) => <Choice key={choice.value} label={choice.label} selected={deviceSettings.dateFormat === choice.value} onPress={() => void updateDeviceSettings({ dateFormat: choice.value })} colors={colors} />)}</View>
          <SettingsSwitch icon="calendar-view-day" label={language === "ar" ? "إظهار التاريخ الهجري" : "Show Hijri date"} value={deviceSettings.showHijriDate} onChange={(value) => void updateDeviceSettings({ showHijriDate: value })} />
          {lunarPhaseEnabled ? <SettingsSwitch icon="nightlight" label={language === "ar" ? "لوحة القمر والتقويم الهجري" : "Lunar phase & Hijri panel"} description={language === "ar" ? "يعرض طور القمر والتقويم الهجري ضمن بطاقة الرأس في الرئيسية" : "Shows the lunar phase and Hijri date inside the top widget on Home"} value={deviceSettings.showLunarPhase} onChange={(value) => void updateDeviceSettings({ showLunarPhase: value })} /> : null}
          <Field label={language === "ar" ? "المنطقة الزمنية" : "Timezone"} labelView={sectionTitle}><TextInput value={timezone} onChangeText={setTimezone} autoCapitalize="none" onEndEditing={() => void updateDeviceSettings({ timezone: timezone.trim() || deviceTimezone })} placeholderTextColor={colors.muted} style={inputStyle} />{description(`${language === "ar" ? "منطقة الجهاز" : "Device timezone"}: ${deviceTimezone}`)}</Field>

          <View style={styles.divider} />

          {sectionTitle(language === "ar" ? "محرك العطل والتسعير التلقائي" : "Jordanian holidays & dynamic pricing")}
          <SettingsSwitch disabled={configLocked} icon="celebration" label={language === "ar" ? "تسعير تلقائي للعطل الرسمية" : "Auto-pricing on official holidays"} description={language === "ar" ? "يرفع السعر في العطل الأردنية (عيد الفطر، الأضحى، الاستقلال...) ما لم يُحدد سعر خاص" : "Raises the rate on Jordanian holidays unless a special price rule applies"} value={holidayConfig.enabled} onChange={(enabled) => void saveHoliday({ enabled })} />
          {holidayConfig.enabled ? <SettingsRow icon="percent" title={language === "ar" ? "نسبة الزيادة على العطل" : "Holiday uplift"} disabled={configLocked} trailing={<SettingsStepper value={holidayConfig.upliftPercent} min={0} max={200} step={5} disabled={configLocked} onChange={(upliftPercent) => void saveHoliday({ upliftPercent })} formatValue={(value) => `+${value}%`} />} /> : null}
        </Section>

        {contractsEnabled ? <Section title={language === "ar" ? "العقود الإلكترونية والتأمين" : "Digital contracts & deposits"} icon="description" colors={colors} align={align} isRTL={isRTL}>
          {sectionTitle(language === "ar" ? "التواصل وعقد الإقامة" : "Messaging & stay contract")}
          <SettingsSwitch disabled={configLocked} icon="draw" label={language === "ar" ? "إلزامية التوقيع الإلكتروني" : "Require digital signature"} description={language === "ar" ? "فرض التوقيع على عقد الإقامة قبل تسليم الشاليه أو جعله اختيارياً" : "Require the stay contract signature before handover, or keep it optional"} value={contractConfig.requireSignature} onChange={(requireSignature) => void saveContract({ requireSignature })} />
          <SettingsRow icon="safety-divider" title={language === "ar" ? "التأمين النقدي الافتراضي" : "Default security deposit"} subtitle={language === "ar" ? "قيمة الإيداع المبدئية لكل شاليه (يمكن تعديلها لكل وحدة)" : "Initial deposit per chalet (adjustable per unit)"} disabled={configLocked} trailing={<SettingsStepper value={contractConfig.defaultDepositAmount} min={0} max={500} step={5} disabled={configLocked} onChange={(defaultDepositAmount) => void saveContract({ defaultDepositAmount })} formatValue={(value) => `${value} ${settings.currency}`} />} />
          <SettingsSwitch icon="article" label={language === "ar" ? "إظهار عقد الإقامة" : "Show stay contract"} description={language === "ar" ? "يعرض ملخص العقد وشروطه ضمن واتساب" : "Shows contract summary and terms in WhatsApp"} value={deviceSettings.showStayContract} onChange={(value) => void updateDeviceSettings({ showStayContract: value })} />
          <SettingsSwitch icon="quickreply" label={language === "ar" ? "إظهار الرسائل الجاهزة" : "Show ready messages"} description={language === "ar" ? "يعرض خيارات الرسائل في تفاصيل الحجز" : "Shows message options in booking details"} value={deviceSettings.showReadyMessages} onChange={(value) => void updateDeviceSettings({ showReadyMessages: value })} />
          {whatsappIntegrationEnabled ? <SettingsRow icon="edit-note" title={language === "ar" ? "قوالب رسائل الواتساب" : "WhatsApp message templates"} subtitle={language === "ar" ? "تحرير نصوص التأكيد والموقع والتقييم والتعليمات" : "Edit confirmation, location, rating, and instructions texts"} onPress={() => router.push("/whatsapp-templates" as never)} trailing={<SettingsValueBadge label={language === "ar" ? "تحرير" : "Edit"} />} /> : null}

          <View style={styles.divider} />

          {whatsappIntegrationEnabled ? (<>
          {sectionTitle(language === "ar" ? "إعدادات واتساب" : "WhatsApp")}
          <SettingsSwitch icon="chat" label={language === "ar" ? "إرسال الرسائل عبر واتساب" : "Send messages over WhatsApp"} description={language === "ar" ? "تحويل رسائل التأكيد والوصول والتقييم إلى روابط واتساب للعميل" : "Converts confirmations, arrivals, and rating messages into WhatsApp links"} value={whatsAppEnabled} onChange={setWhatsAppEnabled} />
          {whatsAppEnabled ? (<>
            <Field label={language === "ar" ? "رقم المالك للواتساب" : "Owner WhatsApp number"} labelView={sectionTitle}><TextInput value={ownerPhone} onChangeText={setOwnerPhone} keyboardType="phone-pad" placeholder="079xxxxxxxx" placeholderTextColor={colors.muted} style={inputStyle} /></Field>
            <SettingsSwitch icon="campaign" label={language === "ar" ? "إرفاق إخلاء المسؤولية" : "Attach a disclaimer"} value={enableDisclaimer} onChange={setEnableDisclaimer} />
            {enableDisclaimer ? <Field label={language === "ar" ? "نص إخلاء المسؤولية" : "Disclaimer text"} labelView={sectionTitle}><TextInput value={disclaimerText} onChangeText={setDisclaimerText} multiline maxLength={320} placeholderTextColor={colors.muted} textAlignVertical="top" style={[inputStyle, { minHeight: 76 }]} /></Field> : null}
            {sectionTitle(language === "ar" ? "محتويات الرسالة" : "Message contents")}
            {WHATSAPP_OPTIONS.map((option) => <SettingsSwitch key={option.key} icon="info-outline" label={language === "ar" ? option.ar : option.en} value={whatsAppOptions[option.key as keyof WhatsAppMessageOptions] ?? false} onChange={(value) => updateMessageOption(option.key as keyof WhatsAppMessageOptions, value)} />)}
          </>) : null}
          </>) : null}
        </Section> : null}

        {crmEnabled || loyaltyFlowEnabled ? <Section title={language === "ar" ? "العملاء وبرنامج الولاء" : "CRM & loyalty rewards"} icon="workspace-premium" colors={colors} align={align} isRTL={isRTL}>
          {crmEnabled ? <SettingsRow icon="group" title={language === "ar" ? "قاعدة العملاء والقائمة السوداء" : "Customers & blacklist directory"} subtitle={language === "ar" ? "استعراض العملاء والطبقات وحظر/إلغاء حظر العملاء" : "Browse customers, tiers, and manually blacklist/unblacklist"} onPress={() => router.push("/(tabs)/crm" as never)} trailing={<MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={colors.primary} />} /> : null}

          {loyaltyFlowEnabled ? (<>
          <View style={styles.divider} />

          {sectionTitle(language === "ar" ? "نظام النقاط والكاش باك" : "Loyalty points & cashback")}
          <SettingsSwitch disabled={configLocked} icon="stars" label={language === "ar" ? "تفعيل نظام النقاط والكاش باك" : "Enable points & cashback program"} description={language === "ar" ? "اكتساب نقاط عند إتمام الإقامة واستردادها على الحجوزات" : "Earn points on completed stays and redeem them on bookings"} value={loyaltyConfig.enabled} onChange={(enabled) => void saveLoyalty({ enabled })} />
          <SettingsRow icon="looks-one" title={language === "ar" ? "نقاط لكل مبلغ" : "Points per amount"} subtitle={language === "ar" ? `نقطة لكل ${loyaltyConfig.pointsPerJod} د.أ من قيمة الإقامة` : `1 point per ${loyaltyConfig.pointsPerJod} JOD of stay value`} disabled={configLocked || !loyaltyConfig.enabled} trailing={<SettingsStepper value={loyaltyConfig.pointsPerJod} min={1} max={100} step={1} disabled={configLocked || !loyaltyConfig.enabled} onChange={(pointsPerJod) => void saveLoyalty({ pointsPerJod })} formatValue={(value) => `${value} د.أ`} />} />
          <SettingsRow icon="payments" title={language === "ar" ? "القيمة النقدية للنقطة" : "Point cashback value"} subtitle={language === "ar" ? `مثل: ${loyaltyConfig.jodPerPoint} د.أ خصم لكل نقطة عند الاستبدال` : `e.g. ${loyaltyConfig.jodPerPoint} JOD discount per redeemed point`} disabled={configLocked || !loyaltyConfig.enabled} trailing={<SettingsStepper value={loyaltyConfig.jodPerPoint} min={0.005} max={2} step={0.005} disabled={configLocked || !loyaltyConfig.enabled} onChange={(jodPerPoint) => void saveLoyalty({ jodPerPoint })} formatValue={(value) => `${value} د.أ`} />} />

          <View style={styles.divider} />

          {sectionTitle(language === "ar" ? "شروط الترقية للمستويات" : "Tier upgrade thresholds")}
          <View style={styles.thresholdRow}>
            <SettingsStepper value={loyaltyConfig.silverMinStays} min={0} max={50} step={1} disabled={configLocked || !loyaltyConfig.enabled} onChange={(silverMinStays) => void saveLoyalty({ silverMinStays })} />
            <SettingsValueBadge label={language === "ar" ? "فضي: إقامات" : "Silver stays"} />
            <SettingsStepper value={loyaltyConfig.silverMinSpendJod} min={0} max={5000} step={50} disabled={configLocked || !loyaltyConfig.enabled} onChange={(silverMinSpendJod) => void saveLoyalty({ silverMinSpendJod })} />
            <SettingsValueBadge label={language === "ar" ? "أو إنفاق" : "or spend"} />
          </View>
          <View style={styles.thresholdRow}>
            <SettingsStepper value={loyaltyConfig.goldMinStays} min={0} max={100} step={1} disabled={configLocked || !loyaltyConfig.enabled} onChange={(goldMinStays) => void saveLoyalty({ goldMinStays })} />
            <SettingsValueBadge label={language === "ar" ? "ذهبي: إقامات" : "Gold stays"} />
            <SettingsStepper value={loyaltyConfig.goldMinSpendJod} min={0} max={10000} step={50} disabled={configLocked || !loyaltyConfig.enabled} onChange={(goldMinSpendJod) => void saveLoyalty({ goldMinSpendJod })} />
            <SettingsValueBadge label={language === "ar" ? "أو إنفاق" : "or spend"} />
          </View>
          <View style={styles.thresholdRow}>
            <SettingsStepper value={loyaltyConfig.platinumMinStays} min={0} max={150} step={1} disabled={configLocked || !loyaltyConfig.enabled} onChange={(platinumMinStays) => void saveLoyalty({ platinumMinStays })} />
            <SettingsValueBadge label={language === "ar" ? "بلاتيني: إقامات" : "Platinum stays"} />
          </View>
          </>) : null}
        </Section> : null}

        <Section title={language === "ar" ? "الأتمتة والطقس والإشعارات" : "Automation, weather & alerts"} icon="bolt" colors={colors} align={align} isRTL={isRTL}>
          {weatherFlowEnabled ? <SettingsSwitch disabled={configLocked} icon="wb-cloudy" label={language === "ar" ? "تنبيهات الطقس الاستباقية" : "Proactive weather alerts"} description={language === "ar" ? "تشغيل/إيقاف مستشار الطقس وتدفئة المسبح بالكامل" : "Turn the weather & pool-heating advisor on/off entirely"} value={weatherConfig.enabled} onChange={(enabled) => void saveWeather({ enabled })} /> : null}
          <SettingsRow icon="thermostat" title={language === "ar" ? "درجة الحرارة الحرجة للتدفئة" : "Critical heating temperature"} subtitle={language === "ar" ? "تنبيه تدفئة المسبح عندما تدني الليل عن هذه الدرجة" : "Pool heating alert when overnight lows drop below this"} disabled={configLocked || !weatherConfig.enabled} trailing={<SettingsStepper value={weatherConfig.coldPoolThresholdC} min={0} max={40} step={1} disabled={configLocked || !weatherConfig.enabled} onChange={(coldPoolThresholdC) => void saveWeather({ coldPoolThresholdC })} formatValue={(value) => `< ${value}°C`} />} />
          <SettingsRow icon="notifications-active" title={language === "ar" ? "مستقبلو التنبيهات حسب الدور" : "Alert recipients by role"} disabled={configLocked || !weatherConfig.enabled} trailing={<View style={[styles.choiceWrap, { flexDirection: row }]}>
            {(["owner", "manager", "guard"] as const).map((role) => <Choice key={role} compact label={role === "owner" ? (language === "ar" ? "مالك" : "Owner") : role === "manager" ? (language === "ar" ? "مدير" : "Manager") : (language === "ar" ? "حارس" : "Guard")} selected={weatherConfig.recipients[role]} disabled={configLocked || !weatherConfig.enabled} onPress={() => void saveWeather({ recipients: { ...weatherConfig.recipients, [role]: !weatherConfig.recipients[role] } })} colors={colors} />)}
          </View>} />
          <SettingsRow icon="alarm" title={language === "ar" ? "تذكير الحارس قبل الحدث" : "Guard reminder lead time"} subtitle={language === "ar" ? "كم دقيقة قبل الوصول/المغادرة يُتذكر الحارس (متوسط: ساعتان)" : "Minutes before arrival/checkout a guard reminder fires (avg: 2h)"} trailing={<SettingsStepper value={deviceSettings.guardReminderLeadMinutes} min={30} max={720} step={30} onChange={(guardReminderLeadMinutes) => void updateDeviceSettings({ guardReminderLeadMinutes })} formatValue={(value) => `${Math.round(value / 60 * 10) / 10} ${language === "ar" ? "ساعة" : "h"}`} />} />
          {notificationsFlowEnabled ? <View style={[styles.choiceRow, { flexDirection: row, justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }]}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700", flex: 1, textAlign: align }}>{language === "ar" ? "الإشعارات المحلية" : "Local notifications"}</Text><AppToggle value={deviceSettings.notificationsEnabled} onValueChange={(value) => void changeNotifications(value)} isRTL={isRTL} activeColor={colors.primary} inactiveColor={colors.border} accessibilityLabel={language === "ar" ? "الإشعارات المحلية" : "Local notifications"} /></View> : null}

          <View style={styles.divider} />

          {sectionTitle(language === "ar" ? "التحكم التشغيلي" : "Operational controls")}
          {guestCheckInEnabled ? <SettingsSwitch icon="touch-app" label={language === "ar" ? "إظهار تسجيل وصول الضيف" : "Show guest check-in"} description={language === "ar" ? "عند الإيقاف تُتبع الحجوزات زمنيًا وتلقائيًا دون تسجيل وصول/مغادرة يدوي" : "When off, bookings are tracked automatically by time without manual arrival or checkout"} value={deviceSettings.showGuestCheckIn} onChange={(value) => void updateDeviceSettings({ showGuestCheckIn: value })} /> : null}
          {guestCheckInEnabled ? <View style={{ marginTop: 10, borderRadius: 18, padding: 11, gap: 7, backgroundColor: colors.surfaceMuted }}>
            <View style={{ flexDirection: row, alignItems: "center", gap: 7 }}><MaterialIcons name="history" size={17} color={colors.primary} /><Text style={[styles.flex, { color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "سجل وضع الوصول" : "Arrival mode history"}</Text></View>
            <Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: align }}>{language === "ar" ? "يتم تتبع الحجوزات زمنيًا وتلقائيًا كلما كان الوضع اليدوي معطلاً." : "Bookings are tracked automatically by time whenever manual mode is off."}</Text>
            {guestCheckInModeHistory.length ? guestCheckInModeHistory.map((entry) => <View key={`${entry.changedAt}-${entry.enabled}`} style={{ flexDirection: row, alignItems: "center", gap: 7 }}><MaterialIcons name={entry.enabled ? "touch-app" : "schedule"} size={14} color={entry.enabled ? colors.primary : colors.muted} /><Text style={[styles.flex, { color: colors.muted, fontSize: 11, textAlign: align }]}>{entry.enabled ? (language === "ar" ? "تم تفعيل الوضع اليدوي" : "Manual mode enabled") : (language === "ar" ? "تم تفعيل الوضع التلقائي" : "Automatic mode enabled")}</Text><Text style={{ color: colors.muted, fontSize: 10 }}>{formatModeChangeTime(entry.changedAt)}</Text></View>) : <Text style={{ color: colors.muted, fontSize: 11, textAlign: align }}>{language === "ar" ? "لا يوجد تغيير مسجل حتى الآن." : "No mode change recorded yet."}</Text>}
          </View> : null}
          {cleaningFlowEnabled ? <SettingsSwitch icon="cleaning-services" label={language === "ar" ? "إظهار التنظيف والفحص" : "Show cleaning & inspection"} description={language === "ar" ? "يعرض زر ولوحات تنبيهات التنظيف والفحص بين الحجوزات" : "Shows the cleaning board and turnover alerts between stays"} value={deviceSettings.showTurnoverTasks} onChange={(value) => void updateDeviceSettings({ showTurnoverTasks: value })} /> : null}
          <SettingsSwitch icon="checklist" label={language === "ar" ? "إظهار مهام اليوم" : "Show daily tasks"} description={language === "ar" ? "يعرض مركز الوصول والمغادرة والدفعات والانتظار في الرئيسية" : "Shows the arrivals, checkouts, payments, and waitlist center on Home"} value={deviceSettings.showDailyTasks} onChange={(value) => void updateDeviceSettings({ showDailyTasks: value })} />
        </Section>

        <Section title={language === "ar" ? "النظام والصلاحيات والأمان" : "System, security & data"} icon="admin-panel-settings" colors={colors} align={align} isRTL={isRTL}>
          {sectionTitle(language === "ar" ? "الفريق والصلاحيات" : "Staff & permissions")}
          <SettingsRow icon="group" title={language === "ar" ? "إدارة الأدوار والموظفين" : "Staff & RBAC management"} subtitle={language === "ar" ? "حراس ومديري حجوزات وضبط الصلاحيات والدعوات" : "Guards, booking managers, invitations, and permissions"} onPress={() => router.push("/user-management" as never)} trailing={<MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={colors.primary} />} />
          <SettingsRow icon="health-and-safety" title={language === "ar" ? "أدوات متقدمة وطوارئ" : "Advanced tools & recovery"} subtitle={language === "ar" ? "نقل الحجوزات وفك التعليق والاستعادة برقابة PIN" : "Move bookings, release holds, and recover data with owner PIN"} onPress={() => router.push("/settings/advanced-tools" as never)} trailing={<MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={colors.primary} />} />
          <SettingsRow icon="history" title={language === "ar" ? "سجل إجراءات النظام" : "System activity log"} subtitle={language === "ar" ? "متابعة الحذف والإلغاء والتحويل والحركات المؤثرة" : "Track deletions, cancellations, promotions, and critical actions"} onPress={() => router.push("/audit-log" as never)} trailing={<MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={colors.primary} />} />

          <View style={styles.divider} />

          {sectionTitle(language === "ar" ? "النسخ الاحتياطي والبيانات" : "Backup & data")}
          <Pressable onPress={() => void exportBackup()} style={({ pressed }) => [styles.backup, { flexDirection: row, backgroundColor: colors.primary, opacity: pressed ? 0.76 : 1 }]}><MaterialIcons name="upload-file" size={19} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{language === "ar" ? "تصدير نسخة احتياطية (Excel/PDF)" : "Export backup (Excel/PDF)"}</Text></Pressable>
          <Pressable onPress={async () => { const opened = await openBackupForPreview(); if (opened) router.push("/backup-preview" as never); }} style={({ pressed }) => [styles.backup, { flexDirection: row, backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="file-download" size={19} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "800" }}>{language === "ar" ? "استيراد واستعراض نسخة" : "Import and preview backup"}</Text></Pressable>

          <View style={styles.divider} />

          {sectionTitle(language === "ar" ? "المظهر والواجهة" : "Appearance & interface")}
          <View style={[styles.choiceRow, { flexDirection: row }]}>{([{ value: "light", ar: "نهاري", en: "Light" }, { value: "dark", ar: "داكن", en: "Dark" }, { value: "system", ar: "تلقائي", en: "System" }] as const).map((choice) => <Choice key={choice.value} compact label={language === "ar" ? choice.ar : choice.en} selected={deviceSettings.appearanceMode === choice.value} onPress={() => void updateDeviceSettings({ appearanceMode: choice.value })} colors={colors} />)}</View>
          <SettingsSwitch icon="language" label={language === "ar" ? "استخدام لغة الجهاز" : "Use device language"} description={language === "ar" ? `لغة الجهاز الحالية: ${deviceLanguage}` : `Current device language: ${deviceLanguage}`} value={deviceSettings.useDeviceLanguage} onChange={(value) => void updateDeviceSettings({ useDeviceLanguage: value })} />
          <View style={[styles.choiceRow, { flexDirection: row }]}><Choice label="العربية" selected={!deviceSettings.useDeviceLanguage && deviceSettings.language === "ar"} onPress={() => void updateDeviceSettings({ useDeviceLanguage: false, language: "ar" })} colors={colors} /><Choice label="English" selected={!deviceSettings.useDeviceLanguage && deviceSettings.language === "en"} onPress={() => void updateDeviceSettings({ useDeviceLanguage: false, language: "en" })} colors={colors} /></View>
          <SettingsSwitch icon="text-fields" label={language === "ar" ? "تكبير النصوص حسب الجهاز" : "Use device text size"} description={language === "ar" ? "يتبع حجم الخط في الجهاز لزيادة قابلية القراءة عند الحاجة." : "Uses your device text size for improved readability."} value={deviceSettings.respectFontScale} onChange={(value) => void updateDeviceSettings({ respectFontScale: value })} />
          <SettingsSwitch icon="vibration" label={language === "ar" ? "الاستجابة اللمسية" : "Haptic feedback"} description={language === "ar" ? "اهتزاز خفيف عند الرجوع والحفظ والإرسال والإكمال." : "Light feedback for back, save, send, and completion actions."} value={deviceSettings.hapticsEnabled} onChange={(value) => void updateDeviceSettings({ hapticsEnabled: value })} />
          <SettingsSwitch icon="motion-photos-paused" label={language === "ar" ? "تقليل الحركة" : "Reduce motion"} description={language === "ar" ? "يعرض النوافذ الزجاجية مباشرة دون حركة انتقالية إضافية." : "Shows glass dialogs without additional motion."} value={deviceSettings.reduceMotion} onChange={(value) => void updateDeviceSettings({ reduceMotion: value })} />
          <View style={[styles.neonAccentInfo, { flexDirection: align === "right" ? "row-reverse" : "row", backgroundColor: colors.surfaceMuted }]}>
            <View style={[styles.neonAccentDot, { backgroundColor: colors.primary }]} />
            <View style={styles.flex}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "اللون يتبع الوحدة النشطة" : "Color follows the active unit"}</Text>
              <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2, textAlign: align }}>{language === "ar" ? "جمالية زجاجية موحّدة بلمسة الوحدة النشطة تظهر تلقائيًا." : "A unified glass look with an accent tint of the active unit."}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {sectionTitle(language === "ar" ? "الدعم الفني" : "Support & about")}
          <SettingsRow icon="support-agent" title={language === "ar" ? "رقم الدعم الفني" : "Technical support"} subtitle={SUPER_ADMIN_PHONE} onPress={() => { if (Platform.OS !== "web") { void Linking.openURL(`tel:${SUPER_ADMIN_PHONE}`); } }} trailing={<SettingsValueBadge label={SUPER_ADMIN_PHONE} />} />
          <SettingsRow icon="info" title={language === "ar" ? "إصدار التطبيق" : "App version"} trailing={<SettingsValueBadge label={`v${appVersion}`} />} />
        </Section>

        {languageChangeStatus === "pending" && (
          <GlowGlassCard style={{ borderRadius: 20, marginTop: 16 }} contentStyle={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: colors.warning + "18" }}><MaterialIcons name="restart-alt" size={20} color={colors.warning} /></View>
              <ThemedText variant="body" color={colors.foreground} style={{ flex: 1, fontSize: 13, lineHeight: 20, textAlign: align }}>
                {language === "ar"
                  ? "تم تغيير اللغة. يجب إعادة تشغيل التطبيق لتطبيق اتجاه RTL/LTR بشكل صحيح."
                  : "Language changed. App must restart to apply RTL/LTR direction correctly."}
              </ThemedText>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <Pressable onPress={acknowledgeLanguageChange} style={{ minHeight: 36, borderRadius: 10, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}><ThemedText variant="label" color={colors.muted}>{language === "ar" ? "لاحقاً" : "Later"}</ThemedText></Pressable>
                <Pressable onPress={restartApp} style={{ minHeight: 36, borderRadius: 10, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }}><ThemedText variant="label" color={colors.foreground}>{language === "ar" ? "إعادة التشغيل الآن" : "Restart now"}</ThemedText></Pressable>
              </View>
            </View>
          </GlowGlassCard>
        )}

        {!configLocked ? description(language === "ar" ? "جميع التبديلات والمدخلات أعلاه تُحفظ تلقائيًا وتُزامن مع نسخة المنشأة." : "All toggles and inputs above persist automatically and sync with the workspace.") : description(language === "ar" ? "عرض للقراءة فقط — تعديل إعدادات المنشأة متاح للمالك أو المدير." : "Read-only view — workspace settings require owner or manager.")}

        {__DEV__ && (
          <Section title={language === "ar" ? "أدوات التطوير" : "Developer tools"} icon="code" colors={colors} align={align} isRTL={isRTL}>
            <Pressable onPress={loadDemoData} disabled={loadingDemo} style={({ pressed }) => [styles.templatesLink, { flexDirection: isRTL ? "row-reverse" : "row", backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.iconBox, { backgroundColor: colors.warning + "18" }]}><MaterialIcons name="dataset" size={20} color={colors.warning} /></View><View style={styles.flex}><ThemedText variant="body" color={colors.foreground} style={{ textAlign: align }}>{language === "ar" ? "تحميل بيانات تجريبية واقعية" : "Load realistic demo data"}</ThemedText><ThemedText variant="caption" color={colors.muted} style={{ textAlign: align }}>{language === "ar" ? "ينشئ شاليهات، حجوزات، مصروفات، تقارير" : "Creates chalets, bookings, expenses, reports"}</ThemedText></View>{loadingDemo ? <ActivityIndicator color={colors.warning} size="small" /> : <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={21} color={colors.primary} />}</Pressable>
          </Section>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function Section({ title, icon, children, colors, align, isRTL }: { title: string; icon: IconName; children: React.ReactNode; colors: ReturnType<typeof useColors>; align: "left" | "right"; isRTL: boolean }) {
  return <GlowGlassCard style={styles.section} contentStyle={styles.sectionContent}><View style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}><View style={[styles.iconBox, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name={icon} size={20} color={colors.primary} /></View><Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{title}</Text></View>{children}</GlowGlassCard>;
}

function Field({ label, labelView, children, compact = false }: { label: string; labelView: (value: string) => React.ReactNode; children: React.ReactNode; compact?: boolean }) {
  return <View style={[styles.field, compact && styles.compactField]}>{labelView(label)}{children}</View>;
}

function Choice({ label, selected, onPress, colors, compact = false, disabled = false }: { label: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof useColors>; compact?: boolean; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.choice, compact && styles.compactChoice, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, opacity: disabled ? 0.45 : pressed ? 0.72 : 1 }]}><Text numberOfLines={1} style={{ color: selected ? "#FFFFFF" : colors.foreground, fontWeight: "800", textAlign: "center", fontSize: 12 }}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 118 },
  section: { borderRadius: 24, marginTop: 22 },
  sectionContent: { padding: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 16 },
  sectionTitle: { flex: 1, fontSize: 18, fontWeight: "800" },
  iconBox: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  field: { width: "100%", marginTop: 12 },
  compactField: { marginTop: 0 },
  flex: { flex: 1, minWidth: 0 },
  input: { width: "100%", minHeight: 48, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, marginTop: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(128,128,128,0.22)", marginVertical: 14 },
  currentCard: { minHeight: 66, borderRadius: 16, borderWidth: 1, alignItems: "center", gap: 11, paddingHorizontal: 13 },
  currentIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  manageButton: { minHeight: 52, borderRadius: 16, marginTop: 14, alignItems: "center", justifyContent: "center", gap: 7 },
  hubLink: { minHeight: 40, alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 },
  backup: { minHeight: 46, borderRadius: 15, marginTop: 10, alignItems: "center", justifyContent: "center", gap: 7 },
  thresholdRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" },
  choiceRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  choiceWrap: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  choice: { minWidth: 110, flexGrow: 1, flexShrink: 1, minHeight: 44, borderRadius: 14, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  compactChoice: { minWidth: 0, minHeight: 38, flexGrow: 1, flexShrink: 1, borderRadius: 12, paddingHorizontal: 8 },
  neonAccentInfo: { minHeight: 56, borderRadius: 16, marginTop: 12, alignItems: "center", gap: 10, paddingHorizontal: 12 },
  neonAccentDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  templatesLink: { width: "100%", minHeight: 66, borderRadius: 18, alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 12 },
});