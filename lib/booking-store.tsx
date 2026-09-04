import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform } from "react-native";

import { parseBackupData, parseStoredAppData, serializeBackup } from "./backup-import";
import { buildDemoAppData } from "./demo-data";
import { useDemoMode } from "./demo-mode";
import { persistChaletImage, removeManagedChaletImage } from "./chalet-image";
import { persistPaymentReceipt } from "./payment-receipt";
import { syncCheckoutNotifications } from "./checkout-notifications";
import { AppData, AuditAction, Booking, Chalet, CheckInConfirmation, CheckoutConfirmation, bookingReferenceFor, DEFAULT_DEVICE_SETTINGS, DEFAULT_SETTINGS, DepositRefund, effectiveLoyaltyProgram, effectiveUtilityTracking, EMPTY_DATA, Expense, expireElapsedRecords, getBookingOperationalState, isValidChaletReferenceCode, isValidPaymentMethod, isWaitlistExpired, localDateISO, ManualStayCorrection, normalizeAppData, normalizeChaletColor, normalizeChaletLatitude, normalizeChaletLongitude, normalizeChaletReferenceCode, normalizeChaletVisibility, normalizeOptionalText, normalizePaymentMethodOptions, normalizePropertyType, Payment, paymentMethodLabel, refundableDepositAmount, remainingAmount, remainingRefundableDeposit, rentalBalance, Settings, SpecialPriceRule, TurnoverTask, WaitlistEntry } from "./booking-model";
import { type Asset, type AssetInspectionItem, type Customer, type InAppNotification, type LeaseContract, type LoyaltyAccount, type LoyaltyTransaction, type MaintenanceTask, type NotificationRecipient, type NotificationType, type UtilityReading, type WeatherLog } from "./booking-model";
import { findCustomerByPhone, phoneE164, upsertCustomerFromBooking } from "./customers";
import { deriveLoyaltyTier, pointsEarned } from "./loyalty";
import { computeUtilityCost, findOpenUtilityReading, UTILITY_RATES, utilityTypeLabel } from "./utility-readings";
import type { WeatherAdvisory } from "./weather";
import { isMaintenanceOverdue, isMaintenanceUpcoming, nextMaintenanceDueDate } from "./maintenance";
import { buildCheckInAlertNotification, buildContractSignedNotification, buildMaintenanceDueNotification, buildNewBookingNotification, buildPaymentReceivedNotification } from "./notification-center";
import { findBookingConflicts } from "../services/availabilityService";
import { trpc } from "./trpc";
import { syncWaitlistPriorityNotifications } from "./waitlist-priority-notifications";
import { useWorkspaceAccess } from "./workspace-access";
import { isWorkspaceSessionError, isWorkspaceVersionConflict, mergeWorkspaceAppData } from "./workspace-sync";
import * as Auth from "./_core/auth";
import { getMyWorkspaceId, getWorkspaceState, isSupabaseConfigured, saveWorkspaceState, subscribeToTable } from "./supabase-data";

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
  addChalet: (input: Pick<Chalet, "name" | "propertyType" | "referenceCode" | "color" | "imageUri" | "location" | "locationUrl" | "guardianName" | "guardianPhone" | "contactPhone" | "notes" | "weekendDays" | "shifts" | "periodPricing" | "periodTimes" | "latitude" | "longitude" | "googleMapsUrl" | "isPublished" | "isVerified" | "nearWater">) => Promise<Chalet>;
  updateChalet: (chalet: Chalet) => Promise<void>;
  deleteChalet: (id: string) => Promise<void>;
  updateSettings: (settings: Settings) => Promise<void>;
  updateSpecialPriceRules: (rules: SpecialPriceRule[]) => Promise<void>;
  saveCustomer: (customer: Customer) => Promise<void>;
  setCustomerBlacklisted: (id: string, isBlacklisted: boolean, reason?: string) => Promise<void>;
  saveAsset: (asset: Omit<Asset, "id" | "createdAt"> & { id?: string }) => Promise<Asset>;
  deleteAsset: (id: string) => Promise<void>;
  saveMaintenanceTask: (task: Omit<MaintenanceTask, "id" | "createdAt"> & { id?: string }) => Promise<void>;
  completeMaintenanceTask: (id: string, completedByName?: string) => Promise<void>;
  deleteMaintenanceTask: (id: string) => Promise<void>;
  signContract: (input: { bookingId: string; guestSignatureBase64?: string; termsSnapshot: string; signedByName?: string }) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  saveWeatherLog: (log: WeatherLog, advisories?: WeatherAdvisory[]) => Promise<void>;
  redeemLoyaltyPoints: (input: { customerId: string; bookingId: string; bookingReference?: string; points: number; amount: number; note?: string }) => Promise<void>;
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

let notificationSequence = 0;

function newNotificationId() {
  notificationSequence += 1;
  return `notification-${Date.now()}-${notificationSequence}`;
}

function buildInAppNotification(input: { type: NotificationType; recipients: NotificationRecipient[]; dataPayload?: Record<string, string>; title: string; body: string; createdAt?: string }): InAppNotification {
  return { id: newNotificationId(), type: input.type, recipients: input.recipients, dataPayload: input.dataPayload, title: input.title, body: input.body, isRead: false, createdAt: input.createdAt ?? new Date().toISOString() };
}

/** Creates maintenance_due notifications for tasks that are overdue or due within 3 days, tracked once per task+due cycle. */
function maintenanceDueNotificationsFor(tasks: MaintenanceTask[], notifications: InAppNotification[], language: "ar" | "en", now = Date.now()) {
  const extra: InAppNotification[] = [];
  tasks.forEach((task) => {
    if (task.status === "completed") return;
    const dueSoon = isMaintenanceOverdue(task, now) || isMaintenanceUpcoming(task, now, 3);
    if (!dueSoon) return;
    const alreadyTracked = notifications.some((notification) => notification.type === "maintenance_due" && notification.dataPayload?.taskId === task.id);
    if (alreadyTracked) return;
    extra.push(buildInAppNotification({ type: "maintenance_due", recipients: ["guard", "manager"], dataPayload: { taskId: task.id, chaletId: task.chaletId ?? "" }, ...buildMaintenanceDueNotification({ title: task.title, chaletName: task.chaletName, nextDueDate: task.nextDueDate }, language) }));
  });
  return extra;
}

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isEmployee, isManager, isGuest, activeWorkspaceId, can } = useWorkspaceAccess();
  const { isDemo, showDemoNotice } = useDemoMode();
  const scopedStorageKey = activeWorkspaceId ? `${STORAGE_KEY}:workspace-${activeWorkspaceId}` : STORAGE_KEY;
  const scopedSyncKey = activeWorkspaceId ? `${LAST_SYNC_KEY}:workspace-${activeWorkspaceId}` : LAST_SYNC_KEY;
  const paymentMethodsStorageScope = activeWorkspaceId ? `workspace-${activeWorkspaceId}` : "local";
  // All active operational members must receive the shared workspace snapshot. Guests remain read-only outside operational sync.
  const canSyncWorkspace = isAuthenticated && activeWorkspaceId !== null && !isGuest;
  const remoteData = trpc.workspace.data.useQuery(undefined, { enabled: canSyncWorkspace, retry: false });
  const saveRemoteData = trpc.workspace.saveData.useMutation();
  const resetOperationsRemote = trpc.workspace.resetOperations.useMutation();
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  // Latest committed snapshot for conflict-free persistence. Handlers build
  // `next` from the `data` closure of their render; merging those partial
  // writes against this ref prevents unrelated writers from being clobbered.
  const dataRef = useRef<AppData>(EMPTY_DATA);
  const [hydrated, setHydrated] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState<number | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncConflict, setSyncConflict] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingBackupImport, setPendingBackupImport] = useState<PendingBackupImport | null>(null);
  const [lastDeleted, setLastDeleted] = useState<LastDeleted | null>(null);
  const remoteSyncStarted = useRef(false);
  const auditActorName = user?.name?.trim() || undefined;
  // Custom session token forwarded to Supabase as X-StayIn-Token. Supabase writes
  // are strictly additive and non-blocking: if Supabase is unavailable or no token
  // is present, the existing tRPC path remains authoritative and nothing breaks.
  const [supabaseToken, setSupabaseToken] = useState<string | null>(null);
  const supabaseReady = isSupabaseConfigured && canSyncWorkspace && !!supabaseToken;

  const applySupabaseSnapshot = useCallback(async (token: string) => {
    try {
      const state = await getWorkspaceState(token);
      const payload = state.payload;
      if (payload == null) return;
      const remote = expireElapsedRecords(
        parseStoredAppData(typeof payload === "string" ? payload : JSON.stringify(payload)),
      );
      setData((current) => {
        const merged = mergeWorkspaceAppData(remote, current).data;
        if (JSON.stringify(merged) === JSON.stringify(current)) {
          dataRef.current = merged;
          return current;
        }
        dataRef.current = merged;
        void AsyncStorage.setItem(scopedStorageKey, JSON.stringify(merged));
        return merged;
      });
    } catch {
      // Swallow: the Supabase mirror is optional. Local + tRPC remain authoritative.
    }
  }, [scopedStorageKey]);

  useEffect(() => {
    let mounted = true;
    if (!canSyncWorkspace || !isSupabaseConfigured) {
      setSupabaseToken(null);
      return;
    }
    void Auth.getSessionToken().then((token) => {
      if (mounted) setSupabaseToken(token ?? null);
    });
    return () => { mounted = false; };
  }, [canSyncWorkspace, activeWorkspaceId]);

  useEffect(() => {
    if (!supabaseReady || !supabaseToken) return;
    let disposed = false;
    const token = supabaseToken;
    const refresh = () => { if (!disposed) void applySupabaseSnapshot(token); };
    // Initial pull once the token is ready.
    refresh();
    // Realtime listener (fires on Supabase writes from any device) plus a
    // token-scoped poll as the safe fallback for the custom-auth model.
    let channel: ReturnType<typeof subscribeToTable> | undefined;
    (async () => {
      try {
        const wsId = await getMyWorkspaceId(token);
        if (disposed || !wsId) return;
        channel = subscribeToTable("workspace_state", wsId, refresh);
      } catch {
        // Realtime unavailable (custom-token auth) — the poll below covers sync.
      }
    })();
    const poll = setInterval(refresh, 15_000);
    return () => {
      disposed = true;
      clearInterval(poll);
      if (channel) { try { channel.unsubscribe(); } catch { /* noop */ } }
    };
  }, [supabaseReady, supabaseToken, applySupabaseSnapshot]);

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
    if (isDemo) {
      // The demo tour is fully in-memory: intercept every write with a notice
      // and never touch AsyncStorage, tRPC, or Supabase.
      showDemoNotice();
      return;
    }
    const normalized = expireElapsedRecords(normalizeAppData(next));
    // Treat `next` as a partial writer: only adopt its top-level keys that
    // actually changed, layering them over the latest committed snapshot. This
    // keeps concurrent writers from losing each other's untouched sections.
    const snapshot = dataRef.current ?? EMPTY_DATA;
    const merged = expireElapsedRecords(
      normalizeAppData(
        (Object.keys(snapshot) as (keyof AppData)[]).reduce<AppData>((result, key) => {
          const incoming = normalized[key];
          const current = snapshot[key];
          (result as Record<string, unknown>)[key] = JSON.stringify(incoming == null ? null : incoming) === JSON.stringify(current == null ? null : current) ? current : incoming;
          return result;
        }, {} as AppData),
      ),
    );
    dataRef.current = merged;
    setData(merged);
    await Promise.all([
      AsyncStorage.setItem(scopedStorageKey, JSON.stringify(merged)),
      persistPaymentMethods(merged.settings.paymentMethods),
    ]);
    if (canSyncWorkspace && remoteReady && remoteVersion !== null) {
      try {
        const result = await saveRemoteData.mutateAsync({ payload: JSON.stringify(merged), expectedVersion: remoteVersion });
        setRemoteVersion(result.version);
        setSyncConflict(false);
        await recordSuccessfulSync();
      } catch (error) {
        setSyncConflict(isWorkspaceVersionConflict(error));
      }
    }
    // Mirror the workspace snapshot to Supabase (additive, non-blocking). On
    // failure this is silently ignored; the tRPC + device copy remain source of truth.
    if (supabaseReady && supabaseToken) {
      try {
        await saveWorkspaceState(supabaseToken, JSON.stringify(merged));
      } catch {
        // Snapshot write failed — not fatal. Next successful sync will retry.
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
        if (isDemo) {
          const demoData = buildDemoAppData(user?.name);
          if (mounted) {
            setData(demoData);
            dataRef.current = demoData;
            setHydrated(true);
          }
          return;
        }
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
        dataRef.current = initialData;
        if (shouldImportLegacyDeviceData && activeWorkspaceId !== null) await AsyncStorage.setItem(LEGACY_MIGRATION_WORKSPACE_KEY, String(activeWorkspaceId));
        setLastSyncedAt(savedSyncTime && !Number.isNaN(new Date(savedSyncTime).getTime()) ? savedSyncTime : null);
        if (raw && JSON.stringify(normalized) !== raw) await AsyncStorage.setItem(scopedStorageKey, JSON.stringify(normalized));
      } catch {
        if (mounted) {
          setData(EMPTY_DATA);
          dataRef.current = EMPTY_DATA;
        }
      } finally {
        if (mounted) setHydrated(true);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [activeWorkspaceId, isDemo, scopedStorageKey, scopedSyncKey]);

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
          const mergedWorkspaceData = mergeWorkspaceAppData(normalized, dataRef.current ?? data).data;
          if (JSON.stringify(dataRef.current ?? data) !== JSON.stringify(mergedWorkspaceData)) {
            dataRef.current = mergedWorkspaceData;
            setData(mergedWorkspaceData);
          }
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
      const mergedWorkspaceData = mergeWorkspaceAppData(remoteSnapshot, dataRef.current ?? data).data;
      const mergedPayload = JSON.stringify(mergedWorkspaceData);
      setData(mergedWorkspaceData);
      dataRef.current = mergedWorkspaceData;
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
    if (!hydrated || isDemo) return;
    const interval = setInterval(() => {
      const next = expireElapsedRecords(data);
      if (next === data) return;
      setData(next);
      dataRef.current = next;
      void AsyncStorage.setItem(scopedStorageKey, JSON.stringify(next));
    }, 60_000);
    return () => clearInterval(interval);
  }, [data, hydrated, isDemo, scopedStorageKey]);

  useEffect(() => {
    if (!hydrated || isDemo) return;
    const device = data.settings.device;
    void syncCheckoutNotifications(data.bookings, data.chalets, device?.notificationsEnabled ?? false, device?.language ?? "ar");
    void syncWaitlistPriorityNotifications(data.bookings, data.waitlist, device?.notificationsEnabled ?? false, device?.language ?? "ar");
  }, [data.bookings, data.chalets, data.settings.device?.language, data.settings.device?.notificationsEnabled, data.waitlist, hydrated, isDemo]);

  useEffect(() => {
    if (!hydrated || isDemo) return;
    const extra = maintenanceDueNotificationsFor(data.maintenanceTasks ?? [], data.notifications ?? [], data.settings.device?.language ?? "ar");
    if (!extra.length) return;
    const next = { ...data, notifications: [...extra, ...(data.notifications ?? [])] };
    setData(next);
    dataRef.current = next;
    void AsyncStorage.setItem(scopedStorageKey, JSON.stringify(next));
  }, [data.maintenanceTasks, data.notifications, data.settings.device?.language, hydrated, isDemo, scopedStorageKey]);

  const value = useMemo<BookingContextValue>(() => ({
    ...data,
    hydrated,
    syncConflict,
    lastSyncedAt,
    refreshWorkspaceData,
    resetOperationalRecords: async () => {
      if (isDemo) {
        showDemoNotice();
        return { bookings: 0, expenses: 0 };
      }
      const result = await resetOperationsRemote.mutateAsync({ confirmation: "RESET-OPERATIONS" });
      if (!result.payload) {
        // Remote wipe produced no payload to commit. Preserve a scoped rescue of
        // the current records before wiping them locally, so the wipe is never a
        // silent, unrecoverable data loss point.
        await AsyncStorage.setItem(`${RESCUE_BACKUP_KEY}:${activeWorkspaceId}`, JSON.stringify(data));
      }
      const next = result.payload ? expireElapsedRecords(parseStoredAppData(result.payload)) : { ...data, bookings: [], expenses: [] };
      await AsyncStorage.setItem(scopedStorageKey, JSON.stringify(next));
      setData(next);
      dataRef.current = next;
      setRemoteVersion(result.version);
      setSyncConflict(false);
      await recordSuccessfulSync();
      return result.removed;
    },
    pendingBackupImport,
    lastDeleted,
    addBooking: async (booking) => { if (!can("create_bookings")) throw new Error("create-booking-forbidden"); const createdBooking: Booking = { ...booking, createdByUserId: user?.id, createdByName: user?.name ?? undefined, createdByRole: isManager ? "owner" : isEmployee ? "employee" : undefined }; const customerUpsert = upsertCustomerFromBooking(data.customers ?? [], createdBooking); const language = data.settings.device?.language ?? "ar"; const bookingNotification = buildInAppNotification({ type: "new_booking", recipients: ["owner", "manager"], dataPayload: { bookingId: createdBooking.id }, ...buildNewBookingNotification(createdBooking, language, data.settings.businessName) }); await persist({ ...data, bookings: [createdBooking, ...data.bookings], customers: customerUpsert.customers, notifications: [bookingNotification, ...(data.notifications ?? [])] }); },
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
      const meterInput = confirmation?.utilityReading;
      const meterReading: UtilityReading | undefined = meterInput && Number.isFinite(meterInput.reading) && meterInput.reading >= 0 ? { id: `utility-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, bookingId: id, chaletId: booking.chaletId ?? "", type: meterInput.type, checkInReading: Math.max(0, meterInput.reading), checkInPhotoUri: await persistPaymentReceipt(meterInput.photoUri, id, `meter-checkin-${meterInput.type}`), checkInRecordedAt: checkedInAt, unitRate: effectiveUtilityTracking(data.settings).rates[meterInput.type] ?? UTILITY_RATES[meterInput.type], createdAt: checkedInAt } : undefined;
      const checkInConfirmation: CheckInConfirmation = { actualArrivalAt: checkedInAt, rentalBalanceVerified: confirmation?.rentalBalanceVerified === true, rentalBalancePaymentMethod: rentalBalance > 0.005 ? confirmation?.rentalBalancePaymentMethod : undefined, securityDepositVerified: confirmation?.securityDepositVerified === true, securityDepositPaymentMethod: depositAmount > 0.005 ? confirmation?.securityDepositPaymentMethod : undefined, identityNote: confirmation?.identityNote?.trim().slice(0, 240) || undefined, identityImageUri, utilityReading: meterReading && meterInput ? { type: meterReading.type, reading: meterReading.checkInReading, photoUri: meterReading.checkInPhotoUri } : undefined };
      const actorName = auditActorName ?? "مستخدم التطبيق";
      const verificationDetails = [rentalBalance > 0.005 ? `استُلم المتبقي ${rentalBalance.toFixed(2)} بطريقة ${paymentMethodLabel(checkInConfirmation.rentalBalancePaymentMethod!)}` : "لا يوجد رصيد إيجار متبقٍ", depositAmount > 0.005 ? `استُلم التأمين ${depositAmount.toFixed(2)} بطريقة ${paymentMethodLabel(checkInConfirmation.securityDepositPaymentMethod!)}` : "لا يوجد تأمين مطلوب", checkInConfirmation.identityImageUri ? "تم حفظ صورة الهوية" : "", checkInConfirmation.identityNote ? `ملاحظة الهوية: ${checkInConfirmation.identityNote}` : ""].filter(Boolean).join(" · ");
      const arrivalPayment = rentalBalance > 0.005 ? { id: `p-check-in-${Date.now()}`, amount: rentalBalance, date: localDateISO(new Date(checkedInAt)), recordedAt: checkedInAt, note: "دفعة المتبقي عند الوصول", paymentMethod: checkInConfirmation.rentalBalancePaymentMethod!, recordedByUserId: user?.id, recordedByName: actorName } : undefined;
      const checkInNotifications: InAppNotification[] = [buildInAppNotification({ type: "checkin_alert", recipients: ["owner", "manager"], dataPayload: { bookingId: id }, ...buildCheckInAlertNotification({ customerName: booking.customerName, chaletName: booking.chaletName, startTime: booking.startTime }, data.settings.device?.language ?? "ar") })];
      if (arrivalPayment) checkInNotifications.push(buildInAppNotification({ type: "payment_received", recipients: ["owner", "manager"], dataPayload: { bookingId: id }, ...buildPaymentReceivedNotification(booking, arrivalPayment.amount, data.settings.currency, data.settings.device?.language ?? "ar") }));
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === id ? { ...item, checkedInAt, checkInConfirmation, depositPaymentMethod: depositAmount > 0.005 ? checkInConfirmation.securityDepositPaymentMethod : item.depositPaymentMethod, depositPaymentRecordedAt: depositAmount > 0.005 ? checkedInAt : item.depositPaymentRecordedAt, payments: arrivalPayment ? [...item.payments, arrivalPayment] : item.payments, updatedByUserId: user?.id, updatedByName: actorName } : item), notifications: [...checkInNotifications, ...(data.notifications ?? [])], utilityReadings: meterReading ? [meterReading, ...(data.utilityReadings ?? [])] : data.utilityReadings, auditLog: [{ id: `audit-check-in-${Date.now()}`, action: "booking-checked-in" as AuditAction, bookingId: id, subjectName: booking.customerName, details: [booking.chaletName ?? "", "تم تسجيل الوصول", verificationDetails].filter(Boolean).join(" · "), createdAt: checkedInAt, actorName }, ...data.auditLog] });
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
      if (requestedRefund && requestedRefund.amount > 0) {
        const depositCollected = Boolean(
          (booking.depositCollection && !booking.depositCollection.voidedAt && Number(booking.depositCollection.amount) > 0)
          || booking.depositPaymentRecordedAt,
        );
        if (!depositCollected) throw new Error("deposit-not-collected");
        if (!isValidPaymentMethod(requestedRefund.paymentMethod) || !Number.isFinite(requestedRefund.amount) || requestedRefund.amount <= 0 || requestedRefund.amount - refundableDeposit > 0.005) throw new Error("invalid-deposit-refund");
      }
      const checkedOutAt = new Date().toISOString();
      const actorName = auditActorName ?? "مستخدم التطبيق";
      const refund: DepositRefund | undefined = requestedRefund ? { id: `deposit-refund-checkout-${Date.now()}`, amount: requestedRefund.amount, date: checkedOutAt.slice(0, 10), recordedAt: checkedOutAt, note: requestedRefund.note?.trim() || "استرداد التأمين عند المغادرة", paymentMethod: requestedRefund.paymentMethod } : undefined;
      const inspections = confirmation?.assetInspections ?? [];
      const failedAssets = inspections.filter((item) => item.passed === false);
      const nextAssets = (data.assets ?? []).map((asset) => failedAssets.some((item) => item.assetId === asset.id) ? { ...asset, condition: "needs_service" as const, updatedAt: checkedOutAt } : asset);
      const maintenanceTask = failedAssets.map((item) => ({ id: `maintenance-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, chaletId: booking.chaletId ?? "", chaletName: booking.chaletName, assetId: item.assetId, assetName: item.assetName, title: `إصلاح: ${item.assetName} (فحص المغادرة)`, frequency: "monthly" as const, nextDueDate: new Date(new Date(checkedOutAt).getTime() + 86_400_000).toISOString().slice(0, 10), status: "pending" as const, note: item.note?.trim() || undefined, createdAt: checkedOutAt }));
      const checkOutNotifications: InAppNotification[] = [];
      const language = data.settings.device?.language ?? "ar";
      const completedMeterInput = confirmation?.utilityReading;
      const completedMeter: UtilityReading | undefined = completedMeterInput && Number.isFinite(completedMeterInput.reading) && completedMeterInput.reading >= 0 ? await (async () => {
        const openReading = findOpenUtilityReading(data.utilityReadings, booking.chaletId, completedMeterInput.type, id);
        const checkInReading = openReading?.checkInReading ?? 0;
        const checkOutReading = Math.max(0, completedMeterInput.reading);
        const utilityConfig = effectiveUtilityTracking(data.settings);
        const cost = computeUtilityCost(completedMeterInput.type, checkInReading, checkOutReading, { unitRate: utilityConfig.rates[completedMeterInput.type], threshold: utilityConfig.thresholds[completedMeterInput.type] });
        const checkOutPhotoUri = await persistPaymentReceipt(completedMeterInput.photoUri, id, `meter-checkout-${completedMeterInput.type}`);
        return { ...(openReading ?? { id: `utility-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, bookingId: id, chaletId: booking.chaletId ?? "", type: completedMeterInput.type, checkInReading, checkInRecordedAt: booking.checkedInAt ?? checkedOutAt, unitRate: utilityConfig.rates[completedMeterInput.type] ?? UTILITY_RATES[completedMeterInput.type], createdAt: checkedOutAt }), checkOutReading, checkOutPhotoUri, checkOutRecordedAt: checkedOutAt, consumedUnits: cost.consumedUnits, totalCost: cost.totalCost, isExcessive: cost.isExcessive, unitRate: openReading?.unitRate ?? utilityConfig.rates[completedMeterInput.type] ?? UTILITY_RATES[completedMeterInput.type] } satisfies UtilityReading;
      })() : undefined;
      const loyaltyConfig = effectiveLoyaltyProgram(data.settings);
      const loyaltyCustomer = booking.phone ? findCustomerByPhone(data.customers ?? [], phoneE164(booking.phone)) : undefined;
      const existingAccount = (data.loyaltyAccounts ?? []).find((item) => item.customerId === loyaltyCustomer?.id);
      const lifetimeTier = loyaltyCustomer ? deriveLoyaltyTier(loyaltyCustomer.totalBookingsCount, loyaltyCustomer.totalSpent, loyaltyConfig) : existingAccount?.tier ?? "bronze";
      const awardedPoints = loyaltyCustomer && loyaltyConfig.enabled ? pointsEarned(booking.price, lifetimeTier, loyaltyConfig) : 0;
      const loyaltyNow = checkedOutAt;
      const loyaltyAccount: LoyaltyAccount | undefined = loyaltyCustomer ? (existingAccount ? { ...existingAccount, tier: lifetimeTier, updatedAt: loyaltyNow } : { id: `loyalty-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, customerId: loyaltyCustomer.id, pointsBalance: awardedPoints >= 1 ? awardedPoints : 0, tier: lifetimeTier, lifetimeEarned: awardedPoints >= 1 ? awardedPoints : 0, lifetimeRedeemed: 0, updatedAt: loyaltyNow, createdAt: loyaltyNow }) : undefined;
      const earnedTransaction: LoyaltyTransaction | undefined = loyaltyAccount && awardedPoints >= 1 ? { id: `loyalty-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, customerId: loyaltyAccount.customerId, type: "earn", points: awardedPoints, amount: 0, bookingId: id, bookingReference: booking.bookingReference, note: "نقاط مكتسبة عند إتمام الإقامة", createdAt: loyaltyNow } : undefined;
      const nextLoyaltyAccount = loyaltyAccount && awardedPoints >= 1 && existingAccount ? { ...loyaltyAccount, pointsBalance: loyaltyAccount.pointsBalance + awardedPoints, lifetimeEarned: (loyaltyAccount.lifetimeEarned ?? 0) + awardedPoints } : loyaltyAccount;
      const finalLoyaltyAccount = nextLoyaltyAccount ?? loyaltyAccount;
      const detailsParts = [booking.chaletName ?? "", "تم إنهاء الإقامة بعد فحص الشاليه", confirmation?.inspectionNote ? `ملاحظة الفحص: ${confirmation.inspectionNote.trim()}` : "", refund ? `تم استرداد التأمين: ${refund.amount}` : refundableDeposit > 0.005 ? "تم الاحتفاظ بالتأمين دون استرداد" : "", completedMeter ? `${utilityTypeLabel(completedMeter.type, language)}: قراءة ${completedMeter.checkOutReading} · التكلفة ${(completedMeter.totalCost ?? 0).toFixed(2)} د.أ${completedMeter.isExcessive ? " (استهلاك مرتفع)" : ""}` : "", awardedPoints >= 1 ? `أُضيفت ${awardedPoints} نقطة ولاء` : ""].filter(Boolean).join(" · ");
      const extraAudit = [
        completedMeter ? { id: `audit-utility-${Date.now()}`, action: "utility-reading-recorded" as AuditAction, bookingId: id, subjectName: booking.customerName, details: `${booking.chaletName ?? ""} · ${utilityTypeLabel(completedMeter.type, language)} · الاستهلاك ${(completedMeter.totalCost ?? 0).toFixed(2)} د.أ`, createdAt: checkedOutAt, actorName } : undefined,
        awardedPoints >= 1 ? { id: `audit-loyalty-${Date.now()}`, action: "loyalty-points-awarded" as AuditAction, bookingId: id, subjectName: loyaltyAccount!.customerId, details: `منح ${awardedPoints} نقطة ولاء (طبقة ${lifetimeTier})`, createdAt: checkedOutAt, actorName } : undefined
      ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      const utilityReadings = completedMeter ? (data.utilityReadings ?? []).some((item) => item.id === completedMeter.id) ? (data.utilityReadings ?? []).map((item) => item.id === completedMeter.id ? completedMeter : item) : [completedMeter, ...(data.utilityReadings ?? [])] : data.utilityReadings;
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === id ? { ...item, status: "completed" as const, checkedOutAt, assetInspections: inspections.length ? inspections : item.assetInspections, depositRefunds: refund ? [...(item.depositRefunds ?? []), refund] : item.depositRefunds, updatedByUserId: user?.id, updatedByName: actorName } : item), assets: nextAssets, maintenanceTasks: maintenanceTask.length ? [...maintenanceTask, ...(data.maintenanceTasks ?? [])] : data.maintenanceTasks, notifications: [...checkOutNotifications, ...(data.notifications ?? [])], utilityReadings, loyaltyAccounts: finalLoyaltyAccount ? (data.loyaltyAccounts ?? []).some((item) => item.id === finalLoyaltyAccount.id) ? (data.loyaltyAccounts ?? []).map((item) => item.id === finalLoyaltyAccount.id ? finalLoyaltyAccount : item) : [finalLoyaltyAccount, ...(data.loyaltyAccounts ?? [])] : data.loyaltyAccounts, loyaltyTransactions: earnedTransaction ? [earnedTransaction, ...(data.loyaltyTransactions ?? [])] : data.loyaltyTransactions, auditLog: [{ id: `audit-check-out-${Date.now()}`, action: "booking-checked-out" as AuditAction, bookingId: id, subjectName: booking.customerName, details: detailsParts, createdAt: checkedOutAt, actorName }, ...extraAudit, ...data.auditLog] });
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
      if (!can("edit_bookings")) throw new Error("edit-booking-forbidden");
      const name = input.name.trim();
      const referenceCode = normalizeChaletReferenceCode(input.referenceCode);
      if (!name) throw new Error("chalet-name-required");
      if (!isValidChaletReferenceCode(referenceCode)) throw new Error("chalet-reference-code-invalid");
      if (data.chalets.some((chalet) => chalet.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("chalet-name-duplicate");
      if (data.chalets.some((chalet) => normalizeChaletReferenceCode(chalet.referenceCode) === referenceCode)) throw new Error("chalet-reference-code-duplicate");
      const id = `chalet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const chalet: Chalet = { id, name, propertyType: normalizePropertyType(input.propertyType), referenceCode, color: normalizeChaletColor(input.color), imageUri: await persistChaletImage(input.imageUri, id), location: input.location?.trim() || undefined, locationUrl: input.locationUrl?.trim() || undefined, guardianName: input.guardianName?.trim() || undefined, guardianPhone: input.guardianPhone?.trim() || undefined, contactPhone: input.contactPhone?.trim() || undefined, notes: input.notes?.trim() || undefined, weekendDays: input.weekendDays, shifts: input.shifts, periodPricing: input.periodPricing, periodTimes: input.periodTimes, latitude: normalizeChaletLatitude(input.latitude), longitude: normalizeChaletLongitude(input.longitude), googleMapsUrl: normalizeOptionalText(input.googleMapsUrl), isPublished: normalizeChaletVisibility(input.isPublished), isVerified: normalizeChaletVisibility(input.isVerified), nearWater: input.nearWater === true || undefined, createdAt: new Date().toISOString() };
      await persist({ ...data, chalets: [...data.chalets, chalet] });
      return chalet;
    },
    updateChalet: async (chalet) => {
      if (!can("edit_bookings")) throw new Error("edit-booking-forbidden");
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
      if (!can("edit_bookings")) throw new Error("edit-booking-forbidden");
      const deleted = data.chalets.find((chalet) => chalet.id === id);
      if (!deleted) throw new Error("chalet-not-found");
      await persist({ ...data, chalets: data.chalets.filter((chalet) => chalet.id !== id), bookings: data.bookings.map((booking) => booking.chaletId === id ? { ...booking, chaletId: undefined, chaletName: booking.chaletName || deleted.name } : booking), waitlist: data.waitlist.map((entry) => entry.chaletId === id ? { ...entry, chaletId: undefined, chaletName: entry.chaletName || deleted.name } : entry) });
      if (deleted.imageUri) await removeManagedChaletImage(deleted.imageUri);
      setLastDeleted({ kind: "chalet", record: deleted, createdAt: Date.now() });
    },
    updateSettings: async (settings) => { if (isEmployee) throw new Error("employee-settings-forbidden"); await persist({ ...data, settings }); },
    updateSpecialPriceRules: async (rules) => { if (isEmployee) throw new Error("employee-pricing-forbidden"); await persist({ ...data, specialPriceRules: rules }); },
    saveCustomer: async (customer) => {
      if (!can("edit_bookings")) throw new Error("customer-management-forbidden");
      const actorName = auditActorName ?? "مستخدم التطبيق";
      const createdAtNow = new Date().toISOString();
      const existing = (data.customers ?? []).find((item) => item.id === customer.id);
      const customerId = customer.id || `customer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const savedCustomer: Customer = { ...customer, id: customerId, name: customer.name.trim().slice(0, 120), phone: customer.phone?.trim() ?? "", e164: phoneE164(customer.phone) || customer.e164, totalSpent: Math.max(0, Number(customer.totalSpent || 0)), totalBookingsCount: Math.max(0, customer.totalBookingsCount || 0), isBlacklisted: customer.isBlacklisted === true, createdAt: existing?.createdAt ?? createdAtNow, updatedAt: createdAtNow };
      const action: AuditAction = existing ? "customer-updated" : "customer-created";
      const details = `${savedCustomer.name} · ${savedCustomer.phone}${existing ? " · تحديث البيانات" : " · إضافة عميل جديد"}`;
      await persist({ ...data, customers: existing ? (data.customers ?? []).map((item) => item.id === customerId ? savedCustomer : item) : [...(data.customers ?? []), savedCustomer], auditLog: [{ id: `audit-${Date.now()}`, action, subjectName: savedCustomer.name, details, createdAt: createdAtNow, actorName }, ...data.auditLog] });
    },
    setCustomerBlacklisted: async (id, isBlacklisted, reason) => {
      if (!can("edit_bookings")) throw new Error("blacklist-management-forbidden");
      const customer = (data.customers ?? []).find((item) => item.id === id);
      if (!customer) throw new Error("customer-not-found");
      const updatedAt = new Date().toISOString();
      const savedCustomer: Customer = { ...customer, isBlacklisted, blacklistReason: isBlacklisted ? reason?.trim() || "إدراج يدوي" : undefined, updatedAt };
      const action: AuditAction = isBlacklisted ? "customer-blacklisted" : "customer-unblacklisted";
      await persist({ ...data, customers: (data.customers ?? []).map((item) => item.id === id ? savedCustomer : item), auditLog: [{ id: `audit-${Date.now()}`, action, subjectName: customer.name, details: isBlacklisted ? `الإدراج في القائمة السوداء · السبب: ${savedCustomer.blacklistReason}` : `الإزالة من القائمة السوداء · الهاتف: ${customer.phone}`, createdAt: updatedAt, actorName: auditActorName }, ...data.auditLog] });
    },
    saveAsset: async (asset) => {
      if (!can("edit_bookings")) throw new Error("asset-management-forbidden");
      const actorName = auditActorName ?? "مستخدم التطبيق";
      const createdAtNow = new Date().toISOString();
      const existing = (data.assets ?? []).find((item) => item.id === asset.id);
      const assetId = asset.id || `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const savedAsset: Asset = { ...asset, id: assetId, name: asset.name.trim().slice(0, 80), category: asset.category?.trim() || "else", chaletId: asset.chaletId?.trim() || "", condition: asset.condition, createdAt: existing?.createdAt ?? createdAtNow, updatedAt: createdAtNow };
      const action: AuditAction = existing ? "asset-updated" : "asset-added";
      await persist({ ...data, assets: existing ? (data.assets ?? []).map((item) => item.id === assetId ? savedAsset : item) : [...(data.assets ?? []), savedAsset], auditLog: [{ id: `audit-${Date.now()}`, action, subjectName: savedAsset.name, details: `${savedAsset.chaletName ?? "عام"} · ${savedAsset.category}${existing ? " · تحديث الأصل" : " · إضافة أصل جديد"}`, createdAt: createdAtNow, actorName }, ...data.auditLog] });
      return savedAsset;
    },
    deleteAsset: async (id) => {
      if (!can("edit_bookings")) throw new Error("asset-management-forbidden");
      const asset = (data.assets ?? []).find((item) => item.id === id);
      if (!asset) throw new Error("asset-not-found");
      const actorName = auditActorName ?? "مستخدم التطبيق";
      await persist({ ...data, assets: (data.assets ?? []).filter((item) => item.id !== id), maintenanceTasks: (data.maintenanceTasks ?? []).map((task) => task.assetId === id ? { ...task, assetId: undefined } : task), auditLog: [{ id: `audit-${Date.now()}`, action: "asset-deleted" as AuditAction, subjectName: asset.name, details: `${asset.chaletName ?? "عام"} · ${asset.category} · حذف الأصل`, createdAt: new Date().toISOString(), actorName }, ...data.auditLog] });
    },
    saveMaintenanceTask: async (task) => {
      if (!can("edit_bookings")) throw new Error("maintenance-management-forbidden");
      const actorName = auditActorName ?? "مستخدم التطبيق";
      const createdAtNow = new Date().toISOString();
      const existing = (data.maintenanceTasks ?? []).find((item) => item.id === task.id);
      const taskId = task.id || `maintenance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const savedTask: MaintenanceTask = { ...task, id: taskId, title: task.title.trim().slice(0, 120), chaletId: task.chaletId?.trim() || "", nextDueDate: task.nextDueDate.slice(0, 10), createdAt: existing?.createdAt ?? createdAtNow };
      await persist({ ...data, maintenanceTasks: existing ? (data.maintenanceTasks ?? []).map((item) => item.id === taskId ? savedTask : item) : [...(data.maintenanceTasks ?? []), savedTask], auditLog: [{ id: `audit-${Date.now()}`, action: "maintenance-task-updated" as AuditAction, subjectName: savedTask.title, details: `${savedTask.chaletName ?? "عام"} · استحقاق ${savedTask.nextDueDate} · ${savedTask.frequency}${savedTask.assetName ? ` · ${savedTask.assetName}` : ""}`, createdAt: createdAtNow, actorName }, ...data.auditLog] });
    },
    completeMaintenanceTask: async (id, completedByName) => {
      if (!can("edit_bookings")) throw new Error("maintenance-management-forbidden");
      const task = (data.maintenanceTasks ?? []).find((item) => item.id === id);
      if (!task) throw new Error("maintenance-task-not-found");
      const actorName = completedByName?.trim() || auditActorName || "مستخدم التطبيق";
      const completedAt = new Date().toISOString();
      const completedTask: MaintenanceTask = { ...task, status: "completed", lastCompletedDate: completedAt.slice(0, 10), nextDueDate: nextMaintenanceDueDate({ ...task, lastCompletedDate: completedAt.slice(0, 10) }), completedAt, completedByName: actorName };
      const notifications = (data.notifications ?? []).map((notification) => notification.dataPayload?.taskId === id && !notification.isRead ? { ...notification, isRead: true, readByIds: [...(notification.readByIds ?? []), user?.id ? String(user.id) : "local"] } : notification);
      await persist({ ...data, maintenanceTasks: (data.maintenanceTasks ?? []).map((item) => item.id === id ? completedTask : item), notifications, auditLog: [{ id: `audit-${Date.now()}`, action: "maintenance-task-completed" as AuditAction, subjectName: task.title, details: `${task.chaletName ?? "عام"} · اكتملت المهمة، الاستحقاق القادم ${completedTask.nextDueDate}`, createdAt: completedAt, actorName }, ...data.auditLog] });
    },
    deleteMaintenanceTask: async (id) => {
      if (!can("edit_bookings")) throw new Error("maintenance-management-forbidden");
      const task = (data.maintenanceTasks ?? []).find((item) => item.id === id);
      if (!task) throw new Error("maintenance-task-not-found");
      await persist({ ...data, maintenanceTasks: (data.maintenanceTasks ?? []).filter((item) => item.id !== id), auditLog: [{ id: `audit-${Date.now()}`, action: "maintenance-task-updated" as AuditAction, subjectName: task.title, details: `${task.chaletName ?? "عام"} · حذف المهمة`, createdAt: new Date().toISOString(), actorName: auditActorName }, ...data.auditLog] });
    },
    saveWeatherLog: async (log, advisories) => {
      if (!can("edit_bookings")) throw new Error("edit-booking-forbidden");
      if (!log || !log.chaletId || !Array.isArray(log.daily)) throw new Error("invalid-weather-log");
      const language = data.settings.device?.language ?? "ar";
      const existing = (data.weatherLogs ?? []).find((item) => item.chaletId === log.chaletId);
      const notificationTypes: Record<WeatherAdvisory["kind"], NotificationType> = { cold_pool_heating: "weather_advisory", wind_rain_safety: "weather_advisory" };
      const extra = (advisories ?? []).filter((advisory) => !advisory?.kind || !advisory?.date).length ? [] : (advisories ?? []).map((advisory) => buildInAppNotification({ type: notificationTypes[advisory.kind], recipients: advisory.recipients, dataPayload: { chaletId: log.chaletId, advisoryKind: advisory.kind, date: advisory.date, logId: log.id }, title: advisory.kind === "cold_pool_heating" ? (language === "ar" ? "تنبيه تدفئة المسبح" : "Pool heating alert") : (language === "ar" ? "تنبيه رياح وأمطار" : "Wind & rain safety alert"), body: advisory.message }));
      const dedupedExtra = extra.filter((notification) => !(data.notifications ?? []).some((item) => item.type === "weather_advisory" && item.dataPayload?.logId === log.id && item.dataPayload?.advisoryKind === notification.dataPayload?.advisoryKind && item.dataPayload?.date === notification.dataPayload?.date));
      await persist({ ...data, weatherLogs: existing ? (data.weatherLogs ?? []).map((item) => item.chaletId === log.chaletId ? log : item) : [...(data.weatherLogs ?? []), log], notifications: [...dedupedExtra, ...(data.notifications ?? [])] });
    },
    redeemLoyaltyPoints: async ({ customerId, bookingId, bookingReference, points, amount, note }) => {
      if (!can("edit_bookings")) throw new Error("redeem-loyalty-forbidden");
      const account = (data.loyaltyAccounts ?? []).find((item) => item.customerId === customerId);
      const redeem = Math.floor(Number(points || 0));
      const jodAmount = Math.round(Math.max(0, Number(amount || 0)) * 100) / 100;
      if (redeem <= 0 || jodAmount <= 0) throw new Error("invalid-loyalty-redemption");
      if (!account || account.pointsBalance < redeem) throw new Error("insufficient-loyalty-points");
      const now = new Date().toISOString();
      const transaction: LoyaltyTransaction = { id: `loyalty-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, customerId, type: "redeem", points: redeem, amount: jodAmount, bookingId, bookingReference, note: note?.trim() || undefined, createdAt: now };
      const actorName = auditActorName ?? "مستخدم التطبيق";
      await persist({ ...data, loyaltyAccounts: (data.loyaltyAccounts ?? []).map((item) => item.customerId === customerId ? { ...item, pointsBalance: Math.max(0, item.pointsBalance - redeem), lifetimeRedeemed: (item.lifetimeRedeemed ?? 0) + redeem, updatedAt: now } : item), loyaltyTransactions: [transaction, ...(data.loyaltyTransactions ?? [])], auditLog: [{ id: `audit-${Date.now()}`, action: "loyalty-points-redeemed" as AuditAction, bookingId, subjectName: transaction.customerId, details: `استرداد ${redeem} نقطة بقيمة ${jodAmount.toFixed(2)} د.أ · المرجع ${bookingReference ?? "—"}`, createdAt: now, actorName }, ...data.auditLog] });
    },
    signContract: async ({ bookingId, guestSignatureBase64, termsSnapshot, signedByName }) => {
      if (!can("edit_bookings")) throw new Error("contract-signing-forbidden");
      const booking = data.bookings.find((item) => item.id === bookingId);
      if (!booking || booking.status === "cancelled" || booking.status === "completed") throw new Error("booking-not-found");
      if ((data.contracts ?? []).some((item) => item.bookingId === bookingId && item.status === "signed")) throw new Error("contract-already-signed");
      const actorName = auditActorName ?? "مستخدم التطبيق";
      const signedAt = new Date().toISOString();
      const contract: LeaseContract = { id: `contract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, bookingId, termsSnapshot: termsSnapshot.trim(), guestName: booking.customerName, guestPhone: booking.phone, chaletName: booking.chaletName, bookingReference: booking.bookingReference, bookingType: booking.bookingType, startDate: booking.startDate, startTime: booking.startTime, endDate: booking.endDate, endTime: booking.endTime, rentalTotal: booking.price, depositAmount: booking.depositAmount ?? 0, status: "signed", guestSignatureBase64: guestSignatureBase64 || undefined, signedByName: signedByName?.trim() || actorName, signedAt, createdAt: signedAt };
      const language = data.settings.device?.language ?? "ar";
      const notification = buildInAppNotification({ type: "contract_signed", recipients: ["owner", "manager"], dataPayload: { bookingId }, ...buildContractSignedNotification(contract, language) });
      await persist({ ...data, contracts: [contract, ...(data.contracts ?? [])], notifications: [notification, ...(data.notifications ?? [])], auditLog: [{ id: `audit-${Date.now()}`, action: "contract-signed" as AuditAction, bookingId, subjectName: booking.customerName, details: `توقيع عقد إيجار رقمي · مرجع ${booking.bookingReference ?? "—"} · الموقّع: ${contract.signedByName}`, createdAt: signedAt, actorName }, ...data.auditLog] });
    },
    markNotificationRead: async (id) => {
      await persist({ ...data, notifications: (data.notifications ?? []).map((notification) => notification.id === id && !notification.isRead ? { ...notification, isRead: true, readByIds: [...(notification.readByIds ?? []), user?.id ? String(user.id) : "local"] } : notification) });
    },
    markAllNotificationsRead: async () => {
      await persist({ ...data, notifications: (data.notifications ?? []).map((notification) => notification.isRead ? notification : { ...notification, isRead: true, readByIds: [...(notification.readByIds ?? []), user?.id ? String(user.id) : "local"] }) });
    },
    addPayment: async (bookingId, payment) => {
      if (!can("manage_payments")) throw new Error("manage-payments-forbidden");
      const booking = data.bookings.find((item) => item.id === bookingId);
      if (!booking) throw new Error("booking-not-found");
      const amount = Number(payment.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid-rental-payment");
      if (!isValidPaymentMethod(payment.paymentMethod)) throw new Error("invalid-rental-payment");
      const receiptUri = await persistPaymentReceipt(payment.receiptUri, bookingId, payment.id);
      const savedPayment: Payment = { ...payment, amount, recordedAt: payment.recordedAt ?? new Date().toISOString(), note: payment.note?.trim() || undefined, receiptUri, recordedByUserId: user?.id, recordedByName: user?.name ?? undefined };
      const language = data.settings.device?.language ?? "ar";
      const paymentNotification = buildInAppNotification({ type: "payment_received", recipients: ["owner", "manager"], dataPayload: { bookingId }, ...buildPaymentReceivedNotification(booking, amount, data.settings.currency, language) });
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === bookingId ? { ...item, payments: [...item.payments, savedPayment] } : item), notifications: [paymentNotification, ...(data.notifications ?? [])] });
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
      const depositCollected = Boolean(
        (booking.depositCollection && !booking.depositCollection.voidedAt && Number(booking.depositCollection.amount) > 0)
        || booking.depositPaymentRecordedAt,
      );
      if (!depositCollected) throw new Error("deposit-not-collected");
      const refundable = Math.max(0, Number(booking.depositAmount || 0) - (booking.depositRefunds ?? []).reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0)), 0));
      if (!Number.isFinite(refund.amount) || refund.amount <= 0 || refund.amount > refundable) throw new Error("invalid-deposit-refund");
      if (!isValidPaymentMethod(refund.paymentMethod)) throw new Error("invalid-deposit-refund-method");
      const savedRefund: DepositRefund = { ...refund, recordedAt: refund.recordedAt ?? new Date().toISOString(), note: refund.note?.trim() || undefined };
      await persist({ ...data, bookings: data.bookings.map((item) => item.id === bookingId ? { ...item, depositRefunds: [...(item.depositRefunds ?? []), savedRefund] } : item) });
    },
    addWaitlist: async (entry) => { if (!can("create_bookings")) throw new Error("create-booking-forbidden"); await persist({ ...data, waitlist: [...data.waitlist, entry] }); },
    deleteWaitlist: async (id) => { if (!can("cancel_delete_bookings")) throw new Error("waitlist-delete-forbidden"); const entry = data.waitlist.find((item) => item.id === id); if (!entry) throw new Error("waitlist-not-found"); const cancelledAt = new Date().toISOString(); await persist({ ...data, waitlist: data.waitlist.map((item) => item.id === id ? { ...item, status: "cancelled" as const, cancelledAt, cancellationReason: "manual" as const } : item), auditLog: [{ id: `audit-${Date.now()}`, action: "waitlist-cancelled" as AuditAction, subjectName: entry.customerName, details: `${entry.chaletName ?? ""} · أُلغي يدويًا`, createdAt: cancelledAt, actorName: auditActorName ?? "مستخدم التطبيق" }, ...data.auditLog] }); },
    promoteWaitlist: async (id, booking, conflictIds = []) => {
      if (!can("create_bookings")) throw new Error("create-booking-forbidden");
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
      const customerUpsert = upsertCustomerFromBooking(data.customers ?? [], savedBooking);
      const promotedNotification = buildInAppNotification({ type: "new_booking", recipients: ["owner", "manager"], dataPayload: { bookingId: savedBooking.id }, ...buildNewBookingNotification(savedBooking, data.settings.device?.language ?? "ar", data.settings.businessName) });
      await persist({ ...data, bookings: [savedBooking, ...data.bookings.map((item) => conflictIds.includes(item.id) ? { ...item, status: "cancelled" as const, updatedByUserId: user?.id, updatedByName: actorName } : item)], waitlist: data.waitlist.map((item) => item.id === id ? { ...item, status: "promoted" as const, promotedAt, promotedByUserId: user?.id, promotedByName: actorName, promotedBookingId: savedBooking.id, promotedBookingReference: bookingReference, promotedReplacedCustomerNames: replacementNames || undefined } : item), customers: customerUpsert.customers, notifications: [promotedNotification, ...(data.notifications ?? [])], auditLog: [{ id: `audit-${Date.now()}`, action: "waitlist-promoted" as AuditAction, subjectName: entry.customerName, details: promotionDetails, createdAt: promotedAt, actorName }, ...replacementAudits, ...data.auditLog] });
    },
    replaceConflictsAndSave: async (conflictIds, booking) => {
      if (!can("create_bookings")) throw new Error("create-booking-forbidden");
      const exists = data.bookings.some((item) => item.id === booking.id);
      const replacedBookings = data.bookings.filter((item) => conflictIds.includes(item.id) && item.id !== booking.id);
      const actorName = auditActorName ?? "مستخدم التطبيق";
      const cancelledAt = new Date().toISOString();
      const replacementAudits = replacedBookings.map((item, index) => ({ id: `audit-waitlist-replacement-${Date.now()}-${index}`, action: "booking-cancelled" as AuditAction, subjectName: item.customerName, details: `${item.chaletName ?? ""} · استُبدل بحجز العميل: ${booking.customerName}`, createdAt: cancelledAt, actorName }));
      const nextBookings = data.bookings.map((item) => {
        if (item.id === booking.id) return booking;
        return conflictIds.includes(item.id) ? { ...item, status: "cancelled" as const, updatedByUserId: user?.id, updatedByName: actorName } : item;
      });
      await persist({ ...data, bookings: exists ? nextBookings : [booking, ...nextBookings], auditLog: [...replacementAudits, ...data.auditLog] });
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
        if (asset.size !== undefined && asset.size > 5 * 1024 * 1024) {
          Alert.alert("File too large", "Choose a backup of 5 megabytes or less.");
          return false;
        }
        const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
        if (new TextEncoder().encode(raw).byteLength > 5 * 1024 * 1024) {
          Alert.alert("File too large", "Choose a backup of 5 megabytes or less.");
          return false;
        }
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
        const rescueUri = `${FileSystem.documentDirectory}booking-rescue-before-import-${activeWorkspaceId ?? "local"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        await FileSystem.writeAsStringAsync(rescueUri, rescuePayload, { encoding: FileSystem.EncodingType.UTF8 });
      } else {
        await AsyncStorage.setItem(`${RESCUE_BACKUP_KEY}:${activeWorkspaceId}`, rescuePayload);
      }
      const normalized = expireElapsedRecords(normalizeAppData(next));
      // persist() commits locally and pushes the snapshot through the same
      // tRPC + Supabase mirror path as every other write, so a restored backup
      // is immediately reflected on other operational devices.
      await persist(normalized);
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
  }), [data, hydrated, isDemo, lastDeleted, lastSyncedAt, pendingBackupImport, remoteVersion, remoteReady, resetOperationsRemote, scopedStorageKey, showDemoNotice]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBookings() {
  const value = useContext(BookingContext);
  if (!value) throw new Error("useBookings must be used inside BookingProvider");
  return value;
}
