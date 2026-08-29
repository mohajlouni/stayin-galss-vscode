import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { ScreenContainer } from "@/components/screen-container";
import { startOAuthLogin, getApiBaseUrl } from "@/constants/oauth";
import { useAuthSession } from "@/lib/auth-session";
import { LEGAL_VERSIONS, savePendingRegistration } from "@/lib/legal-consent";
import { normalizeInternationalPhone } from "@/lib/phone-number";

const C = { bg: "#070B10", deep: "#070B10", surface: "rgba(15, 22, 33, 0.30)", raised: "rgba(7, 12, 20, 0.38)", border: "rgba(255, 255, 255, 0.14)", primary: "#FF6B47", emerald: "#E85D3C", teal: "#FFAA92", white: "#F8FAFC", label: "#B2C0D3", mint: "#FFB5A4", muted: "#8092A8", error: "#FCA5A5" } as const;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Tab = "login" | "register";
type Method = "phone" | "email";
type Busy = "login" | "register" | "biometric" | null;
type ValidatedField = "name" | "contact";

export function UnifiedAuthScreen({ initialTab = "login", standaloneRegister = false }: { initialTab?: Tab; standaloneRegister?: boolean }) {
  const { isAuthenticated, biometricAvailable, activeSession, setRememberMe, unlockWithBiometrics } = useAuthSession();
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
      try {
        const phone = method === "phone" ? normalizePhone(contact).value : null;
        await savePendingRegistration({ name: name.trim(), contactType: method, phone: phone ?? null, email: method === "email" ? contact.trim().toLowerCase() : null, acceptedAt: new Date().toISOString(), termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy, conditionsVersion: LEGAL_VERSIONS.conditions });
      } catch { setMessage("تعذر تجهيز طلب إنشاء الحساب على هذا الجهاز. أعد المحاولة."); return; }
    }
    await beginOAuth(tab);
  };
  const biometricLogin = async () => {
    if (!biometricAvailable || !isAuthenticated || !activeSession.biometricsEnabled) { setMessage("الدخول السريع بالبصمة غير مفعّل بعد. سجّل دخولًا مرة واحدة، ثم فعّله من أمان الحساب."); return; }
    setBusy("biometric");
    try { if (await unlockWithBiometrics()) { router.replace("/workspace-gate"); return; } setMessage("لم يكتمل التحقق بالبصمة. يمكنك المحاولة مجددًا أو المتابعة عبر بوابة الهوية."); }
    catch { setMessage("تعذر الوصول إلى البصمة أو بصمة الوجه على هذا الجهاز حاليًا."); }
    finally { setBusy(null); }
  };
  const previewLogin = () => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    window.location.href = `${getApiBaseUrl()}/api/dev/preview-login`;
  };
  const fieldBorder = (key: string, invalid = false) => invalid ? C.error : focused === key ? C.primary : C.border;
  const label = method === "phone" ? "رقم الهاتف" : "البريد الإلكتروني";
  const nameLiveError = touched.name ? validateName(name) : null;
  const contactLiveError = touched.contact ? validateContact(contact) : null;
  const nameIsValid = touched.name && !nameLiveError && Boolean(name.trim());
  const contactIsValid = touched.contact && !contactLiveError && Boolean(contact.trim());
  const touch = (field: ValidatedField) => setTouched((current) => current[field] ? current : { ...current, [field]: true });

  return <ScreenContainer containerClassName="bg-transparent" safeAreaClassName="bg-transparent" edges={["top", "bottom", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><View style={styles.shell}>
      {standaloneRegister ? <Pressable accessibilityRole="button" accessibilityLabel="العودة إلى تسجيل الدخول" onPress={() => router.replace("/auth/login")} style={({ pressed }) => [styles.back, { opacity: pressed ? 0.65 : 1 }]}><MaterialIcons name="arrow-forward" size={22} color={C.mint} /><Text style={styles.backText}>رجوع</Text></Pressable> : null}
      <View style={styles.brandArea}><View style={styles.glow}><View style={styles.logoWrap}><Image source={require("../assets/images/stayin-logo.jpg")} style={styles.logo} accessibilityLabel="StayIn" /></View></View><Text style={styles.brand}>StayIn</Text><Text style={styles.title}>{tab === "login" ? "أهلاً بك مجدداً" : "أنشئ حسابك بسهولة"}</Text><Text style={styles.subtitle}>{tab === "login" ? "سجّل دخولك لإدارة وحداتك وعقاراتك بكل سهولة" : "سنكمل التحقق عبر بوابة الهوية الآمنة، ثم يمكنك إنشاء منشأتك أو اختيارها."}</Text></View>
      <View style={styles.tabs}><TabButton label="تسجيل الدخول" selected={tab === "login"} onPress={() => changeTab("login")} /><TabButton label="إنشاء حساب" selected={tab === "register"} onPress={() => changeTab("register")} /></View>
      <Animated.View style={{ opacity: formOpacity }}>
        {tab === "register" ? <><Text style={styles.label}>الاسم الكامل</Text><Input icon="person-outline" value={name} onChangeText={(value) => { setName(value); touch("name"); resetFeedback(); }} onBlur={() => touch("name")} placeholder="محمد عجلوني" field="name" focused={focused} setFocused={setFocused} border={fieldBorder("name", Boolean(nameLiveError))} accessibilityLabel="الاسم الكامل" /><FieldValidation error={nameLiveError} valid={nameIsValid} successText="الاسم الكامل صالح." /></> : null}
        <Text style={[styles.choice, tab === "register" && styles.choiceAfterName]}>{tab === "login" ? "اختر طريقة الدخول" : "اختر طريقة التحقق"}</Text>
        <View style={styles.methodToggle}>{(["phone", "email"] as const).map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: method === item }} onPress={() => { setMethod(item); resetFeedback(); }} style={({ pressed }) => [styles.method, method === item && styles.methodActive, { opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={item === "phone" ? "phone-iphone" : "mail-outline"} size={16} color={method === item ? C.deep : C.label} /><Text style={[styles.methodText, method === item && styles.methodTextActive]}>{item === "phone" ? "رقم الهاتف" : "البريد الإلكتروني"}</Text></Pressable>)}</View>
        <Text style={[styles.label, styles.contactLabel]}>{label}</Text>
        {method === "phone" ? <><View style={[styles.phoneShell, { borderColor: fieldBorder("contact", Boolean(contactLiveError)) }]}><TextInput value={contact} onChangeText={(value) => { setContact(value); touch("contact"); resetFeedback(); }} onFocus={() => setFocused("contact")} onBlur={() => { setFocused(null); touch("contact"); }} placeholder="79 XXX XXXX" keyboardType="phone-pad" returnKeyType="next" placeholderTextColor={C.muted} textAlign="left" style={styles.phoneInput} accessibilityLabel="رقم الهاتف" /><Pressable accessibilityRole="button" accessibilityLabel="رمز دولة الأردن" onPress={() => Alert.alert("رمز الدولة", "رمز الأردن +962 مُحدد حاليًا.")} style={styles.country}><Text style={styles.flag}>🇯🇴</Text><Text style={styles.countryCode}>+962</Text><MaterialIcons name="arrow-drop-down" size={17} color={C.label} /></Pressable></View><FieldValidation error={contactLiveError} valid={contactIsValid} successText="رقم الهاتف يبدو صحيحًا." /></> : <><Input icon="alternate-email" value={contact} onChangeText={(value) => { setContact(value); touch("contact"); resetFeedback(); }} onBlur={() => touch("contact")} placeholder="name@example.com" field="contact" focused={focused} setFocused={setFocused} border={fieldBorder("contact", Boolean(contactLiveError))} accessibilityLabel="البريد الإلكتروني" keyboardType="email-address" /><FieldValidation error={contactLiveError} valid={contactIsValid} successText="البريد الإلكتروني يبدو صحيحًا." /></>}
        <Text style={[styles.label, styles.passwordLabel]}>كلمة المرور أو رمز الدخول</Text>
        <View style={[styles.inputShell, { borderColor: fieldBorder("secret"), flexDirection: "row-reverse" }]}><MaterialIcons name="lock-outline" size={20} color={C.label} /><TextInput value={secret} onChangeText={setSecret} onFocus={() => setFocused("secret")} onBlur={() => setFocused(null)} placeholder="أدخل كلمة المرور" secureTextEntry={!showSecret} placeholderTextColor={C.muted} textAlign="right" style={styles.textInput} accessibilityLabel="كلمة المرور أو رمز الدخول" /><Pressable accessibilityRole="button" accessibilityLabel={showSecret ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onPress={() => setShowSecret((value) => !value)}><MaterialIcons name={showSecret ? "visibility-off" : "visibility"} size={21} color={C.primary} /></Pressable></View>
        {tab === "register" ? <><Text style={styles.identityHint}>لا تُحفظ كلمة المرور داخل التطبيق؛ يُستكمل التحقق عبر بوابة الهوية الآمنة.</Text><LegalConsent value={accepted} onValueChange={setAccepted} /></> : <><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/auth/forgot-password", params: { mode: method, identifier: loginContact.trim() } })} style={styles.forgot}><Text style={styles.forgotText}>نسيت كلمة المرور؟</Text></Pressable><View style={styles.remember}><AppToggle value={activeSession.rememberMe} onValueChange={(value) => void setRememberMe(value)} isRTL activeColor={C.primary} inactiveColor={C.border} accessibilityLabel="تبديل تذكرني" /><View style={styles.flex}><Text style={styles.rememberTitle}>تذكرني</Text><Text style={styles.rememberHint}>البقاء مسجلاً على هذا الجهاز</Text></View></View></>}
        {error ? <Feedback text={error} color={C.error} icon="error-outline" /> : null}{message ? <Feedback text={message} color={C.mint} icon="info-outline" /> : null}
      </Animated.View>
      <Pressable disabled={isBusy} accessibilityRole="button" accessibilityState={{ busy: isBusy }} onPress={() => void submit()} style={({ pressed }) => [styles.primaryWrap, { opacity: pressed || isBusy ? 0.68 : 1 }]}><LinearGradient colors={[C.primary, C.emerald, C.teal]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>{busy === tab ? <ActivityIndicator color={C.white} /> : <MaterialIcons name="arrow-back" size={21} color={C.white} />}<Text style={styles.primaryText}>{busy === tab ? (tab === "login" ? "جارٍ فتح بوابة الدخول…" : "جارٍ بدء إنشاء الحساب…") : (tab === "login" ? "تسجيل الدخول" : "إنشاء حساب ومتابعة")}</Text></LinearGradient></Pressable>
      {process.env.NODE_ENV !== "production" && Platform.OS === "web" ? <Pressable accessibilityRole="button" disabled={isBusy} onPress={previewLogin} style={({ pressed }) => [styles.previewButton, { borderColor: C.border, backgroundColor: C.surface, opacity: pressed || isBusy ? 0.68 : 1 }]}><MaterialIcons name="desktop-mac" size={16} color={C.mint} /><Text style={styles.previewText}>دخول المعاينة (محلي)</Text></Pressable> : null}
      {tab === "login" ? <View style={styles.bioArea}><View style={styles.bioWrap}><Animated.View style={[styles.bioPulse, { borderColor: biometricAvailable ? C.primary : C.border, transform: [{ scale: pulse }] }]} /><Pressable disabled={isBusy} accessibilityRole="button" accessibilityState={{ busy: isBusy }} accessibilityLabel="تسجيل الدخول السريع بالبصمة أو بصمة الوجه" onPress={() => void biometricLogin()} style={styles.bioButton}>{busy === "biometric" ? <ActivityIndicator color={C.primary} size="large" /> : <MaterialIcons name="fingerprint" size={42} color={biometricAvailable ? C.primary : C.label} />}</Pressable></View><Text style={styles.bioTitle}>تسجيل الدخول السريع بالبصمة</Text><Text style={styles.bioHint}>استخدم البصمة أو بصمة الوجه عند تفعيلها من أمان الحساب</Text></View> : null}
      <View style={styles.footer}><Text style={styles.footerText}>{tab === "login" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}</Text><Pressable accessibilityRole="link" onPress={() => changeTab(tab === "login" ? "register" : "login")}><Text style={styles.footerLink}>{tab === "login" ? "أنشئ حساباً جديداً" : "تسجيل الدخول"}</Text></Pressable></View>
      {isAuthenticated && tab === "login" ? <Pressable onPress={() => router.replace("/workspace-gate")} style={styles.workspace}><Text style={styles.footerLink}>الانتقال إلى منشآتي</Text></Pressable> : null}
    </View></ScrollView>
  </ScreenContainer>;
}

function TabButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={styles.tab}><Text style={[styles.tabText, selected && styles.tabActive]}>{label}</Text>{selected ? <View style={styles.indicator} /> : null}</Pressable>; }
function Input({ icon, value, onChangeText, onBlur, placeholder, field, focused, setFocused, border, accessibilityLabel, keyboardType }: { icon: "person-outline" | "alternate-email"; value: string; onChangeText: (value: string) => void; onBlur?: () => void; placeholder: string; field: string; focused: string | null; setFocused: (value: string | null) => void; border: string; accessibilityLabel: string; keyboardType?: "email-address" }) { return <View style={[styles.inputShell, { borderColor: border, flexDirection: "row-reverse" }]}><MaterialIcons name={icon} size={20} color={C.label} /><TextInput value={value} onChangeText={onChangeText} onFocus={() => setFocused(field)} onBlur={() => { setFocused(null); onBlur?.(); }} placeholder={placeholder} keyboardType={keyboardType} autoCapitalize={keyboardType ? "none" : "words"} placeholderTextColor={C.muted} textAlign="right" style={styles.textInput} accessibilityLabel={accessibilityLabel} /></View>; }
function LegalConsent({ value, onValueChange }: { value: boolean; onValueChange: (value: boolean) => void }) { return <View style={styles.consent}><AppToggle value={value} onValueChange={onValueChange} isRTL activeColor={C.primary} inactiveColor={C.border} accessibilityLabel="الموافقة على الشروط والأحكام وسياسة الخصوصية" /><View style={styles.flex}><Text style={styles.consentTitle}>أوافق على الشروط والأحكام وسياسة الخصوصية</Text><View style={styles.links}><Pressable accessibilityRole="link" onPress={() => router.push("/legal/terms")}><Text style={styles.link}>الشروط والأحكام</Text></Pressable><Text style={styles.join}>، </Text><Pressable accessibilityRole="link" onPress={() => router.push("/legal/privacy")}><Text style={styles.link}>سياسة الخصوصية</Text></Pressable><Text style={styles.join}>، و</Text><Pressable accessibilityRole="link" onPress={() => router.push("/legal/conditions")}><Text style={styles.link}>الأحكام التشغيلية</Text></Pressable></View></View></View>; }
function FieldValidation({ error, valid, successText }: { error: string | null; valid: boolean; successText: string }) { if (!error && !valid) return null; const color = error ? C.error : C.mint; return <View accessibilityLiveRegion="polite" style={styles.fieldValidation}><MaterialIcons name={error ? "error-outline" : "check-circle-outline"} size={15} color={color} /><Text style={[styles.fieldValidationText, { color }]}>{error ?? successText}</Text></View>; }
function Feedback({ text, color, icon }: { text: string; color: string; icon: "error-outline" | "info-outline" }) { return <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: color + "62", backgroundColor: color + "12" }]}><MaterialIcons name={icon} size={18} color={color} /><Text style={[styles.feedbackText, { color }]}>{text}</Text></View>; }

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 28, paddingBottom: 34 }, shell: { width: "100%", maxWidth: 440, alignSelf: "center" }, back: { alignSelf: "flex-end", minHeight: 40, alignItems: "center", flexDirection: "row", gap: 5, marginBottom: 12 }, backText: { color: C.mint, fontSize: 13, fontWeight: "900" }, brandArea: { alignItems: "center", marginBottom: 26 }, glow: { width: 104, height: 104, borderRadius: 52, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.26, shadowRadius: 22, elevation: 10 }, logoWrap: { width: 84, height: 84, borderRadius: 42, overflow: "hidden", borderWidth: 1, borderColor: C.primary + "88" }, logo: { width: 82, height: 82 }, brand: { color: C.mint, fontSize: 16, fontWeight: "900", marginTop: 13 }, title: { alignSelf: "stretch", color: C.white, fontSize: 27, fontWeight: "900", marginTop: 9, textAlign: "right" }, subtitle: { alignSelf: "stretch", color: C.label, fontSize: 13, lineHeight: 21, marginTop: 7, textAlign: "right" },
  tabs: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 22 }, tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", position: "relative" }, tabText: { color: C.muted, fontSize: 17, fontWeight: "800" }, tabActive: { color: C.white, fontWeight: "900" }, indicator: { position: "absolute", right: 16, left: 16, bottom: -1, height: 3, borderRadius: 3, backgroundColor: C.primary }, choice: { color: C.label, fontSize: 12, fontWeight: "800", marginBottom: 9, textAlign: "right" }, choiceAfterName: { marginTop: 18 }, methodToggle: { minHeight: 48, borderRadius: 16, padding: 4, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: "row-reverse", gap: 4 }, method: { flex: 1, minHeight: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, methodActive: { backgroundColor: C.primary }, methodText: { color: C.label, fontSize: 12, fontWeight: "800" }, methodTextActive: { color: C.deep, fontWeight: "900" },
  label: { color: C.label, fontSize: 12, fontWeight: "800", marginBottom: 8, textAlign: "right" }, contactLabel: { marginTop: 20 }, passwordLabel: { marginTop: 18 }, inputShell: { minHeight: 58, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, backgroundColor: C.surface, alignItems: "center", gap: 10 }, textInput: { flex: 1, minWidth: 0, minHeight: 56, fontSize: 15, color: C.white, paddingVertical: 12 }, fieldValidation: { minHeight: 20, marginTop: 6, flexDirection: "row-reverse", alignItems: "center", justifyContent: "flex-start", gap: 5 }, fieldValidationText: { fontSize: 11, fontWeight: "800", lineHeight: 16, textAlign: "right" }, phoneShell: { minHeight: 58, borderRadius: 18, borderWidth: 1, backgroundColor: C.surface, overflow: "hidden", position: "relative", justifyContent: "center" }, phoneInput: { minHeight: 58, color: C.white, fontSize: 16, paddingLeft: 16, paddingRight: 130, writingDirection: "ltr" }, country: { position: "absolute", right: 0, top: 0, bottom: 0, minWidth: 122, paddingHorizontal: 11, borderLeftWidth: 1, borderLeftColor: C.border, backgroundColor: C.raised, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 4 }, flag: { fontSize: 16 }, countryCode: { color: C.mint, fontWeight: "900", writingDirection: "ltr" }, identityHint: { color: C.muted, fontSize: 10, lineHeight: 16, marginTop: 7, textAlign: "right" }, forgot: { alignSelf: "flex-start", marginTop: 13 }, forgotText: { color: C.mint, fontSize: 13, fontWeight: "900" }, remember: { alignItems: "center", gap: 10, flexDirection: "row-reverse", marginTop: 18 }, flex: { flex: 1, minWidth: 0 }, rememberTitle: { color: C.white, fontSize: 13, fontWeight: "900", textAlign: "right" }, rememberHint: { color: C.muted, fontSize: 10, marginTop: 2, textAlign: "right" }, consent: { alignItems: "center", gap: 10, minHeight: 76, borderWidth: 1, borderRadius: 16, borderColor: C.border, backgroundColor: C.surface, paddingHorizontal: 13, marginTop: 18, flexDirection: "row-reverse" }, consentTitle: { color: C.white, fontSize: 12, fontWeight: "900", textAlign: "right" }, links: { alignSelf: "flex-end", flexDirection: "row-reverse", flexWrap: "wrap", marginTop: 5 }, link: { color: C.mint, fontSize: 11, fontWeight: "900" }, join: { color: C.label, fontSize: 11 }, feedback: { minHeight: 46, borderRadius: 14, borderWidth: 1, marginTop: 12, paddingHorizontal: 12, paddingVertical: 9, alignItems: "center", gap: 8, flexDirection: "row-reverse" }, feedbackText: { flex: 1, fontSize: 11, fontWeight: "800", lineHeight: 17, textAlign: "right" },
  primaryWrap: { marginTop: 24, borderRadius: 30, overflow: "hidden", shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 18, elevation: 7 }, primary: { minHeight: 58, borderRadius: 30, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 }, primaryText: { color: C.white, fontSize: 16, fontWeight: "900" }, bioArea: { alignItems: "center", marginTop: 34 }, bioWrap: { width: 124, height: 124, alignItems: "center", justifyContent: "center" }, bioPulse: { position: "absolute", width: 112, height: 112, borderRadius: 56, borderWidth: 1, backgroundColor: C.primary + "0D" }, bioButton: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", backgroundColor: C.raised, borderWidth: 1, borderColor: C.primary + "8A" }, bioTitle: { color: C.white, fontSize: 14, fontWeight: "900", marginTop: 10, textAlign: "center" }, bioHint: { color: C.muted, fontSize: 11, lineHeight: 17, maxWidth: 280, marginTop: 5, textAlign: "center" }, previewButton: { minHeight: 46, borderRadius: 22, marginTop: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, previewText: { color: C.mint, fontSize: 13, fontWeight: "900" }, footer: { alignSelf: "center", alignItems: "center", gap: 6, marginTop: 30, flexDirection: "row-reverse" }, footerText: { color: C.label, fontSize: 12 }, footerLink: { color: C.mint, fontSize: 12, fontWeight: "900" }, workspace: { marginTop: 18, alignSelf: "center" },
});
