import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { ChaletSwitcher } from "@/components/chalet-switcher";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { getBookingTimestampRange } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useChaletScope } from "@/lib/chalet-scope";
import { useI18n } from "@/lib/i18n";
import { getTurnoverTaskCandidates, type TurnoverTaskCandidate } from "@/lib/turnover-tasks";
import { useWorkspaceAccess } from "@/lib/workspace-access";

const MINUTE = 60_000;

function shiftLabel(type: TurnoverTaskCandidate["checkoutBooking"]["bookingType"], language: "ar" | "en") {
  if (language === "ar") return type === "morning" ? "صباحي" : type === "evening" ? "مسائي" : type === "24h" ? "24 ساعة" : type === "multi-day" ? "عدة أيام" : "فترة مخصصة";
  return type === "morning" ? "Morning" : type === "evening" ? "Evening" : type === "24h" ? "24 hours" : type === "multi-day" ? "Multi-day" : "Custom";
}

function formatClock(value: number, language: "ar" | "en") {
  if (!Number.isFinite(value)) return "—";
  return new Date(value).toLocaleTimeString(language === "ar" ? "ar-JO" : "en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDayDateTime(value: number, language: "ar" | "en") {
  if (!Number.isFinite(value)) return "—";
  const date = new Date(value);
  const locale = language === "ar" ? "ar-JO" : "en-GB";
  const day = date.toLocaleDateString(locale, { weekday: "long" });
  const shortDate = date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" }).replace(/،/g, "");
  return `${day} ${shortDate} - ${formatClock(value, language)}`;
}

function formatArabicDuration(value: number) {
  const totalMinutes = Math.max(0, Math.ceil(value / MINUTE));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourLabel = hours === 1 ? "ساعة واحدة" : hours === 2 ? "ساعتان" : hours > 2 && hours < 11 ? `${hours} ساعات` : hours ? `${hours} ساعة` : "";
  const minuteLabel = minutes === 1 ? "دقيقة واحدة" : minutes === 2 ? "دقيقتان" : minutes > 2 && minutes < 11 ? `${minutes} دقائق` : minutes ? `${minutes} دقيقة` : "";
  return [hourLabel, minuteLabel].filter(Boolean).join(" و") || "أقل من دقيقة";
}

function formatEnglishDuration(value: number) {
  const totalMinutes = Math.max(0, Math.ceil(value / MINUTE));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : ""].filter(Boolean).join(" ") || "under a minute";
}

export default function TurnoverTasksScreen() {
  const { bookings, turnoverTasks, updateTurnoverTask } = useBookings();
  const { selectedChaletId } = useChaletScope();
  const { language, isRTL } = useI18n();
  const { can } = useWorkspaceAccess();
  const colors = useColors();
  const [now, setNow] = useState(() => Date.now());
  const [savingId, setSavingId] = useState<string | null>(null);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const tasks = useMemo(() => getTurnoverTaskCandidates(bookings, turnoverTasks, now, selectedChaletId), [bookings, now, selectedChaletId, turnoverTasks]);

  const saveStatus = async (task: TurnoverTaskCandidate, status: "in-progress" | "completed") => {
    setSavingId(task.id);
    try {
      const timestamp = new Date().toISOString();
      await updateTurnoverTask({
        ...task,
        status,
        startedAt: status === "in-progress" ? (task.startedAt ?? timestamp) : task.startedAt,
        completedAt: status === "completed" ? timestamp : undefined,
      });
    } catch {
      Alert.alert(language === "ar" ? "تعذر حفظ المهمة" : "Could not save task", language === "ar" ? "تحقق من صلاحية تعديل الحجوزات ثم حاول مرة أخرى." : "Check your booking-edit permission and try again.");
    } finally {
      setSavingId(null);
    }
  };
  const updateStatus = (task: TurnoverTaskCandidate, status: "in-progress" | "completed") => {
    const isComplete = status === "completed";
    Alert.alert(
      isComplete ? (language === "ar" ? "اعتماد جاهزية الوحدة" : "Approve unit readiness") : (language === "ar" ? "بدء التنظيف والفحص" : "Start cleaning & inspection"),
      isComplete
        ? (language === "ar" ? `هل تم فحص وتجهيز ${task.chaletName ?? "الوحدة"} بالكامل قبل وصول ${task.nextBooking.customerName}؟` : `Has ${task.chaletName ?? "the unit"} been inspected and prepared before ${task.nextBooking.customerName} arrives?`)
        : (language === "ar" ? `هل تريد تسجيل بدء تنظيف ${task.chaletName ?? "الوحدة"} الآن؟` : `Record the start of cleaning for ${task.chaletName ?? "the unit"}?`),
      [
        { text: language === "ar" ? "رجوع" : "Back", style: "cancel" },
        { text: isComplete ? (language === "ar" ? "اعتماد الجاهزية" : "Approve readiness") : (language === "ar" ? "بدء التنظيف" : "Start cleaning"), onPress: () => void saveStatus(task, status) },
      ],
    );
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.screen}>
        <View style={styles.headerWrap}><SubScreenHeader title={language === "ar" ? "تنظيف وفحص" : "Cleaning & inspection"} /></View>
        <View style={styles.scope}><ChaletSwitcher /></View>
        <View style={[styles.intro, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "42", flexDirection: row }]}>
          <MaterialIcons name="autorenew" size={18} color={colors.primary} />
          <Text style={{ flex: 1, color: colors.foreground, fontSize: 12, lineHeight: 18, textAlign: align }}>{language === "ar" ? "تعرض كل مهمة وقت المغادرة والوصول ونافذة التجهيز المتاحة بينهما." : "Each task shows the checkout, arrival, and exact preparation window."}</Text>
        </View>
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ListEmptyComponent={<View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="task-alt" size={28} color={colors.success} /><Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", marginTop: 9, textAlign: align }}>{language === "ar" ? "لا توجد مهام تجهيز قريبة" : "No upcoming turnover tasks"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: align }}>{language === "ar" ? "ستظهر المهمة تلقائيًا عندما تنتهي إقامة قبل الحجز التالي." : "A task appears automatically when a stay ends before the next booking."}</Text></View>}
          renderItem={({ item }) => <TurnoverTaskCard task={item} now={now} saving={savingId === item.id} canEdit={can("edit_bookings")} colors={colors} language={language} isRTL={isRTL} onUpdate={updateStatus} />}
        />
      </View>
    </ScreenContainer>
  );
}

function TurnoverTaskCard({ task, now, saving, canEdit, colors, language, isRTL, onUpdate }: { task: TurnoverTaskCandidate; now: number; saving: boolean; canEdit: boolean; colors: ReturnType<typeof useColors>; language: "ar" | "en"; isRTL: boolean; onUpdate: (task: TurnoverTaskCandidate, status: "in-progress" | "completed") => void }) {
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const checkoutAt = getBookingTimestampRange(task.checkoutBooking).end;
  const arrivalAt = getBookingTimestampRange(task.nextBooking).start;
  const windowMilliseconds = Math.max(0, arrivalAt - checkoutAt);
  const remainingMilliseconds = Math.max(0, arrivalAt - now);
  const isOverdue = task.status !== "completed" && now >= arrivalAt;
  const countdownColor = isOverdue ? colors.error : remainingMilliseconds <= 2 * 60 * 60 * 1000 ? colors.warning : colors.success;
  const status = task.status === "completed"
    ? { label: language === "ar" ? "تم التجهيز" : "Ready", color: colors.success, icon: "task-alt" as const }
    : isOverdue
      ? { label: language === "ar" ? "⚠️ متأخر" : "⚠️ Overdue", color: colors.error, icon: "error-outline" as const }
      : task.status === "in-progress"
        ? { label: language === "ar" ? "جاري التنظيف" : "Cleaning", color: colors.warning, icon: "cleaning-services" as const }
        : { label: language === "ar" ? "في انتظار التنظيف" : "Pending cleaning", color: colors.warning, icon: "pending-actions" as const };
  const actionLabel = task.status === "pending"
    ? (language === "ar" ? "بدء التنظيف والفحص" : "Start cleaning & inspection")
    : task.status === "in-progress"
      ? (language === "ar" ? "تم تجهيز الشاليه واعتماده ✓" : "Prepare and approve chalet ✓")
      : (language === "ar" ? "تم تجهيز الشاليه واعتماده ✓" : "Chalet prepared and approved ✓");
  const actionIcon = task.status === "pending" ? "cleaning-services" : "task-alt";

  return (
    <View style={[styles.task, { backgroundColor: colors.surface, borderColor: status.color + "70" }]}>
      <View style={[styles.taskHeader, { flexDirection: row }]}>
        <Text style={[styles.flex, { color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }]}>{task.chaletName ?? (language === "ar" ? "الشاليه" : "Chalet")}</Text>
        <View style={[styles.statusBadge, { flexDirection: row, backgroundColor: status.color + "16" }]}><MaterialIcons name={status.icon} size={14} color={status.color} /><Text style={{ color: status.color, fontSize: 10, fontWeight: "900" }}>{status.label}</Text></View>
      </View>

      <View style={[styles.windowPill, { flexDirection: row, backgroundColor: status.color + "11" }]}><MaterialIcons name="hourglass-top" size={16} color={status.color} /><Text style={[styles.flex, { color: status.color, fontSize: 12, fontWeight: "900", textAlign: align }]}>{language === "ar" ? `نافذة التجهيز: ${formatArabicDuration(windowMilliseconds)} (${formatClock(checkoutAt, language)} ➔ ${formatClock(arrivalAt, language)})` : `Turnaround: ${formatEnglishDuration(windowMilliseconds)} (${formatClock(checkoutAt, language)} → ${formatClock(arrivalAt, language)})`}</Text></View>
      {task.status !== "completed" ? <Text style={{ color: countdownColor, fontSize: 11, fontWeight: "900", marginTop: 7, textAlign: align }}>{isOverdue ? (language === "ar" ? "⚠️ تجاوز الوقت: موعد دخول النزيل حان" : "⚠️ Overdue: the next guest check-in is due") : (language === "ar" ? `⏳ متبقي للتسليم: ${formatArabicDuration(remainingMilliseconds)}` : `⏳ Time to handover: ${formatEnglishDuration(remainingMilliseconds)}`)}</Text> : null}
      <View style={styles.timeline}>
        <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 21, textAlign: align }}>{language === "ar" ? `🔴 مغادرة: ${task.checkoutBooking.customerName} | ${formatDayDateTime(checkoutAt, language)} (${shiftLabel(task.checkoutBooking.bookingType, language)})` : `🔴 Checkout: ${task.checkoutBooking.customerName} | ${formatDayDateTime(checkoutAt, language)} (${shiftLabel(task.checkoutBooking.bookingType, language)})`}</Text>
        <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 21, marginTop: 2, textAlign: align }}>{language === "ar" ? `🟢 وصول: ${task.nextBooking.customerName} | ${formatDayDateTime(arrivalAt, language)} (${shiftLabel(task.nextBooking.bookingType, language)})` : `🟢 Arrival: ${task.nextBooking.customerName} | ${formatDayDateTime(arrivalAt, language)} (${shiftLabel(task.nextBooking.bookingType, language)})`}</Text>
      </View>
      {task.startedAt && task.status === "in-progress" ? <Text style={{ color: colors.muted, fontSize: 10, marginTop: 6, textAlign: align }}>{language === "ar" ? `بدأ التنظيف ${formatClock(new Date(task.startedAt).getTime(), language)}` : `Started ${formatClock(new Date(task.startedAt).getTime(), language)}`}</Text> : null}
      <Pressable disabled={saving || !canEdit || task.status === "completed"} accessibilityRole="button" accessibilityState={{ disabled: saving || !canEdit || task.status === "completed" }} accessibilityLabel={actionLabel} onPress={() => onUpdate(task, task.status === "pending" ? "in-progress" : "completed")} style={({ pressed }) => [styles.action, { flexDirection: row, borderColor: status.color, backgroundColor: task.status === "completed" ? colors.success + "16" : status.color + "13", opacity: pressed || saving || !canEdit || task.status === "completed" ? 0.58 : 1 }]}><MaterialIcons name={saving ? "hourglass-top" : actionIcon} size={17} color={task.status === "completed" ? colors.success : status.color} /><Text style={{ color: task.status === "completed" ? colors.success : status.color, fontSize: 12, fontWeight: "900" }}>{saving ? (language === "ar" ? "جارٍ الحفظ" : "Saving") : actionLabel}</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: { paddingHorizontal: 16, paddingTop: 8 },
  scope: { paddingHorizontal: 16, marginTop: 4 },
  intro: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 15, padding: 11, alignItems: "center", gap: 8 },
  content: { padding: 16, paddingBottom: 120, gap: 12 },
  empty: { minHeight: 150, borderWidth: 1, borderRadius: 20, alignItems: "center", justifyContent: "center", padding: 18 },
  task: { borderWidth: 1, borderRadius: 20, padding: 14 },
  taskHeader: { alignItems: "center", gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  statusBadge: { minHeight: 30, borderRadius: 15, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, flexShrink: 0 },
  windowPill: { minHeight: 39, borderRadius: 12, paddingHorizontal: 10, alignItems: "center", flexDirection: "row", gap: 6, marginTop: 11 },
  timeline: { marginTop: 8 },
  action: { minHeight: 43, marginTop: 11, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
});
