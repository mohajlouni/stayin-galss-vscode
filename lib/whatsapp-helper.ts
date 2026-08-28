import { Booking, Chalet, DEFAULT_WHATSAPP_MESSAGE_OPTIONS, Settings, bookingTypeLabel, formatBookingDate, formatMoney, formatTime12, refundableDepositAmount, remainingAmount, totalPaid } from "./booking-model";
import { buildWhatsAppLinks, formatJordanianWhatsAppPhone, openJordanianWhatsApp } from "./whatsapp";

export type WhatsAppLanguage = "ar" | "en";
export type BookingMessageTemplate = "confirmation" | "arrival" | "checkout";
export const WHATSAPP_SEND_ITEMS = ["receipt", "confirmation", "arrival", "checkout", "contract", "terms"] as const;
export type WhatsAppSendItem = (typeof WHATSAPP_SEND_ITEMS)[number];

export function whatsappSendItemLabel(item: WhatsAppSendItem, language: WhatsAppLanguage) {
  const ar = language === "ar";
  if (item === "receipt") return ar ? "إيصال الحجز" : "Booking receipt";
  if (item === "confirmation") return ar ? "تأكيد الحجز" : "Booking confirmation";
  if (item === "arrival") return ar ? "تعليمات الوصول" : "Arrival instructions";
  if (item === "checkout") return ar ? "تذكير المغادرة" : "Checkout reminder";
  if (item === "contract") return ar ? "ملخص عقد الإقامة" : "Stay contract summary";
  return ar ? "شروط الإقامة" : "Stay terms";
}

export function bookingMessageTemplateLabel(template: BookingMessageTemplate, language: WhatsAppLanguage) {
  const ar = language === "ar";
  if (template === "arrival") return ar ? "تعليمات الوصول" : "Arrival instructions";
  if (template === "checkout") return ar ? "تذكير المغادرة" : "Checkout reminder";
  return ar ? "تأكيد الحجز" : "Booking confirmation";
}

/** Compatibility export for existing booking and template callers. */
export const formatWhatsAppPhone = formatJordanianWhatsAppPhone;

export function generateBookingWhatsAppMessage(booking: Booking, settings: Settings, language: WhatsAppLanguage = "ar", chalet?: Chalet) {
  const options = { ...DEFAULT_WHATSAPP_MESSAGE_OPTIONS, ...(settings.whatsAppOptions ?? {}) };
  const ar = language === "ar";
  const lines: string[] = [ar ? `مرحبًا ${booking.customerName}،` : `Hello ${booking.customerName},`];

  if (options.includeGuestAndChalet) {
    lines.push(ar ? `تفاصيل حجزك في ${booking.chaletName || "الشاليه"}` : `Your booking details for ${booking.chaletName || "the chalet"}`);
  }
  if (options.includeSchedule) {
    lines.push("", ar ? "فترة الإقامة" : "Stay period");
    lines.push(`${ar ? "النوع" : "Type"}: ${bookingTypeLabel(booking.bookingType, settings, language)}`);
    lines.push(`${ar ? "الدخول" : "Check-in"}: ${formatBookingDate(booking.startDate, settings.device?.dateFormat)} · ${formatTime12(booking.startTime, language, settings.device?.timeFormat)}`);
    lines.push(`${ar ? "الخروج" : "Check-out"}: ${formatBookingDate(booking.endDate, settings.device?.dateFormat)} · ${formatTime12(booking.endTime, language, settings.device?.timeFormat)}`);
  }
  if (options.includeFinancials) {
    const outstanding = remainingAmount(booking);
    lines.push("", ar ? "الملخص المالي" : "Financial summary");
    lines.push(`${ar ? "إجمالي الإيجار" : "Total rental"}: ${formatMoney(booking.price, settings.currency)}`);
    lines.push(`${ar ? "إجمالي المدفوع" : "Total paid"}: ${formatMoney(totalPaid(booking), settings.currency)}`);
    if (outstanding > 0) lines.push(`${ar ? "المتبقي" : "Remaining balance"}: ${formatMoney(outstanding, settings.currency)}`);
    else lines.push(ar ? "حالة الإيجار: مكتمل السداد" : "Rental status: paid in full");
    const deposit = refundableDepositAmount(booking);
    if (deposit > 0) lines.push(`${ar ? "التأمين القابل للاسترداد" : "Refundable security deposit"}: ${formatMoney(deposit, settings.currency)}`);
  }
  if (options.includeLocation && chalet?.locationUrl?.trim()) {
    lines.push("", `${ar ? "الموقع" : "Location"}: ${chalet.locationUrl.trim()}`);
  }
  if (options.includeContacts && (settings.ownerPhone?.trim() || chalet?.guardianPhone?.trim())) {
    lines.push("", ar ? "جهات التواصل" : "Contacts");
    if (settings.ownerPhone?.trim()) lines.push(`${ar ? "الإدارة" : "Management"}: ${settings.ownerPhone.trim()}`);
    if (chalet?.guardianPhone?.trim()) lines.push(`${ar ? "الحارس" : "Guard"}: ${chalet.guardianPhone.trim()}`);
  }
  if (settings.enableDisclaimer && settings.disclaimerText?.trim()) {
    lines.push("", ar ? "تنبيه" : "Notice", settings.disclaimerText.trim());
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function generateBookingWhatsAppUrl(booking: Booking, settings: Settings, language: WhatsAppLanguage = "ar", chalet?: Chalet) {
  const phone = formatWhatsAppPhone(booking.phone);
  if (!phone) throw new Error("invalid-whatsapp-phone");
  return buildWhatsAppLinks(phone, generateBookingWhatsAppMessage(booking, settings, language, chalet)).fallbackUrl;
}

function interpolateBookingTemplate(template: string, booking: Booking, settings: Settings, language: WhatsAppLanguage, chalet?: Chalet) {
  const ar = language === "ar";
  const date = (value: string) => formatBookingDate(value, settings.device?.dateFormat);
  const time = (value: string) => formatTime12(value, language, settings.device?.timeFormat);
  const values: Record<string, string> = {
    "{العميل}": booking.customerName,
    "{الشاليه}": booking.chaletName || (ar ? "الشاليه" : "the chalet"),
    "{الفترة}": bookingTypeLabel(booking.bookingType, settings, language),
    "{الوصول}": `${date(booking.startDate)} · ${time(booking.startTime)}`,
    "{المغادرة}": `${date(booking.endDate)} · ${time(booking.endTime)}`,
    "{الإجمالي}": formatMoney(booking.price, settings.currency),
    "{المرجع}": booking.bookingReference || "—",
    "{الموقع}": chalet?.locationUrl?.trim() || (ar ? "يُرسل من إدارة الشاليه" : "Shared by property management"),
    "{الحارس}": chalet?.guardianPhone?.trim() || (ar ? "يُرسل عند الحاجة" : "Shared when needed"),
    "{التأمين}": formatMoney(refundableDepositAmount(booking), settings.currency),
    "{المدفوع}": formatMoney(totalPaid(booking), settings.currency),
    "{المتبقي}": formatMoney(remainingAmount(booking), settings.currency),
  };
  return template.replace(/\{العميل\}|\{الشاليه\}|\{الفترة\}|\{الوصول\}|\{المغادرة\}|\{الإجمالي\}|\{المرجع\}|\{الموقع\}|\{الحارس\}|\{التأمين\}|\{المدفوع\}|\{المتبقي\}/g, (token) => values[token]);
}

export function generateBookingTemplateMessage(template: BookingMessageTemplate, booking: Booking, settings: Settings, language: WhatsAppLanguage = "ar", chalet?: Chalet, customConfirmationTemplate?: string) {
  const ar = language === "ar";
  const date = (value: string) => formatBookingDate(value, settings.device?.dateFormat);
  const time = (value: string) => formatTime12(value, language, settings.device?.timeFormat);
  const lines = [ar ? `مرحبًا ${booking.customerName}،` : `Hello ${booking.customerName},`];
  if (template === "confirmation" && customConfirmationTemplate?.trim()) {
    lines.splice(0, lines.length, interpolateBookingTemplate(customConfirmationTemplate.trim(), booking, settings, language, chalet));
  } else if (template === "confirmation") {
    lines.push(ar ? `تم تأكيد حجزكم في ${booking.chaletName || "الشاليه"}.` : `Your booking at ${booking.chaletName || "the chalet"} is confirmed.`);
    lines.push(`${ar ? "الوصول" : "Check-in"}: ${date(booking.startDate)} · ${time(booking.startTime)}`);
    lines.push(`${ar ? "المغادرة" : "Check-out"}: ${date(booking.endDate)} · ${time(booking.endTime)}`);
  } else if (template === "arrival") {
    lines.push(ar ? `نرحب بكم في ${booking.chaletName || "الشاليه"}.` : `Welcome to ${booking.chaletName || "the chalet"}.`);
    lines.push(`${ar ? "موعد الوصول" : "Arrival time"}: ${date(booking.startDate)} · ${time(booking.startTime)}`);
    if (chalet?.locationUrl?.trim()) lines.push(`${ar ? "الموقع" : "Location"}: ${chalet.locationUrl.trim()}`);
    if (chalet?.guardianPhone?.trim()) lines.push(`${ar ? "الحارس" : "Guard"}: ${chalet.guardianPhone.trim()}`);
  } else {
    lines.push(ar ? `نذكركم بأن موعد المغادرة من ${booking.chaletName || "الشاليه"} هو:` : `A reminder that checkout from ${booking.chaletName || "the chalet"} is:`);
    lines.push(`${date(booking.endDate)} · ${time(booking.endTime)}`);
    lines.push(ar ? "يرجى تسليم الشاليه بالحالة المتفق عليها، وشكرًا لاختياركم لنا." : "Please return the chalet in the agreed condition. Thank you for choosing us.");
  }
  if (settings.enableDisclaimer && settings.disclaimerText?.trim()) lines.push("", settings.disclaimerText.trim());
  return lines.join("\n").trim();
}

function messageSection(title: string, lines: string[]) {
  return [`*${title}*`, ...lines.filter(Boolean)].join("\n");
}

function defaultContractTerms(customTerms: string | undefined, language: WhatsAppLanguage) {
  const terms = (customTerms ?? "").split("\n").map((term) => term.trim()).filter(Boolean);
  if (terms.length) return terms;
  return language === "ar"
    ? ["يلتزم الضيف باستخدام الشاليه ومرافقه بعناية والمحافظة على محتوياته.", "يتم توثيق أي تلف مثبت قبل خصمه من مبلغ التأمين وفق سياسة المنشأة.", "يلتزم الضيف بموعد المغادرة المتفق عليه وتسليم الشاليه بالحالة المناسبة."]
    : ["The guest must use the chalet and its facilities with care.", "Any documented damage may be deducted from the security deposit under the property policy.", "The guest must observe the agreed checkout time and return the chalet in suitable condition."];
}

/** Builds one WhatsApp message from only the communication sections selected by the user. */
export function generateSelectedBookingWhatsAppMessage({
  selectedItems,
  booking,
  settings,
  language = "ar",
  chalet,
  customReceiptTemplate,
  customConfirmationTemplate,
  customArrivalTemplate,
  customCheckoutTemplate,
  customContractSummaryTemplate,
  customContractTerms,
}: {
  selectedItems: readonly WhatsAppSendItem[];
  booking: Booking;
  settings: Settings;
  language?: WhatsAppLanguage;
  chalet?: Chalet;
  customReceiptTemplate?: string;
  customConfirmationTemplate?: string;
  customArrivalTemplate?: string;
  customCheckoutTemplate?: string;
  customContractSummaryTemplate?: string;
  customContractTerms?: string;
}) {
  const selected = new Set(selectedItems);
  if (!selected.size) throw new Error("no-whatsapp-content-selected");
  const ar = language === "ar";
  const date = (value: string) => formatBookingDate(value, settings.device?.dateFormat);
  const time = (value: string) => formatTime12(value, language, settings.device?.timeFormat);
  const checkIn = `${date(booking.startDate)} · ${time(booking.startTime)}`;
  const checkOut = `${date(booking.endDate)} · ${time(booking.endTime)}`;
  const sections: string[] = [ar ? `مرحبًا ${booking.customerName}،` : `Hello ${booking.customerName},`];

  if (selected.has("receipt")) sections.push(messageSection(whatsappSendItemLabel("receipt", language), customReceiptTemplate?.trim() ? [interpolateBookingTemplate(customReceiptTemplate.trim(), booking, settings, language, chalet)] : [
    `${ar ? "الشاليه" : "Chalet"}: ${booking.chaletName || (ar ? "الشاليه" : "the chalet")}`,
    `${ar ? "المرجع" : "Reference"}: ${booking.bookingReference || "—"}`,
    `${ar ? "الفترة" : "Stay"}: ${bookingTypeLabel(booking.bookingType, settings, language)}`,
    `${ar ? "الوصول" : "Check-in"}: ${checkIn}`,
    `${ar ? "المغادرة" : "Check-out"}: ${checkOut}`,
    `${ar ? "إجمالي الإيجار" : "Rental total"}: ${formatMoney(booking.price, settings.currency)}`,
    `${ar ? "المدفوع" : "Paid"}: ${formatMoney(totalPaid(booking), settings.currency)}`,
    `${ar ? "المتبقي" : "Remaining"}: ${formatMoney(remainingAmount(booking), settings.currency)}`,
  ]));
  if (selected.has("confirmation")) sections.push(messageSection(whatsappSendItemLabel("confirmation", language), [generateBookingTemplateMessage("confirmation", booking, { ...settings, enableDisclaimer: false }, language, chalet, customConfirmationTemplate)]));
  if (selected.has("arrival")) sections.push(messageSection(whatsappSendItemLabel("arrival", language), customArrivalTemplate?.trim() ? [interpolateBookingTemplate(customArrivalTemplate.trim(), booking, settings, language, chalet)] : [
    ar ? `نرحب بكم في ${booking.chaletName || "الشاليه"}.` : `Welcome to ${booking.chaletName || "the chalet"}.`,
    `${ar ? "موعد الوصول" : "Arrival time"}: ${checkIn}`,
    chalet?.locationUrl?.trim() ? `${ar ? "الموقع" : "Location"}: ${chalet.locationUrl.trim()}` : "",
    chalet?.guardianPhone?.trim() ? `${ar ? "الحارس" : "Guard"}: ${chalet.guardianPhone.trim()}` : "",
  ]));
  if (selected.has("checkout")) sections.push(messageSection(whatsappSendItemLabel("checkout", language), customCheckoutTemplate?.trim() ? [interpolateBookingTemplate(customCheckoutTemplate.trim(), booking, settings, language, chalet)] : [
    ar ? `نذكركم بأن موعد المغادرة من ${booking.chaletName || "الشاليه"}: ${checkOut}` : `A reminder that checkout from ${booking.chaletName || "the chalet"} is: ${checkOut}`,
    ar ? "يرجى تسليم الشاليه بالحالة المتفق عليها، وشكرًا لاختياركم لنا." : "Please return the chalet in the agreed condition. Thank you for choosing us.",
  ]));
  if (selected.has("contract")) sections.push(messageSection(whatsappSendItemLabel("contract", language), customContractSummaryTemplate?.trim() ? [interpolateBookingTemplate(customContractSummaryTemplate.trim(), booking, settings, language, chalet)] : [
    `${ar ? "العميل" : "Guest"}: ${booking.customerName}`,
    `${ar ? "الشاليه" : "Chalet"}: ${booking.chaletName || (ar ? "الشاليه" : "the chalet")}`,
    `${ar ? "مرجع الحجز" : "Booking reference"}: ${booking.bookingReference || "—"}`,
    `${ar ? "الوصول" : "Check-in"}: ${checkIn}`,
    `${ar ? "المغادرة" : "Check-out"}: ${checkOut}`,
    `${ar ? "التأمين قيد الحيازة" : "Deposit held"}: ${formatMoney(refundableDepositAmount(booking), settings.currency)}`,
  ]));
  if (selected.has("terms")) sections.push(messageSection(whatsappSendItemLabel("terms", language), defaultContractTerms(customContractTerms, language).map((term, index) => `${index + 1}. ${term}`)));
  if (settings.enableDisclaimer && settings.disclaimerText?.trim()) sections.push(messageSection(ar ? "تنبيه" : "Notice", [settings.disclaimerText.trim()]));
  return sections.join("\n\n").trim();
}

export async function openBookingTemplateWhatsApp(template: BookingMessageTemplate, booking: Booking, settings: Settings, language: WhatsAppLanguage = "ar", chalet?: Chalet, customConfirmationTemplate?: string) {
  if (!settings.whatsAppEnabled) throw new Error("whatsapp-disabled");
  const result = await openJordanianWhatsApp({ phone: booking.phone, message: generateBookingTemplateMessage(template, booking, settings, language, chalet, customConfirmationTemplate) });
  return result.openedUrl;
}

export async function openSelectedBookingWhatsApp(options: Parameters<typeof generateSelectedBookingWhatsAppMessage>[0]) {
  if (!options.settings.whatsAppEnabled) throw new Error("whatsapp-disabled");
  const result = await openJordanianWhatsApp({ phone: options.booking.phone, message: generateSelectedBookingWhatsAppMessage(options) });
  return result.openedUrl;
}

/** Opens the official wa.me destination with an already encoded, localized booking message. */
export async function openBookingWhatsApp(booking: Booking, settings: Settings, language: WhatsAppLanguage = "ar", chalet?: Chalet) {
  if (!settings.whatsAppEnabled) throw new Error("whatsapp-disabled");
  const result = await openJordanianWhatsApp({ phone: booking.phone, message: generateBookingWhatsAppMessage(booking, settings, language, chalet) });
  return result.openedUrl;
}
