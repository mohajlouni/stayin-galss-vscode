import MaterialIcons from "@expo/vector-icons/MaterialIcons";
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
import { useWorkspaceAccess } from "@/lib/workspace-access";

type ConfirmationAction = "signout" | "reset-operations";
type SecurityIcon = "key" | "delete-forever" | "logout" | "cleaning-services";

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
    setPwVisible(true);
  };
  const closePassword = () => { if (!pwBusy) { setPwError(null); setPwVisible(false); } };

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
      const update = await supabase.auth.updateUser({ password: pwNew });
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
    <Modal transparent visible={confirmation !== null} animationType="fade" onRequestClose={() => !actionBusy && setConfirmation(null)}><View style={styles.modalBackdrop}><View style={[styles.confirmation, { backgroundColor: colors.surface, borderColor: confirmation === "reset-operations" ? colors.error + "80" : colors.border }]}><Text style={{ color: confirmation === "reset-operations" ? colors.error : colors.foreground, fontSize: 18, fontWeight: "900", textAlign: align }}>{confirmationTitle}</Text><Text style={{ color: colors.muted, marginTop: 8, fontSize: 12, lineHeight: 19, textAlign: align }}>{confirmationText}</Text><View style={[styles.confirmationActions, { flexDirection: row }]}><Pressable disabled={actionBusy} onPress={() => setConfirmation(null)} style={({ pressed }) => [styles.confirmSecondary, { borderColor: colors.border, opacity: pressed || actionBusy ? 0.62 : 1 }]}><Text style={{ color: colors.foreground, fontWeight: "900" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable><Pressable disabled={actionBusy} onPress={() => void confirmAction()} style={({ pressed }) => [styles.confirmPrimary, { backgroundColor: confirmation === "reset-operations" ? colors.error : colors.primary, opacity: pressed || actionBusy ? 0.62 : 1 }]}><Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center" }}>{actionBusy ? (language === "ar" ? "جارٍ التنفيذ" : "Working") : confirmLabel}</Text></Pressable></View></View></View></Modal>
    <Modal transparent visible={pwVisible} animationType="fade" onRequestClose={closePassword}><View style={styles.modalBackdrop}><View style={[styles.confirmation, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تغيير كلمة المرور" : "Change password"}</Text><Text style={{ color: colors.muted, marginTop: 8, fontSize: 12, lineHeight: 19, textAlign: align }}>{language === "ar" ? `الحساب: ${currentUser?.email ?? ""}` : `Account: ${currentUser?.email ?? ""}`}</Text><View style={{ marginTop: 14, gap: 3 }}>{[
      { key: "current", label: language === "ar" ? "كلمة المرور الحالية" : "Current password", value: pwCurrent, save: setPwCurrent, show: pwShowCurrent, toggle: setPwShowCurrent },
      { key: "new", label: language === "ar" ? "كلمة المرور الجديدة (8 أحرف على الأقل)" : "New password (at least 8 characters)", value: pwNew, save: setPwNew, show: pwShowNew, toggle: setPwShowNew },
      { key: "confirm", label: language === "ar" ? "تأكيد كلمة المرور الجديدة" : "Confirm new password", value: pwConfirm, save: setPwConfirm, show: pwShowConfirm, toggle: setPwShowConfirm },
    ].map((f) => <View key={f.key} style={styles.pwFieldWrap}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "900", marginBottom: 4, textAlign: align }}>{f.label}</Text><View style={[styles.pwField, { borderColor: colors.border, flexDirection: row }]}><TextInput value={f.value} onChangeText={f.save} secureTextEntry={!f.show} autoCapitalize="none" autoCorrect={false} placeholder="••••••••" placeholderTextColor={colors.muted + "88"} style={[styles.pwInput, { color: colors.foreground, textAlign: align }]} /><Pressable onPress={() => f.toggle(!f.show)} style={styles.pwEye}><MaterialIcons name={f.show ? "visibility-off" : "visibility"} size={20} color={colors.muted} /></Pressable></View></View>)}</View>{pwError ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: colors.error + "12", borderColor: colors.error + "55", flexDirection: row, marginTop: 12 }]}><MaterialIcons name="error-outline" size={17} color={colors.error} /><Text style={[styles.flex, { color: colors.error, fontWeight: "800", fontSize: 11, textAlign: align }]}>{pwError}</Text></View> : null}<View style={[styles.confirmationActions, { flexDirection: row }]}><Pressable disabled={pwBusy} onPress={closePassword} style={({ pressed }) => [styles.confirmSecondary, { borderColor: colors.border, opacity: pressed || pwBusy ? 0.62 : 1 }]}><Text style={{ color: colors.foreground, fontWeight: "900" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable><Pressable disabled={pwBusy} onPress={() => void changePassword()} style={({ pressed }) => [styles.confirmPrimary, { backgroundColor: colors.primary, opacity: pressed || pwBusy ? 0.62 : 1 }]}><Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center" }}>{pwBusy ? <ActivityIndicator size="small" color="#FFF" /> : (language === "ar" ? "تحديث كلمة المرور" : "Update password")}</Text></Pressable></View></View></View></Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({ content: { flexGrow: 1, padding: 16, paddingBottom: 42, gap: 14 }, card: { borderWidth: 1, borderRadius: 20, padding: 15 }, flex: { flex: 1, minWidth: 0 }, toggle: { minHeight: 65, borderWidth: 1, borderRadius: 14, padding: 10, marginTop: 12, alignItems: "center", gap: 10 }, action: { minHeight: 76, borderWidth: 1, borderRadius: 15, marginTop: 12, padding: 11, gap: 10, alignItems: "center" }, icon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, feedback: { minHeight: 44, borderWidth: 1, borderRadius: 14, padding: 10, alignItems: "center", gap: 8 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.58)", justifyContent: "center", padding: 22 }, confirmation: { borderWidth: 1, borderRadius: 22, padding: 18 }, confirmationActions: { gap: 10, marginTop: 18 }, confirmSecondary: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" }, confirmPrimary: { flex: 1, minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 9 }, pwFieldWrap: { marginTop: 8 }, pwField: { minHeight: 50, borderWidth: 1, borderRadius: 13, alignItems: "center" }, pwInput: { flex: 1, minHeight: 48, paddingHorizontal: 12, fontSize: 14 }, pwEye: { minWidth: 44, height: 48, alignItems: "center", justifyContent: "center" } });
