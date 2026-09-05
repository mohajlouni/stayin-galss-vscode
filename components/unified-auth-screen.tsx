import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewStyle, type TextStyle } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { PrivacyModal, TermsModal } from "@/components/legal-modals";
import { ScreenContainer } from "@/components/screen-container";
import { ThemedText } from "@/components/themed-text";
import { useAppPreferences } from "@/lib/app-preferences";
import { useAuthSession } from "@/lib/auth-session";
import { LEGAL_VERSIONS, savePendingRegistration } from "@/lib/legal-consent";
import { AUTH_ERROR_MESSAGES, classifyAuthError, consumePendingDeletion, isSuperAdminCredential, probePendingSignup, requestEmailSignupOtp, resendSignupCode, signInSuperAdmin, signInWithPasswordFlow, socialSignIn, validateIdentifier, validatePassword } from "@/lib/supabase-otp";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import * as Auth from "@/lib/_core/auth";

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

function LanguageSwitcher(props: { colors: AuthColors; styles: AuthStyles; language: "ar" | "en"; onToggle: () => void }) {
  const { colors, styles, language, onToggle } = props;
  return (
    <View style={styles.langRow}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: language === "en" }} onPress={() => { if (language !== "en") onToggle(); }} style={[styles.langPill, { borderColor: colors.border }, language === "en" && { backgroundColor: colors.primary }]}>
        <ThemedText variant="label" color={language === "en" ? colors.background : colors.muted} style={styles.langText}>EN</ThemedText>
      </Pressable>
      <ThemedText variant="caption" color={colors.muted} style={styles.langSeparator}>|</ThemedText>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: language === "ar" }} onPress={() => { if (language !== "ar") onToggle(); }} style={[styles.langPill, { borderColor: colors.border }, language === "ar" && { backgroundColor: colors.primary }]}>
        <ThemedText variant="label" color={language === "ar" ? colors.background : colors.muted} style={styles.langText}>AR</ThemedText>
      </Pressable>
    </View>
  );
}

function LegalConsent(props: { colors: AuthColors; styles: AuthStyles; language: "ar" | "en"; value: boolean; onValueChange: (value: boolean) => void; onShowTerms: () => void; onShowPrivacy: () => void }) {
  const { colors, styles, language, value, onValueChange, onShowTerms, onShowPrivacy } = props;
  const isAr = language === "ar";
  return (
    <View style={styles.consent}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => onValueChange(!value)} style={[styles.checkbox, { borderColor: value ? colors.primary : colors.border, backgroundColor: value ? colors.primary : "transparent" }]}>
        {value ? <MaterialIcons name="check" size={15} color={colors.background} /> : null}
      </Pressable>
      <View style={styles.flex}>
        <View style={styles.consentTitleRow}>
          <ThemedText variant="bodySmall" style={styles.consentTitle}>{isAr ? "أوافق على" : "I agree to the"}{" "}</ThemedText>
          <Pressable accessibilityRole="link" onPress={onShowTerms}><ThemedText variant="label" color={colors.primary} style={styles.link}>{isAr ? "شروط وأحكام الاستخدام" : "Terms & Conditions"}</ThemedText></Pressable>
          <ThemedText variant="bodySmall" style={styles.consentTitle}>{isAr ? " و " : " and "}</ThemedText>
          <Pressable accessibilityRole="link" onPress={onShowPrivacy}><ThemedText variant="label" color={colors.primary} style={styles.link}>{isAr ? "سياسة الخصوصية" : "Privacy Policy"}</ThemedText></Pressable>
        </View>
        <ThemedText variant="caption" color={colors.muted} style={styles.consentHint}>{isAr ? "باستخدامك لتطبيق StayIn، فإنك تقر بقراءة الشروط وفهمها والالتزام بها." : "By using StayIn, you acknowledge that you have read, understood, and agree to these terms."}</ThemedText>
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

export function UnifiedAuthScreen({ initialTab = "login", standaloneRegister = false }: { initialTab?: Tab; standaloneRegister?: boolean }) {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { updateDeviceSettings } = useAppPreferences();
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
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletionNotice, setDeletionNotice] = useState<Auth.DeletionNotice | null>(null);
  const [pendingUnverified, setPendingUnverified] = useState<string | null>(null);
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

  useEffect(() => {
    let active = true;
    void Auth.peekPostLogoutNotice().then((notice) => {
      if (active && notice) setDeletionNotice(notice);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const dismissDeletionNotice = () => {
    setDeletionNotice(null);
    void Auth.consumePostLogoutNotice();
  };
  const openDeletionRecovery = () => {
    if (!deletionNotice) return;
    router.push({ pathname: "/account-recovery", params: { scheduledFor: deletionNotice.scheduledFor ?? "" } });
  };
  const deletionRemaining = (() => {
    const scheduledFor = deletionNotice?.scheduledFor;
    if (!scheduledFor) return null;
    const diff = new Date(scheduledFor).getTime() - Date.now();
    if (diff <= 0) return language === "ar" ? "انتهت المهلة" : "Grace period over";
    const totalMinutes = Math.max(1, Math.floor(diff / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return language === "ar" ? `${days} يوم و ${hours} ساعة` : `${days} day(s) ${hours} hr(s)`;
    if (hours > 0) return language === "ar" ? `${hours} ساعة و ${minutes} دقيقة` : `${hours} hr ${minutes} min`;
    return language === "ar" ? `${minutes} دقيقة` : `${minutes} min`;
  })();

  const resetFeedback = () => { setError(null); setMessage(null); setPendingUnverified(null); };
  const goAfterAuth = () => {
    const pendingDeletion = consumePendingDeletion();
    if (pendingDeletion) { router.replace({ pathname: "/account-recovery", params: { scheduledFor: pendingDeletion.scheduledFor } }); return; }
    router.replace("/workspace-gate");
  };
  const toggleLanguage = () => {
    const next: "ar" | "en" = language === "ar" ? "en" : "ar";
    void updateDeviceSettings({ language: next, useDeviceLanguage: false });
  };
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
      if (result.ok) { goAfterAuth(); return; }
      setError(AUTH_ERROR_MESSAGES[result.error] ?? "");
    } catch (err) {
      console.error("[CRITICAL LOGIN ERROR]:", err);
      setError(AUTH_ERROR_MESSAGES[classifyAuthError(err)] ?? AUTH_ERROR_MESSAGES.unknown);
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
        setError(AUTH_ERROR_MESSAGES.unregistered ?? "هذا الحساب غير مسجل، يرجى إنشاء حساب جديد.");
      }
      return;
    }
    if (!classified.ok || classified.kind !== "email" || !classified.email) return;
    const email = classified.email;

    if (isSuperAdminCredential(email, loginPassword)) {
      await runSuperAdminLogin(email, loginPassword, "login");
      return;
    }

    // Login-screen guard: if the entered email belongs to a signup that is still
    // awaiting verification (within the 7-day window), surface the pending state
    // with "[إدخال رمز التحقق]" and "[إعادة إرسال الرمز]" instead of trying a
    // password login that Supabase will reject as unconfirmed/unregistered.
    resetFeedback();
    const probe = await probePendingSignup(email);
    if (probe.result === "pending") {
      setPendingUnverified(email);
      return;
    }

    const invalidPassword = validatePasswordValue(loginPassword);
    if (invalidPassword) { setTouched((current) => ({ ...current, loginPassword: true })); setError(invalidPassword); return; }
    setBusy("login"); setError(null); setMessage(null);
    try {
    const result = await signInWithPasswordFlow({ email, password: loginPassword, refresh });
    if (result.ok) { goAfterAuth(); return; }
    if (result.error === "email-not-confirmed") {
      // The account exists but is not verified yet. Do not show "الحساب غير
      // مسجل"; instead resend the sign-up code, inform the user, and route them
      // to the OTP screen with the email pre-filled for signup verification.
      try { await resendSignupCode(email); } catch { /* best-effort resend */ }
      setMessage(language === "ar"
        ? "حسابك مسجل ولكنه غير موثّق بعد. أرسلنا لك رمز تحقق جديداً إلى بريدك الإلكتروني."
        : "Your account is registered but not yet verified. We sent you a new verification code to your email.");
      await new Promise((resolve) => setTimeout(resolve, 1600));
      router.push({ pathname: "/auth/otp", params: { email, mode: "signup" } });
      return;
    }
    if (result.error === "wrong-password") {
      // The password entry failed. The backend already separated this case from
      // "unregistered" (identity-status), so the single honest answer is the
      // exact password message; the «نسيت كلمة المرور؟» link above carries the
      // recovery path instead of a confusing multi-case explanation.
      setError(AUTH_ERROR_MESSAGES["wrong-password"]);
      return;
    }
    if (result.error === "deletion-pending" && result.pendingDeletion) {
      // The account has an ACTIVE deletion request. This is not a password
      // problem: a deletion request was submitted for this account. Remind the
      // user of the remaining grace period and send them to the recovery screen
      // (which asks whether to cancel and performs OTP activation) — all while
      // the request is still within its 14-day window.
      const daysLeft = Math.max(0, Math.ceil((new Date(result.pendingDeletion.scheduledFor).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
      Alert.alert(
        language === "ar" ? "طلب حذف الحساب فعّال" : "Account deletion in progress",
        language === "ar"
          ? `تم تقديم طلب حذف لحسابك وهو فعّال، وسيتم حذف الحساب نهائيًا خلال ${daysLeft} يومًا في حال عدم الاسترجاع. لا يزال بإمكانك استرجاعه: اضغط «استرجاع الحساب» لإرسال رمز تحقق OTP وإلغاء طلب الحذف ضمن المهلة.`
          : `A deletion request for your account is active, and the account will be permanently deleted in ${daysLeft} day(s) if not recovered. You can still recover it: press “Recover account” to send an OTP code and cancel the deletion within the grace period.`,
        [{ text: language === "ar" ? "حسنًا" : "OK", style: "cancel" }, { text: language === "ar" ? "استرجاع الحساب" : "Recover account", onPress: () => router.push({ pathname: "/account-recovery", params: { scheduledFor: result.pendingDeletion!.scheduledFor } }) }]
      );
      return;
    }
    setError(AUTH_ERROR_MESSAGES[result.error] ?? "");
    } catch (err) {
      console.error("[CRITICAL LOGIN ERROR]:", err);
      setError(AUTH_ERROR_MESSAGES[classifyAuthError(err)] ?? AUTH_ERROR_MESSAGES.unknown);
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
      const result = await requestEmailSignupOtp({ email, password, name, phone: registerPhone });
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

  const handleResendSignup = async (email: string) => {
    setBusy("login"); setError(null); setMessage(null);
    try {
      const { error: resendError } = await resendSignupCode(email);
      if (resendError) {
        setError(AUTH_ERROR_MESSAGES[resendError === "not-configured" ? "not-configured" : resendError === "network" ? "network" : "unknown"] ?? "");
        return;
      }
      router.push({ pathname: "/auth/otp", params: { email, mode: "signup" } });
    } finally { setBusy(null); }
  };

  const handleEnterVerificationCode = (email: string) => {
    router.push({ pathname: "/auth/otp", params: { email, mode: "signup" } });
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
      if (result.ok) { goAfterAuth(); return; }
      setError(AUTH_ERROR_MESSAGES[result.error] ?? "");
    } catch (err) {
      console.error("[CRITICAL LOGIN ERROR]:", err);
      setError(AUTH_ERROR_MESSAGES[classifyAuthError(err)] ?? AUTH_ERROR_MESSAGES.unknown);
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
  const align = isRTL ? "right" : "left";

  const submitPrimaryText = busy === "login"
    ? (language === "ar" ? "جارٍ تسجيل الدخول…" : "Signing in…")
    : busy === "register"
      ? (language === "ar" ? "جارٍ إرسال رمز التحقق…" : "Sending code…")
      : (tab === "login" ? (language === "ar" ? "تسجيل الدخول" : "Sign in") : (language === "ar" ? "إنشاء حساب ومتابعة" : "Create account"));

  return (
    <ScreenContainer containerClassName="bg-transparent" safeAreaClassName="bg-transparent" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
          <LanguageSwitcher colors={colors} styles={styles} language={language} onToggle={toggleLanguage} />
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
          {deletionNotice ? <View accessibilityLiveRegion="polite" style={[styles.deletionNote, { borderColor: colors.error + "88", backgroundColor: colors.error + "0F", flexDirection: "row-reverse" }]}>
            <View style={styles.deletionNoteIcon}><MaterialIcons name="delete-forever" size={21} color={colors.error} /></View>
            <View style={styles.flex}>
              <Text style={[styles.deletionNoteTitle, { color: colors.error, textAlign: align }]}>{language === "ar" ? "طلب حذف الحساب فعّال" : "Account deletion in progress"}</Text>
              <Text style={[styles.deletionNoteBody, { color: colors.muted, textAlign: align }]}>{deletionNotice.message}</Text>
              {deletionRemaining ? <Text style={[styles.deletionNoteRemaining, { color: colors.error, textAlign: align }]}>{language === "ar" ? "المدة المتبقية قبل الحذف النهائي: " : "Time before permanent deletion: "}<Text style={{ fontWeight: "900" }}>{deletionRemaining}</Text></Text> : null}
              <View style={[styles.deletionNoteActions, { flexDirection: "row-reverse" }]}>
                <Pressable accessibilityRole="button" onPress={openDeletionRecovery} style={[styles.deletionRecoverButton, { backgroundColor: colors.error }]}>
                  <MaterialIcons name="restore" size={15} color="#FFFFFF" />
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "استرجاع الحساب" : "Recover account"}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إخفاء الإشعار" : "Hide notice"} onPress={dismissDeletionNotice} style={[styles.deletionDismissButton, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.muted, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "حسنًا" : "OK"}</Text>
                </Pressable>
              </View>
            </View>
          </View> : null}
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
                {pendingUnverified ? (
                  <View accessibilityLiveRegion="polite" style={[styles.verifyNotice, { borderColor: colors.warning + "66", backgroundColor: colors.warning + "12" }]}>
                    <MaterialIcons name="mark-email-unread" size={20} color={colors.warning} />
                    <View style={styles.flex}>
                      <ThemedText variant="label" color={colors.warning} style={styles.verifyNoticeTitle}>الحساب بانتظار التوثيق: يرجى فحص صندوق الوارد أو البريد غير الهام (Spam)</ThemedText>
                      <ThemedText variant="caption" color={colors.muted} style={styles.verifyNoticeHint}>أدخل رمز التحقق المرسل إلى بريدك لتأكيد الحساب وتفعيله، أو أعد إرسال الرمز إن لم يصلك.</ThemedText>
                      <View style={styles.verifyActions}>
                        <Pressable accessibilityRole="button" disabled={isBusy} onPress={() => handleEnterVerificationCode(pendingUnverified)} style={[styles.verifyButton, { backgroundColor: colors.primary }]}>
                          <MaterialIcons name="pin" size={16} color={colors.background} />
                          <ThemedText variant="button" color={colors.background} style={styles.verifyButtonText}>إدخال رمز التحقق</ThemedText>
                        </Pressable>
                        <Pressable accessibilityRole="button" disabled={isBusy} onPress={() => void handleResendSignup(pendingUnverified)} style={[styles.verifyButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.warning }]}>
                          <MaterialIcons name="refresh" size={16} color={colors.warning} />
                          <ThemedText variant="button" color={colors.warning} style={styles.verifyButtonText}>إعادة إرسال الرمز</ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ) : null}
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
                <LegalConsent colors={colors} styles={styles} language={language} value={accepted} onValueChange={setAccepted} onShowTerms={() => setTermsOpen(true)} onShowPrivacy={() => setPrivacyOpen(true)} />
              </>
            )}
            {error ? <Feedback colors={colors} styles={styles} text={error} color={colors.error} icon="error-outline" /> : null}
            {message ? <Feedback colors={colors} styles={styles} text={message} color={colors.success} icon="info-outline" /> : null}
          </Animated.View>
          <Pressable disabled={isBusy || (tab === "register" && !accepted)} accessibilityRole="button" accessibilityState={{ busy: isBusy, disabled: tab === "register" && !accepted }} onPress={() => void submit()} style={({ pressed }) => [styles.primaryWrap, { opacity: pressed || isBusy || (tab === "register" && !accepted) ? 0.68 : 1 }]}>
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
      <TermsModal visible={termsOpen} onClose={() => setTermsOpen(false)} />
      <PrivacyModal visible={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </ScreenContainer>
  );
}

function makeStyles(colors: AuthColors, isRTL: boolean) {
  return StyleSheet.create({
    content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 28, paddingBottom: 34 },
    shell: { width: "100%", maxWidth: 440, alignSelf: "center" },
    back: { alignSelf: "flex-end", minHeight: 40, alignItems: "center", flexDirection: "row", gap: 5, marginBottom: 12 },
    backText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
    langRow: { alignSelf: "flex-end", alignItems: "center", flexDirection: "row", gap: 4, marginBottom: 10, minHeight: 32 },
    langPill: { minWidth: 44, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
    langText: { fontSize: 12, fontWeight: "900" },
    langSeparator: { fontSize: 12, fontWeight: "800" },
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
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    consentTitleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 1 },
    consentTitle: { color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: "right" },
    consentHint: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5, textAlign: "right" },
    link: { color: colors.primary, fontSize: 11, fontWeight: "900" },
    feedback: { minHeight: 40, borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
    feedbackText: { fontSize: 12, fontWeight: "800", lineHeight: 18, textAlign: "right", flex: 1 },
    verifyNotice: { minHeight: 40, borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: "row-reverse", alignItems: "flex-start", gap: 9, marginTop: 12 },
    verifyNoticeTitle: { fontSize: 12, fontWeight: "900", lineHeight: 18, textAlign: "right" },
    verifyNoticeHint: { fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 4 },
    verifyActions: { flexDirection: "row-reverse", gap: 9, marginTop: 11 },
    verifyButton: { height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 14 },
    verifyButtonText: { fontSize: 13, fontWeight: "900" },
    deletionNote: { minHeight: 40, borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: "row-reverse", alignItems: "flex-start", gap: 9, marginTop: 12 },
    deletionNoteIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.08)" },
    deletionNoteTitle: { fontSize: 13, fontWeight: "900", lineHeight: 19 },
    deletionNoteBody: { fontSize: 11, lineHeight: 17, marginTop: 3 },
    deletionNoteRemaining: { fontSize: 11, lineHeight: 16, marginTop: 5 },
    deletionNoteActions: { gap: 8, marginTop: 10 },
    deletionRecoverButton: { minHeight: 38, borderRadius: 11, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
    deletionDismissButton: { minHeight: 38, borderRadius: 11, borderWidth: 1, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
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
