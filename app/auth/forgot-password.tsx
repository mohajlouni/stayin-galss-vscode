import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { normalizeInternationalPhone } from "@/lib/phone-number";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const params = useLocalSearchParams<{ mode?: string; identifier?: string }>();
  const [mode, setMode] = useState<"phone" | "email">(params.mode === "email" ? "email" : "phone");
  const [identifier, setIdentifier] = useState(typeof params.identifier === "string" ? params.identifier : "");
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  const validate = () => {
    if (mode === "phone") {
      const phone = normalizeInternationalPhone(identifier.trim());
      return phone.error || !phone.value
        ? (language === "ar" ? "اكتب رقم هاتف دوليًا صحيحًا أو رقمًا أردنيًا يبدأ بـ 079." : "Enter a valid international phone number.")
        : null;
    }
    return emailPattern.test(identifier.trim()) ? null : (language === "ar" ? "اكتب بريدًا إلكترونيًا صحيحًا." : "Enter a valid email address.");
  };

  const continuePreview = () => {
    const message = validate();
    if (message) {
      setError(message);
      setReviewed(false);
      return;
    }
    setError(null);
    setReviewed(true);
  };

  const changeMode = (next: "phone" | "email") => {
    setMode(next);
    setError(null);
    setReviewed(false);
  };

  const description = language === "ar"
    ? "هذه معاينة لتسلسل الواجهة فقط. لن نرسل رمزًا أو نغيّر كلمة المرور في هذه المرحلة."
    : "This is a UI flow preview only. No code is sent and no password is changed at this stage.";
  const successText = language === "ar"
    ? `تسلسل المعاينة صحيح للـ${mode === "phone" ? "رقم" : "بريد"} المدخل. عند تفعيل الخدمة لاحقًا، سترسل بوابة الهوية رمز تحقق إلى هذه القناة.`
    : `The preview flow is valid for the entered ${mode}. When enabled later, the identity service will send a verification code to this channel.`;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "العودة لتسجيل الدخول" : "Back to sign in"} onPress={() => router.replace("/auth/login")} style={({ pressed }) => [styles.back, { borderColor: colors.border, backgroundColor: colors.surface, flexDirection: row, opacity: pressed ? 0.65 : 1 }]}>
          <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={19} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900" }}>{language === "ar" ? "العودة للدخول" : "Back to sign in"}</Text>
        </Pressable>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.icon, { backgroundColor: colors.warning + "18" }]}><MaterialIcons name="lock-reset" size={30} color={colors.warning} /></View>
          <Text style={{ color: colors.foreground, fontSize: 21, fontWeight: "900", marginTop: 14, textAlign: align }}>{language === "ar" ? "نسيت كلمة المرور" : "Forgot password"}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 7, textAlign: align }}>{description}</Text>

          <View style={[styles.modeRow, { flexDirection: row }]}>
            {(["phone", "email"] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => changeMode(value)} style={({ pressed }) => [styles.mode, { backgroundColor: mode === value ? colors.primary + "16" : colors.surfaceMuted, borderColor: mode === value ? colors.primary : colors.border, opacity: pressed ? 0.68 : 1 }]}><Text style={{ color: mode === value ? colors.primary : colors.muted, fontSize: 12, fontWeight: "900" }}>{value === "phone" ? (language === "ar" ? "رقم الهاتف" : "Phone") : (language === "ar" ? "البريد الإلكتروني" : "Email")}</Text></Pressable>)}
          </View>

          <TextInput value={identifier} onChangeText={(value) => { setIdentifier(value); setError(null); setReviewed(false); }} placeholder={mode === "phone" ? "+962 79 000 0000 أو 079 000 0000" : "name@example.com"} keyboardType={mode === "phone" ? "phone-pad" : "email-address"} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.muted} textAlign={mode === "phone" ? "left" : align} style={[styles.input, { color: colors.foreground, borderColor: error ? colors.error : colors.border, backgroundColor: colors.surfaceMuted, writingDirection: mode === "phone" ? "ltr" : undefined }]} />

          {error ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: colors.error + "12", borderColor: colors.error + "55", flexDirection: row }]}><MaterialIcons name="error-outline" size={18} color={colors.error} /><Text style={[styles.flex, { color: colors.error, fontSize: 11, fontWeight: "700", lineHeight: 17, textAlign: align }]}>{error}</Text></View> : null}
          {reviewed ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: colors.success + "12", borderColor: colors.success + "55", flexDirection: row }]}><MaterialIcons name="check-circle" size={18} color={colors.success} /><Text style={[styles.flex, { color: colors.success, fontSize: 11, fontWeight: "800", lineHeight: 17, textAlign: align }]}>{successText}</Text></View> : null}

          <Pressable accessibilityRole="button" onPress={continuePreview} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name="arrow-forward" size={20} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{language === "ar" ? "متابعة فحص التسلسل" : "Continue UI flow test"}</Text></Pressable>
          {reviewed ? <Pressable accessibilityRole="button" onPress={() => router.replace("/auth/login")} style={({ pressed }) => [styles.secondary, { borderColor: colors.primary, opacity: pressed ? 0.65 : 1 }]}><Text style={{ color: colors.primary, fontWeight: "900" }}>{language === "ar" ? "العودة إلى تسجيل الدخول" : "Return to sign in"}</Text></Pressable> : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 18, justifyContent: "center", gap: 14 },
  back: { alignSelf: "flex-start", minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, alignItems: "center", gap: 6 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18 },
  icon: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  modeRow: { gap: 8, marginTop: 18 },
  mode: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, marginTop: 11, fontSize: 13 },
  feedback: { minHeight: 48, borderWidth: 1, borderRadius: 12, marginTop: 10, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center", gap: 7 },
  flex: { flex: 1, minWidth: 0 },
  primary: { minHeight: 51, borderRadius: 13, marginTop: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondary: { minHeight: 45, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 10 },
});
