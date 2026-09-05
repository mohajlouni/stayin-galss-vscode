import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useDemoMode } from "@/lib/demo-mode";
import { trpc } from "@/lib/trpc";
import { useAuthSession } from "@/lib/auth-session";

const CURRENCY_OPTIONS = ["د.أ", "ر.س", "د.إ", "$"] as const;

/**
 * First-workspace creation wizard reached from the /onboarding gateway. On
 * save the user becomes the OWNER of the new property (workspace.create assigns
 * the owner membership + permissions) and the app unlocks to the dashboard.
 * Basic settings (business name, phone, currency) are stored in the seeded
 * workspace payload so the very first screen renders real configuration.
 */
export default function CreateWorkspaceScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { isAuthenticated, loading, routing, user } = useAuthSession();
  const { exitDemo } = useDemoMode();
  const createWorkspace = trpc.workspace.create.useMutation();
  const [name, setName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [currency, setCurrency] = useState<string>(CURRENCY_OPTIONS[0]);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isAuthenticated) return <Redirect href="/auth/login" />;
  if (isAuthenticated && !loading && !routing.isLoading && routing.data?.destination !== "onboarding") {
    if (routing.data?.destination === "dashboard") return <Redirect href="/(tabs)" />;
    if (routing.data?.destination === "selector") return <Redirect href="/auth/select-workspace" />;
    if (routing.data?.destination === "restore") return <Redirect href="/restore-account" />;
  }

  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setFormError(language === "ar" ? "أدخل اسم المنشأة (مثال: مزرعة الهدا أو شاليهات الموج)." : "Enter a property name (e.g. Al-Hada farm or Al-Mawj chalets).");
      return;
    }
    setFormError(null);
    try {
      await createWorkspace.mutateAsync({ name: trimmed, phone: businessPhone.trim(), currency: currency.trim() });
      exitDemo();
      await routing.refetch();
      router.replace("/(tabs)");
    } catch {
      setFormError(language === "ar" ? "تعذر إنشاء المنشأة. تحقق من الاتصال أو جرّب اسمًا آخر." : "Could not create the property. Check your connection or try another name.");
      Alert.alert(language === "ar" ? "تعذر إنشاء المنشأة" : "Could not create property", language === "ar" ? "حاول باسم آخر أو تحقق من الاتصال." : "Try another name or check your connection.");
    }
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.topBar, { flexDirection: row }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "العودة إلى اختيار الدور" : "Back to role selection"} onPress={() => router.back()} style={({ pressed }) => [styles.back, { opacity: pressed ? 0.65 : 1, flexDirection: row }]}>
          <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={21} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 13 }}>{language === "ar" ? "اختيار الدور" : "Role selection"}</Text>
        </Pressable>
        <View style={styles.flex} />
      </View>

      <View style={[styles.hero, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "48" }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="add-business" size={26} color={colors.primary} /></View>
        <Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "أنشئ منشأتك الأولى" : "Create your first property"}</Text>
        <Text style={[styles.detail, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "سجّل اسم المزرعة أو الشاليه وإعداداته الأساسية. بمجرد الحفظ سيُعيَّن دورك كمالك وتُفتح لوحة التحكم لك." : "Enter the farm/chalet name and its basic settings. Saving assigns your Owner role and opens the dashboard."}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "اسم المزرعة / الشاليه" : "Farm / chalet name"}</Text>
        <TextInput value={name} onChangeText={(value) => { setName(value); setFormError(null); }} placeholder={language === "ar" ? "مثال: مزرعة الهدا" : "e.g. Al-Hada farm"} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} accessibilityLabel={language === "ar" ? "اسم المنشأة" : "Property name"} />

        <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "رقم الهاتف (اختياري)" : "Phone number (optional)"}</Text>
        <TextInput value={businessPhone} onChangeText={setBusinessPhone} placeholder={language === "ar" ? "+962 7X XXX XXXX" : "+962 7X XXX XXXX"} keyboardType="phone-pad" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} accessibilityLabel={language === "ar" ? "رقم الهاتف" : "Phone number"} />

        <Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "العملة" : "Currency"}</Text>
        <View style={[styles.currencyRow, { flexDirection: row }]}>
          {CURRENCY_OPTIONS.map((option) => {
            const active = option === currency;
            return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setCurrency(option)} style={({ pressed }) => [styles.currencyChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: active ? colors.primary : colors.muted, fontWeight: "900", fontSize: 14 }}>{option}</Text></Pressable>;
          })}
        </View>

        {formError ? <View accessibilityLiveRegion="polite" style={[styles.inlineError, { backgroundColor: colors.error + "12", flexDirection: row }]}><MaterialIcons name="error-outline" size={16} color={colors.error} /><Text style={[styles.flex, { color: colors.error, fontSize: 11, fontWeight: "800", textAlign: align }]}>{formError}</Text></View> : null}

        <Pressable disabled={createWorkspace.isPending} onPress={() => void create()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed || createWorkspace.isPending ? 0.66 : 1, flexDirection: row }]}>
          <MaterialIcons name="storefront" size={19} color={colors.background} />
          <Text style={{ color: colors.background, fontWeight: "900" }}>{createWorkspace.isPending ? (language === "ar" ? "جارٍ الإنشاء…" : "Creating…") : (language === "ar" ? "حفظ وتعييني مالكًا" : "Save and make me the owner")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 44 }, topBar: { alignItems: "center", minHeight: 40, marginBottom: 12 }, back: { minHeight: 38, alignItems: "center", gap: 5 }, flex: { flex: 1, minWidth: 0 }, hero: { borderWidth: 1, borderRadius: 22, padding: 17 }, heroIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" }, title: { marginTop: 12, fontSize: 22, lineHeight: 30, fontWeight: "900" }, detail: { marginTop: 6, fontSize: 12, lineHeight: 19 }, card: { marginTop: 16, borderWidth: 1, borderRadius: 20, padding: 14 }, label: { fontSize: 12, fontWeight: "900", marginTop: 12 }, input: { minHeight: 50, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, marginTop: 6 }, currencyRow: { gap: 8, marginTop: 8, flexWrap: "wrap" }, currencyChip: { minWidth: 52, minHeight: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }, inlineError: { minHeight: 38, borderRadius: 11, padding: 9, alignItems: "center", gap: 7, marginTop: 12 }, primary: { minHeight: 52, borderRadius: 13, marginTop: 14, alignItems: "center", justifyContent: "center", gap: 7 },
});