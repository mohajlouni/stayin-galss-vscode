import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import * as Auth from "@/lib/_core/auth";

const OTP_LENGTH = 6;
const MAX_OTP_LENGTH = 12;

function formatRemaining(scheduledFor: string, language: string): string {
  const diff = new Date(scheduledFor).getTime() - Date.now();
  if (diff <= 0) return language === "ar" ? "انتهت المهلة" : "Grace period over";
  const totalMinutes = Math.max(1, Math.floor(diff / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return language === "ar" ? `${days} يوم و ${hours} ساعة` : `${days} day(s) ${hours} hr(s)`;
  if (hours > 0) return language === "ar" ? `${hours} ساعة و ${minutes} دقيقة` : `${hours} hr ${minutes} min`;
  return language === "ar" ? `${minutes} دقيقة` : `${minutes} min`;
}

export default function AccountRecoveryScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { refresh } = useAuth();
  const params = useLocalSearchParams<{ scheduledFor?: string }>();
  const scheduledFor = typeof params.scheduledFor === "string" ? params.scheduledFor : "";
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"decision" | "recovery" | "otp">("decision");
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const requestRecoveryOtp = trpc.accountDeletion.requestRecoveryOtp.useMutation();
  const verifyRecoveryOtp = trpc.accountDeletion.verifyRecoveryOtp.useMutation();

  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const currentCode = digits.join("");
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  useEffect(() => {
    if (!scheduledFor) {
      void refresh();
      const pending = async () => {
        try { await Auth.clearUserInfo(); await Auth.removeSessionToken(); } catch { /* noop */ }
      };
      void pending();
      router.replace("/auth/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledFor]);

  useEffect(() => {
    if (step === "otp") requestAnimationFrame(() => inputRef.current?.focus());
  }, [step]);

  const sendCode = async () => {
    const trimmed = email.trim();
    if (!trimmed) { setError(language === "ar" ? "أدخل بريدك الإلكتروني المسجل لإرسال رمز التحقق." : "Enter your registered email to receive the verification code."); return; }
    if (!emailPattern.test(trimmed)) { setError(language === "ar" ? "أدخل بريدًا إلكترونيًا صحيحًا." : "Enter a valid email address."); return; }
    setBusy(true); setError(null);
    try {
      const result = await requestRecoveryOtp.mutateAsync({ email: trimmed });
      if (!result.ok) { setError(result.error ?? (language === "ar" ? "تعذر إرسال الرمز. حاول مرة أخرى." : "Could not send the code. Try again.")); return; }
      setStep("otp");
      setDigits(Array(OTP_LENGTH).fill(""));
    } catch {
      setError(language === "ar" ? "تعذر إرسال الرمز. تحقق من اتصالك بالإنترنت ثم أعد المحاولة." : "Could not send the code. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    const cleanToken = currentCode.replace(/\s+/g, "").trim();
    if (busy || cleanToken.length < OTP_LENGTH) { setError(language === "ar" ? "أدخل رمز التحقق الكامل المكوّن من 6 أرقام." : "Enter the complete 6-digit verification code."); return; }
    setBusy(true); setError(null);
    try {
      const result = await verifyRecoveryOtp.mutateAsync({ email: email.trim(), token: cleanToken });
      if (!result.ok) { setError(result.error ?? (language === "ar" ? "رمز التحقق غير صحيح. أعد المحاولة." : "The verification code is incorrect. Try again.")); setDigits(Array(OTP_LENGTH).fill("")); return; }
      setSuccess(true);
      try { await Auth.removeSessionToken(); await Auth.clearUserInfo(); } catch { /* noop */ }
      await refresh();
      router.replace("/onboarding");
    } catch {
      setError(language === "ar" ? "تعذر التحقق. تحقق من اتصالك بالإنترنت ثم أعد المحاولة." : "Could not verify. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  };

  const handleChange = (text: string) => {
    setError(null);
    const clean = text.replace(/[^\d]/g, "").slice(0, MAX_OTP_LENGTH);
    setDigits(clean.split("").length ? clean.split("") : Array(OTP_LENGTH).fill(""));
  };

  useEffect(() => {
    if (currentCode.replace(/\s+/g, "").trim().length >= OTP_LENGTH && !busy && step === "otp") void verifyCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCode, step]);

  const styles = makeStyles(colors);

  if (success) {
    return <ScreenContainer edges={["top", "bottom", "left", "right"]}><View style={styles.centered}><View style={styles.successIcon}><MaterialIcons name="check" size={40} color={colors.success} /></View><Text style={[styles.successTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "أهلاً بك مجدداً!" : "Welcome back!"}</Text><Text style={[styles.successBody, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "تم إلغاء طلب الحذف واستعادة حسابك بنجاح." : "Your deletion request was cancelled and your account restored successfully."}</Text></View></ScreenContainer>;
  }

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.error + "80" }]}>
    <View style={[styles.warningRow, { flexDirection: row }]}><MaterialIcons name="warning-amber" size={26} color={colors.error} /><View style={styles.flex}><Text style={{ color: colors.error, fontSize: 15, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تنبيه: هذا الحساب معطّل وقيد الحذف النهائي" : "Alert: this account is disabled and pending permanent deletion"}</Text>{scheduledFor ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: align }}>{language === "ar" ? `المدة المتبقية قبل الحذف النهائي: ` : `Time remaining before permanent deletion: `}<Text style={{ color: colors.error, fontWeight: "900" }}>{formatRemaining(scheduledFor, language)}</Text></Text> : null}</View></View>

    {step === "decision" ? <View>
      <Text style={[styles.body, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "هل تريد إلغاء طلب الحذف والحفاظ على حسابك وبياناتك؟" : "Do you want to cancel the deletion request and keep your account and data?"}</Text>
      <Pressable disabled={busy} onPress={() => { setError(null); setStep("recovery"); }} style={({ pressed }) => [styles.primaryWrap, { opacity: pressed || busy ? 0.68 : 1 }]} accessibilityRole="button">
        <LinearGradient colors={[colors.success, colors.secondary, colors.success]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
          <MaterialIcons name="restore" size={20} color={colors.foreground} />
          <Text style={[styles.primaryText, { color: colors.foreground }]}>{language === "ar" ? "نعم، إلغاء الحذف والحفاظ على حسابي" : "Yes, cancel deletion and keep my account"}</Text>
        </LinearGradient>
      </Pressable>
      <Pressable disabled={busy} onPress={() => setError(language === "ar" ? "حسناً. سيظل طلب الحذف قائمًا، وسيُحذف حسابك نهائيًا بعد انتهاء المهلة المحددة أعلاه." : "OK. The deletion request stays active, and your account will be permanently deleted after the grace period above.")} style={({ pressed }) => [styles.ghost, { opacity: pressed || busy ? 0.68 : 1 }]} accessibilityRole="button">
        <MaterialIcons name="delete-forever" size={20} color={colors.error} />
        <Text style={[styles.ghostText, { color: colors.error }]}>{language === "ar" ? "لا، متابعة الحذف" : "No, proceed with deletion"}</Text>
      </Pressable>
    </View> : step === "recovery" ? <View>
      <Text style={[styles.body, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "أدخل بريدك الإلكتروني المسجل لاستلام رمز التحقق وتأكيد إلغاء طلب الحذف." : "Enter your registered email to receive a verification code and confirm cancellation."}</Text>
      <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "البريد الإلكتروني المسجل" : "Registered email"}</Text>
      <TextInput value={email} onChangeText={(v) => { setEmail(v); setError(null); }} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.muted} textAlign={isRTL ? "right" : "left"} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, flexDirection: row }]} accessibilityLabel={"البريد الإلكتروني"} />
      <Pressable disabled={busy} onPress={() => void sendCode()} style={({ pressed }) => [styles.primaryWrap, { opacity: pressed || busy ? 0.68 : 1 }]} accessibilityRole="button" accessibilityState={{ busy }}>
        <LinearGradient colors={[colors.primary, colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
          {busy ? <ActivityIndicator color={colors.foreground} /> : <MaterialIcons name="shield" size={20} color={colors.foreground} />}
          <Text style={[styles.primaryText, { color: colors.foreground }]}>{busy ? (language === "ar" ? "جارٍ إرسال الرمز…" : "Sending code…") : (language === "ar" ? "إرسال رمز OTP لاستعادة الحساب" : "Send OTP code to recover account")}</Text>
        </LinearGradient>
      </Pressable>
      <Pressable disabled={busy} onPress={() => { setStep("decision"); setError(null); }} style={({ pressed }) => [styles.backLink, { opacity: pressed ? 0.65 : 1 }]}><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 13, textAlign: align }}>{language === "ar" ? "« رجوع" : "‹ Back"}</Text></Pressable>
    </View> : <View>
      <Text style={[styles.body, { color: colors.muted, textAlign: align }]}>{language === "ar" ? `أدخل رمز التحقق المكوّن من 6 أرقام الذي أُرسل إلى ${email} لاستعادة حسابك.` : `Enter the 6-digit code sent to ${email} to recover your account.`}</Text>
      <Pressable accessibilityRole="button" onPress={() => requestAnimationFrame(() => inputRef.current?.focus())} style={styles.digitsArea}>
        {digits.map((digit, index) => {
          const activeIndex = digits.findIndex((d) => d === "");
          const isActive = activeIndex === -1 ? OTP_LENGTH - 1 : activeIndex;
          const active = index === isActive;
          return <View key={index} style={[styles.digitBox, { borderColor: active ? colors.neonBorder : (digit ? colors.primary : colors.border), backgroundColor: colors.surfaceMuted }]}><Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "900" }}>{digit || "·"}</Text></View>;
        })}
      </Pressable>
      <TextInput ref={inputRef} value={currentCode} onChangeText={handleChange} keyboardType="number-pad" maxLength={MAX_OTP_LENGTH} autoFocus caretHidden accessibilityLabel="رمز التحقق" style={styles.hiddenInput} />
      <Pressable disabled={busy} onPress={() => void verifyCode()} style={({ pressed }) => [styles.primaryWrap, { opacity: pressed || busy ? 0.68 : 1 }]} accessibilityRole="button" accessibilityState={{ busy }}>
        <LinearGradient colors={[colors.success, colors.secondary, colors.success]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
          {busy ? <ActivityIndicator color={colors.foreground} /> : <MaterialIcons name="restore" size={20} color={colors.foreground} />}
          <Text style={[styles.primaryText, { color: colors.foreground }]}>{busy ? (language === "ar" ? "جارٍ استعادة الحساب…" : "Restoring account…") : (language === "ar" ? "استعادة الحساب" : "Recover account")}</Text>
        </LinearGradient>
      </Pressable>
      <Pressable disabled={busy} onPress={() => { setStep("recovery"); setError(null); }} style={({ pressed }) => [styles.backLink, { opacity: pressed ? 0.65 : 1 }]}><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 13, textAlign: align }}>{language === "ar" ? "تغيير البريد / إعادة إرسال الرمز" : "Change email / resend code"}</Text></Pressable>
    </View>}

    {error ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: colors.error + "14", borderColor: colors.error + "70", flexDirection: row }]}><MaterialIcons name="error-outline" size={18} color={colors.error} /><Text style={[styles.flex, { color: colors.error, fontWeight: "800", fontSize: 12, textAlign: align }]}>{error}</Text></View> : null}
  </View></ScrollView></ScreenContainer>;
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return {
    content: { flexGrow: 1, padding: 18, justifyContent: "center" },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    successIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.success + "80" },
    successTitle: { fontSize: 22, fontWeight: "900", marginTop: 18 },
    successBody: { fontSize: 13, lineHeight: 20, marginTop: 8, fontFamily: "Tajawal-Regular" },
    card: { borderWidth: 1, borderRadius: 20, padding: 16 },
    warningRow: { gap: 10, alignItems: "flex-start" },
    flex: { flex: 1, minWidth: 0 },
    body: { fontSize: 13, lineHeight: 20, marginTop: 12 },
    label: { fontSize: 12, fontWeight: "900", marginTop: 14 },
    input: { minHeight: 52, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, marginTop: 8, fontSize: 14, fontFamily: "Tajawal-Regular" },
    primaryWrap: { marginTop: 18, borderRadius: 30, overflow: "hidden" },
    primary: { minHeight: 56, borderRadius: 30, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
    primaryText: { fontSize: 15, fontWeight: "900" },
    digitsArea: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 9, marginTop: 4 },
    digitBox: { width: 52, height: 62, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    hiddenInput: { position: "absolute", opacity: 0, height: 1, width: 1 },
    backLink: { alignSelf: "flex-start", marginTop: 14, paddingVertical: 6 },
    ghost: { minHeight: 50, borderRadius: 30, marginTop: 12, borderWidth: 1, borderColor: colors.error + "88", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    ghostText: { fontSize: 14, fontWeight: "900" },
    feedback: { minHeight: 46, borderRadius: 13, marginTop: 14, padding: 11, alignItems: "center", gap: 8 },
  } as const;
}