import { z } from "zod";

import { AppData, Booking, BookingStatus, BookingType, Chalet, DEFAULT_DEVICE_SETTINGS, DEFAULT_SETTINGS, DEFAULT_WHATSAPP_MESSAGE_OPTIONS, DepositRefund, Payment, Settings, WaitlistEntry, normalizeAppData } from "./booking-model";

export const BACKUP_VERSION = 7;

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
  receiptUri: optionalText,
}) satisfies z.ZodType<Payment>;

const depositRefundSchema = z.object({
  id: identifierSchema,
  amount: moneySchema,
  date: dateSchema,
  recordedAt: z.string().datetime().optional(),
  note: optionalText,
  paymentMethod: z.string().regex(/^[a-z0-9-]{2,48}$/).optional(),
}) satisfies z.ZodType<DepositRefund>;

const checkInConfirmationSchema = z.object({
  actualArrivalAt: z.string().datetime(),
  rentalBalanceVerified: z.boolean(),
  rentalBalancePaymentMethod: z.string().regex(/^[a-z0-9-]{2,48}$/).optional(),
  securityDepositVerified: z.boolean(),
  securityDepositPaymentMethod: z.string().regex(/^[a-z0-9-]{2,48}$/).optional(),
  identityNote: optionalText,
  identityImageUri: optionalText,
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
  notes: z.string(),
  status: z.enum(bookingStatuses),
  createdAt: z.string(),
  checkedInAt: z.string().datetime().optional(),
  checkInConfirmation: checkInConfirmationSchema.optional(),
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
  paymentRouting: z.object({ masterAccounts: z.object({ cliqAlias: z.string().max(160).optional(), bankDetails: z.string().max(1000).optional(), cashHandlerLabel: z.string().max(120).optional() }).optional() }).optional(),
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
  }).optional(),
}).passthrough();

const backupSchema = z.object({
  backupVersion: z.number().int().min(1).max(BACKUP_VERSION).optional(),
  exportedAt: z.string().optional(),
  bookings: z.array(bookingSchema),
  waitlist: z.array(waitlistSchema).optional(),
  chalets: z.array(chaletSchema).optional(),
  specialPriceRules: z.array(z.object({ id: z.string(), name: z.string(), startDate: dateSchema, endDate: dateSchema, price: moneySchema, kind: z.enum(["season", "occasion"]), createdAt: z.string() })).optional(),
  auditLog: z.array(z.object({ id: z.string(), action: z.enum(["waitlist-promoted", "waitlist-deleted", "waitlist-cancelled", "booking-deleted", "booking-cancelled", "booking-checked-in", "booking-checked-out", "booking-status-corrected", "booking-waitlist-priority-confirmed", "chalet-deleted", "payment-updated", "payment-voided"]), subjectName: z.string(), details: z.string(), createdAt: z.string(), actorName: z.string().optional(), bookingId: z.string().optional() })).optional(),
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
    chalets: imported.chalets,
    auditLog: imported.auditLog ?? [],
    settings: mergeSettings(imported.settings),
  });
}
