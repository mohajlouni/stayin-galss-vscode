import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ScreenBackButton } from "@/components/screen-back-button";
import { useColors } from "@/hooks/use-colors";
import { bookingTypeLabel, dateLabel, formatMoney, paymentStatus, paymentStatusLabel, remainingAmount } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useI18n } from "@/lib/i18n";

function formatFileSize(size?: number) {
  if (!size) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupPreviewScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t, isRTL, language } = useI18n();
  const { pendingBackupImport, clearPendingBackupImport, commitPendingBackupImport, openBackupForPreview } = useBookings();
  const [isImporting, setIsImporting] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  const goBack = () => {
    clearPendingBackupImport();
    router.back();
  };

  const replaceFile = async () => {
    await openBackupForPreview();
  };

  const confirmImport = () => {
    Alert.alert(t("confirmImport"), t("importWarning"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("confirmImport"),
        style: "destructive",
        onPress: async () => {
          setIsImporting(true);
          try {
            const result = await commitPendingBackupImport();
            const rescueMessage = result.rescueBackupCreated ? (language === "ar" ? "تم حفظ نسخة إنقاذ محلية من بياناتك السابقة قبل الاستبدال." : "A local rescue copy of your previous data was saved before replacement.") : "";
            Alert.alert(t("importComplete"), `${t("importCompleteDescription")}\n\n${rescueMessage}`, [{ text: t("close"), onPress: () => router.replace("/(tabs)/bookings" as never) }]);
          } finally {
            setIsImporting(false);
          }
        },
      },
    ]);
  };

  if (!pendingBackupImport) {
    return <ScreenContainer edges={["top", "bottom", "left", "right"]}><View style={styles.empty}><MaterialIcons name="insert-drive-file" size={46} color={colors.muted} /><Text style={{ color: colors.foreground, fontWeight: "800", textAlign: "center" }}>{t("fileDetails")}</Text><Pressable onPress={goBack} style={({ pressed }) => [styles.backButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}><Text style={{ color: colors.background, fontWeight: "800" }}>{t("back")}</Text></Pressable></View></ScreenContainer>;
  }

  const fileSize = formatFileSize(pendingBackupImport.fileSize) ?? t("unknownFileSize");
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator nestedScrollEnabled bounces alwaysBounceVertical keyboardShouldPersistTaps="handled">
      <View style={[styles.header, { flexDirection: row, borderBottomColor: colors.border }]}>
        <ScreenBackButton fallbackHref="/(tabs)/more" onPress={goBack} />
        <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800", textAlign: align }}>{t("filePreview")}</Text>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.content}>
        <View style={[styles.readyBanner, { flexDirection: row }]}>
          <View style={styles.readyIcon}><MaterialIcons name="check-circle" size={24} color="#166534" /></View>
          <View style={styles.flex}><Text style={[styles.readyTitle, { textAlign: align }]}>{t("fileReady")}</Text><Text style={[styles.readyText, { textAlign: align }]}>{pendingBackupImport.bookings.length} {t("detectedBookings")}</Text></View>
        </View>

        <View style={[styles.fileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.fileHeading, { flexDirection: row }]}>
            <View style={[styles.fileIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="description" size={24} color={colors.primary} /></View>
            <View style={styles.flex}><Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", textAlign: align }}>{pendingBackupImport.fileName}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, textAlign: align }}>JSON · {t("fileSize")}: {fileSize}</Text></View>
          </View>
          <View style={[styles.metrics, { flexDirection: row }]}><PreviewMetric label={t("detectedBookings")} value={String(pendingBackupImport.bookings.length)} align={align} colors={colors} /><PreviewMetric label={t("detectedWaitlist")} value={String(pendingBackupImport.waitlist.length)} align={align} colors={colors} /></View>
          <Pressable onPress={replaceFile} style={({ pressed }) => [styles.secondaryAction, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: colors.primary, fontWeight: "800" }}>{t("replaceFile")}</Text></Pressable>
        </View>

        <View style={[styles.sectionHeader, { flexDirection: row }]}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 18, textAlign: align }}>{t("detectedBookings")}</Text><View style={[styles.countPill, { backgroundColor: colors.primary + "14" }]}><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}>{pendingBackupImport.bookings.length}</Text></View></View>
        {pendingBackupImport.bookings.length === 0 ? <View style={[styles.emptyList, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={{ color: colors.muted, textAlign: align }}>{t("noBookingsInFile")}</Text></View> : pendingBackupImport.bookings.map((booking) => <BookingPreviewCard key={booking.id} booking={booking} language={language} currency={pendingBackupImport.settings.currency} settings={pendingBackupImport.settings} align={align} row={row} colors={colors} />)}
      </View>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: align }}>{t("importWarning")}</Text><Pressable disabled={isImporting} onPress={confirmImport} style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.primary, opacity: isImporting || pressed ? 0.72 : 1 }]}>{isImporting ? <ActivityIndicator color={colors.background} /> : <Text style={{ color: colors.background, fontWeight: "800", fontSize: 16 }}>{t("confirmImport")}</Text>}</Pressable></View>
    </ScrollView>
  </ScreenContainer>;
}

function PreviewMetric({ label, value, align, colors }: { label: string; value: string; align: "left" | "right"; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.metric, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 19, textAlign: align }}>{value}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{label}</Text></View>;
}

function BookingPreviewCard({ booking, language, currency, settings, align, row, colors }: { booking: any; language: "ar" | "en"; currency: string; settings: any; align: "left" | "right"; row: "row" | "row-reverse"; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.bookingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.bookingTop, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.foreground, fontWeight: "800", textAlign: align }]}>{booking.customerName}</Text><View style={styles.typePill}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }}>{bookingTypeLabel(booking.bookingType, settings, language)}</Text></View></View><Text style={{ color: colors.muted, fontSize: 12, marginTop: 9, textAlign: align }}>{dateLabel(booking.startDate, language)} — {dateLabel(booking.endDate, language)}</Text><View style={[styles.bookingBottom, { flexDirection: row }]}><Text style={{ color: colors.primary, fontWeight: "800", textAlign: align }}>{formatMoney(remainingAmount(booking), currency)}</Text><Text style={{ color: colors.muted, fontSize: 12, textAlign: align }}>{paymentStatusLabel(paymentStatus(booking), language)}</Text></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  header: { alignItems: "center", justifyContent: "space-between", minHeight: 64, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 28 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  readyBanner: { alignItems: "center", gap: 12, backgroundColor: "#DCFCE7", borderRadius: 16, padding: 14, marginBottom: 12 },
  readyIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  readyTitle: { color: "#166534", fontWeight: "800" },
  readyText: { color: "#166534", opacity: 0.84, fontSize: 12, marginTop: 3 },
  fileCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginBottom: 22 },
  fileHeading: { alignItems: "center", gap: 12 },
  fileIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  metrics: { gap: 8, marginTop: 15 },
  metric: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 11 },
  secondaryAction: { minHeight: 46, marginTop: 14, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionHeader: { alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  countPill: { minWidth: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  emptyList: { borderWidth: 1, borderRadius: 16, padding: 18 },
  bookingCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 9 },
  bookingTop: { alignItems: "center", gap: 8 },
  typePill: { backgroundColor: "#E6F4F1", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  bookingBottom: { justifyContent: "space-between", marginTop: 10, gap: 8 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 10 },
  primaryAction: { minHeight: 54, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 24 },
  backButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
});
