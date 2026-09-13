import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { claimMatches, findOnbookByPhone, findOnbookByUid, normalizeUid } from "@/lib/staff-directory";
import { useOnbookStaff } from "@/lib/staff-directory-store";

export default function ClaimStaffAccountScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ phone?: string; uid?: string }>();
  const { staff, ready, commit } = useOnbookStaff();
  const [phone, setPhone] = useState(() => (typeof params.phone === "string" ? params.phone.trim() : ""));
  const [uid, setUid] = useState(() => normalizeUid(typeof params.uid === "string" ? params.uid : ""));
  const [step, setStep] = useState<"identity" | "otp" | "done">("identity");
  const [generated, setGenerated] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const ar = language === "ar";

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const matched = useMemo(() => {
    if (!ready) return undefined;
    const byPhone = findOnbookByPhone(staff, phone);
    if (!byPhone) return undefined;
    if (uid.trim()) {
      const byUid = findOnbookByUid(staff, uid);
      return byUid && claimMatches(byUid, phone, uid) ? byUid : undefined;
    }
    return byPhone;
  }, [ready, staff, phone, uid]);

  const verifyIdentity = () => {
    setError(null);
    if (phone.replace(/\D/g, "").length < 6) { setError(ar ? "أدخل رقم الهاتف المسجل في دليل المنتسبين." : "Enter the phone number recorded in the staff directory."); return; }
    if (uid.trim() && !matched) { setError(ar ? "المعرّف ورقم الهاتف لا يتطابقان مع أي منتسب على الكتاب بجهازك. راجعهما أو اطلب من المالك تحديث القائمة." : "The UID and phone do not match any on-book member on this device. Double-check them or ask the owner to update the list."); return; }
    if (!matched) { setError(ar ? "لم يُعثر على منتسب برقم الهاتف هذا في الدليل المحلي، لذا لا توجد عهد أو تحصيلات مرتبطة به. اطلب من المالك إضافتك على الكتاب أولًا." : "No on-book member with this phone was found in the local directory, so no floats or collections are linked to it. Ask the owner to add you to the book first."); return; }
    setGenerated(String(Math.floor(100000 + Math.random() * 900000)));
    setOtp("");
    setStep("otp");
  };

  const verifyOtp = async () => {
    if (busy) return;
    if (otp.trim().length !== 6) { setError(ar ? "أدخل رمز التحقق المكوّن من 6 أرقام." : "Enter the 6-digit verification code."); return; }
    setBusy(true);
    setError(null);
    await new Promise((resolve) => setTimeout(resolve, 650));
    try {
      if (otp.trim() !== generated) { setError(ar ? "رمز التحقق غير صحيح. أعد المحاولة." : "The verification code is incorrect. Try again."); return; }
      await commit(staff.map((entry) => (entry.uid === matched?.uid ? { ...entry, isAppUser: true, authUid: user?.id ? String(user.id) : undefined } : entry)));
      setStep("done");
    } catch {
      setError(ar ? "تعذر حفظ التفعيل المحلي. أعد المحاولة." : "Could not save the local activation. Retry.");
    } finally {
      setBusy(false);
    }
  };

  const resendLocal = () => {
    setGenerated(String(Math.floor(100000 + Math.random() * 900000)));
    setOtp("");
    setError(null);
    setToast(ar ? "تم توليد رمز تحقق جديد" : "A new verification code was generated");
  };

  const styles = makeStyles(colors);

  return (
    <ScreenContainer containerClassName="bg-transparent" safeAreaClassName="bg-transparent" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
          <Pressable accessibilityRole="button" accessibilityLabel={ar ? "الرجوع" : "Back"} onPress={() => router.replace("/user-management")} style={({ pressed }) => [styles.back, { opacity: pressed ? 0.65 : 1 }]}>
            <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={22} color={colors.primary} />
            <ThemedText variant="label" color={colors.primary} style={styles.backText}>{ar ? "الرجوع إلى إدارة المستخدمين" : "Back to user management"}</ThemedText>
          </Pressable>

          <View style={styles.brandArea}>
            <View style={styles.glow}><MaterialIcons name="badge" size={40} color={colors.primary} /></View>
            <ThemedText variant="titleLarge" style={styles.title}>{ar ? "تفعيل حساب التطبيق (Claim)" : "Claim an app account"}</ThemedText>
            <ThemedText variant="bodySmall" color={colors.muted} style={styles.subtitle}>
              {ar ? "إذا كنت منتسبًا مسجلًا على الكتاب حاليًا، أدخل رقم هاتفك المسجل (المعرّف #UID اختياري للمطابقة الأقوى) ثم أكّد رمز تحقق محليًا لربط العهود المالية بحسابك." : "If you are an on-book member, enter your registered phone number (the #UID is optional for a stricter match) then confirm a local verification code to bind your custody floats to your account."}
            </ThemedText>
          </View>

          {step === "identity" ? (
            <View>
              <ThemedText variant="label" color={colors.foreground} style={styles.fieldLabel}>{ar ? "رقم الهاتف المسجل" : "Registered phone number"}</ThemedText>
              <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} placeholder="07XXXXXXXX" placeholderTextColor={colors.muted} autoCorrect={false} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
              <ThemedText variant="label" color={colors.foreground} style={styles.fieldLabel}>{ar ? "معرّف المنتسب (#UID)" : "Staff #UID"}</ThemedText>
              <TextInput value={uid} onChangeText={(text) => setUid(normalizeUid(text))} autoCapitalize="characters" autoCorrect={false} maxLength={40} placeholder="S2001" placeholderTextColor={colors.muted} style={[styles.input, styles.inputMono, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} />
              {ready && staff.length === 0 ? (
                <View style={[styles.feedback, { borderColor: colors.warning + "62", backgroundColor: colors.warning + "10", flexDirection: row }]}>
                  <MaterialIcons name="info-outline" size={17} color={colors.warning} />
                  <ThemedText variant="caption" color={colors.warning} style={styles.feedbackText}>{ar ? "لا يوجد منتسبون على الكتاب بجهازك بعد — أضفهم من «إدارة المستخدمين» ثم أعد المحاولة." : "No on-book staff on this device yet — add them from User management and retry."}</ThemedText>
                </View>
              ) : null}
              {matched ? (
                <View style={[styles.feedback, { borderColor: colors.success + "62", backgroundColor: colors.success + "12", flexDirection: row }]}>
                  <MaterialIcons name="verified" size={17} color={colors.success} />
                  <View style={styles.matchBody}>
                    <ThemedText variant="caption" color={colors.success} style={styles.matchDone}>{ar ? "✓ تم تطابق الهوية:" : "✓ Identity matched:"}</ThemedText>
                    <ThemedText variant="label" color={colors.foreground} style={styles.matchName}>{matched.name} · {matched.uid}</ThemedText>
                    <ThemedText variant="caption" color={colors.muted} style={styles.matchMeta}>{matched.role === "guard" ? (ar ? "حارس ميداني" : "Field guard") : (ar ? "موظف / محاسب" : "Staff / accountant")} · {matched.phone}</ThemedText>
                  </View>
                </View>
              ) : null}
              {matched ? (
                <View style={[styles.feedback, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "0D", flexDirection: row }]}>
                  <MaterialIcons name="account-balance-wallet" size={17} color={colors.primary} />
                  <ThemedText variant="caption" color={colors.foreground} style={styles.feedbackText}>{ar ? "تم العثور على سجل مالي وعهد سابقة مرتبطة برقمك، هل ترغب بربط حسابك؟" : "Financial and custody records were found linked to your number. Would you like to link your account?"}</ThemedText>
                </View>
              ) : null}
              {error ? (
                <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: colors.error + "62", backgroundColor: colors.error + "12", flexDirection: row }]}>
                  <MaterialIcons name="error-outline" size={18} color={colors.error} />
                  <ThemedText variant="caption" color={colors.error} style={styles.feedbackText}>{error}</ThemedText>
                </View>
              ) : null}
              <Pressable disabled={busy} accessibilityRole="button" accessibilityState={{ busy }} onPress={verifyIdentity} style={({ pressed }) => [styles.primaryWrap, { opacity: pressed || busy ? 0.68 : 1 }]}>
                <LinearGradient colors={[colors.primary, colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
                  <MaterialIcons name="verified-user" size={20} color={colors.foreground} />
                  <ThemedText variant="button" color={colors.foreground} style={styles.primaryText}>{ar ? "المتابعة لرمز التحقق" : "Continue to verification"}</ThemedText>
                </LinearGradient>
              </Pressable>
            </View>
          ) : null}

          {step === "otp" ? (
            <View>
              <View style={[styles.codeBox, { backgroundColor: colors.surface, borderColor: colors.primary + "66" }]}>
                <View style={[styles.codeRow, { flexDirection: row }]}>
                  <MaterialIcons name="shield" size={18} color={colors.primary} />
                  <ThemedText variant="label" color={colors.primary} style={styles.codeLabel}>{ar ? "رمز التحقق المحلي (6 أرقام)" : "Local verification code (6 digits)"}</ThemedText>
                </View>
                <ThemedText variant="title" color={colors.foreground} style={styles.codeValue}>{generated}</ThemedText>
                <ThemedText variant="caption" color={colors.muted} style={styles.codeHint}>{ar ? "وضع تجريبي دون إرسال SMS: انسخ هذا الرمز وأدخله في الحقل أدناه لتأكيد الهوية." : "Offline demo without SMS: copy this code and enter it below to confirm identity."}</ThemedText>
              </View>
              <ThemedText variant="label" color={colors.foreground} style={styles.fieldLabel}>{ar ? "أدخل رمز التحقق" : "Enter the code"}</ThemedText>
              <TextInput value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor={colors.muted} style={[styles.input, styles.inputMono, styles.otpInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} />
              {matched ? (
                <View style={[styles.feedback, { borderColor: colors.success + "45", backgroundColor: colors.success + "0D", flexDirection: row }]}>
                  <MaterialIcons name="person" size={16} color={colors.success} />
                  <ThemedText variant="caption" color={colors.muted} style={styles.feedbackText}>{ar ? `سيتم تفعيل «${matched.name}» ${matched.uid} كحساب تطبيق مرتبط بنفس العهود.` : `"${matched.name}" (${matched.uid}) will be activated as an app account bound to the same floats.`}</ThemedText>
                </View>
              ) : null}
              {error ? (
                <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: colors.error + "62", backgroundColor: colors.error + "12", flexDirection: row }]}>
                  <MaterialIcons name="error-outline" size={18} color={colors.error} />
                  <ThemedText variant="caption" color={colors.error} style={styles.feedbackText}>{error}</ThemedText>
                </View>
              ) : null}
              <Pressable disabled={busy} accessibilityRole="button" accessibilityState={{ busy }} onPress={() => void verifyOtp()} style={({ pressed }) => [styles.primaryWrap, { opacity: pressed || busy ? 0.68 : 1 }]}>
                <LinearGradient colors={[colors.primary, colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
                  {busy ? <ActivityIndicator color={colors.foreground} /> : <MaterialIcons name="check" size={20} color={colors.foreground} />}
                  <ThemedText variant="button" color={colors.foreground} style={styles.primaryText}>{busy ? (ar ? "جارٍ التفعيل…" : "Activating…") : (ar ? "تأكيد والتفعيل" : "Confirm & activate")}</ThemedText>
                </LinearGradient>
              </Pressable>
              <View style={[styles.resendRow, { flexDirection: row }]}>
                <MaterialIcons name="refresh" size={16} color={colors.primary} />
                <Pressable onPress={resendLocal}>
                  <ThemedText variant="label" color={colors.primary} style={styles.resendText}>{ar ? "توليد رمز جديد" : "Generate a new code"}</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}

          {step === "done" ? (
            <View>
              <View style={styles.successCircle}><MaterialIcons name="check-circle" size={58} color={colors.success} /></View>
              <ThemedText variant="title" style={styles.doneTitle}>{ar ? "تم تفعيل حساب التطبيق" : "App account activated"}</ThemedText>
              <ThemedText variant="bodySmall" color={colors.muted} style={styles.doneDetail}>
                {ar ? `أصبح «${matched?.name ?? ""}» (${matched?.uid ?? ""}) منتسبًا مفعّلًا للتطبيق، وستبقى عهوده ونقاط التحصيل مرتبطة بنفس المعرّف. حدّد صلاحياته من إدارة المستخدمين عند الحاجة.` : `"${matched?.name ?? ""}" (${matched?.uid ?? ""}) is now an activated app member, with the same custody points staying linked to that UID. Set their permissions in User management when needed.`}
              </ThemedText>
              <Pressable accessibilityRole="button" onPress={() => router.replace("/user-management")} style={({ pressed }) => [styles.primaryWrap, { opacity: pressed ? 0.68 : 1 }]}>
                <LinearGradient colors={[colors.primary, colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
                  <MaterialIcons name="people" size={20} color={colors.foreground} />
                  <ThemedText variant="button" color={colors.foreground} style={styles.primaryText}>{ar ? "فتح إدارة المستخدمين" : "Open user management"}</ThemedText>
                </LinearGradient>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.replace("/workspace-hub")} style={({ pressed }) => [styles.secondaryWrap, { opacity: pressed ? 0.65 : 1 }]}>
                <ThemedText variant="label" color={colors.primary} style={styles.resendText}>{ar ? "العودة إلى الرئيسية" : "Back to home"}</ThemedText>
              </Pressable>
            </View>
          ) : null}

          {toast ? (
            <View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: colors.success, flexDirection: row }]}>
              <MaterialIcons name="check-circle" size={18} color={colors.background} />
              <ThemedText variant="caption" color={colors.background} style={styles.toastText}>{toast}</ThemedText>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return {
    content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 24, paddingBottom: 34 } as const,
    shell: { width: "100%", maxWidth: 440, alignSelf: "center" } as const,
    back: { alignSelf: "flex-start", minHeight: 40, alignItems: "center", flexDirection: "row", gap: 5, marginBottom: 20 } as const,
    backText: { fontSize: 13, fontWeight: "900" } as const,
    brandArea: { alignItems: "center", marginBottom: 24 } as const,
    glow: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.neonBorder, shadowColor: colors.neonGlow, shadowOpacity: 0.28, shadowRadius: 20, elevation: 9 } as const,
    title: { alignSelf: "stretch", textAlign: "right", fontSize: 25, fontWeight: "900", marginTop: 18 } as const,
    subtitle: { alignSelf: "stretch", textAlign: "right", fontSize: 13, lineHeight: 21, marginTop: 7 } as const,
    fieldLabel: { fontSize: 12.5, fontWeight: "800", marginTop: 15, marginBottom: 7 } as const,
    input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 8, fontSize: 15 } as const,
    inputMono: { fontFamily: "monospace" } as const,
    otpInput: { textAlign: "center", fontSize: 22, letterSpacing: 6, fontWeight: "900" } as const,
    feedback: { minHeight: 40, borderRadius: 12, padding: 10, alignItems: "center", gap: 8, marginTop: 16 } as const,
    feedbackText: { fontSize: 12, fontWeight: "800", lineHeight: 18, textAlign: "right", flex: 1 } as const,
    matchBody: { flex: 1, gap: 2 } as const,
    matchDone: { fontSize: 11, fontWeight: "900" } as const,
    matchName: { fontSize: 13, fontWeight: "900" } as const,
    matchMeta: { fontSize: 10.5, lineHeight: 14 } as const,
    primaryWrap: { marginTop: 24, borderRadius: 30, overflow: "hidden", shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: colors.appTheme.shadow.opacity, shadowRadius: colors.appTheme.shadow.radius, elevation: colors.appTheme.shadow.elevation } as const,
    primary: { minHeight: 58, borderRadius: 30, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, paddingHorizontal: 18 } as const,
    primaryText: { fontSize: 16, fontWeight: "900" } as const,
    codeBox: { borderRadius: 18, borderWidth: 1, padding: 15, marginTop: 6, alignItems: "center" } as const,
    codeRow: { alignItems: "center", gap: 6 } as const,
    codeLabel: { fontSize: 12, fontWeight: "900" } as const,
    codeValue: { fontSize: 42, fontWeight: "900", letterSpacing: 10, marginVertical: 12, textAlign: "center", fontFamily: "monospace" } as const,
    codeHint: { fontSize: 11, lineHeight: 16, textAlign: "center" } as const,
    resendRow: { minHeight: 44, alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 } as const,
    resendText: { fontSize: 13, fontWeight: "900" } as const,
    successCircle: { alignItems: "center", marginTop: 10 } as const,
    doneTitle: { alignSelf: "stretch", textAlign: "right", fontSize: 24, fontWeight: "900", marginTop: 14 } as const,
    doneDetail: { alignSelf: "stretch", textAlign: "right", fontSize: 13, lineHeight: 21, marginTop: 8 } as const,
    secondaryWrap: { minHeight: 48, borderRadius: 30, alignItems: "center", justifyContent: "center", marginTop: 6 } as const,
    toast: { position: "absolute", top: 12, alignSelf: "center", borderRadius: 30, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center", gap: 6 } as const,
    toastText: { fontSize: 13, fontWeight: "900" } as const,
  };
}