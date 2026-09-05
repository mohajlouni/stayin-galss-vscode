import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as LocalAuthentication from "expo-local-authentication";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppToggle } from "@/components/app-toggle";
import { CompactScreenHeader } from "@/components/compact-screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuthSession } from "@/lib/auth-session";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { normalizeOtpToken } from "@/lib/supabase-otp-engine";
import { useWorkspaceAccess } from "@/lib/workspace-access";

type ConfirmationAction = "signout" | "reset-operations";
type SecurityIcon = "key" | "delete-forever" | "logout" | "cleaning-services";
type PickMode = "current" | "recovery";
type RecoveryStep = "pick" | "biometric" | "otp";

export default function AccountSecurityScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { logout, activeSession, biometricAvailable, setBiometricsEnabled, setRememberMe, currentUser } = useAuthSession();
  const { resetOperationalRecords } = useBookings();
  const { isOwner } = useWorkspaceAccess();
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [pwVisible, setPwVisible] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwShowCurrent, setPwShowCurrent] = useState(false);
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwShowConfirm, setPwShowConfirm] = useState(false);

  // Forgotten-password recovery (for biometric users who no longer remember the old password).
  const [pickMode, setPickMode] = useState<PickMode>("current");
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("pick");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryOtpSent, setRecoveryOtpSent] = useState(false);
  const [recoveryOtpToken, setRecoveryOtpToken] = useState("");
  const [recoveryOtpVerified, setRecoveryOtpVerified] = useState(false);
  const recoveryEnabled = biometricAvailable && activeSession.biometricsEnabled;

  const signOut = () => {
    setActionBusy(true);
    setActionError(null);
    setConfirmation(null);
    void logout();
    router.replace("/auth/login");
  };

  const openPassword = () => {
    setPwCurrent("");
    setPwNew("");
    setPwConfirm("");
    setPwError(null);
    setPickMode("current");
    setRecoveryStep("pick");
    setRecoveryOtpSent(false);
    setRecoveryOtpToken("");
    setRecoveryOtpVerified(false);
    setPwVisible(true);
  };
  const closePassword = () => { if (!pwBusy && !recoveryBusy) { setPwError(null); setPwVisible(false); } };

  const gatherNewPassword = () => {
    const email = currentUser?.email?.trim();
    if (!email) {
      setPwError(language === "ar" ? "لا يوجد بريد إلكتروني مرتبط بهذا الحساب لتغيير كلمة المرور." : "No email is linked to this account to change its password.");
      return null;
    }
    if (!isSupabaseConfigured || !supabase) {
      setPwError(language === "ar" ? "مصادقة البريد غير مُهيأة على هذا النظام." : "Email authentication is not configured on this system.");
      return null;
    }
    if (!pwNew.trim()) { setPwError(language === "ar" ? "أدخل كلمة مرور جديدة." : "Enter a new password."); return null; }
    if (pwNew.length < 8) { setPwError(language === "ar" ? "يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف." : "The new password must be at least 8 characters."); return null; }
    if (pwNew !== pwConfirm) { setPwError(language === "ar" ? "كلمتا المرور غير متطابقتين." : "The passwords do not match."); return null; }
    return email;
  };

  const applyNewPassword = async (email: string) => {
    setPwBusy(true);
    try {
      const update = await supabase!.auth.updateUser({ password: pwNew });
      if (update.error) {
        setPwBusy(false);
        setPwError(language === "ar" ? "تعذر تحديث كلمة المرور. حاول مرة أخرى لاحقًا." : "Could not update the password. Try again later.");
        return;
      }
      setPwBusy(false);
      setPwVisible(false);
      setActionNotice(language === "ar" ? "تم تحديث كلمة المرور بنجاح." : "Password updated successfully.");
      setTimeout(() => setActionNotice(null), 3500);
    } catch {
      setPwBusy(false);
      setPwError(language === "ar" ? "تعذر تحديث كلمة المرور. تحقق من الاتصال ثم حاول مرة أخرى." : "Could not update the password. Check your connection and try again.");
    }
  };

  const changePassword = async () => {
    setPwError(null);
    const email = currentUser?.email?.trim();
    if (!email) {
      setPwError(language === "ar" ? "لا يوجد بريد إلكتروني مرتبط بهذا الحساب لتغيير كلمة المرور." : "No email is linked to this account to change its password.");
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      setPwError(language === "ar" ? "مصادقة البريد غير مُهيأة على هذا النظام." : "Email authentication is not configured on this system.");
      return;
    }
    if (!pwCurrent.trim()) { setPwError(language === "ar" ? "أدخل كلمة المرور الحالية." : "Enter your current password."); return; }
    if (!pwNew.trim()) { setPwError(language === "ar" ? "أدخل كلمة مرور جديدة." : "Enter a new password."); return; }
    if (pwNew.length < 8) { setPwError(language === "ar" ? "يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف." : "The new password must be at least 8 characters."); return; }
    if (pwNew !== pwConfirm) { setPwError(language === "ar" ? "كلمتا المرور غير متطابقتين." : "The passwords do not match."); return; }
    setPwBusy(true);
    try {
      const check = await supabase.auth.signInWithPassword({ email, password: pwCurrent });
      if (check.error) {
        setPwBusy(false);
        setPwError(language === "ar" ? "كلمة المرور الحالية غير صحيحة." : "The current password is incorrect.");
        return;
      }
      await applyNewPassword(email);
    } catch {
      setPwBusy(false);
      setPwError(language === "ar" ? "تعذر تحديث كلمة المرور. تحقق من الاتصال ثم حاول مرة أخرى." : "Could not update the password. Check your connection and try again.");
    }
  };

  const startBiometricRecovery = async () => {
    setPwError(null);
    const email = currentUser?.email?.trim();
    if (!email) return;
    setRecoveryStep("biometric");
    setRecoveryBusy(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: language === "ar" ? "تأكيد هويتك لتغيير كلمة المرور" : "Verify your identity to change the password",
        promptDescription: language === "ar" ? "استخدم بصمة الإصبع أو Face ID للمتابعة دون إدخال كلمة المرور الحالية." : "Use fingerprint or Face ID to continue without the current password.",
        cancelLabel: language === "ar" ? "إلغاء" : "Cancel",
        fallbackLabel: language === "ar" ? "التخلي عن البصمة" : "Skip biometric",
      });
      if (result.success) {
        setRecoveryOtpVerified(true);
        setPwError(null);
      } else {
        setRecoveryStep("pick");
        setPwError(language === "ar" ? "لم يكتمل التحقق الحيوي. جرّب البصمة مرة أخرى أو استخدم رمز البريد." : "Biometric verification did not complete. Try again or use the email code.");
      }
    } catch {
      setRecoveryStep("pick");
      setPwError(language === "ar" ? "التحقق الحيوي غير متاح على هذا الجهاز." : "Biometric verification is unavailable on this device.");
    } finally {
      setRecoveryBusy(false);
    }
  };

  const dispatchRecoveryOtp = async () => {
    setPwError(null);
    const email = currentUser?.email?.trim();
    if (!email || !isSupabaseConfigured || !supabase) {
      setPwError(language === "ar" ? "لا يمكن إرسال الرمز لهذا الحساب." : "Could not send a code to this account.");
      return;
    }
    setRecoveryStep("otp");
    setRecoveryBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error) {
        setPwError(language === "ar" ? "تعذر إرسال رمز التحقق. تأكد من بريدك ثم حاول مرة أخرى." : "Could not send the verification code. Check your email and try again.");
        setRecoveryStep("pick");
        return;
      }
      setRecoveryOtpSent(true);
      setRecoveryOtpToken("");
      setRecoveryOtpVerified(false);
    } catch {
      setPwError(language === "ar" ? "تعذر إرسال رمز التحقق. تحقق من اتصالك." : "Could not send the code. Check your connection.");
      setRecoveryStep("pick");
    } finally {
      setRecoveryBusy(false);
    }
  };

  const verifyRecoveryOtp = async () => {
    setPwError(null);
    const email = currentUser?.email?.trim();
    const token = normalizeOtpToken(recoveryOtpToken);
    if (!email || !isSupabaseConfigured || !supabase) return;
    if (token.length < 6) {
      setPwError(language === "ar" ? "أدخل رمز التحقق المكوّن من 6 أرقام." : "Enter the 6-digit verification code.");
      return;
    }
    setRecoveryBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (error) {
        setRecoveryBusy(false);
        setPwError(language === "ar" ? "الرمز غير صحيح أو انتهت صلاحيته. حاول مرة أخرى." : "The code is invalid or expired. Try again.");
        return;
      }
      setRecoveryOtpVerified(true);
      setRecoveryBusy(false);
      setPwError(null);
    } catch {
      setRecoveryBusy(false);
      setPwError(language === "ar" ? "تعذر التحقق من الرمز. تحقق من اتصالك." : "Could not verify the code. Check your connection.");
    }
  };

  const resetOperations = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      const removed = await resetOperationalRecords();
      setConfirmation(null);
      const message = language === "ar"
        ? `تم تصفير سجل العمليات بنجاح · ${removed.bookings} حجز و${removed.expenses} مصروف`
        : `Operations reset successfully · ${removed.bookings} bookings and ${removed.expenses} expenses`;
      setActionNotice(message);
      setTimeout(() => setActionNotice(null), 3500);
    } catch {
      setActionError(language === "ar" ? "تعذر تصفير السجلات. تأكد من أنك المالك الأساسي ومن اتصال المزامنة ثم حاول مرة أخرى." : "Could not reset records. Verify primary-owner access and sync, then try again.");
    } finally {
      setActionBusy(false);
    }
  };

  const toggleBiometrics = async (enabled: boolean) => {
    const saved = await setBiometricsEnabled(enabled);
    if (!saved && enabled) Alert.alert(language === "ar" ? "التحقق الحيوي غير متاح" : "Biometric verification unavailable", language === "ar" ? "فعّل بصمة الإصبع أو Face ID من إعدادات الجهاز أولًا، ثم أعد المحاولة." : "Enable fingerprint or Face ID in device settings, then try again.");
  };

  const Row = ({ icon, title, description, onPress, danger = false, caution = false }: { icon: SecurityIcon; title: string; description: string; onPress: () => void; danger?: boolean; caution?: boolean }) => {
    const tone = danger ? colors.error : caution ? colors.warning : colors.primary;
    return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, { flexDirection: row, borderColor: tone + "70", opacity: pressed ? 0.68 : 1 }]}>
      <View style={[styles.icon, { backgroundColor: tone + "14" }]}><MaterialIcons name={icon} size={21} color={tone} /></View>
      <View style={styles.flex}><Text style={{ color: tone, fontSize: 14, fontWeight: "900", textAlign: align }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2, textAlign: align }}>{description}</Text></View>
      <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={tone} />
    </Pressable>;
  };

  const confirmationTitle = confirmation === "reset-operations"
    ? (language === "ar" ? "تأكيد تصفير السجلات المالية والحجوزات" : "Confirm reset of bookings and financial records")
    : (language === "ar" ? "تسجيل الخروج من هذا الجهاز" : "Sign out of this device");
  const confirmationText = confirmation === "reset-operations"
    ? (language === "ar" ? "سيتم مسح كافة الحجوزات والدفعات والمصروفات المسجلة من هذه المنشأة. تبقى الوحدات والحساب محفوظة، وتُنشأ نقطة استرداد قبل التنفيذ. هل تريد المتابعة؟" : "All bookings, payments, and expenses in this property will be cleared. Units and your account remain saved, and a recovery point is created first. Continue?")
    : (language === "ar" ? "سيتم إنهاء الجلسة على هذا الجهاز فقط. تبقى بيانات المنشأة المتزامنة محفوظة." : "Only this device session will end. Your synced property data remains saved.");
  const confirmLabel = confirmation === "reset-operations"
    ? (language === "ar" ? "نعم، تصفير السجلات" : "Yes, reset records")
    : (language === "ar" ? "تسجيل الخروج" : "Sign out");
  const confirmAction = async () => {
    if (confirmation === "reset-operations") await resetOperations();
    else if (confirmation === "signout") signOut();
  };

  const recoveryAuthorized = pickMode === "recovery" && recoveryOtpVerified;

  const passwordFields = (
    <View style={{ marginTop: 14, gap: 3 }}>
      {/* Current password + forgot link — normal mode only. Hidden once the user
          enters recovery (biometric/OTP) to confirm identity. */}
      {pickMode === "current" ? (
        <View style={styles.pwFieldWrap}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "900", marginBottom: 4, textAlign: align }}>{language === "ar" ? "كلمة المرور الحالية" : "Current password"}</Text>
          <View style={[styles.pwField, { borderColor: colors.border, flexDirection: row }]}>
            <TextInput value={pwCurrent} onChangeText={setPwCurrent} secureTextEntry={!pwShowCurrent} autoCapitalize="none" autoCorrect={false} placeholder="••••••••" placeholderTextColor={colors.muted + "88"} style={[styles.pwInput, { color: colors.foreground, textAlign: align }]} />
            <Pressable onPress={() => setPwShowCurrent(!pwShowCurrent)} style={styles.pwEye}><MaterialIcons name={pwShowCurrent ? "visibility-off" : "visibility"} size={20} color={colors.muted} /></Pressable>
          </View>
          <Pressable onPress={() => { setPickMode("recovery"); setRecoveryStep("pick"); setRecoveryOtpSent(false); setRecoveryOtpToken(""); setRecoveryOtpVerified(false); }} style={styles.forgotLink}>
            <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 11, textAlign: align }}>{language === "ar" ? "نسيت كلمة المرور الحالية؟ التحقق بواسطة البصمة / Face ID" : "Forgot your current password? Verify with fingerprint / Face ID"}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Recovery identity options */}
      {pickMode === "recovery" && recoveryStep === "pick" && !recoveryAuthorized ? (
        <View style={styles.recoveryOptions}>
          {recoveryEnabled ? <Pressable onPress={() => void startBiometricRecovery()} style={({ pressed }) => [styles.recoveryOption, { borderColor: colors.success + "66", flexDirection: row, opacity: recoveryBusy ? 0.6 : pressed ? 0.72 : 1 }]}><MaterialIcons name="fingerprint" size={21} color={colors.success} /><Text style={{ color: colors.success, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "التحقق ببصمة الإصبع / الوجه" : "Verify with fingerprint / Face ID"}</Text></Pressable> : <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: align }}>{language === "ar" ? "البصمة غير متاحة على هذا الجهاز. استخدم رمز البريد لتأكيد هويتك وتغيير كلمة المرور." : "Biometrics are unavailable on this device. Use the email OTP to verify your identity and change the password."}</Text>}
          <Pressable onPress={() => void dispatchRecoveryOtp()} style={({ pressed }) => [styles.recoveryOption, { borderColor: colors.primary + "66", flexDirection: row, opacity: recoveryBusy ? 0.6 : pressed ? 0.72 : 1 }]}><MaterialIcons name="mail-outline" size={21} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 12 }}>{language === "ar" ? "إرسال رمز تحقق OTP إلى البريد" : "Send a verification OTP to email"}</Text></Pressable>
        </View>
      ) : null}

      {/* Recovery OTP entry */}
      {pickMode === "recovery" && recoveryStep === "otp" && !recoveryOtpVerified ? (
        <View style={styles.otpCard}>
          <Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, marginBottom: 6, textAlign: align }}>{language === "ar" ? `أُرسل رمز مكوّن من 6 أرقام إلى ${currentUser?.email ?? ""}. أدخله لتفويض تغيير كلمة المرور.` : `A 6-digit code was sent to ${currentUser?.email ?? ""}. Enter it to authorize the password change.`}</Text>
          <TextInput value={recoveryOtpToken} onChangeText={(t) => setRecoveryOtpToken(t.replace(/[^\d]/g, "").slice(0, 12))} keyboardType="number-pad" maxLength={12} placeholder={language === "ar" ? "رمز التحقق" : "Verification code"} placeholderTextColor={colors.muted} textAlign="center" style={[styles.otpInput, { color: colors.foreground, backgroundColor: colors.surfaceMuted, borderColor: colors.border, writingDirection: "ltr" }]} />
          <Pressable disabled={recoveryBusy} onPress={() => void verifyRecoveryOtp()} style={({ pressed }) => [styles.otpVerify, { backgroundColor: colors.primary, opacity: recoveryBusy ? 0.6 : pressed ? 0.72 : 1 }]}><Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>{recoveryBusy ? (language === "ar" ? "جارٍ التحقق" : "Verifying") : (language === "ar" ? "تأكيد الرمز" : "Confirm code")}</Text></Pressable>
        </View>
      ) : null}

      {/* Biometric awaiting indicator while the OS prompt is up */}
      {pickMode === "recovery" && recoveryStep === "biometric" && !recoveryOtpVerified ? (
        <View style={styles.otpCard}><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: align }}>{language === "ar" ? "جارٍ تأكيد هويتك عبر التحقق الحيوي…" : "Confirming your identity with the biometric prompt…"}</Text></View>
      ) : null}

      {/* New + confirm password — always present in normal mode, and in recovery
          once the identity is authorized via biometric or email OTP. */}
      {(pickMode === "current" || recoveryAuthorized) ? (
        <>
          <View style={styles.pwFieldWrap}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "900", marginBottom: 4, textAlign: align }}>{language === "ar" ? "كلمة المرور الجديدة (8 أحرف على الأقل)" : "New password (at least 8 characters)"}</Text><View style={[styles.pwField, { borderColor: colors.border, flexDirection: row }]}><TextInput value={pwNew} onChangeText={setPwNew} secureTextEntry={!pwShowNew} autoCapitalize="none" autoCorrect={false} placeholder="••••••••" placeholderTextColor={colors.muted + "88"} style={[styles.pwInput, { color: colors.foreground, textAlign: align }]} /><Pressable onPress={() => setPwShowNew(!pwShowNew)} style={styles.pwEye}><MaterialIcons name={pwShowNew ? "visibility-off" : "visibility"} size={20} color={colors.muted} /></Pressable></View></View>
          <View style={styles.pwFieldWrap}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "900", marginBottom: 4, textAlign: align }}>{language === "ar" ? "تأكيد كلمة المرور الجديدة" : "Confirm new password"}</Text><View style={[styles.pwField, { borderColor: colors.border, flexDirection: row }]}><TextInput value={pwConfirm} onChangeText={setPwConfirm} secureTextEntry={!pwShowConfirm} autoCapitalize="none" autoCorrect={false} placeholder="••••••••" placeholderTextColor={colors.muted + "88"} style={[styles.pwInput, { color: colors.foreground, textAlign: align }]} /><Pressable onPress={() => setPwShowConfirm(!pwShowConfirm)} style={styles.pwEye}><MaterialIcons name={pwShowConfirm ? "visibility-off" : "visibility"} size={20} color={colors.muted} /></Pressable></View></View>
        </>
      ) : null}
    </View>
  );

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content}>
      <CompactScreenHeader plain title={language === "ar" ? "أمان الحساب" : "Account security"} backHref="/profile" icon="security" />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", textAlign: align }}>{language === "ar" ? "الدخول والجلسة" : "Sign-in & session"}</Text>
        <View style={[styles.toggle, { flexDirection: row, borderColor: colors.border }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "البقاء مسجلاً" : "Stay signed in"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? "تُحفظ الجلسة بأمان على هذا الجهاز." : "The session is stored securely on this device."}</Text></View><AppToggle value={activeSession.rememberMe} onValueChange={(value) => void setRememberMe(value)} isRTL={isRTL} activeColor={colors.primary} inactiveColor={colors.border} accessibilityLabel={language === "ar" ? "تبديل البقاء مسجلاً" : "Toggle stay signed in"} /></View>
        <View style={[styles.toggle, { flexDirection: row, borderColor: biometricAvailable ? colors.success + "66" : colors.border, opacity: biometricAvailable ? 1 : 0.72 }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "الدخول ببصمة الإصبع / الوجه" : "Fingerprint / Face ID sign-in"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{biometricAvailable ? (language === "ar" ? "يتطلب بصمة الإصبع أو Face ID لفتح الجلسة المحفوظة." : "Requires fingerprint or Face ID to unlock the saved session.") : (language === "ar" ? "فعّل بصمة أو Face ID على الجهاز لإتاحة هذا الخيار." : "Enable fingerprint or Face ID on the device to use this option.")}</Text></View><AppToggle disabled={!biometricAvailable} value={biometricAvailable && activeSession.biometricsEnabled} onValueChange={(value) => void toggleBiometrics(value)} isRTL={isRTL} activeColor={colors.success} inactiveColor={colors.border} accessibilityLabel={language === "ar" ? "تبديل الدخول ببصمة الإصبع أو الوجه" : "Toggle biometric sign-in"} /></View>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", textAlign: align }}>{language === "ar" ? "إدارة الوصول" : "Access management"}</Text><Row icon="key" title={language === "ar" ? "تغيير كلمة المرور" : "Change password"} description={language === "ar" ? "تغيير كلمة المرور المرتبطة بحساب البريد الإلكتروني." : "Change the password linked to your email account."} onPress={openPassword} /><Row icon="logout" title={language === "ar" ? "تسجيل الخروج من هذا الجهاز" : "Sign out of this device"} description={language === "ar" ? "لا يحذف حسابك أو بيانات منشأتك المتزامنة." : "Does not delete your account or synced property data."} onPress={() => setConfirmation("signout")} /></View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.error + "55" }]}><Text style={{ color: colors.error, fontSize: 15, fontWeight: "900", textAlign: align }}>{language === "ar" ? "منطقة حساسة" : "Sensitive area"}</Text>{isOwner ? <Row icon="cleaning-services" caution title={language === "ar" ? "تصفير الحجوزات والعمليات المالية" : "Reset bookings & financial records"} description={language === "ar" ? "حذف الحجوزات والمصروفات والدفعات فقط مع بقاء الوحدات والحساب." : "Clears bookings, expenses, and payments only; units and account stay intact."} onPress={() => setConfirmation("reset-operations")} /> : null}<Row icon="delete-forever" danger title={language === "ar" ? "حذف الحساب والبيانات" : "Delete account & data"} description={language === "ar" ? "طلب قابل للإلغاء خلال 30 يومًا قبل المراجعة." : "A request you can cancel during the 30-day review window."} onPress={() => router.push("/account-deletion")} /></View>
      {actionError ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: colors.error + "12", borderColor: colors.error + "55", flexDirection: row }]}><MaterialIcons name="error-outline" size={18} color={colors.error} /><Text style={[styles.flex, { color: colors.error, fontWeight: "800", fontSize: 11, textAlign: align }]}>{actionError}</Text></View> : null}
      {actionNotice ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: colors.success + "12", borderColor: colors.success + "55", flexDirection: row }]}><MaterialIcons name="check-circle" size={18} color={colors.success} /><Text style={[styles.flex, { color: colors.success, fontWeight: "800", fontSize: 11, textAlign: align }]}>{actionNotice}</Text></View> : null}
    </ScrollView>
    <Modal transparent visible={confirmation !== null} animationType="fade" onRequestClose={() => !actionBusy && setConfirmation(null)}><View style={styles.modalOverlay}><View style={[styles.confirmationSheet, { borderColor: confirmation === "reset-operations" ? colors.error + "80" : "#334155" }]}><Text style={{ color: confirmation === "reset-operations" ? colors.error : "#F1F5F9", fontSize: 18, fontWeight: "900", textAlign: align }}>{confirmationTitle}</Text><Text style={{ color: "#94A3B8", marginTop: 8, fontSize: 12, lineHeight: 19, textAlign: align }}>{confirmationText}</Text><View style={[styles.confirmationActions, { flexDirection: row }]}><Pressable disabled={actionBusy} onPress={() => setConfirmation(null)} style={({ pressed }) => [styles.confirmSecondary, { borderColor: "#334155", opacity: pressed || actionBusy ? 0.62 : 1 }]}><Text style={{ color: "#F1F5F9", fontWeight: "900" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable><Pressable disabled={actionBusy} onPress={() => void confirmAction()} style={({ pressed }) => [styles.confirmPrimary, { backgroundColor: confirmation === "reset-operations" ? colors.error : colors.primary, opacity: pressed || actionBusy ? 0.62 : 1 }]}><Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center" }}>{actionBusy ? (language === "ar" ? "جارٍ التنفيذ" : "Working") : confirmLabel}</Text></Pressable></View></View></View></Modal>
    <Modal transparent visible={pwVisible} animationType="fade" onRequestClose={closePassword}><View style={styles.modalOverlay}><View style={[styles.passwordSheet]}>
      <View style={[styles.sheetHeader, { flexDirection: row }]}>
        <Pressable accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={closePassword} disabled={pwBusy || recoveryBusy} style={({ pressed }) => [styles.sheetClose, { backgroundColor: "#1E293B", opacity: pressed || pwBusy ? 0.7 : 1 }]}><MaterialIcons name="close" size={19} color="#CBD5E1" /></Pressable>
        <View style={styles.flex}><Text style={{ color: "#F1F5F9", fontSize: 18, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تغيير كلمة المرور" : "Change password"}</Text><Text style={{ color: "#94A3B8", marginTop: 4, fontSize: 11, lineHeight: 16, textAlign: align }}>{language === "ar" ? `الحساب: ${currentUser?.email ?? ""}` : `Account: ${currentUser?.email ?? ""}`}</Text></View>
      </View>
      <ScrollView style={{ marginTop: 8 }} contentContainerStyle={{ gap: 3 }}>
        <Text style={{ color: "#94A3B8", fontSize: 10, lineHeight: 16, textAlign: align }}>{pickMode === "recovery" ? (language === "ar" ? "أعد تعيين كلمة المرور عبر التحقق المتقدم." : "Reset your password with advanced verification.") : (language === "ar" ? "أدخل كلمة المرور الحالية ثم اختر كلمة مرور جديدة." : "Enter your current password, then choose a new one.")}</Text>
        {passwordFields}
        {pwError ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: colors.error + "18", borderColor: colors.error + "66", flexDirection: row, marginTop: 12 }]}><MaterialIcons name="error-outline" size={17} color={colors.error} /><Text style={[styles.flex, { color: colors.error, fontWeight: "800", fontSize: 11, textAlign: align }]}>{pwError}</Text></View> : null}
      </ScrollView>
      <View style={[styles.confirmationActions, { flexDirection: row }]}>
        <Pressable disabled={pwBusy || recoveryBusy} onPress={closePassword} style={({ pressed }) => [styles.confirmSecondary, { borderColor: "#334155", opacity: pressed || pwBusy ? 0.62 : 1 }]}><Text style={{ color: "#F1F5F9", fontWeight: "900" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable>
        <Pressable disabled={pwBusy || recoveryBusy} onPress={() => { if (pickMode === "recovery") { const email = gatherNewPassword(); if (email && isSupabaseConfigured && supabase) void applyNewPassword(email); } else { void changePassword(); } }} style={({ pressed }) => [styles.confirmPrimary, { backgroundColor: colors.primary, opacity: pressed || pwBusy ? 0.62 : 1 }]}><Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center" }}>{pwBusy ? <ActivityIndicator size="small" color="#FFF" /> : (language === "ar" ? "تحديث كلمة المرور" : "Update password")}</Text></Pressable>
      </View>
    </View></View></Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 16, paddingBottom: 42, gap: 14 },
  card: { borderWidth: 1, borderRadius: 20, padding: 15 },
  flex: { flex: 1, minWidth: 0 },
  toggle: { minHeight: 65, borderWidth: 1, borderRadius: 14, padding: 10, marginTop: 12, alignItems: "center", gap: 10 },
  action: { minHeight: 76, borderWidth: 1, borderRadius: 15, marginTop: 12, padding: 11, gap: 10, alignItems: "center" },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  feedback: { minHeight: 44, borderWidth: 1, borderRadius: 14, padding: 10, alignItems: "center", gap: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center", padding: 18, zIndex: 70 },
  confirmationSheet: { width: "100%", maxWidth: 448, backgroundColor: "#121417", borderWidth: 1, borderColor: "#334155", borderRadius: 22, padding: 20, shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 18 },
  passwordSheet: { width: "100%", maxWidth: 448, backgroundColor: "#121417", borderWidth: 1, borderColor: "#1E293B", borderRadius: 22, padding: 18, shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 18 },
  sheetHeader: { alignItems: "flex-start", gap: 12 },
  sheetClose: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  confirmationActions: { gap: 10, marginTop: 18 },
  confirmSecondary: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  confirmPrimary: { flex: 1, minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 9 },
  pwFieldWrap: { marginTop: 8 },
  pwField: { minHeight: 50, borderWidth: 1, borderRadius: 13, alignItems: "center" },
  pwInput: { flex: 1, minHeight: 48, paddingHorizontal: 12, fontSize: 14 },
  pwEye: { minWidth: 44, height: 48, alignItems: "center", justifyContent: "center" },
  forgotLink: { alignSelf: "flex-start", paddingVertical: 6, paddingRight: 2 },
  recoveryOptions: { marginTop: 10, gap: 8 },
  recoveryOption: { minHeight: 52, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  otpCard: { marginTop: 10, borderWidth: 1, borderRadius: 13, borderColor: "#334155", backgroundColor: "#1E293B", padding: 12 },
  otpInput: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 18, fontWeight: "900", letterSpacing: 4, marginTop: 8 },
  otpVerify: { minHeight: 46, borderRadius: 12, marginTop: 10, alignItems: "center", justifyContent: "center" },
});