import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { DEFAULT_DEVICE_SETTINGS } from "@/lib/booking-model";
import { useAppPreferences } from "@/lib/app-preferences";
import { useI18n } from "@/lib/i18n";
import { whatsAppMessageModuleLabel, type WhatsAppMessageModule } from "@/lib/whatsapp-message-engine";

type TemplateSection = "base" | WhatsAppMessageModule;
const SECTIONS: TemplateSection[] = ["base", "arrival", "checkout", "contract"];

const SAMPLE_VALUES: Record<string, string> = {
  "{العميل}": "أحمد محمد",
  "{الشاليه}": "شاليه النخلة",
  "{الفترة}": "صباحي",
  "{الوصول}": "الأحد، 23/08/2026 · 9:00 ص",
  "{المغادرة}": "الأحد، 23/08/2026 · 9:00 م",
  "{الإجمالي}": "125.00 د.أ",
  "{المرجع}": "#NL2608231",
  "{الموقع}": "رابط موقع الشاليه",
  "{الحارس}": "0790000000",
  "{التأمين}": "50.00 د.أ",
  "{المدفوع}": "75.00 د.أ",
  "{المتبقي}": "50.00 د.أ",
  "{الشروط}": "1. المحافظة على محتويات الشاليه.\n2. تسليم الشاليه في الموعد المتفق عليه.",
};

function interpolatePreview(value: string) {
  return value.replace(
    /\{العميل\}|\{الشاليه\}|\{الفترة\}|\{الوصول\}|\{المغادرة\}|\{الإجمالي\}|\{المرجع\}|\{الموقع\}|\{الحارس\}|\{التأمين\}|\{المدفوع\}|\{المتبقي\}|\{الشروط\}/g,
    (token) => SAMPLE_VALUES[token] ?? token,
  );
}

function sectionLabel(section: TemplateSection, language: "ar" | "en") {
  if (section === "base") return language === "ar" ? "الترويسة الأساسية" : "Base header";
  return whatsAppMessageModuleLabel(section, language);
}

function sectionIcon(section: TemplateSection): React.ComponentProps<typeof MaterialIcons>["name"] {
  if (section === "base") return "article";
  if (section === "arrival") return "login";
  if (section === "checkout") return "logout";
  return "verified-user";
}

export default function WhatsAppTemplatesScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { deviceSettings, updateDeviceSettings, triggerHaptic } = useAppPreferences();
  const [selected, setSelected] = useState<TemplateSection>("base");
  const [draft, setDraft] = useState(deviceSettings.whatsAppBaseHeaderTemplate);
  const [termsDraft, setTermsDraft] = useState(deviceSettings.stayContractTerms);
  const [previewOpen, setPreviewOpen] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  const valueFor = (section: TemplateSection) => {
    if (section === "base") return deviceSettings.whatsAppBaseHeaderTemplate;
    if (section === "arrival") return deviceSettings.arrivalMessageBlockTemplate;
    if (section === "checkout") return deviceSettings.checkoutMessageBlockTemplate;
    return deviceSettings.contractMessageBlockTemplate;
  };
  const defaultFor = (section: TemplateSection) => {
    if (section === "base") return DEFAULT_DEVICE_SETTINGS.whatsAppBaseHeaderTemplate;
    if (section === "arrival") return DEFAULT_DEVICE_SETTINGS.arrivalMessageBlockTemplate;
    if (section === "checkout") return DEFAULT_DEVICE_SETTINGS.checkoutMessageBlockTemplate;
    return DEFAULT_DEVICE_SETTINGS.contractMessageBlockTemplate;
  };
  const variables = useMemo(() => {
    if (selected === "base") return "{العميل} · {الشاليه} · {الفترة} · {الوصول} · {المغادرة} · {المرجع} · {الإجمالي} · {المدفوع} · {المتبقي} · {التأمين} · {الموقع} · {الحارس} · {الشروط}";
    if (selected === "arrival") return "{العميل} · {الشاليه} · {الوصول} · {الموقع} · {الحارس}";
    if (selected === "checkout") return "{العميل} · {الشاليه} · {المغادرة}";
    return "{العميل} · {الشاليه} · {المرجع} · {الشروط}";
  }, [selected]);

  const chooseSection = (section: TemplateSection) => {
    setSelected(section);
    setDraft(valueFor(section));
    setPreviewOpen(false);
  };
  const save = async () => {
    const value = draft.trim();
    if (!value) {
      Alert.alert(language === "ar" ? "نص القالب مطلوب" : "Template text required", language === "ar" ? "اكتب نصًا قبل الحفظ." : "Write text before saving.");
      return;
    }
    if (selected === "base" && !termsDraft.trim()) {
      Alert.alert(language === "ar" ? "شروط الإقامة مطلوبة" : "Stay terms required", language === "ar" ? "اكتب شروط الإقامة التي ستظهر داخل الترويسة." : "Write the stay terms shown inside the header.");
      return;
    }
    const patch = selected === "base"
      ? { whatsAppBaseHeaderTemplate: value, stayContractTerms: termsDraft.trim() }
      : selected === "arrival"
        ? { arrivalMessageBlockTemplate: value }
        : selected === "checkout"
          ? { checkoutMessageBlockTemplate: value }
          : { contractMessageBlockTemplate: value };
    await updateDeviceSettings(patch);
    await triggerHaptic();
    Alert.alert(language === "ar" ? "تم الحفظ" : "Saved", language === "ar" ? "سيُستخدم النص الجديد عند إرسال رسالة واتساب التالية." : "The new text will be used in the next WhatsApp message.");
  };
  const restoreDefault = () => {
    Alert.alert(language === "ar" ? "استعادة الافتراضي" : "Restore default", language === "ar" ? "سيستبدل النص في المحرر فقط. اضغط حفظ لتطبيقه." : "This replaces the editor only. Save to apply it.", [
      { text: language === "ar" ? "إلغاء" : "Cancel", style: "cancel" },
      { text: language === "ar" ? "استعادة" : "Restore", style: "destructive", onPress: () => { setDraft(defaultFor(selected)); if (selected === "base") setTermsDraft(DEFAULT_DEVICE_SETTINGS.stayContractTerms); setPreviewOpen(false); } },
    ]);
  };
  const numberedTerms = termsDraft.trim() ? termsDraft.trim().split("\n").map((term, index) => `${index + 1}. ${term.trim()}`).join("\n") : SAMPLE_VALUES["{الشروط}"];
  const previewText = selected === "base" ? interpolatePreview(draft).replace(SAMPLE_VALUES["{الشروط}"], numberedTerms) : interpolatePreview(draft);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <SubScreenHeader title={language === "ar" ? "قوالب رسائل الواتساب" : "WhatsApp message templates"} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.intro, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "4A", flexDirection: row }]}>
            <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
            <Text style={[styles.flex, { color: colors.foreground, fontSize: 12, lineHeight: 19, textAlign: align }]}>
              {language === "ar" ? "الترويسة تُرسل دائمًا مرة واحدة. أضف فقط الوحدات التشغيلية التي تحتاجها حتى لا تتكرر تفاصيل الحجز." : "The header is sent once. Add only the operational blocks you need so booking details never repeat."}
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            <View style={{ flexDirection: row, gap: 7 }}>
              {SECTIONS.map((section) => {
                const active = section === selected;
                return <Pressable key={section} onPress={() => chooseSection(section)} style={({ pressed }) => [styles.tab, { backgroundColor: active ? colors.primary + "16" : colors.surface, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={sectionIcon(section)} size={15} color={active ? colors.primary : colors.muted} /><Text style={{ color: active ? colors.primary : colors.foreground, fontSize: 11, fontWeight: "900" }}>{sectionLabel(section, language)}</Text></Pressable>;
              })}
            </View>
          </ScrollView>

          <View style={[styles.editor, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.editorTitle, { flexDirection: row }]}>
              <View style={styles.flex}>
                <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{sectionLabel(selected, language)}</Text>
                <Text style={{ color: colors.primary, fontSize: 11, lineHeight: 18, marginTop: 5, textAlign: align }}>{selected === "base" ? (language === "ar" ? "تُدرج تلقائيًا في كل رسالة مجمعة، مرة واحدة فقط." : "Included automatically once in every consolidated message.") : (language === "ar" ? "وحدة اختيارية تظهر فقط عند وضع علامة صح عليها قبل الإرسال." : "An optional block shown only when checked before sending.")}</Text>
              </View>
              <View style={[styles.autoBadge, { backgroundColor: selected === "base" ? colors.success + "17" : colors.warning + "17" }]}><Text style={{ color: selected === "base" ? colors.success : colors.warning, fontSize: 10, fontWeight: "900" }}>{selected === "base" ? (language === "ar" ? "تلقائية" : "Auto") : (language === "ar" ? "اختيارية" : "Optional")}</Text></View>
            </View>
            <Text style={{ color: colors.primary, fontSize: 11, lineHeight: 18, marginTop: 12, textAlign: align }}>{variables}</Text>
            <TextInput value={draft} onChangeText={setDraft} multiline textAlignVertical="top" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
            {selected === "base" ? <View style={[styles.termsEditor, { borderColor: colors.border, backgroundColor: colors.background }]}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? "شروط الإقامة داخل الترويسة" : "Stay terms inside header"}</Text><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 17, marginTop: 3, textAlign: align }}>{language === "ar" ? "كل سطر يظهر كبند مستقل مكان {الشروط}." : "Each line becomes a separate item replacing {الشروط}."}</Text><TextInput value={termsDraft} onChangeText={setTermsDraft} multiline textAlignVertical="top" placeholderTextColor={colors.muted} style={[styles.termsInput, { color: colors.foreground, borderColor: colors.border, textAlign: align }]} /></View> : null}
            <View style={[styles.actionRow, { flexDirection: row }]}><Pressable onPress={restoreDefault} style={({ pressed }) => [styles.secondaryAction, { borderColor: colors.warning + "78", backgroundColor: colors.warning + "0D", opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="restart-alt" size={18} color={colors.warning} /><Text style={{ color: colors.warning, fontWeight: "900" }}>{language === "ar" ? "استعادة" : "Restore"}</Text></Pressable><Pressable onPress={() => void save()} style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.success, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="save" size={18} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{language === "ar" ? "حفظ" : "Save"}</Text></Pressable></View>
            <Pressable onPress={() => setPreviewOpen((value) => !value)} style={({ pressed }) => [styles.previewAction, { borderColor: colors.primary + "66", backgroundColor: colors.primary + "0D", opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="visibility" size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900" }}>{language === "ar" ? (previewOpen ? "إخفاء المعاينة" : "معاينة") : (previewOpen ? "Hide preview" : "Preview")}</Text></Pressable>
            {previewOpen ? <View style={[styles.preview, { backgroundColor: colors.background, borderColor: colors.primary + "4A" }]}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900", textAlign: align }}>{language === "ar" ? "معاينة ببيانات تجريبية" : "Preview with sample data"}</Text><Text selectable style={{ color: colors.foreground, fontSize: 13, lineHeight: 23, marginTop: 8, textAlign: align }}>{previewText}</Text></View> : null}
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { paddingHorizontal: 16, paddingTop: 8 }, content: { padding: 16, paddingBottom: 118 }, intro: { alignItems: "center", borderWidth: 1, borderRadius: 16, gap: 9, padding: 12 }, flex: { flex: 1, minWidth: 0 }, tabs: { gap: 7, paddingVertical: 14 }, tab: { minHeight: 39, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }, editor: { borderWidth: 1, borderRadius: 20, padding: 14 }, editorTitle: { alignItems: "flex-start", gap: 8 }, autoBadge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 }, input: { minHeight: 220, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12, marginTop: 12, fontSize: 14, lineHeight: 23 }, termsEditor: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10 }, termsInput: { minHeight: 105, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 9, marginTop: 8, fontSize: 13, lineHeight: 21 }, actionRow: { gap: 8, marginTop: 12 }, primaryAction: { flex: 1, minHeight: 47, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }, secondaryAction: { flex: 1, minHeight: 47, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }, previewAction: { minHeight: 45, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, marginTop: 8 }, preview: { borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 12 },
});
