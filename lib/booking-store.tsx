import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform } from "react-native";

import { parseBackupData, parseStoredAppData, serializeBackup } from "./backup-import";
import { persistChaletImage, removeManagedChaletImage } from "./chalet-image";
import { persistPaymentReceipt } from "./payment-receipt";
import { syncCheckoutNotifications } from "./checkout-notifications";
import { AppData, AuditAction, Booking, Chalet, CheckInConfirmation, CheckoutConfirmation, bookingReferenceFor, DEFAULT_DEVICE_SETTINGS, DEFAULT_SETTINGS, DepositRefund, EMPTY_DATA, Expense, expireElapsedRecords, getBookingOperationalState, isValidChaletReferenceCode, isValidPaymentMethod, isWaitlistExpired, localDateISO, ManualStayCorrection, normalizeAppData, normalizeChaletColor, normalizeChaletLatitude, normalizeChaletLongitude, normalizeChaletReferenceCode, normalizeChaletVisibility, normalizeOptionalText, normalizePaymentMethodOptions, normalizePropertyType, Payment, paymentMethodLabel, refundableDepositAmount, remainingAmount, remainingRefundableDeposit, rentalBalance, Settings, SpecialPriceRule, TurnoverTask, WaitlistEntry } from "./booking-model";
import { findBookingConflicts } from "../services/availabilityService";
import { trpc } from "./trpc";
import { syncWaitlistPriorityNotifications } from "./waitlist-priority-notifications";
import { useWorkspaceAccess } from "./workspace-access";
import { isWorkspaceSessionError, isWorkspaceVersionConflict, mergeWorkspaceAppData } from "./workspace-sync";

const STORAGE_KEY = "arabic-booking-manager-data-v1";
const RESCUE_BACKUP_KEY = "arabic-booking-manager-rescue-backup-v1";
const LAST_SYNC_KEY = "arabic-booking-manager-last-sync-v1";
const LEGACY_MIGRATION_WORKSPACE_KEY = "arabic-booking-manager-legacy-migration-workspace-v1";
const PAYMENT_METHODS_STORAGE_KEY = "@stayin_payment_methods";

export type PendingBackupImport = AppData & { fileName: string; fileSize?: number };
export type LastDeleted = { kind: "booking" | "waitlist" | "chalet"; record: Booking | WaitlistEntry | Chalet; createdAt: number };

type BookingContextValue = AppData & {
  hydrated: boolean;
  syncConflict: boolean;
  lastSyncedAt: string | null;
  refreshWorkspaceData: () => Promise<boolean>;
  resetOperationalRecords: () => Promise<{ bookings: number; expenses: number }>;
  pendingBackupImport: PendingBackupImport | null;
  addBooking: (booking: Booking) => Promise<void>;
  updateBooking: (booking: Booking) => Promise<void>;
  markBookingCheckedIn: (id: string, confirmation?: CheckInConfirmation) => Promise<void>;
  completeBookingStay: (id: string, confirmation?: CheckoutConfirmation) => Promise<void>;
  archiveBookingAsNoShow: (id: string) => Promise<void>;
  correctBookingStay: (id: string, correction: ManualStayCorrection) => Promise<void>;
  updateTurnoverTask: (task: TurnoverTask) => Promise<void>;
  addExpense: (expense: Omit<Expense, "id" | "createdAt" | "createdByName">) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  acknowledgeWaitlistPriority: (bookingId: string, waitlistId: string) => Promise<void>;
  cancelBooking: (id: string, reason?: string) => Promise<void>;
  deleteBooking: (id: string) => Promise<void>;
  addChalet: (input: Pick<Chalet, "name" | "propertyType" | "referenceCode" | "color" | "imageUri" | "location" | "locationUrl" | "guardianName" | "guardianPhone" | "contactPhone" | "notes" | "weekendDays" | "shifts" | "periodPricing" | "periodTimes" | "latitude" | "longitude" | "googleMapsUrl" | "isPublished" | "isVerified">) => Promise<Chalet>;
  updateChalet: (chalet: Chalet) => Promise<void>;
  deleteChalet: (id: string) => Promise<void>;
  updateSettings: (settings: Settings) => Promise<void>;
  updateSpecialPriceRules: (rules: SpecialPriceRule[]) => Promise<void>;
  addPayment: (bookingId: string, payment: Payment) => Promise<void>;
  updatePayment: (bookingId: string, paymentId: string, update: Pick<Payment, "amount" | "note" | "paymentMethod">) => Promise<void>;
  voidPayment: (bookingId: string, paymentId: string, reason?: string) => Promise<void>;
  addDepositRefund: (bookingId: string, refund: DepositRefund) => Promise<void>;
  addWaitlist: (entry: WaitlistEntry) => Promise<void>;
  deleteWaitlist: (id: string) => Promise<void>;
  promoteWaitlist: (id: string, booking: Booking, conflictIds?: string[]) => Promise<void>;
  replaceConflictsAndSave: (conflictIds: string[], booking: Booking) => Promise<void>;
  exportBackup: () => Promise<void>;
  openBackupForPreview: () => Promise<boolean>;
  commitPendingBackupImport: () => Promise<{ rescueBackupCreated: boolean }>;
  clearPendingBackupImport: () => void;
  lastDeleted: LastDeleted | null;
  restoreLastDeleted: () => Promise<boolean>;
  clearLastDeleted: () => void;
};

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isEmployee, isManager, isGuest, activeWorkspaceId, can } = useWorkspaceAccess();
  const scopedStorageKey = activeWorkspaceId ? `${STORAGE_KEY}:workspace-${activeWorkspaceId}` : STORAGE_KEY;
  const scopedSyncKey = activeWorkspaceId ? `${LAST_SYNC_KEY}:workspace-${activeWorkspaceId}` : LAST_SYNC_KEY;
  const paymentMethodsStorageScope = activeWorkspaceId ? `workspace-${activeWorkspaceId}` : "local";
  // All active operational members must receive the shared workspace snapshot. Guests remain read-only outside operational sync.
  const canSyncWorkspace = isAuthenticated && activeWorkspaceId !== null && !isGuest;
  const remoteData = trpc.workspace.data.useQuery(undefined, { enabled: canSyncWorkspace, retry: false });
  const saveRemoteData = trpc.workspace.saveData.useMutation();
  const resetOperationsRemote = trpc.workspace.resetOperations.useMutation();
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [hydrated, setHydrated] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState<number | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncConflict, setSyncConflict] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingBackupImport, setPendingBackupImport] = useState<PendingBackupImport | null>(null);
  const [lastDeleted, setLastDeleted] = useState<LastDeleted | null>(null);
  const remoteSyncStarted = useRef(false);
  const auditActorName = user?.name?.trim() || undefined;

  const recordSuccessfulSync = async (value: string | Date | null | undefined = new Date()) => {
    const parsed = value ? new Date(value) : new Date();
    const syncedAt = Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
    setLastSyncedAt(syncedAt);
    await Promise.all([AsyncStorage.setItem(scopedSyncKey, syncedAt), AsyncStorage.setItem(LAST_SYNC_KEY, syncedAt)]);
  };

  const persistPaymentMethods = async (methods: Settings["paymentMethods"]) => {
    let stored: Record<string, unknown> = {};
    try {
      const raw = await AsyncStorage.getItem(PAYMENT_METHODS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : undefined;
      stored = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      stored = {};
    }
    await AsyncStorage.setItem(PAYMENT_METHODS_STORAGE_KEY, JSON.stringify({ ...stored, [paymentMethodsStorageScope]: normalizePaymentMethodOptions(methods) }));
  };

  const persist = async (next: AppData) => {
    const normalized = expireElapsedRecords(normalizeAppData(next));
    setData(normalized);
    await Promise.all([
      AsyncStorage.setItem(scopedStorageKey, JSON.stringify(normalized)),
      persistPaymentMethods(normalized.settings.paymentMethods),
    ]);
    if (canSyncWorkspace && remoteReady && remoteVersion !== null) {
      try {
        const result = await saveRemoteData.mutateAsync({ payload: JSON.stringify(normalized), expectedVersion: remoteVersion });
        setRemoteVersion(result.version);
        setSyncConflict(false);
        await recordSuccessfulSync();
      } catch (error) {
        setSyncConflict(isWorkspaceVersionConflict(error));
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setHydrated(false);
      setRemoteVersion(null);
      setRemoteReady(false);
      remoteSyncStarted.current = false;
      setLastSyncedAt(null);
      try {
        const raw = await AsyncStorage.getItem(scopedStorageKey);
        const paymentMethodsRaw = await AsyncStorage.getItem(PAYMENT_METHODS_STORAGE_KEY);
        const migratedWorkspaceId = activeWorkspaceId ? await AsyncStorage.getItem(LEGACY_MIGRATION_WORKSPACE_KEY) : null;
        const shouldImportLegacyDeviceData = Boolean(activeWorkspaceId && !raw && !migratedWorkspaceId);
        const deviceRaw = shouldImportLegacyDeviceData ? await AsyncStorage.getItem(STORAGE_KEY) : null;
        const savedSyncTime = await AsyncStorage.getItem(scopedSyncKey) ?? await AsyncStorage.getItem(LAST_SYNC_KEY);
        const normalized = expireElapsedRecords(raw ? parseStoredAppData(raw) : EMPTY_DATA);
        const deviceData = deviceRaw ? expireElapsedRecords(parseStoredAppData(deviceRaw)) : EMPTY_DATA;
        let storedPaymentMethods: unknown;
        try {
          const parsed = paymentMethodsRaw ? JSON.parse(paymentMethodsRaw) : undefined;
          storedPaymentMethods = Array.isArray(parsed) ? parsed : parsed?.[paymentMethodsStorageScope];
        } catch {
          storedPaymentMethods = undefined;
        }
        if (!mounted) return;
        const initialBase = activeWorkspaceId ? mergeWorkspaceAppData(normalized, deviceData).data : normalized;
        const initialData = Array.isArray(storedPaymentMethods) && storedPaymentMethods.length ? { ...initialBase, settings: { ...initialBase.settings, paymentMethods: normalizePaymentMethodOptions(storedPaymentMethods) } } : initialBase;
        setData(initialData);
        if (shouldImportLegacyDeviceData && activeWorkspaceId !== null) await AsyncStorage.setItem(LEGACY_MIGRATION_WORKSPACE_KEY, String(activeWorkspaceId));
        setLastSyncedAt(savedSyncTime && !Number.isNaN(new Date(savedSyncTime).getTime()) ? savedSyncTime : null);
        if (raw && JSON.stringify(normalized) !== raw) await AsyncStorage.setItem(scopedStorageKey, JSON.stringify(normalized));
      } catch {
        if (mounted) setData(EMPTY_DATA);
      } finally {
        if (mounted) setHydrated(true);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [activeWorkspaceId, scopedStorageKey, scopedSyncKey]);

  useEffect(() => {
    if (!canSyncWorkspace) {
      remoteSyncStarted.current = false;
      return;
    }
    if (!hydrated || remoteReady || remoteSyncStarted.current || !remoteData.data) return;
    remoteSyncStarted.current = true;
    const sync = async () => {
      try {
        if (remoteData.data.payload) {
          const normalized = expireElapsedRecords(parseStoredAppData(remoteData.data.payload));
          const mergedWorkspaceData = mergeWorkspaceAppData(normalized, data).data;
          setData((current) => JSON.stringify(current) === JSON.stringify(mergedWorkspaceData) ? current : mergedWorkspaceData);
          await AsyncStorage.setItem(scopedStorageKey, JSON.stringify(mergedWorkspaceData));
          if (JSON.stringify(mergedWorkspaceData) !== remoteData.data.payload) {
            const result = await saveRemoteData.mutateAsync({ payload: JSON.stringify(mergedWorkspaceData), expectedVersion: remoteData.data.version });
            setRemoteVersion(result.version);
          } else {
            setRemoteVersion(remoteData.data.version);
          }
          await recordSuccessfulSync(remoteData.data.updatedAt);
        } else {
          const result = await saveRemoteData.mutateAsync({ payload: JSON.stringify(data), expectedVersion: 0 });
          setRemoteVersion(result.version);
          await recordSuccessfulSync();
        }
        setSyncConflict(false);
      } catch (error) {
        setSyncConflict(isWorkspaceVersionConflict(error));
      } finally {
        setRemoteReady(true);
      }
    };
    void sync();
  }, [canSyncWorkspace, data, hydrated, remoteData.data, remoteReady, saveRemoteData, scopedStorageKey]);

  const refreshWorkspaceData = async () => {
    if (!canSyncWorkspace) return false;
    try {
      await AsyncStorage.setItem(`${RESCUE_BACKUP_KEY}:${activeWorkspaceId}`, JSON.stringify(data));
      const result = await remoteData.refetch();
      const remoteSnapshot = result.data?.payload ? expireElapsedRecords(parseStoredAppData(result.data.payload)) : EMPTY_DATA;
      const mergedWorkspaceData = mergeWorkspaceAppData(remoteSnapshot, data).data;
      const mergedPayload = JSON.stringify(mergedWorkspaceData);
      setData(mergedWorkspaceData);
      await AsyncStorage.setItem(scopedStorageKey, mergedPayload);
      if (!result.data?.payload || mergedPayload !== result.data.payload) {
        const saved = await saveRemoteData.mutateAsync({ payload: mergedPayload, expectedVersion: result.data?.version ?? 0 });
        setRemoteVersion(saved.version);
      } else {
        setRemoteVersion(result.data.version);
      }
      setRemoteReady(true);
      setSyncConflict(false);
      await recordSuccessfulSync(result.data?.updatedAt);
      return true;
    } catch (error) {
      setSyncConflict(false);
      const sessionExpired = isWorkspaceSessionError(error);
      Alert.alert(sessionExpired ? "انتهت جلسة المزامنة" : "تعذر تحديث البيانات", sessionExpired ? "احتُفظت تغييراتك في نسخة إنقاذ محلية. سجّل الدخول بالحساب المرتبط بالمنشأة، ثم حدّث البيانات مرة أخرى." : "احتُفظت تغييراتك في نسخة إنقاذ محلية. تحقق من الإنترنت، ثم حاول التحديث مرة أخرى.");
      return false;
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    const interval = setInterval(() => {
      const next = expireElapsedRecords(data);
      if (next === data) return;
      setData(next);
      void AsyncStorage.setItem(scopedStorageKey, JSON.stringify(next));
    }, 60_000);
    return () => clearInterval(interval);
  }, [data, hydrated, scopedStorageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const device = data.settings.device;
    void syncCheckoutNotifications(data.bookings, data.chalets, device?.notificationsEnabled ?? false, device?.language ?? "ar");
    void syncWaitlistPriorityNotifications(data.bookings, data.waitlist, device?.notificationsEnabled ?? false, device?.language ?? "ar");
  }, [data.bookings, data.chalets, data.settings.device?.language, data.settings.device?.notificationsEnabled, data.waitlist, hydrated]);

  const value = useMemo<BookingContextValue>(() => ({
    ...data,
    hydrated,
    syncConflict,
    lastSyncedAt,
    refreshWorkspaceData,
    resetOperationalRecords: async () => {
      const result = await resetOperationsRemote.mutateAsync({ confirmation: "RESET-OPERATIONS" });
      const next = result.payload ? expireElapsedRecords(parseStoredAppData(result.payload)) : { ...data, bookings: [], expenses: [] };
      await AsyncStorage.setItem(scopedStorageKey, JSON.stringify(next));
      setData(next);
      setRemoteVersion(result.version);
      setSyncConflict(false);
      await recordSuccessfulSync();
      return result.removed;
    },
    pendingBackupImport,
    lastDeleted,
    addBooking: async (booking) => { if (!can("create_bookings")) throw new Error("create-booking-forbidden"); await persist({ ...data, bookings: [{ ...booking, createdByUserId: user?.id, createdByName: user?.name ?? undefined, createdByRole: isManager ? "owner" : isEmployee ? "employee" : undefined }, ...data.bookings] }); },
    updateBooking: async (booking) => {
      const existing = data.bookings.find((item) => item.id === booking.id);
      if (!can("edit_bookings")) throw new Error("edit-booking-forbidden");
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === booking.id ? { ...booking, updatedByUserId: user?.id, updatedByName: user?.name ?? undefined } : item) });
    },
    markBookingCheckedIn: async (id, confirmation) => {
      if (!can("edit_bookings")) throw new Error("check-in-forbidden");
      const booking = data.bookings.find((item) => item.id === id);
      if (!booking || booking.status === "cancelled" || booking.status === "completed") throw new Error("booking-not-found");
      const operationalState = getBookingOperationalState(booking);
      if (operationalState.state !== "late-arrival") throw new Error("booking-not-ready-for-check-in");
      if (booking.checkedInAt) return;
      const checkedInAt = confirmation?.actualArrivalAt && !Number.isNaN(new Date(confirmation.actualArrivalAt).getTime()) ? confirmation.actualArrivalAt : new Date().toISOString();
      const rentalBalance = remainingAmount(booking);
      const depositAmount = refundableDepositAmount(booking);
      if (rentalBalance > 0.005 && (!confirmation?.rentalBalanceVerified || !isValidPaymentMethod(confirmation.rentalBalancePaymentMethod))) throw new Error("check-in-rental-method-required");
      if (depositAmount > 0.005 && (!confirmation?.securityDepositVerified || !isValidPaymentMethod(confirmation.securityDepositPaymentMethod))) throw new Error("check-in-deposit-method-required");
      const identityImageUri = await persistPaymentReceipt(confirmation?.identityImageUri, id, "guest-identity");
      const checkInConfirmation: CheckInConfirmation = { actualArrivalAt: checkedInAt, rentalBalanceVerified: confirmation?.rentalBalanceVerified === true, rentalBalancePaymentMethod: rentalBalance > 0.005 ? confirmation?.rentalBalancePaymentMethod : undefined, securityDepositVerified: confirmation?.securityDepositVerified === true, securityDepositPaymentMethod: depositAmount > 0.005 ? confirmation?.securityDepositPaymentMethod : undefined, identityNote: confirmation?.identityNote?.trim().slice(0, 240) || undefined, identityImageUri };
      const actorName = auditActorName ?? "مستخدم التطبيق";
      const verificationDetails = [rentalBalance > 0.005 ? `استُلم المتبقي ${rentalBalance.toFixed(2)} بطريقة ${paymentMethodLabel(checkInConfirmation.rentalBalancePaymentMethod!)}` : "لا يوجد رصيد إيجار متبقٍ", depositAmount > 0.005 ? `استُلم التأمين ${depositAmount.toFixed(2)} بطريقة ${paymentMethodLabel(checkInConfirmation.securityDepositPaymentMethod!)}` : "لا يوجد تأمين مطلوب", checkInConfirmation.identityImageUri ? "تم حفظ صورة الهوية" : "", checkInConfirmation.identityNote ? `ملاحظة الهوية: ${checkInConfirmation.identityNote}` : ""].filter(Boolean).join(" · ");
      const arrivalPayment = rentalBalance > 0.005 ? { id: `p-check-in-${Date.now()}`, amount: rentalBalance, date: localDateISO(new Date(checkedInAt)), recordedAt: checkedInAt, note: "دفعة المتبقي عند الوصول", paymentMethod: checkInConfirmation.rentalBalancePaymentMethod!, recordedByUserId: user?.id, recordedByName: actorName } : undefined;
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === id ? { ...item, checkedInAt, checkInConfirmation, depositPaymentMethod: depositAmount > 0.005 ? checkInConfirmation.securityDepositPaymentMethod : item.depositPaymentMethod, depositPaymentRecordedAt: depositAmount > 0.005 ? checkedInAt : item.depositPaymentRecordedAt, payments: arrivalPayment ? [...item.payments, arrivalPayment] : item.payments, updatedByUserId: user?.id, updatedByName: actorName } : item), auditLog: [{ id: `audit-check-in-${Date.now()}`, action: "booking-checked-in" as AuditAction, bookingId: id, subjectName: booking.customerName, details: [booking.chaletName ?? "", "تم تسجيل الوصول", verificationDetails].filter(Boolean).join(" · "), createdAt: checkedInAt, actorName }, ...data.auditLog] });
    },
    completeBookingStay: async (id, confirmation) => {
      if (!can("edit_bookings")) throw new Error("checkout-forbidden");
      const booking = data.bookings.find((item) => item.id === id);
      if (!booking || booking.status === "cancelled" || booking.status === "completed") throw new Error("booking-not-found");
      const operationalState = getBookingOperationalState(booking);
      if (operationalState.state !== "in-house" && operationalState.state !== "checkout-warning") throw new Error("booking-not-ready-for-checkout");
      if (!confirmation || !confirmation.inspectionPassed) throw new Error("checkout-inspection-required");
      const refundableDeposit = remainingRefundableDeposit(booking);
      const requestedRefund = confirmation?.depositRefund;
      if (requestedRefund && (!isValidPaymentMethod(requestedRefund.paymentMethod) || !Number.isFinite(requestedRefund.amount) || requestedRefund.amount <= 0 || requestedRefund.amount - refundableDeposit > 0.005)) throw new Error("invalid-deposit-refund");
      const checkedOutAt = new Date().toISOString();
      const actorName = auditActorName ?? "مستخدم التطبيق";
      const refund: DepositRefund | undefined = requestedRefund ? { id: `deposit-refund-checkout-${Date.now()}`, amount: requestedRefund.amount, date: checkedOutAt.slice(0, 10), recordedAt: checkedOutAt, note: requestedRefund.note?.trim() || "استرداد التأمين عند المغادرة", paymentMethod: requestedRefund.paymentMethod } : undefined;
      const details = [booking.chaletName ?? "", "تم إنهاء الإقامة بعد فحص الشاليه", confirmation?.inspectionNote ? `ملاحظة الفحص: ${confirmation.inspectionNote.trim()}` : "", refund ? `تم استرداد التأمين: ${refund.amount}` : refundableDeposit > 0.005 ? "تم الاحتفاظ بالتأمين دون استرداد" : ""].filter(Boolean).join(" · ");
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === id ? { ...item, status: "completed" as const, checkedOutAt, depositRefunds: refund ? [...(item.depositRefunds ?? []), refund] : item.depositRefunds, updatedByUserId: user?.id, updatedByName: actorName } : item), auditLog: [{ id: `audit-check-out-${Date.now()}`, action: "booking-checked-out" as AuditAction, bookingId: id, subjectName: booking.customerName, details, createdAt: checkedOutAt, actorName }, ...data.auditLog] });
    },
    archiveBookingAsNoShow: async (id) => {
      if (!can("cancel_delete_bookings")) throw new Error("no-show-forbidden");
      const booking = data.bookings.find((item) => item.id === id);
      if (!booking || booking.status === "cancelled" || booking.status === "completed") throw new Error("booking-not-found");
      if (getBookingOperationalState(booking).state !== "no-show") throw new Error("booking-not-ready-for-no-show");
      const noShowAt = new Date().toISOString();
      const actorName = auditActorName ?? "مستخدم التطبيق";
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === id ? { ...item, status: "cancelled" as const, noShowAt, updatedByUserId: user?.id, updatedByName: actorName } : item), auditLog: [{ id: `audit-no-show-${Date.now()}`, action: "booking-cancelled" as AuditAction, bookingId: id, subjectName: booking.customerName, details: `${booking.chaletName ?? ""} · لم يحضر الضيف، وتمت أرشفة الحجز`, createdAt: noShowAt, actorName }, ...data.auditLog] });
    },
    correctBookingStay: async (id, correction) => {
      if (!isManager) throw new Error("stay-correction-forbidden");
      const booking = data.bookings.find((item) => item.id === id);
      if (!booking) throw new Error("booking-not-found");
      const checkedInAt = correction.checkedInAt && !Number.isNaN(new Date(correction.checkedInAt).getTime()) ? correction.checkedInAt : undefined;
      const checkedOutAt = correction.checkedOutAt && !Number.isNaN(new Date(correction.checkedOutAt).getTime()) ? correction.checkedOutAt : undefined;
      if (!checkedInAt && !checkedOutAt && !correction.restoreNoShow) throw new Error("stay-correction-empty");
      if (checkedInAt && checkedOutAt && new Date(checkedOutAt).getTime() < new Date(checkedInAt).getTime()) throw new Error("stay-correction-order");
      const actorName = auditActorName ?? "مستخدم التطبيق";
      const correctedAt = new Date().toISOString();
      const nextCheckIn = checkedInAt ?? booking.checkedInAt;
      const nextCheckOut = checkedOutAt ?? booking.checkedOutAt;
      const resolvesNoShow = correction.restoreNoShow === true || Boolean(checkedInAt || checkedOutAt);
      const details = [booking.chaletName ?? "", "تصحيح يدوي لحالة الإقامة", checkedInAt ? `وقت الوصول: ${checkedInAt}` : "", checkedOutAt ? `وقت المغادرة: ${checkedOutAt}` : "", correction.restoreNoShow ? "تمت معالجة حالة عدم الحضور" : "", correction.note?.trim() ? `ملاحظة: ${correction.note.trim().slice(0, 240)}` : ""].filter(Boolean).join(" · ");
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === id ? { ...item, status: nextCheckOut ? "completed" as const : resolvesNoShow ? "confirmed" as const : item.status, checkedInAt: nextCheckIn, checkedOutAt: nextCheckOut, noShowAt: resolvesNoShow ? undefined : item.noShowAt, checkInConfirmation: checkedInAt ? { ...(item.checkInConfirmation ?? { rentalBalanceVerified: false, securityDepositVerified: false }), actualArrivalAt: checkedInAt } : item.checkInConfirmation, updatedByUserId: user?.id, updatedByName: actorName } : item), auditLog: [{ id: `audit-stay-correction-${Date.now()}`, action: "booking-status-corrected" as AuditAction, bookingId: id, subjectName: booking.customerName, details, createdAt: correctedAt, actorName }, ...data.auditLog] });
    },
    updateTurnoverTask: async (task) => {
      if (!can("edit_bookings")) throw new Error("turnover-task-forbidden");
      const actorName = auditActorName ?? "مستخدم التطبيق";
      const status = task.status === "completed" ? "completed" : task.status === "in-progress" ? "in-progress" : "pending";
      const timestamp = new Date().toISOString();
      const savedTask: TurnoverTask = { ...task, status, startedAt: status === "in-progress" ? (task.startedAt ?? timestamp) : status === "completed" ? task.startedAt : undefined, completedAt: status === "completed" ? (task.completedAt ?? timestamp) : undefined, completedByName: status === "completed" ? actorName : undefined };
      const details = `${task.chaletName ?? ""} · ${status === "completed" ? "تم التجهيز والشاليه جاهز للوصول" : status === "in-progress" ? "بدأ التنظيف والفحص" : "أعيدت المهمة للمتابعة"}`;
      await persist({ ...data, turnoverTasks: [...data.turnoverTasks.filter((item) => item.id !== task.id), savedTask], auditLog: [{ id: `audit-turnover-${Date.now()}`, action: "turnover-task-updated" as AuditAction, subjectName: task.chaletName ?? "الشاليه", details, createdAt: new Date().toISOString(), actorName }, ...data.auditLog] });
    },
    addExpense: async (expense) => {
      if (isEmployee) throw new Error("expense-forbidden");
      const amount = Number(expense.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid-expense");
      const generalAllocations = expense.generalAllocations?.map((allocation) => ({ chaletId: allocation.chaletId.trim(), chaletName: allocation.chaletName.trim(), amount: Number(allocation.amount) })).filter((allocation) => allocation.chaletId && allocation.chaletName && Number.isFinite(allocation.amount) && allocation.amount > 0);
      if (generalAllocations?.length) {
        const allocated = Math.round(generalAllocations.reduce((sum, allocation) => sum + allocation.amount, 0) * 100);
        if (allocated !== Math.round(amount * 100)) throw new Error("invalid-general-expense-allocation");
      }
      const createdAt = new Date().toISOString();
      const actorName = auditActorName ?? "مستخدم التطبيق";
      const savedExpense: Expense = { ...expense, generalAllocations: generalAllocations?.length ? generalAllocations : undefined, id: `expense-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, amount, date: expense.date, note: expense.note?.trim() || undefined, createdAt, createdByName: actorName };
      await persist({ ...data, expenses: [savedExpense, ...(data.expenses ?? [])], auditLog: [{ id: `audit-expense-${Date.now()}`, action: "expense-added" as AuditAction, subjectName: savedExpense.chaletName ?? (savedExpense.generalAllocations?.length ? "مصروف عام (مشترك)" : "مصروف عام"), details: `${savedExpense.category} · ${savedExpense.amount} ${data.settings.currency}${savedExpense.note ? ` · ${savedExpense.note}` : ""}`, createdAt, actorName }, ...data.auditLog] });
    },
    deleteExpense: async (id) => {
      if (isEmployee) throw new Error("expense-forbidden");
      const expense = (data.expenses ?? []).find((item) => item.id === id);
      if (!expense) throw new Error("expense-not-found");
      const actorName = auditActorName ?? "مستخدم التطبيق";
      await persist({ ...data, expenses: (data.expenses ?? []).filter((item) => item.id !== id), auditLog: [{ id: `audit-expense-delete-${Date.now()}`, action: "expense-deleted" as AuditAction, subjectName: expense.chaletName ?? "مصروف عام", details: `${expense.category} · ${expense.amount} ${data.settings.currency}`, createdAt: new Date().toISOString(), actorName }, ...data.auditLog] });
    },
    acknowledgeWaitlistPriority: async (bookingId, waitlistId) => {
      if (!can("edit_bookings")) throw new Error("edit-booking-forbidden");
      const booking = data.bookings.find((item) => item.id === bookingId);
      const entry = data.waitlist.find((item) => item.id === waitlistId);
      if (!booking || !entry || entry.status !== "active" || isWaitlistExpired(entry)) throw new Error("waitlist-priority-not-found");
      const configuredStart = entry.startTime ?? data.settings.bookingTypes[entry.bookingType].startTime;
      const configuredEnd = entry.endTime ?? data.settings.bookingTypes[entry.bookingType].endTime;
      const conflicts = findBookingConflicts({ chaletId: entry.chaletId, chaletName: entry.chaletName, startDate: entry.requestedDate, endDate: entry.endDate ?? entry.requestedDate, bookingType: entry.bookingType, startTime: configuredStart, endTime: configuredEnd }, [booking]);
      if (!conflicts.some((item) => item.id === bookingId)) throw new Error("waitlist-priority-no-conflict");
      const acknowledgedAt = new Date().toISOString();
      const actorName = user?.name ?? "مستخدم التطبيق";
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === bookingId ? { ...item, waitlistPriorityAcknowledgedForId: waitlistId, waitlistPriorityAcknowledgedAt: acknowledgedAt, waitlistPriorityAcknowledgedByName: actorName, updatedByUserId: user?.id, updatedByName: actorName } : item), auditLog: [{ id: `audit-waitlist-priority-${Date.now()}`, action: "booking-waitlist-priority-confirmed" as AuditAction, subjectName: booking.customerName, details: `${booking.chaletName ?? ""} · تم تأكيد الحجز رغم وجود طلب انتظار للعميل: ${entry.customerName} · نفّذ التأكيد: ${actorName}`, createdAt: acknowledgedAt, actorName }, ...data.auditLog] });
    },
    cancelBooking: async (id, reason) => {
      if (!can("cancel_delete_bookings")) throw new Error("cancel-booking-forbidden");
      const booking = data.bookings.find((item) => item.id === id);
      if (!booking) throw new Error("booking-not-found");
      const trimmedReason = reason?.trim();
      const details = [booking.chaletName, trimmedReason ? `سبب الإلغاء: ${trimmedReason}` : ""].filter(Boolean).join(" · ");
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === id ? { ...item, status: "cancelled" as const } : item), auditLog: [{ id: `audit-${Date.now()}`, action: "booking-cancelled" as AuditAction, bookingId: id, subjectName: booking.customerName, details, createdAt: new Date().toISOString(), actorName: auditActorName }, ...data.auditLog] });
    },
    deleteBooking: async (id) => { if (!can("cancel_delete_bookings")) throw new Error("delete-booking-forbidden"); const booking = data.bookings.find((item) => item.id === id); await persist({ ...data, bookings: data.bookings.filter((item) => item.id !== id), auditLog: booking ? [{ id: `audit-${Date.now()}`, action: "booking-deleted" as AuditAction, subjectName: booking.customerName, details: booking.chaletName ?? "", createdAt: new Date().toISOString(), actorName: auditActorName }, ...data.auditLog] : data.auditLog }); if (booking) setLastDeleted({ kind: "booking", record: booking, createdAt: Date.now() }); },
    addChalet: async (input) => {
      const name = input.name.trim();
      const referenceCode = normalizeChaletReferenceCode(input.referenceCode);
      if (!name) throw new Error("chalet-name-required");
      if (!isValidChaletReferenceCode(referenceCode)) throw new Error("chalet-reference-code-invalid");
      if (data.chalets.some((chalet) => chalet.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("chalet-name-duplicate");
      if (data.chalets.some((chalet) => normalizeChaletReferenceCode(chalet.referenceCode) === referenceCode)) throw new Error("chalet-reference-code-duplicate");
      const id = `chalet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const chalet: Chalet = { id, name, propertyType: normalizePropertyType(input.propertyType), referenceCode, color: normalizeChaletColor(input.color), imageUri: await persistChaletImage(input.imageUri, id), location: input.location?.trim() || undefined, locationUrl: input.locationUrl?.trim() || undefined, guardianName: input.guardianName?.trim() || undefined, guardianPhone: input.guardianPhone?.trim() || undefined, contactPhone: input.contactPhone?.trim() || undefined, notes: input.notes?.trim() || undefined, weekendDays: input.weekendDays, shifts: input.shifts, periodPricing: input.periodPricing, periodTimes: input.periodTimes, latitude: normalizeChaletLatitude(input.latitude), longitude: normalizeChaletLongitude(input.longitude), googleMapsUrl: normalizeOptionalText(input.googleMapsUrl), isPublished: normalizeChaletVisibility(input.isPublished), isVerified: normalizeChaletVisibility(input.isVerified), createdAt: new Date().toISOString() };
      await persist({ ...data, chalets: [...data.chalets, chalet] });
      return chalet;
    },
    updateChalet: async (chalet) => {
      const name = chalet.name.trim();
      const referenceCode = normalizeChaletReferenceCode(chalet.referenceCode);
      if (!name) throw new Error("chalet-name-required");
      if (!isValidChaletReferenceCode(referenceCode)) throw new Error("chalet-reference-code-invalid");
      if (data.chalets.some((item) => item.id !== chalet.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("chalet-name-duplicate");
      if (data.chalets.some((item) => item.id !== chalet.id && normalizeChaletReferenceCode(item.referenceCode) === referenceCode)) throw new Error("chalet-reference-code-duplicate");
      const current = data.chalets.find((item) => item.id === chalet.id);
      const imageUri = chalet.imageUri === current?.imageUri ? current?.imageUri : await persistChaletImage(chalet.imageUri, chalet.id);
      await persist({ ...data, chalets: data.chalets.map((item) => item.id === chalet.id ? { ...chalet, imageUri, name, propertyType: normalizePropertyType(chalet.propertyType), referenceCode, color: normalizeChaletColor(chalet.color, item.color), location: chalet.location?.trim() || undefined, locationUrl: chalet.locationUrl?.trim() || undefined, guardianName: chalet.guardianName?.trim() || undefined, guardianPhone: chalet.guardianPhone?.trim() || undefined, contactPhone: chalet.contactPhone?.trim() || undefined, notes: chalet.notes?.trim() || undefined, latitude: normalizeChaletLatitude(chalet.latitude) ?? item.latitude, longitude: normalizeChaletLongitude(chalet.longitude) ?? item.longitude, googleMapsUrl: normalizeOptionalText(chalet.googleMapsUrl) ?? item.googleMapsUrl, isPublished: normalizeChaletVisibility(chalet.isPublished) ?? item.isPublished, isVerified: normalizeChaletVisibility(chalet.isVerified) ?? item.isVerified } : item) });
      if (current?.imageUri && current.imageUri !== imageUri) await removeManagedChaletImage(current.imageUri);
    },
    deleteChalet: async (id) => {
      const chalet = data.chalets.find((item) => item.id === id);
      if (!chalet) throw new Error("chalet-not-found");
      const linkedBookings = data.bookings.filter((booking) => booking.chaletId === id).length;
      await persist({ ...data, chalets: data.chalets.filter((item) => item.id !== id), auditLog: [{ id: `audit-${Date.now()}`, action: "chalet-deleted" as AuditAction, subjectName: chalet.name, details: `حجوزات مرتبطة محفوظة: ${linkedBookings}`, createdAt: new Date().toISOString(), actorName: auditActorName }, ...data.auditLog] });
      if (chalet.imageUri) await removeManagedChaletImage(chalet.imageUri);
      setLastDeleted({ kind: "chalet", record: chalet, createdAt: Date.now() });
    },
    updateSettings: async (settings) => { if (isEmployee) throw new Error("employee-settings-forbidden"); await persist({ ...data, settings }); },
    updateSpecialPriceRules: async (rules) => { if (isEmployee) throw new Error("employee-pricing-forbidden"); await persist({ ...data, specialPriceRules: rules }); },
    addPayment: async (bookingId, payment) => {
      if (!can("manage_payments")) throw new Error("manage-payments-forbidden");
      const booking = data.bookings.find((item) => item.id === bookingId);
      if (!booking) throw new Error("booking-not-found");
      const amount = Number(payment.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid-rental-payment");
      const receiptUri = await persistPaymentReceipt(payment.receiptUri, bookingId, payment.id);
      const savedPayment: Payment = { ...payment, amount, recordedAt: payment.recordedAt ?? new Date().toISOString(), note: payment.note?.trim() || undefined, receiptUri, recordedByUserId: user?.id, recordedByName: user?.name ?? undefined };
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === bookingId ? { ...item, payments: [...item.payments, savedPayment] } : item) });
    },
    updatePayment: async (bookingId, paymentId, update) => {
      if (!can("manage_payments")) throw new Error("manage-payments-forbidden");
      const booking = data.bookings.find((item) => item.id === bookingId);
      const payment = booking?.payments.find((item) => item.id === paymentId);
      const amount = Number(update.amount);
      if (!booking || !payment || payment.voidedAt) throw new Error("payment-not-found");
      if (!Number.isFinite(amount) || amount <= 0 || !isValidPaymentMethod(update.paymentMethod)) throw new Error("invalid-rental-payment");
      const savedPayment: Payment = { ...payment, amount, note: update.note?.trim() || undefined, paymentMethod: update.paymentMethod, updatedByUserId: user?.id, updatedByName: user?.name ?? undefined };
      const amountChanged = Math.abs(payment.amount - amount) > 0.0001;
      const auditLog = amountChanged ? [{ id: `audit-${Date.now()}`, action: "payment-updated" as AuditAction, subjectName: booking.customerName, details: `${booking.chaletName ?? ""} · تم تعديل دفعة الإيجار من ${payment.amount} ${data.settings.currency} إلى ${amount} ${data.settings.currency}`, createdAt: new Date().toISOString(), actorName: auditActorName }, ...data.auditLog] : data.auditLog;
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === bookingId ? { ...item, payments: item.payments.map((entry) => entry.id === paymentId ? savedPayment : entry) } : item), auditLog });
    },
    voidPayment: async (bookingId, paymentId, reason) => {
      if (!can("manage_payments")) throw new Error("manage-payments-forbidden");
      const booking = data.bookings.find((item) => item.id === bookingId);
      const payment = booking?.payments.find((item) => item.id === paymentId);
      if (!booking || !payment || payment.voidedAt) throw new Error("payment-not-found");
      const voidedAt = new Date().toISOString();
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === bookingId ? { ...item, payments: item.payments.map((entry) => entry.id === paymentId ? { ...entry, voidedAt, voidReason: reason?.trim() || undefined, voidedByUserId: user?.id, voidedByName: user?.name ?? undefined } : entry) } : item), auditLog: [{ id: `audit-${Date.now()}`, action: "payment-voided", subjectName: booking.customerName, details: `${booking.chaletName ?? ""} · ${payment.amount}${reason?.trim() ? ` · ${reason.trim()}` : ""}`, createdAt: voidedAt, actorName: auditActorName }, ...data.auditLog] });
    },
    addDepositRefund: async (bookingId, refund) => {
      if (!can("refund_security_deposits")) throw new Error("refund-deposit-forbidden");
      const booking = data.bookings.find((item) => item.id === bookingId);
      if (!booking) throw new Error("booking-not-found");
      const refundable = Math.max(0, Number(booking.depositAmount || 0) - (booking.depositRefunds ?? []).reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0)), 0));
      if (!Number.isFinite(refund.amount) || refund.amount <= 0 || refund.amount > refundable) throw new Error("invalid-deposit-refund");
      if (!isValidPaymentMethod(refund.paymentMethod)) throw new Error("invalid-deposit-refund-method");
      const savedRefund: DepositRefund = { ...refund, recordedAt: refund.recordedAt ?? new Date().toISOString(), note: refund.note?.trim() || undefined };
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === bookingId ? { ...item, depositRefunds: [...(item.depositRefunds ?? []), savedRefund] } : item) });
    },
    addWaitlist: async (entry) => { if (!can("create_bookings")) throw new Error("create-booking-forbidden"); await persist({ ...data, waitlist: [...data.waitlist, entry] }); },
    deleteWaitlist: async (id) => { const entry = data.waitlist.find((item) => item.id === id); if (!entry) throw new Error("waitlist-not-found"); const cancelledAt = new Date().toISOString(); await persist({ ...data, waitlist: data.waitlist.map((item) => item.id === id ? { ...item, status: "cancelled" as const, cancelledAt, cancellationReason: "manual" as const } : item), auditLog: [{ id: `audit-${Date.now()}`, action: "waitlist-cancelled" as AuditAction, subjectName: entry.customerName, details: `${entry.chaletName ?? ""} · أُلغي يدويًا`, createdAt: cancelledAt }, ...data.auditLog] }); },
    promoteWaitlist: async (id, booking, conflictIds = []) => {
      const entry = data.waitlist.find((item) => item.id === id);
      if (!entry) throw new Error("waitlist-not-found");
      if (entry.status === "promoted") throw new Error("waitlist-already-promoted");
      if (entry.status === "cancelled" || isWaitlistExpired(entry)) {
        if (entry.status !== "cancelled") {
          const cancelledAt = new Date().toISOString();
          await persist({ ...data, waitlist: data.waitlist.map((item) => item.id === id ? { ...item, status: "cancelled" as const, cancelledAt, cancellationReason: "start-time" as const } : item), auditLog: [{ id: `audit-${Date.now()}`, action: "waitlist-cancelled" as AuditAction, subjectName: entry.customerName, details: `${entry.chaletName ?? ""} · أُلغي تلقائيًا عند وقت بداية الحجز`, createdAt: cancelledAt }, ...data.auditLog] });
        }
        throw new Error("waitlist-expired");
      }
      const promotedAt = new Date().toISOString();
      const actorName = user?.name ?? "مستخدم التطبيق";
      const savedBooking: Booking = { ...booking, createdByUserId: user?.id, createdByName: actorName, createdByRole: isManager ? "owner" : isEmployee ? "employee" : undefined };
      const replacedBookings = data.bookings.filter((item) => conflictIds.includes(item.id));
      const bookingReference = savedBooking.bookingReference ?? bookingReferenceFor(savedBooking, data.chalets);
      const replacementNames = replacedBookings.map((item) => item.customerName).join("، ");
      const promotionDetails = [savedBooking.chaletName ?? entry.chaletName ?? "", `تم التحويل إلى الحجز ${bookingReference}`, replacementNames ? `استُبدل حجز العميل: ${replacementNames}` : "", `نفّذ التحويل: ${actorName}`].filter(Boolean).join(" · ");
      const replacementAudits = replacedBookings.map((item, index) => ({ id: `audit-waitlist-replacement-${Date.now()}-${index}`, action: "booking-cancelled" as AuditAction, subjectName: item.customerName, details: `${item.chaletName ?? ""} · استُبدل بحجز العميل: ${entry.customerName} · الحجز الناتج: ${bookingReference} · نفّذ التحويل: ${actorName}`, createdAt: promotedAt }));
      await persist({ ...data, bookings: [savedBooking, ...data.bookings.map((item) => conflictIds.includes(item.id) ? { ...item, status: "cancelled" as const, updatedByUserId: user?.id, updatedByName: actorName } : item)], waitlist: data.waitlist.map((item) => item.id === id ? { ...item, status: "promoted" as const, promotedAt, promotedByUserId: user?.id, promotedByName: actorName, promotedBookingId: savedBooking.id, promotedBookingReference: bookingReference, promotedReplacedCustomerNames: replacementNames || undefined } : item), auditLog: [{ id: `audit-${Date.now()}`, action: "waitlist-promoted" as AuditAction, subjectName: entry.customerName, details: promotionDetails, createdAt: promotedAt }, ...replacementAudits, ...data.auditLog] });
    },
    replaceConflictsAndSave: async (conflictIds, booking) => {
      const exists = data.bookings.some((item) => item.id === booking.id);
      const nextBookings = data.bookings.map((item) => {
        if (item.id === booking.id) return booking;
        return conflictIds.includes(item.id) ? { ...item, status: "cancelled" as const } : item;
      });
      await persist({ ...data, bookings: exists ? nextBookings : [booking, ...nextBookings] });
    },
    exportBackup: async () => {
      const uri = `${FileSystem.documentDirectory}booking-backup-${new Date().toISOString().slice(0, 10)}.json`;
      await FileSystem.writeAsStringAsync(uri, serializeBackup(data), { encoding: FileSystem.EncodingType.UTF8 });
      if (Platform.OS !== "web" && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "مشاركة النسخة الاحتياطية" });
      } else {
        Alert.alert("تم إنشاء النسخة", uri);
      }
    },
    openBackupForPreview: async () => {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
        if (result.canceled) return false;
        const asset = result.assets[0];
        const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
        setPendingBackupImport({ ...parseBackupData(raw), fileName: asset.name, fileSize: asset.size });
        return true;
      } catch {
        Alert.alert("تعذر قراءة الملف", "اختر نسخة احتياطية صالحة بصيغة JSON صادرة من التطبيق.");
        return false;
      }
    },
    commitPendingBackupImport: async () => {
      if (!pendingBackupImport) throw new Error("missing pending backup import");
      const { fileName: _fileName, fileSize: _fileSize, ...next } = pendingBackupImport;
      const rescuePayload = serializeBackup(data);
      if (Platform.OS !== "web" && FileSystem.documentDirectory) {
        const rescueUri = `${FileSystem.documentDirectory}booking-rescue-before-import-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        await FileSystem.writeAsStringAsync(rescueUri, rescuePayload, { encoding: FileSystem.EncodingType.UTF8 });
      } else {
        await AsyncStorage.setItem(RESCUE_BACKUP_KEY, rescuePayload);
      }
      const normalized = expireElapsedRecords(normalizeAppData(next));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      setData(normalized);
      setPendingBackupImport(null);
      return { rescueBackupCreated: true };
    },
    clearPendingBackupImport: () => setPendingBackupImport(null),
    restoreLastDeleted: async () => {
      if (!lastDeleted) return false;
      if (lastDeleted.kind === "booking") await persist({ ...data, bookings: [lastDeleted.record as Booking, ...data.bookings] });
      else if (lastDeleted.kind === "waitlist") await persist({ ...data, waitlist: [lastDeleted.record as WaitlistEntry, ...data.waitlist] });
      else await persist({ ...data, chalets: [...data.chalets, lastDeleted.record as Chalet] });
      setLastDeleted(null);
      return true;
    },
    clearLastDeleted: () => setLastDeleted(null),
  }), [data, hydrated, lastDeleted, lastSyncedAt, pendingBackupImport, resetOperationsRemote, scopedStorageKey]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBookings() {
  const value = useContext(BookingContext);
  if (!value) throw new Error("useBookings must be used inside BookingProvider");
  return value;
}
