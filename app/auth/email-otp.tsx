import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ThemedText } from "@/components/themed-text";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { requestPasswordlessEmail, type SupabaseOtpError } from "@/lib/supabase-otp";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailOtpScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { setMounted(false); if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const row = isRTL ? "row-reverse" : "row";

  const validate = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return language === "ar" ? "أدخل البريد الإلكتروني للمتابعة." : "Enter your email to continue.";
    return emailPattern.test(trimmed) ? null : (language === "ar" ? "أدخل بريدًا إلكترونيًا صحيحًا، مثل name@example.com." : "Enter a valid email like name@example.com.");
  };

  const continueToOtp = (targetEmail: string) => {
    if (!mounted) return;
    router.push({ pathname: "/auth/otp", params: { email: targetEmail } });
  };

  const submit = async () => {
    const validation = validate(email);
    if (validation) { setFieldError(validation); return; }
    setBusy(true); setError(null); setFieldError(null);
    try {
      const result = await requestPasswordlessEmail(email);
      if (result.error) {
        setError(EMAIL_OTP_MESSAGE(result.error, language));
        return;
      }
      continueToOtp(email.trim().toLowerCase());
    } catch {
      setError(language === "ar" ? "تعذر إرسال الرمز. تحقق من اتصال الإنترنت ثم أعد المحاولة." : "Could not send the code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const styles = makeStyles(colors);

  return (
    <ScreenContainer containerClassName="bg-transparent" safeAreaClassName="bg-transparent" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
          <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "العودة لتسجيل الدخول" : "Back to sign in"} onPress={() => router.replace("/auth/login")} style={({ pressed }) => [styles.back, { opacity: pressed ? 0.65 : 1 }]}>
            <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={22} color={colors.primary} />
            <ThemedText variant="label" color={colors.primary} style={styles.backText}>{language === "ar" ? "رجوع" : "Back"}</ThemedText>
          </Pressable>

          <View style={styles.brandArea}>
            <View style={styles.glow}><MaterialIcons name="mark-email-unread" size={40} color={colors.primary} /></View>
            <ThemedText variant="label" color={colors.primary} style={styles.brand}>StayIn</ThemedText>
            <ThemedText variant="titleLarge" style={styles.title}>{language === "ar" ? "الدخول برمز عبر البريد" : "Sign in with an email code"}</ThemedText>
            <ThemedText variant="bodySmall" color={colors.muted} style={styles.subtitle}>
              {language === "ar" ? "أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق آمنًا. لا حاجة لكلمة مرور — كل دخول أو استرجاع يتم عبر رمز ديناميكي مؤقت يصل إلى بريدك." : "Enter your email and we’ll send a secure verification code. No password needed — every sign-in or recovery uses a temporary dynamic code delivered to your inbox."}
            </ThemedText>
          </View>

          <ThemedText variant="label" style={styles.label}>{language === "ar" ? "البريد الإلكتروني" : "Email address"}</ThemedText>
          <View style={[styles.inputShell, { borderColor: fieldError ? colors.error : colors.appTheme.input.borderColor, flexDirection: "row-reverse" }]}>
            <MaterialIcons name="alternate-email" size={20} color={colors.muted} />
            <TextInput
              value={email}
              onChangeText={(value) => { setEmail(value); setFieldError(null); setError(null); }}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={colors.muted}
              textAlign="right"
              style={styles.textInput}
              accessibilityLabel="البريد الإلكتروني"
            />
          </View>
          {fieldError ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: colors.error + "62", backgroundColor: colors.error + "12", flexDirection: row }]}><MaterialIcons name="error-outline" size={17} color={colors.error} /><ThemedText variant="caption" color={colors.error} style={styles.feedbackText}>{fieldError}</ThemedText></View> : null}
          {error ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: colors.error + "62", backgroundColor: colors.error + "12", flexDirection: row }]}><MaterialIcons name="error-outline" size={17} color={colors.error} /><ThemedText variant="caption" color={colors.error} style={styles.feedbackText}>{error}</ThemedText></View> : null}

          <Pressable disabled={busy} accessibilityRole="button" accessibilityState={{ busy }} onPress={() => void submit()} style={({ pressed }) => [styles.primaryWrap, { opacity: pressed || busy ? 0.68 : 1 }]}>
            <LinearGradient colors={[colors.primary, colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
              {busy ? <ActivityIndicator color={colors.foreground} /> : <MaterialIcons name="send" size={20} color={colors.foreground} />}
              <ThemedText variant="button" color={colors.foreground} style={styles.primaryText}>{busy ? (language === "ar" ? "جارٍ إرسال الرمز…" : "Sending code…") : (language === "ar" ? "إرسال رمز التحقق" : "Send verification code")}</ThemedText>
            </LinearGradient>
          </Pressable>

          <View style={styles.secureNote}>
            <MaterialIcons name="verified-user" size={18} color={colors.success} />
            <ThemedText variant="caption" color={colors.muted} style={styles.secureText}>{language === "ar" ? "رمز التحقق صالح لمدة 5 دقائق فقط، ويتم استبداله تلقائيًا عند كل طلب." : "The verification code is valid for 5 minutes only and is refreshed on every request."}</ThemedText>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function EMAIL_OTP_MESSAGE(error: SupabaseOtpError, language: string): string {
  const ar: Record<SupabaseOtpError, string> = {
    "not-configured": "تسجيل الدخول عبر البريد الإلكتروني غير مفعّل بعد على هذا التطبيق.",
    "invalid-email": "أدخل بريدًا إلكترونيًا صحيحًا.",
    "invalid-otp": "رمز التحقق غير صحيح.",
    "expired-otp": "انتهت صلاحية رمز التحقق. اطلب رمزًا جديدًا.",
    "rate-limited": "طلبت عدة رموز في وقت قصير. انتظر قليلًا ثم أعد المحاولة.",
    network: "تعذر إرسال الرمز. تحقق من اتصال الإنترنت ثم أعد المحاولة.",
    unknown: "حدث خطأ غير متوقع أثناء إرسال الرمز. حاول مرة أخرى.",
  };
  const en: Record<SupabaseOtpError, string> = {
    "not-configured": "Email sign-in is not enabled on this app yet.",
    "invalid-email": "Enter a valid email address.",
    "invalid-otp": "The verification code is incorrect.",
    "expired-otp": "The verification code has expired. Request a new one.",
    "rate-limited": "Too many codes requested recently. Wait a moment and retry.",
    network: "Could not send the code. Check your connection and retry.",
    unknown: "An unexpected error occurred while sending the code. Try again.",
  };
  return language === "ar" ? (ar[error] ?? ar.unknown) : (en[error] ?? en.unknown);
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return {
    content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 24, paddingBottom: 34 } as const,
    shell: { width: "100%", maxWidth: 440, alignSelf: "center" } as const,
    back: { alignSelf: "flex-start", minHeight: 40, alignItems: "center", flexDirection: "row", gap: 5, marginBottom: 12 } as const,
    backText: { fontSize: 13, fontWeight: "900" } as const,
    brandArea: { alignItems: "center", marginBottom: 28 } as const,
    glow: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.neonBorder, shadowColor: colors.neonGlow, shadowOpacity: 0.28, shadowRadius: 20, elevation: 9 } as const,
    brand: { fontSize: 15, fontWeight: "900", marginTop: 14 } as const,
    title: { alignSelf: "stretch", fontSize: 25, fontWeight: "900", marginTop: 9, textAlign: "right" as const } as const,
    subtitle: { alignSelf: "stretch", fontSize: 13, lineHeight: 21, marginTop: 7, textAlign: "right" as const } as const,
    label: { color: colors.muted, fontSize: 12, fontWeight: "800", marginBottom: 8, textAlign: "right" as const } as const,
    inputShell: { minHeight: colors.appTheme.input.height, borderRadius: colors.appTheme.input.radius, borderWidth: 1, paddingHorizontal: 14, backgroundColor: colors.appTheme.input.bg, borderColor: colors.appTheme.input.borderColor, alignItems: "center", gap: 10 } as const,
    textInput: { flex: 1, minWidth: 0, minHeight: 52, fontSize: 15, color: colors.foreground, paddingVertical: 12, writingDirection: "ltr" as const } as const,
    feedback: { minHeight: 40, borderRadius: 12, padding: 10, alignItems: "center", gap: 8, marginTop: 12 } as const,
    feedbackText: { fontSize: 12, fontWeight: "800", lineHeight: 18, textAlign: "right" as const, flex: 1 } as const,
    primaryWrap: { marginTop: 24, borderRadius: 30, overflow: "hidden", shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: colors.appTheme.shadow.opacity, shadowRadius: colors.appTheme.shadow.radius, elevation: colors.appTheme.shadow.elevation } as const,
    primary: { minHeight: 58, borderRadius: 30, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 } as const,
    primaryText: { fontSize: 16, fontWeight: "900" } as const,
    secureNote: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 22 } as const,
    secureText: { fontSize: 11, lineHeight: 17, flexShrink: 1, textAlign: "center" as const } as const,
  };
}
