import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { CompactScreenHeader } from "@/components/compact-screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

type LegalSection = { heading: string; body: string };
export function LegalDocument({ title, sections }: { title: string; sections: LegalSection[] }) {
  const colors = useColors(); const { isRTL } = useI18n(); const align = isRTL ? "right" : "left";
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content}><CompactScreenHeader title={title} backHref="/auth/register" icon="gavel" /><View style={[styles.notice, { backgroundColor: colors.warning + "12", borderColor: colors.warning + "55" }]}><Text style={{ color: colors.warning, textAlign: align, fontSize: 12, lineHeight: 18, fontWeight: "800" }}>مسودة تشغيلية لحماية حقوق StayIn والمستخدمين؛ راجعها محامٍ مؤهل في بلد التشغيل قبل النشر التجاري.</Text></View>{sections.map((section) => <View key={section.heading} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", textAlign: align }}>{section.heading}</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20, marginTop: 7, textAlign: align }}>{section.body}</Text></View>)}</ScrollView></ScreenContainer>;
}
const styles = StyleSheet.create({ content: { flexGrow: 1, padding: 16, paddingBottom: 40, gap: 11 }, notice: { borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 3 }, card: { borderWidth: 1, borderRadius: 18, padding: 14 } });
