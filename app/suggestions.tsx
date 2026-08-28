import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenContainer } from "@/components/screen-container";
import { ScreenBackButton } from "@/components/screen-back-button";
import { RipplePressable } from "@/components/ripple-pressable";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

const MIN_SUGGESTION_LENGTH = 10;
const MAX_SUGGESTION_LENGTH = 1200;

export default function SuggestionsScreen() {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { triggerHaptic } = useAppPreferences();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error" | null>(null);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const submit = trpc.suggestions.submit.useMutation();
  const trimmed = content.trim();

  const sendSuggestion = async () => {
    if (trimmed.length < MIN_SUGGESTION_LENGTH) {
      setMessageKind("error");
      setMessage(language === "ar" ? "اكتب اقتراحًا من 10 أحرف على الأقل." : "Write at least 10 characters.");
      return;
    }

    setMessage(null);
    setMessageKind(null);
    try {
      await submit.mutateAsync({ content: trimmed, language });
      void triggerHaptic();
      setContent("");
      setMessageKind("success");
      setMessage(language === "ar" ? "شكرًا لك. تم إرسال اقتراحك للمراجعة." : "Thank you. Your suggestion was sent for review.");
    } catch {
      setMessageKind("error");
      setMessage(language === "ar" ? "تعذر إرسال الاقتراح الآن. تحقق من الاتصال وحاول لاحقًا." : "Your suggestion could not be sent. Check your connection and try again.");
    }
  };

  const messageColor = messageKind === "success" ? colors.success : colors.error;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 122 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.header, { flexDirection: row }]}>
            <ScreenBackButton fallbackHref="/(tabs)/more" />
            <View style={styles.flex}>
              <Text style={{ color: colors.foreground, fontSize: 26, fontWeight: "800", textAlign: align }}>{language === "ar" ? "اقتراحات" : "Suggestions"}</Text>
              <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 4, textAlign: align }}>{language === "ar" ? "شاركنا فكرة تساعدنا في تطوير Hajez." : "Share an idea that can help us improve Hajez."}</Text>
            </View>
          </View>

          <View style={[styles.hero, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "35", flexDirection: row }]}>
            <View style={[styles.heroIcon, { backgroundColor: colors.primary + "1D" }]}><MaterialIcons name="lightbulb-outline" size={25} color={colors.primary} /></View>
            <View style={styles.flex}>
              <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 16, textAlign: align }}>{language === "ar" ? "صوتك يهمنا" : "Your voice matters"}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: align }}>{language === "ar" ? "تصل الفكرة لفريق المشروع ليتم تقييمها ضمن التطوير القادم." : "Your idea reaches the project team for future consideration."}</Text>
            </View>
          </View>

          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 15, textAlign: align }}>{language === "ar" ? "اكتب اقتراحك" : "Write your suggestion"}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: align }}>{language === "ar" ? "اذكر المشكلة أو الفكرة والنتيجة التي تتوقعها." : "Describe the problem or idea and the result you expect."}</Text>
            <TextInput
              value={content}
              onChangeText={(value) => { setContent(value); if (messageKind === "error") { setMessage(null); setMessageKind(null); } }}
              placeholder={language === "ar" ? "مثال: أريد عرض الحجوزات القادمة في بطاقة واحدة..." : "Example: I would like upcoming bookings in one card..."}
              placeholderTextColor={colors.muted}
              multiline
              maxLength={MAX_SUGGESTION_LENGTH}
              textAlignVertical="top"
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: align }]}
              accessibilityLabel={language === "ar" ? "نص الاقتراح" : "Suggestion text"}
            />
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 7, textAlign: align }}>{trimmed.length}/{MAX_SUGGESTION_LENGTH}</Text>
          </View>

          {message ? <View style={[styles.message, { backgroundColor: messageColor + "14", borderColor: messageColor, flexDirection: row }]}><MaterialIcons name={messageKind === "success" ? "check-circle" : "error-outline"} size={20} color={messageColor} /><Text style={[styles.flex, { color: messageColor, fontSize: 13, fontWeight: "700", lineHeight: 19, textAlign: align }]}>{message}</Text></View> : null}

          <View style={[styles.privacy, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}><MaterialIcons name="privacy-tip" size={18} color={colors.muted} /><Text style={[styles.flex, { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: align }]}>{language === "ar" ? "لا يطلب هذا النموذج الاسم أو رقم الهاتف. اكتب الفكرة فقط وتجنب تضمين معلومات حساسة." : "This form does not ask for your name or phone. Share the idea only and avoid sensitive information."}</Text></View>
        </ScrollView>

        <View style={[styles.dock, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 10) + 8 }]}>
          <RipplePressable disabled={submit.isPending} rippleColor={colors.background + "3D"} onPress={() => void sendSuggestion()} style={({ pressed }) => [styles.submit, { backgroundColor: colors.primary, opacity: submit.isPending ? 0.55 : pressed ? 0.78 : 1 }]}>
            {submit.isPending ? <ActivityIndicator color={colors.background} /> : <MaterialIcons name="send" size={19} color={colors.background} />}
            <Text style={{ color: colors.background, fontWeight: "800", fontSize: 16 }}>{submit.isPending ? (language === "ar" ? "جارٍ الإرسال..." : "Sending...") : (language === "ar" ? "إرسال الاقتراح" : "Send suggestion")}</Text>
          </RipplePressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16 },
  flex: { flex: 1, minWidth: 0 },
  header: { alignItems: "center", gap: 12, marginBottom: 20 },
  back: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  hero: { gap: 12, borderWidth: 1, borderRadius: 20, padding: 15, alignItems: "center" },
  heroIcon: { width: 47, height: 47, borderRadius: 15, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  formCard: { borderWidth: 1, borderRadius: 20, padding: 15, marginTop: 14, elevation: 1 },
  input: { minHeight: 172, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingTop: 13, marginTop: 13, fontSize: 15, lineHeight: 22 },
  message: { alignItems: "flex-start", gap: 9, borderWidth: 1, borderRadius: 15, padding: 12, marginTop: 13 },
  privacy: { alignItems: "flex-start", gap: 8, borderRadius: 15, padding: 13, marginTop: 13 },
  dock: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 11, elevation: 8, shadowColor: "#0B1F1B", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } },
  submit: { minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
});
