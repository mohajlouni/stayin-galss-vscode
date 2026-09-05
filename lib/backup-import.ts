import { z } from "zod";

import { AppData, Booking, BookingStatus, BookingType, Chalet, DEFAULT_DEVICE_SETTINGS, DEFAULT_SETTINGS, DEFAULT_WHATSAPP_MESSAGE_OPTIONS, DepositRefund, Expense, Payment, Settings, TurnoverTask, WaitlistEntry, normalizeAppData } from "./booking-model";
import { type LoyaltyAccount, type LoyaltyTransaction, type UtilityReading, type WeatherLog } from "./booking-model";

export const BACKUP_VERSION = 8;

type BackupEnvelope = AppData & { backupVersion?: number; exportedAt?: string };

const bookingTypes = ["morning", "evening", "24h", "custom", "multi-day"] as const satisfies readonly BookingType[];
const bookingStatuses = ["confirmed", "awaiting-deposit", "cancelled", "completed", "waitlisted"] as const satisfies readonly BookingStatus[];

function isGregorianDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const dateSchema = z.string().refine(isGregorianDate, "must be a valid YYYY-MM-DD Gregorian date");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be a valid HH:mm time");
const moneySchema = z.number().finite().min(0, "must be a non-negative finite amount");
const identifierSchema = z.string().trim().min(1, "is required");
const optionalText = z.string().optional();
const paymentMethodIdSchema = z.string().regex(/^[a-z0-9-]{2,48}$/);
const chaletRateSchema = z.object({ weekdayPrice: moneySchema, weekendPrice: moneySchema });
const chaletPeriodPricingSchema = z.object({ morning: chaletRateSchema, evening: chaletRateSchema, "24h": chaletRateSchema });

const paymentSchema = z.object({
  id: identifierSchema,
  amount: moneySchema,
  date: dateSchema,
  recordedAt: z.string().datetime().optional(),
  note: optionalText,
  paymentMethod: z.string().regex(/^[a-z0-9-]{2,48}$/).optional(),
  recipientType: z.enum(["owner", "staff", "guard"]).optional(),
  handlerUserId: z.number().int().positive().optional(),
  handlerName: z.string().max(255).optional(),
  recipientAccountLabel: z.string().max(180).optional(),
  calculatedCommission: moneySchema.optional(),
  commissionType: z.enum(["percent", "fixed"]).optional(),
  recipientTargetId: z.string().regex(/^(?:owner|member-\d+|float-[a-zA-Z0-9-]{1,64})$/).optional(),
  receiptUri: optionalText,
  voidedAt: z.string().datetime().optional(),
  voidReason: optionalText,
  recordedByUserId: z.number().int().positive().optional(),
  recordedByName: z.string().max(255).optional(),
  updatedByUserId: z.number().int().positive().optional(),
  updatedByName: z.string().max(255).optional(),
  voidedByUserId: z.number().int().positive().optional(),
  voidedByName: z.string().max(255).optional(),
}) satisfies z.ZodType<Payment>;

const depositRefundSchema = z.object({
  id: identifierSchema,
  amount: moneySchema,
  date: dateSchema,
  recordedAt: z.string().datetime().optional(),
  note: optionalText,
  paymentMethod: z.string().regex(/^[a-z0-9-]{2,48}$/).optional(),
  sourceFloatId: z.string().regex(/^[a-zA-Z0-9-]{2,72}$/).optional(),
  returnedByUserId: z.number().int().positive().optional(),
  returnedByName: z.string().max(120).optional(),
}) satisfies z.ZodType<DepositRefund>;

const checkInConfirmationSchema = z.object({
  actualArrivalAt: z.string().datetime(),
  rentalBalanceVerified: z.boolean(),
  rentalBalancePaymentMethod: z.string().regex(/^[a-z0-9-]{2,48}$/).optional(),
  securityDepositVerified: z.boolean(),
  securityDepositPaymentMethod: z.string().regex(/^[a-z0-9-]{2,48}$/).optional(),
  identityNote: optionalText,
  identityImageUri: optionalText,
  utilityReading: z.object({ type: z.enum(["electricity", "water", "gas_fuel"]), reading: moneySchema, photoUri: optionalText }).optional(),
});

const bookingSchema = z.object({
  id: identifierSchema,
  bookingReference: z.string().regex(/^(?:#\d{2}-\d{4,}|#[A-Z0-9\u0621-\u064A]{2}\d{7})$/).optional(),
  customerName: identifierSchema,
  phone: z.string(),
  chaletId: identifierSchema.optional(),
  chaletName: identifierSchema.optional(),
  startDate: dateSchema,
  endDate: dateSchema,
  bookingType: z.enum(bookingTypes),
  startTime: timeSchema,
  endTime: timeSchema,
  price: moneySchema,
  discountAmount: moneySchema.optional(),
  depositAmount: moneySchema.optional(),
  depositPaymentMethod: paymentMethodIdSchema.optional(),
  depositPaymentRecordedAt: z.string().datetime().optional(),
  depositCollection: paymentSchema.optional(),
  payments: z.array(paymentSchema),
  depositRefunds: z.array(depositRefundSchema).optional(),
  depositCompensation: z.object({ amount: moneySchema, date: dateSchema, recordedAt: z.string().datetime().optional(), note: optionalText, sourceFloatId: z.string().regex(/^[a-zA-Z0-9-]{2,72}$/).optional(), returnedByUserId: z.number().int().positive().optional(), returnedByName: z.string().max(120).optional() }).optional(),
  notes: z.string(),
  status: z.enum(bookingStatuses),
  createdAt: z.string(),
  checkedInAt: z.string().datetime().optional(),
  checkInConfirmation: checkInConfirmationSchema.optional(),
  checkedOutAt: z.string().datetime().optional(),
  noShowAt: z.string().datetime().optional(),
  commissionRate: moneySchema.optional(),
  commissionAmount: moneySchema.optional(),
  payoutStatus: z.enum(["pending", "paid"]).optional(),
  updatedByUserId: z.number().int().optional(),
  updatedByName: z.string().optional(),
  bookingSource: z.enum(["manual_host", "guest_app"]).optional(),
  assetInspections: z.array(z.object({ assetId: z.string().optional(), assetName: z.string(), passed: z.boolean(), note: z.string().optional(), photoUri: z.string().optional() })).optional(),
  createdByUserId: z.number().int().optional(),
  createdByName: z.string().optional(),
  createdByRole: z.enum(["owner", "employee"]).optional(),
  waitlistPriorityAcknowledgedForId: z.string().optional(),
  waitlistPriorityAcknowledgedAt: z.string().datetime().optional(),
  waitlistPriorityAcknowledgedByName: z.string().optional(),
}).superRefine((booking, context) => {
  if (booking.endDate < booking.startDate) context.addIssue({ code: "custom", path: ["endDate"], message: "cannot be before startDate" });
  const refunded = (booking.depositRefunds ?? []).reduce((sum, refund) => sum + refund.amount, 0);
  if (refunded > (booking.depositAmount ?? 0)) context.addIssue({ code: "custom", path: ["depositRefunds"], message: "cannot exceed depositAmount" });
}) satisfies z.ZodType<Booking>;

const waitlistSchema = z.object({
  id: identifierSchema,
  customerName: identifierSchema,
  phone: z.string(),
  chaletId: identifierSchema.optional(),
  chaletName: identifierSchema.optional(),
  requestedDate: dateSchema,
  endDate: dateSchema.optional(),
  bookingType: z.enum(bookingTypes),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  price: moneySchema.optional(),
  discountAmount: moneySchema.optional(),
  depositAmount: moneySchema.optional(),
  depositPaymentMethod: paymentMethodIdSchema.optional(),
  depositPaymentRecordedAt: z.string().datetime().optional(),
  payments: z.array(paymentSchema).optional(),
  notes: z.string(),
  status: z.enum(["active", "cancelled", "promoted"]).optional(),
  cancelledAt: z.string().datetime().optional(),
  cancellationReason: z.enum(["manual", "start-time"]).optional(),
  promotedAt: z.string().datetime().optional(),
  promotedByUserId: z.number().int().optional(),
  promotedByName: z.string().optional(),
  promotedBookingId: z.string().optional(),
  promotedBookingReference: z.string().optional(),
  promotedReplacedCustomerNames: z.string().optional(),
  createdAt: z.string(),
}).superRefine((entry, context) => {
  if (entry.endDate && entry.endDate < entry.requestedDate) context.addIssue({ code: "custom", path: ["endDate"], message: "cannot be before requestedDate" });
}) satisfies z.ZodType<WaitlistEntry>;

const chaletSchema = z.object({
  id: identifierSchema,
  name: identifierSchema,
  referenceCode: z.string().regex(/^[A-Z0-9\u0621-\u064A]{2}$/).optional(),
  color: identifierSchema,
  imageUri: optionalText,
  location: optionalText,
  locationUrl: z.string().url().optional().or(z.literal("")),
  guardianName: optionalText,
  guardianPhone: optionalText,
  contactPhone: optionalText,
  notes: optionalText,
  weekendDays: z.array(z.number().int().min(0).max(6)).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  googleMapsUrl: optionalText,
  hasHeatedPool: z.boolean().optional(),
  nearWater: z.boolean().optional(),
  periodPricing: chaletPeriodPricingSchema.optional(),
  periodTimes: z.object({
    morning: z.object({ startTime: timeSchema, endTime: timeSchema }).optional(),
    evening: z.object({ startTime: timeSchema, endTime: timeSchema }).optional(),
    "24h": z.object({ startTime: timeSchema, endTime: timeSchema }).optional(),
  }).optional(),
  createdAt: z.string(),
}) satisfies z.ZodType<Chalet>;

const bookingTypeSettingsSchema = z.object({ label: z.string().optional(), startTime: timeSchema.optional(), endTime: timeSchema.optional() });
const settingsSchema = z.object({
  businessName: z.string().optional(),
  businessLogoUrl: z.string().url().refine((value) => new URL(value).protocol === "https:", "must use HTTPS").optional().or(z.literal("")),
  businessPhone: z.string().optional(),
  currency: identifierSchema.optional(),
  weekendPrice: moneySchema.optional(),
  weekendDays: z.array(z.number().int().min(0).max(6)).optional(),
  periodPricing: z.object({
    morning: z.object({ weekdayPrice: moneySchema.optional(), weekendPrice: moneySchema.optional() }).optional(),
    evening: z.object({ weekdayPrice: moneySchema.optional(), weekendPrice: moneySchema.optional() }).optional(),
    "24h": z.object({ weekdayPrice: moneySchema.optional(), weekendPrice: moneySchema.optional() }).optional(),
  }).optional(),
  bookingTypes: z.record(z.string(), bookingTypeSettingsSchema).optional(),
  paymentMethods: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{2,48}$/), label: z.string().min(1).max(40), isActive: z.boolean(), icon: z.string().min(1).max(8).optional(), isArchived: z.boolean().optional(), defaultRecipientType: z.enum(["owner", "staff", "guard"]).optional() })).optional(),
  paymentRouting: z.object({ masterAccounts: z.object({ cliqAlias: z.string().max(160).optional(), bankDetails: z.string().max(1000).optional(), cashHandlerLabel: z.string().max(120).optional(), directCliqEnabled: z.boolean().optional(), directBankEnabled: z.boolean().optional(), directCashEnabled: z.boolean().optional() }).optional(), staffFloats: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{2,72}$/), memberUserId: z.number().int().positive().optional(), memberName: z.string().max(120).optional(), label: z.string().min(1).max(120), cliqAlias: z.string().max(160).optional(), bankDetails: z.string().max(1000).optional(), maxFloatLimit: moneySchema.optional(), isActive: z.boolean().optional() })).optional() }).optional(),
  whatsAppEnabled: z.boolean().optional(),
  ownerPhone: z.string().optional(),
  guardPhone: z.string().optional(),
  locationUrl: z.string().url().optional().or(z.literal("")),
  enableDisclaimer: z.boolean().optional(),
  disclaimerText: z.string().optional(),
  whatsAppOptions: z.object({ includeGuestAndChalet: z.boolean().optional(), includeSchedule: z.boolean().optional(), includeFinancials: z.boolean().optional(), includeLocation: z.boolean().optional(), includeContacts: z.boolean().optional() }).optional(),
  device: z.object({
    useDeviceLanguage: z.boolean().optional(),
    language: z.enum(["ar", "en"]).optional(),
    appearanceMode: z.enum(["light", "dark", "system"]).optional(),
    hapticsEnabled: z.boolean().optional(),
    notificationsEnabled: z.boolean().optional(),
    respectFontScale: z.boolean().optional(),
    timezone: z.string().optional(),
    dateFormat: z.enum(["gregory", "DD/MM/YYYY", "YYYY-MM-DD", "english-month", "arabic-gregorian"]).optional(),
    showHijriDate: z.boolean().optional(),
    timeFormat: z.enum(["12h", "24h"]).optional(),
    guardReminderLeadMinutes: z.number().int().min(1).max(1440).optional(),
    showLunarPhase: z.boolean().optional(),
  }).optional(),
  utilityTracking: z.object({ enabled: z.boolean().optional(), rates: z.record(z.enum(["electricity", "water", "gas_fuel"]), moneySchema).optional(), thresholds: z.record(z.enum(["electricity", "water", "gas_fuel"]), moneySchema).optional() }).optional(),
  loyaltyProgram: z.object({ enabled: z.boolean().optional(), pointsPerJod: moneySchema.optional(), jodPerPoint: moneySchema.optional(), silverMinStays: z.number().int().min(0).optional(), goldMinStays: z.number().int().min(0).optional(), platinumMinStays: z.number().int().min(0).optional(), silverMinSpendJod: moneySchema.optional(), goldMinSpendJod: moneySchema.optional() }).optional(),
  holidayPricing: z.object({ enabled: z.boolean().optional(), upliftPercent: moneySchema.optional() }).optional(),
  contractPolicy: z.object({ requireSignature: z.boolean().optional(), defaultDepositAmount: moneySchema.optional() }).optional(),
  weatherAdvisory: z.object({ enabled: z.boolean().optional(), coldPoolThresholdC: moneySchema.optional(), recipients: z.object({ owner: z.boolean().optional(), manager: z.boolean().optional(), guard: z.boolean().optional() }).optional() }).optional(),
}).passthrough();

const customerSchema = z.object({
  id: identifierSchema,
  name: identifierSchema,
  phone: z.string(),
  e164: z.string(),
  nationalId: optionalText,
  totalBookingsCount: z.number().int().min(0),
  totalSpent: moneySchema,
  isBlacklisted: z.boolean(),
  blacklistReason: optionalText,
  notes: optionalText,
  lastBookingDate: dateSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

const leaseContractSchema = z.object({
  id: identifierSchema,
  bookingId: identifierSchema,
  termsSnapshot: z.string(),
  guestName: identifierSchema,
  guestPhone: z.string(),
  chaletName: z.string().optional(),
  bookingReference: z.string().optional(),
  bookingType: z.enum(bookingTypes),
  startDate: dateSchema,
  startTime: timeSchema.optional(),
  endDate: dateSchema,
  endTime: timeSchema.optional(),
  rentalTotal: moneySchema,
  depositAmount: moneySchema,
  status: z.enum(["draft", "signed", "archived"]),
  guestSignatureBase64: z.string().optional(),
  signedAt: z.string().optional(),
  signerIp: z.string().optional(),
  signedByName: z.string().optional(),
  createdAt: z.string(),
});

const assetSchema = z.object({
  id: identifierSchema,
  chaletId: identifierSchema,
  chaletName: z.string().optional(),
  name: identifierSchema,
  category: z.string().default("other"),
  serialNumber: optionalText,
  condition: z.enum(["excellent", "good", "needs_service"]),
  purchaseDate: dateSchema.optional(),
  purchaseCost: moneySchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

const maintenanceTaskSchema = z.object({
  id: identifierSchema,
  chaletId: identifierSchema,
  chaletName: z.string().optional(),
  assetId: z.string().optional(),
  assetName: z.string().optional(),
  title: identifierSchema,
  frequency: z.enum(["daily", "weekly", "monthly", "custom"]),
  nextDueDate: dateSchema,
  lastCompletedDate: dateSchema.optional(),
  assignedToStaffId: z.number().int().optional(),
  assignedToStaffName: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed"]),
  cost: moneySchema.optional(),
  note: optionalText,
  customIntervalDays: z.number().int().min(1).optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
  completedByName: z.string().optional(),
});

const notificationSchema = z.object({
  id: identifierSchema,
  recipients: z.array(z.enum(["owner", "manager", "guard", "all"])),
  type: z.enum(["new_booking", "payment_received", "checkin_alert", "maintenance_due", "contract_signed", "weather_advisory"]),
  title: identifierSchema,
  body: z.string(),
  dataPayload: z.record(z.string(), z.string()).optional(),
  isRead: z.boolean(),
  readByIds: z.array(z.string()).optional(),
  createdAt: z.string(),
});

const utilityReadingSchema = z.object({
  id: identifierSchema,
  bookingId: identifierSchema.optional(),
  chaletId: identifierSchema,
  type: z.enum(["electricity", "water", "gas_fuel"]),
  checkInReading: moneySchema,
  checkInPhotoUri: optionalText,
  checkInRecordedAt: z.string(),
  checkOutReading: moneySchema.optional(),
  checkOutPhotoUri: optionalText,
  checkOutRecordedAt: z.string().optional(),
  consumedUnits: moneySchema.optional(),
  unitRate: moneySchema,
  totalCost: moneySchema.optional(),
  isExcessive: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

const weatherLogSchema = z.object({
  id: identifierSchema,
  chaletId: identifierSchema,
  fetchedAt: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  current: z.object({ temperature: z.number(), windSpeed: z.number().optional(), weatherCode: z.number().optional() }).optional(),
  daily: z.array(z.object({ date: dateSchema, temperatureMax: z.number(), temperatureMin: z.number(), windSpeedMax: z.number(), precipitationProbabilityMax: z.number().min(0).max(100), uvIndexMax: z.number().min(0), weatherCode: z.number() })),
  generatedAt: z.string(),
});

const loyaltyAccountSchema = z.object({
  id: identifierSchema,
  customerId: identifierSchema,
  pointsBalance: z.number().int().min(0),
  tier: z.enum(["bronze", "silver", "gold", "platinum"]),
  lifetimeEarned: z.number().int().min(0),
  lifetimeRedeemed: z.number().int().min(0),
  updatedAt: z.string(),
  createdAt: z.string(),
});

const loyaltyTransactionSchema = z.object({
  id: identifierSchema,
  customerId: identifierSchema,
  type: z.enum(["earn", "redeem"]),
  points: z.number().int().min(0),
  amount: moneySchema,
  bookingId: identifierSchema.optional(),
  bookingReference: z.string().optional(),
  note: optionalText,
  createdAt: z.string(),
});

const expenseAllocationSchema = z.object({ chaletId: identifierSchema, chaletName: z.string(), amount: moneySchema });
const expenseSchema = z.object({
  id: identifierSchema,
  chaletId: identifierSchema.optional(),
  chaletName: z.string().optional(),
  amount: moneySchema,
  date: dateSchema,
  category: z.enum(["guards-salaries", "maintenance", "cleaning-supplies", "utilities", "other"]),
  note: optionalText,
  paymentMethod: z.enum(["cash", "click"]).optional(),
  receiptUri: optionalText,
  generalAllocations: z.array(expenseAllocationSchema).optional(),
  createdAt: z.string(),
  createdByName: z.string().optional(),
}) satisfies z.ZodType<Expense>;

const turnoverTaskSchema = z.object({
  id: identifierSchema,
  checkoutBookingId: identifierSchema,
  nextBookingId: identifierSchema,
  chaletId: z.string().optional(),
  chaletName: z.string().optional(),
  dueAt: z.string(),
  status: z.enum(["pending", "in-progress", "completed"]),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  completedByName: z.string().optional(),
}) satisfies z.ZodType<TurnoverTask>;

const backupSchema = z.object({
  backupVersion: z.number().int().min(1).max(BACKUP_VERSION).optional(),
  exportedAt: z.string().optional(),
  bookings: z.array(bookingSchema),
  waitlist: z.array(waitlistSchema).optional(),
  turnoverTasks: z.array(turnoverTaskSchema).optional(),
  expenses: z.array(expenseSchema).optional(),
  staffFloatSettlements: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9-]{2,72}$/), floatId: z.string().regex(/^[a-zA-Z0-9-]{2,72}$/), amount: moneySchema, settledAt: z.string().datetime(), note: optionalText, settledByUserId: z.number().int().positive().optional(), settledByName: z.string().max(120).optional() })).optional(),
  chalets: z.array(chaletSchema).optional(),
  specialPriceRules: z.array(z.object({ id: z.string(), name: z.string(), startDate: dateSchema, endDate: dateSchema, price: moneySchema, kind: z.enum(["season", "occasion"]), createdAt: z.string() })).optional(),
  auditLog: z.array(z.object({ id: z.string(), action: z.enum(["waitlist-promoted", "waitlist-deleted", "waitlist-cancelled", "booking-deleted", "booking-cancelled", "booking-checked-in", "booking-checked-out", "booking-status-corrected", "booking-waitlist-priority-confirmed", "chalet-deleted", "payment-updated", "payment-voided", "customer-created", "customer-updated", "customer-blacklisted", "customer-unblacklisted", "contract-signed", "asset-added", "asset-updated", "asset-deleted", "maintenance-task-updated", "maintenance-task-completed", "weather-log-updated", "utility-reading-recorded", "loyalty-points-awarded", "loyalty-points-redeemed", "float-settled", "deposit-compensation-recorded", "staff-float-account-saved"]), subjectName: z.string(), details: z.string(), createdAt: z.string(), actorName: z.string().optional(), bookingId: z.string().optional() })).optional(),
  customers: z.array(customerSchema).optional(),
  contracts: z.array(leaseContractSchema).optional(),
  assets: z.array(assetSchema).optional(),
  maintenanceTasks: z.array(maintenanceTaskSchema).optional(),
  notifications: z.array(notificationSchema).optional(),
  weatherLogs: z.array(weatherLogSchema).optional(),
  utilityReadings: z.array(utilityReadingSchema).optional(),
  loyaltyAccounts: z.array(loyaltyAccountSchema).optional(),
  loyaltyTransactions: z.array(loyaltyTransactionSchema).optional(),
  settings: settingsSchema,
});

function invalidBackup(message: string): never {
  throw new Error(`invalid backup: ${message}`);
}

function mergeSettings(imported: z.infer<typeof settingsSchema>): Settings {
  const importedTypes = imported.bookingTypes ?? {};
  const mergedBookingTypes = Object.fromEntries(bookingTypes.map((type) => [type, { ...DEFAULT_SETTINGS.bookingTypes[type], ...(importedTypes[type] ?? {}) }])) as Settings["bookingTypes"];
  return {
    ...DEFAULT_SETTINGS,
    ...imported,
    bookingTypes: mergedBookingTypes,
    periodPricing: {
      ...DEFAULT_SETTINGS.periodPricing,
      ...(imported.periodPricing ?? {}),
      morning: { ...DEFAULT_SETTINGS.periodPricing!.morning, ...(imported.periodPricing?.morning ?? {}) },
      evening: { ...DEFAULT_SETTINGS.periodPricing!.evening, ...(imported.periodPricing?.evening ?? {}) },
      "24h": { ...DEFAULT_SETTINGS.periodPricing!["24h"], ...(imported.periodPricing?.["24h"] ?? {}) },
    },
    whatsAppOptions: { ...DEFAULT_WHATSAPP_MESSAGE_OPTIONS, ...(imported.whatsAppOptions ?? {}) },
    device: { ...DEFAULT_DEVICE_SETTINGS, ...(imported.device ?? {}), dateFormat: imported.device?.dateFormat === "gregory" ? "arabic-gregorian" : imported.device?.dateFormat ?? DEFAULT_DEVICE_SETTINGS.dateFormat },
  } as Settings;
}

/** Creates a portable, versioned backup. Legacy root-level backups remain accepted on import. */
export function serializeBackup(data: AppData) {
  const payload: BackupEnvelope = { backupVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), ...normalizeAppData(data) };
  return JSON.stringify(payload, null, 2);
}

/**
 * Reads an already-saved app snapshot without applying the stricter external-import schema.
 * Historic local and shared snapshots may contain an older reference format or audit metadata;
 * normalizing them is safe, whereas rejecting the whole snapshot would hide every booking.
 */
export function parseStoredAppData(raw: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalidBackup("not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalidBackup("malformed stored snapshot");
  const snapshot = parsed as Partial<AppData>;
  return normalizeAppData({
    ...snapshot,
    bookings: Array.isArray(snapshot.bookings) ? snapshot.bookings : [],
    waitlist: Array.isArray(snapshot.waitlist) ? snapshot.waitlist : [],
    turnoverTasks: Array.isArray(snapshot.turnoverTasks) ? snapshot.turnoverTasks : [],
    expenses: Array.isArray(snapshot.expenses) ? snapshot.expenses : [],
    chalets: Array.isArray(snapshot.chalets) ? snapshot.chalets : [],
    specialPriceRules: Array.isArray(snapshot.specialPriceRules) ? snapshot.specialPriceRules : [],
    auditLog: Array.isArray(snapshot.auditLog) ? snapshot.auditLog : [],
    settings: { ...DEFAULT_SETTINGS, ...(snapshot.settings ?? {}) },
  } as AppData);
}

/** Parses only validated backup records before any preview or storage replacement takes place. */
export function parseBackupData(raw: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalidBackup("not valid JSON");
  }
  const result = backupSchema.safeParse(parsed);
  if (!result.success) invalidBackup(result.error.issues[0]?.path.join(".") || "malformed structure");
  const imported = result.data;
  return normalizeAppData({
    bookings: imported.bookings,
    waitlist: imported.waitlist ?? [],
    turnoverTasks: imported.turnoverTasks as unknown as TurnoverTask[],
    expenses: imported.expenses as unknown as Expense[],
    chalets: imported.chalets,
    auditLog: imported.auditLog ?? [],
    customers: imported.customers ?? [],
    contracts: imported.contracts ?? [],
    assets: imported.assets ?? [],
    maintenanceTasks: imported.maintenanceTasks ?? [],
    notifications: imported.notifications ?? [],
    weatherLogs: imported.weatherLogs as unknown as WeatherLog[],
    utilityReadings: imported.utilityReadings as unknown as UtilityReading[],
    loyaltyAccounts: imported.loyaltyAccounts as unknown as LoyaltyAccount[],
    loyaltyTransactions: imported.loyaltyTransactions as unknown as LoyaltyTransaction[],
    settings: mergeSettings(imported.settings),
    staffFloatSettlements: imported.staffFloatSettlements ?? [],
  });
}
