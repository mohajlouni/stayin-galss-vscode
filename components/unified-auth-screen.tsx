import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image, Pressable, ScrollView, StyleSheet, TextInput, View, type ViewStyle, type TextStyle } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { ScreenContainer } from "@/components/screen-container";
import { ThemedText, ThemedNumber } from "@/components/themed-text";
import { startOAuthLogin } from "@/constants/oauth";
import { startLocalLogin } from "@/lib/_core/api";
import { useAuthSession } from "@/lib/auth-session";
import { LEGAL_VERSIONS, savePendingRegistration } from "@/lib/legal-consent";
import { normalizeInternationalPhone } from "@/lib/phone-number";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Tab = "login" | "register";
type Method = "phone" | "email";
type Busy = "login" | "register" | "biometric" | null;
type ValidatedField = "name" | "contact";

export function UnifiedAuthScreen({ initialTab = "login", standaloneRegister = false }: { initialTab?: Tab; standaloneRegister?: boolean }) {
  const colors = useColors();
  const { isRTL } = useI18n();
  const { isAuthenticated, biometricAvailable, activeSession, setRememberMe, unlockWithBiometrics, refresh } = useAuthSession();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [method, setMethod] = useState<Method>("phone");
  const [loginContact, setLoginContact] = useState("");
  const [registerContact, setRegisterContact] = useState("");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<ValidatedField, boolean>>({ name: false, contact: false });
  const pulse = useRef(new Animated.Value(0.92)).current;
  const formOpacity = useRef(new Animated.Value(1)).current;
  const contact = tab === "login" ? loginContact : registerContact;
  const setContact = tab === "login" ? setLoginContact : setRegisterContact;
  const isBusy = busy !== null;

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1.06, duration: 1100, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0.92, duration: 1100, useNativeDriver: true })]));
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const resetFeedback = () => { setError(null); setMessage(null); };
  const changeTab = (next: Tab) => {
    if (next === tab || isBusy) return;
    resetFeedback();
    Animated.timing(formOpacity, { toValue: 0, duration: 110, useNativeDriver: true }).start(() => { setTab(next); Animated.timing(formOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start(); });
  };
  const normalizePhone = (value: string) => {
    const digits = value.replace(/[^0-9٠-٩]/g, "");
    return normalizeInternationalPhone(value.startsWith("+") || value.startsWith("00") ? value : `+962${digits.replace(/^0/, "")}`);
  };
  const validateName = (value: string) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) return "أدخل الاسم الكامل للمتابعة.";
    if (normalized.length < 2) return "يجب أن يتكون الاسم الكامل من حرفين على الأقل.";
    if (!/[\p{L}]/u.test(normalized)) return "اكتب اسمًا صالحًا باستخدام أحرف واضحة.";
    return null;
  };
  const validateContact = (value: string) => {
    if (!value.trim()) return method === "phone" ? "أدخل رقم الهاتف للمتابعة." : "أدخل البريد الإلكتروني للمتابعة.";
    if (method === "phone") return normalizePhone(value).error ? "أدخل رقم هاتف صحيحًا، مثل 079 000 0000 أو +962790000000." : null;
    return emailPattern.test(value.trim()) ? null : "أدخل بريدًا إلكترونيًا صحيحًا، مثل name@example.com.";
  };
  const beginOAuth = async (action: Exclude<Busy, null>) => {
    resetFeedback(); setBusy(action);
    try { await startOAuthLogin(); }
    catch { setMessage(action === "register" ? "تعذر بدء إنشاء الحساب عبر بوابة الهوية الآمنة. تحقق من اتصال الإنترنت ثم أعد المحاولة." : "تعذر فتح بوابة الهوية الآمنة. تحقق من اتصال الإنترنت ثم أعد المحاولة."); }
    finally { setBusy(null); }
  };
  const submit = async () => {
    const invalidContact = validateContact(contact);
    const invalidName = validateName(name);
    if (tab === "register" && invalidName) { setTouched((current) => ({ ...current, name: true })); setError(invalidName); return; }
    if (invalidContact) { setTouched((current) => ({ ...current, contact: true })); setError(invalidContact); return; }
    if (tab === "register" && !accepted) { setError("يلزم قبول الشروط والأحكام وسياسة الخصوصية للمتابعة."); return; }
    if (tab === "register") {
      if (process.env.NODE_ENV === "production") {
        try {
          const phone = method === "phone" ? normalizePhone(contact).value : null;
          await savePendingRegistration({ name: name.trim(), contactType: method, phone: phone ?? null, email: method === "email" ? contact.trim().toLowerCase() : null, acceptedAt: new Date().toISOString(), termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy, conditionsVersion: LEGAL_VERSIONS.conditions });
        } catch { setMessage("تعذر تجهيز طلب إنشاء الحساب على هذا الجهاز. أعد المحاولة."); return; }
      }
    }
    if (process.env.NODE_ENV !== "production") { await beginLocalLogin(); return; }
    await beginOAuth(tab);
  };
  const biometricLogin = async () => {
    if (!biometricAvailable || !isAuthenticated || !activeSession.biometricsEnabled) { setMessage("الدخول السريع بالبصمة غير مفعّل بعد. سجّل دخولًا مرة واحدة، ثم فعّله من أمان الحساب."); return; }
    setBusy("biometric");
    try { if (await unlockWithBiometrics()) { router.replace("/workspace-gate"); return; } setMessage("لم يكتمل التحقق بالبصمة. يمكنك المحاولة مجددًا أو المتابعة عبر بوابة الهوية."); }
    catch { setMessage("تعذر الوصول إلى البصمة أو بصمة الوجه على هذا الجهاز حاليًا."); }
    finally { setBusy(null); }
  };
  const beginLocalLogin = async () => {
    resetFeedback(); setBusy(tab);
    try {
      await startLocalLogin({ phone: contact, password: secret });
      await refresh();
      router.replace("/workspace-gate");
    } catch {
      setMessage("تعذر الدخول محلياً. تأكد من تشغيل خادم التطوير على المنفذ 3000 ثم أعد المحاولة.");
    } finally { setBusy(null); }
  };
  const fieldBorder = (key: string, invalid = false) => invalid ? colors.error : focused === key ? colors.neonBorder : colors.appTheme.input.borderColor;
  const fieldGlow = (key: string) => focused === key ? { shadowColor: colors.neonGlow, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6, borderTopColor: colors.appTheme.glass.topHighlight } : {};
  const label = method === "phone" ? "رقم الهاتف" : "البريد الإلكتروني";
  const nameLiveError = touched.name ? validateName(name) : null;
  const contactLiveError = touched.contact ? validateContact(contact) : null;
  const nameIsValid = touched.name && !nameLiveError && Boolean(name.trim());
  const contactIsValid = touched.contact && !contactLiveError && Boolean(contact.trim());
  const touch = (field: ValidatedField) => setTouched((current) => current[field] ? current : { ...current, [field]: true });

  function cx(...styles: (false | null | undefined | TextStyle | {})[]) {
    return styles.filter((s): s is TextStyle => Boolean(s));
  }

  const styles = makeStyles(colors, isRTL);

  function TabButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
    return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={styles.tab}><ThemedText variant="button" color={selected ? colors.foreground : colors.muted} style={cx(styles.tabText, selected && styles.tabActive)}>{label}</ThemedText>{selected ? <View style={styles.indicator} /> : null}</Pressable>;
  }
  function Input({ icon, value, onChangeText, onBlur, placeholder, field, focused, setFocused, border, accessibilityLabel, keyboardType }: { icon: "person-outline" | "alternate-email"; value: string; onChangeText: (value: string) => void; onBlur?: () => void; placeholder: string; field: string; focused: string | null; setFocused: (value: string | null) => void; border: string; accessibilityLabel: string; keyboardType?: "email-address" }) {
    return <View style={[styles.inputShell, { borderColor: border, flexDirection: "row-reverse" }, focused === field ? { shadowColor: colors.neonGlow, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6, borderTopColor: colors.appTheme.glass.topHighlight } as any : null]}><MaterialIcons name={icon} size={20} color={colors.muted} /><TextInput value={value} onChangeText={onChangeText} onFocus={() => setFocused(field)} onBlur={() => { setFocused(null); onBlur?.(); }} placeholder={placeholder} keyboardType={keyboardType} autoCapitalize={keyboardType ? "none" : "words"} placeholderTextColor={colors.muted} textAlign="right" style={styles.textInput} accessibilityLabel={accessibilityLabel} /></View>;
  }
  function LegalConsent({ value, onValueChange }: { value: boolean; onValueChange: (value: boolean) => void }) {
    return <View style={styles.consent}><AppToggle value={value} onValueChange={onValueChange} isRTL activeColor={colors.primary} inactiveColor={colors.border} accessibilityLabel="الموافقة على الشروط والأحكام وسياسة الخصوصية" /><View style={styles.flex}><ThemedText variant="bodySmall" style={styles.consentTitle}>أوافق على الشروط والأحكام وسياسة الخصوصية</ThemedText><View style={styles.links}><Pressable accessibilityRole="link" onPress={() => router.push("/legal/terms")}><ThemedText variant="label" color={colors.primary} style={styles.link}>الشروط والأحكام</ThemedText></Pressable><ThemedText variant="label" color={colors.muted} style={styles.join}>، </ThemedText><Pressable accessibilityRole="link" onPress={() => router.push("/legal/privacy")}><ThemedText variant="label" color={colors.primary} style={styles.link}>سياسة الخصوصية</ThemedText></Pressable><ThemedText variant="label" color={colors.muted} style={styles.join}>، و</ThemedText><Pressable accessibilityRole="link" onPress={() => router.push("/legal/conditions")}><ThemedText variant="label" color={colors.primary} style={styles.link}>الأحكام التشغيلية</ThemedText></Pressable></View></View></View>;
  }
  function FieldValidation({ error, valid, successText }: { error: string | null; valid: boolean; successText: string }) {
    if (!error && !valid) return null;
    const color = error ? colors.error : colors.success;
    return <View accessibilityLiveRegion="polite" style={styles.fieldValidation}><MaterialIcons name={error ? "error-outline" : "check-circle-outline"} size={15} color={color} /><ThemedText variant="caption" color={color} style={styles.fieldValidationText}>{error ?? successText}</ThemedText></View>;
  }
  function Feedback({ text, color, icon }: { text: string; color: string; icon: "error-outline" | "info-outline" }) {
    return <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: color + "62", backgroundColor: color + "12" }]}><MaterialIcons name={icon} size={18} color={color} /><ThemedText variant="caption" color={color} style={styles.feedbackText}>{text}</ThemedText></View>;
  }

return <ScreenContainer containerClassName="bg-transparent" safeAreaClassName="bg-transparent" edges={["top", "bottom", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><View style={styles.shell}>
      {standaloneRegister ? <Pressable accessibilityRole="button" accessibilityLabel="العودة إلى تسجيل الدخول" onPress={() => router.replace("/auth/login")} style={({ pressed }) => [styles.back, { opacity: pressed ? 0.65 : 1 }]}><MaterialIcons name="arrow-forward" size={22} color={colors.primary} /><ThemedText variant="label" color={colors.primary} style={styles.backText}>رجوع</ThemedText></Pressable> : null}
      <View style={styles.brandArea}><View style={styles.glow}><View style={styles.logoWrap}><Image source={require("../assets/images/stayin-logo.jpg")} style={styles.logo} accessibilityLabel="StayIn" /></View></View><ThemedText variant="label" color={colors.primary} style={styles.brand}>StayIn</ThemedText><ThemedText variant="titleLarge" style={styles.title}>{tab === "login" ? "أهلاً بك مجدداً" : "أنشئ حسابك بسهولة"}</ThemedText><ThemedText variant="bodySmall" color={colors.muted} style={styles.subtitle}>{tab === "login" ? "سجّل دخولك لإدارة وحداتك وعقاراتك بكل سهولة" : "سنكمل التحقق عبر بوابة الهوية الآمنة، ثم يمكنك إنشاء منشأتك أو اختيارها."}</ThemedText></View>
      <View style={styles.tabs}><TabButton label="تسجيل الدخول" selected={tab === "login"} onPress={() => changeTab("login")} /><TabButton label="إنشاء حساب" selected={tab === "register"} onPress={() => changeTab("register")} /></View>
      <Animated.View style={{ opacity: formOpacity }}>
        {tab === "register" ? <><ThemedText variant="label" style={styles.label}>الاسم الكامل</ThemedText><Input icon="person-outline" value={name} onChangeText={(value) => { setName(value); touch("name"); resetFeedback(); }} onBlur={() => touch("name")} placeholder="محمد عجلوني" field="name" focused={focused} setFocused={setFocused} border={fieldBorder("name", Boolean(nameLiveError))} accessibilityLabel="الاسم الكامل" /><FieldValidation error={nameLiveError} valid={nameIsValid} successText="الاسم الكامل صالح." /></> : null}
        <ThemedText variant="label" style={cx(styles.choice, tab === "register" && styles.choiceAfterName)}>{tab === "login" ? "اختر طريقة الدخول" : "اختر طريقة التحقق"}</ThemedText>
        <View style={styles.methodToggle}>{(["phone", "email"] as const).map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: method === item }} onPress={() => { setMethod(item); resetFeedback(); }} style={({ pressed }) => [styles.method, method === item && styles.methodActive, { opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={item === "phone" ? "phone-iphone" : "mail-outline"} size={16} color={method === item ? colors.background : colors.muted} /><ThemedText style={cx(styles.methodText, method === item && styles.methodTextActive)}>{item === "phone" ? "رقم الهاتف" : "البريد الإلكتروني"}</ThemedText></Pressable>)}</View>
        <ThemedText variant="label" style={styles.contactLabel}>{label}</ThemedText>
        {method === "phone" ? <><View style={[styles.phoneShell, { borderColor: fieldBorder("contact", Boolean(contactLiveError)) }, fieldGlow("contact")]}><TextInput value={contact} onChangeText={(value) => { setContact(value); touch("contact"); resetFeedback(); }} onFocus={() => setFocused("contact")} onBlur={() => { setFocused(null); touch("contact"); }} placeholder="79 XXX XXXX" keyboardType="phone-pad" returnKeyType="next" placeholderTextColor={colors.muted} textAlign="left" style={styles.phoneInput} accessibilityLabel="رقم الهاتف" /><Pressable accessibilityRole="button" accessibilityLabel="رمز دولة الأردن" onPress={() => Alert.alert("رمز الدولة", "رمز الأردن +962 مُحدد حاليًا.")} style={styles.country}><ThemedText style={styles.flag}>🇯🇴</ThemedText><ThemedNumber style={styles.countryCode}>+962</ThemedNumber><MaterialIcons name="arrow-drop-down" size={17} color={colors.muted} /></Pressable></View><FieldValidation error={contactLiveError} valid={contactIsValid} successText="رقم الهاتف يبدو صحيحًا." /></> : <><Input icon="alternate-email" value={contact} onChangeText={(value) => { setContact(value); touch("contact"); resetFeedback(); }} onBlur={() => touch("contact")} placeholder="name@example.com" field="contact" focused={focused} setFocused={setFocused} border={fieldBorder("contact", Boolean(contactLiveError))} accessibilityLabel="البريد الإلكتروني" keyboardType="email-address" /><FieldValidation error={contactLiveError} valid={contactIsValid} successText="البريد الإلكتروني يبدو صحيحًا." /></>}
        <ThemedText variant="label" style={[styles.label, styles.passwordLabel]}>كلمة المرور أو رمز الدخول</ThemedText>
        <View style={[styles.inputShell, { borderColor: fieldBorder("secret"), flexDirection: "row-reverse" }, fieldGlow("secret")]}><MaterialIcons name="lock-outline" size={20} color={colors.muted} /><TextInput value={secret} onChangeText={setSecret} onFocus={() => setFocused("secret")} onBlur={() => setFocused(null)} placeholder="أدخل كلمة المرور" secureTextEntry={!showSecret} placeholderTextColor={colors.muted} textAlign="right" style={styles.textInput} accessibilityLabel="كلمة المرور أو رمز الدخول" /><Pressable accessibilityRole="button" accessibilityLabel={showSecret ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onPress={() => setShowSecret((value) => !value)}><MaterialIcons name={showSecret ? "visibility-off" : "visibility"} size={21} color={colors.primary} /></Pressable></View>
        {tab === "register" ? <><ThemedText variant="caption" color={colors.muted} style={styles.identityHint}>لا تُحفظ كلمة المرور داخل التطبيق؛ يُستكمل التحقق عبر بوابة الهوية الآمنة.</ThemedText><LegalConsent value={accepted} onValueChange={setAccepted} /></> : <><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/auth/forgot-password", params: { mode: method, identifier: loginContact.trim() } })} style={styles.forgot}><ThemedText variant="label" color={colors.primary} style={styles.forgotText}>نسيت كلمة المرور؟</ThemedText></Pressable><View style={styles.remember}><AppToggle value={activeSession.rememberMe} onValueChange={(value) => void setRememberMe(value)} isRTL activeColor={colors.primary} inactiveColor={colors.border} accessibilityLabel="تبديل تذكرني" /><View style={styles.flex}><ThemedText variant="body" style={styles.rememberTitle}>تذكرني</ThemedText><ThemedText variant="caption" color={colors.muted} style={styles.rememberHint}>البقاء مسجلاً على هذا الجهاز</ThemedText></View></View></>}
        {error ? <Feedback text={error} color={colors.error} icon="error-outline" /> : null}{message ? <Feedback text={message} color={colors.success} icon="info-outline" /> : null}
      </Animated.View>
      <Pressable disabled={isBusy} accessibilityRole="button" accessibilityState={{ busy: isBusy }} onPress={() => void submit()} style={({ pressed }) => [styles.primaryWrap, { opacity: pressed || isBusy ? 0.68 : 1 }]}><LinearGradient colors={[colors.primary, colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>{busy === tab ? <ActivityIndicator color={colors.foreground} /> : <MaterialIcons name="arrow-back" size={21} color={colors.foreground} />}<ThemedText variant="button" color={colors.foreground} style={styles.primaryText}>{busy === tab ? (tab === "login" ? "جارٍ فتح بوابة الدخول…" : "جارٍ بدء إنشاء الحساب…") : (tab === "login" ? "تسجيل الدخول" : "إنشاء حساب ومتابعة")}</ThemedText></LinearGradient></Pressable>
      {tab === "login" ? <View style={styles.bioArea}><View style={styles.bioWrap}><Animated.View style={[styles.bioPulse, { borderColor: biometricAvailable ? colors.primary : colors.border, transform: [{ scale: pulse }] }]} /><Pressable disabled={isBusy} accessibilityRole="button" accessibilityState={{ busy: isBusy }} accessibilityLabel="تسجيل الدخول السريع بالبصمة أو بصمة الوجه" onPress={() => void biometricLogin()} style={styles.bioButton}>{busy === "biometric" ? <ActivityIndicator color={colors.primary} size="large" /> : <MaterialIcons name="fingerprint" size={42} color={biometricAvailable ? colors.primary : colors.muted} />}</Pressable></View><ThemedText variant="title" style={styles.bioTitle}>تسجيل الدخول السريع بالبصمة</ThemedText><ThemedText variant="caption" color={colors.muted} style={styles.bioHint}>استخدم البصمة أو بصمة الوجه عند تفعيلها من أمان الحساب</ThemedText></View> : null}
      <View style={styles.footer}><ThemedText variant="caption" color={colors.muted} style={styles.footerText}>{tab === "login" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}</ThemedText><Pressable accessibilityRole="link" onPress={() => changeTab(tab === "login" ? "register" : "login")}><ThemedText variant="label" color={colors.primary} style={styles.footerLink}>{tab === "login" ? "أنشئ حساباً جديداً" : "تسجيل الدخول"}</ThemedText></Pressable></View>
      {isAuthenticated && tab === "login" ? <Pressable onPress={() => router.replace("/workspace-gate")} style={styles.workspace}><ThemedText variant="label" color={colors.primary} style={styles.footerLink}>الانتقال إلى منشآتي</ThemedText></Pressable> : null}
    </View></ScrollView>
  </ScreenContainer>;
}

function makeStyles(colors: ReturnType<typeof useColors>, isRTL: boolean) {
  return StyleSheet.create({
    content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 28, paddingBottom: 34 },
    shell: { width: "100%", maxWidth: 440, alignSelf: "center" },
    back: { alignSelf: "flex-end", minHeight: 40, alignItems: "center", flexDirection: "row", gap: 5, marginBottom: 12 },
    backText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
    brandArea: { alignItems: "center", marginBottom: 26 },
    glow: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.26, shadowRadius: 22, elevation: 10 },
    logoWrap: { width: 84, height: 84, borderRadius: 42, overflow: "hidden", borderWidth: 1, borderColor: colors.primary + "88" },
    logo: { width: 82, height: 82 },
    brand: { color: colors.primary, fontSize: 16, fontWeight: "900", marginTop: 13 },
    title: { alignSelf: "stretch", color: colors.foreground, fontSize: 27, fontWeight: "900", marginTop: 9, textAlign: "right" },
    subtitle: { alignSelf: "stretch", color: colors.muted, fontSize: 13, lineHeight: 21, marginTop: 7, textAlign: "right" },
    tabs: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 22 },
    tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", position: "relative" },
    tabText: { color: colors.muted, fontSize: 17, fontWeight: "800", lineHeight: 22 },
    tabActive: { color: colors.foreground, fontWeight: "900", lineHeight: 22 },
    indicator: { position: "absolute", right: 16, left: 16, bottom: -1, height: 3, borderRadius: 3, backgroundColor: colors.primary },
    choice: { color: colors.muted, fontSize: 12, fontWeight: "800", marginBottom: 9, textAlign: "right" },
    choiceAfterName: { marginTop: 18 },
    methodToggle: { minHeight: 48, borderRadius: 16, padding: 4, backgroundColor: colors.appTheme.glass.cardBg, borderWidth: 1, borderColor: colors.appTheme.glass.borderColor, flexDirection: "row-reverse", gap: 4 },
    method: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, paddingHorizontal: 8 },
    methodActive: { backgroundColor: colors.primary },
    methodText: { color: colors.muted, fontSize: 12, fontWeight: "800", lineHeight: 16 },
    methodTextActive: { color: colors.background, fontWeight: "900", lineHeight: 16 },
    label: { color: colors.muted, fontSize: 12, fontWeight: "800", marginBottom: 8, textAlign: "right" },
    contactLabel: { marginTop: 20 },
    passwordLabel: { marginTop: 18 },
    inputShell: { minHeight: colors.appTheme.input.height, borderRadius: colors.appTheme.input.radius, borderWidth: 1, paddingHorizontal: 14, backgroundColor: colors.appTheme.input.bg, borderColor: colors.appTheme.input.borderColor, alignItems: "center", gap: 10 },
    textInput: { flex: 1, minWidth: 0, minHeight: 52, fontSize: 15, color: colors.foreground, paddingVertical: 12 },
    fieldValidation: { minHeight: 20, marginTop: 6, flexDirection: "row-reverse", alignItems: "center", justifyContent: "flex-start", gap: 5 },
    fieldValidationText: { fontSize: 11, fontWeight: "800", lineHeight: 16, textAlign: "right" },
    phoneShell: { minHeight: colors.appTheme.input.height, borderRadius: colors.appTheme.input.radius, borderWidth: 1, backgroundColor: colors.appTheme.input.bg, borderColor: colors.appTheme.input.borderColor, overflow: "hidden", position: "relative", justifyContent: "center" },
    phoneInput: { minHeight: 58, color: colors.foreground, fontSize: 16, paddingStart: 130, paddingEnd: 16, writingDirection: "ltr" },
    country: { position: "absolute", top: 0, bottom: 0, [isRTL ? "left" : "right"]: 0, minWidth: 122, paddingHorizontal: 11, [isRTL ? "borderRightWidth" : "borderLeftWidth"]: 1, [isRTL ? "borderRightColor" : "borderLeftColor"]: colors.border, backgroundColor: colors.surfaceMuted, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 4 },
    flag: { fontSize: 16 },
    countryCode: { color: colors.primary, fontWeight: "900", writingDirection: "ltr" },
    identityHint: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 7, textAlign: "right" },
    forgot: { alignSelf: "flex-start", marginTop: 13 },
    forgotText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
    remember: { alignItems: "center", gap: 10, flexDirection: "row-reverse", marginTop: 18 },
    flex: { flex: 1, minWidth: 0 },
    rememberTitle: { color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: "right" },
    rememberHint: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: "right" },
    consent: { alignItems: "center", gap: 10, minHeight: 76, borderWidth: 1, borderRadius: 16, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 13, marginTop: 18, flexDirection: "row-reverse" },
    consentTitle: { color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: "right" },
    links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 2 },
    link: { color: colors.primary, fontSize: 11, fontWeight: "900" },
    join: { color: colors.muted, fontSize: 11 },
    feedback: { minHeight: 40, borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
    feedbackText: { fontSize: 12, fontWeight: "800", lineHeight: 18, textAlign: "right", flex: 1 },
    primaryWrap: { marginTop: 24, borderRadius: 30, overflow: "hidden", shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: colors.appTheme.shadow.opacity, shadowRadius: colors.appTheme.shadow.radius, elevation: colors.appTheme.shadow.elevation },
    primary: { minHeight: 58, borderRadius: 30, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
    primaryText: { color: colors.foreground, fontSize: 16, fontWeight: "900" },
    bioArea: { alignItems: "center", marginTop: 34 },
    bioWrap: { width: 124, height: 124, alignItems: "center", justifyContent: "center" },
    bioPulse: { position: "absolute", width: 112, height: 112, borderRadius: 56, borderWidth: 1, backgroundColor: colors.appTheme.glass.cardBg, borderColor: colors.appTheme.glass.borderColor, borderTopColor: colors.appTheme.glass.topHighlight },
    bioButton: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", backgroundColor: colors.appTheme.glass.cardBgElevated, borderWidth: 1, borderColor: colors.neonBorder, shadowColor: colors.neonGlow, shadowOpacity: 0.22, shadowRadius: 12, elevation: 6 },
    bioTitle: { color: colors.foreground, fontSize: 14, fontWeight: "900", marginTop: 10, textAlign: "center" },
    bioHint: { color: colors.muted, fontSize: 11, lineHeight: 17, maxWidth: 280, marginTop: 5, textAlign: "center" },
    footer: { alignSelf: "center", alignItems: "center", gap: 6, marginTop: 30, flexDirection: "row-reverse" },
    footerText: { color: colors.muted, fontSize: 12 },
    footerLink: { color: colors.primary, fontSize: 12, fontWeight: "900" },
    workspace: { marginTop: 18, alignSelf: "center" },
  });
}