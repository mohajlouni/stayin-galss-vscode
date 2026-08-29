import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { type ComponentProps, useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { RipplePressable } from "@/components/ripple-pressable";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { DEFAULT_WHATSAPP_DISCLAIMER, DEFAULT_WHATSAPP_MESSAGE_OPTIONS, type WhatsAppMessageOptions, isValidBusinessLogoUrl } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";

type IconName = ComponentProps<typeof MaterialIcons>["name"];

const WHATSAPP_OPTIONS = [
  { key: "includeGuestAndChalet", ar: "الضيف والشاليه", en: "Guest & chalet" },
  { key: "includeSchedule", ar: "الموعد", en: "Schedule" },
  { key: "includeFinancials", ar: "المبالغ", en: "Financials" },
  { key: "includeLocation", ar: "الموقع", en: "Location" },
  { key: "includeContacts", ar: "جهات الاتصال", en: "Contacts" },
] as const;

export default function SettingsScreen() {
  const { settings, updateSettings, exportBackup, openBackupForPreview } = useBookings();
  const { isRTL, language } = useI18n();
  const { deviceSettings, deviceLanguage, deviceTimezone, formatDate, formatTime, updateDeviceSettings, triggerHaptic } = useAppPreferences();
  const colors = useColors();
  const align: "right" | "left" = isRTL ? "right" : "left";
  const layoutDirection: "rtl" | "ltr" = isRTL ? "rtl" : "ltr";
  const row = isRTL ? "row-reverse" : "row";

  const [businessName, setBusinessName] = useState(settings.businessName);
  const [businessPhone, setBusinessPhone] = useState(settings.businessPhone);
  const [currency, setCurrency] = useState(settings.currency);
  const [businessLogoUrl, setBusinessLogoUrl] = useState(settings.businessLogoUrl ?? "");
  const [whatsAppEnabled, setWhatsAppEnabled] = useState(settings.whatsAppEnabled ?? false);
  const [ownerPhone, setOwnerPhone] = useState(settings.ownerPhone ?? "");
  const [enableDisclaimer, setEnableDisclaimer] = useState(settings.enableDisclaimer ?? true);
  const [disclaimerText, setDisclaimerText] = useState(settings.disclaimerText ?? DEFAULT_WHATSAPP_DISCLAIMER);
  const [whatsAppOptions, setWhatsAppOptions] = useState<WhatsAppMessageOptions>({ ...DEFAULT_WHATSAPP_MESSAGE_OPTIONS, ...(settings.whatsAppOptions ?? {}) });
  const [timezone, setTimezone] = useState(deviceSettings.timezone || deviceTimezone);

  useEffect(() => {
    setBusinessName(settings.businessName);
    setBusinessPhone(settings.businessPhone);
    setCurrency(settings.currency);
    setBusinessLogoUrl(settings.businessLogoUrl ?? "");
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

  const saveBusiness = async () => {
    if (!businessName.trim()) {
      Alert.alert(language === "ar" ? "اسم المنشأة مطلوب" : "Business name required");
      return;
    }
    if (!isValidBusinessLogoUrl(businessLogoUrl)) {
      Alert.alert(language === "ar" ? "رابط شعار غير صالح" : "Invalid logo URL", language === "ar" ? "استخدم رابط HTTPS أو اترك الحقل فارغًا." : "Use an HTTPS URL or leave the field empty.");
      return;
    }
    await updateSettings({
      ...settings,
      businessName: businessName.trim(),
      businessPhone: businessPhone.trim(),
      currency: currency.trim() || settings.currency,
      businessLogoUrl: businessLogoUrl.trim() || undefined,
      whatsAppEnabled,
      ownerPhone: ownerPhone.trim(),
      enableDisclaimer,
      disclaimerText: disclaimerText.trim() || DEFAULT_WHATSAPP_DISCLAIMER,
      whatsAppOptions,
    });
    void triggerHaptic();
    Alert.alert(language === "ar" ? "تم حفظ الإعدادات" : "Settings saved");
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

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={[styles.content, { direction: layoutDirection }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <SubScreenHeader title={language === "ar" ? "الإعدادات" : "Settings"} />

        <Section title={language === "ar" ? "بيانات المنشأة" : "Business profile"} icon="business" colors={colors} align={align} isRTL={isRTL}>
          <Field label={language === "ar" ? "اسم المنشأة" : "Business name"} labelView={sectionTitle}><TextInput value={businessName} onChangeText={setBusinessName} placeholderTextColor={colors.muted} style={inputStyle} /></Field>
          <Field label={language === "ar" ? "هاتف الإدارة" : "Management phone"} labelView={sectionTitle}><TextInput value={businessPhone} onChangeText={setBusinessPhone} keyboardType="phone-pad" placeholder="07xxxxxxxx" placeholderTextColor={colors.muted} style={inputStyle} /></Field>
          <View style={[styles.dual, { flexDirection: row }]}>
            <View style={styles.flex}><Field label={language === "ar" ? "العملة الافتراضية" : "Default currency"} labelView={sectionTitle} compact><TextInput value={currency} onChangeText={setCurrency} placeholderTextColor={colors.muted} style={inputStyle} /></Field></View>
            <View style={styles.flex}><Field label={language === "ar" ? "رابط الشعار (اختياري)" : "Logo URL (optional)"} labelView={sectionTitle} compact><TextInput value={businessLogoUrl} onChangeText={setBusinessLogoUrl} autoCapitalize="none" keyboardType="url" placeholder="https://..." placeholderTextColor={colors.muted} style={inputStyle} /></Field></View>
          </View>
          <View style={[styles.whatsAppHeader, { backgroundColor: colors.surfaceMuted }]}>
            <SettingSwitch label={language === "ar" ? "تفعيل مشاركة واتساب" : "Enable WhatsApp sharing"} value={whatsAppEnabled} onChange={setWhatsAppEnabled} colors={colors} align={align} />
          </View>
          {whatsAppEnabled ? <View style={styles.whatsAppBody}>
            <Field label={language === "ar" ? "هاتف الإدارة لرسالة واتساب" : "WhatsApp management phone"} labelView={sectionTitle}><TextInput value={ownerPhone} onChangeText={setOwnerPhone} keyboardType="phone-pad" placeholder="07xxxxxxxx" placeholderTextColor={colors.muted} style={inputStyle} /></Field>
            <SettingSwitch label={language === "ar" ? "إظهار التنبيه القانوني" : "Show liability disclaimer"} value={enableDisclaimer} onChange={setEnableDisclaimer} colors={colors} align={align} />
            {enableDisclaimer ? <View style={styles.field}><TextInput value={disclaimerText} onChangeText={setDisclaimerText} multiline textAlignVertical="top" placeholderTextColor={colors.muted} style={[inputStyle, styles.multiline]} /></View> : null}
            <View style={[styles.optionGrid, { flexDirection: row }]}>{WHATSAPP_OPTIONS.map((option) => <WhatsAppOptionChip key={option.key} label={language === "ar" ? option.ar : option.en} value={whatsAppOptions[option.key]} onChange={(value) => updateMessageOption(option.key, value)} colors={colors} isRTL={isRTL} />)}</View>
          </View> : null}
          <RipplePressable rippleColor="#FFFFFF3D" onPress={() => void saveBusiness()} style={({ pressed }) => [styles.save, { backgroundColor: colors.primary, opacity: pressed ? 0.76 : 1 }]}><Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{language === "ar" ? "حفظ بيانات المنشأة" : "Save business profile"}</Text></RipplePressable>
        </Section>

        <Section title={language === "ar" ? "طرق الدفع" : "Payment methods"} icon="payments" colors={colors} align={align} isRTL={isRTL}>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "فتح إدارة طرق الدفع" : "Open payment methods management"} onPress={() => router.push("/payment-methods" as never)} style={({ pressed }) => [styles.paymentMethodsLink, { flexDirection: row, backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.72 : 1 }]}><View style={[styles.iconBox, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="payments" size={20} color={colors.primary} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 14, textAlign: align }}>{language === "ar" ? "إدارة طرق الدفع" : "Manage payment methods"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3, textAlign: align }}>{language === "ar" ? "أضف أو عدّل أو أوقف طرق التحصيل واختر رمزًا لكل طريقة." : "Add, edit, pause, and choose an icon for each collection method."}</Text></View><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={colors.primary} /></Pressable>
        </Section>

        <Section title={language === "ar" ? "الوقت والتاريخ" : "Time & date"} icon="event" colors={colors} align={align} isRTL={isRTL}>
          {sectionTitle(language === "ar" ? "تنسيق الوقت" : "Time format")}
          <View style={[styles.choiceRow, { flexDirection: row }]}><Choice label="12h" selected={deviceSettings.timeFormat === "12h"} onPress={() => void updateDeviceSettings({ timeFormat: "12h" })} colors={colors} /><Choice label="24h" selected={deviceSettings.timeFormat === "24h"} onPress={() => void updateDeviceSettings({ timeFormat: "24h" })} colors={colors} /></View>
          <Text style={[styles.subLabel, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "تنسيق التاريخ" : "Date format"}</Text>
          <View style={[styles.choiceWrap, { flexDirection: row }]}>{([{ value: "DD/MM/YYYY", label: "18/08/2026" }, { value: "YYYY-MM-DD", label: "2026-08-18" }, { value: "english-month", label: "18 August 2026" }, { value: "arabic-gregorian", label: language === "ar" ? "18 أغسطس 2026" : "18 August 2026" }] as const).map((choice) => <Choice key={choice.value} label={choice.label} selected={deviceSettings.dateFormat === choice.value} onPress={() => void updateDeviceSettings({ dateFormat: choice.value })} colors={colors} />)}</View>
          <SettingSwitch label={language === "ar" ? "إظهار التاريخ الهجري" : "Show Hijri date"} value={deviceSettings.showHijriDate} onChange={(value) => void updateDeviceSettings({ showHijriDate: value })} colors={colors} align={align} />
          <Field label={language === "ar" ? "المنطقة الزمنية" : "Timezone"} labelView={sectionTitle}><TextInput value={timezone} onChangeText={setTimezone} autoCapitalize="none" onEndEditing={() => void updateDeviceSettings({ timezone: timezone.trim() || deviceTimezone })} placeholderTextColor={colors.muted} style={inputStyle} />{description(`${language === "ar" ? "منطقة الجهاز" : "Device timezone"}: ${deviceTimezone}`)}</Field>
        </Section>

        <Section title={language === "ar" ? "المظهر واللغة" : "Appearance & language"} icon="palette" colors={colors} align={align} isRTL={isRTL}>
          {sectionTitle(language === "ar" ? "المظهر" : "Appearance")}
          <View style={[styles.choiceRow, { flexDirection: row }]}>{([{ value: "light", ar: "نهاري", en: "Light" }, { value: "dark", ar: "داكن", en: "Dark" }, { value: "system", ar: "تلقائي", en: "System" }] as const).map((choice) => <Choice key={choice.value} compact label={language === "ar" ? choice.ar : choice.en} selected={deviceSettings.appearanceMode === choice.value} onPress={() => void updateDeviceSettings({ appearanceMode: choice.value })} colors={colors} />)}</View>
          <SettingSwitch label={language === "ar" ? "استخدام لغة الجهاز" : "Use device language"} value={deviceSettings.useDeviceLanguage} onChange={(value) => void updateDeviceSettings({ useDeviceLanguage: value })} colors={colors} align={align} />
          <View style={[styles.choiceRow, { flexDirection: row }]}><Choice label="العربية" selected={!deviceSettings.useDeviceLanguage && deviceSettings.language === "ar"} onPress={() => void updateDeviceSettings({ useDeviceLanguage: false, language: "ar" })} colors={colors} /><Choice label="English" selected={!deviceSettings.useDeviceLanguage && deviceSettings.language === "en"} onPress={() => void updateDeviceSettings({ useDeviceLanguage: false, language: "en" })} colors={colors} /></View>
          <SettingSwitch label={language === "ar" ? "تكبير النصوص حسب الجهاز" : "Use device text size"} description={language === "ar" ? "يتبع حجم الخط في الجهاز لزيادة قابلية القراءة عند الحاجة." : "Uses your device text size for improved readability."} value={deviceSettings.respectFontScale} onChange={(value) => void updateDeviceSettings({ respectFontScale: value })} colors={colors} align={align} />
          {sectionTitle(language === "ar" ? "شدة النيون الخلفي" : "Background neon intensity")}
          <View style={[styles.neonAccentInfo, { flexDirection: row, backgroundColor: colors.surfaceMuted }]}>
            <View style={[styles.neonAccentDot, { backgroundColor: colors.primary }]} />
            <View style={styles.flex}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "اللون يتبع الوحدة النشطة" : "Color follows the active unit"}</Text>
              <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2, textAlign: align }}>{language === "ar" ? "اختر وحدة مختلفة لتتغير إضاءة المشهد تلقائيًا." : "Choose another unit to update the scene glow automatically."}</Text>
            </View>
          </View>
          <View style={[styles.choiceRow, { flexDirection: row }]}>{([{ value: "standard", ar: "متوازنة", en: "Balanced" }, { value: "quiet", ar: "هادئة", en: "Calm" }, { value: "minimal", ar: "أهدأ", en: "Minimal" }] as const).map((choice) => <Choice key={choice.value} compact label={language === "ar" ? choice.ar : choice.en} selected={deviceSettings.glassBackgroundLevel === choice.value} onPress={() => void updateDeviceSettings({ glassBackgroundLevel: choice.value, quietGlassBackground: choice.value !== "standard" })} colors={colors} />)}</View>
          {description(language === "ar" ? "تضبط هذه الخيارات شدة النيون خلف الزجاج فقط؛ الحاويات والنصوص والحسابات لا تتغير." : "These options adjust only the neon behind glass; surfaces, text, and data remain unchanged.")}
          {deviceSettings.glassBackgroundLevel !== "standard" ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "استعادة النيون المتوازن" : "Restore balanced neon"} onPress={() => void updateDeviceSettings({ glassBackgroundLevel: "standard", quietGlassBackground: false })} style={({ pressed }) => [styles.restoreBackground, { alignSelf: isRTL ? "flex-end" : "flex-start", backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="restart-alt" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}>{language === "ar" ? "استعادة المتوازنة" : "Restore balanced"}</Text></Pressable> : null}
          {sectionTitle(language === "ar" ? "شفافية الزجاج" : "Glass transparency")}
          <View style={[styles.choiceRow, { flexDirection: row }]}>{([{ value: "transparent", ar: "شفافة", en: "Transparent" }, { value: "balanced", ar: "متوازنة", en: "Balanced" }, { value: "focused", ar: "أوضح", en: "Focused" }] as const).map((choice) => <Choice key={choice.value} compact label={language === "ar" ? choice.ar : choice.en} selected={deviceSettings.glassSurfaceOpacity === choice.value} onPress={() => void updateDeviceSettings({ glassSurfaceOpacity: choice.value })} colors={colors} />)}</View>
          {description(language === "ar" ? "اختر شفافة لإظهار الخلفية أكثر، أو أوضح لزيادة تباين النصوص والبيانات." : "Choose transparent to reveal more background, or focused for stronger text and data contrast.")}
          {sectionTitle(language === "ar" ? "وهج الإطارات" : "Frame glow")}
          <View style={[styles.choiceRow, { flexDirection: row }]}>{([{ value: "subtle", ar: "هادئ", en: "Subtle" }, { value: "balanced", ar: "متوازن", en: "Balanced" }, { value: "vivid", ar: "بارز", en: "Vivid" }] as const).map((choice) => <Choice key={choice.value} compact label={language === "ar" ? choice.ar : choice.en} selected={deviceSettings.glassGlowIntensity === choice.value} onPress={() => void updateDeviceSettings({ glassGlowIntensity: choice.value })} colors={colors} />)}</View>
          {description(language === "ar" ? "يضبط لمعان حواف بطاقات الوحدات فقط، من دون تغيير ألوان الحالات أو الفترات." : "Adjusts only unit-card frame glow without changing status or period colors.")}
          {description(`${language === "ar" ? "لغة الجهاز" : "Device language"}: ${deviceLanguage === "ar" ? "العربية" : "English"}`)}
        </Section>

        <Section title={language === "ar" ? "النظام والنسخ الاحتياطي" : "System & backup"} icon="settings" colors={colors} align={align} isRTL={isRTL}>
          <SettingSwitch label={language === "ar" ? "الاستجابة اللمسية" : "Haptic feedback"} description={language === "ar" ? "اهتزاز خفيف عند الرجوع والحفظ والإرسال والإكمال." : "Light feedback for back, save, send, and completion actions."} value={deviceSettings.hapticsEnabled} onChange={(value) => void updateDeviceSettings({ hapticsEnabled: value })} colors={colors} align={align} />
          <SettingSwitch label={language === "ar" ? "تقليل الحركة" : "Reduce motion"} description={language === "ar" ? "يعرض النوافذ الزجاجية مباشرة دون حركة انتقالية إضافية." : "Shows glass dialogs without additional motion."} value={deviceSettings.reduceMotion} onChange={(value) => void updateDeviceSettings({ reduceMotion: value })} colors={colors} align={align} />
          <SettingSwitch label={language === "ar" ? "الإشعارات المحلية" : "Local notifications"} value={deviceSettings.notificationsEnabled} onChange={(value) => void changeNotifications(value)} colors={colors} align={align} />
          <Pressable onPress={() => void exportBackup()} style={({ pressed }) => [styles.backup, { flexDirection: row, backgroundColor: colors.primary, opacity: pressed ? 0.76 : 1 }]}><MaterialIcons name="upload-file" size={19} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{language === "ar" ? "تصدير نسخة احتياطية" : "Export backup"}</Text></Pressable>
          <Pressable onPress={async () => { const opened = await openBackupForPreview(); if (opened) router.push("/backup-preview" as never); }} style={({ pressed }) => [styles.backup, { flexDirection: row, backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="file-download" size={19} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "800" }}>{language === "ar" ? "استيراد واستعراض نسخة" : "Import and preview backup"}</Text></Pressable>
        </Section>

        <Section title={language === "ar" ? "التحكم التشغيلي" : "Operational controls"} icon="tune" colors={colors} align={align} isRTL={isRTL}>
          <SettingSwitch label={language === "ar" ? "إظهار تسجيل وصول الضيف" : "Show guest check-in"} description={language === "ar" ? "عند إيقاف هذا الخيار، يتم تتبع الحجوزات زمنيًا وتلقائيًا دون الحاجة لتسجيل الوصول والمغادرة يدويًا." : "When off, bookings are tracked automatically by time without manual arrival or checkout."} value={deviceSettings.showGuestCheckIn} onChange={(value) => void updateDeviceSettings({ showGuestCheckIn: value })} colors={colors} align={align} />
          <View style={{ marginTop: 10, borderRadius: 18, padding: 11, gap: 7, backgroundColor: colors.surfaceMuted }}>
            <View style={{ flexDirection: row, alignItems: "center", gap: 7 }}><MaterialIcons name="history" size={17} color={colors.primary} /><Text style={[styles.flex, { color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "سجل وضع الوصول" : "Arrival mode history"}</Text></View>
            {guestCheckInModeHistory.length ? guestCheckInModeHistory.map((entry) => <View key={`${entry.changedAt}-${entry.enabled}`} style={{ flexDirection: row, alignItems: "center", gap: 7 }}><MaterialIcons name={entry.enabled ? "touch-app" : "schedule"} size={14} color={entry.enabled ? colors.primary : colors.muted} /><Text style={[styles.flex, { color: colors.muted, fontSize: 11, textAlign: align }]}>{entry.enabled ? (language === "ar" ? "تم تفعيل الوضع اليدوي" : "Manual mode enabled") : (language === "ar" ? "تم تفعيل الوضع التلقائي" : "Automatic mode enabled")}</Text><Text style={{ color: colors.muted, fontSize: 10 }}>{formatModeChangeTime(entry.changedAt)}</Text></View>) : <Text style={{ color: colors.muted, fontSize: 11, textAlign: align }}>{language === "ar" ? "لا يوجد تغيير مسجل حتى الآن." : "No mode change recorded yet."}</Text>}
          </View>
          <SettingSwitch label={language === "ar" ? "إظهار التنظيف والفحص" : "Show cleaning & inspection"} description={language === "ar" ? "يعرض زر ولوحات تنبيهات التنظيف والفحص بين الحجوزات." : "Shows the cleaning board and turnover alerts between stays."} value={deviceSettings.showTurnoverTasks} onChange={(value) => void updateDeviceSettings({ showTurnoverTasks: value })} colors={colors} align={align} />
          <SettingSwitch label={language === "ar" ? "إظهار مهام اليوم" : "Show daily tasks"} description={language === "ar" ? "يعرض مركز الوصول والمغادرة والدفعات والانتظار في الرئيسية." : "Shows the arrivals, checkouts, payments, and waitlist center on Home."} value={deviceSettings.showDailyTasks} onChange={(value) => void updateDeviceSettings({ showDailyTasks: value })} colors={colors} align={align} />
        </Section>

        <Section title={language === "ar" ? "التواصل وعقد الإقامة" : "Messaging & stay contract"} icon="chat" colors={colors} align={align} isRTL={isRTL}>
          <SettingSwitch label={language === "ar" ? "إظهار الرسائل الجاهزة" : "Show ready messages"} description={language === "ar" ? "يعرض خيارات الرسائل في تفاصيل الحجز." : "Shows message options in booking details."} value={deviceSettings.showReadyMessages} onChange={(value) => void updateDeviceSettings({ showReadyMessages: value })} colors={colors} align={align} />
          <SettingSwitch label={language === "ar" ? "إظهار عقد الإقامة" : "Show stay contract"} description={language === "ar" ? "يعرض ملخص العقد وشروطه ضمن واتساب." : "Shows contract summary and terms in WhatsApp."} value={deviceSettings.showStayContract} onChange={(value) => void updateDeviceSettings({ showStayContract: value })} colors={colors} align={align} />
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "فتح قوالب رسائل الواتساب" : "Open WhatsApp message templates"} onPress={() => router.push("/whatsapp-templates" as never)} style={({ pressed }) => [styles.templatesLink, { flexDirection: isRTL ? "row-reverse" : "row", backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.72 : 1 }]}><View style={[styles.iconBox, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="edit-note" size={20} color={colors.primary} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 14, textAlign: align }}>{language === "ar" ? "قوالب رسائل الواتساب" : "WhatsApp message templates"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3, textAlign: align }}>{language === "ar" ? "حرر جميع القوالب، عاينها، واستعد النصوص الافتراضية عند الحاجة." : "Edit, preview, and restore all message templates."}</Text></View><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={21} color={colors.primary} /></Pressable>
        </Section>
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

function Choice({ label, selected, onPress, colors, compact = false }: { label: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof useColors>; compact?: boolean }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, compact && styles.compactChoice, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, opacity: pressed ? 0.72 : 1 }]}><Text numberOfLines={1} style={{ color: selected ? "#FFFFFF" : colors.foreground, fontWeight: "800", textAlign: "center", fontSize: 12 }}>{label}</Text></Pressable>;
}

function SettingSwitch({ label, description, value, onChange, colors, align }: { label: string; description?: string; value: boolean; onChange: (value: boolean) => void; colors: ReturnType<typeof useColors>; align: "left" | "right" }) {
  return <View style={[styles.switchRow, { flexDirection: align === "right" ? "row-reverse" : "row", backgroundColor: colors.surfaceMuted }]}><View style={styles.switchLabel}><Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14, textAlign: align }}>{label}</Text>{description ? <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3, textAlign: align }}>{description}</Text> : null}</View><View style={styles.switchControl}><AppToggle value={value} onValueChange={onChange} isRTL={align === "right"} activeColor={colors.primary} inactiveColor={colors.border} accessibilityLabel={label} /></View></View>;
}

function WhatsAppOptionChip({ label, value, onChange, colors, isRTL }: { label: string; value: boolean; onChange: (value: boolean) => void; colors: ReturnType<typeof useColors>; isRTL: boolean }) {
  return <Pressable onPress={() => onChange(!value)} style={({ pressed }) => [styles.optionChip, { flexDirection: isRTL ? "row-reverse" : "row", backgroundColor: value ? colors.primary : colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={value ? "check-circle" : "add-circle-outline"} size={14} color={value ? "#FFFFFF" : colors.muted} /><Text numberOfLines={1} style={{ color: value ? "#FFFFFF" : colors.foreground, fontSize: 11, fontWeight: "800", flexShrink: 1 }}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 118 }, section: { borderRadius: 24, marginTop: 22 }, sectionContent: { padding: 16 }, sectionHeader: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 16 }, sectionTitle: { flex: 1, fontSize: 18, fontWeight: "800" }, iconBox: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" }, field: { width: "100%", marginTop: 12 }, compactField: { marginTop: 0 }, dual: { flexDirection: "row", gap: 10, marginTop: 14 }, flex: { flex: 1, minWidth: 0 }, input: { width: "100%", minHeight: 48, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, marginTop: 8 }, whatsAppHeader: { width: "100%", marginTop: 18, borderRadius: 18, paddingHorizontal: 12 }, whatsAppBody: { width: "100%", marginTop: 13 }, switchRow: { width: "100%", minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 18, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, overflow: "hidden" }, switchLabel: { flex: 1, minWidth: 0, paddingHorizontal: 4 }, switchControl: { width: 52, minWidth: 52, height: 32, borderRadius: 16, overflow: "hidden", alignItems: "center", justifyContent: "center" }, multiline: { minHeight: 96, paddingTop: 12, marginTop: 0 }, optionGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }, optionChip: { maxWidth: "100%", minHeight: 40, borderRadius: 20, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, save: { minHeight: 50, borderRadius: 16, marginTop: 17, alignItems: "center", justifyContent: "center" }, paymentMethodsLink: { width: "100%", minHeight: 66, borderRadius: 18, alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 9 }, choiceRow: { flexDirection: "row", gap: 8, marginTop: 10 }, choiceWrap: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }, choice: { minWidth: 110, flexGrow: 1, flexShrink: 1, minHeight: 44, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", borderRadius: 16 }, compactChoice: { minWidth: 0, flexBasis: 0 }, neonAccentInfo: { width: "100%", minHeight: 58, marginTop: 12, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10, alignItems: "center", gap: 10 }, neonAccentDot: { width: 16, height: 16, borderRadius: 8, flexShrink: 0 }, restoreBackground: { minHeight: 38, borderRadius: 14, marginTop: 11, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, subLabel: { fontWeight: "800", marginTop: 20 }, backup: { minHeight: 50, borderRadius: 16, marginTop: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, templatesLink: { width: "100%", minHeight: 66, borderRadius: 18, marginTop: 12, alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
});
