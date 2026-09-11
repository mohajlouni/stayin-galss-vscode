import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, ToastAndroid, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookingDatePicker } from "@/components/booking-date-picker";
import { RipplePressable } from "@/components/ripple-pressable";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenBackButton } from "@/components/screen-back-button";
import { GlowGlassCard } from "@/components/glow-glass-card";
import { WheelTimePicker } from "@/components/ui/WheelTimePicker";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { Booking, BookingType, Chalet, CommissionType, LedgerPaymentMethod, Payment, PaymentMethod, PaymentRecipientType, abstractPaymentMethodOptions, activeOwnerTreasuryAccounts, activeStaffFloatAccounts, bookingShiftLabel, bookingToWaitlistEntry, bookingTypeForShift, bookingTypeLabel, calculateCollectionCommission, daysCount, durationLabel, formatMoney, getChaletShifts, isBookingPeriodEndedToday, isBookingStartDatePast, isFlexibleShift, isInvalidTimeOrder, ledgerPaymentMethod, legacyShiftIdForBookingType, localDateISO, nextUpcomingBookingGap, propertyTypeIcon, remainingAmount, reservedPeriodColorKeyForShift, resolvedBookingPrice, suggestNearestAvailableCheckout, toPositiveFiniteAmount, weekdayLabel } from "@/lib/booking-model";
import { isBookingDateMaintenanceBlocked } from "@/lib/maintenance-blocks";
import { hasBookingConflict } from "@/services/availabilityService";
import { configuredBookingPrice } from "@/services/pricingService";
import { useBookings } from "@/lib/booking-store";
import { validateBookingInput } from "@/lib/booking-validation";
import { customerVipLabel, customerVipTier, findCustomerByPhone, isBlacklistedCustomer } from "@/lib/customers";
import { useChaletScope } from "@/lib/chalet-scope";
import { useI18n } from "@/lib/i18n";
import { COUNTRY_DIALING_CODES, countryForInternationalPhone, DEFAULT_COUNTRY_DIALING_CODE, normalizeInternationalPhone, type CountryDialingCode } from "@/lib/phone-number";
import { trpc } from "@/lib/trpc";

function timeToMinutes(value: string) { const [hour, minute] = value.split(":").map(Number); return (hour || 0) * 60 + (minute || 0); }

type RecipientChoice = { id: string; type: PaymentRecipientType; userId?: number; name: string; cliqAlias?: string | null; bankDetails?: string | null; commissionRate?: string | null; commissionType?: CommissionType | null; floatId?: string; entityId: string; subAccountId?: string; kind?: "vault" | "cliq" | "bank" | "other"; detail?: string; isDefault?: boolean; cashAvailable: boolean; cliqAvailable: boolean; bankAvailable: boolean; otherAvailable: boolean };
const COUNTRY_FLAGS: Record<CountryDialingCode["iso"], string> = { JO: "🇯🇴", SA: "🇸🇦", AE: "🇦🇪", KW: "🇰🇼", QA: "🇶🇦", OM: "🇴🇲", BH: "🇧🇭", EG: "🇪🇬", PS: "🇵🇸", IQ: "🇮🇶", TR: "🇹🇷", US: "🇺🇸", GB: "🇬🇧" };
function localPhoneDigits(value: string, country: CountryDialingCode) { return value.startsWith(country.code) ? value.slice(country.code.length) : value.replace(/^\+/, ""); }

export default function BookingForm() {
  const { id, mode, extend, waitlistId, date: presetDate, bookingType: presetBookingType, shiftId: presetShiftId, chaletId: presetChaletId, copyFromId } = useLocalSearchParams<{ id?: string; mode?: "waitlist"; extend?: "true"; waitlistId?: string; date?: string; bookingType?: BookingType; shiftId?: string; chaletId?: string; copyFromId?: string }>();
  const { bookings, waitlist, chalets, settings, specialPriceRules, hydrated, customers, addBooking, updateBooking, addWaitlist, promoteWaitlist, replaceConflictsAndSave, maintenanceTasks } = useBookings();
  const { selectedChaletId } = useChaletScope();
  const { t, language } = useI18n();
  const { triggerHaptic, formatDate, formatHijriDate, formatTime, showHijriDate, deviceSettings } = useAppPreferences();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const existing = bookings.find((booking) => booking.id === id);
  const sourceWaitlist = waitlist.find((entry) => entry.id === waitlistId && entry.status !== "cancelled");
  const cloneSource = !existing && !sourceWaitlist ? bookings.find((booking) => booking.id === copyFromId) : undefined;
  const isWaitlistMode = mode === "waitlist" && !existing;
  const isArabic = language === "ar";
  const align = isArabic ? "right" : "left";
  const row = isArabic ? "row-reverse" : "row";
  const rentRow: "row" | "row-reverse" = isArabic ? "row-reverse" : "row";
  const stayRow: "row" | "row-reverse" = isArabic ? "row" : "row-reverse";
  const initialPhone = existing?.phone ?? sourceWaitlist?.phone ?? cloneSource?.phone ?? "";
  const [name, setName] = useState(existing?.customerName ?? sourceWaitlist?.customerName ?? cloneSource?.customerName ?? "");
  const [phoneCountry, setPhoneCountry] = useState<CountryDialingCode>(() => initialPhone.startsWith("+") ? countryForInternationalPhone(initialPhone) : DEFAULT_COUNTRY_DIALING_CODE);
  const [phone, setPhone] = useState(() => localPhoneDigits(initialPhone, initialPhone.startsWith("+") ? countryForInternationalPhone(initialPhone) : DEFAULT_COUNTRY_DIALING_CODE));
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const validPresetChaletId = typeof presetChaletId === "string" && chalets.some((chalet) => chalet.id === presetChaletId) ? presetChaletId : undefined;
  const [chaletId, setChaletId] = useState(existing?.chaletId ?? sourceWaitlist?.chaletId ?? cloneSource?.chaletId ?? validPresetChaletId ?? selectedChaletId ?? (chalets.length === 1 ? chalets[0].id : ""));
  const validPresetDate = typeof presetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(presetDate) ? presetDate : undefined;
  const validPresetType = presetBookingType && ["morning", "evening", "24h"].includes(presetBookingType) ? presetBookingType : undefined;
  const [startDate, setStartDate] = useState(existing?.startDate ?? sourceWaitlist?.requestedDate ?? validPresetDate ?? localDateISO());
  const [endDate, setEndDate] = useState(existing?.endDate ?? sourceWaitlist?.endDate ?? sourceWaitlist?.requestedDate ?? validPresetDate ?? localDateISO());
  const [type, setType] = useState<BookingType>(existing?.bookingType ?? sourceWaitlist?.bookingType ?? cloneSource?.bookingType ?? validPresetType ?? "morning");
  const [shiftId, setShiftId] = useState(existing?.shiftId ?? sourceWaitlist?.shiftId ?? cloneSource?.shiftId ?? presetShiftId ?? (validPresetType ? legacyShiftIdForBookingType(validPresetType) ?? "" : ""));
  const [startTime, setStartTime] = useState(existing?.startTime ?? sourceWaitlist?.startTime ?? cloneSource?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(existing?.endTime ?? sourceWaitlist?.endTime ?? cloneSource?.endTime ?? "21:00");
  const [price, setPrice] = useState(existing ? String(existing.price + Number(existing.discountAmount ?? 0)) : sourceWaitlist ? String(sourceWaitlist.price ?? "") : cloneSource ? String(cloneSource.price + Number(cloneSource.discountAmount ?? 0)) : "");
  const [priceIsManual, setPriceIsManual] = useState(Boolean(existing || sourceWaitlist || cloneSource));
  const [depositAmount, setDepositAmount] = useState(existing ? String(existing.depositAmount ?? 0) : sourceWaitlist ? String(sourceWaitlist.depositAmount ?? 0) : cloneSource ? String(cloneSource.depositAmount ?? 0) : "");
  const [discountAmount, setDiscountAmount] = useState(existing ? String(existing.discountAmount ?? 0) : "");
  const [initialPayment, setInitialPayment] = useState("");
  const [initialPaymentMethod, setInitialPaymentMethod] = useState<PaymentMethod | null>(null);
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<PaymentMethod | null>(existing?.depositPaymentMethod ?? sourceWaitlist?.depositPaymentMethod ?? cloneSource?.depositPaymentMethod ?? null);
  const [initialRecipientId, setInitialRecipientId] = useState(existing?.payments[0]?.recipientType === "owner" ? "owner" : existing?.payments[0]?.handlerUserId ? `member-${existing.payments[0].handlerUserId}` : "owner");
  const [depositRecipientId, setDepositRecipientId] = useState(existing?.depositCollection?.recipientType === "owner" ? "owner" : existing?.depositCollection?.handlerUserId ? `member-${existing.depositCollection.handlerUserId}` : "owner");
  const [initialPaymentMethodError, setInitialPaymentMethodError] = useState(false);
  const [depositPaymentMethodError, setDepositPaymentMethodError] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [phoneSubmitError, setPhoneSubmitError] = useState(false);
  const [unitError, setUnitError] = useState(false);
  const [priceError, setPriceError] = useState(false);
  const [depositCollectLater, setDepositCollectLater] = useState(Boolean(existing && Number(existing.depositAmount ?? 0) > 0 && !existing.depositPaymentMethod && !existing.depositCollection));
  const [notes, setNotes] = useState(existing?.notes ?? sourceWaitlist?.notes ?? "");
  const [pickerTarget, setPickerTarget] = useState<"start" | "end" | null>(extend === "true" && existing ? "end" : null);
  const [timeWheelOpen, setTimeWheelOpen] = useState<"start" | "end" | null>(null);
  const [timeError, setTimeError] = useState(false);
  const [lastCheckedEndDate, setLastCheckedEndDate] = useState(existing?.endDate ?? localDateISO());
  const [conflictDecision, setConflictDecision] = useState<"options" | "confirm-replace" | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const beginSubmit = () => { if (submittingRef.current) return false; submittingRef.current = true; setIsSubmitting(true); return true; };
  const endSubmit = () => { submittingRef.current = false; setIsSubmitting(false); };
  const notifyBookingSaved = () => {
    const message = language === "ar" ? "تم حفظ الحجز بنجاح" : "Booking saved successfully";
    if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
    else Alert.alert(language === "ar" ? "تم الحفظ" : "Saved", message);
  };
  const [clock, setClock] = useState(() => Date.now());
  const [cloneApplied, setCloneApplied] = useState(false);
  const normalizedPhone = useMemo(() => normalizeInternationalPhone(phone, phoneCountry.code), [phone, phoneCountry.code]);
  const matchingCustomer = useMemo(() => findCustomerByPhone(customers ?? [], normalizedPhone.value ?? undefined), [customers, normalizedPhone.value]);
  const blacklistedBlocked = useMemo(() => isBlacklistedCustomer(customers ?? [], normalizedPhone.value ?? phone, existing ? findCustomerByPhone(customers ?? [], existing.phone)?.id : undefined), [customers, existing, normalizedPhone.value, phone]);
  const lastAutofill = useRef("");
  useEffect(() => {
    if (!matchingCustomer || !normalizedPhone.value) return;
    const shouldAutofill = !name.trim() || name.trim() === lastAutofill.current;
    if (shouldAutofill && matchingCustomer.name && matchingCustomer.name !== name) { setName(matchingCustomer.name); lastAutofill.current = matchingCustomer.name; }
  }, [matchingCustomer, name, normalizedPhone.value]);
  const collectionRecipients = trpc.workspace.collectionRecipients.useQuery(undefined, { retry: false });
  const recipientChoices = useMemo<RecipientChoice[]>(() => {
    const owner = collectionRecipients.data?.find((member) => member.role === "owner");
    const ownerOptions: RecipientChoice[] = activeOwnerTreasuryAccounts(settings).map((account) => ({ id: `owner:${account.id}`, type: "owner", userId: owner?.userId, name: language === "ar" ? "حساب المالك الرئيسي" : "Master account", entityId: "owner", subAccountId: account.id, kind: account.kind, detail: account.detail, isDefault: account.isDefault === true, cashAvailable: account.kind === "vault", cliqAvailable: account.kind === "cliq", bankAvailable: account.kind === "bank", otherAvailable: account.kind === "other" }));
    const managerPaidReceivers: RecipientChoice[] = (collectionRecipients.data ?? []).filter((member) => member.role !== "owner").map((member) => ({ id: `member-${member.userId}`, type: member.role === "guest" ? "guard" as const : "staff" as const, userId: member.userId, name: member.displayName, cliqAlias: member.cliqAlias, bankDetails: member.bankDetails, commissionRate: member.commissionRate, commissionType: member.commissionType, entityId: `member-${member.userId}`, detail: member.cliqAlias ?? member.bankDetails ?? undefined, cashAvailable: true, cliqAvailable: Boolean(member.cliqAlias), bankAvailable: Boolean(member.bankDetails), otherAvailable: false }));
    const floatOptions: RecipientChoice[] = activeStaffFloatAccounts(settings).flatMap((account) => {
      const type: PaymentRecipientType = account.entity === "guard" ? "guard" : "staff";
      const channels = (account.channels ?? []).filter((channel) => channel.isActive !== false);
      const cash: RecipientChoice[] = account.cashActive === true ? [{ id: `float:${account.id}:cash`, type, userId: account.memberUserId, name: account.memberName ?? account.label, floatId: account.id, entityId: `float-${account.id}`, subAccountId: account.id, kind: "vault", cashAvailable: true, cliqAvailable: false, bankAvailable: false, otherAvailable: false }] : [];
      const cliqChannels = channels.filter((channel) => channel.kind === "cliq");
      const bankChannels = channels.filter((channel) => channel.kind === "bank");
      const cliq: RecipientChoice[] = cliqChannels.length > 0 ? cliqChannels.map((channel, index) => ({ id: `float:${account.id}:cliq:${index}`, type, userId: account.memberUserId, name: account.memberName ?? account.label, floatId: account.id, entityId: `float-${account.id}`, subAccountId: `${account.id}#cliq#${index}`, kind: "cliq", detail: channel.alias, isDefault: channel.isDefault === true, cashAvailable: false, cliqAvailable: true, bankAvailable: false, otherAvailable: false })) : (account.cliqAlias ? [{ id: `float:${account.id}:cliq`, type, userId: account.memberUserId, name: account.memberName ?? account.label, floatId: account.id, entityId: `float-${account.id}`, subAccountId: `${account.id}#cliq`, kind: "cliq", detail: account.cliqAlias, cashAvailable: false, cliqAvailable: true, bankAvailable: false, otherAvailable: false }] : []);
      const bank: RecipientChoice[] = bankChannels.length > 0 ? bankChannels.map((channel, index) => ({ id: `float:${account.id}:bank:${index}`, type, userId: account.memberUserId, name: account.memberName ?? account.label, floatId: account.id, entityId: `float-${account.id}`, subAccountId: `${account.id}#bank#${index}`, kind: "bank", detail: channel.iban ?? channel.alias, isDefault: channel.isDefault === true, cashAvailable: false, cliqAvailable: false, bankAvailable: true, otherAvailable: false })) : (account.bankDetails ? [{ id: `float:${account.id}:bank`, type, userId: account.memberUserId, name: account.memberName ?? account.label, floatId: account.id, entityId: `float-${account.id}`, subAccountId: `${account.id}#bank`, kind: "bank", detail: account.bankDetails, cashAvailable: false, cliqAvailable: false, bankAvailable: true, otherAvailable: false }] : []);
      const other: RecipientChoice[] = account.hasOther === true ? [{ id: `float:${account.id}:other`, type, userId: account.memberUserId, name: account.memberName ?? account.label, floatId: account.id, entityId: `float-${account.id}`, subAccountId: `${account.id}#other`, kind: "other", cashAvailable: false, cliqAvailable: false, bankAvailable: false, otherAvailable: true }] : [];
      return [...cash, ...cliq, ...bank, ...other];
    });
    return [...ownerOptions, ...managerPaidReceivers, ...floatOptions];
  }, [collectionRecipients.data, language, settings]);
  const recipientsForMethod = useMemo<Record<LedgerPaymentMethod, RecipientChoice[]>>(() => {
    const buckets: Record<LedgerPaymentMethod, RecipientChoice[]> = { CASH: [], CLIQ: [], IBAN: [], OTHER: [] };
    const flags: Record<LedgerPaymentMethod, "cashAvailable" | "cliqAvailable" | "bankAvailable" | "otherAvailable"> = { CASH: "cashAvailable", CLIQ: "cliqAvailable", IBAN: "bankAvailable", OTHER: "otherAvailable" };
    (Object.keys(buckets) as LedgerPaymentMethod[]).forEach((key) => { buckets[key] = recipientChoices.filter((recipient) => recipient[flags[key]]); });
    return buckets;
  }, [recipientChoices]);
  const methodRecipients = (method: PaymentMethod | null | undefined): RecipientChoice[] => recipientsForMethod[ledgerPaymentMethod(method ?? undefined) ?? "CASH"] ?? [];
  const recipientIdForMethod = (method: PaymentMethod | null | undefined) => { const list = methodRecipients(method); return (list.find((recipient) => recipient.isDefault === true) ?? list[0])?.id ?? "owner"; };
  const paymentAccountLabel = (method: PaymentMethod, recipient: RecipientChoice) => {
    const ledger = ledgerPaymentMethod(method) ?? "CASH";
    const detail = recipient.detail ?? (ledger === "CLIQ" ? recipient.cliqAlias : ledger === "IBAN" ? recipient.bankDetails : undefined);
    if (recipient.type === "owner") {
      if (ledger === "CLIQ") return detail || (language === "ar" ? "حساب CliQ للمالك" : "Owner CliQ account");
      if (ledger === "IBAN") return detail || (language === "ar" ? "الحساب البنكي للمالك" : "Owner bank account");
      return detail || recipient.name;
    }
    if (recipient.floatId) {
      if (ledger === "CLIQ") return detail || (language === "ar" ? "بيانات CliQ غير مكتملة" : "CliQ details missing");
      if (ledger === "IBAN") return detail || (language === "ar" ? "بيانات بنكية غير مكتملة" : "Bank details missing");
      if (ledger === "OTHER") return language === "ar" ? `بطاقة / دفع إلكتروني على ذمة ${recipient.name}` : `Card / electronic payment held by ${recipient.name}`;
      return language === "ar" ? `كاش على ذمة ${recipient.name} (عهدة)` : `Cash as float held by ${recipient.name}`;
    }
    if (ledger === "CLIQ") return detail || (language === "ar" ? "بيانات CliQ غير مكتملة" : "CliQ details missing");
    if (ledger === "IBAN") return detail || (language === "ar" ? "بيانات بنكية غير مكتملة" : "Bank details missing");
    if (ledger === "OTHER") return language === "ar" ? `بطاقة / دفع إلكتروني بيد ${recipient.name}` : `Card / electronic payment held by ${recipient.name}`;
    return language === "ar" ? `نقدًا بيد ${recipient.name}` : `Cash held by ${recipient.name}`;
  };
  const buildCollectionPayment = (id: string, amount: number, method: PaymentMethod, recipientId: string, note: string): Payment => {
    const recipient = recipientChoices.find((item) => item.id === recipientId) ?? methodRecipients(method)[0];
    const rate = recipient?.commissionRate === null || recipient?.commissionRate === undefined || recipient?.commissionRate === "" ? undefined : Number(recipient.commissionRate);
    const commissionType = recipient?.commissionType === "fixed" ? "fixed" : "percent";
    return { id, amount, date: localDateISO(), recordedAt: new Date().toISOString(), note, paymentMethod: method, recipientType: recipient?.type ?? "owner", recipientTargetId: recipient?.entityId ?? "owner", recipientEntityId: recipient?.entityId ?? "owner", recipientSubAccountId: recipient?.subAccountId, isCustody: recipient ? recipient.type !== "owner" : false, handlerUserId: recipient?.userId, handlerName: recipient?.name, recipientAccountLabel: recipient ? paymentAccountLabel(method, recipient) : undefined, calculatedCommission: calculateCollectionCommission(amount, rate, commissionType) || undefined, commissionType: rate === undefined ? undefined : commissionType };
  };
  const selectedChalet = useMemo(() => chalets.find((chalet) => chalet.id === chaletId), [chalets, chaletId]);
  const chaletShifts = useMemo(() => getChaletShifts(selectedChalet, settings), [selectedChalet, settings]);
  const selectedShift = useMemo(() => chaletShifts.find((shift) => shift.id === shiftId) ?? chaletShifts.find((shift) => shift.isActive) ?? chaletShifts[0], [chaletShifts, shiftId]);
  const selectableShifts = useMemo(() => chaletShifts.filter((shift) => shift.isActive || shift.id === existing?.shiftId || shift.id === sourceWaitlist?.shiftId || shift.id === cloneSource?.shiftId), [chaletShifts, cloneSource?.shiftId, existing?.shiftId, sourceWaitlist?.shiftId]);
  const today = localDateISO(new Date(clock));
  const flexibleSlot = Boolean(selectedShift && isFlexibleShift(selectedShift));

  useEffect(() => { const interval = setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(interval); }, []);

  useEffect(() => { if (!initialPaymentMethod) return; if (!methodRecipients(initialPaymentMethod).some((recipient) => recipient.id === initialRecipientId)) setInitialRecipientId(recipientIdForMethod(initialPaymentMethod)); }, [initialPaymentMethod, initialRecipientId, recipientsForMethod]);
  useEffect(() => { if (!depositPaymentMethod || depositCollectLater) return; if (!methodRecipients(depositPaymentMethod).some((recipient) => recipient.id === depositRecipientId)) setDepositRecipientId(recipientIdForMethod(depositPaymentMethod)); }, [depositPaymentMethod, depositRecipientId, depositCollectLater, recipientsForMethod]);

  useEffect(() => {
    if (!cloneSource || cloneApplied || existing || sourceWaitlist) return;
    setName(cloneSource.customerName);
    const clonedCountry = cloneSource.phone.startsWith("+") ? countryForInternationalPhone(cloneSource.phone) : DEFAULT_COUNTRY_DIALING_CODE;
    setPhoneCountry(clonedCountry);
    setPhone(localPhoneDigits(cloneSource.phone, clonedCountry));
    setChaletId(cloneSource.chaletId ?? "");
    setType(cloneSource.bookingType);
    setShiftId(cloneSource.shiftId ?? legacyShiftIdForBookingType(cloneSource.bookingType) ?? "");
    setStartTime(cloneSource.startTime);
    setEndTime(cloneSource.endTime);
    setPrice(String(cloneSource.price + Number(cloneSource.discountAmount ?? 0)));
    setPriceIsManual(true);
    setDepositAmount(String(cloneSource.depositAmount ?? 0));
    setDepositPaymentMethod(cloneSource.depositPaymentMethod ?? null);
    setCloneApplied(true);
  }, [cloneApplied, cloneSource, existing, sourceWaitlist]);

  useEffect(() => {
    if (!chaletShifts.length) return;
    const current = chaletShifts.find((shift) => shift.id === shiftId);
    if (!current) setShiftId(legacyShiftIdForBookingType(validPresetType ?? type) && chaletShifts.some((shift) => shift.id === legacyShiftIdForBookingType(validPresetType ?? type)) ? legacyShiftIdForBookingType(validPresetType ?? type)! : (chaletShifts.find((shift) => shift.isActive) ?? chaletShifts[0]).id);
  }, [chaletShifts, shiftId, type, validPresetType]);
  useEffect(() => { if (!existing && !cloneSource && !sourceWaitlist && selectedShift) { if (!flexibleSlot) { setStartTime(selectedShift.startTime); setEndTime(selectedShift.endTime); } if (type !== "multi-day") setType(bookingTypeForShift(selectedShift.id)); } }, [cloneSource, existing, flexibleSlot, selectedShift, sourceWaitlist, type]);
  useEffect(() => {
    if (!existing && !sourceWaitlist) {
      const date = validPresetDate ?? localDateISO();
      setStartDate(date);
      setEndDate(date);
      if (validPresetType) { setType(validPresetType); setShiftId(presetShiftId ?? legacyShiftIdForBookingType(validPresetType) ?? ""); }
    }
  }, [existing, id, mode, presetShiftId, sourceWaitlist, validPresetDate, validPresetType]);
  useEffect(() => { if (extend === "true" && existing) setPickerTarget("end"); }, [existing, extend]);
  useEffect(() => { if (!existing && !cloneSource && !sourceWaitlist && validPresetChaletId) setChaletId(validPresetChaletId); }, [cloneSource, existing, sourceWaitlist, validPresetChaletId]);
  useEffect(() => { if (!existing && !cloneSource && selectedChaletId) setChaletId(selectedChaletId); }, [cloneSource, existing, selectedChaletId]);
  useEffect(() => { if (!existing && !cloneSource && chalets.length === 1) setChaletId(chalets[0].id); }, [chalets, cloneSource, existing]);
  useEffect(() => {
    if (!hydrated || !waitlistId || sourceWaitlist) return;
    Alert.alert(language === "ar" ? "انتهى طلب الانتظار" : "Waitlist request expired", language === "ar" ? "انتهى وقت هذا الطلب وتم إلغاؤه تلقائيًا؛ لا يمكن تحويله إلى حجز." : "This request expired and was cancelled automatically, so it cannot be promoted.", [{ text: language === "ar" ? "حسنًا" : "OK", onPress: () => router.back() }]);
  }, [hydrated, language, sourceWaitlist, waitlistId]);
  const multiDayRange = daysCount(startDate, endDate) >= 2;
  useEffect(() => { if (multiDayRange && type !== "multi-day") setType("multi-day"); if (!multiDayRange && type === "multi-day") setType(bookingTypeForShift(shiftId)); }, [multiDayRange, shiftId, type]);
  const automaticPrice = useMemo(() => configuredBookingPrice({ bookingType: multiDayRange ? "multi-day" : bookingTypeForShift(shiftId), shiftId, startDate, endDate }, settings, selectedChalet, specialPriceRules), [endDate, multiDayRange, selectedChalet, settings, shiftId, specialPriceRules, startDate]);
  useEffect(() => { if (!existing && !cloneSource && !priceIsManual && chaletId) setPrice(automaticPrice > 0 ? String(automaticPrice) : ""); }, [automaticPrice, chaletId, cloneSource, existing, priceIsManual]);
  useEffect(() => { if (!existing && !cloneSource && flexibleSlot) setPriceIsManual(true); }, [cloneSource, existing, flexibleSlot]);
  const draft = useMemo(() => {
    const rentalTotal = Math.max(0, resolvedBookingPrice(automaticPrice, price, priceIsManual) - Math.max(0, Number(discountAmount || 0)));
    const pendingInitialPayment = Number(initialPayment) > 0 && initialPaymentMethod ? [buildCollectionPayment("pending-initial-payment", Number(initialPayment), initialPaymentMethod, initialRecipientId, language === "ar" ? "الدفعة الأولى من الإيجار" : "Initial rental payment")] : [];
    const depositValue = Number(depositAmount || 0);
    const resolvedDepositMethod = existing?.depositPaymentMethod ?? (!depositCollectLater && depositValue > 0 ? depositPaymentMethod ?? undefined : undefined);
    const depositCollection = !existing && !sourceWaitlist && depositValue > 0 && resolvedDepositMethod ? buildCollectionPayment("pending-security-deposit", depositValue, resolvedDepositMethod, depositRecipientId, language === "ar" ? "تأمين مسترد" : "Refundable security deposit") : existing?.depositCollection;
    return { id: existing?.id ?? "", customerName: name, phone: normalizedPhone.value ?? phone, chaletId: chaletId || undefined, chaletName: selectedChalet?.name ?? existing?.chaletName, startDate, endDate, bookingType: multiDayRange ? "multi-day" : bookingTypeForShift(shiftId), shiftId: selectedShift?.id, shiftName: selectedShift?.name, shiftColor: selectedShift?.color, startTime, endTime, price: rentalTotal, discountAmount: Number(discountAmount || 0), depositAmount: depositValue, depositPaymentMethod: resolvedDepositMethod, depositPaymentRecordedAt: resolvedDepositMethod ? existing?.depositPaymentRecordedAt ?? sourceWaitlist?.depositPaymentRecordedAt : undefined, depositCollection, payments: existing?.payments ?? sourceWaitlist?.payments ?? pendingInitialPayment, notes, status: existing?.status ?? "confirmed", createdAt: existing?.createdAt ?? new Date().toISOString() } as Booking;
  }, [automaticPrice, chaletId, cloneSource, depositAmount, depositCollectLater, depositPaymentMethod, depositRecipientId, discountAmount, endDate, existing, initialPayment, initialPaymentMethod, initialRecipientId, language, multiDayRange, name, normalizedPhone.value, notes, phone, price, priceIsManual, recipientChoices, selectedChalet?.name, selectedShift?.color, selectedShift?.id, selectedShift?.name, settings.paymentRouting?.ownerAccounts, shiftId, sourceWaitlist, startDate, startTime, endTime]);
  const remaining = remainingAmount(draft);
  const hasValidPrice = Number.isFinite(Number(price)) && Number(price) > 0;
  const invalidPhone = Boolean(phone.trim() && normalizedPhone.error);
  const missingItems = [!name.trim() ? (language === "ar" ? "اسم العميل" : "customer name") : null, !chaletId ? (language === "ar" ? "الشاليه" : "chalet") : null, !hasValidPrice ? (language === "ar" ? "سعر الفترة" : "period price") : null, invalidPhone ? (language === "ar" ? "رقم هاتف صحيح" : "valid phone") : null].filter(Boolean) as string[];
  const bookingReady = missingItems.length === 0;
  const dockSummary = bookingReady
    ? `${selectedChalet?.name ?? draft.chaletName ?? ""} · ${formatDate(startDate)} · ${bookingShiftLabel(draft, settings, language)} · ${formatMoney(draft.price, settings.currency)}`
    : language === "ar"
      ? `أكمل: ${missingItems.join("، ")}${!hasValidPrice && automaticPrice <= 0 ? " — أدخل السعر يدويًا أو حدده من الإعدادات" : ""}`
      : `Complete: ${missingItems.join(", ")}${!hasValidPrice && automaticPrice <= 0 ? " — enter a price or configure it in Settings" : ""}`;
  const conflicts = useMemo(() => bookings.filter((booking) => booking.id !== existing?.id && booking.status !== "cancelled" && booking.status !== "waitlisted" && hasBookingConflict(draft, [booking])), [bookings, draft, existing?.id]);
  const flexibleTimeConflict = flexibleSlot && conflicts.length > 0;
  const upcomingGap = useMemo(() => flexibleSlot ? nextUpcomingBookingGap(draft, bookings, existing?.id) : null, [bookings, draft, existing?.id, flexibleSlot]);
  const bufferWarning = Boolean(upcomingGap && upcomingGap.gapMinutes < 90);
  useEffect(() => { if (!conflicts.length) setConflictDecision(null); }, [conflicts.length]);
  useEffect(() => {
    if (endDate === lastCheckedEndDate) return;
    setLastCheckedEndDate(endDate);
    const conflict = conflicts[0];
    if (!conflict) return;
    const suggestedEndDate = suggestNearestAvailableCheckout(draft, bookings, existing?.id);
    const suggestionText = suggestedEndDate ? (language === "ar" ? `\n\nأقرب تاريخ مغادرة متاح: ${formatDate(suggestedEndDate)}` : `\n\nNearest available checkout: ${formatDate(suggestedEndDate)}`) : "";
    const conflictDetails = language === "ar"
      ? `العميل: ${conflict.customerName}\nالشاليه: ${conflict.chaletName ?? "غير محدد"}\nالإقامة: ${formatDate(conflict.startDate)} — ${formatDate(conflict.endDate)}\nالوقت: ${formatTime(conflict.startTime)} — ${formatTime(conflict.endTime)}${suggestionText}\n\nاختر تاريخًا آخر أو استخدم قائمة الانتظار عند الحفظ.`
      : `Guest: ${conflict.customerName}\nChalet: ${conflict.chaletName ?? "Not specified"}\nStay: ${formatDate(conflict.startDate)} — ${formatDate(conflict.endDate)}\nTime: ${formatTime(conflict.startTime)} — ${formatTime(conflict.endTime)}${suggestionText}\n\nChoose another date or use the waitlist when saving.`;
    const actions = suggestedEndDate
      ? [{ text: language === "ar" ? "إبقاء التاريخ" : "Keep date", style: "cancel" as const }, { text: language === "ar" ? "استخدام التاريخ المقترح" : "Use suggested date", onPress: () => setEndDate(suggestedEndDate) }]
      : [{ text: language === "ar" ? "إبقاء التاريخ" : "Keep date", style: "cancel" as const }];
    Alert.alert(language === "ar" ? "تعارض في تاريخ المغادرة" : "Checkout conflict", conflictDetails, actions);
  }, [bookings, conflicts, draft, endDate, existing?.id, formatDate, formatTime, language, lastCheckedEndDate]);

  const savedBooking = (id: string): Booking => ({ ...draft, id, status: "confirmed", payments: existing || Number(initialPayment) <= 0 ? draft.payments : draft.payments.map((payment) => payment.id === "pending-initial-payment" ? { ...payment, id: `p-${Date.now()}` } : payment), depositCollection: draft.depositCollection?.id === "pending-security-deposit" ? { ...draft.depositCollection, id: `d-${Date.now()}` } : draft.depositCollection });
  const saveConfirmed = async () => {
    if (!beginSubmit()) return;
    try {
      await triggerHaptic();
      const validation = validateBookingInput(draft);
      if (!validation.ok) {
        Alert.alert(language === "ar" ? "تعذر حفظ الحجز" : "Could not save booking", validation.message);
        return;
      }
      const next = savedBooking(existing?.id ?? `b-${Date.now()}`);
      if (existing) {
        await updateBooking(next);
        notifyBookingSaved();
        router.replace({ pathname: "/booking-detail", params: { id: next.id, updated: "1" } } as never);
        return;
      }
      else if (waitlistId && !sourceWaitlist) throw new Error("waitlist-expired");
      else if (sourceWaitlist) await promoteWaitlist(sourceWaitlist.id, next);
      else await addBooking(next);
      notifyBookingSaved();
      router.back();
    } catch (error) {
      const expired = error instanceof Error && error.message === "waitlist-expired";
      Alert.alert(expired ? (language === "ar" ? "انتهى طلب الانتظار" : "Waitlist request expired") : (language === "ar" ? "تعذر حفظ الحجز" : "Could not save booking"), expired ? (language === "ar" ? "انتهى وقت الطلب وتم إلغاؤه تلقائيًا، لذلك لا يمكن تحويله إلى حجز." : "The request expired and was cancelled automatically, so it cannot be promoted.") : (language === "ar" ? "تعذر حفظ الحجز. حاول مرة أخرى." : "The booking could not be saved. Please try again."));
    } finally {
      endSubmit();
    }
  };
  const saveToWaitlist = async () => {
    if (!beginSubmit()) return;
    try {
      await triggerHaptic();
      await addWaitlist(bookingToWaitlistEntry(savedBooking(`b-${Date.now()}`)));
      Alert.alert(language === "ar" ? "تمت الإضافة إلى قائمة الانتظار" : "Added to waitlist", language === "ar" ? "تم حفظ الطلب بكل تفاصيل الحجز، ولن يُحسب حجزًا مؤكدًا قبل تحويله لاحقًا." : "The request was saved with all booking details and will not count as confirmed until promoted.");
      router.back();
    } finally {
      endSubmit();
    }
  };
  const addConflictToWaitlist = async () => {
    if (submittingRef.current || conflictBusy) return;
    if (sourceWaitlist) {
      setConflictDecision(null);
      router.back();
      return;
    }
    if (!beginSubmit()) return;
    setConflictBusy(true);
    try {
      await triggerHaptic();
      await addWaitlist(bookingToWaitlistEntry(savedBooking(`b-${Date.now()}`)));
      setConflictDecision(null);
      router.back();
    } catch {
      Alert.alert(language === "ar" ? "تعذر الحفظ" : "Could not save", language === "ar" ? "تعذر حفظ الطلب في قائمة الانتظار. حاول مرة أخرى." : "The request could not be saved to the waitlist. Please try again.");
    } finally {
      setConflictBusy(false);
      endSubmit();
    }
  };
  const replaceConflictingBookings = async () => {
    if (submittingRef.current || conflictBusy) return;
    if (!beginSubmit()) return;
    setConflictBusy(true);
    try {
      await triggerHaptic();
      const next = savedBooking(existing?.id ?? `b-${Date.now()}`);
      if (sourceWaitlist) await promoteWaitlist(sourceWaitlist.id, next, conflicts.map((item) => item.id));
      else await replaceConflictsAndSave(conflicts.map((item) => item.id), next);
      setConflictDecision(null);
      router.back();
    } catch {
      Alert.alert(language === "ar" ? "تعذر الاستبدال" : "Could not replace", language === "ar" ? "تعذر استبدال الحجز المتعارض. حاول مرة أخرى." : "The conflicting booking could not be replaced. Please try again.");
    } finally {
      setConflictBusy(false);
      endSubmit();
    }
  };
  const save = async () => {
    if (submittingRef.current) return;
    const rentalPrice = toPositiveFiniteAmount(price);
    const discount = toPositiveFiniteAmount(discountAmount ?? "");
    const deposit = toPositiveFiniteAmount(depositAmount ?? "");
    const initial = toPositiveFiniteAmount(initialPayment);
    if (!name.trim() || !chaletId || !startDate || !endDate) { setNameError(!name.trim()); setUnitError(!chaletId); return Alert.alert(language === "ar" ? "بيانات ناقصة" : "Missing data", language === "ar" ? "أدخل اسم العميل والشاليه والتاريخ والسعر." : "Enter the customer name, chalet, dates, and price."); }
    if (phone.trim() && normalizedPhone.error) { setPhoneSubmitError(true); return Alert.alert(language === "ar" ? "رقم هاتف غير صحيح" : "Invalid phone number", language === "ar" ? "أدخل رقمًا محليًا صحيحًا بعد اختيار رمز الدولة." : "Enter a valid local number after selecting the country code."); }
    if (blacklistedBlocked) return Alert.alert(language === "ar" ? "عميل محظور" : "Blacklisted customer", language === "ar" ? "هذا الرقم مدرج في القائمة السوداء ولا يمكن إتمام الحجز له. إذا كان قرار الحظر خاطئًا فتوجه إلى إدارة العملاء." : "This number is on the blacklist and cannot be booked. If the block is a mistake, go to Customer CRM to unblock.");
    if (!rentalPrice) { setPriceError(true); return Alert.alert(language === "ar" ? "مبلغ إيجار غير صحيح" : "Invalid rental amount", language === "ar" ? "يجب أن يكون مبلغ الإيجار رقمًا موجبًا أكبر من صفر." : "Rental amount must be a positive number greater than zero."); }
    const discountIsInvalid = discount !== null && (discount < 0 || discount >= rentalPrice);
    const depositIsInvalid = deposit !== null && deposit < 0;
    const initialIsInvalid = initialPayment?.trim() !== "" && initial === null;
    if (discountIsInvalid || depositIsInvalid || initialIsInvalid) return Alert.alert(language === "ar" ? "مبلغ غير صحيح" : "Invalid amount", language === "ar" ? "تحقق من الخصم والتأمين والدفعة الأولى؛ يجب أن تكون الأرقام صالحة والمبالغ المدخلة موجبة." : "Check discount, deposit, and initial payment; values must be valid and entered amounts must be positive.");
    if (!existing && initial !== null && initial > 0 && !initialPaymentMethod) { setInitialPaymentMethodError(true); return Alert.alert(language === "ar" ? "اختر طريقة الدفعة الأولى" : "Choose initial payment method", language === "ar" ? "لا يمكن حفظ الحجز قبل اختيار طريقة دفع الدفعة الأولى." : "Choose the initial payment method before saving."); }
    if (!existing && deposit !== null && deposit > 0 && !depositCollectLater && !depositPaymentMethod) { setDepositPaymentMethodError(true); return Alert.alert(language === "ar" ? "اختر طريقة استلام التأمين" : "Choose deposit method", language === "ar" ? "لا يمكن حفظ الحجز قبل اختيار طريقة استلام التأمين." : "Choose the deposit collection method before saving."); }
    if (!existing && initial !== null && initial > 0 && initialPaymentMethod && methodRecipients(initialPaymentMethod).length === 0) return Alert.alert(language === "ar" ? "لا يوجد حساب استلام" : "No recipient account", language === "ar" ? "لا توجد حسابات مفعلة تستقبل هذه الطريقة — فعّلها من إعدادات طرق الدفع أولًا." : "No active accounts accept this method. Enable one in payment settings first.");
    if (!existing && deposit !== null && deposit > 0 && !depositCollectLater && depositPaymentMethod && methodRecipients(depositPaymentMethod).length === 0) return Alert.alert(language === "ar" ? "لا يوجد حساب استلام" : "No recipient account", language === "ar" ? "لا توجد حسابات مفعلة تستقبل هذه الطريقة — فعّلها من إعدادات طرق الدفع أولًا." : "No active accounts accept this method. Enable one in payment settings first.");
    if (!existing && isBookingStartDatePast(draft, clock)) return Alert.alert(language === "ar" ? "تاريخ غير متاح" : "Unavailable date", language === "ar" ? "لا يمكن إنشاء حجز بتاريخ يسبق تاريخ اليوم." : "A booking cannot be created for a date before today.");
    if (!existing && isBookingPeriodEndedToday(draft, clock)) return Alert.alert(language === "ar" ? "انتهت الفترة اليوم" : "Period has ended", language === "ar" ? "انتهى وقت هذه الفترة اليوم؛ اختر فترة لاحقة أو تاريخ الغد." : "This period has ended today. Choose a later period or tomorrow.");
    if (isInvalidTimeOrder(draft)) return Alert.alert(language === "ar" ? "وقت غير صحيح" : "Invalid time", language === "ar" ? "وقت الخروج يجب أن يكون بعد وقت الدخول." : "End time must be after start time.");
    if (isWaitlistMode) return saveToWaitlist();
    if (chaletId) {
      const periodKey = selectedShift ? reservedPeriodColorKeyForShift(selectedShift) : "overnight";
      const blockedOnStart = isBookingDateMaintenanceBlocked(maintenanceTasks ?? [], startDate, chaletId, multiDayRange || daysCount(startDate, endDate) > 1 ? "full_day" : periodKey);
      if (blockedOnStart) return Alert.alert(language === "ar" ? "وحدة محجوزة للصيانة" : "Unit under maintenance", language === "ar" ? "توجد صيانة مجدولة لهذه الوحدة في هذا الموعد ولا يمكن الحجز عليها الآن." : "This unit has scheduled maintenance at that time, so it cannot be booked right now.");
    }
    if (flexibleSlot) {
      if (!startTime.trim() || !endTime.trim() || (endDate === startDate && timeToMinutes(endTime) <= timeToMinutes(startTime))) { setTimeError(true); return Alert.alert(language === "ar" ? "أوقات غير صحيحة" : "Invalid times", language === "ar" ? "أدخل وقت وصول ووقت مغادرة صحيحين للفترة المخصصة؛ يجب أن يكون وقت المغادرة بعد وقت الوصول." : "Enter valid arrival and departure times for the custom period; departure must be after arrival."); }
      if (conflicts.length > 0) {
        const blocking = conflicts[0];
        return Alert.alert(language === "ar" ? "تعارض في الساعات" : "Time conflict", language === "ar" ? `⚠️ تعارض في الساعات: الشاليه محجوز في هذه الفترة حتى ${formatTime(blocking.endTime)}` : `⚠️ Time conflict: the chalet is booked in this period until ${formatTime(blocking.endTime)}`);
      }
    }
    if (!conflicts.length) return saveConfirmed();
    setConflictDecision("options");
  };

  const label = (text: string, required = false) => <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 14, textAlign: align }}>{text}{required ? <Text style={{ color: colors.error }}> *</Text> : null}</Text>;
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const getInputStyle = (field: string, hasError = false) => [
    styles.input,
    {
      backgroundColor: colors.background === "#070B10" ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.85)",
      borderColor: hasError ? colors.error : focusedField === field ? colors.primary : "rgba(255, 255, 255, 0.08)",
      borderTopColor: focusedField === field ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.08)",
      shadowColor: focusedField === field ? colors.primary : "transparent",
      shadowOpacity: focusedField === field ? 0.35 : 0,
      shadowRadius: focusedField === field ? 16 : 0,
      elevation: focusedField === field ? 8 : 0,
      color: colors.foreground,
      textAlign: align as "left" | "right",
      writingDirection: field === "phone" || field === "price" || field === "amount" ? "ltr" as const : undefined,
    },
  ];
  const availableShifts = selectableShifts.filter((shift) => existing || startDate !== today || !isBookingPeriodEndedToday({ startDate, endDate: startDate, bookingType: bookingTypeForShift(shift.id), shiftId: shift.id, startTime: shift.startTime, endTime: shift.endTime }, clock));
  const openDatePicker = (target: "start" | "end") => {
    if (chalets.length > 1 && !chaletId) {
      Alert.alert(language === "ar" ? "يرجى اختيار الوحدة أولاً" : "Please select a property first", language === "ar" ? "اختر الوحدة قبل فتح تاريخ الوصول أو المغادرة لعرض المواعيد المتاحة لها." : "Select a property before opening check-in or check-out to see its available dates.");
      return;
    }
    setPickerTarget(target);
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><View style={styles.screen}><ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><View style={[styles.header, { flexDirection: row }]}><ScreenBackButton fallbackHref="/(tabs)/bookings" /><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 25, fontWeight: "800", textAlign: align }}>{existing ? (language === "ar" ? "تعديل الحجز" : "Edit booking") : isWaitlistMode ? (language === "ar" ? "طلب انتظار جديد" : "New waitlist request") : t("addBooking")}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 3, textAlign: align }}>{isWaitlistMode ? (language === "ar" ? "أدخل تفاصيل الطلب كاملة؛ لن يُحسب حجزًا مؤكدًا حتى تحويله لاحقًا." : "Add the complete request details; it will not count as confirmed until promoted.") : (language === "ar" ? "أكمل الحقول المطلوبة ثم راجع الملخص." : "Complete the required fields, then review the summary.")}</Text></View></View>
    {isWaitlistMode ? <View style={[styles.waitlistInfo, { backgroundColor: colors.warning + "18" }]}><MaterialIcons name="pending-actions" size={20} color={colors.warning} /><Text style={[styles.flex, { color: colors.foreground, fontSize: 12, lineHeight: 19, textAlign: align }]}>{language === "ar" ? "سيُحفظ هذا الطلب بقائمة الانتظار حسب أولوية التسجيل، حتى لو كانت الفترة متاحة الآن." : "This request will be saved in the waitlist by registration priority, even if the period is currently available."}</Text></View> : null}
    <FormSection title={t("customerData")} icon="person" colors={colors} row={row}>
      <View style={styles.field}>{label(t("customerName"), true)}<TextInput value={name} onChangeText={(value) => { setName(value); setNameError(false); }} onFocus={() => setFocusedField("name")} onBlur={() => setFocusedField(null)} placeholder={t("customerName")} placeholderTextColor={colors.muted} style={getInputStyle("name", nameError)} />{nameError ? <Text style={{ color: colors.error, fontSize: 11, marginTop: 5, textAlign: align }}>{language === "ar" ? "أدخل اسم العميل للمتابعة" : "Enter the customer name to continue"}</Text> : null}</View>
      <View style={styles.field}>{label(t("phone"))}<View style={[styles.phoneRow, { flexDirection: row }]}><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "اختيار رمز الدولة" : "Choose country code"} onPress={() => setCountryPickerOpen(true)} style={({ pressed }) => [styles.countryCodeTrigger, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}><Text style={styles.countryFlag}>{COUNTRY_FLAGS[phoneCountry.iso]}</Text><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900", writingDirection: "ltr" }}>{phoneCountry.code}</Text><MaterialIcons name="keyboard-arrow-down" size={17} color={colors.muted} /></Pressable><TextInput value={phone} onChangeText={(value) => { setPhone(value); setPhoneSubmitError(false); }} onFocus={() => setFocusedField("phone")} onBlur={() => setFocusedField(null)} placeholder={language === "ar" ? "79 000 0000" : "79 000 0000"} placeholderTextColor={colors.muted} keyboardType="phone-pad" returnKeyType="done" blurOnSubmit onSubmitEditing={() => Keyboard.dismiss()} textAlign="left" style={[getInputStyle("phone", invalidPhone || phoneSubmitError), styles.phoneInput]} /></View>{invalidPhone ? <Text style={{ color: colors.error, fontSize: 11, marginTop: 5, textAlign: align }}>{language === "ar" ? "أدخل رقمًا محليًا صحيحًا." : "Enter a valid local number."}</Text> : phone.trim() ? <Text style={{ color: colors.muted, fontSize: 10, marginTop: 5, textAlign: align, writingDirection: "ltr" }}>{normalizedPhone.value}</Text> : null}
      {matchingCustomer && normalizedPhone.value ? <View style={[styles.crmChip, { backgroundColor: matchingCustomer.isBlacklisted ? colors.error + "12" : colors.primary + "12", borderColor: matchingCustomer.isBlacklisted ? colors.error + "66" : colors.primary + "55", flexDirection: row }]}><MaterialIcons name={matchingCustomer.isBlacklisted ? "block" : "badge"} size={15} color={matchingCustomer.isBlacklisted ? colors.error : colors.primary} /><Text numberOfLines={1} style={{ color: matchingCustomer.isBlacklisted ? colors.error : colors.primary, fontSize: 11, fontWeight: "900", flex: 1, textAlign: align }}>{matchingCustomer.isBlacklisted ? (language === "ar" ? `محظور · ${matchingCustomer.name}` : `Blacklisted · ${matchingCustomer.name}`) : matchingCustomer.name}</Text><Text style={{ color: colors.muted, fontSize: 9, fontWeight: "700" }}>{customerVipLabel(customerVipTier(matchingCustomer), language)}</Text></View> : null}
      {blacklistedBlocked ? <View style={[styles.blacklistBanner, { backgroundColor: colors.error + "16", borderColor: colors.error }]}><MaterialIcons name="gpp-bad" size={18} color={colors.error} /><Text style={{ color: colors.error, fontSize: 12, fontWeight: "900", flex: 1, textAlign: align }}>{language === "ar" ? "لا يمكن إتمام الحجز: هذا العميل مدرج في القائمة السوداء." : "Cannot complete the booking: this customer is blacklisted."}</Text></View> : null}</View>
      <View style={styles.field}>
        {label(language === "ar" ? "الوحدة العقارية" : "Property unit", true)}
        {chalets.length === 0 ? <Pressable onPress={() => router.push("/chalet-management" as never)} style={[styles.noChalet, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><Text style={{ color: colors.primary, fontWeight: "800", textAlign: align }}>{language === "ar" ? "افتح إدارة الوحدات لإضافة وحدة" : "Open property management to add a property"}</Text></Pressable> : <View><PropertyUnitSelector chalets={chalets} selected={selectedChalet} error={unitError} onChange={(nextChalet) => { setChaletId(nextChalet.id); setUnitError(false); }} colors={colors} language={language} row={row} align={align} />{unitError ? <Text style={{ color: colors.error, fontSize: 11, marginTop: 5, textAlign: align }}>{language === "ar" ? "اختر الوحدة العقارية للمتابعة" : "Select a property unit to continue"}</Text> : null}</View>}
      </View>
    </FormSection>
    <FormSection title={language === "ar" ? "تفاصيل الإقامة" : "Stay details"} icon="event" colors={colors} row={row}><View style={[styles.dateGrid, { flexDirection: stayRow }]}><StayDateCard title={language === "ar" ? "الوصول" : "Check-in"} date={startDate} colors={colors} align={align} language={language} row={row} formatDate={formatDate} showHijriDate={showHijriDate} formatHijriDate={formatHijriDate} onPress={() => openDatePicker("start")} /><StayDateCard title={language === "ar" ? "المغادرة" : "Check-out"} date={endDate} colors={colors} align={align} language={language} row={row} formatDate={formatDate} showHijriDate={showHijriDate} formatHijriDate={formatHijriDate} onPress={() => openDatePicker("end")} /></View><View style={{ flexDirection: row, alignItems: "center", justifyContent: "center", gap: 7, marginTop: 8, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 12, backgroundColor: colors.primary + "12" }}><MaterialIcons name="timelapse" size={17} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "800", fontSize: 12 }}>{language === "ar" ? "مدة الإقامة" : "Total stay"}: {durationLabel(draft, settings, language)}</Text></View><View style={[styles.staySubheader, { flexDirection: row }]}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 14 }}>{language === "ar" ? "فترة الإقامة" : "Stay shift"}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{language === "ar" ? "اختر الفترة المناسبة" : "Choose the shift"}</Text></View><View style={[styles.types, { flexDirection: row }]}>{availableShifts.map((shift) => { const selected = selectedShift?.id === shift.id; const shiftColor = shift.color; return <Pressable key={shift.id} onPress={() => { setShiftId(shift.id); setType(bookingTypeForShift(shift.id)); if (!isFlexibleShift(shift)) { setStartTime(shift.startTime); setEndTime(shift.endTime); } }} style={({ pressed }) => [styles.typeChoice, { backgroundColor: selected ? shiftColor + "18" : colors.background, borderColor: selected ? shiftColor : colors.border, opacity: pressed ? 0.72 : 1 }]}><View style={[styles.typeDot, { backgroundColor: shiftColor }]} /><Text numberOfLines={1} style={{ color: selected ? shiftColor : colors.foreground, fontWeight: "800", fontSize: 12 }}>{shift.name}</Text></Pressable>; })}</View><View style={[styles.dateGrid, { flexDirection: stayRow, marginTop: 12 }]}><View style={styles.flex}>{label(language === "ar" ? "وقت الوصول" : "Check-in time")}<TimeFieldTrigger editable={flexibleSlot} value={formatTime(startTime)} error={flexibleTimeConflict || timeError} onPress={() => { setTimeWheelOpen("start"); setFocusedField(null); }} colors={colors} language={language} row={row} align={align} /></View><View style={styles.flex}>{label(language === "ar" ? "وقت المغادرة" : "Check-out time")}<TimeFieldTrigger editable={flexibleSlot} value={formatTime(endTime)} error={flexibleTimeConflict || timeError} onPress={() => { setTimeWheelOpen("end"); setFocusedField(null); }} colors={colors} language={language} row={row} align={align} /></View></View>{flexibleSlot && timeError ? <Text style={{ color: colors.error, fontSize: 11, marginTop: 5, textAlign: align }}>{language === "ar" ? "أدخل وقت وصول ووقت مغادرة صحيحين للفترة المخصصة" : "Enter valid arrival and departure times for the custom period"}</Text> : null}{flexibleSlot && bufferWarning && upcomingGap ? <View style={[styles.bufferNote, { backgroundColor: colors.warning + "18", borderColor: colors.warning }]}><MaterialIcons name="bolt" size={16} color={colors.warning} /><Text style={[styles.flex, { color: colors.warning, fontSize: 11, fontWeight: "800", lineHeight: 17, textAlign: align }]}>{language === "ar" ? `⚡ تنبيه تشغيلي: الفترة الفاصلة للتنظيف وتجهيز الشاليه قبل الحجز القادم هي ${upcomingGap.gapMinutes} دقيقة فقط.` : `⚡ Operational: the gap for cleaning and preparing the chalet before the next booking is only ${upcomingGap.gapMinutes} minutes.`}</Text></View> : null}</FormSection>
    {!isWaitlistMode && conflicts.length > 0 ? <View style={[styles.alert, { backgroundColor: colors.error + "14", borderColor: colors.error }]}><MaterialIcons name="warning-amber" size={20} color={colors.error} /><View style={styles.flex}><Text style={{ color: colors.error, fontWeight: "800", textAlign: align }}>{language === "ar" ? (flexibleSlot ? "تعارض في الساعات" : "يوجد تعارض في الفترة المحددة") : (flexibleSlot ? "Time conflict" : "The selected period conflicts")}</Text><Text style={{ color: colors.error, fontSize: 12, lineHeight: 18, marginTop: 3, textAlign: align }}>{language === "ar" ? (flexibleSlot ? "اضبط وقت الوصول أو المغادرة حتى لا تتداخل مع حجز قائم." : "يمكنك تغيير الموعد أو اختيار الاستبدال أو قائمة الانتظار عند الحفظ.") : (flexibleSlot ? "Adjust arrival or departure so it does not overlap an existing booking." : "Change the period or choose replacement/waitlist when saving.")}</Text></View></View> : null}
    <FormSection title={language === "ar" ? "الإيجار والتأمين" : "Rental and security deposit"} icon="payments" colors={colors} row={row}>
      <View style={[styles.rentSummaryRow, { flexDirection: rentRow }]}>
        <View style={styles.rentColumn}>{label(language === "ar" ? "الإجمالي بعد الخصم" : "Total after discount")}<View style={[styles.rentFinalInput, { backgroundColor: colors.primary + "12" }]}><Text numberOfLines={1} style={[styles.rentFinalValue, { color: colors.primary, textAlign: align }]}>{formatMoney(draft.price, settings.currency)}</Text></View></View>
        <View style={styles.rentColumn}>{label(t("discount"))}<TextInput value={discountAmount} onChangeText={setDiscountAmount} onFocus={() => setFocusedField("discount")} onBlur={() => setFocusedField(null)} placeholder={language === "ar" ? "اختياري" : "Optional"} placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={getInputStyle("discount")} /></View>
        <View style={styles.rentColumn}>{label(language === "ar" ? "سعر الإيجار" : "Base rent", true)}<TextInput value={price} onChangeText={(value) => { setPriceIsManual(true); setPrice(value); setPriceError(false); }} onFocus={() => setFocusedField("price")} onBlur={() => setFocusedField(null)} placeholder="0.00 د.أ" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={getInputStyle("price", priceError)} /><Text style={{ color: colors.muted, fontSize: 10, marginTop: 4, textAlign: align }}>{priceIsManual ? (language === "ar" ? "معدل يدويًا" : "Manual") : (language === "ar" ? "حسب الفترة والتاريخ" : "By period and date")}</Text>{!existing && priceIsManual && !flexibleSlot ? <Pressable onPress={() => { setPriceIsManual(false); setPrice(automaticPrice > 0 ? String(automaticPrice) : ""); }}><Text style={{ color: colors.primary, fontWeight: "800", fontSize: 11, marginTop: 4, textAlign: align }}>{language === "ar" ? "استخدام السعر التلقائي" : "Use automatic price"}</Text></Pressable> : null}</View>
      </View>
      {!existing ? <View style={styles.field}>{label(language === "ar" ? "دفعة أولى من الإيجار (عربون)" : "Initial rental payment (deposit)")}<TextInput value={initialPayment} onChangeText={(value) => { setInitialPayment(value); if (Number(value || 0) <= 0) { setInitialPaymentMethod(null); setInitialPaymentMethodError(false); } }} onFocus={() => setFocusedField("initialPayment")} onBlur={() => setFocusedField(null)} placeholder={language === "ar" ? "اختيارية ولا تشمل التأمين" : "Optional; does not include security deposit"} placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={getInputStyle("initialPayment")} /></View> : <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 11, textAlign: align }}>{language === "ar" ? "لتسجيل دفعة جديدة من الإيجار، احفظ التعديل ثم استخدم «دفعة جديدة» من تفاصيل الحجز." : "To record a new rental payment, save these changes then use New payment in booking details."}</Text>}
      {!existing && Number(initialPayment || 0) > 0 ? <PaymentMethodChoices label={language === "ar" ? "طريقة دفع العربون" : "Rental deposit payment method"} value={initialPaymentMethod} error={initialPaymentMethodError} required onChange={(method) => { setInitialPaymentMethod(method); setInitialRecipientId(recipientIdForMethod(method)); setInitialPaymentMethodError(false); }} colors={colors} language={language} row={row} align={align} /> : null}
      {!existing && Number(initialPayment || 0) > 0 && initialPaymentMethod ? <CollectionRecipientSelector label={language === "ar" ? "حساب استلام العربون" : "Rental deposit recipient"} method={initialPaymentMethod} value={initialRecipientId} recipients={methodRecipients(initialPaymentMethod)} onChange={setInitialRecipientId} accountLabel={paymentAccountLabel} colors={colors} language={language} row={row} align={align} /> : null}
      <View style={styles.field}><View style={{ flexDirection: row, alignItems: "center", gap: 8 }}>{label(language === "ar" ? "تأمين مسترد" : "Refundable security deposit")}<Pressable accessibilityRole="checkbox" accessibilityState={{ checked: depositCollectLater }} onPress={() => setDepositCollectLater((current) => { const next = !current; if (next) { setDepositPaymentMethod(null); setDepositPaymentMethodError(false); setDepositRecipientId("owner"); } return next; })} style={({ pressed }) => [styles.depositLaterOption, { flexDirection: row, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={depositCollectLater ? "check-box" : "check-box-outline-blank"} size={17} color={depositCollectLater ? colors.primary : colors.muted} /><Text style={{ color: depositCollectLater ? colors.primary : colors.muted, fontSize: 11.5, fontWeight: "800" }}>{language === "ar" ? "التحصيل لاحقاً عند الوصول" : "Collect later at arrival"}</Text></Pressable></View><TextInput value={depositAmount} onChangeText={(value) => { setDepositAmount(value); if (Number(value || 0) <= 0) { setDepositPaymentMethod(null); setDepositPaymentMethodError(false); setDepositCollectLater(false); } }} onFocus={() => setFocusedField("depositAmount")} onBlur={() => setFocusedField(null)} placeholder={language === "ar" ? "اختياري" : "Optional"} placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={getInputStyle("depositAmount")} /></View>
      {!existing && !depositCollectLater ? <PaymentMethodChoices label={language === "ar" ? "طريقة استلام التأمين" : "Deposit collection method"} value={depositPaymentMethod} error={depositPaymentMethodError} required={Number(depositAmount || 0) > 0} hideWhenZero onChange={(method) => { setDepositPaymentMethod(method); setDepositRecipientId(recipientIdForMethod(method)); setDepositPaymentMethodError(false); }} colors={colors} language={language} row={row} align={align} /> : null}
      {!existing && !depositCollectLater && Number(depositAmount || 0) > 0 && depositPaymentMethod ? <CollectionRecipientSelector label={language === "ar" ? "حساب استلام التأمين" : "Security-deposit recipient"} method={depositPaymentMethod} value={depositRecipientId} recipients={methodRecipients(depositPaymentMethod)} onChange={setDepositRecipientId} accountLabel={paymentAccountLabel} colors={colors} language={language} row={row} align={align} /> : null}
      {depositCollectLater ? <Text style={{ color: colors.warning, fontSize: 11, marginTop: 6, textAlign: align }}>{language === "ar" ? "سيُطلب تحصيل التأمين عند وصول العميل، ولن يُسجَّل الآن إن لم يستلم." : "The deposit will be requested at guest arrival and is not recorded now unless received."}</Text> : null}
      <View style={[styles.financialResults, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}><DraftMetric label={language === "ar" ? "بعد الخصم" : "After discount"} value={formatMoney(draft.price, settings.currency)} color={colors.foreground} align={align} /><DraftMetric label={language === "ar" ? "التأمين" : "Deposit"} value={formatMoney(draft.depositAmount ?? 0, settings.currency)} color={colors.foreground} align={align} /><DraftMetric label={language === "ar" ? "المتبقي" : "Remaining"} value={formatMoney(remaining, settings.currency)} color={colors.primary} align={align} /></View>
      <View style={styles.compactNotes}>{label(t("notes"))}<TextInput value={notes} onChangeText={setNotes} onFocus={() => setFocusedField("notes")} onBlur={() => setFocusedField(null)} placeholder={t("notes")} placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={[getInputStyle("notes"), styles.notes]} /></View>
    </FormSection>
    </ScrollView><View style={[styles.actionDock, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 10) + 8 }]}><View style={[styles.dockSummary, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}><MaterialIcons name="event-available" size={17} color={colors.primary} /><Text numberOfLines={1} style={[styles.flex, { color: colors.foreground, fontSize: 12, fontWeight: "800", textAlign: align }]}>{dockSummary}</Text></View><RipplePressable rippleColor="#FFFFFF3D" onPress={save} disabled={isSubmitting} style={({ pressed }) => [styles.save, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : isSubmitting ? 0.68 : 1 }]}>{isSubmitting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialIcons name={isWaitlistMode ? "pending-actions" : "check-circle"} size={19} color="#FFFFFF" />}<Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 16 }}>{isSubmitting ? (language === "ar" ? "جارٍ الحفظ…" : "Saving…") : (isWaitlistMode ? (language === "ar" ? "إضافة إلى الانتظار" : "Add to waitlist") : t("saveBooking"))}</Text></RipplePressable><Pressable onPress={() => router.back()} style={styles.cancel}><Text style={{ color: colors.muted, fontWeight: "800" }}>{t("cancel")}</Text></Pressable></View><Modal visible={countryPickerOpen} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setCountryPickerOpen(false)}><Pressable onPress={() => setCountryPickerOpen(false)} style={styles.modalBackdrop}><Pressable onPress={() => undefined} style={[styles.countrySheet, { backgroundColor: colors.surface }]}><View style={[styles.datePickerHeader, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.foreground, fontSize: 17, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "رمز الدولة" : "Country code"}</Text><Pressable onPress={() => setCountryPickerOpen(false)} style={[styles.datePickerClose, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable></View><ScrollView contentContainerStyle={styles.countryList}>{COUNTRY_DIALING_CODES.map((country) => { const selected = country.iso === phoneCountry.iso; return <Pressable key={country.iso} onPress={() => { setPhoneCountry(country); setCountryPickerOpen(false); }} style={({ pressed }) => [styles.countryOption, { flexDirection: row, backgroundColor: selected ? colors.primary : colors.surfaceMuted, opacity: pressed ? 0.72 : 1 }]}><Text style={styles.countryFlag}>{COUNTRY_FLAGS[country.iso]}</Text><Text style={[styles.flex, { color: selected ? "#FFFFFF" : colors.foreground, fontWeight: "800", textAlign: align }]}>{language === "ar" ? country.nameAr : country.nameEn}</Text><Text style={{ color: selected ? "#FFFFFF" : colors.muted, fontWeight: "900", writingDirection: "ltr" }}>{country.code}</Text>{selected ? <MaterialIcons name="check-circle" size={19} color="#FFFFFF" /> : null}</Pressable>; })}</ScrollView></Pressable></Pressable></Modal><Modal visible={pickerTarget !== null} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setPickerTarget(null)}><View style={styles.modalBackdrop}><View style={[styles.datePickerSheet, { backgroundColor: colors.surface }]}><View style={[styles.datePickerHeader, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.foreground, fontSize: 18, fontWeight: "800", textAlign: align }]}>{pickerTarget === "start" ? (language === "ar" ? "اختر تاريخ الوصول" : "Choose check-in date") : (language === "ar" ? "اختر تاريخ المغادرة" : "Choose check-out date")}</Text><Pressable accessibilityLabel={language === "ar" ? "إغلاق محدد التاريخ" : "Close date picker"} onPress={() => setPickerTarget(null)} style={[styles.datePickerClose, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable></View>{pickerTarget ? <BookingDatePicker embedded value={pickerTarget === "start" ? startDate : endDate} onChange={(date) => { if (pickerTarget === "start") { setStartDate(date); if (endDate < date) setEndDate(date); } else if (date >= startDate) setEndDate(date); else { setStartDate(date); setEndDate(date); } setPickerTarget(null); }} bookings={bookings.filter((booking) => booking.chaletId === chaletId)} waitlist={waitlist.filter((entry) => entry.chaletId === chaletId)} rangeStart={startDate} rangeEnd={endDate} minimumDate={!existing ? today : undefined} /> : null}</View></View></Modal><WheelTimePicker visible={timeWheelOpen !== null} title={timeWheelOpen === "start" ? (language === "ar" ? "وقت الوصول" : "Check-in time") : (language === "ar" ? "وقت المغادرة" : "Check-out time")} initialTime={timeWheelOpen === "start" ? startTime : endTime} timeFormat={deviceSettings.timeFormat} language={language} onConfirm={(next) => { if (timeWheelOpen === "start") setStartTime(next); else setEndTime(next); setTimeError(false); setTimeWheelOpen(null); }} onClose={() => setTimeWheelOpen(null)} /><ConflictResolutionModal decision={conflictDecision} conflicts={conflicts} busy={conflictBusy} colors={colors} language={language} settings={settings} formatDate={formatDate} formatTime={formatTime} onClose={() => !conflictBusy && setConflictDecision(null)} onQueue={() => void addConflictToWaitlist()} onOpenReplacement={() => setConflictDecision("confirm-replace")} onBack={() => setConflictDecision("options")} onReplace={() => void replaceConflictingBookings()} /></View></ScreenContainer>;
}

function FormSection({ title, icon, children, colors, row }: { title: string; icon: "person" | "event" | "payments" | "notes"; children: React.ReactNode; colors: ReturnType<typeof useColors>; row: "row" | "row-reverse" }) { return <GlowGlassCard style={[styles.section, { borderWidth: 0, padding: 0, elevation: 0, shadowOpacity: 0 }]} contentStyle={{ padding: 11 }}><View style={[styles.sectionTitle, { flexDirection: row }]}><View style={[styles.sectionIcon, { backgroundColor: colors.glassInset }]}><MaterialIcons name={icon} size={19} color={colors.primary} /></View><Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.foreground, fontWeight: "800", fontSize: 17 }}>{title}</Text></View>{children}</GlowGlassCard>; }
function PropertyUnitSelector({ chalets, selected, onChange, colors, language, row, align, error = false }: { chalets: Chalet[]; selected?: Chalet; onChange: (chalet: Chalet) => void; colors: ReturnType<typeof useColors>; language: "ar" | "en"; row: "row" | "row-reverse"; align: "left" | "right"; error?: boolean }) {
  const [open, setOpen] = useState(false);
  const typeLabel = (chalet: Chalet) => chalet.propertyType === "farm" ? (language === "ar" ? "مزرعة" : "Farm") : chalet.propertyType === "cabin" ? (language === "ar" ? "كوخ" : "Cabin") : chalet.propertyType === "villa" ? (language === "ar" ? "فيلا" : "Villa") : chalet.propertyType === "camp" ? (language === "ar" ? "مخيم" : "Camp") : language === "ar" ? "شاليه" : "Chalet";
  const unitVisual = (chalet: Chalet, compact = false) => chalet.imageUri ? <Image source={{ uri: chalet.imageUri }} style={[styles.unitSelectorImage, compact && styles.unitSelectorImageCompact, { borderColor: chalet.color + "66" }]} /> : <View style={[styles.unitSelectorFallback, compact && styles.unitSelectorFallbackCompact, { backgroundColor: chalet.color + "16", borderColor: chalet.color + "55" }]}><MaterialIcons name={propertyTypeIcon(chalet.propertyType)} size={compact ? 18 : 22} color={chalet.color} /></View>;
  return <>
    <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.unitSelectorTrigger, { flexDirection: row, backgroundColor: colors.surfaceMuted, borderColor: error ? colors.error : undefined, opacity: pressed ? 0.72 : 1 }]}>
      {selected ? unitVisual(selected, true) : <View style={[styles.unitSelectorFallbackCompact, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="apartment" size={18} color={colors.muted} /></View>}
      <Text numberOfLines={1} style={[styles.flex, { color: selected ? colors.foreground : colors.muted, fontWeight: selected ? "800" : "500", fontSize: 13, textAlign: align }]}>{selected?.name ?? (language === "ar" ? "اختر الوحدة العقارية" : "Choose a property unit")}</Text>
      <MaterialIcons name="keyboard-arrow-down" size={22} color={selected?.color ?? colors.muted} />
    </Pressable>
    <Modal transparent visible={open} statusBarTranslucent animationType="slide" onRequestClose={() => setOpen(false)}>
      <Pressable onPress={() => setOpen(false)} style={styles.unitSelectorBackdrop}>
        <Pressable onPress={() => undefined} style={[styles.unitSelectorSheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.unitSelectorHeader, { flexDirection: row }]}><Text style={[styles.flex, { color: colors.foreground, fontSize: 17, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "اختر الوحدة العقارية" : "Choose property unit"}</Text><Pressable accessibilityLabel={language === "ar" ? "إغلاق اختيار الوحدة" : "Close unit selector"} onPress={() => setOpen(false)} style={[styles.unitSelectorClose, { backgroundColor: colors.surfaceMuted }]}><MaterialIcons name="close" size={20} color={colors.primary} /></Pressable></View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.unitSelectorList}>
            {chalets.map((chalet) => { const isSelected = chalet.id === selected?.id; return <Pressable key={chalet.id} onPress={() => { onChange(chalet); setOpen(false); }} style={({ pressed }) => [styles.unitSelectorRow, { flexDirection: row, backgroundColor: isSelected ? colors.primary : colors.surfaceMuted, opacity: pressed ? 0.72 : 1 }]}>{unitVisual(chalet)}<View style={styles.flex}><Text numberOfLines={1} style={{ color: isSelected ? "#FFFFFF" : colors.foreground, fontWeight: "900", fontSize: 14, textAlign: align }}>{chalet.name}</Text><Text numberOfLines={1} style={{ color: isSelected ? "#FFFFFFC8" : colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{typeLabel(chalet)}</Text></View><View style={[styles.unitSelectorMeta, { flexDirection: row }]}><View style={[styles.chaletColorDot, { backgroundColor: chalet.color }]} />{isSelected ? <MaterialIcons name="check-circle" size={20} color="#FFFFFF" /> : null}</View></Pressable>; })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}
function PropertyUnitChoice({ chalet, selected, onPress, colors, row, align }: { chalet: Chalet; selected: boolean; onPress: () => void; colors: ReturnType<typeof useColors>; row: "row" | "row-reverse"; align: "left" | "right" }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [unitStyles.unitChoice, { flexDirection: row, backgroundColor: selected ? chalet.color + "18" : colors.background, borderColor: selected ? chalet.color : colors.border, opacity: pressed ? 0.72 : 1 }]}>
    {chalet.imageUri ? <Image source={{ uri: chalet.imageUri }} style={[unitStyles.unitThumbnail, { borderColor: chalet.color + "66" }]} /> : <View style={[unitStyles.unitFallback, { backgroundColor: chalet.color + "16", borderColor: chalet.color + "55" }]}><MaterialIcons name={propertyTypeIcon(chalet.propertyType)} size={19} color={chalet.color} /></View>}
    <View style={styles.flex}><Text numberOfLines={1} style={{ color: selected ? chalet.color : colors.foreground, fontWeight: "900", fontSize: 12, textAlign: align }}>{chalet.name}</Text><View style={[unitStyles.unitAccent, { flexDirection: row }]}><View style={[styles.chaletColorDot, { backgroundColor: chalet.color }]} /><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 9, textAlign: align }}>{chalet.propertyType ? (chalet.propertyType === "chalet" ? "شاليه" : chalet.propertyType === "farm" ? "مزرعة" : chalet.propertyType === "cabin" ? "كوخ" : chalet.propertyType === "villa" ? "فيلا" : chalet.propertyType === "camp" ? "مخيم" : "وحدة") : "وحدة"}</Text></View></View>
    {selected ? <MaterialIcons name="check-circle" size={18} color={chalet.color} /> : null}
  </Pressable>;
}
function DraftMetric({ label, value, color, align }: { label: string; value: string; color: string; align: "left" | "right" }) { return <View style={styles.flex}><Text numberOfLines={1} style={{ color, opacity: 0.72, fontSize: 10, textAlign: align }}>{label}</Text><Text numberOfLines={1} style={{ color, fontSize: 15, fontWeight: "800", marginTop: 3, textAlign: align }}>{value}</Text></View>; }
function CollectionRecipientSelector({ label, method, value, recipients, onChange, accountLabel, colors, language, row, align }: { label: string; method: PaymentMethod; value: string; recipients: RecipientChoice[]; onChange: (recipientId: string) => void; accountLabel: (method: PaymentMethod, recipient: RecipientChoice) => string; colors: ReturnType<typeof useColors>; language: "ar" | "en"; row: "row" | "row-reverse"; align: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const selected = recipients.find((recipient) => recipient.id === value) ?? recipients[0];
  const recipientIcon = (recipient: RecipientChoice) => recipient.type === "owner" ? "account-balance" : recipient.type === "guard" ? "security" : "badge";
  const roleBadge = (recipient: RecipientChoice) => recipient.type === "owner" ? { bg: "#16A34A1F", border: "#16A34A", fg: "#16A34A", ar: "[خزينة رئيسية]", en: "[Master treasury]" } : { bg: "#F59E0B1F", border: "#F59E0B", fg: "#F59E0B", ar: "[ذمة / عهدة معلقة]", en: "[Held float / pending custody]" };
  return <View style={styles.field}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 14, textAlign: align }}>{label}</Text>{recipients.length === 0 ? <Text style={{ color: colors.warning, fontSize: 11, marginTop: 6, fontWeight: "700", textAlign: align }}>{language === "ar" ? "لا توجد حسابات مفعلة لهذه الطريقة — فعّلها من إعدادات طرق الدفع." : "No active accounts for this method — enable one in payment settings."}</Text> : null}<Pressable onPress={() => { if (recipients.length) setOpen(true); }} style={({ pressed }) => [styles.recipientTrigger, { flexDirection: row, backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.72 : 1 }]}><View style={[styles.recipientIcon, { backgroundColor: colors.primary + "16" }]}><MaterialIcons name={selected ? recipientIcon(selected) : "account-balance"} size={17} color={colors.primary} /></View><View style={styles.flex}><Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: "800", fontSize: 12, textAlign: align }}>{selected?.name ?? (language === "ar" ? "حساب المالك الرئيسي" : "Master account")}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{selected ? accountLabel(method, selected) : ""}</Text>{selected ? <View style={[styles.recipientBadge, { backgroundColor: roleBadge(selected).bg, borderColor: roleBadge(selected).border }]}><Text style={[styles.recipientBadgeText, { color: roleBadge(selected).fg }]}>{language === "ar" ? roleBadge(selected).ar : roleBadge(selected).en}</Text></View> : null}</View><MaterialIcons name="keyboard-arrow-down" size={21} color={colors.primary} /></Pressable><Modal transparent visible={open} statusBarTranslucent animationType="fade" onRequestClose={() => setOpen(false)}><Pressable onPress={() => setOpen(false)} style={styles.paymentMenuBackdrop}><Pressable onPress={() => undefined} style={[styles.paymentMenu, { backgroundColor: colors.surface }]}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{label}</Text>{recipients.map((recipient) => { const active = recipient.id === value; const commission = recipient.commissionRate && Number(recipient.commissionRate) > 0 ? ` · ${recipient.commissionType === "fixed" ? recipient.commissionRate : `${recipient.commissionRate}%`} ${language === "ar" ? "عمولة" : "commission"}` : ""; return <Pressable key={recipient.id} onPress={() => { onChange(recipient.id); setOpen(false); }} style={({ pressed }) => [styles.paymentMenuOption, { flexDirection: row, backgroundColor: active ? colors.primary : colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.recipientIcon, { backgroundColor: active ? "#FFFFFF24" : colors.surfaceMuted }]}><MaterialIcons name={recipientIcon(recipient)} size={17} color={active ? "#FFFFFF" : colors.muted} /></View><View style={styles.flex}><Text style={{ color: active ? "#FFFFFF" : colors.foreground, fontWeight: "800", textAlign: align }}>{recipient.name}</Text><Text numberOfLines={1} style={{ color: active ? "#FFFFFFC8" : colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{accountLabel(method, recipient)}{commission}</Text><View style={[styles.recipientBadge, { backgroundColor: roleBadge(recipient).bg, borderColor: roleBadge(recipient).border }]}><Text style={[styles.recipientBadgeText, { color: roleBadge(recipient).fg }]}>{language === "ar" ? roleBadge(recipient).ar : roleBadge(recipient).en}</Text></View></View>{active ? <MaterialIcons name="check-circle" size={19} color="#FFFFFF" /> : null}</Pressable>; })}</Pressable></Pressable></Modal></View>;
}
function PaymentMethodChoices({ label, value, error, required, hideWhenZero = false, onChange, colors, language, row, align }: { label: string; value: PaymentMethod | null; error: boolean; required: boolean; hideWhenZero?: boolean; onChange: (method: PaymentMethod) => void; colors: ReturnType<typeof useColors>; language: "ar" | "en"; row: "row" | "row-reverse"; align: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const options = abstractPaymentMethodOptions(language);
  const selected = options.find((option) => option.id === value);
  if (hideWhenZero && !required) return null;
  return <View style={styles.field}>
    <Text style={{ color: error ? colors.error : colors.foreground, fontWeight: "800", fontSize: 14, textAlign: align }}>{label}{required ? <Text style={{ color: colors.error }}> *</Text> : null}</Text>
    <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.paymentDropdown, { flexDirection: row, backgroundColor: error && !value ? colors.error + "14" : colors.surfaceMuted, opacity: pressed ? 0.72 : 1 }]}>
      <View style={styles.flex}><Text style={{ color: selected ? colors.foreground : colors.muted, fontWeight: selected ? "800" : "500", fontSize: 13, textAlign: align }}>{selected?.label ?? (language === "ar" ? "اختر طريقة الدفع" : "Choose a payment method")}</Text></View>{selected ? <Text style={{ fontSize: 16 }}>{selected.icon}</Text> : null}
      <MaterialIcons name="keyboard-arrow-down" size={21} color={value ? colors.primary : colors.muted} />
    </Pressable>
    {error ? <Text style={{ color: colors.error, fontSize: 11, marginTop: 5, textAlign: align }}>{language === "ar" ? "اختر طريقة الدفع للمتابعة" : "Choose a payment method to continue"}</Text> : null}
    <Modal transparent visible={open} statusBarTranslucent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable onPress={() => setOpen(false)} style={styles.paymentMenuBackdrop}>
        <GlowGlassCard radius={20} intensity={28} style={{ borderRadius: 20 }} contentStyle={{ padding: 14, gap: 7 }}>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{label}</Text>
          {options.map((option) => { const isSelected = option.id === value; return <Pressable key={option.id} onPress={() => { onChange(option.id); setOpen(false); }} style={({ pressed }) => [styles.paymentMenuOption, { flexDirection: row, backgroundColor: isSelected ? colors.primary : colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}><Text style={{ fontSize: 16 }}>{option.icon}</Text><Text style={[styles.flex, { color: isSelected ? "#FFFFFF" : colors.foreground, fontWeight: "800", textAlign: align }]}>{option.label}</Text>{isSelected ? <MaterialIcons name="check-circle" size={19} color="#FFFFFF" /> : null}</Pressable>; })}
        </GlowGlassCard>
      </Pressable>
    </Modal>
  </View>;
}
function TimeFieldTrigger({ editable, value, error, onPress, colors, language, row, align }: { editable: boolean; value: string; error: boolean; onPress: () => void; colors: ReturnType<typeof useColors>; language: "ar" | "en"; row: "row" | "row-reverse"; align: "left" | "right" }) {
  return <Pressable disabled={!editable} accessibilityRole="button" accessibilityLabel={language === "ar" ? "اختيار وقت الوصول والمغادرة" : "Choose arrival and departure times"} onPress={onPress} style={({ pressed }) => [styles.input, { flexDirection: row, alignItems: "center", gap: 8, backgroundColor: colors.background === "#070B10" ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.85)", borderColor: error ? colors.error : "rgba(255, 255, 255, 0.08)", borderTopColor: error ? colors.error : "rgba(255, 255, 255, 0.2)", opacity: editable ? (pressed ? 0.72 : 1) : 0.55 }]}><MaterialIcons name="schedule" size={18} color={error ? colors.error : colors.primary} /><Text numberOfLines={1} style={[styles.flex, { color: error ? colors.error : colors.foreground, fontWeight: "800", fontSize: 14, textAlign: align }]}>{value}</Text>{editable ? <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.primary} /> : <Text style={{ color: colors.muted, fontSize: 9, fontWeight: "700" }}>{language === "ar" ? "ثابتة" : "Fixed"}</Text>}</Pressable>;
}
function ConflictResolutionModal({ decision, conflicts, busy, colors, language, settings, formatDate, formatTime, onClose, onQueue, onOpenReplacement, onBack, onReplace }: { decision: "options" | "confirm-replace" | null; conflicts: Booking[]; busy: boolean; colors: ReturnType<typeof useColors>; language: "ar" | "en"; settings: import("@/lib/booking-model").Settings; formatDate: (date: string) => string; formatTime: (time: string) => string; onClose: () => void; onQueue: () => void; onOpenReplacement: () => void; onBack: () => void; onReplace: () => void }) {
  if (!decision || !conflicts.length) return null;
  const conflict = conflicts[0];
  const isReplacementConfirmation = decision === "confirm-replace";
  const title = isReplacementConfirmation ? (language === "ar" ? "تأكيد استبدال الحجز" : "Confirm booking replacement") : (language === "ar" ? "يوجد تعارض في الحجز" : "Booking conflict detected");
  const description = isReplacementConfirmation ? (language === "ar" ? `سيتم إلغاء ${conflicts.length === 1 ? `حجز ${conflict.customerName}` : `${conflicts.length} حجوزات متعارضة`} وتثبيت حجزك الجديد. لا يمكن التراجع عن الإلغاء من هذه النافذة.` : `${conflicts.length === 1 ? `${conflict.customerName}'s booking will be cancelled` : `${conflicts.length} conflicting bookings will be cancelled`} and your new booking will be saved.`) : (language === "ar" ? "الفترة المطلوبة محجوزة بالفعل. اختر وضع الطلب في قائمة الانتظار دون تغيير الحجز الحالي، أو استبدل الحجز المتعارض." : "The requested period is already occupied. Add this request to the waitlist without changing the current booking, or replace the conflicting booking.");
  return <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent><View style={styles.conflictBackdrop}><View style={[styles.conflictCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.conflictIcon, { backgroundColor: colors.error + "18" }]}><MaterialIcons name="warning-amber" size={28} color={colors.error} /></View><Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800", textAlign: "center", marginTop: 13 }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21, textAlign: "center", marginTop: 8 }}>{description}</Text><View style={[styles.conflictDetails, { backgroundColor: colors.background, borderColor: colors.border }]}><Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: "800", textAlign: "center" }}>{conflict.customerName}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, marginTop: 4, textAlign: "center" }}>{formatDate(conflict.startDate)} — {formatDate(conflict.endDate)}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, marginTop: 3, textAlign: "center" }}>{bookingTypeLabel(conflict.bookingType, settings, language)} · {formatTime(conflict.startTime)} — {formatTime(conflict.endTime)}</Text></View>{isReplacementConfirmation ? <View style={styles.conflictButtons}><TouchableOpacity disabled={busy} onPress={onBack} activeOpacity={0.7} style={[styles.conflictButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{language === "ar" ? "رجوع" : "Back"}</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={onReplace} activeOpacity={0.7} style={[styles.conflictButton, { backgroundColor: colors.error, opacity: busy ? 0.65 : 1 }]}><Text style={{ color: colors.background, fontWeight: "800", textAlign: "center" }}>{busy ? (language === "ar" ? "جارٍ الاستبدال…" : "Replacing…") : (language === "ar" ? "تأكيد الاستبدال" : "Confirm replacement")}</Text></TouchableOpacity></View> : <View style={styles.conflictOptions}><TouchableOpacity disabled={busy} onPress={onQueue} activeOpacity={0.7} style={[styles.primaryConflictOption, { backgroundColor: colors.warning, opacity: busy ? 0.65 : 1 }]}><MaterialIcons name="pending-actions" size={20} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "800" }}>{busy ? (language === "ar" ? "جارٍ الحفظ…" : "Saving…") : (language === "ar" ? "وضع في قائمة الانتظار" : "Add to waitlist")}</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={onOpenReplacement} activeOpacity={0.7} style={[styles.secondaryConflictOption, { backgroundColor: colors.error + "16", borderColor: colors.error + "65", opacity: busy ? 0.5 : 1 }]}><MaterialIcons name="swap-horiz" size={20} color={colors.error} /><Text style={{ color: colors.error, fontWeight: "800" }}>{language === "ar" ? "استبدال الحجز المتعارض" : "Replace conflicting booking"}</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={onClose} style={styles.closeConflictOption}><Text style={{ color: colors.muted, fontWeight: "800" }}>{language === "ar" ? "تغيير الموعد" : "Change the schedule"}</Text></TouchableOpacity></View>}</View></View></Modal>;
}
function StayDateCard({ title, date, colors, align, language, row, formatDate, showHijriDate, formatHijriDate, onPress }: { title: string; date: string; colors: ReturnType<typeof useColors>; align: "left" | "right"; language: "ar" | "en"; row: "row" | "row-reverse"; formatDate: (date: string) => string; showHijriDate: boolean; formatHijriDate: (date: string) => string; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.dateCard, { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}><View style={[styles.dateCardTop, { flexDirection: row }]}><Text style={{ flex: 1, minWidth: 0, color: colors.muted, fontSize: 11, textAlign: align }}>{title}</Text><MaterialIcons name="calendar-today" size={15} color={colors.primary} /></View><Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: "800", fontSize: 14, marginTop: 9, textAlign: align }}>{formatDate(date)}</Text><Text numberOfLines={1} style={{ color: colors.primary, fontSize: 11, marginTop: 3, textAlign: align }}>{showHijriDate ? `${weekdayLabel(date, language)} · ${formatHijriDate(date)}` : weekdayLabel(date, language)}</Text></Pressable>; }

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 12, paddingBottom: 176 }, flex: { flex: 1, minWidth: 0 }, header: { alignItems: "center", gap: 10, marginBottom: 12 }, back: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, waitlistInfo: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 13, padding: 10, marginBottom: 9 }, section: { borderWidth: 1, borderRadius: 17, padding: 11, marginBottom: 9, elevation: 1, shadowColor: "#0B1F1B", shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }, sectionTitle: { alignItems: "center", gap: 7, marginBottom: 9 }, sectionIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 }, field: { marginTop: 7 }, input: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingStart: 11, paddingEnd: 11, marginTop: 4, marginStart: 0, marginEnd: 0, backgroundColor: "rgba(255, 255, 255, 0.04)", borderColor: "rgba(255, 255, 255, 0.08)", borderTopColor: "rgba(255, 255, 255, 0.2)" }, phoneRow: { gap: 7, marginTop: 4, alignItems: "center" }, phoneInput: { flex: 1, minWidth: 0, writingDirection: "ltr" }, countryCodeTrigger: { minHeight: 42, minWidth: 106, borderWidth: 1, borderRadius: 11, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3 }, countryFlag: { fontSize: 15 }, crmChip: { alignItems: "center", gap: 6, borderRadius: 11, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7, marginTop: 7 }, blacklistBanner: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 7 }, bufferNote: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 9 }, countrySheet: { borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 13, paddingBottom: 26, maxHeight: "78%" }, countryList: { gap: 7, paddingTop: 7, paddingBottom: 10 }, countryOption: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, alignItems: "center", gap: 8 }, paymentDropdown: { minHeight: 43, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, marginTop: 4, alignItems: "center", gap: 8 }, recipientTrigger: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, marginTop: 4, alignItems: "center", gap: 8 }, recipientIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 }, recipientBadge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3 }, recipientBadgeText: { fontSize: 9, fontWeight: "900" }, paymentMenuBackdrop: { flex: 1, backgroundColor: "rgba(4, 18, 15, 0.65)", justifyContent: "flex-end", padding: 12 }, paymentMenu: { borderWidth: 1, borderRadius: 20, padding: 14, paddingBottom: 26, gap: 7 }, paymentMenuOption: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, alignItems: "center", gap: 8 }, noChalet: { minHeight: 42, borderWidth: 1, borderRadius: 11, justifyContent: "center", paddingHorizontal: 11, marginTop: 4 }, unitSelectorTrigger: { minHeight: 48, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, marginTop: 5, alignItems: "center", gap: 9 }, unitSelectorImage: { width: 44, height: 44, borderRadius: 13, borderWidth: 1, flexShrink: 0 }, unitSelectorImageCompact: { width: 30, height: 30, borderRadius: 9 }, unitSelectorFallback: { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 }, unitSelectorFallbackCompact: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 }, unitSelectorBackdrop: { flex: 1, backgroundColor: "rgba(4, 18, 15, 0.66)", justifyContent: "flex-end" }, unitSelectorSheet: { borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 13, paddingBottom: 26, maxHeight: "76%" }, unitSelectorHeader: { alignItems: "center", gap: 10, marginBottom: 10 }, unitSelectorClose: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 }, unitSelectorList: { gap: 7, paddingBottom: 8 }, unitSelectorRow: { minHeight: 66, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, alignItems: "center", gap: 9 }, unitSelectorMeta: { alignItems: "center", gap: 8, minWidth: 34, justifyContent: "flex-end" }, chaletChoices: { flexWrap: "wrap", gap: 6, marginTop: 6 }, chaletChoice: { flexGrow: 1, flexBasis: "43%", minWidth: 0, minHeight: 40, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 8 }, chaletColorDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 }, rentSummaryRow: { gap: 6 }, rentColumn: { flex: 1, minWidth: 0 }, rentFinalInput: { minHeight: 42, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, marginTop: 4, justifyContent: "center" }, rentFinalValue: { fontSize: 14, fontWeight: "900" }, depositLaterOption: { alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 }, dateGrid: { gap: 6 }, dateCard: { flex: 1, minWidth: 0, minHeight: 74, borderWidth: 1, borderRadius: 13, padding: 9, justifyContent: "center" }, dateCardTop: { alignItems: "center", gap: 5 }, staySubheader: { alignItems: "baseline", justifyContent: "space-between", marginTop: 10 }, types: { flexWrap: "wrap", gap: 6, marginTop: 6 }, typeChoice: { flexGrow: 1, flexBasis: "44%", minWidth: 0, minHeight: 43, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }, typeDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 }, alert: { flexDirection: "row", gap: 7, borderWidth: 1, borderRadius: 13, padding: 10, marginBottom: 9 }, financialResults: { alignItems: "center", gap: 6, borderRadius: 12, padding: 9, marginTop: 9 }, compactNotes: { marginTop: 9 }, notes: { minHeight: 56, paddingTop: 8 }, summary: { borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 3, elevation: 1 }, actionDock: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 7, gap: 3, zIndex: 20, elevation: 8, shadowColor: "#0B1F1B", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } }, dockSummary: { minHeight: 30, borderRadius: 10, alignItems: "center", gap: 6, paddingHorizontal: 9 }, save: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, cancel: { minHeight: 32, alignItems: "center", justifyContent: "center" }, modalBackdrop: { flex: 1, backgroundColor: "rgba(7, 20, 18, 0.58)", justifyContent: "flex-end" }, datePickerSheet: { borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 13, paddingBottom: 26, maxHeight: "93%" }, datePickerHeader: { alignItems: "center", gap: 10, marginBottom: 3 }, datePickerClose: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 }, conflictBackdrop: { flex: 1, backgroundColor: "rgba(4, 18, 15, 0.72)", alignItems: "center", justifyContent: "center", padding: 20 }, conflictCard: { width: "100%", maxWidth: 390, borderWidth: 1, borderRadius: 22, padding: 18, alignItems: "center", elevation: 20, shadowColor: "#000000", shadowOpacity: 0.24, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }, conflictIcon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center" }, conflictDetails: { width: "100%", borderWidth: 1, borderRadius: 13, padding: 10, marginTop: 12 }, conflictOptions: { width: "100%", gap: 7, marginTop: 14 }, conflictButtons: { width: "100%", flexDirection: "row", gap: 7, marginTop: 15 }, primaryConflictOption: { minHeight: 47, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 10 }, secondaryConflictOption: { minHeight: 47, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 10 }, closeConflictOption: { minHeight: 34, alignItems: "center", justifyContent: "center" }, conflictButton: { flex: 1, minHeight: 45, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 } });
const unitStyles = StyleSheet.create({ unitChoices: { flexWrap: "wrap", gap: 7, marginTop: 7 }, unitChoice: { flexGrow: 1, flexBasis: "46%", minWidth: 0, minHeight: 58, borderWidth: 1.5, borderRadius: 13, paddingHorizontal: 8, alignItems: "center", gap: 7 }, unitThumbnail: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, flexShrink: 0 }, unitFallback: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 }, unitAccent: { alignItems: "center", gap: 4, marginTop: 3 } });
