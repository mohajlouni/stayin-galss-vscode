import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ThemedText } from "@/components/themed-text";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { requestPasswordlessEmail, type SupabaseOtpError } from "@/lib/supabase-otp";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Passwordless recovery — because StayIn uses a passwordless Email-OTP strategy,
 * "forgot password" is inherently replaced by the secure dynamic OTP flow: the
 * user confirms their email, receives a fresh time-limited code, verifies it,
 * and is signed back into the exact same account — no password to reset.
 */
export default function ForgotPasswordScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const params = useLocalSearchParams<{ mode?: string; identifier?: string }>();
  const [email, setEmail] = useState(typeof params.identifier === "string" && emailPattern.test(params.identifier) ? params.identifier : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) { setFieldError(language === "ar" ? "أدخل بريدك الإلكتروني للمتابعة." : "Enter your email to continue."); setError(null); return; }
    if (!emailPattern.test(trimmed)) { setFieldError(language === "ar" ? "أدخل بريدًا إلكترونيًا صحيحًا، مثل name@example.com." : "Enter a valid email like name@example.com."); setError(null); return; }
    setBusy(true); setError(null); setFieldError(null);
    try {
      const result = await requestPasswordlessEmail(trimmed);
      if (result.error) { setError(RECOVERY_MESSAGE(result.error, language)); return; }
      router.replace({ pathname: "/auth/otp", params: { email: trimmed.toLowerCase() } });
    } catch {
      setError(language === "ar" ? "تعذر إرسال رمز الاسترجاع. تحقق من اتصال الإنترنت ثم أعد المحاولة." : "Could not send the recovery code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const styles = makeStyles(colors);

  return (
    <ScreenContainer containerClassName="bg-transparent" safeAreaClassName="bg-transparent" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "العودة لتسجيل الدخول" : "Back to sign in"} onPress={() => router.replace("/auth/login")} style={({ pressed }) => [styles.back, { borderColor: colors.border, backgroundColor: colors.surface, flexDirection: row, opacity: pressed ? 0.65 : 1 }]}>
          <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={19} color={colors.primary} />
          <ThemedText variant="label" color={colors.primary} style={styles.backText}>{language === "ar" ? "العودة للدخول" : "Back to sign in"}</ThemedText>
        </Pressable>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.icon, { backgroundColor: colors.primary + "18", borderColor: colors.neonBorder }]}><MaterialIcons name="lock-reset" size={30} color={colors.primary} /></View>
          <ThemedText variant="titleLarge" style={styles.cardTitle}>{language === "ar" ? "استرجاع الوصول" : "Recover access"}</ThemedText>
          <ThemedText variant="bodySmall" color={colors.muted} style={styles.description}>
            {language === "ar"
              ? "لا كلمات مرور هنا. أدخل بريدك الإلكتروني وسنرسل رمز تحقق آمنًا (صالح 5 دقائق) للدخول المباشر إلى بياناتك من أي جهاز — يتيح المصادقة عبر OTP استرجاع الحساب بشكل فوري وآمن دون الحاجة إلى إعادة ضبط كلمة مرور."
              : "There are no passwords here. Enter your email and we’ll send a secure verification code (valid 5 minutes) for direct access to your data from any device — Email-OTP lets you instantly and safely recover your account without resetting any password."}
          </ThemedText>

          <ThemedText variant="label" style={styles.inputLabel}>{language === "ar" ? "البريد الإلكتروني" : "Email address"}</ThemedText>
          <TextInput value={email} onChangeText={(value) => { setEmail(value); setFieldError(null); setError(null); }} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.muted} textAlign={align} style={[styles.input, { color: colors.foreground, borderColor: fieldError ? colors.error : colors.border, backgroundColor: colors.surfaceMuted }]} accessibilityLabel="البريد الإلكتروني" />

          {fieldError ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: colors.error + "12", borderColor: colors.error + "55", flexDirection: row }]}><MaterialIcons name="error-outline" size={18} color={colors.error} /><ThemedText variant="caption" color={colors.error} style={[styles.flex, styles.feedbackText]}>{fieldError}</ThemedText></View> : null}
          {error ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: colors.error + "12", borderColor: colors.error + "55", flexDirection: row }]}><MaterialIcons name="error-outline" size={18} color={colors.error} /><ThemedText variant="caption" color={colors.error} style={[styles.flex, styles.feedbackText]}>{error}</ThemedText></View> : null}

          <Pressable disabled={busy} accessibilityRole="button" accessibilityState={{ busy }} onPress={() => void submit()} style={({ pressed }) => [styles.primary, { opacity: pressed || busy ? 0.68 : 1 }]}>
            <LinearGradient colors={[colors.primary, colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryGradient}>
              {busy ? <ActivityIndicator color={colors.background} /> : <MaterialIcons name="send" size={18} color={colors.background} />}
              <ThemedText variant="button" color={colors.background} style={styles.primaryText}>{busy ? (language === "ar" ? "جارٍ إرسال الرمز…" : "Sending code…") : (language === "ar" ? "إرسال رمز الاسترجاع" : "Send recovery code")}</ThemedText>
            </LinearGradient>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function RECOVERY_MESSAGE(error: SupabaseOtpError, language: string): string {
  const ar: Record<SupabaseOtpError, string> = {
    "not-configured": "استرجاع الحساب عبر البريد الإلكتروني غير مفعّل بعد على هذا التطبيق.",
    "invalid-email": "أدخل بريدًا إلكترونيًا صحيحًا.",
    "invalid-otp": "رمز التحقق غير صحيح.",
    "expired-otp": "انتهت صلاحية رمز التحقق. اطلب رمزًا جديدًا.",
    "rate-limited": "طلبت عدة رموز في وقت قصير. انتظر قليلًا ثم أعد المحاولة.",
    network: "تعذر إرسال الرمز. تحقق من اتصال الإنترنت ثم أعد المحاولة.",
    unknown: "حدث خطأ غير متوقع أثناء إرسال الرمز. حاول مرة أخرى.",
  };
  const en: Record<SupabaseOtpError, string> = {
    "not-configured": "Account recovery by email is not enabled on this app yet.",
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
    content: { flexGrow: 1, padding: 18, justifyContent: "center", gap: 14 } as const,
    back: { alignSelf: "flex-start", minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, alignItems: "center", gap: 6 } as const,
    backText: { fontSize: 12, fontWeight: "900" } as const,
    card: { borderWidth: 1, borderRadius: 24, padding: 18 } as const,
    icon: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1 } as const,
    cardTitle: { fontSize: 21, fontWeight: "900", marginTop: 14, textAlign: "right" as const } as const,
    description: { fontSize: 12, lineHeight: 19, marginTop: 8, textAlign: "right" as const } as const,
    inputLabel: { color: colors.muted, fontSize: 12, fontWeight: "800", marginTop: 16, marginBottom: 8, textAlign: "right" as const } as const,
    input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 13 } as const,
    feedback: { minHeight: 48, borderWidth: 1, borderRadius: 12, marginTop: 10, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center", gap: 7 } as const,
    flex: { flex: 1, minWidth: 0 } as const,
    feedbackText: { fontSize: 11, fontWeight: "700", lineHeight: 17 } as const,
    primary: { minHeight: 51, borderRadius: 13, marginTop: 15 } as const,
    primaryGradient: { minHeight: 51, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 } as const,
    primaryText: { fontWeight: "900" } as const,
  };
}
