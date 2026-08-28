export type BookingType = "morning" | "evening" | "24h" | "custom" | "multi-day";
export type BookingStatus = "confirmed" | "awaiting-deposit" | "cancelled" | "completed" | "waitlisted";
export type WaitlistStatus = "active" | "cancelled" | "promoted";
export type PaymentStatus = "unpaid" | "deposit" | "partial" | "paid";
export type TurnoverTaskStatus = "pending" | "in-progress" | "completed";
export const PROPERTY_TYPES = ["chalet", "farm", "cabin", "villa", "camp", "other"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export const PROPERTY_TYPE_META: Record<PropertyType, { ar: string; en: string; icon: "holiday-village" | "agriculture" | "cabin" | "castle" | "landscape" | "home-work" }> = {
  chalet: { ar: "شاليه", en: "Chalet", icon: "holiday-village" },
  farm: { ar: "مزرعة", en: "Farm", icon: "agriculture" },
  cabin: { ar: "كوخ", en: "Cabin", icon: "cabin" },
  villa: { ar: "فيلا", en: "Villa", icon: "castle" },
  camp: { ar: "مخيم", en: "Camp", icon: "landscape" },
  other: { ar: "أخرى", en: "Other", icon: "home-work" },
};
export function normalizePropertyType(value: unknown): PropertyType { return typeof value === "string" && PROPERTY_TYPES.includes(value as PropertyType) ? value as PropertyType : "chalet"; }
export function propertyTypeLabel(value: unknown, language: "ar" | "en" = "ar") { return PROPERTY_TYPE_META[normalizePropertyType(value)][language]; }
export function propertyTypeIcon(value: unknown) { return PROPERTY_TYPE_META[normalizePropertyType(value)].icon; }
/** شكل الحافة يميز نوع العقار فقط؛ لون الحافة يبقى لون الوحدة المخصص. */
export function propertyTypeFrameRadius(value: unknown) {
  const type = normalizePropertyType(value);
  return type === "farm" ? 24 : type === "cabin" ? 30 : type === "villa" ? 26 : type === "camp" ? 20 : type === "other" ? 26 : 28;
}
export const EXPENSE_CATEGORIES = ["guards-salaries", "maintenance", "cleaning-supplies", "utilities", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_PAYMENT_METHODS = ["cash", "click"] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];
export type BookingListFilter = "all" | "today" | "upcoming" | "balance" | "completed" | "cancelled";
/** قائمة معرفات قديمة محفوظة للتوافق؛ الطرق الجديدة قد تستخدم أي معرف صالح. */
export const PAYMENT_METHODS: readonly string[] = ["cash-guardian", "cash-owner", "bank-transfer", "click", "wallet", "card", "other"];
export const PAYMENT_METHOD_ICON_OPTIONS = ["💵", "📱", "⚡", "🏦", "💳", "👨‍🌾", "🧾", "🤝"] as const;
export type PaymentMethodIcon = (typeof PAYMENT_METHOD_ICON_OPTIONS)[number];
export type PaymentMethod = string;
export type PaymentRecipientType = "owner" | "staff" | "guard";
export type CommissionType = "percent" | "fixed";
export type PaymentMethodOption = { id: string; label: string; isActive: boolean; icon: PaymentMethodIcon; isArchived?: boolean; defaultRecipientType?: PaymentRecipientType };
export type MasterPaymentAccounts = { cliqAlias?: string; bankDetails?: string; cashHandlerLabel?: string };
export type PaymentRoutingSettings = { masterAccounts?: MasterPaymentAccounts };
export const DEFAULT_PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  { id: "cash-owner", label: "نقدًا بيد المالك", isActive: true, icon: "💵" },
  { id: "cash-guardian", label: "نقدًا بيد الحارس", isActive: true, icon: "👨‍🌾" },
  { id: "click", label: "تحويل CliQ", isActive: true, icon: "⚡" },
  { id: "bank-transfer", label: "تحويل بنكي", isActive: true, icon: "🏦" },
  { id: "card", label: "بطاقة / دفع إلكتروني", isActive: true, icon: "💳" },
  { id: "other", label: "أخرى", isActive: true, icon: "🧾" },
];
export function isBuiltInPaymentMethod(id: string) { return DEFAULT_PAYMENT_METHOD_OPTIONS.some((method) => method.id === id); }
function paymentMethodFallbackIcon(id: string): PaymentMethodIcon {
  return DEFAULT_PAYMENT_METHOD_OPTIONS.find((method) => method.id === id)?.icon ?? "🧾";
}
function normalizePaymentMethodIcon(value: unknown, id: string): PaymentMethodIcon {
  return PAYMENT_METHOD_ICON_OPTIONS.includes(value as PaymentMethodIcon) ? value as PaymentMethodIcon : paymentMethodFallbackIcon(id);
}
function normalizePaymentRecipientType(value: unknown): PaymentRecipientType | undefined {
  return value === "owner" || value === "staff" || value === "guard" ? value : undefined;
}
function normalizePaymentMethodId(value: unknown): PaymentMethod | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim().toLowerCase();
  return /^[a-z0-9-]{2,48}$/.test(id) ? id : undefined;
}
export function isValidPaymentMethod(value: unknown): value is PaymentMethod { return Boolean(normalizePaymentMethodId(value)); }
export function calculateCollectionCommission(amount: number, rate: number | undefined, type: CommissionType | undefined = "percent") {
  const safeAmount = Math.max(0, Number(amount) || 0);
  const safeRate = Math.max(0, Number(rate) || 0);
  const value = type === "fixed" ? safeRate : safeAmount * safeRate / 100;
  return Math.round(value * 100) / 100;
}
export function paymentMethodIcon(method: PaymentMethod | undefined, configuredMethods?: PaymentMethodOption[]): PaymentMethodIcon {
  if (!method) return "🧾";
  const configured = configuredMethods && normalizePaymentMethodOptions(configuredMethods).find((option) => option.id === method);
  return configured?.icon ?? paymentMethodFallbackIcon(method);
}
export function normalizePaymentMethodOptions(value: unknown): PaymentMethodOption[] {
  const source = Array.isArray(value) ? value : DEFAULT_PAYMENT_METHOD_OPTIONS;
  const ids = new Set<string>();
  const methods = source.reduce<PaymentMethodOption[]>((result, item) => {
    const candidate = item as Partial<PaymentMethodOption>;
    const id = normalizePaymentMethodId(candidate?.id);
    const label = typeof candidate?.label === "string" ? candidate.label.trim().slice(0, 40) : "";
    if (!id || !label || ids.has(id)) return result;
    ids.add(id);
    result.push({ id, label, isActive: candidate.isActive !== false, icon: normalizePaymentMethodIcon(candidate?.icon, id), isArchived: candidate.isArchived === true || undefined, defaultRecipientType: normalizePaymentRecipientType(candidate?.defaultRecipientType) });
    return result;
  }, []);
  if (!methods.length) return DEFAULT_PAYMENT_METHOD_OPTIONS.map((method) => ({ ...method }));
  DEFAULT_PAYMENT_METHOD_OPTIONS.forEach((method) => {
    if (!ids.has(method.id)) methods.push({ ...method });
  });
  return methods;
}
export function activePaymentMethods(settings: Pick<Settings, "paymentMethods"> = DEFAULT_SETTINGS): PaymentMethodOption[] {
  return normalizePaymentMethodOptions(settings.paymentMethods).filter((method) => method.isActive && !method.isArchived);
}
export type Payment = { id: string; amount: number; date: string; recordedAt?: string; note?: string; paymentMethod?: PaymentMethod; recipientType?: PaymentRecipientType; handlerUserId?: number; handlerName?: string; recipientAccountLabel?: string; calculatedCommission?: number; commissionType?: CommissionType; receiptUri?: string; voidedAt?: string; voidReason?: string; recordedByUserId?: number; recordedByName?: string; updatedByUserId?: number; updatedByName?: string; voidedByUserId?: number; voidedByName?: string };
export type DepositRefund = { id: string; amount: number; date: string; recordedAt?: string; note?: string; paymentMethod?: PaymentMethod };
export type CheckInConfirmation = { actualArrivalAt: string; rentalBalanceVerified: boolean; rentalBalancePaymentMethod?: PaymentMethod; securityDepositVerified: boolean; securityDepositPaymentMethod?: PaymentMethod; identityNote?: string; identityImageUri?: string };
export type CheckoutConfirmation = { inspectionPassed: boolean; inspectionNote?: string; depositRefund?: { amount: number; paymentMethod: PaymentMethod; note?: string } };
export type ManualStayCorrection = { checkedInAt?: string; checkedOutAt?: string; restoreNoShow?: boolean; note?: string };
export type ChaletShift = { id: string; name: string; startTime: string; endTime: string; weekdayPrice: number; weekendPrice: number; isActive: boolean; color: string; /** نوع الفترة هو مصدر لونها المحجوز. */ periodKind?: ReservedPeriodColorKey };
export type Chalet = { id: string; name: string; propertyType?: PropertyType; referenceCode?: string; color: string; imageUri?: string; location?: string; locationUrl?: string; guardianName?: string; guardianPhone?: string; contactPhone?: string; notes?: string; weekendDays?: number[]; shifts?: ChaletShift[]; /** محفوظ للتوافق مع نسخ البيانات السابقة. */ periodPricing?: PeriodPricingSettings; /** محفوظ للتوافق مع نسخ البيانات السابقة. */ periodTimes?: Partial<Record<PricedBookingType, { startTime: string; endTime: string }>>; createdAt: string };
export type Booking = { id: string; bookingReference?: string; customerName: string; phone: string; chaletId?: string; chaletName?: string; startDate: string; endDate: string; bookingType: BookingType; shiftId?: string; shiftName?: string; shiftColor?: string; startTime: string; endTime: string; price: number; discountAmount?: number; depositAmount?: number; /** طريقة استلام التأمين مستقلة عن دفعات الإيجار. */ depositPaymentMethod?: PaymentMethod; depositPaymentRecordedAt?: string; depositCollection?: Payment; payments: Payment[]; depositRefunds?: DepositRefund[]; notes: string; status: BookingStatus; createdAt: string; checkedInAt?: string; checkInConfirmation?: CheckInConfirmation; checkedOutAt?: string; noShowAt?: string; createdByUserId?: number; createdByName?: string; createdByRole?: "owner" | "employee"; updatedByUserId?: number; updatedByName?: string; waitlistPriorityAcknowledgedForId?: string; waitlistPriorityAcknowledgedAt?: string; waitlistPriorityAcknowledgedByName?: string };
export type WaitlistEntry = { id: string; customerName: string; phone: string; chaletId?: string; chaletName?: string; requestedDate: string; endDate?: string; bookingType: BookingType; shiftId?: string; shiftName?: string; shiftColor?: string; startTime?: string; endTime?: string; price?: number; discountAmount?: number; depositAmount?: number; depositPaymentMethod?: PaymentMethod; depositPaymentRecordedAt?: string; payments?: Payment[]; notes: string; status?: WaitlistStatus; cancelledAt?: string; cancellationReason?: "manual" | "start-time"; promotedAt?: string; promotedByUserId?: number; promotedByName?: string; promotedBookingId?: string; promotedBookingReference?: string; promotedReplacedCustomerNames?: string; createdAt: string };
export type TurnoverTask = { id: string; checkoutBookingId: string; nextBookingId: string; chaletId?: string; chaletName?: string; dueAt: string; status: TurnoverTaskStatus; createdAt: string; startedAt?: string; completedAt?: string; completedByName?: string };
export type ExpenseAllocation = { chaletId: string; chaletName: string; amount: number };
export type Expense = { id: string; chaletId?: string; chaletName?: string; amount: number; date: string; category: ExpenseCategory; note?: string; paymentMethod?: ExpensePaymentMethod; receiptUri?: string; /** حصص ثابتة لقيد مصروف عام، تحفظ وقت تسجيله. */ generalAllocations?: ExpenseAllocation[]; createdAt: string; createdByName?: string };
export type AppLanguage = "ar" | "en";
export type AppearanceMode = "light" | "dark" | "system";
export type DateFormat = "DD/MM/YYYY" | "YYYY-MM-DD" | "english-month" | "arabic-gregorian";
export type BookingCardViewMode = "expanded" | "compact";
/** درجات سطوع الخلفية، مستقلة عن ألوان الوحدات والأسطح الزجاجية. */
export type GlassBackgroundLevel = "standard" | "quiet" | "minimal";
export function normalizeGlassBackgroundLevel(value: unknown, legacyQuiet = false): GlassBackgroundLevel {
  return value === "standard" || value === "quiet" || value === "minimal" ? value : legacyQuiet ? "quiet" : "standard";
}
/** معايرة سطح الزجاج، مستقلة عن سطوع الخلفية وألوان الوحدات. */
export type GlassSurfaceOpacity = "transparent" | "balanced" | "focused";
export function normalizeGlassSurfaceOpacity(value: unknown): GlassSurfaceOpacity {
  return value === "transparent" || value === "focused" ? value : "balanced";
}
/** درجة توهج حواف الوحدات، مستقلة عن شفافية السطح وألوان الحالات. */
export type GlassGlowIntensity = "subtle" | "balanced" | "vivid";
export function normalizeGlassGlowIntensity(value: unknown): GlassGlowIntensity {
  return value === "subtle" || value === "vivid" ? value : "balanced";
}
export type LogDefaultRange = "today" | "two-days" | "week" | "month" | "all";
export type ActiveBookingDefaultRange = LogDefaultRange | "tomorrow" | "upcoming";
export type SavedWhatsAppSendItem = "receipt" | "confirmation" | "arrival" | "checkout" | "contract" | "terms";
export type SavedWhatsAppMessageModule = "arrival" | "checkout" | "contract";
export type GuestCheckInModeChange = { changedAt: string; enabled: boolean };
export type DeviceSettings = {
  useDeviceLanguage: boolean;
  language: AppLanguage;
  appearanceMode: AppearanceMode;
  hapticsEnabled: boolean;
  reduceMotion: boolean;
  glassBackgroundLevel: GlassBackgroundLevel;
  glassSurfaceOpacity: GlassSurfaceOpacity;
  glassGlowIntensity: GlassGlowIntensity;
  /** محفوظ للتوافق مع النسخ التي سبقت درجات الخلفية الثلاث. */
  quietGlassBackground: boolean;
  notificationsEnabled: boolean;
  respectFontScale: boolean;
  timezone: string;
  dateFormat: DateFormat;
  showHijriDate: boolean;
  timeFormat: "12h" | "24h";
  bookingCardViewMode: BookingCardViewMode;
  showGuestCheckIn: boolean;
  guestCheckInModeHistory: GuestCheckInModeChange[];
  showTurnoverTasks: boolean;
  showDailyTasks: boolean;
  dailyOperationsCollapsed: boolean;
  auditLogDefaultRange: LogDefaultRange;
  activeBookingDefaultRange: ActiveBookingDefaultRange;
  endedStayDefaultRange: LogDefaultRange;
  showReadyMessages: boolean;
  showStayContract: boolean;
  receiptMessageTemplate: string;
  readyMessageTemplate: string;
  arrivalMessageTemplate: string;
  checkoutMessageTemplate: string;
  contractSummaryTemplate: string;
  stayContractTerms: string;
  lastWhatsAppSendItems: SavedWhatsAppSendItem[];
  /** ترويسة موحّدة تضاف مرة واحدة إلى رسالة واتساب المجمّعة. */
  whatsAppBaseHeaderTemplate: string;
  /** كتل اختيارية تُضاف أسفل الترويسة بحسب اختيار المستخدم. */
  arrivalMessageBlockTemplate: string;
  checkoutMessageBlockTemplate: string;
  contractMessageBlockTemplate: string;
  lastWhatsAppMessageModules: SavedWhatsAppMessageModule[];
};
export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  useDeviceLanguage: true,
  language: "ar",
  appearanceMode: "system",
  hapticsEnabled: true,
  reduceMotion: false,
  glassBackgroundLevel: "standard",
  glassSurfaceOpacity: "balanced",
  glassGlowIntensity: "balanced",
  quietGlassBackground: false,
  notificationsEnabled: true,
  respectFontScale: true,
  timezone: "UTC",
  dateFormat: "arabic-gregorian",
  showHijriDate: false,
  timeFormat: "12h",
  bookingCardViewMode: "expanded",
  showGuestCheckIn: true,
  guestCheckInModeHistory: [],
  showTurnoverTasks: true,
  showDailyTasks: true,
  dailyOperationsCollapsed: false,
  auditLogDefaultRange: "all",
  activeBookingDefaultRange: "all",
  endedStayDefaultRange: "all",
  showReadyMessages: true,
  showStayContract: true,
  receiptMessageTemplate: "إيصال الحجز\nالعميل: {العميل}\nالشاليه: {الشاليه}\nمرجع الحجز: {المرجع}\nالفترة: {الفترة}\nالوصول: {الوصول}\nالمغادرة: {المغادرة}\nإجمالي الإيجار: {الإجمالي}\nالمدفوع: {المدفوع}\nالمتبقي: {المتبقي}",
  readyMessageTemplate: "مرحبًا {العميل}، تم تأكيد حجزك في {الشاليه} خلال {الفترة} من {الوصول} إلى {المغادرة}. إجمالي الحجز {الإجمالي}. نتطلع لاستقبالكم.",
  arrivalMessageTemplate: "مرحبًا {العميل}، نرحب بكم في {الشاليه}. موعد الوصول: {الوصول}.\nالموقع: {الموقع}\nللتواصل مع الحارس: {الحارس}",
  checkoutMessageTemplate: "مرحبًا {العميل}، نذكركم بأن موعد المغادرة من {الشاليه} هو {المغادرة}. يرجى تسليم الشاليه بالحالة المتفق عليها، وشكرًا لاختياركم لنا.",
  contractSummaryTemplate: "العميل: {العميل}\nالشاليه: {الشاليه}\nمرجع الحجز: {المرجع}\nالوصول: {الوصول}\nالمغادرة: {المغادرة}\nالتأمين قيد الحيازة: {التأمين}",
  stayContractTerms: "يلتزم الضيف باستخدام الشاليه ومرافقه بعناية والمحافظة على محتوياته.\nيتم توثيق أي تلف مثبت قبل خصمه من مبلغ التأمين وفق سياسة المنشأة.\nيلتزم الضيف بموعد المغادرة المتفق عليه وتسليم الشاليه بالحالة المناسبة.",
  lastWhatsAppSendItems: ["confirmation"],
  whatsAppBaseHeaderTemplate: "أهلاً بك *{العميل}* 👋\nيسعدنا تأكيد حجزك في *{الشاليه}*\n📅 *الفترة:* {الفترة} ({الوصول} ➔ {المغادرة})\n🔖 *مرجع الحجز:* {المرجع}\n\n💳 *التفاصيل المالية:*\n• إجمالي الإيجار: *{الإجمالي}*\n• المبلغ المدفوع: *{المدفوع}*\n• المتبقي للدفع: *{المتبقي}*\n• تأمين مسترد: *{التأمين}*\n\n📍 *موقع الشاليه على الخريطة:*\n{الموقع}\n\n📞 *للتواصل مع الحارس:*\n{الحارس}\n\n📋 *تعليمات وشروط الإقامة:*\n{الشروط}",
  arrivalMessageBlockTemplate: "🔑 *تعليمات الوصول الإضافية:*\nيرجى الالتزام بوقت الوصول، والتواصل مع الحارس قبل الوصول عند الحاجة.",
  checkoutMessageBlockTemplate: "🚪 *تذكير المغادرة:*\nيرجى تسليم الشاليه في وقت المغادرة المتفق عليه وبالحالة المناسبة. شكرًا لاختياركم لنا.",
  contractMessageBlockTemplate: "📄 *إقرار الإقامة:*\nيُعد استمرار الحجز موافقة على تفاصيل الحجز وشروط الإقامة المبينة أعلاه.",
  lastWhatsAppMessageModules: [],
};
export type WhatsAppMessageOptions = { includeGuestAndChalet: boolean; includeSchedule: boolean; includeFinancials: boolean; includeLocation: boolean; includeContacts: boolean };
export const DEFAULT_WHATSAPP_MESSAGE_OPTIONS: WhatsAppMessageOptions = { includeGuestAndChalet: true, includeSchedule: true, includeFinancials: true, includeLocation: true, includeContacts: true };
export const DEFAULT_WHATSAPP_DISCLAIMER = "تنبيه: يرجى المحافظة على المقتنيات الشخصية واتباع تعليمات السلامة، خصوصًا حول المسبح. الاستخدام مسؤولية الضيف وفق الأنظمة والتعليمات المعمول بها.";
export type PricedBookingType = "morning" | "evening" | "24h";
export type PeriodRate = { weekdayPrice: number; weekendPrice: number };
export type PeriodPricingSettings = Record<PricedBookingType, PeriodRate>;
export const PRICED_BOOKING_TYPES: PricedBookingType[] = ["morning", "evening", "24h"];
export const DEFAULT_PERIOD_PRICING: PeriodPricingSettings = { morning: { weekdayPrice: 0, weekendPrice: 0 }, evening: { weekdayPrice: 0, weekendPrice: 0 }, "24h": { weekdayPrice: 0, weekendPrice: 0 } };
export const LEGACY_SHIFT_IDS: Record<PricedBookingType, string> = { morning: "legacy-morning", evening: "legacy-evening", "24h": "legacy-24h" };
export type SpecialPriceRule = { id: string; name: string; startDate: string; endDate: string; price: number; kind: "season" | "occasion"; createdAt: string };
export type AuditAction = "waitlist-promoted" | "waitlist-deleted" | "waitlist-cancelled" | "booking-deleted" | "booking-cancelled" | "booking-checked-in" | "booking-checked-out" | "booking-status-corrected" | "turnover-task-updated" | "expense-added" | "expense-deleted" | "booking-waitlist-priority-confirmed" | "chalet-deleted" | "payment-updated" | "payment-voided";
export type AuditLogEntry = { id: string; action: AuditAction; subjectName: string; details: string; createdAt: string; actorName?: string; bookingId?: string };
export type Settings = { businessName: string; businessLogoUrl?: string; businessPhone: string; currency: string; weekendPrice?: number; weekendDays?: number[]; periodPricing?: PeriodPricingSettings; bookingTypes: Record<BookingType, { label: string; startTime: string; endTime: string }>; paymentMethods?: PaymentMethodOption[]; paymentRouting?: PaymentRoutingSettings; device?: DeviceSettings; whatsAppEnabled?: boolean; ownerPhone?: string; enableDisclaimer?: boolean; disclaimerText?: string; whatsAppOptions?: WhatsAppMessageOptions };
export type AppData = { bookings: Booking[]; waitlist: WaitlistEntry[]; turnoverTasks: TurnoverTask[]; expenses?: Expense[]; chalets: Chalet[]; settings: Settings; specialPriceRules: SpecialPriceRule[]; auditLog: AuditLogEntry[] };
export const DEFAULT_SETTINGS: Settings = { businessName: "منشأتي للحجوزات", businessPhone: "", currency: "د.أ", weekendPrice: 0, weekendDays: [5, 6], periodPricing: DEFAULT_PERIOD_PRICING, paymentMethods: DEFAULT_PAYMENT_METHOD_OPTIONS, whatsAppEnabled: false, ownerPhone: "", enableDisclaimer: true, disclaimerText: DEFAULT_WHATSAPP_DISCLAIMER, whatsAppOptions: DEFAULT_WHATSAPP_MESSAGE_OPTIONS, bookingTypes: { morning: { label: "صباحي", startTime: "09:00", endTime: "21:00" }, evening: { label: "سهرة", startTime: "22:00", endTime: "09:00" }, "24h": { label: "24 ساعة", startTime: "09:00", endTime: "09:00" }, custom: { label: "فترة مخصصة", startTime: "09:00", endTime: "17:00" }, "multi-day": { label: "عدة أيام", startTime: "09:00", endTime: "21:00" } } };
export const EMPTY_DATA: AppData = { bookings: [], waitlist: [], turnoverTasks: [], expenses: [], chalets: [], settings: DEFAULT_SETTINGS, specialPriceRules: [], auditLog: [] };
export const CHALET_COLORS = ["#0F8B83", "#4379D8", "#A56DD1", "#C87947", "#2B95A4", "#C9587A", "#E11D48", "#EA580C", "#0D9488", "#2563EB", "#7C3AED", "#BE123C", "#0891B2", "#4D7C0F"] as const;
/**
 * لوحة ألوان محجوزة للفترات فقط. لا تشارك ألوان الوحدات ولا تقبل لون HEX حرًا.
 * "other" يغطي أي فترة جديدة لا تطابق الفترات القياسية.
 */
export const RESERVED_PERIOD_COLORS = {
  morning: "#0284C7",
  evening: "#4F46E5",
  overnight: "#8B5CF6",
  full_day: "#10B981",
  event: "#F43F5E",
  custom: "#F97316",
  other: "#06B6D4",
} as const;
export type ReservedPeriodColorKey = keyof typeof RESERVED_PERIOD_COLORS;
export const EXTRA_SHIFT_PERIOD_KEYS: ReservedPeriodColorKey[] = ["full_day", "event", "custom", "other"];
export const RESERVED_PERIOD_META: Record<ReservedPeriodColorKey, { ar: string; en: string }> = {
  morning: { ar: "صباحي", en: "Morning" },
  evening: { ar: "مسائي", en: "Evening" },
  overnight: { ar: "مبيت", en: "Overnight" },
  full_day: { ar: "يوم كامل", en: "Full day" },
  event: { ar: "مناسبة / تصوير", en: "Event / photo" },
  custom: { ar: "فترة مخصصة", en: "Custom period" },
  other: { ar: "فترة أخرى", en: "Other period" },
};
/** Deprecated compatibility export. New and migrated shifts always resolve through RESERVED_PERIOD_COLORS. */
export const SHIFT_COLORS = Object.values(RESERVED_PERIOD_COLORS);
const timeValuePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const chaletColorPattern = /^#[0-9A-Fa-f]{6}$/;

export function isValidChaletColor(value: string | undefined) { return chaletColorPattern.test(value?.trim() ?? ""); }
export function normalizeChaletColor(value: string | undefined, fallback: string = CHALET_COLORS[0]) { return isValidChaletColor(value) ? value!.trim().toUpperCase() : fallback; }
export function legacyShiftIdForBookingType(type: BookingType) { return type === "morning" ? LEGACY_SHIFT_IDS.morning : type === "evening" ? LEGACY_SHIFT_IDS.evening : type === "24h" ? LEGACY_SHIFT_IDS["24h"] : undefined; }
export function bookingTypeForShift(shiftId: string | undefined): BookingType { return shiftId === LEGACY_SHIFT_IDS.morning ? "morning" : shiftId === LEGACY_SHIFT_IDS.evening ? "evening" : shiftId === LEGACY_SHIFT_IDS["24h"] ? "24h" : "custom"; }
export function reservedPeriodColorKeyForBookingType(type: BookingType): ReservedPeriodColorKey {
  return type === "morning" ? "morning" : type === "evening" ? "evening" : type === "24h" || type === "multi-day" ? "overnight" : "custom";
}
export function reservedPeriodColorForBookingType(type: BookingType) { return RESERVED_PERIOD_COLORS[reservedPeriodColorKeyForBookingType(type)]; }
export function reservedPeriodColorKeyForShift(shift: Pick<ChaletShift, "id" | "name" | "periodKind">): ReservedPeriodColorKey {
  if (shift.periodKind && shift.periodKind in RESERVED_PERIOD_COLORS) return shift.periodKind;
  const id = shift.id.trim().toLowerCase();
  const name = shift.name.trim().toLowerCase();
  if (id === LEGACY_SHIFT_IDS.morning || /صباح|morning/.test(name)) return "morning";
  if (id === LEGACY_SHIFT_IDS.evening || /سهرة|مساء|مسائي|ليل|evening|night/.test(name)) return "evening";
  if (id === LEGACY_SHIFT_IDS["24h"] || /24|مبيت|overnight/.test(name)) return "overnight";
  if (/يوم كامل|عدة أيام|عدة ايام|full day|multi/.test(name)) return "full_day";
  if (/مناسبة|تصوير|حدث|event|photo/.test(name)) return "event";
  if (/مخصص|custom/.test(name)) return "custom";
  return "other";
}
export function reservedPeriodColorForShift(shift: Pick<ChaletShift, "id" | "name" | "periodKind">) { return RESERVED_PERIOD_COLORS[reservedPeriodColorKeyForShift(shift)]; }
export function legacyChaletShifts(periodPricing?: Partial<PeriodPricingSettings>, periodTimes?: Chalet["periodTimes"], bookingTypes: Settings["bookingTypes"] = DEFAULT_SETTINGS.bookingTypes): ChaletShift[] {
  return PRICED_BOOKING_TYPES.map((type) => {
    const configured = bookingTypes[type] ?? DEFAULT_SETTINGS.bookingTypes[type];
    const timing = periodTimes?.[type];
    const rate = periodPricing?.[type] ?? DEFAULT_PERIOD_PRICING[type];
    return {
      id: LEGACY_SHIFT_IDS[type],
      name: configured.label,
      startTime: timing && timeValuePattern.test(timing.startTime) ? timing.startTime : configured.startTime,
      endTime: timing && timeValuePattern.test(timing.endTime) ? timing.endTime : configured.endTime,
      weekdayPrice: Math.max(0, Number(rate.weekdayPrice || 0)),
      weekendPrice: Math.max(0, Number(rate.weekendPrice || 0)),
      isActive: true,
      periodKind: reservedPeriodColorKeyForBookingType(type),
      color: reservedPeriodColorForBookingType(type),
    };
  });
}
export function normalizeChaletShifts(value: unknown, legacy: { periodPricing?: Partial<PeriodPricingSettings>; periodTimes?: Chalet["periodTimes"]; bookingTypes?: Settings["bookingTypes"] } = {}): ChaletShift[] {
  const rawShifts = Array.isArray(value) ? value : [];
  const ids = new Set<string>();
  const shifts = rawShifts.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ChaletShift>;
    const id = typeof candidate.id === "string" ? candidate.id.trim().replace(/\s+/g, "-").slice(0, 72) : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, 48) : "";
    if (!id || !name || ids.has(id)) return [];
    ids.add(id);
    const inferredKind = index >= 3 ? EXTRA_SHIFT_PERIOD_KEYS[(index - 3) % EXTRA_SHIFT_PERIOD_KEYS.length]! : reservedPeriodColorKeyForShift({ id, name });
    const periodKind = candidate.periodKind && candidate.periodKind in RESERVED_PERIOD_COLORS ? candidate.periodKind : inferredKind;
    const identity = { id, name, periodKind };
    return [{ ...identity, startTime: typeof candidate.startTime === "string" && timeValuePattern.test(candidate.startTime) ? candidate.startTime : "09:00", endTime: typeof candidate.endTime === "string" && timeValuePattern.test(candidate.endTime) ? candidate.endTime : "17:00", weekdayPrice: Math.max(0, Number(candidate.weekdayPrice || 0)), weekendPrice: Math.max(0, Number(candidate.weekendPrice || 0)), isActive: candidate.isActive !== false, color: reservedPeriodColorForShift(identity) } satisfies ChaletShift];
  });
  if (!shifts.length) return legacyChaletShifts(legacy.periodPricing, legacy.periodTimes, legacy.bookingTypes);
  return shifts;
}
export function getChaletShifts(chalet: Chalet | undefined, settings: Settings = DEFAULT_SETTINGS) {
  return normalizeChaletShifts(chalet?.shifts, { periodPricing: chalet?.periodPricing, periodTimes: chalet?.periodTimes, bookingTypes: settings.bookingTypes });
}
export function getActiveChaletShifts(chalet: Chalet | undefined, settings: Settings = DEFAULT_SETTINGS) { return getChaletShifts(chalet, settings).filter((shift) => shift.isActive); }
export function getChaletShift(chalet: Chalet | undefined, shiftId: string | undefined, bookingType: BookingType = "morning", settings: Settings = DEFAULT_SETTINGS) {
  const shifts = getChaletShifts(chalet, settings);
  return shifts.find((shift) => shift.id === shiftId) ?? shifts.find((shift) => shift.id === legacyShiftIdForBookingType(bookingType)) ?? shifts.find((shift) => shift.isActive) ?? shifts[0];
}

export function normalizeWeekendDays(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const days = [...new Set(value.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))];
  return days.length ? days.sort((left, right) => left - right) : undefined;
}

export function isValidBusinessLogoUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    return new URL(trimmed).protocol === "https:";
  } catch {
    return false;
  }
}

const chaletReferenceCodePattern = /^[A-Z0-9\u0621-\u064A]{2}$/;

export function normalizeChaletReferenceCode(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export function isValidChaletReferenceCode(value: string | undefined) {
  return chaletReferenceCodePattern.test(normalizeChaletReferenceCode(value));
}

export function suggestChaletReferenceCode(existingCodes: Array<string | undefined>) {
  const used = new Set(existingCodes.map(normalizeChaletReferenceCode).filter(isValidChaletReferenceCode));
  for (let index = 1; index <= 99; index += 1) {
    const candidate = String(index).padStart(2, "0");
    if (!used.has(candidate)) return candidate;
  }
  return "A0";
}

export function normalizeChaletReferenceCodes(chalets: Chalet[]) {
  const used = new Set<string>();
  return chalets.map((chalet) => {
    const requestedCode = normalizeChaletReferenceCode(chalet.referenceCode);
    const referenceCode = isValidChaletReferenceCode(requestedCode) && !used.has(requestedCode) ? requestedCode : suggestChaletReferenceCode([...used]);
    used.add(referenceCode);
    return { ...chalet, referenceCode };
  });
}

export function bookingPeriodReferenceDigit(type: BookingType) {
  return type === "morning" ? "1" : type === "evening" ? "2" : "3";
}

/** Generates an operational reference: chalet code + start date + period digit, without separators. */
export function bookingReferenceFor(booking: Pick<Booking, "chaletId" | "startDate" | "bookingType">, chalets: Chalet[]) {
  const chalet = chalets.find((item) => item.id === booking.chaletId);
  const chaletCode = normalizeChaletReferenceCode(chalet?.referenceCode);
  const date = booking.startDate.slice(2).replace(/\D/g, "");
  return `#${isValidChaletReferenceCode(chaletCode) ? chaletCode : "00"}${date}${bookingPeriodReferenceDigit(booking.bookingType)}`;
}

/** Formats any legacy or manually entered reference with exactly one leading hashtag. */
export function formatBookingReference(reference: string | undefined) {
  const normalized = (reference ?? "").trim().replace(/\s+/g, "").replace(/^#+|#+$/g, "");
  return normalized ? `#${normalized}` : "—";
}

/** Rebuilds operational references when the chalet code, date, or booking period changes. */
export function normalizeBookingReferences(bookings: Booking[], chalets: Chalet[] = []) {
  return bookings.map((booking) => ({ ...booking, bookingReference: bookingReferenceFor(booking, chalets) }));
}

export function normalizeAppData(data: Partial<AppData>): AppData {
  const hasChaletList = Array.isArray(data.chalets);
  const normalizePeriodTimes = (value: Chalet["periodTimes"] | undefined) => {
    const normalized = PRICED_BOOKING_TYPES.reduce((result, type) => {
      const candidate = value?.[type];
      if (candidate && /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.startTime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.endTime)) result[type] = { startTime: candidate.startTime, endTime: candidate.endTime };
      return result;
    }, {} as NonNullable<Chalet["periodTimes"]>);
    return Object.keys(normalized).length ? normalized : undefined;
  };
  const configuredBookingTypes = (data.settings as Partial<Settings> | undefined)?.bookingTypes ?? DEFAULT_SETTINGS.bookingTypes;
  const existing: Chalet[] = hasChaletList ? data.chalets!.filter((chalet): chalet is Chalet => Boolean(chalet?.id && chalet?.name)).map((chalet) => ({ ...chalet, name: chalet.name.trim(), referenceCode: normalizeChaletReferenceCode(chalet.referenceCode) || undefined, color: normalizeChaletColor(chalet.color), imageUri: chalet.imageUri?.trim() || undefined, location: chalet.location?.trim() || undefined, locationUrl: chalet.locationUrl?.trim() || undefined, guardianName: chalet.guardianName?.trim() || undefined, guardianPhone: chalet.guardianPhone?.trim() || undefined, contactPhone: chalet.contactPhone?.trim() || undefined, notes: chalet.notes?.trim() || undefined, weekendDays: normalizeWeekendDays(chalet.weekendDays), periodTimes: normalizePeriodTimes(chalet.periodTimes), shifts: normalizeChaletShifts(chalet.shifts, { periodPricing: chalet.periodPricing, periodTimes: chalet.periodTimes, bookingTypes: configuredBookingTypes }), createdAt: chalet.createdAt || new Date(0).toISOString() })).filter((chalet) => chalet.name) : [];
  const byName = new Map(existing.map((chalet) => [chalet.name.toLocaleLowerCase(), chalet]));
  const knownIds = new Set(existing.map((chalet) => chalet.id));
  const legacyNames = [...(data.bookings ?? []), ...(data.waitlist ?? [])].filter((item) => !item.chaletId || !knownIds.has(item.chaletId)).map((item) => item.chaletName?.trim()).filter((name): name is string => Boolean(name));
  legacyNames.forEach((name) => {
    const key = name.toLocaleLowerCase();
    if (!byName.has(key)) {
      const chalet = { id: `legacy-chalet-${byName.size + 1}`, name, color: CHALET_COLORS[byName.size % CHALET_COLORS.length], shifts: legacyChaletShifts(undefined, undefined, configuredBookingTypes), createdAt: new Date(0).toISOString() };
      byName.set(key, chalet);
      existing.push(chalet);
    }
  });
  const referencedChalets = normalizeChaletReferenceCodes(existing);
  const chaletByName = new Map(referencedChalets.map((chalet) => [chalet.name.toLocaleLowerCase(), chalet.id]));
  const validIds = new Set(referencedChalets.map((chalet) => chalet.id));
  const linkChalet = <T extends { chaletId?: string; chaletName?: string }>(item: T): T => {
    const linkedId = item.chaletId && validIds.has(item.chaletId) ? item.chaletId : item.chaletName?.trim() ? chaletByName.get(item.chaletName.trim().toLocaleLowerCase()) : undefined;
    const canonicalName = referencedChalets.find((chalet) => chalet.id === linkedId)?.name;
    return { ...item, chaletId: linkedId, chaletName: canonicalName ?? item.chaletName?.trim() };
  };
  const linkShift = <T extends { chaletId?: string; chaletName?: string; bookingType: BookingType; shiftId?: string; shiftName?: string; shiftColor?: string }>(item: T): T => {
    const linked = linkChalet(item);
    const chalet = referencedChalets.find((candidate) => candidate.id === linked.chaletId);
    const shift = getChaletShift(chalet, linked.shiftId, linked.bookingType);
    return { ...linked, shiftId: shift?.id ?? (linked.shiftId?.trim() || undefined), shiftName: shift?.name ?? (linked.shiftName?.trim() || undefined), shiftColor: shift?.color ?? (isValidChaletColor(linked.shiftColor) ? linked.shiftColor!.trim().toUpperCase() : undefined) };
  };
  const legacySettings = (data.settings ?? {}) as Partial<Settings> & { guardPhone?: string; locationUrl?: string };
  const { guardPhone: legacyGuardPhone, locationUrl: legacyLocationUrl, ...incomingSettings } = legacySettings;
  const migratedChalets = referencedChalets.map((chalet) => ({ ...chalet, propertyType: normalizePropertyType(chalet.propertyType), locationUrl: chalet.locationUrl || legacyLocationUrl?.trim() || undefined, guardianPhone: chalet.guardianPhone || legacyGuardPhone?.trim() || undefined }));
  const legacyWeekendPrice = Math.max(0, Number(incomingSettings.weekendPrice || 0));
  const rawPeriodPricing = incomingSettings.periodPricing ?? DEFAULT_PERIOD_PRICING;
  const periodPricing = PRICED_BOOKING_TYPES.reduce((pricing, type) => ({ ...pricing, [type]: { weekdayPrice: Math.max(0, Number(rawPeriodPricing[type]?.weekdayPrice || 0)), weekendPrice: Math.max(0, Number(rawPeriodPricing[type]?.weekendPrice ?? legacyWeekendPrice)) } }), {} as PeriodPricingSettings);
  const weekendDays = Array.isArray(incomingSettings.weekendDays) ? incomingSettings.weekendDays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6) : DEFAULT_SETTINGS.weekendDays;
  incomingSettings.paymentMethods = normalizePaymentMethodOptions(incomingSettings.paymentMethods);
  const specialPriceRules = Array.isArray(data.specialPriceRules) ? data.specialPriceRules.filter((rule): rule is SpecialPriceRule => Boolean(rule?.id && rule?.name && /^\d{4}-\d{2}-\d{2}$/.test(rule.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(rule.endDate) && rule.endDate >= rule.startDate && Number.isFinite(Number(rule.price)) && Number(rule.price) >= 0 && (rule.kind === "season" || rule.kind === "occasion"))).map((rule) => ({ ...rule, name: rule.name.trim(), price: Number(rule.price) })) : [];
  const isNoChangePaymentAudit = (entry: AuditLogEntry) => {
    if (entry.action !== "payment-updated") return false;
    const match = entry.details.match(/(?:من\s+)?([0-9]+(?:\.[0-9]+)?)\s*(?:د\.أ)?\s*(?:←|إلى)\s*([0-9]+(?:\.[0-9]+)?)/);
    return Boolean(match && Math.abs(Number(match[1]) - Number(match[2])) < 0.0001);
  };
  const auditLog = Array.isArray(data.auditLog) ? data.auditLog.filter((entry): entry is AuditLogEntry => Boolean(entry?.id && entry?.subjectName && entry?.details && entry?.createdAt && ["waitlist-promoted", "waitlist-deleted", "waitlist-cancelled", "booking-deleted", "booking-cancelled", "booking-checked-in", "booking-checked-out", "booking-status-corrected", "turnover-task-updated", "expense-added", "expense-deleted", "booking-waitlist-priority-confirmed", "chalet-deleted", "payment-updated", "payment-voided"].includes(entry.action))).filter((entry) => !isNoChangePaymentAudit(entry)).map((entry) => ({ ...entry, actorName: entry.actorName?.trim() || undefined })) : [];
  const normalizeRecordedAt = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? value : undefined;
  const normalizePayment = (payment: Payment): Payment => {
    const paymentMethod = normalizePaymentMethodId(payment.paymentMethod);
    return { ...payment, amount: Math.max(0, Number(payment.amount || 0)), recordedAt: normalizeRecordedAt(payment.recordedAt), note: payment.note?.trim() || undefined, paymentMethod, recipientType: normalizePaymentRecipientType(payment.recipientType), handlerUserId: Number.isInteger(payment.handlerUserId) ? payment.handlerUserId : undefined, handlerName: payment.handlerName?.trim().slice(0, 255) || undefined, recipientAccountLabel: payment.recipientAccountLabel?.trim().slice(0, 180) || undefined, calculatedCommission: Math.max(0, Number(payment.calculatedCommission || 0)) || undefined, commissionType: payment.commissionType === "fixed" ? "fixed" : payment.commissionType === "percent" ? "percent" : undefined, receiptUri: payment.receiptUri?.trim() || undefined, voidedAt: normalizeRecordedAt(payment.voidedAt), voidReason: payment.voidReason?.trim() || undefined, recordedByUserId: Number.isInteger(payment.recordedByUserId) ? payment.recordedByUserId : undefined, recordedByName: payment.recordedByName?.trim() || undefined, updatedByUserId: Number.isInteger(payment.updatedByUserId) ? payment.updatedByUserId : undefined, updatedByName: payment.updatedByName?.trim() || undefined, voidedByUserId: Number.isInteger(payment.voidedByUserId) ? payment.voidedByUserId : undefined, voidedByName: payment.voidedByName?.trim() || undefined };
  };
  const normalizeCheckInConfirmation = (value: CheckInConfirmation | undefined): CheckInConfirmation | undefined => {
    if (!value || !normalizeRecordedAt(value.actualArrivalAt)) return undefined;
    return { actualArrivalAt: value.actualArrivalAt, rentalBalanceVerified: value.rentalBalanceVerified === true, rentalBalancePaymentMethod: normalizePaymentMethodId(value.rentalBalancePaymentMethod), securityDepositVerified: value.securityDepositVerified === true, securityDepositPaymentMethod: normalizePaymentMethodId(value.securityDepositPaymentMethod), identityNote: value.identityNote?.trim().slice(0, 240) || undefined, identityImageUri: value.identityImageUri?.trim() || undefined };
  };
  const bookings = normalizeBookingReferences((data.bookings ?? []).map((booking) => normalizeBookingEndDate({ ...linkShift(booking), depositPaymentMethod: normalizePaymentMethodId(booking.depositPaymentMethod), depositPaymentRecordedAt: normalizeRecordedAt(booking.depositPaymentRecordedAt), depositCollection: booking.depositCollection && Boolean(booking.depositCollection.id) && Number.isFinite(Number(booking.depositCollection.amount)) && Number(booking.depositCollection.amount) >= 0 && typeof booking.depositCollection.date === "string" ? normalizePayment(booking.depositCollection) : undefined, payments: Array.isArray(booking.payments) ? booking.payments.filter((payment): payment is Payment => Boolean(payment?.id) && Number.isFinite(Number(payment.amount)) && Number(payment.amount) >= 0 && typeof payment.date === "string").map(normalizePayment) : [], depositRefunds: Array.isArray(booking.depositRefunds) ? booking.depositRefunds.filter((refund) => Boolean(refund?.id) && Number.isFinite(Number(refund.amount)) && Number(refund.amount) >= 0 && typeof refund.date === "string").map((refund) => ({ ...refund, amount: Math.max(0, Number(refund.amount || 0)), recordedAt: normalizeRecordedAt(refund.recordedAt), note: refund.note?.trim() || undefined, paymentMethod: normalizePaymentMethodId(refund.paymentMethod) })) : [], checkInConfirmation: normalizeCheckInConfirmation(booking.checkInConfirmation), createdByRole: booking.createdByRole === "owner" || booking.createdByRole === "employee" ? booking.createdByRole : undefined, waitlistPriorityAcknowledgedForId: booking.waitlistPriorityAcknowledgedForId?.trim() || undefined, waitlistPriorityAcknowledgedAt: normalizeRecordedAt(booking.waitlistPriorityAcknowledgedAt), waitlistPriorityAcknowledgedByName: booking.waitlistPriorityAcknowledgedByName?.trim() || undefined })), migratedChalets);
  const businessLogoUrl = incomingSettings.businessLogoUrl?.trim();
  const guestCheckInModeHistory = Array.isArray(incomingSettings.device?.guestCheckInModeHistory) ? incomingSettings.device.guestCheckInModeHistory.filter((entry): entry is GuestCheckInModeChange => Boolean(entry && typeof entry.enabled === "boolean" && normalizeRecordedAt(entry.changedAt))).map((entry) => ({ enabled: entry.enabled, changedAt: entry.changedAt })).sort((left, right) => right.changedAt.localeCompare(left.changedAt)).slice(0, 3) : [];
  const glassBackgroundLevel = normalizeGlassBackgroundLevel(incomingSettings.device?.glassBackgroundLevel, incomingSettings.device?.quietGlassBackground === true);
  const glassSurfaceOpacity = normalizeGlassSurfaceOpacity(incomingSettings.device?.glassSurfaceOpacity);
  const glassGlowIntensity = normalizeGlassGlowIntensity(incomingSettings.device?.glassGlowIntensity);
  const device: DeviceSettings | undefined = incomingSettings.device ? { ...DEFAULT_DEVICE_SETTINGS, ...incomingSettings.device, bookingCardViewMode: incomingSettings.device.bookingCardViewMode === "compact" ? "compact" : "expanded", glassBackgroundLevel, glassSurfaceOpacity, glassGlowIntensity, quietGlassBackground: glassBackgroundLevel !== "standard", showGuestCheckIn: incomingSettings.device.showGuestCheckIn !== false, guestCheckInModeHistory, showTurnoverTasks: incomingSettings.device.showTurnoverTasks !== false, showDailyTasks: incomingSettings.device.showDailyTasks !== false, dailyOperationsCollapsed: incomingSettings.device.dailyOperationsCollapsed === true } : undefined;
  const turnoverTasks: TurnoverTask[] = Array.isArray(data.turnoverTasks) ? data.turnoverTasks.filter((task): task is TurnoverTask => Boolean(task?.id && task?.checkoutBookingId && task?.nextBookingId && typeof task?.dueAt === "string" && typeof task?.createdAt === "string")).map((task) => ({ ...task, chaletId: task.chaletId?.trim() || undefined, chaletName: task.chaletName?.trim() || undefined, status: (task.status === "completed" ? "completed" : task.status === "in-progress" ? "in-progress" : "pending") as TurnoverTaskStatus, completedAt: normalizeRecordedAt(task.completedAt), completedByName: task.completedByName?.trim() || undefined })) : [];
  const normalizeExpenseCategory = (value: unknown): ExpenseCategory => {
    if (value === "guards-salaries" || value === "maintenance" || value === "cleaning-supplies" || value === "utilities" || value === "other") return value;
    if (value === "cleaning" || value === "supplies") return "cleaning-supplies";
    return "other";
  };
  const expenses: Expense[] = Array.isArray(data.expenses) ? data.expenses.filter((expense): expense is Expense => Boolean(expense?.id && typeof expense?.date === "string" && Number.isFinite(Number(expense?.amount)) && Number(expense.amount) > 0)).map((expense) => {
    const generalAllocations = Array.isArray(expense.generalAllocations) ? expense.generalAllocations.filter((allocation): allocation is ExpenseAllocation => Boolean(allocation?.chaletId?.trim() && allocation?.chaletName?.trim() && Number.isFinite(Number(allocation.amount)) && Number(allocation.amount) > 0)).map((allocation) => ({ chaletId: allocation.chaletId.trim(), chaletName: allocation.chaletName.trim(), amount: Number(allocation.amount) })) : undefined;
    return { ...expense, amount: Number(expense.amount), chaletId: expense.chaletId?.trim() || undefined, chaletName: expense.chaletName?.trim() || undefined, category: normalizeExpenseCategory(expense.category), note: expense.note?.trim() || undefined, paymentMethod: expense.paymentMethod === "cash" || expense.paymentMethod === "click" ? expense.paymentMethod : undefined, receiptUri: expense.receiptUri?.trim() || undefined, generalAllocations: generalAllocations?.length ? generalAllocations : undefined, createdByName: expense.createdByName?.trim() || undefined };
  }) : [];
  return { bookings, waitlist: (data.waitlist ?? []).map((entry) => ({ ...linkShift(entry), depositPaymentMethod: normalizePaymentMethodId(entry.depositPaymentMethod), depositPaymentRecordedAt: normalizeRecordedAt(entry.depositPaymentRecordedAt), status: entry.status === "cancelled" ? "cancelled" : entry.status === "promoted" ? "promoted" : "active", cancelledAt: typeof entry.cancelledAt === "string" ? entry.cancelledAt : undefined, cancellationReason: entry.cancellationReason === "start-time" ? "start-time" : entry.cancellationReason === "manual" ? "manual" : undefined, promotedAt: typeof entry.promotedAt === "string" ? entry.promotedAt : undefined, promotedByUserId: Number.isInteger(entry.promotedByUserId) ? entry.promotedByUserId : undefined, promotedByName: entry.promotedByName?.trim() || undefined, promotedBookingId: entry.promotedBookingId?.trim() || undefined, promotedBookingReference: entry.promotedBookingReference?.trim() || undefined, promotedReplacedCustomerNames: entry.promotedReplacedCustomerNames?.trim() || undefined })), turnoverTasks, expenses, chalets: migratedChalets, specialPriceRules, auditLog, settings: { ...DEFAULT_SETTINGS, ...incomingSettings, device, businessLogoUrl: businessLogoUrl && isValidBusinessLogoUrl(businessLogoUrl) ? businessLogoUrl : undefined, weekendDays: weekendDays?.length ? weekendDays : DEFAULT_SETTINGS.weekendDays, periodPricing, whatsAppOptions: { ...DEFAULT_WHATSAPP_MESSAGE_OPTIONS, ...(incomingSettings.whatsAppOptions ?? {}) }, bookingTypes: { ...DEFAULT_SETTINGS.bookingTypes, ...(incomingSettings.bookingTypes ?? {}) } } };
}

export function chaletLabel(chaletId: string | undefined, legacyName: string | undefined, chalets: Chalet[], fallback = "الشاليه غير محدد") {
  return chalets.find((chalet) => chalet.id === chaletId)?.name ?? legacyName?.trim() ?? fallback;
}

export function chaletColor(chaletId: string | undefined, chalets: Chalet[], fallback = "#94A3B8") {
  return chalets.find((chalet) => chalet.id === chaletId)?.color ?? fallback;
}

/** Splits a general expense in the smallest currency unit so every saved share adds up exactly to the parent amount. */
export function splitExpenseAcrossChalets(amount: number, chalets: Pick<Chalet, "id" | "name">[]): ExpenseAllocation[] {
  const validChalets = chalets.filter((chalet) => Boolean(chalet.id?.trim() && chalet.name?.trim()));
  const totalMinor = Math.round(Math.max(0, Number(amount) || 0) * 100);
  if (!validChalets.length || !totalMinor) return [];
  const base = Math.floor(totalMinor / validChalets.length);
  const remainder = totalMinor % validChalets.length;
  return validChalets.map((chalet, index) => ({ chaletId: chalet.id, chaletName: chalet.name, amount: (base + (index < remainder ? 1 : 0)) / 100 }));
}

/** Returns the direct cost or the saved share of a general expense for one unit. */
export function expenseAmountForChalet(expense: Expense, chaletId: string) {
  if (expense.chaletId === chaletId) return Math.max(0, Number(expense.amount || 0));
  return Math.max(0, Number(expense.generalAllocations?.find((allocation) => allocation.chaletId === chaletId)?.amount || 0));
}

function latinDigits(value: string) {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const eastern = "۰۱۲۳۴۵۶۷۸۹";
  return value.replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit))).replace(/[۰-۹]/g, (digit) => String(eastern.indexOf(digit)));
}

export function isValidGuardianPhone(value: string) {
  if (!value.trim()) return true;
  const digits = latinDigits(value).replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function isValidGoogleMapsUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "maps.google.com" || host === "maps.app.goo.gl" || (host.endsWith(".google.com") && url.pathname.includes("/maps")) || (host === "goo.gl" && url.pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

/** Preserves a booking's operational and payment details when it is deferred to the waitlist. */
export function bookingToWaitlistEntry(booking: Booking, id = `w-${Date.now()}`): WaitlistEntry {
  return {
    id,
    customerName: booking.customerName.trim(),
    phone: booking.phone,
    chaletId: booking.chaletId,
    chaletName: booking.chaletName,
    requestedDate: booking.startDate,
    endDate: booking.endDate,
    bookingType: booking.bookingType,
    shiftId: booking.shiftId,
    shiftName: booking.shiftName,
    shiftColor: booking.shiftColor,
    startTime: booking.startTime,
    endTime: booking.endTime,
    price: booking.price,
    discountAmount: booking.discountAmount,
    depositAmount: booking.depositAmount,
    depositPaymentMethod: booking.depositPaymentMethod,
    depositPaymentRecordedAt: booking.depositPaymentRecordedAt,
    payments: booking.payments.map((payment) => ({ ...payment })),
    notes: booking.notes,
    status: "active",
    createdAt: new Date().toISOString(),
  };
}
const bookingTypeNames: Record<BookingType, { ar: string; en: string }> = { morning: { ar: "صباحي", en: "Morning" }, evening: { ar: "سهرة", en: "Evening" }, "24h": { ar: "24 ساعة", en: "24 hours" }, custom: { ar: "فترة مخصصة", en: "Custom period" }, "multi-day": { ar: "عدة أيام", en: "Multiple days" } };
export const bookingTypeLabel = (type: BookingType, settings: Settings = DEFAULT_SETTINGS, language: AppLanguage = "ar") => {
  const configured = settings.bookingTypes[type]?.label;
  if (language === "en" && configured === DEFAULT_SETTINGS.bookingTypes[type]?.label) return bookingTypeNames[type].en;
  return configured ?? bookingTypeNames[type][language];
};
export function bookingShiftLabel(booking: Pick<Booking, "bookingType" | "shiftName">, settings: Settings = DEFAULT_SETTINGS, language: AppLanguage = "ar") { return booking.shiftName?.trim() || bookingTypeLabel(booking.bookingType, settings, language); }
export const statusLabel = (status: BookingStatus, language: AppLanguage = "ar") => ({
  ar: { confirmed: "مؤكد", "awaiting-deposit": "بانتظار العربون", cancelled: "ملغي", completed: "منتهي", waitlisted: "قائمة انتظار" },
  en: { confirmed: "Confirmed", "awaiting-deposit": "Awaiting deposit", cancelled: "Cancelled", completed: "Completed", waitlisted: "Waitlisted" },
}[language][status]);
export const PERIOD_COLORS = { morning: RESERVED_PERIOD_COLORS.morning, evening: RESERVED_PERIOD_COLORS.evening, "24h": RESERVED_PERIOD_COLORS.overnight, "multi-day": RESERVED_PERIOD_COLORS.overnight, custom: RESERVED_PERIOD_COLORS.custom, waitlist: "#EAB308" } as const;
export const statusColors: Record<BookingStatus, { background: string; text: string }> = { confirmed: { background: "#DCFCE7", text: "#166534" }, "awaiting-deposit": { background: "#FEF3C7", text: "#92400E" }, completed: { background: "#E2E8F0", text: "#475569" }, cancelled: { background: "#FEE2E2", text: "#991B1B" }, waitlisted: { background: "#FEF3C7", text: PERIOD_COLORS.waitlist } };
export const typeColors: Record<BookingType, { background: string; text: string }> = { morning: { background: "#DBEAFE", text: PERIOD_COLORS.morning }, evening: { background: "#EDE9FE", text: PERIOD_COLORS.evening }, "24h": { background: "#D1FAE5", text: PERIOD_COLORS["24h"] }, custom: { background: "#F1F5F9", text: "#64748B" }, "multi-day": { background: "#FCE7F3", text: PERIOD_COLORS["multi-day"] } };
export function parseISODate(date: string) { const [y, m, d] = date.split("-").map(Number); return { y, m, d }; }
export function dayNumber(date: string) { const { y, m, d } = parseISODate(date); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }
export function addDays(date: string, amount: number) { const { y, m, d } = parseISODate(date); const value = new Date(Date.UTC(y, m - 1, d + amount)); return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`; }
export function minutesOf(time: string) { const [h, m] = time.split(":").map(Number); return h * 60 + m; }
/** Stores 24-hour reservations with their actual next-day checkout date. */
export function normalizeBookingEndDate(booking: Booking): Booking {
  const eveningCheckoutFollowingDay = booking.bookingType === "evening" && booking.endDate === booking.startDate;
  const fullDayCheckoutFollowingDay = booking.bookingType === "24h" && booking.endDate === booking.startDate && minutesOf(booking.endTime) <= minutesOf(booking.startTime);
  const dynamicOvernightCheckout = Boolean(booking.shiftId) && booking.endDate === booking.startDate && minutesOf(booking.endTime) <= minutesOf(booking.startTime);
  const staysUntilNextDay = eveningCheckoutFollowingDay || fullDayCheckoutFollowingDay || dynamicOvernightCheckout;
  return staysUntilNextDay ? { ...booking, endDate: addDays(booking.startDate, 1) } : booking;
}
export function dateTimeValue(date: string, time: string) { return dayNumber(date) * 1440 + minutesOf(time); }
/** Converts a saved local booking date and clock time to the device's actual epoch timestamp. */
export function localDateTimeTimestamp(date: string, time: string) {
  const { y, m, d } = parseISODate(date);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hours, minutes, 0, 0).getTime();
}
/** Returns exact device-time bounds, including overnight evening and 24-hour reservations. */
export function getBookingTimestampRange(booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType" | "shiftId">) {
  const start = localDateTimeTimestamp(booking.startDate, booking.startTime);
  const endDate = booking.endDate || booking.startDate;
  let end = localDateTimeTimestamp(endDate, booking.endTime);
  const spansFollowingDay = booking.bookingType === "evening" || booking.bookingType === "24h" || Boolean((booking as Pick<Booking, "shiftId">).shiftId && booking.endTime <= booking.startTime);
  if (spansFollowingDay && end <= start) end += 86_400_000;
  return { start, end };
}
export const CHECKOUT_WARNING_MILLISECONDS = 2 * 60 * 60 * 1000;
export type BookingStayPhase = "upcoming" | "in-house" | "checkout-warning" | "ended";
export type BookingOperationalState = "awaiting-arrival" | "late-arrival" | "in-house" | "checkout-warning" | "no-show" | "ended";
/** Resolves the live stay phase from the booking's own end date and local checkout time. */
export function getBookingStayTimeline(booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType" | "shiftId">, now = Date.now(), checkoutWarningMilliseconds = CHECKOUT_WARNING_MILLISECONDS) {
  const { start, end } = getBookingTimestampRange(booking);
  if (now < start) return { phase: "upcoming" as const, start, end, remainingMilliseconds: start - now };
  if (now >= end) return { phase: "ended" as const, start, end, remainingMilliseconds: 0 };
  const remainingMilliseconds = end - now;
  return { phase: remainingMilliseconds <= checkoutWarningMilliseconds ? "checkout-warning" as const : "in-house" as const, start, end, remainingMilliseconds };
}
/** Operational state deliberately requires a recorded arrival before exposing checkout progress. */
export function getBookingOperationalState(booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType" | "shiftId" | "checkedInAt" | "checkedOutAt" | "noShowAt">, now = Date.now(), checkoutWarningMilliseconds = CHECKOUT_WARNING_MILLISECONDS) {
  const timeline = getBookingStayTimeline(booking, now, checkoutWarningMilliseconds);
  if (booking.checkedOutAt || booking.noShowAt) return { state: "ended" as const, ...timeline };
  if (!booking.checkedInAt) {
    if (timeline.phase === "upcoming") return { state: "awaiting-arrival" as const, ...timeline };
    if (timeline.phase === "ended") return { state: "no-show" as const, ...timeline };
    return { state: "late-arrival" as const, ...timeline };
  }
  if (timeline.phase === "checkout-warning" || timeline.phase === "ended") return { state: "checkout-warning" as const, ...timeline };
  return { state: "in-house" as const, ...timeline };
}

/**
 * Produces a concise, human-readable duration for live operational cards.
 * Long stays intentionally lead with days instead of exposing raw large hour counts.
 */
export function formatRemainingTime(milliseconds: number, language: AppLanguage = "ar") {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (language !== "ar") {
    if (days > 0) return `${days}d${hours ? ` ${hours}h` : ""}`;
    if (hours > 0) return `${hours}h${minutes ? ` ${minutes}m` : ""}`;
    return `${minutes}m`;
  }

  const unit = (value: number, singular: string, dual: string, few: string, many: string) => value === 1 ? singular : value === 2 ? dual : value >= 3 && value <= 10 ? `${value} ${few}` : `${value} ${many}`;
  const dayLabel = days ? unit(days, "يوم واحد", "يومان", "أيام", "يومًا") : "";
  const hourLabel = hours ? unit(hours, "ساعة واحدة", "ساعتان", "ساعات", "ساعة") : "";
  const minuteLabel = minutes ? unit(minutes, "دقيقة واحدة", "دقيقتان", "دقائق", "دقيقة") : "";

  if (days > 0) return [dayLabel, hourLabel].filter(Boolean).join(" و ") || dayLabel;
  if (hours > 0) return [hourLabel, minuteLabel].filter(Boolean).join(" و ") || hourLabel;
  return minuteLabel || "أقل من دقيقة";
}

/**
 * Keeps the persisted operational state intact while adapting card presentation
 * to the configured manual or automatic arrival workflow.
 */
export function getBookingDisplayOperationalState(booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType" | "shiftId" | "checkedInAt" | "checkedOutAt" | "noShowAt">, now = Date.now(), manualCheckIn = true, checkoutWarningMilliseconds = CHECKOUT_WARNING_MILLISECONDS) {
  const timeline = getBookingStayTimeline(booking, now, checkoutWarningMilliseconds);
  if (manualCheckIn) {
    const operational = getBookingOperationalState(booking, now, checkoutWarningMilliseconds);
    return operational.state === "late-arrival" ? { ...operational, state: "awaiting-arrival" as const } : operational;
  }
  if (booking.checkedOutAt || booking.noShowAt || timeline.phase === "ended") return { state: "ended" as const, ...timeline };
  if (timeline.phase === "upcoming") return { state: "awaiting-arrival" as const, ...timeline };
  return { state: timeline.phase === "checkout-warning" ? "checkout-warning" as const : "in-house" as const, ...timeline };
}
/** Separates active reservations from every stay whose configured checkout time has elapsed, without mutating the booking record. */
export function splitBookingsByCheckout(bookings: Booking[], now = Date.now()) {
  const historyBookings = bookings.filter((booking) => booking.status === "completed" || booking.status === "cancelled" || Boolean(booking.checkedOutAt) || isBookingExpired(booking, now));
  const historyIds = new Set(historyBookings.map((booking) => booking.id));
  const activeBookings = bookings.filter((booking) => !historyIds.has(booking.id));
  return { activeBookings, historyBookings };
}
export function isInvalidTimeOrder(booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType" | "shiftId">) { if (booking.bookingType === "evening" || booking.bookingType === "24h" || Boolean(booking.shiftId)) return false; if (booking.endDate > booking.startDate) return false; return minutesOf(booking.endTime) <= minutesOf(booking.startTime); }
/**
 * Maps every reservation to an exact UTC-minute interval. Evening stays always span the
 * following morning when their stored end date matches their start date; 24-hour stays
 * do the same when their end time is not later than their start time. Multi-day stays
 * retain their explicit end date, so a stay blocks every overlapping time on its last day.
 */
export function getBookingRange(booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType" | "shiftId">) {
  const start = dateTimeValue(booking.startDate, booking.startTime);
  const endDate = booking.endDate || booking.startDate;
  let end = dateTimeValue(endDate, booking.endTime);
  const sameDate = endDate === booking.startDate;
  const spansFollowingDay = booking.bookingType === "evening" || (booking.bookingType === "24h" && booking.endTime <= booking.startTime) || Boolean(booking.shiftId && booking.endTime <= booking.startTime);
  if (sameDate && spansFollowingDay) end += 1440;
  return { start, end };
}
/** Returns true as soon as the reservation's checkout minute is reached. */
export function isBookingExpired(booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType" | "shiftId">, now = Date.now()) {
  return getBookingTimestampRange(booking).end <= now;
}
/** True when a new booking's selected arrival date precedes the device's local current date. */
export function isBookingStartDatePast(booking: Pick<Booking, "startDate">, now = Date.now()) {
  return booking.startDate < localDateISO(new Date(now));
}
/** True only when a period that starts today has already reached its configured checkout time. */
export function isBookingPeriodEndedToday(booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType" | "shiftId">, now = Date.now()) {
  return booking.startDate === localDateISO(new Date(now)) && getBookingTimestampRange(booking).end <= now;
}
export function getWaitlistRange(entry: Pick<WaitlistEntry, "requestedDate" | "endDate" | "bookingType" | "shiftId" | "startTime" | "endTime">) {
  const configured = DEFAULT_SETTINGS.bookingTypes[entry.bookingType];
  return getBookingRange({ startDate: entry.requestedDate, endDate: entry.endDate ?? entry.requestedDate, bookingType: entry.bookingType, shiftId: entry.shiftId, startTime: entry.startTime ?? configured.startTime, endTime: entry.endTime ?? configured.endTime });
}
export function waitlistRemainingMilliseconds(entry: Pick<WaitlistEntry, "requestedDate" | "endDate" | "bookingType" | "startTime" | "endTime">, now = Date.now()) {
  return Math.max(0, getWaitlistRange(entry).start * 60_000 - now);
}
export function waitlistCountdownLabel(entry: Pick<WaitlistEntry, "requestedDate" | "endDate" | "bookingType" | "startTime" | "endTime">, now = Date.now(), language: AppLanguage = "ar") {
  const totalMinutes = Math.ceil(waitlistRemainingMilliseconds(entry, now) / 60_000);
  if (totalMinutes <= 0) return language === "ar" ? "حان وقت الإلغاء" : "Due for cancellation";
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (language === "ar") {
    const inflect = (value: number, singular: string, dual: string, few: string, many: string) => value === 1 ? singular : value === 2 ? dual : value >= 3 && value <= 10 ? `${value} ${few}` : `${value} ${many}`;
    const parts = [days ? inflect(days, "يوم واحد", "يومان", "أيام", "يومًا") : "", hours ? inflect(hours, "ساعة واحدة", "ساعتان", "ساعات", "ساعة") : "", minutes ? inflect(minutes, "دقيقة واحدة", "دقيقتان", "دقائق", "دقيقة") : ""];
    return parts.filter(Boolean).join(" و") || "أقل من دقيقة";
  }
  const parts: Array<[number, string]> = [[days, "d"], [hours, "h"], [minutes, "m"]];
  return parts.filter(([value]) => value > 0).map(([value, unit]) => `${value} ${unit}`).join(" ") || "Less than a minute";
}
export function isWaitlistExpired(entry: Pick<WaitlistEntry, "requestedDate" | "endDate" | "bookingType" | "startTime" | "endTime">, now = Date.now()) {
  return getWaitlistRange(entry).start <= Math.floor(now / 60000);
}
/** Expires waitlist requests only; an occupied stay always requires an explicit checkout confirmation and audit entry. */
export function expireElapsedRecords(data: AppData, now = Date.now()): AppData {
  let changed = false;
  const expiredWaitlist: WaitlistEntry[] = [];
  const legacyPromotions: Array<{ entry: WaitlistEntry; booking: Booking }> = [];
  const bookings = data.bookings;
  const waitlist = data.waitlist.flatMap((entry) => {
    const range = getWaitlistRange(entry);
    const matchingBooking = bookings.find((booking) => {
      if (booking.status === "cancelled" || booking.status === "completed" || booking.status === "waitlisted") return false;
      const sameChalet = (booking.chaletId ?? booking.chaletName?.trim()) === (entry.chaletId ?? entry.chaletName?.trim());
      const sameGuest = booking.customerName.trim().toLocaleLowerCase() === entry.customerName.trim().toLocaleLowerCase() && latinDigits(booking.phone).replace(/\D/g, "") === latinDigits(entry.phone).replace(/\D/g, "");
      const bookingRange = getBookingRange(booking);
      return sameChalet && sameGuest && bookingRange.start === range.start && bookingRange.end === range.end;
    });
    if (entry.status === "active" && matchingBooking) {
      changed = true;
      legacyPromotions.push({ entry, booking: matchingBooking });
      return [{ ...entry, status: "promoted" as const, promotedAt: new Date(now).toISOString(), promotedBookingId: matchingBooking.id, promotedBookingReference: matchingBooking.bookingReference, promotedByUserId: matchingBooking.createdByUserId, promotedByName: matchingBooking.createdByName ?? "غير متاح (سجل سابق)" }];
    }
    if (entry.status === "active" && isWaitlistExpired(entry, now)) {
      changed = true;
      expiredWaitlist.push(entry);
      return [{ ...entry, status: "cancelled" as const, cancelledAt: new Date(now).toISOString(), cancellationReason: "start-time" as const }];
    }
    return [entry];
  });
  const auditLog = expiredWaitlist.length || legacyPromotions.length ? [
    ...legacyPromotions.map(({ entry, booking }, index) => ({ id: `audit-waitlist-reconciled-${now}-${index}`, action: "waitlist-promoted" as const, subjectName: entry.customerName, details: `${booking.chaletName ?? entry.chaletName ?? ""} · أُزيل طلب انتظار مكرر بعد تحويله إلى الحجز ${formatBookingReference(booking.bookingReference)} · نفّذ التحويل: ${booking.createdByName ?? "غير متاح (سجل سابق)"}`, createdAt: new Date(now).toISOString() })),
    ...expiredWaitlist.map((entry, index) => ({ id: `audit-waitlist-expired-${now}-${index}`, action: "waitlist-cancelled" as const, subjectName: entry.customerName, details: `${entry.chaletName ?? ""} · أُلغي تلقائيًا عند وقت بداية الحجز`, createdAt: new Date(now).toISOString() })),
    ...data.auditLog,
  ] : data.auditLog;
  return changed ? { ...data, bookings, waitlist, auditLog } : data;
}
export function findConflicts(candidate: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType" | "shiftId"> & { chaletId?: string; chaletName?: string }, bookings: Booking[], ignoreId?: string) { const range = getBookingRange(candidate); const chalet = candidate.chaletId ?? candidate.chaletName?.trim() ?? ""; return bookings.filter((booking) => { if (booking.id === ignoreId || booking.status === "cancelled" || booking.status === "completed" || booking.status === "waitlisted") return false; const otherChalet = booking.chaletId ?? booking.chaletName?.trim() ?? ""; if (chalet !== otherChalet) return false; const other = getBookingRange(booking); return range.start < other.end && other.start < range.end; }); }
export function bookingCoversDate(booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType">, date: string) { const range = getBookingRange(booking); const day = dayNumber(date); const first = Math.floor(range.start / 1440); const last = Math.floor((range.end - 1) / 1440); return day >= first && day <= last; }
/** Returns the bookable morning/evening shifts for one chalet on a given date. */
export function availableChaletSlotsForDate(chaletId: string, date: string, bookings: Booking[]): PricedBookingType[] {
  const dayBookings = bookings.filter((booking) => booking.chaletId === chaletId && booking.status !== "cancelled" && booking.status !== "completed" && booking.status !== "waitlisted" && bookingCoversDate(booking, date));
  if (dayBookings.some((booking) => booking.bookingType === "24h" || booking.bookingType === "multi-day")) return [];
  const occupied = new Set(dayBookings.map((booking) => booking.bookingType));
  return (["morning", "evening"] as PricedBookingType[]).filter((slot) => !occupied.has(slot));
}
/** Returns one quick-book vacancy only when exactly one half-day shift remains free. */
export function singleAvailableChaletSlotForDate(chaletId: string, date: string, bookings: Booking[]): "morning" | "evening" | undefined {
  const available = availableChaletSlotsForDate(chaletId, date, bookings);
  return available.length === 1 && (available[0] === "morning" || available[0] === "evening") ? available[0] : undefined;
}
/** Returns a quick-book sibling only for an existing morning or evening reservation. */
export function availableSiblingSlotForBooking(booking: Booking, bookings: Booking[]): "morning" | "evening" | undefined {
  if (!booking.chaletId || (booking.bookingType !== "morning" && booking.bookingType !== "evening")) return undefined;
  return singleAvailableChaletSlotForDate(booking.chaletId, booking.startDate, bookings);
}
export type AvailableChaletSlot = { chaletId: string; date: string; period: "morning" | "evening" };
/** Lists only half-day vacancies created by an occupied sibling shift on the supplied dates. */
export function singleAvailableChaletSlotsForDates(dates: string[], bookings: Booking[]): AvailableChaletSlot[] {
  const uniqueDates = [...new Set(dates)];
  const chaletIds = [...new Set(bookings.map((booking) => booking.chaletId).filter((id): id is string => Boolean(id)))];
  return uniqueDates.flatMap((date) => chaletIds.flatMap((chaletId) => {
    const period = singleAvailableChaletSlotForDate(chaletId, date, bookings);
    return period ? [{ chaletId, date, period }] : [];
  }));
}
export function hasConflict(candidate: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType" | "shiftId"> & { chaletId?: string; chaletName?: string }, bookings: Booking[], ignoreId?: string) { return findConflicts(candidate, bookings, ignoreId).length > 0; }
/** Returns the latest checkout on or before the selected date that avoids all chalet conflicts. */
export function suggestNearestAvailableCheckout(candidate: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime" | "bookingType"> & { chaletId?: string; chaletName?: string }, bookings: Booking[], ignoreId?: string, maxSearchDays = 90) {
  for (let offset = 1; offset <= maxSearchDays; offset += 1) {
    const endDate = addDays(candidate.endDate, -offset);
    if (endDate < candidate.startDate) return null;
    const suggestion = { ...candidate, endDate };
    if (!isInvalidTimeOrder(suggestion) && !hasConflict(suggestion, bookings, ignoreId)) return endDate;
  }
  return null;
}
/** @deprecated Legacy day-only callers are routed through findConflicts; new code must provide chalet and times. */
export function hasDayConflict(candidate: Pick<Booking, "startDate" | "endDate">, bookings: Booking[], ignoreId?: string) {
  return findConflicts({ ...candidate, endDate: addDays(candidate.endDate, 1), startTime: "00:00", endTime: "00:00", bookingType: "multi-day" }, bookings, ignoreId).length > 0;
}
/** Rental price after discounts. It never includes the refundable security deposit. */
export function rentalTotal(booking: Pick<Booking, "price">) { return Math.max(0, Number(booking.price || 0)); }
/** Separate, refundable security amount held for the stay. It is not part of rental balance or revenue. */
export function refundableDepositAmount(booking: Pick<Booking, "depositAmount">) { return Math.max(0, Number(booking.depositAmount || 0)); }
export function totalDepositRefunded(booking: Pick<Booking, "depositRefunds">) { return (booking.depositRefunds ?? []).reduce((sum, refund) => sum + Math.max(0, Number(refund.amount || 0)), 0); }
export function remainingRefundableDeposit(booking: Pick<Booking, "depositAmount" | "depositRefunds">) { return Math.max(0, refundableDepositAmount(booking) - totalDepositRefunded(booking)); }
export type DepositFinancialStatus = "none" | "held" | "fully-refunded";
export function depositFinancialStatus(booking: Pick<Booking, "depositAmount" | "depositRefunds">): DepositFinancialStatus {
  const recorded = refundableDepositAmount(booking);
  if (recorded <= 0) return "none";
  return remainingRefundableDeposit(booking) <= 0 && totalDepositRefunded(booking) > 0 ? "fully-refunded" : "held";
}
export type BookingOccupancyStatus = "upcoming" | "in-house" | "ended";
export function bookingOccupancyStatus(booking: Booking, now = Date.now()): BookingOccupancyStatus {
  const range = getBookingTimestampRange(booking);
  if (now < range.start) return "upcoming";
  return now < range.end ? "in-house" : "ended";
}
export function totalPaid(booking: Pick<Booking, "payments">) { return booking.payments.reduce((sum, payment) => sum + (payment.voidedAt ? 0 : Math.max(0, Number(payment.amount || 0))), 0); }
/** Amount still due from the rental only, after discounts and registered rental payments. */
export function rentalBalance(booking: Pick<Booking, "price" | "payments">) { return Math.max(0, rentalTotal(booking) - totalPaid(booking)); }
/** @deprecated Use rentalBalance to make the rental-only meaning explicit. */
export function remainingAmount(booking: Pick<Booking, "price" | "payments">) { return rentalBalance(booking); }
export type ChaletPerformanceSummary = { bookingCount: number; occupiedDays: number; rentalRevenue: number; paidRevenue: number; outstandingBalance: number };
/** Counts every booking state so the destructive chalet action never hides historical links. */
export function chaletLinkedBookingCount(chaletId: string, bookings: Booking[]) { return bookings.filter((booking) => booking.chaletId === chaletId).length; }
/** Aggregates only non-cancelled reservations; deposits are intentionally excluded from rental revenue. */
export function chaletPerformanceSummary(chaletId: string, bookings: Booking[]): ChaletPerformanceSummary {
  const chaletBookings = bookings.filter((booking) => booking.chaletId === chaletId && booking.status !== "cancelled" && booking.status !== "waitlisted");
  return chaletBookings.reduce<ChaletPerformanceSummary>((summary, booking) => ({
    bookingCount: summary.bookingCount + 1,
    occupiedDays: summary.occupiedDays + daysCount(booking.startDate, booking.endDate),
    rentalRevenue: summary.rentalRevenue + rentalTotal(booking),
    paidRevenue: summary.paidRevenue + totalPaid(booking),
    outstandingBalance: summary.outstandingBalance + rentalBalance(booking),
  }), { bookingCount: 0, occupiedDays: 0, rentalRevenue: 0, paidRevenue: 0, outstandingBalance: 0 });
}
/** Matches the operational search fields shown in the reservations list. */
export function bookingMatchesSearch(booking: Pick<Booking, "customerName" | "phone" | "bookingReference">, chaletName: string, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;
  return `${booking.customerName} ${booking.phone} ${chaletName} ${booking.bookingReference ?? ""}`.toLocaleLowerCase().includes(normalizedQuery);
}
/** Applies the status chips without changing or reordering any stored reservations. */
export function matchesBookingListFilter(booking: Pick<Booking, "status" | "startDate" | "endDate" | "startTime" | "endTime" | "bookingType" | "price" | "payments">, filter: BookingListFilter, today = todayISO()) {
  if (filter === "all") return true;
  if (filter === "balance") return (booking.status === "confirmed" || booking.status === "awaiting-deposit") && rentalBalance(booking) > 0;
  if (filter === "today") return (booking.status === "confirmed" || booking.status === "awaiting-deposit") && bookingCoversDate(booking, today);
  if (filter === "completed") return booking.status === "completed";
  if (filter === "cancelled") return booking.status === "cancelled";
  return (booking.status === "confirmed" || booking.status === "awaiting-deposit") && booking.startDate > today;
}
export function paymentStatus(booking: Pick<Booking, "price" | "payments">): PaymentStatus { const paid = totalPaid(booking); const total = rentalTotal(booking); if (paid <= 0) return "unpaid"; if (paid >= total) return "paid"; if (paid < total * 0.5) return "deposit"; return "partial"; }
export function paymentStatusLabel(status: PaymentStatus, language: AppLanguage = "ar") { return ({ ar: { unpaid: "غير مدفوع", deposit: "عربون", partial: "مدفوع جزئيًا", paid: "مدفوع بالكامل" }, en: { unpaid: "Unpaid", deposit: "Deposit", partial: "Partially paid", paid: "Paid in full" } }[language][status]); }
export function paymentMethodLabel(method: PaymentMethod | undefined, language: AppLanguage = "ar", configuredMethods?: PaymentMethodOption[]) {
  if (!method) return language === "ar" ? "غير محددة" : "Not specified";
  const configured = configuredMethods && normalizePaymentMethodOptions(configuredMethods).find((option) => option.id === method);
  if (configured) return configured.label;
  const defaults: Record<string, { ar: string; en: string }> = { "cash-guardian": { ar: "كاش بيد الحارس", en: "Cash with guardian" }, "cash-owner": { ar: "كاش بيد المالك", en: "Cash with owner" }, "bank-transfer": { ar: "تحويل بنكي", en: "Bank transfer" }, click: { ar: "تحويل CliQ", en: "CliQ transfer" }, card: { ar: "بطاقة / دفع إلكتروني", en: "Card / electronic payment" }, other: { ar: "أخرى", en: "Other" }, wallet: { ar: "محفظة", en: "Wallet" } };
  return defaults[method]?.[language] ?? method;
}
export function formatMoney(value: number, currency = "د.أ") { return `${Number(value || 0).toFixed(2)} ${currency}`; }
export function formatTime12(time: string, language: AppLanguage = "ar", format: "12h" | "24h" = "12h") { const [h, m] = time.split(":").map(Number); if (format === "24h") return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; const suffix = language === "ar" ? (h < 12 ? "ص" : "م") : (h < 12 ? "AM" : "PM"); const hour = h % 12 || 12; return `${hour}:${String(m).padStart(2, "0")} ${suffix}`; }
export function localDateISO(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function dateObjectUTC(date: string) { const { y, m, d } = parseISODate(date); return new Date(Date.UTC(y, m - 1, d, 12)); }
export function formatBookingDate(date: string, format: DateFormat = "arabic-gregorian") {
  const value = dateObjectUTC(date);
  const { y, m, d } = parseISODate(date);
  if (format === "DD/MM/YYYY") return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  if (format === "YYYY-MM-DD") return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (format === "english-month") return new Intl.DateTimeFormat("en-GB-u-ca-gregory", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(value);
  return new Intl.DateTimeFormat("ar-JO-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(value);
}
export function formatCalendarMonth(year: number, month: number, format: DateFormat = "arabic-gregorian") {
  const date = new Date(Date.UTC(year, month - 1, 1, 12));
  if (format === "DD/MM/YYYY") return `${String(month).padStart(2, "0")}/${year}`;
  if (format === "YYYY-MM-DD") return `${year}-${String(month).padStart(2, "0")}`;
  if (format === "english-month") return new Intl.DateTimeFormat("en-GB-u-ca-gregory", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  return new Intl.DateTimeFormat("ar-JO-u-ca-gregory-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
export function hijriDateLabel(date: string, language: AppLanguage = "ar") { return new Intl.DateTimeFormat(language === "ar" ? "ar-JO-u-ca-islamic-nu-latn" : "en-GB-u-ca-islamic", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(dateObjectUTC(date)); }
export function hijriMonthLabel(year: number, month: number, language: AppLanguage = "ar") { return new Intl.DateTimeFormat(language === "ar" ? "ar-JO-u-ca-islamic-nu-latn" : "en-GB-u-ca-islamic", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1, 12))); }
export function dateLabel(date: string, language: AppLanguage = "ar") { return new Intl.DateTimeFormat(language === "ar" ? "ar-JO-u-ca-gregory" : "en-US-u-ca-gregory", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(dateObjectUTC(date)); }
export function weekdayLabel(date: string, language: AppLanguage = "ar") { return new Intl.DateTimeFormat(language === "ar" ? "ar-JO" : "en-US", { weekday: "long", timeZone: "UTC" }).format(dateObjectUTC(date)); }
export function todayISO() { return localDateISO(); }
export function daysCount(startDate: string, endDate: string) { return Math.max(1, dayNumber(endDate) - dayNumber(startDate) + 1); }

export function classifyBookingType(booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime">, settings: Settings = DEFAULT_SETTINGS): BookingType {
  const dayDiff = dayNumber(booking.endDate || booking.startDate) - dayNumber(booking.startDate);
  const start = minutesOf(booking.startTime);
  const end = minutesOf(booking.endTime);
  const range = getBookingRange({ ...booking, bookingType: "custom" });
  const duration = range.end - range.start;
  const evening = settings.bookingTypes.evening;
  const morning = settings.bookingTypes.morning;
  const eveningStart = minutesOf(evening.startTime);
  const eveningEnd = minutesOf(evening.endTime);
  const isEveningWindow = start >= eveningStart && end <= eveningEnd && (dayDiff === 1 || start >= end);
  if (isEveningWindow) return "evening";
  if (duration >= 23 * 60 && duration <= 25 * 60 && dayDiff >= 1) return "24h";
  if (dayDiff > 0) return "multi-day";
  if (dayDiff === 0 && start >= minutesOf(morning.startTime) && end <= minutesOf(morning.endTime) && end > start) return "morning";
  return "custom";
}

export function durationLabel(booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime">, settings: Settings = DEFAULT_SETTINGS, language: AppLanguage = "ar") {
  const type = classifyBookingType(booking, settings);
  if (type === "24h") return language === "ar" ? "24 ساعة · يوم واحد" : "24 hours · 1 day";
  if (type === "evening") return language === "ar" ? "ليلة واحدة · يوم واحد" : "One night · 1 day";
  const days = daysCount(booking.startDate, booking.endDate);
  return language === "ar" ? `${days} ${days === 1 ? "يوم" : "أيام"}` : `${days} ${days === 1 ? "day" : "days"}`;
}

export function getRentalBreakdown(basePrice: number, booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime">, settings: Settings = DEFAULT_SETTINGS) {
  const type = classifyBookingType(booking, settings);
  const quantity = type === "multi-day" ? daysCount(booking.startDate, booking.endDate) : 1;
  const weekendDays = settings.weekendDays ?? [5, 6];
  const weekendRate = Number(settings.weekendPrice || 0);
  let weekdayCount = 0;
  let weekendCount = 0;
  for (let index = 0; index < quantity; index += 1) {
    const date = addDays(booking.startDate, index);
    const weekday = dateObjectUTC(date).getUTCDay();
    if (weekendRate > 0 && weekendDays.includes(weekday)) weekendCount += 1;
    else weekdayCount += 1;
  }
  const base = Math.max(0, Number(basePrice || 0));
  const gross = (weekdayCount * base) + (weekendCount * (weekendRate > 0 ? weekendRate : base));
  return { type, quantity, weekdayCount, weekendCount, basePrice: base, weekendPrice: weekendRate > 0 ? weekendRate : base, gross };
}

export function calculateRentalTotal(basePrice: number, booking: Pick<Booking, "startDate" | "endDate" | "startTime" | "endTime">, settings: Settings = DEFAULT_SETTINGS, discountAmount = 0) {
  const breakdown = getRentalBreakdown(basePrice, booking, settings);
  return Math.max(0, breakdown.gross - Math.max(0, Number(discountAmount || 0)));
}

export function configuredPeriodType(type: BookingType): PricedBookingType {
  return type === "multi-day" ? "morning" : type === "custom" ? "morning" : type;
}

export function isWeekendDate(date: string, settings: Settings = DEFAULT_SETTINGS, chalet?: Chalet) {
  const weekendDays = normalizeWeekendDays(chalet?.weekendDays) ?? settings.weekendDays ?? DEFAULT_SETTINGS.weekendDays ?? [];
  return weekendDays.includes(dateObjectUTC(date).getUTCDay());
}

export function configuredRateForDate(type: BookingType, date: string, settings: Settings = DEFAULT_SETTINGS, chalet?: Chalet, specialPriceRules: SpecialPriceRule[] = [], shiftId?: string) {
  const specialRule = specialPriceRules.filter((rule) => rule.startDate <= date && rule.endDate >= date).sort((left, right) => Number(right.kind === "occasion") - Number(left.kind === "occasion"))[0];
  if (specialRule) return Math.max(0, Number(specialRule.price));
  if (shiftId) {
    const shift = getChaletShift(chalet, shiftId, type, settings);
    if (shift) return Math.max(0, Number(isWeekendDate(date, settings, chalet) ? shift.weekendPrice : shift.weekdayPrice));
  }
  const period = configuredPeriodType(type);
  const rate = chalet?.periodPricing?.[period] ?? settings.periodPricing?.[period] ?? DEFAULT_PERIOD_PRICING[period];
  return Math.max(0, Number(isWeekendDate(date, settings, chalet) ? rate.weekendPrice : rate.weekdayPrice));
}

export function configuredBookingPrice(booking: Pick<Booking, "bookingType" | "startDate" | "endDate" | "shiftId">, settings: Settings = DEFAULT_SETTINGS, chalet?: Chalet, specialPriceRules: SpecialPriceRule[] = []) {
  const quantity = booking.bookingType === "multi-day" ? daysCount(booking.startDate, booking.endDate) : 1;
  return Array.from({ length: quantity }, (_, index) => configuredRateForDate(booking.bookingType, addDays(booking.startDate, index), settings, chalet, specialPriceRules, booking.shiftId)).reduce((sum, price) => sum + price, 0);
}

export function resolvedBookingPrice(automaticPrice: number, enteredPrice: string | number, isManualOverride: boolean) {
  return isManualOverride ? Math.max(0, Number(enteredPrice || 0)) : Math.max(0, Number(automaticPrice || 0));
}
