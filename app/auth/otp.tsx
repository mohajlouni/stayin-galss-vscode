import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View, type TextInput as TextInputType } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ThemedText, ThemedNumber } from "@/components/themed-text";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAuthSession } from "@/lib/auth-session";
import { formatCountdown, resendPasswordlessEmail, useOtpCountdown, useResendCooldown, verifyEmailOtp, activateEmailSignup, type SupabaseOtpError, type AuthError, AUTH_ERROR_MESSAGES } from "@/lib/supabase-otp";

const OTP_LENGTH = 8;

export default function OtpVerificationScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { refresh } = useAuthSession();
  const params = useLocalSearchParams<{ email?: string; mode?: string; name?: string }>();
  const email = typeof params.email === "string" ? params.email.trim() : "";
  const mode = typeof params.mode === "string" ? params.mode : "";
  const name = typeof params.name === "string" ? params.name.trim() : "";
  const isSignup = mode === "signup";

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<TextInputType>(null);
  const countdown = useOtpCountdown(300);
  const cooldown = useResendCooldown(60);

  const currentCode = digits.join("");
  const row = isRTL ? "row-reverse" : "row";

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!email) {
      router.replace("/auth/login");
      return;
    }
    // Start the 5-minute countdown and the 60-second resend cooldown for this
    // verification round.
    countdown.start();
    cooldown.restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  // Auto-dismiss the in-app toast after a short delay.
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const handleChange = (text: string) => {
    setError(null);
    const clean = text.replace(/\D/g, "").slice(0, OTP_LENGTH);
    const next = Array(OTP_LENGTH).fill("");
    clean.split("").forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }) => {
    if (e.nativeEvent.key === "Backspace") {
      setDigits((prev) => {
        const next = [...prev];
        const lastFilled = next.map((d) => d !== "").lastIndexOf(true);
        if (lastFilled >= 0) next[lastFilled] = "";
        return next;
      });
    }
  };

  const submit = async () => {
    if (busy || currentCode.length !== OTP_LENGTH) {
      if (currentCode.length !== OTP_LENGTH) setError(language === "ar" ? "أدخل رمز التحقق الكامل المكوّن من 8 أرقام." : "Enter the complete 8-digit verification code.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = isSignup
        ? await activateEmailSignup({ email, token: currentCode, name, refresh })
        : await verifyEmailOtp({ email, token: currentCode, refresh });
      if (result.ok) {
        router.replace("/workspace-gate");
        return;
      }
      const code = result.error as SupabaseOtpError | AuthError;
      setError((code in AUTH_ERROR_MESSAGES ? AUTH_ERROR_MESSAGES[code as AuthError] : SUPABASE_OTP_MESSAGE(code as SupabaseOtpError, language)) || SUPABASE_OTP_MESSAGE("unknown", language));
    } catch {
      setError(language === "ar" ? "تعذر التحقق من الرمز. تحقق من اتصال الإنترنت ثم حاول مرة أخرى." : "Could not verify the code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  // Auto-submit as soon as the user types or pastes all 8 digits — no need to
  // press the button. Guarded by `busy` so an in-flight request is not re-fired
  // (the `currentCode` value stays stable after a failure, preventing loops).
  useEffect(() => {
    if (currentCode.length === OTP_LENGTH && !busy) void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCode]);

  const resend = async () => {
    if (busy || !cooldown.ready) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await resendPasswordlessEmail(email);
      if (result.error) {
        setError(SUPABASE_OTP_MESSAGE(result.error, language));
      } else {
        setToast(language === "ar" ? "تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني" : "A new verification code was sent to your email.");
        setDigits(Array(OTP_LENGTH).fill(""));
        countdown.start();
        cooldown.restart();
      }
    } finally {
      setBusy(false);
    }
  };

  const styles = makeStyles(colors);

  return (
    <ScreenContainer containerClassName="bg-transparent" safeAreaClassName="bg-transparent" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تغيير البريد الإلكتروني" : "Change email"} onPress={() => router.replace("/auth/login")} style={({ pressed }) => [styles.back, { opacity: pressed ? 0.65 : 1 }]}>
            <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={22} color={colors.primary} />
            <ThemedText variant="label" color={colors.primary} style={styles.backText}>{language === "ar" ? "تغيير البريد" : "Change email"}</ThemedText>
          </Pressable>

          <View style={styles.brandArea}>
            <View style={styles.glow}><MaterialIcons name="mark-email-read" size={40} color={colors.primary} /></View>
            <ThemedText variant="titleLarge" style={styles.title}>{language === "ar" ? "رمز التحقق" : "Verification code"}</ThemedText>
            <ThemedText variant="bodySmall" color={colors.muted} style={styles.subtitle}>
              {language === "ar" ? "أدخل رمز التحقق المكوّن من 8 أرقام الذي أُرسل إلى بريدك الإلكتروني لتأكيد دخولك." : "Enter the 8-digit code sent to your email to confirm your sign-in."}
            </ThemedText>
            <View style={[styles.emailChip, { flexDirection: row }]}>
              <MaterialIcons name="alternate-email" size={16} color={colors.primary} />
              <ThemedNumber variant="label" color={colors.foreground} style={styles.emailText}>{email}</ThemedNumber>
            </View>
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="حقل إدخال رمز التحقق" onPress={focusInput} style={styles.digitsArea}>
            {digits.map((digit, index) => {
              const activeIndex = digits.findIndex((d) => d === "");
              const isActive = activeIndex === -1 ? OTP_LENGTH - 1 : activeIndex;
              const active = index === isActive;
              return (
                <View key={index} style={[
                  styles.digitBox,
                  { borderColor: active ? colors.neonBorder : (digit ? colors.primary : colors.appTheme.glass.borderColor) },
                  active ? { shadowColor: colors.neonGlow, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6 } : null,
                ]}>
                  <ThemedNumber variant="title" style={styles.digitText}>{digit || "·"}</ThemedNumber>
                </View>
              );
            })}
          </Pressable>
          <TextInput
            ref={inputRef}
            value={currentCode}
            onChangeText={handleChange}
            onKeyPress={handleKeyPress}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoFocus
            caretHidden
            accessibilityLabel="رمز التحقق"
            style={styles.hiddenInput}
          />

          {error ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: colors.error + "62", backgroundColor: colors.error + "12", flexDirection: row }]}><MaterialIcons name="error-outline" size={18} color={colors.error} /><ThemedText variant="caption" color={colors.error} style={styles.feedbackText}>{error}</ThemedText></View> : null}
          {info ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: colors.success + "62", backgroundColor: colors.success + "12", flexDirection: row }]}><MaterialIcons name="check-circle-outline" size={18} color={colors.success} /><ThemedText variant="caption" color={colors.success} style={styles.feedbackText}>{info}</ThemedText></View> : null}

          <Pressable disabled={busy} accessibilityRole="button" accessibilityState={{ busy }} onPress={() => void submit()} style={({ pressed }) => [styles.primaryWrap, { opacity: pressed || busy ? 0.68 : 1 }]}>
            <LinearGradient colors={[colors.primary, colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
              {busy ? <ActivityIndicator color={colors.foreground} /> : <MaterialIcons name="verified-user" size={21} color={colors.foreground} />}
              <ThemedText variant="button" color={colors.foreground} style={styles.primaryText}>{busy ? (language === "ar" ? "جارٍ التحقق…" : "Verifying…") : (language === "ar" ? "تأكيد التحقق" : "Verify code")}</ThemedText>
            </LinearGradient>
          </Pressable>

          <View style={styles.timerArea}>
            <View style={[styles.resendRow, { flexDirection: row }]}>
              <MaterialIcons name="refresh" size={16} color={cooldown.ready ? colors.primary : colors.muted} />
              <Pressable disabled={busy || !cooldown.ready} accessibilityRole="button" accessibilityState={{ disabled: busy || !cooldown.ready }} onPress={() => void resend()}>
                <ThemedText variant="label" color={cooldown.ready ? colors.primary : colors.muted} style={styles.resendText}>
                  {language === "ar" ? "إعادة إرسال الرمز" : "Resend code"}
                  {!cooldown.ready ? ` (${formatCountdown(cooldown.remaining)})` : ""}
                </ThemedText>
              </Pressable>
            </View>
            <View style={[styles.timer, { flexDirection: row }]}>
              <MaterialIcons name="hourglass-empty" size={16} color={colors.muted} />
              <ThemedText variant="caption" color={colors.muted} style={styles.timerText}>
                {countdown.expired
                  ? (language === "ar" ? "انتهت صلاحية الرمز. أعد إرساله للمتابعة." : "The code expired. Resend it to continue.")
                  : `${language === "ar" ? "ينتهي صلاحية الرمز خلال" : "Code expires in"} `}
                {!countdown.expired ? <ThemedNumber variant="label" color={colors.primary}>{formatCountdown(countdown.remaining)}</ThemedNumber> : null}
              </ThemedText>
            </View>
          </View>

          {toast ? <View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: colors.success, flexDirection: row }]}><MaterialIcons name="check-circle" size={18} color={colors.background} /><ThemedText variant="caption" color={colors.background} style={styles.toastText}>{toast}</ThemedText></View> : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function SUPABASE_OTP_MESSAGE(error: SupabaseOtpError, language: string): string {
  const ar: Record<SupabaseOtpError, string> = {
    "not-configured": "تسجيل الدخول عبر البريد الإلكتروني غير مفعّل بعد على هذا التطبيق.",
    "invalid-email": "أدخل بريدًا إلكترونيًا صحيحًا.",
    "invalid-otp": "رمز التحقق غير صحيح. تحقق منه وأعد المحاولة.",
    "expired-otp": "انتهت صلاحية رمز التحقق. اضغط «إعادة إرسال الرمز» للحصول على رمز جديد.",
    "rate-limited": "طلبت عدة رموز في وقت قصير. انتظر قليلًا ثم أعد المحاولة.",
    network: "تعذر الاتصال بالشبكة. تحقق من اتصال الإنترنت ثم أعد المحاولة.",
    unknown: "حدث خطأ غير متوقع أثناء التحقق. حاول مرة أخرى.",
  };
  const en: Record<SupabaseOtpError, string> = {
    "not-configured": "Email sign-in is not enabled on this app yet.",
    "invalid-email": "Enter a valid email address.",
    "invalid-otp": "The verification code is incorrect. Check it and try again.",
    "expired-otp": "The verification code has expired. Press “Resend code” for a new one.",
    "rate-limited": "Too many codes requested recently. Wait a moment and retry.",
    network: "Could not connect to the network. Check your internet and retry.",
    unknown: "An unexpected error occurred during verification. Try again.",
  };
  return language === "ar" ? (ar[error] ?? ar.unknown) : (en[error] ?? en.unknown);
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return {
    content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 24, paddingBottom: 34 } as const,
    shell: { width: "100%", maxWidth: 440, alignSelf: "center" } as const,
    back: { alignSelf: "flex-start", minHeight: 40, alignItems: "center", flexDirection: "row", gap: 5, marginBottom: 20 } as const,
    backText: { fontSize: 13, fontWeight: "900" } as const,
    brandArea: { alignItems: "center", marginBottom: 30 } as const,
    glow: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.neonBorder, shadowColor: colors.neonGlow, shadowOpacity: 0.28, shadowRadius: 20, elevation: 9 } as const,
    title: { alignSelf: "stretch", fontSize: 26, fontWeight: "900", marginTop: 18, textAlign: "right" as const } as const,
    subtitle: { alignSelf: "stretch", fontSize: 13, lineHeight: 21, marginTop: 7, textAlign: "right" as const } as const,
    emailChip: { marginTop: 14, alignItems: "center", gap: 6, borderRadius: 13, borderWidth: 1, borderColor: colors.appTheme.glass.borderColor, backgroundColor: colors.appTheme.glass.cardBg, paddingHorizontal: 13, paddingVertical: 8 } as const,
    emailText: { fontSize: 13, fontWeight: "800" } as const,
    digitsArea: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 9, marginTop: 4 } as const,
    digitBox: { width: 52, height: 62, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.appTheme.input.bg } as const,
    digitText: { fontSize: 24, fontWeight: "900" } as const,
    hiddenInput: { position: "absolute", opacity: 0, height: 1, width: 1 } as const,
    feedback: { minHeight: 40, borderRadius: 12, padding: 10, alignItems: "center", gap: 8, marginTop: 18 } as const,
    feedbackText: { fontSize: 12, fontWeight: "800", lineHeight: 18, textAlign: "right" as const, flex: 1 } as const,
    primaryWrap: { marginTop: 24, borderRadius: 30, overflow: "hidden", shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: colors.appTheme.shadow.opacity, shadowRadius: colors.appTheme.shadow.radius, elevation: colors.appTheme.shadow.elevation } as const,
    primary: { minHeight: 58, borderRadius: 30, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 } as const,
    primaryText: { fontSize: 16, fontWeight: "900" } as const,
    timerArea: { alignItems: "center", marginTop: 24, gap: 6 } as const,
    resendRow: { minHeight: 44, alignItems: "center", gap: 6 } as const,
    resendText: { fontSize: 13, fontWeight: "900" } as const,
    timer: { alignItems: "center", gap: 6 } as const,
    timerText: { fontSize: 12, textAlign: "center" as const } as const,
    toast: { position: "absolute", top: 16, left: 16, right: 16, zIndex: 30, minHeight: 50, borderRadius: 14, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", gap: 8, elevation: 8, shadowColor: "#071412", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } } as const,
    toastText: { fontSize: 12, fontWeight: "800", flex: 1 } as const,
  };
}
