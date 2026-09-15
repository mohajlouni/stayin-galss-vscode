import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, I18nManager, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { PrivacyModal, TermsModal } from "@/components/legal-modals";
import { ScreenContainer } from "@/components/screen-container";
import { AUTH_BENTO, bentoAlpha } from "@/constants/auth-bento";
import { useAppPreferences } from "@/lib/app-preferences";
import { useAuthSession } from "@/lib/auth-session";
import { LEGAL_VERSIONS, savePendingRegistration } from "@/lib/legal-consent";
import { AUTH_ERROR_MESSAGES, classifyAuthError, consumePendingDeletion, isSuperAdminIdentifier, probePendingSignup, requestEmailSignupOtp, resendSignupCode, signInSuperAdmin, signInWithPasswordFlow, socialSignIn, validateIdentifier, validatePassword } from "@/lib/supabase-otp";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import * as Auth from "@/lib/_core/auth";

type Tab = "login" | "register";
type Busy = "login" | "register" | "biometric" | "google" | "apple" | null;
type ValidatedField = "name" | "loginIdentifier" | "loginPassword" | "email" | "phone" | "password" | "confirm";

type AuthColors = ReturnType<typeof useColors>;

type AuthStyles = ReturnType<typeof makeStyles>;

/* ------------------------------------------------------------------ *
 * المكوّنات التقديمية العليا (خارج جسم الشاشة) — ثبات هويتها هو ما يمنع *
 * إعادة تركيب حقل الإدخال المركّز وفقدان المؤشر مع كل ضغطة مفتاح.      *
 * ------------------------------------------------------------------ */

type AuthFieldIcon = "person-outline" | "alternate-email" | "lock-outline" | "phone-iphone";

/**
 * حقل إدخال Bento (memo):
 * - `pointerEvents="auto"` على الحقل نفسه مع ارتفاع لمس ≥ 52 و`zIndex: 1`، وكل
 *   طبقة زخرفية حوله (`pointerEvents="none"`) كي لا تحجب اللمس أو الكتابة.
 * - الترتيب البصري يتبع الاتجاه: في العربية الأيقونة الأمامية على اليمين وزر
 *   إظهار كلمة المرور على اليسار (`row-reverse`)، وفي الإنجليزية العكس (`row`)
 *   دون أي انعكاس مزدوج.
 * - الحقول الرقمية/اللاتينية تبقى `writingDirection: "ltr"` فلا تنقلب الأرقام
 *   (079…) ولا البريد الإلكتروني، مع بقاء `textAlign` حسب اتجاه اللغة.
 */
const AuthInput = memo(function AuthInput(props: {
  styles: AuthStyles;
  icon: AuthFieldIcon;
  value: string;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  onBlur?: () => void;
  placeholder: string;
  accessibilityLabel: string;
  rtl: boolean;
  focused: boolean;
  invalid?: boolean;
  keyboardType?: "email-address" | "phone-pad";
  secureTextEntry?: boolean;
  showRevealToggle?: boolean;
  revealed?: boolean;
  onToggleReveal?: () => void;
  latinText?: boolean;
  onSubmitEditing?: () => void;
}) {
  const { styles, icon, value, onChangeText, onFocus, onBlur, placeholder, accessibilityLabel, rtl, focused, invalid = false, keyboardType, secureTextEntry, showRevealToggle, revealed, onToggleReveal, latinText = false, onSubmitEditing } = props;
  // مرجع الحقل: لأي نقرة داخل حاوية الحقل نُعيد التركيز برمجيًا، فلا تبقى
  // منطقة الأيقونة/الحواف «ميتة» على محاكي Android.
  const inputRef = useRef<TextInput | null>(null);
  return (
    <View
      style={[styles.inputShell, focused ? styles.inputShellFocused : null, invalid ? styles.inputShellInvalid : null]}
      onTouchEnd={() => { inputRef.current?.focus(); }}
    >
      <View pointerEvents="none" style={styles.inputIcon}>
        <MaterialIcons name={icon} size={20} color={focused ? AUTH_BENTO.accent : AUTH_BENTO.textMuted} />
      </View>
      <TextInput
        ref={inputRef}
        pointerEvents="auto"
        editable
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={() => { onBlur?.(); }}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType ? "none" : "words"}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        placeholderTextColor={AUTH_BENTO.placeholder}
        selectionColor={AUTH_BENTO.accent}
        textAlign={rtl ? "right" : "left"}
        style={[styles.textInput, latinText ? styles.textInputLatin : null]}
        accessibilityLabel={accessibilityLabel}
        onSubmitEditing={onSubmitEditing}
      />
      {showRevealToggle ? (
        <Pressable pointerEvents="auto" accessibilityRole="button" accessibilityLabel={revealed ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onPress={onToggleReveal} hitSlop={8} style={styles.revealButton}>
          <MaterialIcons name={revealed ? "visibility-off" : "visibility"} size={21} color={revealed ? AUTH_BENTO.accent : AUTH_BENTO.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
});

/** تبويب واحد: تسمية بيضاء عالية التباين للنشط، ومؤشر سفلي برتقالي. */
const TabButton = memo(function TabButton(props: { styles: AuthStyles; label: string; selected: boolean; onPress: () => void }) {
  const { styles, label, selected, onPress } = props;
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={styles.tab}>
      <Text style={selected ? styles.tabTextActive : styles.tabText}>{label}</Text>
      <View pointerEvents="none" style={[styles.tabIndicator, selected ? styles.tabIndicatorActive : null]} />
    </Pressable>
  );
});

/** مبدّل اللغة في الترويسة: حبّة واحدة (AR | EN) والخيار النشط برتقالي. */
const LanguageSwitcher = memo(function LanguageSwitcher(props: { styles: AuthStyles; language: "ar" | "en"; onToggle: () => void }) {
  const { styles, language, onToggle } = props;
  return (
    <View style={styles.langPill}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: language === "ar" }} onPress={() => { if (language !== "ar") onToggle(); }} hitSlop={6} style={[styles.langOption, language === "ar" ? styles.langOptionActive : null]}>
        <Text style={language === "ar" ? styles.langTextActive : styles.langText}>AR</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: language === "en" }} onPress={() => { if (language !== "en") onToggle(); }} hitSlop={6} style={[styles.langOption, language === "en" ? styles.langOptionActive : null]}>
        <Text style={language === "en" ? styles.langTextActive : styles.langText}>EN</Text>
      </Pressable>
    </View>
  );
});

/** موافقة واحدة على الوثائق القانونية — شرط بدء إنشاء الحساب. */
const LegalConsent = memo(function LegalConsent(props: { styles: AuthStyles; isAr: boolean; value: boolean; onValueChange: (value: boolean) => void; onShowTerms: () => void; onShowPrivacy: () => void }) {
  const { styles, isAr, value, onValueChange, onShowTerms, onShowPrivacy } = props;
  return (
    <View style={styles.consent}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => onValueChange(!value)} hitSlop={6} style={[styles.checkbox, value ? styles.checkboxChecked : null]}>
        {value ? <MaterialIcons name="check" size={15} color="#FFFFFF" /> : null}
      </Pressable>
      <View style={styles.flex}>
        <View style={styles.consentTextRow}>
          <Text style={styles.consentTitle}>{isAr ? "أوافق على" : "I agree to the"}{" "}</Text>
          <Pressable accessibilityRole="link" onPress={onShowTerms}><Text style={styles.link}>{isAr ? "شروط وأحكام الاستخدام" : "Terms & Conditions"}</Text></Pressable>
          <Text style={styles.consentTitle}>{isAr ? " و " : " and "}</Text>
          <Pressable accessibilityRole="link" onPress={onShowPrivacy}><Text style={styles.link}>{isAr ? "سياسة الخصوصية" : "Privacy Policy"}</Text></Pressable>
        </View>
        <Text style={styles.consentHint}>{isAr ? "باستخدامك لتطبيق StayIn، فإنك تقر بقراءة الشروط وفهمها والالتزام بها." : "By using StayIn, you acknowledge that you have read, understood, and agree to these terms."}</Text>
      </View>
    </View>
  );
});

/** سطر تحقّق حقل واحد: أحمر صريح عند الخطأ وأخضر عند الصحة. */
const FieldValidation = memo(function FieldValidation(props: { styles: AuthStyles; error: string | null; valid: boolean; successText: string }) {
  const { styles, error, valid, successText } = props;
  if (!error && !valid) return null;
  const color = error ? AUTH_BENTO.error : AUTH_BENTO.success;
  return (
    <View accessibilityLiveRegion="polite" style={styles.fieldValidation}>
      <MaterialIcons name={error ? "error-outline" : "check-circle-outline"} size={15} color={color} />
      <Text style={[styles.fieldValidationText, { color }]}>{error ?? successText}</Text>
    </View>
  );
});

/** شريط رسالة عام داخل البطاقة (خطأ أحمر / معلومة خضراء). */
const Feedback = memo(function Feedback(props: { styles: AuthStyles; text: string; tone: "error" | "info" }) {
  const { styles, text, tone } = props;
  const color = tone === "error" ? AUTH_BENTO.error : AUTH_BENTO.success;
  return (
    <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: bentoAlpha(color, "80"), backgroundColor: bentoAlpha(color, "14") }]}>
      <MaterialIcons name={tone === "error" ? "error-outline" : "info-outline"} size={18} color={color} />
      <Text style={[styles.feedbackText, { color }]}>{text}</Text>
    </View>
  );
});

/** زر مزوّد الدخول الاجتماعي (Google / Apple): حبة داكنة بنص أبيض وأيقونة في الوسط. */
const SocialButton = memo(function SocialButton(props: { styles: AuthStyles; provider: "google" | "apple"; onPress: () => void; disabled: boolean }) {
  const { styles, provider, onPress, disabled } = props;
  const label = provider === "google" ? "Google" : "Apple";
  return (
    <Pressable disabled={disabled} accessibilityRole="button" accessibilityState={{ busy: disabled }} onPress={onPress} style={({ pressed }) => [styles.social, pressed || disabled ? styles.pressed : null]}>
      <MaterialIcons name={provider === "google" ? "g-translate" : "apple"} size={18} color={AUTH_BENTO.textPrimary} />
      <Text style={styles.socialText}>{label}</Text>
    </Pressable>
  );
});

/**
 * صف «تذكرني»: صندوق اختيار مخصّص بجانب النص داخل صف واحد مرتب — بلا مفتاح
 * أبيض مائل أو مقصوص. الصف كله منطقة لمس (minHeight 56) مع دور إمكانية وصول.
 */
const RememberRow = memo(function RememberRow(props: { styles: AuthStyles; value: boolean; onToggle: (value: boolean) => void }) {
  const { styles, value, onToggle } = props;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel="تبديل تذكرني"
      onPress={() => onToggle(!value)}
      style={({ pressed }) => [styles.rememberRow, pressed ? styles.pressed : null]}
    >
      <View pointerEvents="none" style={[styles.rememberBox, value ? styles.rememberBoxChecked : null]}>
        {value ? <MaterialIcons name="check" size={15} color="#FFFFFF" /> : null}
      </View>
      <View style={styles.flex}>
        <Text style={styles.rememberTitle}>تذكرني</Text>
        <Text style={styles.rememberHint}>البقاء مسجلاً على هذا الجهاز</Text>
      </View>
    </Pressable>
  );
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function UnifiedAuthScreen({ initialTab = "login", standaloneRegister = false }: { initialTab?: Tab; standaloneRegister?: boolean }) {
  const colors = useColors();
  const { isRTL: languageIsRTL, language } = useI18n();
  const { updateDeviceSettings, deviceSettings } = useAppPreferences();
  const { isAuthenticated, biometricAvailable, activeSession, setRememberMe, unlockWithBiometrics, refresh } = useAuthSession();
  /**
   * الاتجاه الفعلي للشاشة: لغة الواجهة النشطة هي المرجع الفوري، ويُستخدم اتجاه
   * المضيف الأصلي (I18nManager.isRTL) كإشارة مساندة عندما تكون اللغة عربية، فلا
   * ننتظر إعادة تحميل التطبيق ليُطبَّق الاتجاه، ولا تنقلب الواجهة الإنجليزية.
   */
  const isRTL = languageIsRTL || (I18nManager.isRTL && language === "ar");

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

  // نبضة البصمة زخرفية بالكامل: تتوقف مع «تقليل الحركة» ولا تلتقط أي لمس
  // (pointerEvents="none" على الطبقة المتحركة) حتى لا تحجب أزرار البطاقة.
  useEffect(() => {
    if (deviceSettings.reduceMotion) {
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1.06, duration: 1100, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0.92, duration: 1100, useNativeDriver: true })]));
    animation.start();
    return () => animation.stop();
  }, [deviceSettings.reduceMotion, pulse]);

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

  // رسائل الخطأ/التنبيه: مُثبّتة الهوية حتى تُستخدم داخل مُعالجات الحقول الثابتة.
  const resetFeedback = useCallback(() => { setError(null); setMessage(null); setPendingUnverified(null); }, []);
  const goAfterAuth = (destination?: string) => {
    // Super Admin lands on the home screen (الرئيسية) — the command center stays
    // one tap away via the dedicated top-navigation button.
    if (destination === "admin") {
      router.replace("/(tabs)");
      return;
    }
    const pendingDeletion = consumePendingDeletion();
    if (pendingDeletion) { router.replace({ pathname: "/account-recovery", params: { scheduledFor: pendingDeletion.scheduledFor } }); return; }
    router.replace("/workspace-hub");
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
      if (result.ok) { goAfterAuth(result.destination); return; }
      setError(AUTH_ERROR_MESSAGES[result.error] ?? AUTH_ERROR_MESSAGES.unknown);
    } catch (err) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        // eslint-disable-next-line no-console
        console.error("[auth] super-admin submit failed:", err instanceof Error ? err.message : err, err);
      } else {
        console.error("[CRITICAL LOGIN ERROR]:", err);
      }
      setError(AUTH_ERROR_MESSAGES[classifyAuthError(err)] ?? AUTH_ERROR_MESSAGES.unknown);
    } finally { setBusy(null); }
  };

  const submitLogin = async () => {
    const invalidIdentifier = validateLoginIdentifier(loginIdentifier);
    if (invalidIdentifier) { setTouched((current) => ({ ...current, loginIdentifier: true })); setError(invalidIdentifier); return; }
    const classified = validateIdentifier(loginIdentifier);

    if (classified.ok && classified.kind === "phone") {
      // Super Admin phone authenticates through the server bridge (which alone
      // verifies the master password). Any other phone is strictly rejected:
      // the Sign In tab never auto-creates an account nor opens the legacy
      // identity portal (which accepted any credentials). Registration happens
      // only via the إنشاء حساب tab.
      if (isSuperAdminIdentifier(loginIdentifier)) {
        await runSuperAdminLogin(loginIdentifier.trim(), loginPassword, "login");
      } else {
        setError(AUTH_ERROR_MESSAGES.unregistered ?? "هذا الحساب غير مسجل، يرجى إنشاء حساب جديد.");
      }
      return;
    }
    if (!classified.ok || classified.kind !== "email" || !classified.email) return;
    const email = classified.email;

    if (isSuperAdminIdentifier(email)) {
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
    if (result.ok) { goAfterAuth(result.destination); return; }
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
    setError(AUTH_ERROR_MESSAGES[result.error] ?? AUTH_ERROR_MESSAGES.unknown);
    } catch (err) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        // eslint-disable-next-line no-console
        console.error("[auth] password submit failed (bridge/network/server?):", err instanceof Error ? err.message : err, err);
      } else {
        console.error("[CRITICAL LOGIN ERROR]:", err);
      }
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
      } catch (err) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        // eslint-disable-next-line no-console
        console.error(`[auth] savePendingRegistration failed:`, err instanceof Error ? err.message : err);
      }
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
    } catch (err) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        // eslint-disable-next-line no-console
        console.error(`[auth] requestEmailSignupOtp failed:`, err instanceof Error ? err.message : String(err), err);
      }
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
    try { if (await unlockWithBiometrics()) { router.replace("/workspace-hub"); return; } setMessage("لم يكتمل التحقق بالبصمة. يمكنك المحاولة مجددًا أو المتابعة عبر بوابة الهوية."); }
    catch { setMessage("تعذر الوصول إلى البصمة أو بصمة الوجه على هذا الجهاز حاليًا."); }
    finally { setBusy(null); }
  };

  const handleSocial = async (provider: "google" | "apple") => {
    resetFeedback(); setBusy(provider);
    try {
      const result = await socialSignIn({ provider, refresh });
      if (result.ok) { goAfterAuth(result.destination); return; }
      setError(AUTH_ERROR_MESSAGES[result.error] ?? "");
    } catch (err) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        // eslint-disable-next-line no-console
        console.error("[auth] social submit failed:", err instanceof Error ? err.message : err, err);
      } else {
        console.error("[CRITICAL LOGIN ERROR]:", err);
      }
      setError(AUTH_ERROR_MESSAGES[classifyAuthError(err)] ?? AUTH_ERROR_MESSAGES.unknown);
    } finally { setBusy(null); }
  };

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

  const touch = useCallback((field: ValidatedField) => setTouched((current) => current[field] ? current : { ...current, [field]: true }), []);

  /* ---- مُعالجات الإدخال: ثابتة الهوية (useCallback) -------------------------
   * كل حقل كان يستقبل دالة جديدة (closure) في كل رسم، فتُبطِل memo الحقول
   * وتُعيد رسم الشاشة كاملة مع كل حرف — وهو سبب تقطّع الكتابة. الآن كل مُعالج
   * ثابت ما دامت اعتمادياته ثابتة (touch/resetFeedback/setters)، والحقول غير
   * المتأثرة لا تُعاد بناؤها إطلاقًا أثناء الكتابة.
   * ------------------------------------------------------------------------ */
  const changeLoginIdentifier = useCallback((value: string) => { setLoginIdentifier(value); touch("loginIdentifier"); resetFeedback(); }, [resetFeedback, touch]);
  const changeLoginPassword = useCallback((value: string) => { setLoginPassword(value); touch("loginPassword"); resetFeedback(); }, [resetFeedback, touch]);
  const changeName = useCallback((value: string) => { setName(value); touch("name"); resetFeedback(); }, [resetFeedback, touch]);
  const changeRegisterEmail = useCallback((value: string) => { setRegisterEmail(value); touch("email"); resetFeedback(); }, [resetFeedback, touch]);
  const changeRegisterPhone = useCallback((value: string) => { setRegisterPhone(value); touch("phone"); resetFeedback(); }, [resetFeedback, touch]);
  const changePassword = useCallback((value: string) => { setPassword(value); setConfirmPassword(""); touch("password"); resetFeedback(); }, [resetFeedback, touch]);
  const changeConfirmPassword = useCallback((value: string) => { setConfirmPassword(value); touch("confirm"); resetFeedback(); }, [resetFeedback, touch]);
  const toggleLoginPasswordReveal = useCallback(() => setShowLoginPassword((value) => !value), []);
  const togglePasswordReveal = useCallback(() => setShowPassword((value) => !value), []);
  const toggleConfirmReveal = useCallback(() => setShowConfirm((value) => !value), []);

  // التركيز والخروج مبنيتان مرة واحدة لكل حقل (المفتاح = اسم الحقل المُتحقَّق منه).
  const fieldHandlers = useMemo(() => {
    const focus = (field: ValidatedField) => () => setFocused(field);
    const blur = (field: ValidatedField) => () => { setFocused(null); touch(field); };
    return {
      name: { onFocus: focus("name"), onBlur: blur("name") },
      loginIdentifier: { onFocus: focus("loginIdentifier"), onBlur: blur("loginIdentifier") },
      loginPassword: { onFocus: focus("loginPassword"), onBlur: blur("loginPassword") },
      email: { onFocus: focus("email"), onBlur: blur("email") },
      phone: { onFocus: focus("phone"), onBlur: blur("phone") },
      password: { onFocus: focus("password"), onBlur: blur("password") },
      confirm: { onFocus: focus("confirm"), onBlur: blur("confirm") },
    };
  }, [touch]);

  // الأنماط تُبنى مرة واحدة لكل (لوحة ألوان + اتجاه)، لا في كل رسم ولا مع كل حرف.
  const styles = useMemo(() => makeStyles(colors, isRTL), [colors, isRTL]);

  const submitPrimaryText = busy === "login"
    ? (language === "ar" ? "جارٍ تسجيل الدخول…" : "Signing in…")
    : busy === "register"
      ? (language === "ar" ? "جارٍ إرسال رمز التحقق…" : "Sending code…")
      : (tab === "login" ? (language === "ar" ? "تسجيل الدخول" : "Sign in") : (language === "ar" ? "إنشاء حساب ومتابعة" : "Create account"));

  return (
    <ScreenContainer
      containerClassName="bg-transparent"
      safeAreaClassName="bg-transparent"
      ambientBackground={false}
      edges={["top", "bottom", "left", "right"]}
      style={styles.canvas}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" removeClippedSubviews={false} showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
          {/* ---- الترويسة: الشعار + StayIn + مبدّل اللغة (AR | EN) ---- */}
          <View style={styles.header}>
            <View pointerEvents="none" style={styles.brandMark}>
              <Image source={require("../assets/images/stayin-logo.jpg")} style={styles.logo} accessibilityLabel="StayIn" />
            </View>
            <Text style={styles.brandName}>StayIn</Text>
            <LanguageSwitcher styles={styles} language={language} onToggle={toggleLanguage} />
          </View>
          {standaloneRegister ? (
            <Pressable accessibilityRole="button" accessibilityLabel="العودة إلى تسجيل الدخول" onPress={() => router.replace("/auth/login")} style={({ pressed }) => [styles.back, pressed ? styles.pressed : null]}>
              <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={20} color={AUTH_BENTO.accent} />
              <Text style={styles.backText}>رجوع</Text>
            </Pressable>
          ) : null}

          {/* ---- بطاقة الدخول/إنشاء الحساب (Bento Dark) ---- */}
          <View style={styles.card}>
            <View style={styles.tabs}>
              <TabButton styles={styles} label="تسجيل الدخول" selected={tab === "login"} onPress={() => changeTab("login")} />
              <TabButton styles={styles} label="إنشاء حساب" selected={tab === "register"} onPress={() => changeTab("register")} />
            </View>
            <Text style={styles.cardTitle}>{tab === "login" ? "أهلاً بك مجدداً" : "أنشئ حسابك بسهولة"}</Text>
            <Text style={styles.cardSubtitle}>{tab === "login" ? "سجّل دخولك لإدارة وحداتك وعقاراتك بكل سهولة" : "أدخل بياناتك وسنرسل رمز تحقق لتأكيد حسابك وتفعيله."}</Text>
            {deletionNotice ? (
              <View accessibilityLiveRegion="polite" style={[styles.notice, { borderColor: bentoAlpha(AUTH_BENTO.error, "88"), backgroundColor: bentoAlpha(AUTH_BENTO.error, "14") }]}>
                <View pointerEvents="none" style={[styles.noticeIcon, { backgroundColor: bentoAlpha(AUTH_BENTO.error, "26") }]}>
                  <MaterialIcons name="delete-forever" size={18} color={AUTH_BENTO.error} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.noticeTitle, { color: AUTH_BENTO.error }]}>{language === "ar" ? "طلب حذف الحساب فعّال" : "Account deletion in progress"}</Text>
                  <Text style={styles.noticeBody}>{deletionNotice.message}</Text>
                  {deletionRemaining ? <Text style={[styles.noticeBody, { color: AUTH_BENTO.error }]}>{language === "ar" ? "المدة المتبقية قبل الحذف النهائي: " : "Time before permanent deletion: "}{deletionRemaining}</Text> : null}
                  <View style={styles.noticeActions}>
                    <Pressable accessibilityRole="button" onPress={openDeletionRecovery} style={[styles.noticeAction, styles.noticeActionSolid]}>
                      <MaterialIcons name="restore" size={15} color="#FFFFFF" />
                      <Text style={styles.noticeActionTextOn}>{language === "ar" ? "استرجاع الحساب" : "Recover account"}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إخفاء الإشعار" : "Hide notice"} onPress={dismissDeletionNotice} style={[styles.noticeAction, styles.noticeActionGhost]}>
                      <Text style={styles.noticeActionText}>{language === "ar" ? "حسنًا" : "OK"}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}
            {/* الحقول: حاوية عادية في التدفق — بلا أي pointerEvents يمنع لمس الحقول */}
            <Animated.View collapsable={false} style={[styles.form, { opacity: formOpacity }]}>
            {tab === "login" ? (
              <>
                <Text style={styles.label}>البريد الإلكتروني أو رقم الهاتف</Text>
                <AuthInput
                  styles={styles}
                  icon="alternate-email"
                  value={loginIdentifier}
                  onChangeText={changeLoginIdentifier}
                  onFocus={fieldHandlers.loginIdentifier.onFocus}
                  onBlur={fieldHandlers.loginIdentifier.onBlur}
                  placeholder="name@example.com أو 079 000 0000"
                  accessibilityLabel="البريد الإلكتروني أو رقم الهاتف"
                  rtl={isRTL}
                  focused={focused === "loginIdentifier"}
                  invalid={Boolean(loginIdentifierLiveError)}
                  keyboardType="email-address"
                  latinText
                />
                <FieldValidation styles={styles} error={loginIdentifierLiveError} valid={loginIdentifierIsValid} successText="تم التعرف على الحقل." />
                <Text style={[styles.label, styles.sectionLabel]}>كلمة المرور</Text>
                <AuthInput
                  styles={styles}
                  icon="lock-outline"
                  value={loginPassword}
                  onChangeText={changeLoginPassword}
                  onFocus={fieldHandlers.loginPassword.onFocus}
                  onBlur={fieldHandlers.loginPassword.onBlur}
                  placeholder="أدخل كلمة المرور"
                  accessibilityLabel="كلمة المرور"
                  rtl={isRTL}
                  focused={focused === "loginPassword"}
                  invalid={Boolean(loginPasswordLiveError)}
                  secureTextEntry={!showLoginPassword}
                  showRevealToggle
                  revealed={showLoginPassword}
                  onToggleReveal={toggleLoginPasswordReveal}
                  latinText
                />
                <FieldValidation styles={styles} error={loginPasswordLiveError} valid={loginPasswordIsValid} successText="كلمة المرور مقبولة." />
                {pendingUnverified ? (
                  <View accessibilityLiveRegion="polite" style={[styles.notice, { borderColor: bentoAlpha(AUTH_BENTO.warning, "66"), backgroundColor: bentoAlpha(AUTH_BENTO.warning, "12") }]}>
                    <View pointerEvents="none" style={[styles.noticeIcon, { backgroundColor: bentoAlpha(AUTH_BENTO.warning, "22") }]}>
                      <MaterialIcons name="mark-email-unread" size={18} color={AUTH_BENTO.warning} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.noticeTitle, { color: AUTH_BENTO.warning }]}>الحساب بانتظار التوثيق: يرجى فحص صندوق الوارد أو البريد غير الهام (Spam)</Text>
                      <Text style={styles.noticeBody}>أدخل رمز التحقق المرسل إلى بريدك لتأكيد الحساب وتفعيله، أو أعد إرسال الرمز إن لم يصلك.</Text>
                      <View style={styles.noticeActions}>
                        <Pressable accessibilityRole="button" disabled={isBusy} onPress={() => handleEnterVerificationCode(pendingUnverified)} style={[styles.noticeAction, styles.noticeActionSolid]}>
                          <MaterialIcons name="pin" size={15} color="#FFFFFF" />
                          <Text style={styles.noticeActionTextOn}>إدخال رمز التحقق</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" disabled={isBusy} onPress={() => void handleResendSignup(pendingUnverified)} style={[styles.noticeAction, styles.noticeActionGhost]}>
                          <MaterialIcons name="refresh" size={15} color={AUTH_BENTO.warning} />
                          <Text style={[styles.noticeActionText, { color: AUTH_BENTO.warning }]}>إعادة إرسال الرمز</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ) : null}
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/auth/forgot-password", params: { mode: "email", identifier: loginIdentifier.trim() } })} style={styles.forgot}>
                  <Text style={styles.forgotText}>نسيت كلمة المرور؟</Text>
                </Pressable>
                {/* صف «تذكرني» مستقل: صندوق اختيار مخصّص بجانب النص، بلا قصّ أو إزاحة */}
                <RememberRow
                  styles={styles}
                  value={activeSession.rememberMe}
                  onToggle={(value) => void setRememberMe(value)}
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>الاسم الكامل</Text>
                <AuthInput
                  styles={styles}
                  icon="person-outline"
                  value={name}
                  onChangeText={changeName}
                  onFocus={fieldHandlers.name.onFocus}
                  onBlur={fieldHandlers.name.onBlur}
                  placeholder="محمد عجلوني"
                  accessibilityLabel="الاسم الكامل"
                  rtl={isRTL}
                  focused={focused === "name"}
                  invalid={Boolean(nameLiveError)}
                />
                <FieldValidation styles={styles} error={nameLiveError} valid={nameIsValid} successText="الاسم الكامل صالح." />
                <Text style={[styles.label, styles.sectionLabel]}>البريد الإلكتروني</Text>
                <AuthInput
                  styles={styles}
                  icon="alternate-email"
                  value={registerEmail}
                  onChangeText={changeRegisterEmail}
                  onFocus={fieldHandlers.email.onFocus}
                  onBlur={fieldHandlers.email.onBlur}
                  placeholder="name@example.com"
                  accessibilityLabel="البريد الإلكتروني"
                  rtl={isRTL}
                  focused={focused === "email"}
                  invalid={Boolean(emailLiveError)}
                  keyboardType="email-address"
                  latinText
                />
                <FieldValidation styles={styles} error={emailLiveError} valid={emailIsValid} successText="البريد الإلكتروني صالح." />
                <Text style={[styles.label, styles.sectionLabel]}>رقم الهاتف</Text>
                <AuthInput
                  styles={styles}
                  icon="phone-iphone"
                  value={registerPhone}
                  onChangeText={changeRegisterPhone}
                  onFocus={fieldHandlers.phone.onFocus}
                  onBlur={fieldHandlers.phone.onBlur}
                  placeholder="079 000 0000"
                  accessibilityLabel="رقم الهاتف"
                  rtl={isRTL}
                  focused={focused === "phone"}
                  invalid={Boolean(phoneLiveError)}
                  keyboardType="phone-pad"
                  latinText
                />
                <FieldValidation styles={styles} error={phoneLiveError} valid={phoneIsValid} successText="رقم الهاتف الأردني صالح." />
                <Text style={[styles.label, styles.sectionLabel]}>كلمة المرور</Text>
                <AuthInput
                  styles={styles}
                  icon="lock-outline"
                  value={password}
                  onChangeText={changePassword}
                  onFocus={fieldHandlers.password.onFocus}
                  onBlur={fieldHandlers.password.onBlur}
                  placeholder="8 أحرف على الأقل مع أحرف وأرقام"
                  accessibilityLabel="كلمة المرور"
                  rtl={isRTL}
                  focused={focused === "password"}
                  invalid={Boolean(passwordLiveError)}
                  secureTextEntry={!showPassword}
                  showRevealToggle
                  revealed={showPassword}
                  onToggleReveal={togglePasswordReveal}
                  latinText
                />
                <FieldValidation styles={styles} error={passwordLiveError} valid={passwordIsValid} successText="كلمة المرور تستوفي المتطلبات." />
                <Text style={[styles.label, styles.sectionLabel]}>تأكيد كلمة المرور</Text>
                <AuthInput
                  styles={styles}
                  icon="lock-outline"
                  value={confirmPassword}
                  onChangeText={changeConfirmPassword}
                  onFocus={fieldHandlers.confirm.onFocus}
                  onBlur={fieldHandlers.confirm.onBlur}
                  placeholder="أعد إدخال كلمة المرور"
                  accessibilityLabel="تأكيد كلمة المرور"
                  rtl={isRTL}
                  focused={focused === "confirm"}
                  invalid={Boolean(confirmLiveError)}
                  secureTextEntry={!showConfirm}
                  showRevealToggle
                  revealed={showConfirm}
                  onToggleReveal={toggleConfirmReveal}
                  latinText
                />
                <FieldValidation styles={styles} error={confirmLiveError} valid={confirmIsValid} successText="كلمتا المرور متطابقتان." />
                <Text style={styles.identityHint}>كلمة المرور تُخزَّن بأمان عبر مزوّد الهوية وتُستخدم لتسجيل الدخول لاحقًا. الحساب يُفعَّل بعد إدخال رمز التحقق المرسل إلى بريدك الإلكتروني.</Text>
                <LegalConsent styles={styles} isAr={language === "ar"} value={accepted} onValueChange={setAccepted} onShowTerms={() => setTermsOpen(true)} onShowPrivacy={() => setPrivacyOpen(true)} />
              </>
            )}
            {error ? <Feedback styles={styles} text={error} tone="error" /> : null}
            {message ? <Feedback styles={styles} text={message} tone="info" /> : null}
          </Animated.View>
          {/* زر أساسي برتقالي بعرض كامل داخل البطاقة */}
          <Pressable
            disabled={isBusy || (tab === "register" && !accepted)}
            accessibilityRole="button"
            accessibilityState={{ busy: isBusy, disabled: tab === "register" && !accepted }}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.submit, pressed || isBusy || (tab === "register" && !accepted) ? styles.pressed : null]}
          >
            <LinearGradient colors={[AUTH_BENTO.accent, AUTH_BENTO.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitFill}>
              {busy === tab ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name={isRTL ? "arrow-back" : "arrow-forward"} size={20} color="#FFFFFF" />}
              <Text style={styles.submitText}>{submitPrimaryText}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* ---- قسم منفصل: المتابعة عبر المزودين ---- */}
        <View style={styles.socialSection}>
          <View pointerEvents="none" style={styles.dividerWrap}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>أو</Text>
            <View style={styles.dividerLine} />
          </View>
          <View style={styles.socialRow}>
            <SocialButton styles={styles} provider="google" disabled={isBusy} onPress={() => void handleSocial("google")} />
            <SocialButton styles={styles} provider="apple" disabled={isBusy} onPress={() => void handleSocial("apple")} />
          </View>
        </View>
        {tab === "login" ? (
          <View style={styles.bioArea}>
            <View style={styles.bioWrap}>
              {/* زخرفة بصرية فقط: لا تلتقط أي لمس حتى لا تحجب زر البصمة أو الحقول */}
              <Animated.View pointerEvents="none" collapsable={false} style={[styles.bioPulse, { borderColor: biometricAvailable ? bentoAlpha(AUTH_BENTO.accent, "55") : AUTH_BENTO.cardBorder, transform: [{ scale: pulse }] }]} />
              <Pressable disabled={isBusy} accessibilityRole="button" accessibilityState={{ busy: isBusy }} accessibilityLabel="تسجيل الدخول السريع بالبصمة أو بصمة الوجه" onPress={() => void biometricLogin()} style={styles.bioButton}>
                {busy === "biometric" ? <ActivityIndicator color={AUTH_BENTO.accent} size="large" /> : <MaterialIcons name="fingerprint" size={40} color={biometricAvailable ? AUTH_BENTO.accent : AUTH_BENTO.textMuted} />}
              </Pressable>
            </View>
            <Text style={styles.bioTitle}>تسجيل الدخول السريع بالبصمة</Text>
            <Text style={styles.bioHint}>استخدم البصمة أو بصمة الوجه عند تفعيلها من أمان الحساب</Text>
          </View>
        ) : null}
        <View style={styles.footer}>
          <Text style={styles.footerText}>{tab === "login" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}</Text>
          <Pressable accessibilityRole="link" onPress={() => changeTab(tab === "login" ? "register" : "login")}><Text style={styles.footerLink}>{tab === "login" ? "أنشئ حساباً جديداً" : "تسجيل الدخول"}</Text></Pressable>
        </View>
        {isAuthenticated && tab === "login" ? (
          <Pressable onPress={() => router.replace("/workspace-hub")} style={styles.workspace}><Text style={styles.footerLink}>الانتقال إلى منشآتي</Text></Pressable>
        ) : null}
        </View>
      </ScrollView>
      <TermsModal visible={termsOpen} onClose={() => setTermsOpen(false)} />
      <PrivacyModal visible={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </ScreenContainer>
  );
}

/**
 * أنماط شاشة الدخول (Bento Dark + Orange)
 * - الألوان ثابتة من AUTH_BENTO (لا تعتمد على لون الوحدة النشطة)، بينما الخطوط
 *   (`colors.font`) تأتي من هوية التطبيق ليظل العربي/الإنجليزي مقروءًا.
 * - الاتجاه يُدار صراحةً: `direction: "ltr"` على القشرة ثم نعكس الصفوف بـ
 *   `row-reverse` في العربية فقط. السبب: `direction` موروث من ScreenContainer،
 *   فينقلب `row-reverse` مرتين — وهذا سبب ظهور الأيقونات في الجهة المعاكسة
 *   وعدم محاذاة الحقول في العربية.
 */
function makeStyles(colors: AuthColors, isRTL: boolean) {
  const rowDir: "row" | "row-reverse" = isRTL ? "row-reverse" : "row";
  const textAlign: "right" | "left" = isRTL ? "right" : "left";
  const arabic = isRTL ? colors.font.arabic : colors.font.latin;
  const arabicBold = isRTL ? colors.font.arabicBold : colors.font.latinBold;
  const shadow = colors.appTheme.shadow;
  return StyleSheet.create({
    // خلفية الشاشة الصلبة النظيفة (بلا طبقات زجاجية أو ضباب فوق الحقول)
    canvas: { flex: 1, backgroundColor: AUTH_BENTO.canvas },
    content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingTop: 24, paddingBottom: 36 },
    shell: { width: "100%", maxWidth: 440, alignSelf: "center", direction: "ltr" },
    header: { flexDirection: rowDir, alignItems: "center", gap: 10, marginBottom: 14 },
    brandMark: { width: 44, height: 44, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: AUTH_BENTO.cardBorder, backgroundColor: AUTH_BENTO.card },
    logo: { width: "100%", height: "100%" },
    brandName: { flex: 1, color: AUTH_BENTO.textPrimary, fontSize: 20, fontWeight: "900", textAlign, fontFamily: arabicBold, includeFontPadding: false },
    langPill: { flexDirection: rowDir, alignItems: "center", gap: 3, padding: 3, borderRadius: 12, borderWidth: 1, borderColor: AUTH_BENTO.cardBorder, backgroundColor: AUTH_BENTO.card },
    langOption: { minWidth: 40, minHeight: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
    langOptionActive: { backgroundColor: AUTH_BENTO.accent },
    langText: { color: AUTH_BENTO.textMuted, fontSize: 12, fontWeight: "900", fontFamily: arabicBold, includeFontPadding: false },
    langTextActive: { color: "#FFFFFF" },
    back: { alignSelf: isRTL ? "flex-end" : "flex-start", minHeight: 40, flexDirection: rowDir, alignItems: "center", gap: 6, marginBottom: 12, paddingHorizontal: 8, borderRadius: 10 },
    backText: { color: AUTH_BENTO.accent, fontSize: 13, fontWeight: "900", fontFamily: arabicBold, includeFontPadding: false },
    card: { backgroundColor: AUTH_BENTO.card, borderWidth: 1, borderColor: AUTH_BENTO.cardBorder, borderRadius: AUTH_BENTO.cardRadius, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 18, elevation: shadow.elevation, shadowColor: "#000000", shadowOpacity: 0.34, shadowRadius: shadow.radius, shadowOffset: { width: 0, height: 10 } },
    tabs: { flexDirection: rowDir, borderBottomWidth: 1, borderBottomColor: AUTH_BENTO.cardBorder, marginBottom: 14 },
    tab: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", position: "relative" },
    tabText: { color: AUTH_BENTO.textMuted, fontSize: 16, fontWeight: "800", textAlign: "center", fontFamily: arabic, includeFontPadding: false },
    tabTextActive: { color: AUTH_BENTO.textPrimary, fontWeight: "900", fontFamily: arabicBold, includeFontPadding: false },
    // مؤشر التبويب النشط: شريط برتقالي سفلي (زخرفي بلا لمس)
    tabIndicator: { position: "absolute", left: 14, right: 14, bottom: -1, height: 3, borderRadius: 3, backgroundColor: "transparent" },
    tabIndicatorActive: { backgroundColor: AUTH_BENTO.accent },
    cardTitle: { color: AUTH_BENTO.textPrimary, fontSize: 22, fontWeight: "900", marginTop: 8, textAlign, fontFamily: arabicBold, includeFontPadding: false },
    cardSubtitle: { color: AUTH_BENTO.textMuted, fontSize: 13, lineHeight: 20, marginTop: 6, textAlign, fontFamily: arabic, includeFontPadding: false },
    form: { marginTop: 2 },
    sectionLabel: { marginTop: 16 },
    label: { color: AUTH_BENTO.textMuted, fontSize: 12, fontWeight: "800", marginBottom: 7, marginTop: 14, textAlign, fontFamily: arabic, includeFontPadding: false },
    inputShell: { minHeight: 56, borderRadius: AUTH_BENTO.fieldRadius, borderWidth: 1, borderColor: AUTH_BENTO.fieldBorder, backgroundColor: AUTH_BENTO.field, flexDirection: rowDir, alignItems: "center", paddingHorizontal: 12, gap: 10 },
    // حالة التركيز: حد برتقالي صريح مع توهج خفيف بلون التمييز
    inputShellFocused: { borderColor: AUTH_BENTO.accent, shadowColor: AUTH_BENTO.accent, shadowOpacity: 0.22, shadowRadius: 10, elevation: 4 },
    inputShellInvalid: { borderColor: AUTH_BENTO.error },
    inputIcon: { width: 24, alignItems: "center", justifyContent: "center" },
    textInput: { flex: 1, minWidth: 0, width: "100%", alignSelf: "stretch", minHeight: 52, zIndex: 10, fontSize: 15, color: AUTH_BENTO.textPrimary, paddingVertical: 10, fontFamily: arabic, includeFontPadding: false, writingDirection: isRTL ? "rtl" : "ltr" },
    // الحقول الرقمية/البريد/كلمة المرور تبقى ltr حتى لا تنقلب الأرقام (079…)
    textInputLatin: { writingDirection: "ltr" },
    revealButton: { width: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
    fieldValidation: { minHeight: 18, marginTop: 6, flexDirection: rowDir, alignItems: "center", gap: 5 },
    fieldValidationText: { fontSize: 11.5, fontWeight: "800", lineHeight: 16, textAlign, flex: 1, fontFamily: arabic, includeFontPadding: false },
    identityHint: { color: AUTH_BENTO.textMuted, fontSize: 10.5, lineHeight: 16, marginTop: 10, textAlign, fontFamily: arabic, includeFontPadding: false },
    forgot: { alignSelf: isRTL ? "flex-start" : "flex-end", marginTop: 12, minHeight: 32, justifyContent: "center" },
    forgotText: { color: AUTH_BENTO.accent, fontSize: 13, fontWeight: "900", fontFamily: arabicBold, includeFontPadding: false },
    rememberRow: { flexDirection: rowDir, alignItems: "center", gap: 12, marginTop: 16, minHeight: 56, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: AUTH_BENTO.cardBorder, backgroundColor: AUTH_BENTO.field },
    rememberBox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: AUTH_BENTO.textMuted, alignItems: "center", justifyContent: "center" },
    rememberBoxChecked: { borderColor: AUTH_BENTO.accent, backgroundColor: AUTH_BENTO.accent },
    rememberTitle: { color: AUTH_BENTO.textPrimary, fontSize: 13, fontWeight: "900", textAlign, fontFamily: arabicBold, includeFontPadding: false },
    rememberHint: { color: AUTH_BENTO.textMuted, fontSize: 10.5, marginTop: 2, textAlign, fontFamily: arabic, includeFontPadding: false },
    flex: { flex: 1, minWidth: 0 },
    submit: { marginTop: 18, borderRadius: 14, overflow: "hidden" },
    submitFill: { minHeight: 52, borderRadius: 14, flexDirection: rowDir, alignItems: "center", justifyContent: "center", gap: 8 },
    submitText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", fontFamily: arabicBold, includeFontPadding: false },
    pressed: { opacity: 0.72 },
    dividerWrap: { flexDirection: rowDir, alignItems: "center", gap: 12, marginTop: 20 },
    dividerLine: { flex: 1, height: 1, backgroundColor: AUTH_BENTO.cardBorder },
    dividerText: { color: AUTH_BENTO.textMuted, fontSize: 12, fontWeight: "800", fontFamily: arabic, includeFontPadding: false },
    socialSection: { marginTop: 2 },
    socialRow: { flexDirection: rowDir, gap: 10, marginTop: 14 },
    social: { flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: AUTH_BENTO.surface, flexDirection: rowDir, alignItems: "center", justifyContent: "center", gap: 8 },
    socialText: { color: AUTH_BENTO.textPrimary, fontSize: 14, fontWeight: "900", fontFamily: arabicBold, includeFontPadding: false },
    feedback: { minHeight: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, flexDirection: rowDir, alignItems: "center", gap: 8, marginTop: 14 },
    feedbackText: { fontSize: 12, fontWeight: "800", lineHeight: 18, textAlign, flex: 1, fontFamily: arabic, includeFontPadding: false },
    // إشعار عام داخل البطاقة (حذف الحساب قيد التنفيذ / حساب بانتظار التوثيق)
    notice: { minHeight: 44, borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: rowDir, alignItems: "flex-start", gap: 10, marginTop: 14 },
    noticeIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    noticeTitle: { fontSize: 12.5, fontWeight: "900", lineHeight: 18, textAlign, fontFamily: arabicBold, includeFontPadding: false },
    noticeBody: { color: AUTH_BENTO.textMuted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign, fontFamily: arabic, includeFontPadding: false },
    noticeActions: { flexDirection: rowDir, gap: 8, marginTop: 10 },
    noticeAction: { minHeight: 40, borderRadius: 11, paddingHorizontal: 14, flexDirection: rowDir, alignItems: "center", justifyContent: "center", gap: 6 },
    noticeActionSolid: { backgroundColor: AUTH_BENTO.accent },
    noticeActionGhost: { borderWidth: 1, borderColor: AUTH_BENTO.cardBorder, backgroundColor: AUTH_BENTO.field },
    noticeActionText: { color: AUTH_BENTO.textMuted, fontSize: 12.5, fontWeight: "900", fontFamily: arabicBold, includeFontPadding: false },
    noticeActionTextOn: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "900", fontFamily: arabicBold, includeFontPadding: false },
    consent: { flexDirection: rowDir, alignItems: "flex-start", gap: 10, marginTop: 16, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: AUTH_BENTO.cardBorder, backgroundColor: AUTH_BENTO.canvas },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center", borderColor: AUTH_BENTO.textMuted },
    checkboxChecked: { borderColor: AUTH_BENTO.accent, backgroundColor: AUTH_BENTO.accent },
    consentTextRow: { flexDirection: rowDir, flexWrap: "wrap", alignItems: "center", gap: 2 },
    consentTitle: { color: AUTH_BENTO.textPrimary, fontSize: 12, fontWeight: "900", textAlign, fontFamily: arabicBold, includeFontPadding: false },
    consentHint: { color: AUTH_BENTO.textMuted, fontSize: 10.5, lineHeight: 16, marginTop: 5, textAlign, fontFamily: arabic, includeFontPadding: false },
    link: { color: AUTH_BENTO.accent, fontSize: 11.5, fontWeight: "900", fontFamily: arabicBold, includeFontPadding: false },
    bioArea: { alignItems: "center", marginTop: 24 },
    bioWrap: { width: 116, height: 116, alignItems: "center", justifyContent: "center" },
    bioPulse: { position: "absolute", width: 104, height: 104, borderRadius: 52, borderWidth: 1, backgroundColor: bentoAlpha(AUTH_BENTO.accent, "12") },
    bioButton: { width: 86, height: 86, borderRadius: 43, alignItems: "center", justifyContent: "center", backgroundColor: AUTH_BENTO.card, borderWidth: 1, borderColor: AUTH_BENTO.cardBorder },
    bioTitle: { color: AUTH_BENTO.textPrimary, fontSize: 14, fontWeight: "900", marginTop: 10, textAlign: "center", fontFamily: arabicBold, includeFontPadding: false },
    bioHint: { color: AUTH_BENTO.textMuted, fontSize: 11, lineHeight: 17, maxWidth: 280, marginTop: 5, textAlign: "center", fontFamily: arabic, includeFontPadding: false },
    footer: { flexDirection: rowDir, alignItems: "center", justifyContent: "center", gap: 6, marginTop: 24 },
    footerText: { color: AUTH_BENTO.textMuted, fontSize: 12, fontFamily: arabic, includeFontPadding: false },
    footerLink: { color: AUTH_BENTO.accent, fontSize: 12, fontWeight: "900", fontFamily: arabicBold, includeFontPadding: false },
    workspace: { marginTop: 16, alignSelf: "center" },
  });
}
