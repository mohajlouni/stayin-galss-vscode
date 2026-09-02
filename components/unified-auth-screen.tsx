import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, TextInput, View, type ViewStyle, type TextStyle } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { ScreenContainer } from "@/components/screen-container";
import { ThemedText } from "@/components/themed-text";
import { useAuthSession } from "@/lib/auth-session";
import { LEGAL_VERSIONS, savePendingRegistration } from "@/lib/legal-consent";
import { AUTH_ERROR_MESSAGES, isSuperAdminCredential, requestEmailSignupOtp, signInSuperAdmin, signInWithPasswordFlow, socialSignIn, validateIdentifier, validatePassword } from "@/lib/supabase-otp";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

type Tab = "login" | "register";
type Busy = "login" | "register" | "biometric" | "google" | "apple" | null;
type ValidatedField = "name" | "loginIdentifier" | "loginPassword" | "email" | "phone" | "password" | "confirm";

type AuthColors = ReturnType<typeof useColors>;

type AuthStyles = ReturnType<typeof makeStyles>;

function cx(...styles: (false | null | undefined | TextStyle | {})[]) {
  return styles.filter((s): s is TextStyle => Boolean(s));
}

/* ------------------------------------------------------------------ *
 * Top-level presentational components (kept OUTSIDE the parent render *
 * tree so their identity never changes between renders — this is what *
 * prevents every keystroke from remounting the focused TextInput and  *
 * dropping cursor focus).                                             *
 * ------------------------------------------------------------------ */

function AuthInput(props: {
  colors: AuthColors;
  styles: AuthStyles;
  icon: "person-outline" | "alternate-email" | "lock-outline" | "phone-iphone";
  value: string;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  onBlur?: () => void;
  placeholder: string;
  border: string;
  glow: { shadowColor?: string; shadowOpacity?: number; shadowRadius?: number; elevation?: number; borderTopColor?: string } | null;
  accessibilityLabel: string;
  keyboardType?: "email-address" | "phone-pad";
  secureTextEntry?: boolean;
  showRevealToggle?: boolean;
  revealed?: boolean;
  onToggleReveal?: () => void;
  onSubmitEditing?: () => void;
}) {
  const { colors, styles, icon, value, onChangeText, onFocus, onBlur, placeholder, border, glow, accessibilityLabel, keyboardType, secureTextEntry, showRevealToggle, revealed, onToggleReveal, onSubmitEditing } = props;
  return (
    <View style={[styles.inputShell, { borderColor: border, flexDirection: "row-reverse" }, glow ?? null]}>
      <MaterialIcons name={icon} size={20} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={() => { onBlur?.(); }}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType ? "none" : "words"}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        placeholderTextColor={colors.muted}
        textAlign="right"
        style={styles.textInput}
        accessibilityLabel={accessibilityLabel}
        onSubmitEditing={onSubmitEditing}
      />
      {showRevealToggle ? (
        <Pressable accessibilityRole="button" accessibilityLabel={revealed ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onPress={onToggleReveal}>
          <MaterialIcons name={revealed ? "visibility-off" : "visibility"} size={21} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function TabButton(props: { colors: AuthColors; styles: AuthStyles; label: string; selected: boolean; onPress: () => void }) {
  const { colors, styles, label, selected, onPress } = props;
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={styles.tab}>
      <ThemedText variant="button" color={selected ? colors.foreground : colors.muted} style={cx(styles.tabText, selected && styles.tabActive)}>{label}</ThemedText>
      {selected ? <View style={styles.indicator} /> : null}
    </Pressable>
  );
}

function LegalConsent(props: { colors: AuthColors; styles: AuthStyles; value: boolean; onValueChange: (value: boolean) => void }) {
  const { colors, styles, value, onValueChange } = props;
  return (
    <View style={styles.consent}>
      <AppToggle value={value} onValueChange={onValueChange} isRTL activeColor={colors.primary} inactiveColor={colors.border} accessibilityLabel="الموافقة على الشروط والأحكام وسياسة الخصوصية" />
      <View style={styles.flex}>
        <ThemedText variant="bodySmall" style={styles.consentTitle}>أوافق على الشروط والأحكام وسياسة الخصوصية</ThemedText>
        <View style={styles.links}>
          <Pressable accessibilityRole="link" onPress={() => router.push("/legal/terms")}><ThemedText variant="label" color={colors.primary} style={styles.link}>الشروط والأحكام</ThemedText></Pressable>
          <ThemedText variant="label" color={colors.muted} style={styles.join}>، </ThemedText>
          <Pressable accessibilityRole="link" onPress={() => router.push("/legal/privacy")}><ThemedText variant="label" color={colors.primary} style={styles.link}>سياسة الخصوصية</ThemedText></Pressable>
          <ThemedText variant="label" color={colors.muted} style={styles.join}>، و</ThemedText>
          <Pressable accessibilityRole="link" onPress={() => router.push("/legal/conditions")}><ThemedText variant="label" color={colors.primary} style={styles.link}>الأحكام التشغيلية</ThemedText></Pressable>
        </View>
      </View>
    </View>
  );
}

function FieldValidation(props: { colors: AuthColors; styles: AuthStyles; error: string | null; valid: boolean; successText: string }) {
  const { colors, styles, error, valid, successText } = props;
  if (!error && !valid) return null;
  const color = error ? colors.error : colors.success;
  return (
    <View accessibilityLiveRegion="polite" style={styles.fieldValidation}>
      <MaterialIcons name={error ? "error-outline" : "check-circle-outline"} size={15} color={color} />
      <ThemedText variant="caption" color={color} style={styles.fieldValidationText}>{error ?? successText}</ThemedText>
    </View>
  );
}

function Feedback(props: { colors: AuthColors; styles: AuthStyles; text: string; color: string; icon: "error-outline" | "info-outline" }) {
  const { colors, styles, text, color, icon } = props;
  return (
    <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: color + "62", backgroundColor: color + "12" }]}>
      <MaterialIcons name={icon} size={18} color={color} />
      <ThemedText variant="caption" color={color} style={styles.feedbackText}>{text}</ThemedText>
    </View>
  );
}

function SocialButton(props: { colors: AuthColors; styles: AuthStyles; provider: "google" | "apple"; onPress: () => void; disabled: boolean }) {
  const { colors, styles, provider, onPress, disabled } = props;
  const label = provider === "google" ? "المتابعة عبر Google" : "المتابعة عبر Apple";
  return (
    <Pressable disabled={disabled} accessibilityRole="button" accessibilityState={{ busy: disabled }} onPress={onPress} style={({ pressed }) => [styles.social, { borderColor: colors.appTheme.glass.borderColor, backgroundColor: colors.appTheme.glass.cardBg, opacity: pressed || disabled ? 0.7 : 1 }]}>
      <MaterialIcons name={provider === "google" ? "g-translate" : "apple"} size={18} color={colors.foreground} />
      <ThemedText variant="button" color={colors.foreground} style={styles.socialText}>{label}</ThemedText>
    </Pressable>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rawErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export function UnifiedAuthScreen({ initialTab = "login", standaloneRegister = false }: { initialTab?: Tab; standaloneRegister?: boolean }) {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { isAuthenticated, biometricAvailable, activeSession, setRememberMe, unlockWithBiometrics, refresh } = useAuthSession();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [name, setName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<ValidatedField, boolean>>({ name: false, loginIdentifier: false, loginPassword: false, email: false, phone: false, password: false, confirm: false });

  const pulse = useRef(new Animated.Value(0.92)).current;
  const formOpacity = useRef(new Animated.Value(1)).current;
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
  const validateName = (value: string) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) return "أدخل الاسم الكامل للمتابعة.";
    if (normalized.length < 2) return "يجب أن يتكون الاسم الكامل من حرفين على الأقل.";
    if (!/[\p{L}]/u.test(normalized)) return "اكتب اسمًا صالحًا باستخدام أحرف واضحة.";
    return null;
  };
  const validateLoginIdentifier = (value: string) => {
    const result = validateIdentifier(value);
    if (!result.ok) {
      if (result.reason === "empty") return "أدخل البريد الإلكتروني أو رقم الهاتف للمتابعة.";
      return "أدخل بريدًا إلكترونيًا صحيحًا أو رقم هاتف أردنيًا (079 000 0000).";
    }
    return null;
  };
  const validateEmail = (value: string) => {
    const v = value.trim();
    if (!v) return "أدخل البريد الإلكتروني للمتابعة.";
    if (!EMAIL_PATTERN.test(v)) return "أدخل بريدًا إلكترونيًا صحيحًا، مثل name@example.com.";
    return null;
  };
  const validatePhone = (value: string) => {
    const v = value.trim();
    if (!v) return "أدخل رقم الهاتف للمتابعة.";
    const result = validateIdentifier(v);
    if (!result.ok || result.kind !== "phone") return "أدخل رقم هاتف أردنيًا صحيحًا، مثل 079 000 0000 أو +962790000000.";
    return null;
  };
  const validatePasswordValue = (value: string) => {
    if (!value.trim()) return "أدخل كلمة المرور للمتابعة.";
    return validatePassword(value);
  };
  const confirmMatches = password === confirmPassword && confirmPassword.length > 0;

  

  const runSuperAdminLogin = async (identifier: string, password: string, action: "login") => {
    setBusy("login"); setError(null); setMessage(null);
    try {
      const result = await signInSuperAdmin({ identifier, password, refresh });
      if (result.ok) { router.replace("/workspace-gate"); return; }
      setError(AUTH_ERROR_MESSAGES[result.error] ?? "");
    } catch (err) {
      console.error("[CRITICAL LOGIN ERROR]:", err);
      setError(rawErrorMessage(err));
    } finally { setBusy(null); }
  };

  const submitLogin = async () => {
    const invalidIdentifier = validateLoginIdentifier(loginIdentifier);
    if (invalidIdentifier) { setTouched((current) => ({ ...current, loginIdentifier: true })); setError(invalidIdentifier); return; }
    const classified = validateIdentifier(loginIdentifier);

    if (classified.ok && classified.kind === "phone") {
      // Super Admin phone + master password authenticates directly. Any other
      // phone is strictly rejected: the Sign In tab never auto-creates an
      // account nor opens the legacy identity portal (which accepted any
      // credentials). Registration happens only via the إنشاء حساب tab.
      if (isSuperAdminCredential(loginIdentifier, loginPassword)) {
        await runSuperAdminLogin(loginIdentifier.trim(), loginPassword, "login");
      } else {
        setError(AUTH_ERROR_MESSAGES.unregistered ?? "الحساب غير مسجل، يرجى إنشاء حساب جديد من تبويب إنشاء حساب");
      }
      return;
    }
    if (!classified.ok || classified.kind !== "email" || !classified.email) return;
    const email = classified.email;

    if (isSuperAdminCredential(email, loginPassword)) {
      await runSuperAdminLogin(email, loginPassword, "login");
      return;
    }

    const invalidPassword = validatePasswordValue(loginPassword);
    if (invalidPassword) { setTouched((current) => ({ ...current, loginPassword: true })); setError(invalidPassword); return; }
    setBusy("login"); setError(null); setMessage(null);
    try {
      const result = await signInWithPasswordFlow({ email, password: loginPassword, refresh });
      if (result.ok) { router.replace("/workspace-gate"); return; }
      setError(AUTH_ERROR_MESSAGES[result.error] ?? "");
    } catch (err) {
      console.error("[CRITICAL LOGIN ERROR]:", err);
      setError(rawErrorMessage(err));
    } finally { setBusy(null); }
  };

  const submitRegister = async () => {
    const invalidName = validateName(name);
    const invalidEmail = validateEmail(registerEmail);
    const invalidPhone = validatePhone(registerPhone);
    const invalidPassword = validatePasswordValue(password);
    if (invalidName) { setTouched((current) => ({ ...current, name: true })); setError(invalidName); return; }
    if (invalidEmail) { setTouched((current) => ({ ...current, email: true })); setError(invalidEmail); return; }
    if (invalidPhone) { setTouched((current) => ({ ...current, phone: true })); setError(invalidPhone); return; }
    if (invalidPassword) { setTouched((current) => ({ ...current, password: true })); setError(invalidPassword); return; }
    if (!confirmMatches) { setTouched((current) => ({ ...current, confirm: true })); setError("كلمتا المرور غير متطابقتين. تأكد منهما وأعد المحاولة."); return; }
    if (!accepted) { setError("يلزم قبول الشروط والأحكام وسياسة الخصوصية للمتابعة."); return; }

    const email = registerEmail.trim().toLowerCase();

    if (process.env.NODE_ENV === "production") {
      try {
        await savePendingRegistration({
          name: name.trim(),
          contactType: "email",
          phone: null,
          email,
          acceptedAt: new Date().toISOString(),
          termsVersion: LEGAL_VERSIONS.terms,
          privacyVersion: LEGAL_VERSIONS.privacy,
          conditionsVersion: LEGAL_VERSIONS.conditions,
        });
      } catch {
        setMessage("تعذر تجهيز طلب إنشاء الحساب على هذا الجهاز. أعد المحاولة.");
        return;
      }
    }

    setBusy("register"); setError(null); setMessage(null);
    try {
      const result = await requestEmailSignupOtp({ email, password, name });
      if (result.error) {
        setError(result.error === "not-configured"
          ? (language === "ar" ? "إنشاء الحساب عبر البريد الإلكتروني غير مفعّل بعد على هذا التطبيق." : "Email sign-up is not enabled on this app yet.")
          : result.error === "network"
            ? (language === "ar" ? "تعذر الاتصال بالشبكة. تحقق من اتصال الإنترنت ثم أعد المحاولة." : "Could not connect to the network. Check your internet and try again.")
            : (language === "ar" ? "تعذر إرسال رمز التحقق. أعد المحاولة." : "Could not send the verification code. Try again."));
        return;
      }
      router.push({ pathname: "/auth/otp", params: { email, mode: "signup", name: name.trim() } });
    } catch {
      setError(language === "ar" ? "تعذر إرسال رمز التحقق. تحقق من اتصال الإنترنت ثم أعد المحاولة." : "Could not send the verification code. Check your connection and try again.");
    } finally { setBusy(null); }
  };

  const submit = async () => {
    if (tab === "login") await submitLogin();
    else await submitRegister();
  };

  const biometricLogin = async () => {
    if (!biometricAvailable || !isAuthenticated || !activeSession.biometricsEnabled) { setMessage("الدخول السريع بالبصمة غير مفعّل بعد. سجّل دخولًا مرة واحدة، ثم فعّله من أمان الحساب."); return; }
    setBusy("biometric");
    try { if (await unlockWithBiometrics()) { router.replace("/workspace-gate"); return; } setMessage("لم يكتمل التحقق بالبصمة. يمكنك المحاولة مجددًا أو المتابعة عبر بوابة الهوية."); }
    catch { setMessage("تعذر الوصول إلى البصمة أو بصمة الوجه على هذا الجهاز حاليًا."); }
    finally { setBusy(null); }
  };

  const handleSocial = async (provider: "google" | "apple") => {
    resetFeedback(); setBusy(provider);
    try {
      const result = await socialSignIn({ provider, refresh });
      if (result.ok) { router.replace("/workspace-gate"); return; }
      setError(AUTH_ERROR_MESSAGES[result.error] ?? "");
    } catch (err) {
      console.error("[CRITICAL LOGIN ERROR]:", err);
      setError(rawErrorMessage(err));
    } finally { setBusy(null); }
  };

  const fieldBorder = (key: string, invalid = false) => invalid ? colors.error : focused === key ? colors.neonBorder : colors.appTheme.input.borderColor;
  const fieldGlow = (key: string) => focused === key ? { shadowColor: colors.neonGlow, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6, borderTopColor: colors.appTheme.glass.topHighlight } : null;

  const nameLiveError = touched.name ? validateName(name) : null;
  const loginIdentifierLiveError = touched.loginIdentifier ? validateLoginIdentifier(loginIdentifier) : null;
  const loginPasswordLiveError = touched.loginPassword ? validatePasswordValue(loginPassword) : null;
  const emailLiveError = touched.email ? validateEmail(registerEmail) : null;
  const phoneLiveError = touched.phone ? validatePhone(registerPhone) : null;
  const passwordLiveError = touched.password ? validatePasswordValue(password) : null;
  const confirmLiveError = touched.confirm ? (password === confirmPassword ? null : "كلمتا المرور غير متطابقتين.") : null;

  const nameIsValid = touched.name && !nameLiveError && Boolean(name.trim());
  const loginIdentifierIsValid = touched.loginIdentifier && !loginIdentifierLiveError && Boolean(loginIdentifier.trim());
  const loginPasswordIsValid = touched.loginPassword && !loginPasswordLiveError;
  const emailIsValid = touched.email && !emailLiveError && Boolean(registerEmail.trim());
  const phoneIsValid = touched.phone && !phoneLiveError && Boolean(registerPhone.trim());
  const passwordIsValid = touched.password && !passwordLiveError;
  const confirmIsValid = touched.confirm && password === confirmPassword;

  const touch = (field: ValidatedField) => setTouched((current) => current[field] ? current : { ...current, [field]: true });

  const styles = makeStyles(colors, isRTL);

  const submitPrimaryText = busy === "login"
    ? (language === "ar" ? "جارٍ تسجيل الدخول…" : "Signing in…")
    : busy === "register"
      ? (language === "ar" ? "جارٍ إرسال رمز التحقق…" : "Sending code…")
      : (tab === "login" ? (language === "ar" ? "تسجيل الدخول" : "Sign in") : (language === "ar" ? "إنشاء حساب ومتابعة" : "Create account"));

  return (
    <ScreenContainer containerClassName="bg-transparent" safeAreaClassName="bg-transparent" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
          {standaloneRegister ? (
            <Pressable accessibilityRole="button" accessibilityLabel="العودة إلى تسجيل الدخول" onPress={() => router.replace("/auth/login")} style={({ pressed }) => [styles.back, { opacity: pressed ? 0.65 : 1 }]}>
              <MaterialIcons name="arrow-forward" size={22} color={colors.primary} />
              <ThemedText variant="label" color={colors.primary} style={styles.backText}>رجوع</ThemedText>
            </Pressable>
          ) : null}
          <View style={styles.brandArea}>
            <View style={styles.glow}><View style={styles.logoWrap}><Image source={require("../assets/images/stayin-logo.jpg")} style={styles.logo} accessibilityLabel="StayIn" /></View></View>
            <ThemedText variant="label" color={colors.primary} style={styles.brand}>StayIn</ThemedText>
            <ThemedText variant="titleLarge" style={styles.title}>{tab === "login" ? "أهلاً بك مجدداً" : "أنشئ حسابك بسهولة"}</ThemedText>
            <ThemedText variant="bodySmall" color={colors.muted} style={styles.subtitle}>{tab === "login" ? "سجّل دخولك لإدارة وحداتك وعقاراتك بكل سهولة" : "أدخل بياناتك وسنرسل رمز تحقق لتأكيد حسابك وتفعيله."}</ThemedText>
          </View>
          <View style={styles.tabs}>
            <TabButton colors={colors} styles={styles} label="تسجيل الدخول" selected={tab === "login"} onPress={() => changeTab("login")} />
            <TabButton colors={colors} styles={styles} label="إنشاء حساب" selected={tab === "register"} onPress={() => changeTab("register")} />
          </View>
          <Animated.View style={{ opacity: formOpacity }}>
            {tab === "login" ? (
              <>
                <ThemedText variant="label" style={styles.label}>البريد الإلكتروني أو رقم الهاتف</ThemedText>
                <AuthInput
                  key="login-identifier"
                  colors={colors} styles={styles}
                  icon="alternate-email"
                  value={loginIdentifier}
                  onChangeText={(value) => { setLoginIdentifier(value); touch("loginIdentifier"); resetFeedback(); }}
                  onFocus={() => setFocused("loginIdentifier")}
                  onBlur={() => { setFocused(null); touch("loginIdentifier"); }}
                  placeholder="name@example.com أو 079 000 0000"
                  border={fieldBorder("loginIdentifier", Boolean(loginIdentifierLiveError))}
                  glow={fieldGlow("loginIdentifier")}
                  accessibilityLabel="البريد الإلكتروني أو رقم الهاتف"
                  keyboardType="email-address"
                />
                <FieldValidation colors={colors} styles={styles} error={loginIdentifierLiveError} valid={loginIdentifierIsValid} successText="تم التعرف على الحقل." />
                <ThemedText variant="label" style={[styles.label, styles.sectionLabel]}>كلمة المرور</ThemedText>
                <AuthInput
                  key="login-password"
                  colors={colors} styles={styles}
                  icon="lock-outline"
                  value={loginPassword}
                  onChangeText={(value) => { setLoginPassword(value); touch("loginPassword"); resetFeedback(); }}
                  onFocus={() => setFocused("loginPassword")}
                  onBlur={() => { setFocused(null); touch("loginPassword"); }}
                  placeholder="أدخل كلمة المرور"
                  border={fieldBorder("loginPassword", Boolean(loginPasswordLiveError))}
                  glow={fieldGlow("loginPassword")}
                  accessibilityLabel="كلمة المرور"
                  secureTextEntry={!showLoginPassword}
                  showRevealToggle
                  revealed={showLoginPassword}
                  onToggleReveal={() => setShowLoginPassword((value) => !value)}
                />
                <FieldValidation colors={colors} styles={styles} error={loginPasswordLiveError} valid={loginPasswordIsValid} successText="كلمة المرور مقبولة." />
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/auth/forgot-password", params: { mode: "email", identifier: loginIdentifier.trim() } })} style={styles.forgot}>
                  <ThemedText variant="label" color={colors.primary} style={styles.forgotText}>نسيت كلمة المرور؟</ThemedText>
                </Pressable>
                <View style={styles.remember}>
                  <AppToggle value={activeSession.rememberMe} onValueChange={(value) => void setRememberMe(value)} isRTL activeColor={colors.primary} inactiveColor={colors.border} accessibilityLabel="تبديل تذكرني" />
                  <View style={styles.flex}>
                    <ThemedText variant="body" style={styles.rememberTitle}>تذكرني</ThemedText>
                    <ThemedText variant="caption" color={colors.muted} style={styles.rememberHint}>البقاء مسجلاً على هذا الجهاز</ThemedText>
                  </View>
                </View>
              </>
            ) : (
              <>
                <ThemedText variant="label" style={styles.label}>الاسم الكامل</ThemedText>
                <AuthInput
                  key="register-name"
                  colors={colors} styles={styles}
                  icon="person-outline"
                  value={name}
                  onChangeText={(value) => { setName(value); touch("name"); resetFeedback(); }}
                  onFocus={() => setFocused("name")}
                  onBlur={() => { setFocused(null); touch("name"); }}
                  placeholder="محمد عجلوني"
                  border={fieldBorder("name", Boolean(nameLiveError))}
                  glow={fieldGlow("name")}
                  accessibilityLabel="الاسم الكامل"
                />
                <FieldValidation colors={colors} styles={styles} error={nameLiveError} valid={nameIsValid} successText="الاسم الكامل صالح." />
                <ThemedText variant="label" style={[styles.label, styles.sectionLabel]}>البريد الإلكتروني</ThemedText>
                <AuthInput
                  key="register-email"
                  colors={colors} styles={styles}
                  icon="alternate-email"
                  value={registerEmail}
                  onChangeText={(value) => { setRegisterEmail(value); touch("email"); resetFeedback(); }}
                  onFocus={() => setFocused("email")}
                  onBlur={() => { setFocused(null); touch("email"); }}
                  placeholder="name@example.com"
                  border={fieldBorder("email", Boolean(emailLiveError))}
                  glow={fieldGlow("email")}
                  accessibilityLabel="البريد الإلكتروني"
                  keyboardType="email-address"
                />
                <FieldValidation colors={colors} styles={styles} error={emailLiveError} valid={emailIsValid} successText="البريد الإلكتروني صالح." />
                <ThemedText variant="label" style={[styles.label, styles.sectionLabel]}>رقم الهاتف</ThemedText>
                <AuthInput
                  key="register-phone"
                  colors={colors} styles={styles}
                  icon="phone-iphone"
                  value={registerPhone}
                  onChangeText={(value) => { setRegisterPhone(value); touch("phone"); resetFeedback(); }}
                  onFocus={() => setFocused("phone")}
                  onBlur={() => { setFocused(null); touch("phone"); }}
                  placeholder="079 000 0000"
                  border={fieldBorder("phone", Boolean(phoneLiveError))}
                  glow={fieldGlow("phone")}
                  accessibilityLabel="رقم الهاتف"
                  keyboardType="phone-pad"
                />
                <FieldValidation colors={colors} styles={styles} error={phoneLiveError} valid={phoneIsValid} successText="رقم الهاتف الأردني صالح." />
                <ThemedText variant="label" style={[styles.label, styles.sectionLabel]}>كلمة المرور</ThemedText>
                <AuthInput
                  key="register-password"
                  colors={colors} styles={styles}
                  icon="lock-outline"
                  value={password}
                  onChangeText={(value) => { setPassword(value); setConfirmPassword(""); touch("password"); resetFeedback(); }}
                  onFocus={() => setFocused("password")}
                  onBlur={() => { setFocused(null); touch("password"); }}
                  placeholder="8 أحرف على الأقل مع أحرف وأرقام"
                  border={fieldBorder("password", Boolean(passwordLiveError))}
                  glow={fieldGlow("password")}
                  accessibilityLabel="كلمة المرور"
                  secureTextEntry={!showPassword}
                  showRevealToggle
                  revealed={showPassword}
                  onToggleReveal={() => setShowPassword((value) => !value)}
                />
                <FieldValidation colors={colors} styles={styles} error={passwordLiveError} valid={passwordIsValid} successText="كلمة المرور تستوفي المتطلبات." />
                <ThemedText variant="label" style={[styles.label, styles.sectionLabel]}>تأكيد كلمة المرور</ThemedText>
                <AuthInput
                  key="register-confirm"
                  colors={colors} styles={styles}
                  icon="lock-outline"
                  value={confirmPassword}
                  onChangeText={(value) => { setConfirmPassword(value); touch("confirm"); resetFeedback(); }}
                  onFocus={() => setFocused("confirm")}
                  onBlur={() => { setFocused(null); touch("confirm"); }}
                  placeholder="أعد إدخال كلمة المرور"
                  border={fieldBorder("confirm", Boolean(confirmLiveError))}
                  glow={fieldGlow("confirm")}
                  accessibilityLabel="تأكيد كلمة المرور"
                  secureTextEntry={!showConfirm}
                  showRevealToggle
                  revealed={showConfirm}
                  onToggleReveal={() => setShowConfirm((value) => !value)}
                />
                <FieldValidation colors={colors} styles={styles} error={confirmLiveError} valid={confirmIsValid} successText="كلمتا المرور متطابقتان." />
                <ThemedText variant="caption" color={colors.muted} style={styles.identityHint}>كلمة المرور تُخزَّن بأمان عبر مزوّد الهوية وتُستخدم لتسجيل الدخول لاحقًا. الحساب يُفعَّل بعد إدخال رمز التحقق المرسل إلى بريدك الإلكتروني.</ThemedText>
                <LegalConsent colors={colors} styles={styles} value={accepted} onValueChange={setAccepted} />
              </>
            )}
            {error ? <Feedback colors={colors} styles={styles} text={error} color={colors.error} icon="error-outline" /> : null}
            {message ? <Feedback colors={colors} styles={styles} text={message} color={colors.success} icon="info-outline" /> : null}
          </Animated.View>
          <Pressable disabled={isBusy} accessibilityRole="button" accessibilityState={{ busy: isBusy }} onPress={() => void submit()} style={({ pressed }) => [styles.primaryWrap, { opacity: pressed || isBusy ? 0.68 : 1 }]}>
            <LinearGradient colors={[colors.primary, colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
              {busy === tab ? <ActivityIndicator color={colors.foreground} /> : <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={21} color={colors.foreground} />}
              <ThemedText variant="button" color={colors.foreground} style={styles.primaryText}>{submitPrimaryText}</ThemedText>
            </LinearGradient>
          </Pressable>
          <View style={styles.dividerWrap}><View style={styles.dividerLine} /><ThemedText variant="caption" color={colors.muted} style={styles.dividerText}>أو</ThemedText><View style={styles.dividerLine} /></View>
          <SocialButton colors={colors} styles={styles} provider="google" disabled={isBusy} onPress={() => void handleSocial("google")} />
          <SocialButton colors={colors} styles={styles} provider="apple" disabled={isBusy} onPress={() => void handleSocial("apple")} />
          {tab === "login" ? (
            <View style={styles.bioArea}>
              <View style={styles.bioWrap}>
                <Animated.View style={[styles.bioPulse, { borderColor: biometricAvailable ? colors.primary : colors.border, transform: [{ scale: pulse }] }]} />
                <Pressable disabled={isBusy} accessibilityRole="button" accessibilityState={{ busy: isBusy }} accessibilityLabel="تسجيل الدخول السريع بالبصمة أو بصمة الوجه" onPress={() => void biometricLogin()} style={styles.bioButton}>
                  {busy === "biometric" ? <ActivityIndicator color={colors.primary} size="large" /> : <MaterialIcons name="fingerprint" size={42} color={biometricAvailable ? colors.primary : colors.muted} />}
                </Pressable>
              </View>
              <ThemedText variant="title" style={styles.bioTitle}>تسجيل الدخول السريع بالبصمة</ThemedText>
              <ThemedText variant="caption" color={colors.muted} style={styles.bioHint}>استخدم البصمة أو بصمة الوجه عند تفعيلها من أمان الحساب</ThemedText>
            </View>
          ) : null}
          <View style={styles.footer}>
            <ThemedText variant="caption" color={colors.muted} style={styles.footerText}>{tab === "login" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}</ThemedText>
            <Pressable accessibilityRole="link" onPress={() => changeTab(tab === "login" ? "register" : "login")}><ThemedText variant="label" color={colors.primary} style={styles.footerLink}>{tab === "login" ? "أنشئ حساباً جديداً" : "تسجيل الدخول"}</ThemedText></Pressable>
          </View>
          {isAuthenticated && tab === "login" ? (
            <Pressable onPress={() => router.replace("/workspace-gate")} style={styles.workspace}><ThemedText variant="label" color={colors.primary} style={styles.footerLink}>الانتقال إلى منشآتي</ThemedText></Pressable>
          ) : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function makeStyles(colors: AuthColors, isRTL: boolean) {
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
    label: { color: colors.muted, fontSize: 12, fontWeight: "800", marginBottom: 8, textAlign: "right" },
    sectionLabel: { marginTop: 18 },
    inputShell: { minHeight: colors.appTheme.input.height, borderRadius: colors.appTheme.input.radius, borderWidth: 1, paddingHorizontal: 14, backgroundColor: colors.appTheme.input.bg, borderColor: colors.appTheme.input.borderColor, alignItems: "center", gap: 10 },
    textInput: { flex: 1, minWidth: 0, minHeight: 52, fontSize: 15, color: colors.foreground, paddingVertical: 12 },
    fieldValidation: { minHeight: 20, marginTop: 6, flexDirection: "row-reverse", alignItems: "center", justifyContent: "flex-start", gap: 5 },
    fieldValidationText: { fontSize: 11, fontWeight: "800", lineHeight: 16, textAlign: "right" },
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
    dividerWrap: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
    social: { minHeight: 50, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 12 },
    socialText: { fontSize: 14, fontWeight: "900" },
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
