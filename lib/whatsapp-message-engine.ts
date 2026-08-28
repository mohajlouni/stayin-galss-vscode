import { Booking, Chalet, DEFAULT_DEVICE_SETTINGS, Settings, bookingTypeLabel, formatBookingDate, formatBookingReference, formatMoney, formatTime12, refundableDepositAmount, remainingAmount, totalPaid } from "./booking-model";
import { openJordanianWhatsApp } from "./whatsapp";

export const WHATSAPP_MESSAGE_MODULES = ["arrival", "checkout", "contract"] as const;
export type WhatsAppMessageModule = (typeof WHATSAPP_MESSAGE_MODULES)[number];

export type WhatsAppLanguage = "ar" | "en";

export function whatsAppMessageModuleLabel(module: WhatsAppMessageModule, language: WhatsAppLanguage) {
  const ar = language === "ar";
  if (module === "arrival") return ar ? "تعليمات الوصول الإضافية" : "Additional arrival instructions";
  if (module === "checkout") return ar ? "تذكير المغادرة" : "Checkout reminder";
  return ar ? "إقرار الإقامة" : "Stay acknowledgement";
}

function defaultTerms(language: WhatsAppLanguage) {
  return language === "ar"
    ? ["يلتزم الضيف باستخدام الشاليه ومرافقه بعناية والمحافظة على محتوياته.", "يتم توثيق أي تلف مثبت قبل خصمه من مبلغ التأمين وفق سياسة المنشأة.", "يلتزم الضيف بموعد المغادرة المتفق عليه وتسليم الشاليه بالحالة المناسبة."]
    : ["The guest must use the chalet and its facilities with care.", "Any documented damage may be deducted from the security deposit under the property policy.", "The guest must observe the agreed checkout time and return the chalet in suitable condition."];
}

function interpolateTemplate(template: string, booking: Booking, settings: Settings, language: WhatsAppLanguage, chalet?: Chalet, stayTerms?: string) {
  const ar = language === "ar";
  const date = (value: string) => formatBookingDate(value, settings.device?.dateFormat);
  const time = (value: string) => formatTime12(value, language, settings.device?.timeFormat);
  const rawTerms = stayTerms?.trim() ? stayTerms.trim().split("\n").map((term) => term.trim()).filter(Boolean) : defaultTerms(language);
  const terms = rawTerms.map((term, index) => `${index + 1}. ${term}`).join("\n");
  const values: Record<string, string> = {
    "{العميل}": booking.customerName,
    "{الشاليه}": booking.chaletName || (ar ? "الشاليه" : "the chalet"),
    "{الفترة}": bookingTypeLabel(booking.bookingType, settings, language),
    "{الوصول}": `${date(booking.startDate)} · ${time(booking.startTime)}`,
    "{المغادرة}": `${date(booking.endDate)} · ${time(booking.endTime)}`,
    "{الإجمالي}": formatMoney(booking.price, settings.currency),
    "{المرجع}": formatBookingReference(booking.bookingReference),
    "{الموقع}": chalet?.locationUrl?.trim() || (ar ? "يُرسل من إدارة الشاليه" : "Shared by property management"),
    "{الحارس}": chalet?.guardianPhone?.trim() || (ar ? "يُرسل عند الحاجة" : "Shared when needed"),
    "{التأمين}": formatMoney(refundableDepositAmount(booking), settings.currency),
    "{المدفوع}": formatMoney(totalPaid(booking), settings.currency),
    "{المتبقي}": formatMoney(remainingAmount(booking), settings.currency),
    "{الشروط}": terms,
  };
  return template.replace(/\{العميل\}|\{الشاليه\}|\{الفترة\}|\{الوصول\}|\{المغادرة\}|\{الإجمالي\}|\{المرجع\}|\{الموقع\}|\{الحارس\}|\{التأمين\}|\{المدفوع\}|\{المتبقي\}|\{الشروط\}/g, (token) => values[token]);
}

export type ConsolidatedWhatsAppMessageOptions = {
  selectedModules?: readonly WhatsAppMessageModule[];
  booking: Booking;
  settings: Settings;
  language?: WhatsAppLanguage;
  chalet?: Chalet;
  baseHeaderTemplate?: string;
  arrivalBlockTemplate?: string;
  checkoutBlockTemplate?: string;
  contractBlockTemplate?: string;
  stayTerms?: string;
};

/** Builds one message: a mandatory booking header plus optional, non-redundant modules. */
export function generateConsolidatedWhatsAppMessage({ selectedModules = [], booking, settings, language = "ar", chalet, baseHeaderTemplate, arrivalBlockTemplate, checkoutBlockTemplate, contractBlockTemplate, stayTerms }: ConsolidatedWhatsAppMessageOptions) {
  const templates = {
    base: baseHeaderTemplate?.trim() || DEFAULT_DEVICE_SETTINGS.whatsAppBaseHeaderTemplate,
    arrival: arrivalBlockTemplate?.trim() || DEFAULT_DEVICE_SETTINGS.arrivalMessageBlockTemplate,
    checkout: checkoutBlockTemplate?.trim() || DEFAULT_DEVICE_SETTINGS.checkoutMessageBlockTemplate,
    contract: contractBlockTemplate?.trim() || DEFAULT_DEVICE_SETTINGS.contractMessageBlockTemplate,
  };
  const modules = [...new Set(selectedModules.filter((module): module is WhatsAppMessageModule => WHATSAPP_MESSAGE_MODULES.includes(module)))];
  const sections = [interpolateTemplate(templates.base, booking, settings, language, chalet, stayTerms)];
  modules.forEach((module) => sections.push(interpolateTemplate(templates[module], booking, settings, language, chalet, stayTerms)));
  if (settings.enableDisclaimer && settings.disclaimerText?.trim()) sections.push(settings.disclaimerText.trim());
  return sections.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function openConsolidatedWhatsApp(options: ConsolidatedWhatsAppMessageOptions) {
  if (!options.settings.whatsAppEnabled) throw new Error("whatsapp-disabled");
  const message = generateConsolidatedWhatsAppMessage(options);
  const result = await openJordanianWhatsApp({ phone: options.booking.phone, message });
  return result.openedUrl;
}
