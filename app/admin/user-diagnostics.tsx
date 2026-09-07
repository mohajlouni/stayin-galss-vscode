import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AdminSessionExpired } from "@/components/admin-session-expired";
import { CompactScreenHeader } from "@/components/compact-screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useWorkspaceAccess } from "@/lib/workspace-access";

function formatArabicTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-JO");
}

function roleLabel(role: string): string {
  switch (role) {
    case "super-admin": return "مدير النظام (Super Admin)";
    case "owner": return "مالك منشأة";
    case "admin": return "مدير منشأة";
    case "staff": return "موظف حجوزات";
    case "guard": return "حارس / مشرف ميداني";
    case "caretaker": return "حارس / مشرف ميداني";
    case "guest": return "ضيف";
    case "internal": return "حساب داخلي";
    case "none": return "لا رتبة محددة";
    default: return role;
  }
}

function otpLabel(otp: { present: boolean; expired: boolean; verifiedAt: string | null } | null): string {
  if (!otp) return "لا يوجد رمز تحقق محلي (المصادقة عبر مزوّد خارجي)";
  if (!otp.present) return "لا يوجد رمز تحقق نشط";
  if (otp.expired) return otp.verifiedAt ? "منتهي الصلاحية — سبق التحقق منه" : "منتهي الصلاحية";
  return otp.verifiedAt ? "ساري الصلاحية — تم التحقق منه" : "ساري الصلاحية";
}

export default function UserDiagnosticsScreen() {
  const colors = useColors();
  const { isSuperAdmin, loading } = useWorkspaceAccess();
  const [input, setInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const diagnose = trpc.systemDiagnostics.diagnoseUser.useQuery({ query: submittedQuery }, { enabled: submittedQuery.trim().length >= 1, retry: false });
  const forceLogout = trpc.systemDiagnostics.forceLogout.useMutation({
    onSettled: () => void diagnose.refetch(),
  });

  const report = diagnose.data ?? null;
  const notFound = diagnose.isFetched && !diagnose.data && !diagnose.isLoading ? true : false;

  const submit = () => {
    const query = input.trim();
    if (!query) {
      Alert.alert("أدخل معرّف الحساب", "أدخل البريد الإلكتروني أو رقم الهاتف أو رقم الحساب (#ID) لتشخيصه.");
      return;
    }
    setSubmittedQuery(query);
  };

  const runForceLogout = () => {
    if (!report) return;
    Alert.alert(
      "إنهاء كافة الجلسات النشطة",
      `سيتم إبطال جميع رموز الجلسات والتنشيط (refresh tokens) الخاصة بـ ${report.user.name || report.user.email || `#${report.user.id}`} فورًا دون تغيير كلمة المرور أو هوية الحساب. هل تريد المتابعة؟`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: "إنهاء الجلسات فورًا", style: "destructive", onPress: () => forceLogout.mutate({ userId: report.user.id }) },
      ],
    );
  };

  if (loading) {
    return <ScreenContainer><View style={styles.center}><MaterialIcons name="manage-accounts" size={38} color={colors.primary} /><Text style={{ color: colors.muted }}>جارٍ التحقق من صلاحية الإدارة العليا…</Text></View></ScreenContainer>;
  }
  if (diagnose.error?.data?.code === "UNAUTHORIZED") {
    return <AdminSessionExpired />;
  }
  if (!isSuperAdmin) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <MaterialIcons name="lock-outline" size={40} color={colors.error} />
          <Text style={[styles.deniedTitle, { color: colors.foreground }]}>هذه اللوحة مخصصة لمدير النظام فقط</Text>
          <Text style={[styles.deniedText, { color: colors.muted }]}>تُفرض صلاحية الإدارة العليا من الخادم، ولا يكفي الوصول إلى هذا الرابط لفتح أداة تشخيص الحسابات.</Text>
          <Pressable onPress={() => router.replace("/admin/master-control")} style={[styles.backButton, { backgroundColor: colors.primary }]}><Text style={styles.whiteText}>العودة إلى مركز الإدارة العليا</Text></Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <CompactScreenHeader title="تشخيص وفحص الحسابات (User Doctor)" icon="manage-accounts" accentColor={colors.primary} backHref="/admin/master-control" showDateTime={false} />
        <Text style={[styles.subtitle, { color: colors.muted }]}>أداة الفحص السريع لعزل مشاكل الحسابات الفردية وتصحيحها.</Text>

        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="person-search" size={20} color={colors.primary} />
          <TextInput
            value={input}
            onChangeText={(text) => { setInput(text); setSubmittedQuery(""); }}
            onSubmitEditing={submit}
            placeholder="ابحث بالبريد الإلكتروني، رقم الهاتف، أو رقم الحساب (#ID)..."
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            textAlign="right"
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {input ? <Pressable onPress={() => { setInput(""); setSubmittedQuery(""); }}><MaterialIcons name="close" size={18} color={colors.muted} /></Pressable> : null}
        </View>
        <Pressable onPress={submit} style={({ pressed }) => [styles.diagnoseButton, { backgroundColor: colors.primary, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="biotech" size={19} color="#FFFFFF" /><Text style={styles.whiteText}>تشخيص الحساب</Text></Pressable>

        {diagnose.isLoading ? <View style={styles.resultLoading}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.muted, fontSize: 11 }}>جارٍ الفحص التسلسلي للحساب…</Text></View> : null}

        {notFound ? (
          <View style={[styles.emptyResult, { borderColor: colors.warning + "66", backgroundColor: colors.warning + "0D" }]}>
            <MaterialIcons name="search-off" size={26} color={colors.warning} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>لم يتم العثور على حساب</Text>
            <Text style={[styles.metaText, { color: colors.muted }]}>تحقق من صحة البريد الإلكتروني أو رقم الهاتف أو المعرّف الرقمي ثم أعد المحاولة.</Text>
          </View>
        ) : null}

        {report ? (
          <View style={[styles.reportCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={[styles.reportHeader, { borderColor: colors.border, backgroundColor: colors.primary + "0D" }]}>
              <View style={[styles.avatar, { backgroundColor: colors.primary + "1F" }]}><MaterialIcons name={report.isSuperAdmin ? "admin-panel-settings" : "person"} size={26} color={colors.primary} /></View>
              <View style={styles.flex}>
                <Text style={[styles.reportName, { color: colors.foreground }]}>{report.user.name || "حساب بدون اسم"}</Text>
                <Text style={[styles.metaText, { color: colors.muted }]}>{report.user.email || "بلا بريد"}</Text>
                <Text style={[styles.metaText, { color: colors.muted }]}>{report.user.phone || "بلا هاتف"}</Text>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: report.isSuperAdmin ? colors.error + "1F" : colors.primary + "18" }]}><Text style={[styles.roleBadgeText, { color: report.isSuperAdmin ? colors.error : colors.primary }]}>{report.isSuperAdmin ? "SUPER ADMIN" : report.user.role === "admin" ? "ADMIN" : "USER"}</Text></View>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.muted }]}>الفحص التسلسلي الآلي</Text>

            <CheckRow
              icon="verified-user" label="حالة الحساب والتوثيق"
              value={report.account.verified ? "موثق ونشط" : "معلق / غير موثق"}
              ok={report.account.verified} colors={colors}
              detail={[report.account.emailConfirmedAt ? "مؤكد عبر مزود الهوية (Supabase Auth) كأصل حالة التوثيق" : undefined, report.account.deletionRequested ? `خاضع حاليًا لطلب حذف الحساب (${report.account.deletionStatus})` : undefined, report.account.suspendedWorkspaceCount ? `معلّق في ${report.account.suspendedWorkspaceCount} منشأة` : undefined].filter(Boolean).join(" · ") || undefined}
            />
            <CheckRow
              icon="account-tree" label="الرتبة والصلاحيات القياسية"
              value={roleLabel(report.identityRole)}
              ok={report.memberships.length > 0 || report.isSuperAdmin} colors={colors}
              detail={report.memberships.length ? `الأدوار في المنشآت: ${[...new Set(report.memberships.map((m) => roleLabel(m.role)))].join("، ")}` : "لا توجد عضويات نشطة"}
            />
            <CheckRow
              icon="holiday-village" label="الربط بالمنشأة والوحدات"
              value={report.activeWorkspace ? `${report.activeWorkspace.name} (#${report.activeWorkspace.id})` : "لا توجد منشأة نشطة"}
              ok={Boolean(report.activeWorkspace)} colors={colors}
              detail={`الوحدات المتاحة: ${report.unitCount} · إجمالي المنشآت المرتبطة: ${report.workspaceCount}`}
            />
            {report.account.authProvider === "supabase" ? (
              <CheckRow
                icon="shield" label="رمز التحقق (OTP)"
                value="المصادقة مدارة عبر مزود الهوية المعتمد (Supabase Auth)"
                ok tone="info" colors={colors}
                detail={report.otp ? `ملاحظة: باقي رمز تحقق محلي لمنشأة #${report.otp.workspaceId} (${otpLabel(report.otp)})` : "لا يوجد رمز تحقق محلي — لا يحتاجه الحساب."}
              />
            ) : (
              <CheckRow
                icon="sms" label="رمز التحقق (OTP)"
                value={otpLabel(report.otp)}
                ok={Boolean(report.otp && report.otp.present && !report.otp.expired)} colors={colors}
                detail={report.otp ? `آخر رمز لمنشأة #${report.otp.workspaceId}` : undefined}
              />
            )}
            <CheckRow
              icon="devices" label="الجلسات والأجهزة النشطة"
              value={`${report.sessions.count} جلسة حية`}
              ok={report.sessions.count > 0} colors={colors}
              detail={[`آخر ظهور: ${formatArabicTime(report.sessions.lastSignedIn)}`, `رموز تنشيط حية: ${report.sessions.liveRefreshTokens}`, report.sessions.recentSignInActive && report.sessions.count === 0 ? "نشاط حديث ضمن صلاحية الجلسة" : undefined].filter(Boolean).join(" · ") || undefined}
            />

            <View style={[styles.forceBox, { borderColor: colors.error + "66", backgroundColor: colors.error + "08" }]}>
              <MaterialIcons name="logout" size={20} color={colors.error} />
              <View style={styles.flex}>
                <Text style={[styles.forceTitle, { color: colors.foreground }]}>إنهاء الجلسات الطارئ</Text>
                <Text style={[styles.metaText, { color: colors.muted }]}>يُلغي رموز الجلسات والتنشيط فورًا دون تغيير كلمة المرور. يُستخدم عند اشتباه اختراق أو تسريب جلسة.</Text>
              </View>
            </View>
            <Pressable disabled={forceLogout.isPending} onPress={runForceLogout} style={({ pressed }) => [styles.forceButton, { backgroundColor: colors.error, opacity: pressed || forceLogout.isPending ? 0.6 : 1 }]}><MaterialIcons name="logout" size={18} color="#FFFFFF" /><Text style={styles.whiteText}>إنهاء كافة الجلسات النشطة فوراً (Force Logout)</Text></Pressable>
            {forceLogout.isSuccess ? <Text style={[styles.toast, { color: colors.success }]}>تم إبطال {forceLogout.data?.revokedSessions ?? 0} جلسة وتحديث التقرير.</Text> : null}
            {forceLogout.isError ? <Text style={[styles.toast, { color: colors.error }]}>تعذر إنهاء الجلسات: {forceLogout.error?.message ?? "خطأ غير متوقع"}</Text> : null}
          </View>
        ) : null}

        <Text style={[styles.guardNote, { color: colors.muted }]}>الفحص يقرأ السجل المحلي الخادمي ويصالحه مع حالة الهوية لدى مزود Supabase Auth عند توفر مفتاح الخدمة: الحالة، توثيق البريد، الرتبة، العضويات، الجلسات (رموز تنشيط غير منتهية أو نشاط حديث)، وآخر رمز تحقق. جميع النتائج للاسترشاد وتراجع فوري بأي تعديل سلوكي يتبعها.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function CheckRow({ icon, label, value, ok, tone, colors, detail }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; value: string; ok: boolean; tone?: "info"; colors: ReturnType<typeof useColors>; detail?: string }) {
  const actionTone = tone === "info" ? "sky" : ok ? "success" : "error";
  const finalIcon = tone === "info" ? "shield" : ok ? "check-circle" : "error";
  const valueColor = tone === "info" ? colors.sky : ok ? colors.success : colors.error;
  return (
    <View style={[styles.checkRow, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
      <MaterialIcons name={finalIcon} size={20} color={colors[actionTone]} />
      <View style={styles.flex}>
        <Text style={[styles.checkLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.checkValue, { color: valueColor }]}>{value}</Text>
        {detail ? <Text style={[styles.metaText, { color: colors.muted }]}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 },
  deniedTitle: { fontSize: 19, fontWeight: "900", textAlign: "center" },
  deniedText: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  backButton: { minHeight: 46, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 8 },
  whiteText: { color: "#FFFFFF", fontWeight: "900" },
  subtitle: { marginTop: 10, fontSize: 12, lineHeight: 19, textAlign: "right" },
  searchBox: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 16 },
  searchInput: { flex: 1, fontSize: 12, textAlign: "right" },
  diagnoseButton: { minHeight: 48, borderRadius: 14, marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  resultLoading: { minHeight: 110, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyResult: { marginTop: 16, minHeight: 140, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", padding: 18, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "900", textAlign: "center" },
  reportCard: { marginTop: 16, borderWidth: 1, borderRadius: 22, padding: 14, gap: 10 },
  reportHeader: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  reportName: { fontSize: 15, fontWeight: "900" },
  metaText: { fontSize: 10, lineHeight: 15, marginTop: 2, textAlign: "right" },
  flex: { flex: 1, minWidth: 0 },
  roleBadge: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, flexShrink: 0 },
  roleBadgeText: { fontSize: 10, fontWeight: "900" },
  sectionLabel: { fontSize: 11, fontWeight: "800", marginTop: 4 },
  checkRow: { minHeight: 58, borderRadius: 14, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9, flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  checkLabel: { fontSize: 12, fontWeight: "900", textAlign: "right" },
  checkValue: { fontSize: 11, fontWeight: "800", marginTop: 3, textAlign: "right" },
  forceBox: { borderRadius: 14, borderWidth: 1, padding: 11, flexDirection: "row-reverse", alignItems: "center", gap: 9, marginTop: 4 },
  forceTitle: { fontSize: 13, fontWeight: "900", textAlign: "right" },
  forceButton: { minHeight: 50, borderRadius: 14, marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  toast: { fontSize: 11, fontWeight: "800", textAlign: "right", marginTop: 5 },
  guardNote: { fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 16 },
});