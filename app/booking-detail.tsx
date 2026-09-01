import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ScreenBackButton } from "@/components/screen-back-button";
import { CheckInConfirmationSheet } from "@/components/check-in-confirmation-sheet";
import { CheckOutConfirmationSheet } from "@/components/check-out-confirmation-sheet";
import { ChaletWeatherWidget } from "@/components/chalet-weather-widget";
import { ContractAgreementModal } from "@/components/contract-agreement-modal";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { GlassModalMotion } from "@/components/glass-modal-motion";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { AuditLogEntry, bookingOccupancyStatus, bookingTypeLabel, DEFAULT_DEVICE_SETTINGS, depositFinancialStatus, durationLabel, formatMoney, getBookingDisplayOperationalState, getBookingOperationalState, localDateISO, Payment, PaymentMethod, paymentMethodLabel, refundableDepositAmount, remainingAmount, remainingRefundableDeposit, statusColors, statusLabel, toPositiveFiniteAmount, totalDepositRefunded, totalPaid, typeColors, weekdayLabel } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { shareBookingReceipt } from "@/lib/booking-receipt";
import { shareFinancialReceipt } from "@/lib/financial-receipt";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { generateSelectedBookingWhatsAppMessage, openSelectedBookingWhatsApp, WHATSAPP_SEND_ITEMS, whatsappSendItemLabel, type WhatsAppSendItem } from "@/lib/whatsapp-helper";
import { generateConsolidatedWhatsAppMessage, openConsolidatedWhatsApp, WHATSAPP_MESSAGE_MODULES, whatsAppMessageModuleLabel, type WhatsAppMessageModule } from "@/lib/whatsapp-message-engine";
import { normalizeJordanianWhatsAppPhone } from "@/lib/whatsapp";

const paymentMethodOptions: { id: PaymentMethod; icon: "payments" | "person" | "flash-on" }[] = [
  { id: "cash-owner", icon: "person" },
  { id: "cash-guardian", icon: "payments" },
  { id: "click", icon: "flash-on" },
];

const MANAGED_TEMPLATE_ITEMS = ["confirmation", "arrival", "checkout", "contract", "terms"] as const;
type ManagedTemplateItem = (typeof MANAGED_TEMPLATE_ITEMS)[number];
type BookingTimelineEntry = {
  id: string;
  action: AuditLogEntry["action"] | "booking-created" | "waitlist-promoted" | "rental-payment" | "deposit-refund";
  createdAt: string;
  actorName?: string;
  details: string;
};

function BookingActivityTimeline({ entries, expanded, onToggle, language, isRTL, colors, formatDate, formatTime, manualTrackingDisabled }: { entries: BookingTimelineEntry[]; expanded: boolean; onToggle: () => void; language: "ar" | "en"; isRTL: boolean; colors: ReturnType<typeof useColors>; formatDate: (date: string) => string; formatTime: (time: string) => string; manualTrackingDisabled: boolean }) {
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const [visibleCount, setVisibleCount] = useState(6);
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    setVisibleCount(6);
  }, [expanded, searchQuery]);
  const timestamp = (entry: Pick<BookingTimelineEntry, "createdAt">) => { const value = new Date(entry.createdAt); if (Number.isNaN(value.getTime())) return "—"; return `${formatDate(`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`)} · ${formatTime(`${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`)}`; };
  const presentationFor = (action: BookingTimelineEntry["action"]) => action === "booking-created" ? { icon: "event-available" as const, label: language === "ar" ? "تم تسجيل الحجز" : "Booking recorded" } : action === "waitlist-promoted" ? { icon: "swap-horiz" as const, label: language === "ar" ? "تم التحويل من قائمة الانتظار" : "Converted from waitlist" } : action === "rental-payment" ? { icon: "payments" as const, label: language === "ar" ? "تم تسجيل دفعة إيجار" : "Rental payment recorded" } : action === "deposit-refund" ? { icon: "security" as const, label: language === "ar" ? "تم استرداد التأمين" : "Deposit refund recorded" } : action === "booking-checked-in" ? { icon: "login" as const, label: language === "ar" ? "تم تسجيل الوصول" : "Guest arrival recorded" } : action === "booking-checked-out" ? { icon: "logout" as const, label: language === "ar" ? "تم تسجيل المغادرة" : "Guest checkout recorded" } : action === "booking-status-corrected" ? { icon: "edit-calendar" as const, label: language === "ar" ? "تصحيح يدوي للحالة" : "Manual stay correction" } : { icon: "event-busy" as const, label: language === "ar" ? "تم إلغاء أو أرشفة الحجز" : "Booking cancelled or archived" };
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const matchingEntries = useMemo(() => {
    if (!normalizedSearchQuery) return entries;
    return entries.filter((entry) => {
      const presentation = presentationFor(entry.action);
      return `${presentation.label} ${entry.details} ${entry.actorName ?? ""} ${entry.createdAt}`.toLocaleLowerCase().includes(normalizedSearchQuery);
    });
  }, [entries, language, normalizedSearchQuery]);
  const visibleEntries = matchingEntries.slice(0, visibleCount);
  const hiddenEntryCount = Math.max(0, matchingEntries.length - visibleEntries.length);
  const timelineMoreStyle = { minHeight: 36, marginTop: 8, borderWidth: 1, borderRadius: 12, alignItems: "center" as const, justifyContent: "center" as const, gap: 5, paddingHorizontal: 12 };
  const timelineSearchStyle = { minHeight: 40, marginTop: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 12 };
  return (
    <View style={[styles.timelineCard, { backgroundColor: colors.surface }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={language === "ar" ? "فتح سجل الحركات الموحد" : "Open unified activity timeline"} onPress={onToggle} style={({ pressed }) => [styles.timelineHeader, { flexDirection: row, opacity: pressed ? 0.72 : 1 }]}>
        <View style={[styles.depositIcon, { backgroundColor: colors.primary + "16" }]}><MaterialIcons name="history" size={19} color={colors.primary} /></View>
        <View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "800", textAlign: align }}>{language === "ar" ? "سجل الحركات الموحد" : "Unified activity timeline"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{entries.length ? (language === "ar" ? `${entries.length} حركات موثقة` : `${entries.length} recorded events`) : (language === "ar" ? "تظهر هنا جميع إجراءات الحجز" : "All booking actions appear here")}</Text></View>
        <MaterialIcons name={expanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={26} color={colors.muted} />
      </Pressable>
      {expanded ? <>
        <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder={language === "ar" ? "ابحث في الحركات" : "Search activity"} placeholderTextColor={colors.muted} style={[timelineSearchStyle, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align, writingDirection: isRTL ? "rtl" : "ltr" }]} />
        {manualTrackingDisabled ? <View style={{ flexDirection: row, alignItems: "flex-start", gap: 7, borderRadius: 10, padding: 9, marginTop: 10, backgroundColor: colors.primary + "10" }}><MaterialIcons name="info-outline" size={16} color={colors.primary} /><Text style={[styles.flex, { color: colors.primary, fontSize: 11, lineHeight: 17, textAlign: align }]}>{language === "ar" ? "التتبع اليدوي معطّل (يعمل بالوضع الزمني التلقائي). يمكنك تفعيله من الإعدادات ⚙️." : "Manual tracking is off; this booking follows automatic time mode. Enable it in Settings."}</Text></View> : null}
        {matchingEntries.length ? <>
          <View>{visibleEntries.map((entry) => { const presentation = presentationFor(entry.action); return <View key={entry.id} style={[styles.timelineRow, { flexDirection: row }]}><View style={styles.timelineTrack}><View style={[styles.timelineDot, { backgroundColor: colors.primary }]}><MaterialIcons name={presentation.icon} size={12} color="#FFFFFF" /></View></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800", textAlign: align }}>{presentation.label}</Text><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 3, textAlign: align }}>{entry.details}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? `بواسطة: ${entry.actorName ?? "مستخدم التطبيق"}` : `By: ${entry.actorName ?? "App user"}`}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{timestamp(entry)}</Text></View></View>; })}</View>
          {hiddenEntryCount ? <Pressable accessibilityRole="button" onPress={() => setVisibleCount((count) => Math.min(count + 6, matchingEntries.length))} style={({ pressed }) => [timelineMoreStyle, { flexDirection: row, borderColor: colors.primary + "55", backgroundColor: colors.primary + "12", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="expand-more" size={17} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? `يتبقى ${hiddenEntryCount} حركة · عرض المزيد` : `${hiddenEntryCount} more events · Show more`}</Text></Pressable> : null}
        </> : <Text style={{ color: colors.muted, fontSize: 12, marginTop: 13, textAlign: align }}>{language === "ar" ? "لا توجد حركات مطابقة للبحث." : "No activity matches this search."}</Text>}
      </> : null}
    </View>
  );
}

export default function BookingDetail() {
  const { id, updated } = useLocalSearchParams<{ id: string; updated?: string }>();
  const { bookings, waitlist, chalets, settings, auditLog, assets, addDepositRefund, addPayment, updatePayment, voidPayment, cancelBooking, markBookingCheckedIn, completeBookingStay, correctBookingStay } = useBookings();
  const { isRTL, language, t } = useI18n();
  const { can, isManager } = useWorkspaceAccess();
  const { triggerHaptic, formatDate, formatTime, deviceSettings, updateDeviceSettings } = useAppPreferences();
  const colors = useColors();
  const booking = bookings.find((item) => item.id === id);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [paymentMethodError, setPaymentMethodError] = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | undefined>();
  const [receiptSelecting, setReceiptSelecting] = useState(false);
  const [receiptPreviewUri, setReceiptPreviewUri] = useState<string | undefined>();
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<PaymentMethod | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [sharingBookingReceipt, setSharingBookingReceipt] = useState(false);
  const [sharingMovementId, setSharingMovementId] = useState<string | null>(null);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [activityTimelineExpanded, setActivityTimelineExpanded] = useState(true);
  const [checkInSheetOpen, setCheckInSheetOpen] = useState(false);
  const [checkOutSheetOpen, setCheckOutSheetOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [operationalSaving, setOperationalSaving] = useState(false);
  const [stayCorrectionOpen, setStayCorrectionOpen] = useState(false);
  const [correctionArrival, setCorrectionArrival] = useState("");
  const [correctionDeparture, setCorrectionDeparture] = useState("");
  const [correctionResolveNoShow, setCorrectionResolveNoShow] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [refundExpanded, setRefundExpanded] = useState(false);
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [paymentConfirmation, setPaymentConfirmation] = useState<{ value: number; method: PaymentMethod; kind: "partial" | "over" } | null>(null);
  const [paymentManagerOpen, setPaymentManagerOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [editPaymentNote, setEditPaymentNote] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod | null>(null);
  const [voidingPayment, setVoidingPayment] = useState<Payment | null>(null);
  const [voidPaymentReason, setVoidPaymentReason] = useState("");
  const [cancellationOpen, setCancellationOpen] = useState(false);
  const [editConfirmationOpen, setEditConfirmationOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [showUpdateToast, setShowUpdateToast] = useState(updated === "1");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentEditSaving, setPaymentEditSaving] = useState(false);
  const paymentSaveInFlight = useRef(false);
  const paymentEditInFlight = useRef(false);
  const [messageTemplateOpen, setMessageTemplateOpen] = useState(false);
  const [whatsAppComposerOpen, setWhatsAppComposerOpen] = useState(false);
  const [selectedWhatsAppModules, setSelectedWhatsAppModules] = useState<WhatsAppMessageModule[]>(() => deviceSettings.lastWhatsAppMessageModules);
  const [whatsAppPreviewOpen, setWhatsAppPreviewOpen] = useState(false);
  const [whatsAppSending, setWhatsAppSending] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [managedTemplate, setManagedTemplate] = useState<ManagedTemplateItem>("confirmation");
  const [templateDraft, setTemplateDraft] = useState("");
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  useEffect(() => {
    if (!showUpdateToast) return;
    const timer = setTimeout(() => setShowUpdateToast(false), 2_800);
    return () => clearTimeout(timer);
  }, [showUpdateToast]);
  useFocusEffect(useCallback(() => {
    setClock(Date.now());
    const interval = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []));

  if (!booking) {
    return <ScreenContainer><View style={styles.notFound}><Text style={{ color: colors.foreground, textAlign: align }}>{language === "ar" ? "الحجز غير موجود" : "Booking not found"}</Text></View></ScreenContainer>;
  }

  const type = typeColors[booking.bookingType];
  const status = statusColors[booking.status];
  const bookingChalet = chalets.find((chalet) => chalet.id === booking.chaletId);
  const whatsAppPhoneValidation = normalizeJordanianWhatsAppPhone(booking.phone);
  const availableWhatsAppModules = WHATSAPP_MESSAGE_MODULES.filter((module) => {
    if (module === "arrival" || module === "checkout") return deviceSettings.showReadyMessages;
    return deviceSettings.showStayContract;
  });
  // نافذة القوالب القديمة لم تعد تُفتح؛ تبقى معزولة مؤقتًا لحين حذفها من ملف الشاشة الضخم.
  const availableWhatsAppItems: WhatsAppSendItem[] = [];
  const selectedWhatsAppItems: WhatsAppSendItem[] = [];
  const toggleWhatsAppItem = (_item: WhatsAppSendItem) => undefined;
  const occupancy = bookingOccupancyStatus(booking);
  const depositState = depositFinancialStatus(booking);
  const depositRecorded = refundableDepositAmount(booking);
  const depositRefunded = totalDepositRefunded(booking);
  const depositHeld = remainingRefundableDeposit(booking);
  const depositCollected = Boolean(
    (booking.depositCollection && !booking.depositCollection.voidedAt && Number(booking.depositCollection.amount) > 0)
    || booking.depositPaymentRecordedAt,
  );
  const canRefundDeposit = depositRecorded > 0 && depositHeld > 0 && depositCollected;
  const rentalBalance = remainingAmount(booking);
  const rentalFullyPaid = rentalBalance <= 0;
  const manualCheckInEnabled = deviceSettings.showGuestCheckIn;
  const operationalState = getBookingDisplayOperationalState(booking, clock, manualCheckInEnabled).state;
  const manualOperationalState = getBookingOperationalState(booking, clock).state;
  const stayState = operationalState === "in-house" || operationalState === "checkout-warning" ? { label: language === "ar" ? "مقيم حاليًا" : "In-house", color: colors.success } : operationalState === "awaiting-arrival" ? { label: language === "ar" ? "في انتظار الوصول" : "Awaiting arrival", color: colors.primary } : undefined;
  const actualArrivalTime = (() => {
    const actualArrivalAt = booking.checkInConfirmation?.actualArrivalAt ?? booking.checkedInAt;
    if (!actualArrivalAt) return undefined;
    const arrival = new Date(actualArrivalAt);
    if (Number.isNaN(arrival.getTime())) return undefined;
    return formatTime(`${String(arrival.getHours()).padStart(2, "0")}:${String(arrival.getMinutes()).padStart(2, "0")}`);
  })();
  const bookingActivity = auditLog.filter((entry) => (entry.bookingId === booking.id || (!entry.bookingId && entry.subjectName === booking.customerName && (entry.action === "booking-checked-in" || entry.action === "booking-checked-out" || entry.action === "booking-status-corrected"))) && (entry.action === "booking-checked-in" || entry.action === "booking-checked-out" || entry.action === "booking-status-corrected" || entry.action === "booking-cancelled")).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const waitlistConversion = waitlist.find((entry) => entry.status === "promoted" && entry.promotedBookingId === booking.id);
  const conversionTimestampLabel = (() => {
    if (!waitlistConversion?.promotedAt) return undefined;
    const convertedAt = new Date(waitlistConversion.promotedAt);
    if (Number.isNaN(convertedAt.getTime())) return undefined;
    const localDate = `${convertedAt.getFullYear()}-${String(convertedAt.getMonth() + 1).padStart(2, "0")}-${String(convertedAt.getDate()).padStart(2, "0")}`;
    const localTime = `${String(convertedAt.getHours()).padStart(2, "0")}:${String(convertedAt.getMinutes()).padStart(2, "0")}`;
    return `${formatDate(localDate)} · ${formatTime(localTime)}`;
  })();
  const creationTimestampLabel = (() => {
    const createdAt = new Date(booking.createdAt);
    if (Number.isNaN(createdAt.getTime())) return language === "ar" ? "غير متاح" : "Unavailable";
    const localDate = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;
    const localTime = `${String(createdAt.getHours()).padStart(2, "0")}:${String(createdAt.getMinutes()).padStart(2, "0")}`;
    return `${formatDate(localDate)} · ${formatTime(localTime)}`;
  })();
  const bookingCreatorName = booking.createdByName?.trim() || (language === "ar" ? "غير مسجل" : "Not recorded");
  const grossRental = Math.max(0, Number(booking.price || 0) + Math.max(0, Number(booking.discountAmount || 0)));
  const periodDescription = booking.bookingType === "multi-day"
    ? `${bookingTypeLabel(booking.bookingType, settings, language)} · ${durationLabel(booking, settings, language)}`
    : bookingTypeLabel(booking.bookingType, settings, language);
  const depositSummary = depositState === "fully-refunded"
    ? { title: language === "ar" ? "تم استرداد التأمين" : "Deposit refunded", state: language === "ar" ? "مسترد" : "Refunded", value: formatMoney(depositRefunded, settings.currency), color: colors.success, detail: language === "ar" ? "تم استرداد التأمين بالكامل ولا يمكن إضافة دفعة أخرى." : "The deposit was fully refunded and cannot receive another refund payment." }
    : depositState === "held"
      ? { title: language === "ar" ? "التأمين بانتظار الاسترداد" : "Deposit awaiting refund", state: depositRefunded > 0 ? (language === "ar" ? "استرداد جزئي" : "Partially refunded") : depositCollected ? (language === "ar" ? "مستلم" : "Received") : (language === "ar" ? "غير مستلم" : "Not collected"), value: formatMoney(depositHeld, settings.currency), color: depositCollected ? colors.success : colors.warning, detail: language === "ar" ? `المتبقي للاسترداد: ${formatMoney(depositHeld, settings.currency)} من ${formatMoney(depositRecorded, settings.currency)}` : `Remaining to refund: ${formatMoney(depositHeld, settings.currency)} of ${formatMoney(depositRecorded, settings.currency)}` }
      : { title: language === "ar" ? "لا يوجد تأمين" : "No deposit", state: language === "ar" ? "غير مسجل" : "Not recorded", value: formatMoney(0, settings.currency), color: colors.muted, detail: language === "ar" ? "لا يمكن إضافة استرداد لهذا الحجز." : "No refund can be added for this booking." };
  const initialRentalPayment = booking.payments.find((payment) => !payment.voidedAt && /الدفعة الأولى|initial rental/i.test(payment.note ?? ""));
  const initialRentalPaymentMethodLabel = initialRentalPayment?.paymentMethod ? paymentMethodLabel(initialRentalPayment.paymentMethod, language) : undefined;
  const arrivalPaymentMethodLabel = booking.checkInConfirmation?.rentalBalancePaymentMethod ? paymentMethodLabel(booking.checkInConfirmation.rentalBalancePaymentMethod, language) : undefined;
  const depositPaymentMethodLabel = booking.depositPaymentMethod ? paymentMethodLabel(booking.depositPaymentMethod, language) : undefined;
  const financialTimeline = [
    ...booking.payments.map((payment) => ({ id: payment.id, kind: "payment" as const, date: payment.date, recordedAt: payment.recordedAt, amount: payment.amount, note: payment.note, paymentMethod: payment.paymentMethod, receiptUri: payment.receiptUri, recordedByName: payment.recordedByName })),
    ...(booking.depositRefunds ?? []).map((refund) => ({ id: refund.id, kind: "deposit-refund" as const, date: refund.date, recordedAt: refund.recordedAt, amount: refund.amount, note: refund.paymentMethod ? `${language === "ar" ? "طريقة الاسترداد: " : "Refund method: "}${paymentMethodLabel(refund.paymentMethod, language)}${refund.note ? ` · ${refund.note}` : ""}` : (refund.note ?? (language === "ar" ? "لم تُحدد طريقة الاسترداد" : "Refund method not specified")), paymentMethod: refund.paymentMethod, receiptUri: undefined })),
  ].sort((left, right) => (right.recordedAt ?? right.date).localeCompare(left.recordedAt ?? left.date));
  const bookingTimeline: BookingTimelineEntry[] = [
    ...bookingActivity,
    ...financialTimeline.map((item): BookingTimelineEntry => ({
      id: `financial-${item.id}`,
      action: item.kind === "payment" ? "rental-payment" : "deposit-refund",
      createdAt: item.recordedAt ?? item.date,
      actorName: item.kind === "payment" ? item.recordedByName ?? (language === "ar" ? "مستخدم التطبيق" : "App user") : (language === "ar" ? "مستخدم التطبيق" : "App user"),
      details: item.kind === "payment"
        ? (language === "ar" ? `دفعة إيجار بقيمة ${formatMoney(item.amount, settings.currency)}${item.paymentMethod ? ` · ${paymentMethodLabel(item.paymentMethod, language)}` : ""}${item.note ? ` · ${item.note}` : ""}` : `Rental payment of ${formatMoney(item.amount, settings.currency)}`)
        : (language === "ar" ? `استرداد تأمين بقيمة ${formatMoney(item.amount, settings.currency)}${item.note ? ` · ${item.note}` : ""}` : `Deposit refund of ${formatMoney(item.amount, settings.currency)}`),
    })),
    { id: `booking-created-${booking.id}`, action: "booking-created" as const, createdAt: booking.createdAt, actorName: bookingCreatorName, details: language === "ar" ? `تم إنشاء حجز ${booking.customerName} للوحدة ${booking.chaletName ?? "المحددة"}.` : `Booking for ${booking.customerName} was created.` },
    ...(waitlistConversion ? [{ id: `waitlist-promoted-${waitlistConversion.id}`, action: "waitlist-promoted" as const, createdAt: waitlistConversion.promotedAt ?? booking.createdAt, actorName: waitlistConversion.promotedByName ?? (language === "ar" ? "مستخدم التطبيق" : "App user"), details: language === "ar" ? "تم تحويل الطلب من قائمة الانتظار إلى حجز مؤكد." : "The request was converted from waitlist to a confirmed booking." }] : []),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const recordGuestArrival = async (confirmation: NonNullable<typeof booking.checkInConfirmation>) => { if (operationalSaving) return; setOperationalSaving(true); try { await markBookingCheckedIn(booking.id, confirmation); await triggerHaptic(); setCheckInSheetOpen(false); Alert.alert(language === "ar" ? "تم تسجيل الوصول" : "Arrival recorded", language === "ar" ? "أصبحت حالة الشاليه مقيمًا حاليًا، وتمت إضافة الحركة إلى السجل." : "The chalet is now in-house and the event was added to activity history."); } catch { Alert.alert(language === "ar" ? "تعذر تسجيل الوصول" : "Could not record arrival", language === "ar" ? "تحقق من توقيت الحجز ثم أعد المحاولة." : "Check the booking schedule and try again."); } finally { setOperationalSaving(false); } };
  const confirmGuestCheckout = () => setCheckOutSheetOpen(true);
  const recordGuestCheckout = async (confirmation: import("@/lib/booking-model").CheckoutConfirmation) => { if (operationalSaving) return; setOperationalSaving(true); try { await completeBookingStay(booking.id, confirmation); await triggerHaptic(); setCheckOutSheetOpen(false); Alert.alert(language === "ar" ? "تم تسجيل المغادرة" : "Checkout recorded", language === "ar" ? "تم اعتماد الفحص وتحديث حالة الحجز وسجل الحركات." : "Inspection, booking status, and activity history were updated."); } catch { Alert.alert(language === "ar" ? "تعذر تسجيل المغادرة" : "Could not record checkout", language === "ar" ? "راجع الفحص ومبلغ التأمين ثم أعد المحاولة." : "Review the inspection and deposit amount, then try again."); } finally { setOperationalSaving(false); } };
  const correctionInputValue = (value?: string) => { if (!value) return ""; const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) return ""; return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")} ${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`; };
  const openStayCorrection = () => { setCorrectionArrival(correctionInputValue(booking.checkedInAt)); setCorrectionDeparture(correctionInputValue(booking.checkedOutAt)); setCorrectionResolveNoShow(Boolean(booking.noShowAt)); setCorrectionNote(""); setStayCorrectionOpen(true); };
  const correctionToIso = (value: string) => { const trimmed = value.trim(); if (!trimmed) return undefined; const parsed = new Date(trimmed.replace(" ", "T")); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); };
  const saveStayCorrection = async () => { const checkedInAt = correctionToIso(correctionArrival); const checkedOutAt = correctionToIso(correctionDeparture); if (checkedInAt === null || checkedOutAt === null) return Alert.alert(language === "ar" ? "تنسيق وقت غير صحيح" : "Invalid time format", language === "ar" ? "استخدم الصيغة: 2026-08-26 10:15" : "Use the format: 2026-08-26 10:15"); setOperationalSaving(true); try { await correctBookingStay(booking.id, { checkedInAt: checkedInAt ?? undefined, checkedOutAt: checkedOutAt ?? undefined, restoreNoShow: correctionResolveNoShow, note: correctionNote }); await triggerHaptic(); setStayCorrectionOpen(false); Alert.alert(language === "ar" ? "تم حفظ التصحيح" : "Correction saved", language === "ar" ? "تم تحديث الحالة وإضافة التصحيح باسمك إلى سجل الحركات." : "The status was updated and the correction was added to activity history under your name."); } catch { Alert.alert(language === "ar" ? "تعذر حفظ التصحيح" : "Could not save correction", language === "ar" ? "تحقق من ترتيب وقت الوصول والمغادرة وصلاحية الحساب." : "Check time order and account permissions."); } finally { setOperationalSaving(false); } };

  const recordPayment = async (value: number, method: PaymentMethod) => {
    if (paymentSaveInFlight.current) return;
    paymentSaveInFlight.current = true;
    setPaymentSaving(true);
    try {
      await triggerHaptic();
      await addPayment(booking.id, { id: `p-${Date.now()}`, amount: value, date: localDateISO(), recordedAt: new Date().toISOString(), note: note.trim() || undefined, paymentMethod: method, receiptUri });
      setAmount("");
      setNote("");
      setPaymentMethod(null);
      setReceiptUri(undefined);
      setPaymentSheetOpen(false);
      Alert.alert(language === "ar" ? "تمت الإضافة" : "Added", language === "ar" ? "تم تسجيل الدفعة." : "Payment recorded.");
    } finally {
      paymentSaveInFlight.current = false;
      setPaymentSaving(false);
    }
  };

  const startPaymentEdit = (payment: Payment) => {
    setEditingPayment(payment);
    setEditPaymentAmount(String(payment.amount));
    setEditPaymentNote(payment.note ?? "");
    setEditPaymentMethod(payment.paymentMethod ?? null);
  };

  const savePaymentEdit = async () => {
    if (!editingPayment || paymentEditInFlight.current) return;
    const value = Number(editPaymentAmount);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert(language === "ar" ? "مبلغ غير صالح" : "Invalid amount", language === "ar" ? "يرجى إدخال مبلغ صحيح للدفعة" : "Enter a valid payment amount.");
      return;
    }
    if (!editPaymentMethod) {
      Alert.alert(language === "ar" ? "اختر طريقة الدفع" : "Choose a payment method", language === "ar" ? "يرجى اختيار طريقة الدفع للمتابعة" : "Please choose a payment method to continue.");
      return;
    }
    paymentEditInFlight.current = true;
    setPaymentEditSaving(true);
    try {
      await updatePayment(booking.id, editingPayment.id, { amount: value, note: editPaymentNote, paymentMethod: editPaymentMethod });
      setEditingPayment(null);
      Alert.alert(language === "ar" ? "تم تعديل الدفعة" : "Payment updated", language === "ar" ? "تم تحديث الدفعة وإعادة حساب الملخص المالي." : "The payment and financial summary were updated.");
    } finally {
      paymentEditInFlight.current = false;
      setPaymentEditSaving(false);
    }
  };

  const confirmPaymentVoid = async () => {
    if (!voidingPayment) return;
    await voidPayment(booking.id, voidingPayment.id, voidPaymentReason);
    setVoidingPayment(null);
    setVoidPaymentReason("");
    Alert.alert(language === "ar" ? "تم إلغاء الدفعة" : "Payment voided", language === "ar" ? "أُلغي أثر الدفعة من الملخص المالي مع الاحتفاظ بها في السجل." : "The payment was removed from financial totals and kept in the history.");
  };

  const pay = async () => {
    if (rentalFullyPaid) {
      Alert.alert(language === "ar" ? "مدفوع بالكامل" : "Paid in full", language === "ar" ? "لا يوجد رصيد إيجار متبقٍ لإضافة دفعة جديدة." : "There is no remaining rental balance for another payment.");
      setPaymentSheetOpen(false);
      return;
    }
    const selectedPaymentMethod = paymentMethod;
    if (!selectedPaymentMethod) {
      setPaymentMethodError(true);
      Alert.alert(language === "ar" ? "اختر طريقة الدفع" : "Choose a payment method", language === "ar" ? "يرجى اختيار طريقة الدفع للمتابعة" : "Please choose a payment method to continue.");
      return;
    }
    const value = toPositiveFiniteAmount(amount);
    if (!value) {
      Alert.alert(language === "ar" ? "مبلغ غير صالح" : "Invalid payment amount", language === "ar" ? "يرجى إدخال مبلغ صحيح للدفعة" : "Please enter a valid payment amount.");
      return;
    }
    if (value < rentalBalance - 0.005) {
      setPaymentConfirmation({ value, method: selectedPaymentMethod, kind: "partial" });
      return;
    }
    if (value > rentalBalance + 0.005) {
      setPaymentConfirmation({ value, method: selectedPaymentMethod, kind: "over" });
      return;
    }
    await recordPayment(value, selectedPaymentMethod);
  };

  const openPaymentSheet = () => {
    setAmount(rentalBalance.toFixed(2));
    setPaymentMethod(null);
    setPaymentMethodError(false);
    setPaymentSheetOpen(true);
  };

  const chooseReceipt = async () => {
    try {
      setReceiptSelecting(true);
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.8 });
      if (!result.canceled && result.assets[0]?.uri) setReceiptUri(result.assets[0].uri);
    } catch {
      Alert.alert(language === "ar" ? "تعذر اختيار الوصل" : "Could not select receipt", language === "ar" ? "حاول مرة أخرى أو تحقق من أذونات الصور." : "Try again or check photo access permissions.");
    } finally {
      setReceiptSelecting(false);
    }
  };

  const refundDeposit = async () => {
    const value = Number(refundAmount);
    const available = remainingRefundableDeposit(booking);
    if (!canRefundDeposit) {
      Alert.alert(language === "ar" ? "استرداد غير متاح" : "Refund unavailable", language === "ar" ? (depositRecorded <= 0 ? "لا يوجد تأمين مسجل لهذا الحجز." : depositHeld <= 0 ? "تم استرداد التأمين بالكامل ولا يمكن إضافة دفعة أخرى." : "لم يُستلم التأمين من الضيف فعليًا، لذا لا يمكن استرداده.") : (depositRecorded <= 0 ? "No deposit is recorded for this booking." : depositHeld <= 0 ? "The deposit was fully refunded and cannot receive another refund payment." : "The deposit was never actually collected, so it cannot be refunded."));
      return;
    }
    if (!refundPaymentMethod) {
      Alert.alert(language === "ar" ? "اختر طريقة الدفع" : "Choose a payment method", language === "ar" ? "يجب اختيار طريقة استرداد التأمين قبل التسجيل." : "Select a deposit-refund method before recording.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0 || value > available) {
      Alert.alert(language === "ar" ? "مبلغ استرداد غير صالح" : "Invalid refund amount", language === "ar" ? `أدخل مبلغًا لا يتجاوز ${formatMoney(available, settings.currency)}.` : `Enter an amount no greater than ${formatMoney(available, settings.currency)}.`);
      return;
    }
    try {
      await addDepositRefund(booking.id, { id: `dr-${Date.now()}`, amount: value, date: localDateISO(), recordedAt: new Date().toISOString(), note: refundNote.trim() || undefined, paymentMethod: refundPaymentMethod });
      await triggerHaptic();
      setRefundAmount("");
      setRefundNote("");
      setRefundPaymentMethod(null);
      setRefundExpanded(false);
      Alert.alert(language === "ar" ? "تم تسجيل الاسترداد" : "Refund recorded", language === "ar" ? "تم تحديث سجل التأمين المسترد للعميل." : "The deposit-refund record was updated.");
    } catch {
      Alert.alert(language === "ar" ? "تعذر تسجيل الاسترداد" : "Could not record refund", language === "ar" ? "تحقق من المبلغ ثم حاول مرة أخرى." : "Check the amount and try again.");
    }
  };

  const shareDetails = async () => {
    const checkInLabel = `${weekdayLabel(booking.startDate, language)}، ${formatDate(booking.startDate)} · ${formatTime(booking.startTime)}`;
    const checkOutLabel = `${weekdayLabel(booking.endDate, language)}، ${formatDate(booking.endDate)} · ${formatTime(booking.endTime)}`;
    const periodLabel = `${periodDescription} · ${formatTime(booking.startTime)} — ${formatTime(booking.endTime)}`;
    const message = `${language === "ar" ? "إيصال حجز" : "Booking receipt"}\n${language === "ar" ? "العميل" : "Guest"}: ${booking.customerName}\n${language === "ar" ? "الشاليه" : "Chalet"}: ${booking.chaletName ?? "—"}\n${language === "ar" ? "المرجع" : "Reference"}: ${booking.bookingReference ?? "—"}\n${language === "ar" ? "الوصول" : "Check-in"}: ${checkInLabel}\n${language === "ar" ? "المغادرة" : "Check-out"}: ${checkOutLabel}\n${language === "ar" ? "نوع الفترة" : "Period type"}: ${periodDescription}\n${language === "ar" ? "الإيجار بعد الخصم" : "Rental after discount"}: ${formatMoney(booking.price, settings.currency)}\n${t("paid")}: ${formatMoney(totalPaid(booking), settings.currency)}${initialRentalPaymentMethodLabel ? `\n${language === "ar" ? "طريقة الدفعة الأولى" : "Initial payment method"}: ${initialRentalPaymentMethodLabel}` : ""}${arrivalPaymentMethodLabel ? `\n${language === "ar" ? "طريقة دفعة الوصول" : "Arrival payment method"}: ${arrivalPaymentMethodLabel}` : ""}\n${language === "ar" ? "المتبقي من الإيجار" : "Rental balance"}: ${formatMoney(remainingAmount(booking), settings.currency)}\n${language === "ar" ? "التأمين المسجل" : "Deposit held"}: ${formatMoney(refundableDepositAmount(booking), settings.currency)}${depositPaymentMethodLabel ? `\n${language === "ar" ? "طريقة استلام التأمين" : "Deposit collection method"}: ${depositPaymentMethodLabel}` : ""}\n${language === "ar" ? "مسترد التأمين" : "Deposit refunded"}: ${formatMoney(totalDepositRefunded(booking), settings.currency)}\n${language === "ar" ? "تأمين قيد الحيازة" : "Deposit still held"}: ${formatMoney(remainingRefundableDeposit(booking), settings.currency)}`;
    try {
      setSharingBookingReceipt(true);
      const sharedAsPdf = await shareBookingReceipt({ businessName: settings.businessName, businessLogoUrl: settings.businessLogoUrl, guestName: booking.customerName, phone: booking.phone, chaletName: booking.chaletName ?? (language === "ar" ? "الشاليه غير محدد" : "Chalet not specified"), bookingReference: booking.bookingReference, bookingType: periodDescription, checkInLabel, checkOutLabel, periodLabel, rentalTotal: formatMoney(grossRental, settings.currency), paidAmount: formatMoney(totalPaid(booking), settings.currency), rentalBalance: formatMoney(rentalBalance, settings.currency), initialPaymentMethod: initialRentalPaymentMethodLabel, arrivalPaymentMethod: arrivalPaymentMethodLabel, depositRecorded: formatMoney(depositRecorded, settings.currency), depositPaymentMethod: depositPaymentMethodLabel, depositRefunded: formatMoney(depositRefunded, settings.currency), depositHeld: formatMoney(depositHeld, settings.currency) });
      if (!sharedAsPdf) await Share.share({ title: language === "ar" ? "إيصال الحجز" : "Booking receipt", message });
    } catch {
      Alert.alert(language === "ar" ? "تعذرت المشاركة" : "Sharing failed", language === "ar" ? "تعذر فتح مشاركة الإيصال. يمكنك المحاولة من التطبيق المثبت أو مشاركة النص من جديد." : "The receipt could not be shared. Try from the installed app or share the text again.");
    } finally {
      setSharingBookingReceipt(false);
    }
  };
  const callGuest = async () => {
    const phone = booking.phone.replace(/[^\d+]/g, "");
    if (phone.replace(/\D/g, "").length < 7) {
      Alert.alert(language === "ar" ? "رقم غير صالح" : "Invalid phone", language === "ar" ? "لا يوجد رقم صالح للاتصال بالعميل." : "There is no valid customer phone number to call.");
      return;
    }
    try { await Linking.openURL(`tel:${phone}`); } catch { Alert.alert(language === "ar" ? "تعذر إجراء الاتصال" : "Call unavailable", language === "ar" ? "تعذر فتح تطبيق الاتصال على هذا الجهاز." : "The calling application could not be opened on this device."); }
  };
  const openWhatsAppComposer = () => {
    const selected = deviceSettings.lastWhatsAppMessageModules.filter((module): module is WhatsAppMessageModule => availableWhatsAppModules.includes(module as WhatsAppMessageModule));
    setSelectedWhatsAppModules(selected);
    setWhatsAppPreviewOpen(false);
    setWhatsAppComposerOpen(true);
  };
  const templateValue = (item: ManagedTemplateItem) => item === "confirmation" ? deviceSettings.readyMessageTemplate : item === "arrival" ? deviceSettings.arrivalMessageTemplate : item === "checkout" ? deviceSettings.checkoutMessageTemplate : item === "contract" ? deviceSettings.contractSummaryTemplate : deviceSettings.stayContractTerms;
  const defaultTemplateValue = (item: ManagedTemplateItem) => item === "confirmation" ? DEFAULT_DEVICE_SETTINGS.readyMessageTemplate : item === "arrival" ? DEFAULT_DEVICE_SETTINGS.arrivalMessageTemplate : item === "checkout" ? DEFAULT_DEVICE_SETTINGS.checkoutMessageTemplate : item === "contract" ? DEFAULT_DEVICE_SETTINGS.contractSummaryTemplate : DEFAULT_DEVICE_SETTINGS.stayContractTerms;
  const selectManagedTemplate = (item: ManagedTemplateItem) => {
    setManagedTemplate(item);
    setTemplateDraft(templateValue(item));
    setTemplatePreviewOpen(false);
  };
  const managedTemplatePreview = () => generateSelectedBookingWhatsAppMessage({
    selectedItems: [managedTemplate],
    booking,
    settings,
    language,
    chalet: bookingChalet,
    customConfirmationTemplate: managedTemplate === "confirmation" ? templateDraft : deviceSettings.readyMessageTemplate,
    customArrivalTemplate: managedTemplate === "arrival" ? templateDraft : deviceSettings.arrivalMessageTemplate,
    customCheckoutTemplate: managedTemplate === "checkout" ? templateDraft : deviceSettings.checkoutMessageTemplate,
    customContractSummaryTemplate: managedTemplate === "contract" ? templateDraft : deviceSettings.contractSummaryTemplate,
    customContractTerms: managedTemplate === "terms" ? templateDraft : deviceSettings.stayContractTerms,
  });
  const saveManagedTemplate = async () => {
    const value = templateDraft.trim();
    if (!value) {
      Alert.alert(language === "ar" ? "نص القالب مطلوب" : "Template text required", language === "ar" ? "اكتب نصًا للقالب قبل الحفظ." : "Write template text before saving.");
      return;
    }
    const patch = managedTemplate === "confirmation" ? { readyMessageTemplate: value } : managedTemplate === "arrival" ? { arrivalMessageTemplate: value } : managedTemplate === "checkout" ? { checkoutMessageTemplate: value } : managedTemplate === "contract" ? { contractSummaryTemplate: value } : { stayContractTerms: value };
    await updateDeviceSettings(patch);
    await triggerHaptic();
    setTemplatePreviewOpen(false);
    Alert.alert(language === "ar" ? "تم حفظ القالب" : "Template saved", language === "ar" ? "سيستخدم واتساب النص الجديد عند الإرسال التالي." : "WhatsApp will use the new text on the next send.");
  };
  const restoreManagedTemplateDefault = () => {
    Alert.alert(
      language === "ar" ? "استعادة النص الافتراضي" : "Restore default text",
      language === "ar" ? "سيُستبدل النص الحالي في المحرر بالنص الافتراضي لهذا القالب. اضغط «حفظ القالب» لتطبيقه." : "The editor will be replaced with this template's default text. Select Save template to apply it.",
      [
        { text: language === "ar" ? "إلغاء" : "Cancel", style: "cancel" },
        { text: language === "ar" ? "استعادة" : "Restore", style: "destructive", onPress: () => { setTemplateDraft(defaultTemplateValue(managedTemplate)); setTemplatePreviewOpen(false); } },
      ],
    );
  };
  const toggleWhatsAppModule = (module: WhatsAppMessageModule) => setSelectedWhatsAppModules((current) => current.includes(module) ? current.filter((value) => value !== module) : [...current, module]);
  const consolidatedWhatsAppPreview = () => generateConsolidatedWhatsAppMessage({ selectedModules: selectedWhatsAppModules, booking, settings, language, chalet: bookingChalet, baseHeaderTemplate: deviceSettings.whatsAppBaseHeaderTemplate, arrivalBlockTemplate: deviceSettings.arrivalMessageBlockTemplate, checkoutBlockTemplate: deviceSettings.checkoutMessageBlockTemplate, contractBlockTemplate: deviceSettings.contractMessageBlockTemplate, stayTerms: deviceSettings.stayContractTerms });
  const sendSelectedWhatsApp = async () => {
    const selected = selectedWhatsAppModules.filter((module) => availableWhatsAppModules.includes(module));
    try {
      setWhatsAppSending(true);
      await triggerHaptic();
      await openConsolidatedWhatsApp({ selectedModules: selected, booking, settings, language, chalet: bookingChalet, baseHeaderTemplate: deviceSettings.whatsAppBaseHeaderTemplate, arrivalBlockTemplate: deviceSettings.arrivalMessageBlockTemplate, checkoutBlockTemplate: deviceSettings.checkoutMessageBlockTemplate, contractBlockTemplate: deviceSettings.contractMessageBlockTemplate, stayTerms: deviceSettings.stayContractTerms });
      await updateDeviceSettings({ lastWhatsAppMessageModules: selected });
      setWhatsAppPreviewOpen(false);
      setWhatsAppComposerOpen(false);
    } catch (error) {
      const disabled = error instanceof Error && error.message === "whatsapp-disabled";
      const invalidPhone = error instanceof Error && error.message === "invalid-whatsapp-phone";
      Alert.alert(language === "ar" ? "تعذر فتح واتساب" : "WhatsApp unavailable", disabled ? (language === "ar" ? "فعّل واتساب من الإعدادات أولًا." : "Enable WhatsApp in settings first.") : invalidPhone ? (language === "ar" ? "يرجى إدخال رقم هاتف أردني صحيح مكون من 10 أرقام (079/078/077)" : "Enter a valid 10-digit Jordanian mobile number (077/078/079).") : (language === "ar" ? "تعذر فتح واتساب. تحقق من تثبيت التطبيق أو أعد المحاولة." : "WhatsApp could not be opened. Check that it is installed and try again."));
    } finally {
      setWhatsAppSending(false);
    }
  };
  const movementTime = (recordedAt: string | undefined) => {
    if (!recordedAt || Number.isNaN(new Date(recordedAt).getTime())) return undefined;
    const value = new Date(recordedAt);
    return formatTime(`${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`);
  };
  const movementPaymentMethodLabel = (value: PaymentMethod | undefined) => value ? `${language === "ar" ? "طريقة الدفع: " : "Payment method: "}${paymentMethodLabel(value, language)}` : (language === "ar" ? "لم تُحدد طريقة الدفع" : "Payment method not specified");
  const shareMovementReceipt = async (item: typeof financialTimeline[number]) => {
    try {
      setSharingMovementId(item.id);
      const isPayment = item.kind === "payment";
      const shared = await shareFinancialReceipt({ businessName: settings.businessName, guestName: booking.customerName, chaletName: booking.chaletName, bookingReference: booking.bookingReference, movementTitle: isPayment ? (language === "ar" ? "دفعة إيجار" : "Rental payment") : (language === "ar" ? "استرداد تأمين" : "Deposit refund"), amountLabel: `${isPayment ? "+" : "−"}${formatMoney(item.amount, settings.currency)}`, dateLabel: formatDate(item.date), timeLabel: movementTime(item.recordedAt), paymentMethodLabel: movementPaymentMethodLabel(item.paymentMethod), note: item.note });
      if (!shared) Alert.alert(language === "ar" ? "المشاركة غير متاحة" : "Sharing unavailable", language === "ar" ? "مشاركة ملفات PDF متاحة من التطبيق المثبت على الجهاز." : "PDF file sharing is available from the installed mobile app.");
    } catch {
      Alert.alert(language === "ar" ? "تعذر إنشاء الإيصال" : "Could not create receipt", language === "ar" ? "حاول مرة أخرى أو تحقق من مساحة الجهاز." : "Try again or check available device storage.");
    } finally { setSharingMovementId(null); }
  };
  const cancellationMessage = occupancy === "in-house"
    ? (language === "ar" ? "هذه الفترة مشغولة الآن والضيف ضمن وقت الإقامة. هل أنت متأكد من إلغاء الحجز؟" : "This period is occupied now and the guest is currently in-house. Are you sure you want to cancel?")
    : occupancy === "upcoming"
      ? (language === "ar" ? "لم تبدأ هذه الفترة بعد، وستصبح متاحة للحجز بعد الإلغاء. هل تؤكد إلغاء الحجز؟" : "This stay has not started yet and the period will become available after cancellation. Confirm cancellation?")
      : (language === "ar" ? "انتهت فترة الإقامة. سيبقى الحجز محفوظًا في السجل بحالة ملغى. هل تؤكد الإلغاء؟" : "The stay has ended. The booking will remain in history as cancelled. Confirm cancellation?");
  const confirmCancellation = () => setCancellationOpen(true);
  const submitCancellation = async () => {
    try {
      await cancelBooking(booking.id, cancellationReason);
      await triggerHaptic();
      setCancellationOpen(false);
      setCancellationReason("");
      Alert.alert(language === "ar" ? "تم الإلغاء" : "Cancelled", language === "ar" ? "تم إلغاء الحجز بنجاح." : "The booking was cancelled.");
      router.back();
    } catch {
      Alert.alert(language === "ar" ? "تعذر الإلغاء" : "Cancellation failed", language === "ar" ? "تعذر حفظ التغيير. حاول مرة أخرى." : "The change could not be saved. Please try again.");
    }
  };
  const confirmEdit = () => setEditConfirmationOpen(true);
  const openEditor = () => {
    setEditConfirmationOpen(false);
    setTimeout(() => router.push({ pathname: "/booking-form", params: { id: booking.id } } as never), 160);
  };

  return (
    <ScreenContainer>
      <View style={styles.detailScreen}>
      <TemplateManager
        visible={templateManagerOpen}
        language={language}
        isRTL={isRTL}
        colors={colors}
        selected={managedTemplate}
        draft={templateDraft}
        previewOpen={templatePreviewOpen}
        previewMessage={templatePreviewOpen ? managedTemplatePreview() : ""}
        onClose={() => { setTemplatePreviewOpen(false); setTemplateManagerOpen(false); }}
        onSelect={selectManagedTemplate}
        onDraftChange={setTemplateDraft}
        onPreview={() => setTemplatePreviewOpen((value) => !value)}
        onSave={() => void saveManagedTemplate()}
        onRestoreDefault={restoreManagedTemplateDefault}
      />
      <WhatsAppComposer
        visible={whatsAppComposerOpen}
        sending={whatsAppSending}
        language={language}
        isRTL={isRTL}
        colors={colors}
        modules={availableWhatsAppModules}
        selectedModules={selectedWhatsAppModules}
        previewOpen={whatsAppPreviewOpen}
        previewMessage={consolidatedWhatsAppPreview()}
        phoneWarning={whatsAppPhoneValidation.error}
        onClose={() => setWhatsAppComposerOpen(false)}
        onToggleModule={toggleWhatsAppModule}
        onPreview={() => setWhatsAppPreviewOpen(true)}
        onClosePreview={() => setWhatsAppPreviewOpen(false)}
        onSend={() => void sendSelectedWhatsApp()}
        onManageTemplates={() => { setWhatsAppComposerOpen(false); setWhatsAppPreviewOpen(false); router.push("/whatsapp-templates" as never); }}
      />
      <CheckInConfirmationSheet booking={booking} visible={checkInSheetOpen} saving={operationalSaving} colors={colors} currency={settings.currency} language={language} isRTL={isRTL} formatDate={formatDate} formatTime={formatTime} onClose={() => setCheckInSheetOpen(false)} onConfirm={(confirmation) => void recordGuestArrival(confirmation)} />
      <CheckOutConfirmationSheet booking={booking} visible={checkOutSheetOpen} saving={operationalSaving} colors={colors} currency={settings.currency} language={language} isRTL={isRTL} assets={assets} onClose={() => setCheckOutSheetOpen(false)} onConfirm={(confirmation) => void recordGuestCheckout(confirmation)} />
      <ContractAgreementModal booking={booking} settings={settings} language={language} isRTL={isRTL} colors={colors} visible={contractOpen} saving={false} onClose={() => setContractOpen(false)} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} removeClippedSubviews={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.titleRow, { flexDirection: row }]}>
          <ScreenBackButton fallbackHref="/(tabs)/bookings" />
          <Text numberOfLines={1} style={[styles.flex, { color: colors.foreground, fontSize: 25, fontWeight: "800", textAlign: align }]}>{t("bookingDetails")}</Text>
        </View>

        <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.heroTop, { flexDirection: row }]}> 
            <View style={[styles.typeMark, { backgroundColor: type.text }]} />
            <View style={styles.flex}>
                <View style={[styles.identityNameRow, { flexDirection: row }]}> 
                  <Text numberOfLines={1} style={[styles.identityName, { color: colors.foreground, textAlign: align }]}>{booking.customerName}</Text>
                  <View style={[styles.status, { backgroundColor: status.background }]}><Text style={{ color: status.text, fontWeight: "800", fontSize: 11 }}>{statusLabel(booking.status, language)}</Text></View>
                  {stayState ? <View style={[styles.status, { backgroundColor: stayState.color + "18" }]}><Text style={{ color: stayState.color, fontWeight: "900", fontSize: 10 }}>{stayState.label}</Text></View> : null}
                </View>
              <Text numberOfLines={1} style={[styles.identityPhone, { color: colors.muted, textAlign: align }]}>{booking.phone || "—"}</Text>
              <View style={{ flexDirection: row, flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 7 }}>
                <View style={{ minHeight: 25, borderRadius: 13, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: manualCheckInEnabled ? colors.primary + "12" : colors.muted + "12" }}><MaterialIcons name={manualCheckInEnabled ? "touch-app" : "schedule"} size={13} color={manualCheckInEnabled ? colors.primary : colors.muted} /><Text numberOfLines={1} style={{ color: manualCheckInEnabled ? colors.primary : colors.muted, fontSize: 10, fontWeight: "900" }}>{manualCheckInEnabled ? (language === "ar" ? "وصول يدوي" : "Manual arrival") : (language === "ar" ? "وصول تلقائي" : "Automatic arrival")}</Text></View>
                {actualArrivalTime ? <View style={{ minHeight: 25, borderRadius: 13, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.success + "10" }}><MaterialIcons name="login" size={13} color={colors.success} /><Text numberOfLines={1} style={{ color: colors.success, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? `وصل ${actualArrivalTime}` : `Arrived ${actualArrivalTime}`}</Text></View> : null}
              </View>
            </View>
          </View>

          <View style={[styles.schedule, { backgroundColor: colors.surfaceMuted }]}> 
            <View style={[styles.periodIdentityGrid, { flexDirection: "row" }]}> 
              <View style={[styles.periodIdentityItem, styles.periodReferenceItem, { backgroundColor: colors.surface }]}><MaterialIcons name="tag" size={13} color={colors.muted} /><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, fontWeight: "800", writingDirection: "ltr" }}>{booking.bookingReference ?? "—"}</Text></View>
              <View style={[styles.periodIdentityItem, styles.periodTypeItem, { backgroundColor: type.text + "14" }]}><MaterialIcons name="schedule" size={15} color={type.text} /><Text numberOfLines={1} style={{ color: type.text, fontSize: 11, fontWeight: "800" }}>{periodDescription}</Text></View>
              <View style={[styles.periodIdentityItem, styles.periodChaletItem, { backgroundColor: bookingChalet?.color ?? colors.primary }]}><Text numberOfLines={1} style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "800" }}>{booking.chaletName || (language === "ar" ? "شاليه" : "Chalet")}</Text></View>
            </View>
            <DataRow label={t("startDate")} value={`${weekdayLabel(booking.startDate, language)}، ${formatDate(booking.startDate)} · ${formatTime(booking.startTime)}`} align={align} colors={colors} />
            <DataRow label={t("endDate")} value={`${weekdayLabel(booking.endDate, language)}، ${formatDate(booking.endDate)} · ${formatTime(booking.endTime)}`} align={align} colors={colors} />
          </View>
          <View style={[styles.financialCard, { backgroundColor: colors.surfaceMuted }]}>
            <View style={[styles.financialCardHeader, { flexDirection: "row" }]}><Text style={{ color: colors.muted, fontSize: 11, textAlign: align }}>{language === "ar" ? "إيجار فقط" : "Rental only"}</Text><Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800", textAlign: align }}>{language === "ar" ? "ملخص الإيجار" : "Rental summary"}</Text></View>
            <View style={[styles.rentalGrid, { flexDirection: row }]}> 
              <Financial value={formatMoney(grossRental, settings.currency)} label={language === "ar" ? "إجمالي الإيجار" : "Gross rental"} colors={colors} align={align} />
              <Financial value={formatMoney(totalPaid(booking), settings.currency)} label={t("paid")} colors={colors} align={align} accentColor={colors.success} />
              <Financial value={rentalFullyPaid ? (language === "ar" ? "مدفوع بالكامل" : "Paid in full") : formatMoney(rentalBalance, settings.currency)} label={language === "ar" ? "المتبقي" : "Remaining"} colors={colors} align={align} accentColor={rentalFullyPaid ? colors.success : colors.warning} />
            </View>
            {grossRental !== booking.price ? <Text style={[styles.netRentalNote, { color: colors.muted, textAlign: align }]}>{language === "ar" ? `صافي الإيجار بعد الخصم: ${formatMoney(booking.price, settings.currency)}` : `Net rental after discount: ${formatMoney(booking.price, settings.currency)}`}</Text> : null}
          </View>

          {booking.notes ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 14, textAlign: align }}>{t("notes")}: {booking.notes}</Text> : null}
        </View>
        <ChaletWeatherWidget chaletId={booking.chaletId} compact />

        <View style={[styles.depositCard, { backgroundColor: depositRecorded > 0 ? colors.success + "0B" : colors.surfaceMuted, borderColor: depositRecorded > 0 ? colors.success + "70" : colors.border }]}> 
          <Pressable disabled={depositRecorded <= 0 || depositState === "fully-refunded"} accessibilityRole="button" accessibilityLabel={language === "ar" ? "فتح تفاصيل التأمين" : "Open deposit details"} onPress={() => setRefundExpanded((value) => !value)} style={({ pressed }) => [styles.depositHeader, { flexDirection: "row", opacity: pressed ? 0.72 : 1 }]}>
            <Text style={{ color: depositRecorded > 0 ? colors.success : colors.muted, fontSize: 14, fontWeight: "800", writingDirection: "ltr" }}>{depositSummary.value}</Text>
            {depositRecorded > 0 && depositState !== "fully-refunded" ? <MaterialIcons name={refundExpanded ? "expand-less" : "expand-more"} size={22} color={colors.muted} /> : null}
            <View style={styles.flex}><View style={[styles.financialCardHeader, { flexDirection: "row" }]}><View style={[styles.depositState, { backgroundColor: colors.success + "16", borderColor: colors.success + "55" }]}><Text style={{ color: colors.success, fontSize: 10, fontWeight: "800" }}>{depositSummary.state}</Text></View><Text style={{ color: depositRecorded > 0 ? colors.success : colors.foreground, fontWeight: "800", textAlign: align }}>{depositSummary.title}</Text></View>{depositState !== "fully-refunded" ? <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: align }}>{depositSummary.detail}</Text> : null}</View>
            <View style={[styles.depositIcon, { backgroundColor: colors.success + "18" }]}><MaterialIcons name="security" size={20} color={colors.success} /></View>
          </Pressable>
          {depositRecorded > 0 ? <View style={[styles.depositGrid, { flexDirection: row }]}><DepositMetric label={language === "ar" ? "المستلم" : "Received"} value={formatMoney(depositRecorded, settings.currency)} colors={colors} align={align} accentColor={colors.success} /><DepositMetric label={language === "ar" ? "المسترد" : "Refunded"} value={formatMoney(depositRefunded, settings.currency)} colors={colors} align={align} accentColor={colors.success} /><DepositMetric label={language === "ar" ? "المتبقي" : "Remaining"} value={formatMoney(depositHeld, settings.currency)} colors={colors} align={align} accentColor={colors.success} /></View> : null}
          {canRefundDeposit ? <Pressable onPress={() => { setRefundPaymentMethod(null); setRefundExpanded(true); }} style={({ pressed }) => [styles.depositQuickRefund, { backgroundColor: colors.success + "16", borderColor: colors.success + "66", flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="reply" size={17} color={colors.success} /><Text style={{ color: colors.success, fontWeight: "800" }}>{language === "ar" ? "استرداد سريع للتأمين" : "Quick deposit refund"}</Text></Pressable> : null}
          {refundExpanded && canRefundDeposit ? <View style={styles.refundForm}><TextInput value={refundAmount} onChangeText={setRefundAmount} placeholder={language === "ar" ? "مبلغ الاسترداد" : "Refund amount"} keyboardType="decimal-pad" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><Text style={[styles.paymentMethodLabel, { color: colors.success, textAlign: align }]}>{language === "ar" ? "طريقة استرداد التأمين" : "Deposit refund method"}</Text><View style={[styles.paymentMethodGrid, paymentFormStyles.paymentMethodRow, { flexDirection: row }]}>{paymentMethodOptions.map((method) => <Pressable key={method.id} onPress={() => setRefundPaymentMethod(method.id)} style={({ pressed }) => [styles.paymentMethodOption, paymentFormStyles.paymentMethodRowOption, { backgroundColor: refundPaymentMethod === method.id ? colors.success + "16" : colors.surface, borderColor: refundPaymentMethod === method.id ? colors.success : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={method.icon} size={16} color={refundPaymentMethod === method.id ? colors.success : colors.muted} /><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76} style={{ color: refundPaymentMethod === method.id ? colors.success : colors.foreground, fontSize: 10, fontWeight: "800" }}>{paymentMethodLabel(method.id, language)}</Text></Pressable>)}</View><TextInput value={refundNote} onChangeText={setRefundNote} placeholder={language === "ar" ? "سبب أو ملاحظة الاسترداد" : "Refund reason or note"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><ActionButton label={language === "ar" ? "تسجيل استرداد التأمين" : "Record deposit refund"} colors={colors} accentColor={colors.success} onPress={refundDeposit} /></View> : null}
        </View>

        {!rentalFullyPaid ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إضافة دفعة" : "Add payment"} onPress={openPaymentSheet} style={({ pressed }) => [styles.paymentTrigger, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="add-card" size={20} color={bookingChalet?.color ?? colors.primary} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إضافة دفعة إيجار" : "Add rental payment"}</Text><Text numberOfLines={1} style={{ color: colors.warning, fontSize: 11, fontWeight: "800", marginTop: 3, textAlign: align }}>{language === "ar" ? `المتبقي: ${formatMoney(rentalBalance, settings.currency)}` : `Remaining: ${formatMoney(rentalBalance, settings.currency)}`}</Text></View><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={colors.muted} /></Pressable> : null}
        <View style={[styles.quickActions, { flexDirection: row }]}><QuickAction label={language === "ar" ? "واتساب" : "WhatsApp"} icon="chat" colors={colors} accentColor={colors.primary} onPress={openWhatsAppComposer} /><QuickAction label={language === "ar" ? "اتصال" : "Call"} icon="phone" colors={colors} accentColor={colors.primary} onPress={callGuest} /><QuickAction label={language === "ar" ? "العقد" : "Contract"} icon="description" colors={colors} accentColor={colors.primary} onPress={() => setContractOpen(true)} /><QuickAction label={language === "ar" ? "الإيصال" : "Receipt"} icon="receipt-long" colors={colors} accentColor={colors.primary} onPress={() => setReceiptOpen(true)} /></View>
        {manualCheckInEnabled && can("edit_bookings") && manualOperationalState === "late-arrival" ? <Pressable accessibilityRole="button" onPress={() => setCheckInSheetOpen(true)} style={({ pressed }) => [{ minHeight: 54, borderRadius: 15, marginTop: 11, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.success, flexDirection: "row", opacity: pressed || operationalSaving ? 0.62 : 1 }]} disabled={operationalSaving}><MaterialIcons name={operationalSaving ? "hourglass-top" : "login"} size={21} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{operationalSaving ? (language === "ar" ? "جارٍ تسجيل الوصول" : "Recording arrival") : (language === "ar" ? "تسجيل وصول الضيف" : "Record guest arrival")}</Text></Pressable> : null}
        {manualCheckInEnabled && can("edit_bookings") && (manualOperationalState === "in-house" || manualOperationalState === "checkout-warning") ? <Pressable accessibilityRole="button" onPress={confirmGuestCheckout} style={({ pressed }) => [{ minHeight: 54, borderRadius: 15, marginTop: 11, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, flexDirection: "row", opacity: pressed || operationalSaving ? 0.62 : 1 }]} disabled={operationalSaving}><MaterialIcons name={operationalSaving ? "hourglass-top" : "logout"} size={21} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{operationalSaving ? (language === "ar" ? "جارٍ تسجيل المغادرة" : "Recording checkout") : (language === "ar" ? "تسجيل مغادرة الضيف" : "Record guest checkout")}</Text></Pressable> : null}
        {(isManager || can("manage_payments") || can("edit_bookings") || can("create_bookings")) ? <View style={{ borderWidth: 1, borderRadius: 18, borderColor: colors.primary + "58", backgroundColor: colors.primary + "08", padding: 10, marginTop: 13 }}><View style={{ flexDirection: row, alignItems: "center", gap: 8, marginBottom: 9 }}><View style={[styles.depositIcon, { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primary + "16" }]}><MaterialIcons name="tune" size={18} color={colors.primary} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: align }}>{language === "ar" ? "مركز التعديلات والإجراءات" : "Management and modifications"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? "إدارة الحجز والدفعات وأوقات الإقامة من مكان واحد" : "Manage booking details, payments, and stay times in one place"}</Text></View></View><View style={{ flexDirection: row, flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>{isManager ? <Pressable accessibilityRole="button" onPress={openStayCorrection} disabled={operationalSaving} style={({ pressed }) => [{ width: "48%", minHeight: 62, borderWidth: 1, borderRadius: 13, borderColor: colors.primary + "62", backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 7, opacity: pressed || operationalSaving ? 0.62 : 1 }]}><MaterialIcons name="edit-calendar" size={19} color={colors.primary} /><Text numberOfLines={2} style={{ color: colors.primary, fontSize: 10, fontWeight: "900", textAlign: "center" }}>{language === "ar" ? "تعديل وقت الوصول / المغادرة" : "Correct arrival / departure"}</Text></Pressable> : null}{can("manage_payments") ? <Pressable accessibilityRole="button" onPress={() => { setEditingPayment(null); setVoidingPayment(null); setPaymentManagerOpen(true); }} style={({ pressed }) => [{ width: "48%", minHeight: 62, borderWidth: 1, borderRadius: 13, borderColor: colors.primary + "62", backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 7, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="payments" size={19} color={colors.primary} /><Text numberOfLines={2} style={{ color: colors.primary, fontSize: 10, fontWeight: "900", textAlign: "center" }}>{language === "ar" ? "تعديل الدفعات والمبالغ" : "Edit payments and amounts"}</Text></Pressable> : null}{can("edit_bookings") ? <Pressable accessibilityRole="button" onPress={confirmEdit} style={({ pressed }) => [{ width: "48%", minHeight: 62, borderWidth: 1, borderRadius: 13, borderColor: colors.primary + "62", backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 7, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="edit" size={19} color={colors.primary} /><Text numberOfLines={2} style={{ color: colors.primary, fontSize: 10, fontWeight: "900", textAlign: "center" }}>{language === "ar" ? "تعديل تفاصيل الحجز" : "Edit booking details"}</Text></Pressable> : null}{can("create_bookings") ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/booking-form", params: { copyFromId: booking.id } } as never)} style={({ pressed }) => [{ width: "48%", minHeight: 62, borderWidth: 1, borderRadius: 13, borderColor: colors.primary + "62", backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 7, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="content-copy" size={19} color={colors.primary} /><Text numberOfLines={2} style={{ color: colors.primary, fontSize: 10, fontWeight: "900", textAlign: "center" }}>{language === "ar" ? "حجز جديد بنفس العميل" : "New booking with this guest"}</Text></Pressable> : null}</View></View> : null}

        <View style={[styles.timelineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: timelineExpanded }} accessibilityLabel={language === "ar" ? "فتح الإيصالات المالية" : "Open financial receipts"} onPress={() => setTimelineExpanded((value) => !value)} style={({ pressed }) => [styles.timelineHeader, { flexDirection: row, opacity: pressed ? 0.72 : 1 }]}><View style={[styles.depositIcon, { backgroundColor: colors.primary + "16" }]}><MaterialIcons name="receipt-long" size={19} color={colors.primary} /></View><View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "800", textAlign: align }}>{language === "ar" ? "الإيصالات المالية" : "Financial receipts"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{financialTimeline.length ? (language === "ar" ? `${financialTimeline.length} إيصالات وحركات قابلة للمشاركة` : `${financialTimeline.length} receipts and shareable movements`) : (language === "ar" ? "لا توجد إيصالات محفوظة" : "No saved receipts")}</Text></View><MaterialIcons name={timelineExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={26} color={colors.muted} /></Pressable>
          {timelineExpanded ? <>{financialTimeline.length ? financialTimeline.map((item, index) => <View key={item.id} style={[styles.timelineRow, { flexDirection: row }]}><View style={styles.timelineTrack}><View style={[styles.timelineDot, { backgroundColor: item.kind === "payment" ? colors.success : colors.warning }]}>{<MaterialIcons name={item.kind === "payment" ? "payments" : "security"} size={12} color={colors.background} />}</View>{index < financialTimeline.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: colors.border }]} /> : null}</View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800", textAlign: align }}>{item.kind === "payment" ? (language === "ar" ? "دفعة إيجار" : "Rental payment") : (language === "ar" ? "استرداد تأمين" : "Deposit refund")}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{formatDate(item.date)}{movementTime(item.recordedAt) ? ` · ${movementTime(item.recordedAt)}` : ""} · {item.kind === "payment" ? paymentMethodLabel(item.paymentMethod, language) : (language === "ar" ? "استرداد للعميل" : "Customer refund")}</Text>{item.kind === "payment" && item.recordedByName ? <Text style={{ color: colors.muted, fontSize: 10, marginTop: 3, textAlign: align }}>{language === "ar" ? `سجلها: ${item.recordedByName}` : `Recorded by: ${item.recordedByName}`}</Text> : null}{item.note ? <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{item.note}</Text> : null}<View style={{ flexDirection: row, flexWrap: "wrap", gap: 6, marginTop: 7 }}>{item.receiptUri ? <Pressable accessibilityLabel={language === "ar" ? "عرض صورة الوصل" : "View receipt image"} onPress={() => setReceiptPreviewUri(item.receiptUri)} style={({ pressed }) => [styles.timelineReceipt, { width: 30, height: 30, marginTop: 0, paddingHorizontal: 0, paddingVertical: 0, justifyContent: "center", backgroundColor: colors.primary + "12", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="image" size={15} color={colors.primary} /></Pressable> : null}<Pressable accessibilityLabel={language === "ar" ? "مشاركة الإيصال" : "Share receipt"} disabled={sharingMovementId === item.id} onPress={() => void shareMovementReceipt(item)} style={({ pressed }) => [styles.timelineReceipt, { width: 30, height: 30, marginTop: 0, paddingHorizontal: 0, paddingVertical: 0, justifyContent: "center", backgroundColor: (bookingChalet?.color ?? colors.primary) + "16", opacity: pressed || sharingMovementId === item.id ? 0.6 : 1 }]}><MaterialIcons name={sharingMovementId === item.id ? "hourglass-top" : "ios-share"} size={15} color={bookingChalet?.color ?? colors.primary} /></Pressable></View></View><View style={styles.timelineAmountBlock}><Text style={{ color: item.kind === "payment" ? colors.success : colors.warning, fontSize: 13, fontWeight: "800", writingDirection: "ltr" }}>{item.kind === "payment" ? "+" : "−"}{formatMoney(item.amount, settings.currency)}</Text></View></View>) : <Text style={{ color: colors.muted, fontSize: 12, marginTop: 13, textAlign: align }}>{language === "ar" ? "لا توجد حركات مالية مسجلة بعد." : "No financial activity has been recorded yet."}</Text>}</> : null}
        </View>

        <BookingActivityTimeline entries={bookingTimeline} expanded={activityTimelineExpanded} onToggle={() => setActivityTimelineExpanded((value) => !value)} language={language} isRTL={isRTL} colors={colors} formatDate={formatDate} formatTime={formatTime} manualTrackingDisabled={!manualCheckInEnabled} />

        <View style={[styles.bookingActionPair, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}>
          {can("edit_bookings") ? <TouchableOpacity activeOpacity={0.72} onPress={confirmEdit} style={[styles.editBookingAction, { borderColor: colors.error + "88", backgroundColor: colors.error + "0C" }]}><MaterialIcons name="edit" size={18} color={colors.error} /><Text style={{ color: colors.error, fontWeight: "800" }}>{language === "ar" ? "تعديل الحجز" : "Edit booking"}</Text></TouchableOpacity> : null}
          {can("cancel_delete_bookings") ? <TouchableOpacity activeOpacity={0.72} onPress={confirmCancellation} style={[styles.cancelBookingAction, { borderColor: colors.error + "88", backgroundColor: colors.error + "0C" }]}><MaterialIcons name="event-busy" size={18} color={colors.error} /><Text style={{ color: colors.error, fontWeight: "800" }}>{language === "ar" ? "إلغاء الحجز" : "Cancel booking"}</Text></TouchableOpacity> : null}
        </View>
      </ScrollView>
      {showUpdateToast ? <View accessibilityLiveRegion="polite" style={[styles.successToast, { backgroundColor: colors.success, shadowColor: colors.success }]}><MaterialIcons name="check-circle" size={20} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "800", textAlign: "center" }}>{language === "ar" ? "تم تحديث تفاصيل الحجز بنجاح" : "Booking details updated successfully"}</Text></View> : null}
      <Modal visible={stayCorrectionOpen} transparent animationType="slide" onRequestClose={() => !operationalSaving && setStayCorrectionOpen(false)}><View style={styles.sheetBackdrop}><View style={[styles.cancellationSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.sheetHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "800", textAlign: align }}>{language === "ar" ? "تصحيح حالة الإقامة" : "Correct stay status"}</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 4, textAlign: align }}>{language === "ar" ? "للمالك فقط. يُسجل التعديل باسمك ووقته في سجل الحركات." : "Owner only. The correction is recorded under your name and time."}</Text></View><Pressable disabled={operationalSaving} onPress={() => setStayCorrectionOpen(false)} style={[styles.sheetClose, { backgroundColor: colors.surfaceMuted, opacity: operationalSaving ? 0.5 : 1 }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable></View><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800", textAlign: align }}>{language === "ar" ? "وقت الوصول الفعلي" : "Actual arrival time"}</Text><TextInput value={correctionArrival} onChangeText={setCorrectionArrival} placeholder="2026-08-26 10:15" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: "left", writingDirection: "ltr" }]} /><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800", marginTop: 11, textAlign: align }}>{language === "ar" ? "وقت المغادرة الفعلي" : "Actual departure time"}</Text><TextInput value={correctionDeparture} onChangeText={setCorrectionDeparture} placeholder="2026-08-26 14:30" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: "left", writingDirection: "ltr" }]} /><Pressable onPress={() => setCorrectionResolveNoShow((value) => !value)} style={({ pressed }) => [{ minHeight: 45, marginTop: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, alignItems: "center", gap: 8, flexDirection: row, backgroundColor: correctionResolveNoShow ? colors.success + "12" : colors.surfaceMuted, borderColor: correctionResolveNoShow ? colors.success : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={correctionResolveNoShow ? "check-box" : "check-box-outline-blank"} size={20} color={correctionResolveNoShow ? colors.success : colors.muted} /><Text style={[styles.flex, { color: correctionResolveNoShow ? colors.success : colors.foreground, fontWeight: "800", fontSize: 12, textAlign: align }]}>{language === "ar" ? "معالجة حالة لم يحضر الضيف" : "Resolve no-show state"}</Text></Pressable><TextInput value={correctionNote} onChangeText={setCorrectionNote} placeholder={language === "ar" ? "سبب التصحيح أو ملاحظة (اختياري)" : "Correction reason or note (optional)"} placeholderTextColor={colors.muted} multiline style={[styles.input, { minHeight: 72, backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align, textAlignVertical: "top" }]} /><TouchableOpacity disabled={operationalSaving} activeOpacity={0.72} onPress={() => void saveStayCorrection()} style={[styles.cancelConfirmAction, { backgroundColor: colors.warning, opacity: operationalSaving ? 0.6 : 1 }]}><MaterialIcons name={operationalSaving ? "hourglass-top" : "save"} size={19} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{operationalSaving ? (language === "ar" ? "جارٍ حفظ التصحيح" : "Saving correction") : (language === "ar" ? "حفظ التصحيح" : "Save correction")}</Text></TouchableOpacity></View></View></Modal>
      <Modal visible={messageTemplateOpen} transparent animationType="slide" onRequestClose={() => !whatsAppSending && setMessageTemplateOpen(false)}><View style={styles.sheetBackdrop}><View style={[styles.cancellationSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.sheetHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إرسال عبر واتساب" : "Send with WhatsApp"}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 18, textAlign: align }}>{language === "ar" ? "ضع علامة صح على ما تريد إرساله، ثم راجع الرسالة في واتساب وأرسلها بنفسك." : "Check what you want to include, then review the combined message in WhatsApp and send it yourself."}</Text></View><Pressable disabled={whatsAppSending} onPress={() => setMessageTemplateOpen(false)} style={[styles.sheetClose, { backgroundColor: colors.surfaceMuted, opacity: whatsAppSending ? 0.5 : 1 }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable></View><View style={{ gap: 8, marginTop: 12 }}>{availableWhatsAppItems.map((item) => { const selected = selectedWhatsAppItems.includes(item); const icon = item === "receipt" ? "receipt-long" : item === "confirmation" ? "event-available" : item === "arrival" ? "login" : item === "checkout" ? "logout" : item === "contract" ? "description" : "format-list-numbered"; return <Pressable key={item} disabled={whatsAppSending} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={whatsappSendItemLabel(item, language)} onPress={() => toggleWhatsAppItem(item)} style={({ pressed }) => [{ minHeight: 48, borderWidth: 1, borderRadius: 13, borderColor: selected ? colors.success : colors.border, backgroundColor: selected ? colors.success + "12" : colors.surfaceMuted, paddingHorizontal: 13, alignItems: "center", gap: 9, flexDirection: row, opacity: pressed || whatsAppSending ? 0.65 : 1 }]}><MaterialIcons name={selected ? "check-box" : "check-box-outline-blank"} size={21} color={selected ? colors.success : colors.muted} /><MaterialIcons name={icon} size={18} color={selected ? colors.success : colors.primary} /><Text style={[styles.flex, { color: selected ? colors.success : colors.foreground, fontWeight: "800", textAlign: align }]}>{whatsappSendItemLabel(item, language)}</Text></Pressable>; })}</View><TouchableOpacity disabled={whatsAppSending || selectedWhatsAppItems.length === 0} activeOpacity={0.72} onPress={() => void sendSelectedWhatsApp()} style={{ minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 15, backgroundColor: colors.success, opacity: whatsAppSending || selectedWhatsAppItems.length === 0 ? 0.55 : 1 }}><MaterialIcons name={whatsAppSending ? "hourglass-top" : "send"} size={19} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{whatsAppSending ? (language === "ar" ? "جارٍ فتح واتساب" : "Opening WhatsApp") : (language === "ar" ? `إرسال (${selectedWhatsAppItems.length})` : `Send (${selectedWhatsAppItems.length})`)}</Text></TouchableOpacity></View></View></Modal>
      <Modal visible={cancellationOpen} transparent animationType="slide" onRequestClose={() => setCancellationOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <GlowGlassCard radius={28} intensity={22} style={styles.cancellationSheet} contentStyle={{ paddingHorizontal: 16, paddingTop: 17, paddingBottom: 28 }}>
            <View style={[styles.sheetHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إلغاء الحجز" : "Cancel booking"}</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 4, textAlign: align }}>{cancellationMessage}</Text></View><Pressable accessibilityLabel={language === "ar" ? "إغلاق الإلغاء" : "Close cancellation"} onPress={() => setCancellationOpen(false)} style={({ pressed }) => [styles.sheetClose, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable></View>
            <TextInput value={cancellationReason} onChangeText={setCancellationReason} placeholder={language === "ar" ? "سبب الإلغاء (اختياري)" : "Cancellation reason (optional)"} multiline textAlignVertical="top" placeholderTextColor={colors.muted} style={[styles.input, styles.cancellationReason, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
            <TouchableOpacity activeOpacity={0.72} onPress={() => void submitCancellation()} style={[styles.cancelConfirmAction, { backgroundColor: colors.error }]}><MaterialIcons name="event-busy" size={19} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "800" }}>{language === "ar" ? "تأكيد إلغاء الحجز" : "Confirm cancellation"}</Text></TouchableOpacity>
          </GlowGlassCard>
        </View>
      </Modal>
      <Modal visible={editConfirmationOpen} transparent animationType="fade" onRequestClose={() => setEditConfirmationOpen(false)}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: "rgba(7, 20, 18, 0.58)" }}>
          <GlowGlassCard radius={22} intensity={22} style={{ width: "100%", maxWidth: 360, borderRadius: 22 }} contentStyle={{ alignItems: "center", padding: 20 }}>
            <MaterialIcons name="edit" size={27} color={colors.error} />
            <Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "800", marginTop: 10, textAlign: "center" }}>{language === "ar" ? "تعديل الحجز" : "Edit booking"}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 7, textAlign: "center" }}>{language === "ar" ? `هل تريد فتح تعديل حجز ${booking.customerName}؟` : `Do you want to open the editor for ${booking.customerName}'s booking?`}</Text>
            <View style={{ width: "100%", flexDirection: "row", gap: 9, marginTop: 18 }}>
              <TouchableOpacity activeOpacity={0.72} onPress={() => setEditConfirmationOpen(false)} style={{ flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, backgroundColor: colors.surfaceMuted }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{language === "ar" ? "رجوع" : "Go back"}</Text></TouchableOpacity>
              <TouchableOpacity activeOpacity={0.72} onPress={openEditor} style={{ flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, backgroundColor: colors.error }}><Text style={{ color: colors.background, fontWeight: "800" }}>{language === "ar" ? "فتح التعديل" : "Open editor"}</Text></TouchableOpacity>
            </View>
          </GlowGlassCard>
        </View>
      </Modal>
      <Modal visible={paymentSheetOpen} transparent animationType="slide" onRequestClose={() => setPaymentSheetOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <GlowGlassCard radius={28} intensity={22} style={styles.paymentSheet} contentStyle={{ paddingHorizontal: 16, paddingTop: 17 }}>
            <ScrollView contentContainerStyle={styles.paymentSheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={[styles.sheetHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إضافة دفعة إيجار" : "Add rental payment"}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 3, textAlign: align }}>{language === "ar" ? `المتبقي: ${formatMoney(rentalBalance, settings.currency)}` : `Remaining: ${formatMoney(rentalBalance, settings.currency)}`}</Text></View><Pressable accessibilityLabel={language === "ar" ? "إغلاق الدفعة" : "Close payment"} onPress={() => setPaymentSheetOpen(false)} style={({ pressed }) => [styles.sheetClose, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable></View>
              <View style={[paymentFormStyles.paymentAmountRow, { flexDirection: row }]}><TextInput value={note} onChangeText={setNote} placeholder={language === "ar" ? "ملاحظة اختيارية" : "Optional note"} placeholderTextColor={colors.muted} style={[styles.input, paymentFormStyles.paymentAmountNoteInput, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><TextInput value={amount} onChangeText={setAmount} placeholder={language === "ar" ? "مبلغ الدفعة" : "Payment amount"} keyboardType="decimal-pad" placeholderTextColor={colors.warning} style={[styles.input, paymentFormStyles.paymentAmountInput, { backgroundColor: colors.warning + "16", borderColor: colors.warning, color: colors.foreground, textAlign: align }]} /></View>
              <Text style={[paymentFormStyles.paymentAmountCaption, { color: colors.warning, textAlign: align }]}>{language === "ar" ? "المبلغ الافتراضي هو الرصيد المتبقي ويمكن تعديله" : "The remaining balance is prefilled and editable"}</Text>
              <Text accessibilityLiveRegion="polite" style={[styles.paymentMethodLabel, { color: paymentMethodError && !paymentMethod ? colors.error : colors.success, textAlign: align }]}>{paymentMethodError && !paymentMethod ? (language === "ar" ? "يرجى اختيار طريقة الدفع للمتابعة" : "Please choose a payment method to continue.") : (language === "ar" ? "طريقة الدفع" : "Payment method")}</Text>
              <View style={[styles.paymentMethodGrid, paymentFormStyles.paymentMethodRow, { flexDirection: row }]}>{(isRTL ? [...paymentMethodOptions].reverse() : paymentMethodOptions).map((method) => <Pressable key={method.id} onPress={() => setPaymentMethod(method.id)} style={({ pressed }) => [styles.paymentMethodOption, paymentFormStyles.paymentMethodRowOption, { backgroundColor: paymentMethod === method.id ? colors.success + "16" : colors.surfaceMuted, borderColor: paymentMethod === method.id ? colors.success : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={method.icon} size={16} color={paymentMethod === method.id ? colors.success : colors.muted} /><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76} style={{ color: paymentMethod === method.id ? colors.success : colors.foreground, fontSize: 10, fontWeight: "800" }}>{paymentMethodLabel(method.id, language)}</Text></Pressable>)}</View>
              <View style={[styles.receiptAttachment, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, flexDirection: row }]}>{receiptUri ? <Image source={{ uri: receiptUri }} contentFit="cover" style={styles.receiptPreview} /> : <View style={[styles.receiptPlaceholder, { backgroundColor: colors.primary + "12" }]}><MaterialIcons name="image" size={21} color={colors.primary} /></View>}<View style={styles.flex}><Text style={{ color: colors.foreground, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إرفاق وصل" : "Attach receipt"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{receiptUri ? (language === "ar" ? "تم اختيار صورة الوصل" : "Receipt image selected") : (language === "ar" ? "اختياري؛ يُحفظ على هذا الجهاز" : "Optional; stored on this device")}</Text><View style={[styles.receiptActions, { flexDirection: row }]}><Pressable disabled={receiptSelecting} onPress={() => void chooseReceipt()} style={({ pressed }) => [styles.receiptAction, { backgroundColor: colors.primary + "14", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="photo-library" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "800" }}>{receiptUri ? (language === "ar" ? "تغيير" : "Change") : (language === "ar" ? "اختيار صورة" : "Choose image")}</Text></Pressable>{receiptUri ? <Pressable onPress={() => setReceiptUri(undefined)} style={({ pressed }) => [styles.receiptAction, { backgroundColor: colors.error + "12", opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="delete-outline" size={15} color={colors.error} /><Text style={{ color: colors.error, fontSize: 10, fontWeight: "800" }}>{language === "ar" ? "إزالة" : "Remove"}</Text></Pressable> : null}</View></View></View>
              <ActionButton label={paymentSaving ? (language === "ar" ? "جارٍ تسجيل الدفعة" : "Recording payment") : (language === "ar" ? "تسجيل الدفعة" : "Record payment")} colors={colors} accentColor={bookingChalet?.color ?? colors.primary} onPress={pay} disabled={paymentSaving} />
            </ScrollView>
          </GlowGlassCard>
        </View>
      </Modal>
      <Modal visible={Boolean(paymentConfirmation)} transparent animationType="fade" onRequestClose={() => setPaymentConfirmation(null)}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: "rgba(7, 20, 18, 0.62)" }}>
          {paymentConfirmation ? <View style={{ width: "100%", maxWidth: 370, borderRadius: 22, borderWidth: 1, borderColor: paymentConfirmation.kind === "partial" ? colors.warning + "88" : colors.error + "88", backgroundColor: colors.surface, padding: 20 }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: (paymentConfirmation.kind === "partial" ? colors.warning : colors.error) + "18" }}><MaterialIcons name={paymentConfirmation.kind === "partial" ? "payments" : "warning-amber"} size={25} color={paymentConfirmation.kind === "partial" ? colors.warning : colors.error} /></View>
            <Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "800", marginTop: 12, textAlign: align }}>{paymentConfirmation.kind === "partial" ? (language === "ar" ? "دفعة جزئية" : "Partial payment") : (language === "ar" ? "تأكيد المبلغ" : "Confirm amount")}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21, marginTop: 8, textAlign: align }}>{paymentConfirmation.kind === "partial" ? (language === "ar" ? `تم إدخال دفعة جزئية، سيبقى على الحجز مبلغ ${formatMoney(rentalBalance - paymentConfirmation.value, settings.currency)}.` : `This is a partial payment. ${formatMoney(rentalBalance - paymentConfirmation.value, settings.currency)} will remain on the booking.`) : (language === "ar" ? "المبلغ المدخل أكبر من الرصيد المتبقي، هل أنت متأكد من المتابعة؟" : "The entered amount exceeds the remaining balance. Are you sure you want to continue?")}</Text>
            <View style={{ width: "100%", flexDirection: row, gap: 9, marginTop: 20 }}>
              <TouchableOpacity activeOpacity={0.72} onPress={() => setPaymentConfirmation(null)} style={{ flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{language === "ar" ? "تعديل" : "Edit"}</Text></TouchableOpacity>
              <TouchableOpacity disabled={paymentSaving} activeOpacity={0.72} onPress={() => { const pending = paymentConfirmation; setPaymentConfirmation(null); void recordPayment(pending.value, pending.method); }} style={{ flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: paymentConfirmation.kind === "partial" ? colors.warning : colors.error, opacity: paymentSaving ? 0.6 : 1 }}><Text style={{ color: colors.background, fontWeight: "800" }}>{paymentSaving ? (language === "ar" ? "جارٍ الحفظ" : "Saving") : paymentConfirmation.kind === "partial" ? (language === "ar" ? "تسجيل الدفعة" : "Record payment") : (language === "ar" ? "تأكيد" : "Confirm")}</Text></TouchableOpacity>
            </View>
          </View> : null}
        </View>
      </Modal>
      <Modal visible={paymentManagerOpen} transparent animationType="slide" onRequestClose={() => { setPaymentManagerOpen(false); setEditingPayment(null); setVoidingPayment(null); }}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.paymentSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.paymentSheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={[styles.sheetHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "800", textAlign: align }}>{voidingPayment ? (language === "ar" ? "إلغاء دفعة" : "Void payment") : editingPayment ? (language === "ar" ? "تعديل دفعة" : "Edit payment") : (language === "ar" ? "إدارة الدفعات" : "Manage payments")}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 3, textAlign: align }}>{language === "ar" ? "التعديل يعيد حساب الملخص فورًا، والإلغاء يحفظ أثر الحركة." : "Edits recalculate totals; voids remain in history."}</Text></View><Pressable onPress={() => { setPaymentManagerOpen(false); setEditingPayment(null); setVoidingPayment(null); }} style={[styles.sheetClose, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable></View>
              {voidingPayment ? <View><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", textAlign: align }}>{language === "ar" ? `هل تريد إلغاء دفعة ${formatMoney(voidingPayment.amount, settings.currency)}؟` : `Void ${formatMoney(voidingPayment.amount, settings.currency)}?`}</Text><TextInput value={voidPaymentReason} onChangeText={setVoidPaymentReason} placeholder={language === "ar" ? "سبب الإلغاء (اختياري)" : "Void reason (optional)"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, marginTop: 15, textAlign: align }]} /><View style={{ flexDirection: row, gap: 9, marginTop: 14 }}><TouchableOpacity activeOpacity={0.72} onPress={() => { setVoidingPayment(null); setVoidPaymentReason(""); }} style={{ flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{language === "ar" ? "تراجع" : "Back"}</Text></TouchableOpacity><TouchableOpacity activeOpacity={0.72} onPress={() => void confirmPaymentVoid()} style={{ flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.error }}><Text style={{ color: colors.background, fontWeight: "800" }}>{language === "ar" ? "تأكيد الإلغاء" : "Confirm void"}</Text></TouchableOpacity></View></View> : editingPayment ? <View><TextInput value={editPaymentAmount} onChangeText={setEditPaymentAmount} keyboardType="decimal-pad" placeholder={language === "ar" ? "مبلغ الدفعة" : "Payment amount"} placeholderTextColor={colors.warning} style={[styles.input, { backgroundColor: colors.warning + "16", borderColor: colors.warning, color: colors.foreground, textAlign: align }]} /><Text style={[styles.paymentMethodLabel, { color: colors.success, textAlign: align }]}>{language === "ar" ? "طريقة الدفع" : "Payment method"}</Text><View style={[styles.paymentMethodGrid, paymentFormStyles.paymentMethodRow, { flexDirection: row }]}>{(isRTL ? [...paymentMethodOptions].reverse() : paymentMethodOptions).map((method) => <Pressable key={method.id} onPress={() => setEditPaymentMethod(method.id)} style={[styles.paymentMethodOption, paymentFormStyles.paymentMethodRowOption, { backgroundColor: editPaymentMethod === method.id ? colors.success + "16" : colors.surfaceMuted, borderColor: editPaymentMethod === method.id ? colors.success : colors.border }]}><MaterialIcons name={method.icon} size={16} color={editPaymentMethod === method.id ? colors.success : colors.muted} /><Text numberOfLines={1} style={{ color: editPaymentMethod === method.id ? colors.success : colors.foreground, fontSize: 10, fontWeight: "800" }}>{paymentMethodLabel(method.id, language)}</Text></Pressable>)}</View><TextInput value={editPaymentNote} onChangeText={setEditPaymentNote} placeholder={language === "ar" ? "ملاحظة اختيارية" : "Optional note"} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} /><View style={{ flexDirection: row, gap: 9, marginTop: 14 }}><TouchableOpacity activeOpacity={0.72} onPress={() => setEditingPayment(null)} style={{ flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{language === "ar" ? "تراجع" : "Back"}</Text></TouchableOpacity><TouchableOpacity disabled={paymentEditSaving} activeOpacity={0.72} onPress={() => void savePaymentEdit()} style={{ flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.success, opacity: paymentEditSaving ? 0.62 : 1 }}><Text style={{ color: colors.background, fontWeight: "800" }}>{paymentEditSaving ? (language === "ar" ? "جارٍ الحفظ" : "Saving") : (language === "ar" ? "حفظ التعديل" : "Save changes")}</Text></TouchableOpacity></View></View> : booking.payments.map((payment) => <View key={payment.id} style={{ borderWidth: 1, borderColor: payment.voidedAt ? colors.error + "66" : colors.border, backgroundColor: payment.voidedAt ? colors.error + "08" : colors.surfaceMuted, borderRadius: 14, padding: 13, marginTop: 10 }}><View style={{ flexDirection: row, alignItems: "center" }}><View style={styles.flex}><Text style={{ color: payment.voidedAt ? colors.error : colors.foreground, fontWeight: "800", textAlign: align }}>{payment.voidedAt ? (language === "ar" ? "دفعة ملغاة" : "Voided payment") : (language === "ar" ? "دفعة إيجار" : "Rental payment")}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: align }}>{formatDate(payment.date)} · {paymentMethodLabel(payment.paymentMethod, language)}</Text></View><Text style={{ color: payment.voidedAt ? colors.error : colors.success, fontWeight: "800", writingDirection: "ltr" }}>{formatMoney(payment.amount, settings.currency)}</Text></View>{!payment.voidedAt ? <View style={{ flexDirection: row, gap: 8, marginTop: 11 }}><TouchableOpacity activeOpacity={0.72} onPress={() => startPaymentEdit(payment)} style={{ flex: 1, minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.primary + "88", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }}><MaterialIcons name="edit" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}>{language === "ar" ? "تعديل" : "Edit"}</Text></TouchableOpacity><TouchableOpacity activeOpacity={0.72} onPress={() => { setVoidingPayment(payment); setVoidPaymentReason(""); }} style={{ flex: 1, minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.error + "88", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }}><MaterialIcons name="block" size={15} color={colors.error} /><Text style={{ color: colors.error, fontSize: 12, fontWeight: "800" }}>{language === "ar" ? "إلغاء الدفعة" : "Void"}</Text></TouchableOpacity></View> : null}</View>)}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(receiptPreviewUri)} transparent animationType="fade" onRequestClose={() => setReceiptPreviewUri(undefined)}>
        <View style={styles.receiptPreviewBackdrop}><View style={[styles.receiptPreviewSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.receiptHeader, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.foreground, fontSize: 18, fontWeight: "800", textAlign: align }]}>{language === "ar" ? "وصل الدفعة" : "Payment receipt"}</Text><Pressable onPress={() => setReceiptPreviewUri(undefined)} style={[styles.receiptClose, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable></View>{receiptPreviewUri ? <Image source={{ uri: receiptPreviewUri }} contentFit="contain" style={styles.receiptPreviewLarge} /> : null}</View></View>
      </Modal>
      <Modal visible={receiptOpen} transparent animationType="slide" onRequestClose={() => setReceiptOpen(false)}>
        <View style={styles.receiptBackdrop}>
          <GlowGlassCard radius={28} intensity={22} style={styles.receiptSheet} contentStyle={{ paddingTop: 17, paddingHorizontal: 16 }}>
            <View style={[styles.receiptHeader, { flexDirection: row }]}>
              <View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إيصال الحجز" : "Booking receipt"}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 3, textAlign: align }}>{settings.businessName}</Text></View>
              <Pressable accessibilityLabel={language === "ar" ? "إغلاق الإيصال" : "Close receipt"} onPress={() => setReceiptOpen(false)} style={({ pressed }) => [styles.receiptClose, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.receiptContent} showsVerticalScrollIndicator={false}>
              <View style={[styles.receiptStatus, { backgroundColor: (bookingChalet?.color ?? colors.primary) + "14", borderColor: (bookingChalet?.color ?? colors.primary) + "42", borderWidth: 1, flexDirection: row }]}>{settings.businessLogoUrl ? <Image source={{ uri: settings.businessLogoUrl }} style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surface }} contentFit="cover" /> : <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: bookingChalet?.color ?? colors.primary, alignItems: "center", justifyContent: "center" }}><MaterialIcons name="storefront" size={25} color={colors.background} /></View>}<View style={[styles.typeMark, { backgroundColor: bookingChalet?.color ?? colors.primary, minHeight: 44 }]} /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", textAlign: align }}>{booking.customerName}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, textAlign: align }}>{booking.chaletName || (language === "ar" ? "الشاليه غير محدد" : "Chalet not specified")}</Text><Text style={{ color: bookingChalet?.color ?? colors.primary, fontSize: 11, fontWeight: "800", marginTop: 5, textAlign: align, writingDirection: "ltr" }}>{booking.bookingReference ?? "—"}</Text></View></View>
              <View style={[styles.receiptRows, { borderColor: colors.border }]}><Text style={{ color: colors.foreground, fontWeight: "800", textAlign: align }}>{language === "ar" ? "تفاصيل الإقامة" : "Stay details"}</Text><DataRow label={language === "ar" ? "الوصول" : "Check-in"} value={`${weekdayLabel(booking.startDate, language)}، ${formatDate(booking.startDate)} · ${formatTime(booking.startTime)}`} align={align} colors={colors} /><DataRow label={language === "ar" ? "المغادرة" : "Check-out"} value={`${weekdayLabel(booking.endDate, language)}، ${formatDate(booking.endDate)} · ${formatTime(booking.endTime)}`} align={align} colors={colors} /><DataRow label={language === "ar" ? "نوع ووقت الفترة" : "Period and time"} value={`${periodDescription} · ${formatTime(booking.startTime)} — ${formatTime(booking.endTime)}`} align={align} colors={colors} /></View>
              <View style={[styles.receiptRows, { borderColor: colors.border }]}><Text style={{ color: colors.foreground, fontWeight: "800", textAlign: align }}>{language === "ar" ? "ملخص الإيجار" : "Rental summary"}</Text><View style={[styles.rentalGrid, { flexDirection: row }]}><ReceiptMetric label={language === "ar" ? "الإجمالي" : "Total"} value={formatMoney(grossRental, settings.currency)} colors={colors} align={align} /><ReceiptMetric label={language === "ar" ? "المدفوع" : "Paid"} value={formatMoney(totalPaid(booking), settings.currency)} colors={colors} align={align} accentColor={colors.success} /><ReceiptMetric label={language === "ar" ? "المتبقي" : "Remaining"} value={formatMoney(rentalBalance, settings.currency)} colors={colors} align={align} accentColor={rentalBalance > 0 ? colors.warning : colors.success} /></View></View>
              <View style={[styles.receiptRows, { borderColor: colors.border }]}><Text style={{ color: colors.foreground, fontWeight: "800", textAlign: align }}>{language === "ar" ? "التأمين" : "Deposit"}</Text><View style={[styles.rentalGrid, { flexDirection: row }]}><ReceiptMetric label={language === "ar" ? "المسجل" : "Recorded"} value={formatMoney(depositRecorded, settings.currency)} colors={colors} align={align} /><ReceiptMetric label={language === "ar" ? "المسترد" : "Refunded"} value={formatMoney(depositRefunded, settings.currency)} colors={colors} align={align} accentColor={colors.success} /><ReceiptMetric label={language === "ar" ? "قيد الحيازة" : "Held"} value={formatMoney(depositHeld, settings.currency)} colors={colors} align={align} accentColor={depositHeld > 0 ? colors.warning : colors.success} /></View></View>
              {booking.notes ? <View style={[styles.receiptNote, { backgroundColor: colors.surfaceMuted }]}><Text style={{ color: colors.muted, fontSize: 11, textAlign: align }}>{t("notes")}</Text><Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 19, marginTop: 4, textAlign: align }}>{booking.notes}</Text></View> : null}
              <Pressable disabled={sharingBookingReceipt} onPress={() => void shareDetails()} style={({ pressed }) => [styles.receiptShare, { backgroundColor: bookingChalet?.color ?? colors.primary, opacity: pressed || sharingBookingReceipt ? 0.62 : 1 }]}><MaterialIcons name={sharingBookingReceipt ? "hourglass-top" : "share"} size={19} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "800" }}>{sharingBookingReceipt ? (language === "ar" ? "جاري تجهيز الإيصال" : "Preparing receipt") : (language === "ar" ? "مشاركة الإيصال" : "Share receipt")}</Text></Pressable>
            </ScrollView>
          </GlowGlassCard>
        </View>
      </Modal>
      </View>
    </ScreenContainer>
  );
}

function TemplateManager({ visible, language, isRTL, colors, selected, draft, previewOpen, previewMessage, onClose, onSelect, onDraftChange, onPreview, onSave, onRestoreDefault }: { visible: boolean; language: "ar" | "en"; isRTL: boolean; colors: ReturnType<typeof useColors>; selected: ManagedTemplateItem; draft: string; previewOpen: boolean; previewMessage: string; onClose: () => void; onSelect: (item: ManagedTemplateItem) => void; onDraftChange: (value: string) => void; onPreview: () => void; onSave: () => void; onRestoreDefault: () => void }) {
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const iconFor = (item: ManagedTemplateItem) => item === "confirmation" ? "event-available" : item === "arrival" ? "login" : item === "checkout" ? "logout" : item === "contract" ? "description" : "format-list-numbered";
  const labelFor = (item: ManagedTemplateItem) => whatsappSendItemLabel(item, language);
  const variables = selected === "arrival" ? "{العميل} · {الشاليه} · {الوصول} · {الموقع} · {الحارس}" : selected === "checkout" ? "{العميل} · {الشاليه} · {المغادرة}" : selected === "contract" ? "{العميل} · {الشاليه} · {المرجع} · {الوصول} · {المغادرة} · {التأمين}" : selected === "terms" ? (language === "ar" ? "كل سطر سيظهر كبند مستقل." : "Each line becomes a separate term.") : "{العميل} · {الشاليه} · {الفترة} · {الوصول} · {المغادرة} · {الإجمالي}";
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <GlassModalMotion><GlowGlassCard radius={28} intensity={22} style={{ maxHeight: "91%", borderRadius: 28 }} contentStyle={{ paddingHorizontal: 16, paddingTop: 17 }}>
          <ScrollView contentContainerStyle={styles.paymentSheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.sheetHeader, { flexDirection: row }]}>
              <View style={styles.flex}>
                <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "900", textAlign: align }}>{language === "ar" ? "إدارة القوالب" : "Manage templates"}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: align }}>{language === "ar" ? "عدّل النصوص التي تصل للضيف، ثم عاينها ببيانات هذا الحجز." : "Edit guest messages, then preview them with this booking's data."}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق إدارة القوالب" : "Close template manager"} onPress={onClose} style={[styles.sheetClose, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 14 }}>
              <View style={{ flexDirection: row, gap: 7 }}>
                {MANAGED_TEMPLATE_ITEMS.map((item) => {
                  const active = item === selected;
                  return <Pressable key={item} onPress={() => onSelect(item)} style={({ pressed }) => [{ minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", gap: 5, flexDirection: "row", backgroundColor: active ? colors.primary + "16" : colors.surfaceMuted, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name={iconFor(item)} size={15} color={active ? colors.primary : colors.muted} /><Text style={{ color: active ? colors.primary : colors.foreground, fontSize: 11, fontWeight: "900" }}>{labelFor(item)}</Text></Pressable>;
                })}
              </View>
            </ScrollView>
            <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: align }}>{labelFor(selected)}</Text>
            <Text style={{ color: colors.primary, fontSize: 11, lineHeight: 18, marginTop: 5, textAlign: align }}>{variables}</Text>
            <TextInput value={draft} onChangeText={onDraftChange} multiline textAlignVertical="top" placeholderTextColor={colors.muted} style={[styles.input, { minHeight: 190, paddingTop: 13, backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.foreground, textAlign: align }]} />
            <View style={[{ gap: 8, marginTop: 12 }, { flexDirection: row }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "استعادة النص الافتراضي" : "Restore default text"} onPress={onRestoreDefault} style={({ pressed }) => [{ flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", gap: 5, flexDirection: "row", backgroundColor: colors.warning + "10", borderColor: colors.warning + "6A", opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="restart-alt" size={17} color={colors.warning} /><Text style={{ color: colors.warning, fontSize: 12, fontWeight: "900" }}>{language === "ar" ? "استعادة الافتراضي" : "Restore default"}</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حفظ القالب" : "Save template"} onPress={onSave} style={({ pressed }) => [{ flex: 1, minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", gap: 6, flexDirection: "row", backgroundColor: colors.success, opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="save" size={18} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{language === "ar" ? "حفظ القالب" : "Save template"}</Text></Pressable>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "معاينة القالب" : "Preview template"} onPress={onPreview} style={({ pressed }) => [{ minHeight: 44, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", gap: 6, flexDirection: "row", marginTop: 8, backgroundColor: colors.primary + "10", borderColor: colors.primary + "65", opacity: pressed ? 0.72 : 1 }]}><MaterialIcons name="visibility" size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900" }}>{language === "ar" ? (previewOpen ? "إخفاء المعاينة" : "معاينة") : (previewOpen ? "Hide preview" : "Preview")}</Text></Pressable>
            {previewOpen ? <View style={{ borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 12, backgroundColor: colors.primary + "0C", borderColor: colors.primary + "46" }}><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "معاينة للضيف" : "Guest preview"}</Text><Text selectable style={{ color: colors.foreground, fontSize: 13, lineHeight: 23, marginTop: 8, textAlign: align }}>{previewMessage}</Text></View> : null}
          </ScrollView>
        </GlowGlassCard></GlassModalMotion>
      </View>
    </Modal>
  );
}

function WhatsAppComposer({ visible, sending, language, isRTL, colors, modules, selectedModules, previewOpen, previewMessage, phoneWarning, onClose, onToggleModule, onPreview, onClosePreview, onSend, onManageTemplates }: { visible: boolean; sending: boolean; language: "ar" | "en"; isRTL: boolean; colors: ReturnType<typeof useColors>; modules: readonly WhatsAppMessageModule[]; selectedModules: WhatsAppMessageModule[]; previewOpen: boolean; previewMessage: string; phoneWarning: string | null; onClose: () => void; onToggleModule: (module: WhatsAppMessageModule) => void; onPreview: () => void; onClosePreview: () => void; onSend: () => void; onManageTemplates: () => void }) {
  const row = isRTL ? "row-reverse" : "row";
  const align = isRTL ? "right" : "left";
  const iconFor = (module: WhatsAppMessageModule) => module === "arrival" ? "login" : module === "checkout" ? "logout" : "verified-user";

  return <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !sending && onClose()}>
      <View style={styles.sheetBackdrop}>
        <GlassModalMotion><GlowGlassCard radius={28} intensity={22} style={styles.cancellationSheet} contentStyle={{ paddingHorizontal: 16, paddingTop: 17, paddingBottom: 28 }}>
          <View style={[styles.sheetHeader, { flexDirection: row }]}> 
            <View style={styles.flex}>
              <Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "800", textAlign: align }}>{language === "ar" ? "إرسال عبر واتساب" : "Send with WhatsApp"}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 18, textAlign: align }}>{language === "ar" ? "تُضاف تفاصيل الحجز مرة واحدة تلقائيًا؛ اختر فقط الوحدات الإضافية التي تريدها." : "Booking details are included once automatically; choose only the optional blocks you need."}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 0 }}>
              <Pressable disabled={sending} accessibilityRole="button" accessibilityLabel={language === "ar" ? "فتح إدارة القوالب" : "Open template manager"} onPress={onManageTemplates} style={({ pressed }) => [{ minHeight: 34, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", gap: 4, flexDirection: "row", backgroundColor: colors.primary + "10", borderColor: colors.primary + "60", opacity: pressed || sending ? 0.58 : 1 }]}><MaterialIcons name="edit-note" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "إدارة القوالب" : "Templates"}</Text></Pressable>
              <Pressable disabled={sending} accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق إرسال واتساب" : "Close WhatsApp sender"} onPress={onClose} style={[styles.sheetClose, { backgroundColor: colors.surfaceMuted, opacity: sending ? 0.5 : 1 }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable>
            </View>
          </View>
          <View style={[{ minHeight: 56, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, alignItems: "center", gap: 9, marginTop: 12, backgroundColor: colors.primary + "0D", borderColor: colors.primary + "58" }, { flexDirection: row }]}>
            <View style={[styles.depositIcon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="article" size={19} color={colors.primary} /></View>
            <View style={styles.flex}><Text style={{ color: colors.primary, fontWeight: "900", textAlign: align }}>{language === "ar" ? "الترويسة الأساسية" : "Base header"}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? "تُضاف تلقائيًا مرة واحدة إلى الرسالة" : "Added automatically once to the message"}</Text></View>
            <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.success + "18" }}><Text style={{ color: colors.success, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "تلقائية" : "Auto"}</Text></View>
          </View>
          {phoneWarning ? <View style={[{ marginTop: 9, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, flexDirection: row, alignItems: "center", gap: 7 }, { backgroundColor: colors.error + "10", borderColor: colors.error + "66" }]}><MaterialIcons name="warning-amber" size={19} color={colors.error} /><Text style={{ flex: 1, color: colors.error, fontSize: 11, lineHeight: 17, fontWeight: "800", textAlign: align }}>{phoneWarning}</Text></View> : null}
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 15, marginBottom: 7, textAlign: align }}>{language === "ar" ? "وحدات اختيارية" : "Optional modules"}</Text>
          <View style={{ gap: 8 }}>
            {modules.map((module) => {
              const selected = selectedModules.includes(module);
              return <Pressable key={module} disabled={sending} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={whatsAppMessageModuleLabel(module, language)} onPress={() => onToggleModule(module)} style={({ pressed }) => [{ minHeight: 51, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, alignItems: "center", gap: 9, borderColor: selected ? colors.success : colors.border, backgroundColor: selected ? colors.success + "12" : colors.surfaceMuted, flexDirection: row, opacity: pressed || sending ? 0.65 : 1 }]}>
                <MaterialIcons name={selected ? "check-box" : "check-box-outline-blank"} size={21} color={selected ? colors.success : colors.muted} />
                <MaterialIcons name={iconFor(module)} size={18} color={selected ? colors.success : colors.primary} />
                <Text style={[styles.flex, { color: selected ? colors.success : colors.foreground, fontWeight: "800", textAlign: align }]}>{whatsAppMessageModuleLabel(module, language)}</Text>
              </Pressable>;
            })}
          </View>
          <Pressable disabled={sending} onPress={onPreview} style={({ pressed }) => [{ minHeight: 47, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, marginTop: 12, backgroundColor: colors.primary + "0D", borderColor: colors.primary + "60", opacity: pressed || sending ? 0.6 : 1 }]}><MaterialIcons name="visibility" size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "900" }}>{language === "ar" ? "معاينة الرسالة النهائية" : "Preview final message"}</Text></Pressable>
          <TouchableOpacity disabled={sending || Boolean(phoneWarning)} activeOpacity={0.72} onPress={onSend} style={{ minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 9, backgroundColor: colors.success, opacity: sending || phoneWarning ? 0.55 : 1 }}><MaterialIcons name={sending ? "hourglass-top" : "send"} size={19} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{sending ? (language === "ar" ? "جارٍ فتح واتساب" : "Opening WhatsApp") : (language === "ar" ? "فتح واتساب ومراجعة الإرسال" : "Open WhatsApp to review and send")}</Text></TouchableOpacity>
        </GlowGlassCard></GlassModalMotion>
      </View>
    </Modal>
    <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={onClosePreview}>
      <View style={styles.sheetBackdrop}>
        <GlassModalMotion><GlowGlassCard radius={28} intensity={22} style={{ maxHeight: "78%", borderRadius: 28 }} contentStyle={{ paddingHorizontal: 16, paddingTop: 17, paddingBottom: 28 }}>
          <View style={[styles.sheetHeader, { flexDirection: row }]}>
            <View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900", textAlign: align }}>{language === "ar" ? "معاينة الرسالة النهائية" : "Final message preview"}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{language === "ar" ? "ترويسة واحدة مع الوحدات المختارة" : "One header with selected modules"}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق المعاينة" : "Close preview"} onPress={onClosePreview} style={[styles.sheetClose, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable>
          </View>
          <ScrollView style={[{ maxHeight: 350, borderWidth: 1, borderRadius: 14, marginTop: 15 }, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]} contentContainerStyle={{ padding: 14 }} showsVerticalScrollIndicator={false}><Text selectable style={{ color: colors.foreground, fontSize: 13, lineHeight: 23, textAlign: align }}>{previewMessage}</Text></ScrollView>
          <Pressable onPress={onClosePreview} style={({ pressed }) => [{ minHeight: 47, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 13 }, { backgroundColor: colors.primary, opacity: pressed ? 0.72 : 1 }]}><Text style={{ color: colors.background, fontWeight: "900" }}>{language === "ar" ? "العودة للاختيارات" : "Back to options"}</Text></Pressable>
        </GlowGlassCard></GlassModalMotion>
      </View>
    </Modal>
  </>;
}

function DataRow({ label, value, align, colors }: { label: string; value: string; align: "left" | "right"; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.dataRow}><Text style={{ color: colors.muted, fontSize: 11, textAlign: align }}>{label}</Text><Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: "800", fontSize: 13, marginTop: 3, textAlign: align }}>{value}</Text></View>;
}

function Financial({ value, label, colors, align, primary = false, accentColor }: { value: string; label: string; colors: ReturnType<typeof useColors>; align: "left" | "right"; primary?: boolean; accentColor?: string }) {
  return <View style={styles.financial}><Text numberOfLines={1} style={{ color: accentColor ?? (primary ? colors.primary : colors.foreground), fontWeight: "800", fontSize: 13, textAlign: align }}>{value}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 4, textAlign: align }}>{label}</Text></View>;
}

function DepositMetric({ label, value, colors, align, accentColor }: { label: string; value: string; colors: ReturnType<typeof useColors>; align: "left" | "right"; accentColor?: string }) {
  return <View style={styles.depositMetric}><Text numberOfLines={1} style={{ color: accentColor ?? colors.foreground, fontSize: 11, fontWeight: "800", textAlign: align }}>{value}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 9, marginTop: 3, textAlign: align }}>{label}</Text></View>;
}

function ReceiptMetric({ label, value, colors, align, accentColor }: { label: string; value: string; colors: ReturnType<typeof useColors>; align: "left" | "right"; accentColor?: string }) {
  return <View style={{ flex: 1, minWidth: 0, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 7, backgroundColor: colors.surfaceMuted }}><Text numberOfLines={1} style={{ color: accentColor ?? colors.foreground, fontWeight: "800", fontSize: 12, textAlign: align }}>{value}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 9, marginTop: 4, textAlign: align }}>{label}</Text></View>;
}

function ActionButton({ label, colors, accentColor, onPress, disabled = false }: { label: string; colors: ReturnType<typeof useColors>; accentColor?: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity disabled={disabled} activeOpacity={0.72} onPress={onPress} style={[styles.primaryAction, { backgroundColor: accentColor ?? colors.primary, opacity: disabled ? 0.62 : 1 }]}><MaterialIcons name={disabled ? "hourglass-top" : "payments"} size={19} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "800" }}>{label}</Text></TouchableOpacity>;
}

function QuickAction({ label, icon, colors, onPress, success = false, accentColor }: { label: string; icon: "receipt-long" | "edit" | "phone" | "chat" | "description"; colors: ReturnType<typeof useColors>; onPress: () => void; success?: boolean; accentColor?: string }) {
  const actionColor = accentColor ?? (success ? colors.success : colors.primary);
  return <TouchableOpacity activeOpacity={0.72} onPress={onPress} style={[styles.quickAction, { backgroundColor: actionColor + "16", borderColor: actionColor + "70" }]}><MaterialIcons name={icon} size={18} color={actionColor} /><Text numberOfLines={1} style={{ color: actionColor, fontSize: 10, fontWeight: "800" }}>{label}</Text></TouchableOpacity>;
}

const paymentFormStyles = StyleSheet.create({
  paymentAmountRow: { width: "100%", alignItems: "stretch", gap: 7, marginTop: 10 },
  paymentAmountInput: { flex: 0.36, minWidth: 0, minHeight: 48, marginTop: 0, paddingHorizontal: 10, borderWidth: 1 },
  paymentAmountNoteInput: { flex: 1, minWidth: 0, minHeight: 48, marginTop: 0, paddingHorizontal: 10 },
  paymentAmountCaption: { fontSize: 9, lineHeight: 14, fontWeight: "700", marginTop: 4 },
  paymentMethodRow: { flexWrap: "nowrap" },
  paymentMethodRowOption: { flex: 1, flexBasis: 0, width: "auto", minWidth: 0, minHeight: 44, paddingHorizontal: 4, gap: 3 },
});

// The existing style object includes repeated legacy keys with identical definitions.
// @ts-ignore — the final definition deliberately retains the same runtime appearance.
// eslint-disable-next-line no-dupe-keys
const styles = StyleSheet.create({ detailScreen: { flex: 1 }, content: { padding: 16, paddingBottom: 32 }, flex: { flex: 1, minWidth: 0 }, notFound: { flex: 1, justifyContent: "center", padding: 20 }, titleRow: { alignItems: "center", gap: 12 }, back: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 }, heroCard: { borderWidth: 1, borderRadius: 20, padding: 14, marginTop: 14, elevation: 2, shadowColor: "#0B1F1B", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, heroTop: { alignItems: "flex-start", gap: 9 }, typeMark: { width: 5, minHeight: 50, borderRadius: 3, flexShrink: 0 }, identityNameRow: { width: "100%", alignItems: "center", justifyContent: "space-between", gap: 8 }, identityName: { flex: 1, minWidth: 0, fontSize: 21, fontWeight: "800" }, identityPhone: { fontSize: 12, writingDirection: "ltr", marginTop: 4 }, status: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4, maxWidth: "34%", alignSelf: "flex-start" }, schedule: { borderRadius: 14, padding: 11, marginTop: 12, gap: 8 }, periodIdentityGrid: { width: "100%", alignItems: "center", gap: 6 }, periodIdentityItem: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 36, borderRadius: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, paddingHorizontal: 5 }, periodChaletItem: { borderWidth: 1, borderColor: "transparent" }, periodTypeItem: { borderWidth: 1 }, periodReferenceItem: { borderWidth: 1 }, dataRow: { gap: 1 }, creationInfo: { minHeight: 52, borderWidth: 1, borderRadius: 13, alignItems: "center", gap: 9, paddingHorizontal: 11, marginTop: 12 }, creationInfoIcon: { width: 31, height: 31, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 }, financialCard: { borderWidth: 1, borderRadius: 15, padding: 11, marginTop: 13 }, financialCardHeader: { alignItems: "center", justifyContent: "space-between", gap: 8 }, rentalGrid: { gap: 7, marginTop: 11 }, financial: { flex: 1, minWidth: 0 }, netRentalNote: { fontSize: 10, marginTop: 10 }, depositCard: { borderWidth: 1, borderRadius: 18, padding: 12, marginTop: 12 }, depositHeader: { alignItems: "center", gap: 9 }, depositIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 }, depositState: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 }, depositGrid: { gap: 7, marginTop: 12 }, depositMetric: { flex: 1, minWidth: 0, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 7, backgroundColor: "rgba(148, 163, 184, 0.08)" }, depositQuickRefund: { minHeight: 40, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 }, refundForm: { marginTop: 2 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, marginTop: 10 }, primaryAction: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 13 }, timelineCard: { borderWidth: 1, borderRadius: 18, padding: 12, marginTop: 12 }, timelineHeader: { alignItems: "center", gap: 9, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#DCE8E4" }, timelineRow: { gap: 10, paddingTop: 12 }, timelineTrack: { width: 24, alignItems: "center", flexShrink: 0 }, timelineDot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" }, timelineLine: { width: 1, flex: 1, minHeight: 15, marginTop: 3 }, timelineAmountBlock: { alignItems: "flex-start", justifyContent: "flex-start", flexShrink: 0 }, timelineReceipt: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4, marginTop: 7 }, paymentTrigger: { minHeight: 60, borderWidth: 1, borderRadius: 16, alignItems: "center", gap: 10, paddingHorizontal: 13, marginTop: 12 }, quickActions: { gap: 6, marginTop: 13 }, quickAction: { flex: 1, minWidth: 0, minHeight: 54, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 3 }, bookingActionPair: { gap: 8, borderWidth: 1, borderRadius: 16, padding: 8, marginTop: 12 }, editBookingAction: { flex: 1, minWidth: 0, minHeight: 48, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 7 }, cancelBookingAction: { flex: 1, minWidth: 0, minHeight: 48, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 7 }, successToast: { position: "absolute", top: 12, left: 16, right: 16, zIndex: 20, minHeight: 50, borderRadius: 14, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, elevation: 6, shadowOpacity: 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, sheetBackdrop: { flex: 1, backgroundColor: "rgba(7, 20, 18, 0.58)", justifyContent: "flex-end" }, paymentSheet: { maxHeight: "92%", borderWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 17 }, paymentSheetContent: { paddingBottom: 28 }, paymentMethodLabel: { fontSize: 13, fontWeight: "800", marginTop: 16 }, paymentMethodGrid: { flexWrap: "wrap", gap: 7, marginTop: 8 }, paymentMethodOption: { width: "48%", minHeight: 42, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, paddingHorizontal: 7 }, receiptAttachment: { borderWidth: 1, borderRadius: 14, alignItems: "center", gap: 10, padding: 10, marginTop: 10 }, receiptPreview: { width: 54, height: 54, borderRadius: 10, flexShrink: 0 }, receiptPlaceholder: { width: 54, height: 54, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 }, receiptActions: { gap: 6, flexWrap: "wrap", marginTop: 8 }, receiptAction: { minHeight: 30, borderRadius: 8, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3 }, cancellationSheet: { borderWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 17, paddingBottom: 28 }, cancellationReason: { minHeight: 96, paddingTop: 13 }, cancelConfirmAction: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 13 }, sheetHeader: { alignItems: "center", gap: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#DCE8E4" }, sheetClose: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 }, receiptPreviewBackdrop: { flex: 1, backgroundColor: "rgba(7, 20, 18, 0.72)", alignItems: "center", justifyContent: "center", padding: 20 }, receiptPreviewSheet: { width: "100%", maxWidth: 420, maxHeight: "82%", borderWidth: 1, borderRadius: 20, padding: 14 }, receiptPreviewLarge: { width: "100%", height: 420, marginTop: 14, borderRadius: 14 }, receiptBackdrop: { flex: 1, backgroundColor: "rgba(7, 20, 18, 0.58)", justifyContent: "flex-end" }, receiptSheet: { maxHeight: "88%", borderWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 17, paddingHorizontal: 16 }, receiptHeader: { alignItems: "center", gap: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#DCE8E4" }, receiptClose: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 }, receiptPreviewBackdrop: { flex: 1, backgroundColor: "rgba(7, 20, 18, 0.72)", alignItems: "center", justifyContent: "center", padding: 20 }, receiptPreviewSheet: { width: "100%", maxWidth: 420, maxHeight: "82%", borderWidth: 1, borderRadius: 20, padding: 14 }, receiptPreviewLarge: { width: "100%", height: 420, marginTop: 14, borderRadius: 14 }, receiptBackdrop: { flex: 1, backgroundColor: "rgba(7, 20, 18, 0.58)", justifyContent: "flex-end" }, receiptSheet: { maxHeight: "88%", borderWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 17, paddingHorizontal: 16 }, receiptHeader: { alignItems: "center", gap: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#DCE8E4" }, receiptClose: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 }, receiptContent: { paddingTop: 16, paddingBottom: 30 }, receiptStatus: { alignItems: "center", gap: 10, borderRadius: 16, padding: 13 }, receiptRows: { gap: 13, borderWidth: 1, borderRadius: 17, padding: 14, marginTop: 13 }, receiptNote: { borderRadius: 14, padding: 12, marginTop: 13 }, receiptShare: { minHeight: 51, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 16 } });
