import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { CompactScreenHeader } from "@/components/compact-screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAuthSession } from "@/lib/auth-session";
import * as Auth from "@/lib/_core/auth";
import { trpc } from "@/lib/trpc";

export default function AccountDeletionScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { logout } = useAuthSession();
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const status = trpc.accountDeletion.status.useQuery(undefined, { retry: false });
  const request = trpc.accountDeletion.request.useMutation({ onSuccess: () => void status.refetch() });
  const cancel = trpc.accountDeletion.cancel.useMutation({ onSuccess: () => void status.refetch() });
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pending = status.data?.status === "pending";
  const formatDate = (value: Date | string | null | undefined) => value ? new Date(value).toLocaleDateString(language === "ar" ? "ar-JO" : "en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "";
  const normalizeConfirmation = (value: string) => value.replace(/[\u200B\u200C\u200D\uFEFF\s]/g, "").trim().toLowerCase();
  const confirmationValid = (() => { const v = confirmation.trim().toUpperCase(); const nv = normalizeConfirmation(confirmation); return v === "DELETE" || nv === "delete" || nv === "حذف" || confirmation.trim() === "حذف"; })();

  const runDeleteRequest = async () => {
    setSubmitError(null);
    try {
      const submitted = await request.mutateAsync({ confirmation: "DELETE", reason: reason.trim() || null });
      // Sign out and clear the session IMMEDIATELY on success — no waiting on an
      // alert tap. The confirmation message (with the permanent-deletion date) is
      // persisted and PINNED on the login screen so the user still sees the 14-day
      // notice with the remaining grace period and the recovery action.
      const scheduledFor = submitted?.scheduledFor ? new Date(submitted.scheduledFor).toISOString() : undefined;
      const successMessage = language === "ar"
        ? "تم تقديم طلب حذف الحساب. تم تسجيل خروجك وتعطيل الحساب، ولديك مهلة 14 يومًا لاسترجاعه قبل الحذف النهائي."
        : "Your account deletion request was submitted. You have been signed out and the account disabled. You have a 14-day grace period to recover it before permanent deletion.";
      void Auth.setPostLogoutNotice(successMessage, scheduledFor);
      try {
        await Auth.removeSessionToken();
        await Auth.clearUserInfo();
      } catch {
        // Never block the forced sign-out if secure storage is temporarily unavailable.
      }
      // End the UI session first, then navigate forcefully so the screen never
      // remains mounted after deletion ("stays in the page"). Dismissing the whole
      // stack prevents guard re-renders from racing the redirect.
      void logout();
      try {
        router.dismissAll();
        router.replace("/auth/login");
      } catch { /* noop */ }
    } catch (error) {
      setSubmitError(language === "ar"
        ? "تعذر تسجيل طلب حذف الحساب. تحقق من اتصالك بالإنترنت وتسجيل الدخول ثم حاول مرة أخرى."
        : "Could not submit your account deletion request. Check your internet connection and sign-in, then try again.");
    }
  };

  const submit = () => {
    if (!confirmationValid) {
      Alert.alert(language === "ar" ? "تأكيد مطلوب" : "Confirmation required", language === "ar" ? "اكتب كلمة «حذف» أو DELETE لتأكيد الطلب." : "Type حذف or DELETE to confirm the request.");
      return;
    }
    void runDeleteRequest();
  };

  const cancelRequest = () => {
    // Act immediately on press — no hidden second dialog that feels like "nothing
    // happens". Mutate now and surface success/failure inline.
    setSubmitError(null);
    cancel.mutate(undefined, {
      onSuccess: () => {
        void status.refetch();
        setSubmitError(language === "ar"
          ? "تم إلغاء طلب حذف الحساب والاحتفاظ بحسابك وبياناتك بنجاح."
          : "Your account deletion request was cancelled and your account and data were kept.");
      },
      onError: () => setSubmitError(language === "ar" ? "تعذر إلغاء طلب الحذف. تحقق من اتصالك بالإنترنت ثم أعد المحاولة." : "Could not cancel the deletion request. Check your internet connection and try again."),
    });
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content}>
      <CompactScreenHeader title={language === "ar" ? "حذف الحساب والبيانات" : "Delete account & data"} backHref="/(tabs)/more" icon="delete-forever" />
      <View style={[styles.warning, { backgroundColor: colors.error + "10", borderColor: colors.error + "80", flexDirection: row }]}>
        <MaterialIcons name="warning-amber" size={23} color={colors.error} />
        <View style={styles.flex}>
          <Text style={{ color: colors.error, fontSize: 14, fontWeight: "900", textAlign: align }}>{language === "ar" ? "إجراء حساس" : "Sensitive action"}</Text>
          <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: align }}>{language === "ar" ? "لا يُحذف شيء فورًا. يسجل الطلب، ويهدد حسابك وتعطيله فورًا لمهلة 14 يومًا تبدأ من الآن، ويمكنك استرجاعه عبر البريد أو البصمة قبل انتهائها." : "Nothing is deleted immediately. The request disables your account now for a 14-day grace period that starts immediately; you can recover it via email or biometrics before it ends."}</Text>
        </View>
      </View>
      {status.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 36 }} /> : pending ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.warning + "78" }]}>
        <Text style={{ color: colors.warning, fontWeight: "900", textAlign: align }}>{language === "ar" ? "طلب الحذف قيد المراجعة" : "Deletion request pending"}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 8, textAlign: align }}>{language === "ar" ? `موعد المراجعة المحدد: ${formatDate(status.data?.scheduledFor)}.` : `Scheduled review date: ${formatDate(status.data?.scheduledFor)}.`}</Text>
        <Pressable disabled={cancel.isPending} onPress={cancelRequest} style={({ pressed }) => [styles.cancel, { borderColor: colors.primary, flexDirection: row, opacity: pressed || cancel.isPending ? 0.6 : 1 }]}><MaterialIcons name="undo" size={19} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900" }}>{language === "ar" ? "إلغاء طلب الحذف والاحتفاظ بالحساب" : "Cancel request and keep account"}</Text></Pressable>
      </View> : <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", textAlign: align }}>{language === "ar" ? "ما الذي سيحدث؟" : "What happens next?"}</Text>
        {(language === "ar" ? ["يُعطل الوصول إلى الحساب فورًا عند إتمام الطلب.", "تمنح مهلة استرجاع 14 يومًا قبل أي حذف.", "تُراجع البيانات الشخصية وملفات الحساب للحذف أو الإخفاء بعد انتهاء المهلة.", "قد تُحتفظ بسجلات تشغيلية أو مالية بالقدر الذي يفرضه القانون."] : ["Account access is disabled immediately when the request is submitted.", "You get a 14-day recovery grace period before any deletion.", "Personal data and profile files are reviewed for deletion or anonymization after the grace period.", "Operational or financial records may be retained where law requires."]).map((item) => <View key={item} style={[styles.bullet, { flexDirection: row }]}><MaterialIcons name="check-circle-outline" size={18} color={colors.primary} /><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17, flex: 1, textAlign: align }}>{item}</Text></View>)}
        <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "السبب (اختياري)" : "Reason (optional)"}</Text>
        <TextInput value={reason} onChangeText={setReason} multiline placeholder={language === "ar" ? "شارك بأي ملاحظات تريد مراعاتها في المراجعة…" : "Share any feedback you want considered in the review…"} placeholderTextColor={colors.muted} style={[styles.reason, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} />
        <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "أدخل الكلمة لتأكيد طلب الحذف" : "Type the word to confirm deletion"}</Text>
        <TextInput value={confirmation} onChangeText={setConfirmation} placeholder={language === "ar" ? "حذف" : "DELETE"} placeholderTextColor={colors.muted} autoCapitalize="characters" style={[styles.confirmation, { color: colors.foreground, borderColor: confirmationValid ? colors.error : colors.border, backgroundColor: colors.surfaceMuted }]} accessibilityLabel={language === "ar" ? "تأكيد الحذف" : "Deletion confirmation"} />
        {submitError ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: colors.error + "14", borderColor: colors.error + "70", flexDirection: row }]}><MaterialIcons name="error-outline" size={18} color={colors.error} /><Text style={[styles.flex, { color: colors.error, fontWeight: "800", fontSize: 11, textAlign: align }]}>{submitError}</Text></View> : null}
        <Pressable disabled={request.isPending} onPress={submit} style={({ pressed }) => [styles.delete, { backgroundColor: colors.error, flexDirection: row, opacity: (pressed || request.isPending) ? 0.72 : !confirmationValid ? 0.45 : 1 }]} accessibilityRole="button" accessibilityState={{ disabled: request.isPending }}>
          {request.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialIcons name="delete-forever" size={20} color="#FFFFFF" />}
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{request.isPending ? (language === "ar" ? "جاري تقديم الطلب..." : "Submitting...") : (language === "ar" ? "طلب حذف الحساب والبيانات" : "Request account & data deletion")}</Text>
        </Pressable>
      </View>}
    </ScrollView>
  </ScreenContainer>;
}
const styles = StyleSheet.create({ content: { flexGrow: 1, padding: 16, paddingBottom: 42, gap: 14 }, warning: { borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: "row", gap: 10, marginTop: 2 }, flex: { flex: 1, minWidth: 0 }, card: { borderWidth: 1, borderRadius: 20, padding: 15 }, bullet: { gap: 8, marginTop: 12, alignItems: "flex-start" }, label: { marginTop: 17, fontSize: 12, fontWeight: "900" }, reason: { minHeight: 90, borderWidth: 1, borderRadius: 13, padding: 11, marginTop: 7, fontSize: 13, textAlignVertical: "top" }, confirmation: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, marginTop: 7, fontSize: 14, writingDirection: "ltr" }, delete: { minHeight: 52, borderRadius: 14, marginTop: 18, alignItems: "center", justifyContent: "center", gap: 8 }, cancel: { minHeight: 48, borderWidth: 1, borderRadius: 13, marginTop: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, feedback: { minHeight: 46, borderWidth: 1, borderRadius: 13, marginTop: 12, padding: 10, alignItems: "center", gap: 8 } });