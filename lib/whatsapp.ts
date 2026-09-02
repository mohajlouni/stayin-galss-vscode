import { parsePhoneNumber, type CountryCode, type PhoneNumber } from "libphonenumber-js";

function showAlert(title: string, message: string) {
  try {
    const { Alert } = require("react-native") as { Alert: { alert: (title: string, message?: string) => void } };
    Alert.alert(title, message);
  } catch {
    // Alert is unavailable in non-native (test) environments; silently skip.
  }
}

export const JORDANIAN_PHONE_WARNING = "يرجى إدخال رقم هاتف أردني صحيح مكون من 10 أرقام (079/078/077)";

export const DEFAULT_WHATSAPP_REGION = "JO" as const;

export type JordanianWhatsAppPhone = {
  value: string | null;
  error: string | null;
};

const ARABIC_DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };

function latinDigits(value: string) {
  return Array.from(value).map((character) => ARABIC_DIGITS[character] ?? character).join("");
}

function parseAs(literal: string, region: CountryCode): PhoneNumber | null {
  try {
    return parsePhoneNumber(literal, region);
  } catch {
    return null;
  }
}

/** Removes a leading "+" and strips any "00" international prefix for a clean E.164 digit sequence. */
function e164Digits(number: PhoneNumber): string {
  return number.number.startsWith("00") ? number.number.slice(2) : number.number.slice(1);
}

/** Enforces the Jordanian mobile prefix contract (077/078/079) against a parsed Jordanian number. */
function jordanianMobileE164(parsed: PhoneNumber): string | null {
  if (parsed.country !== "JO") return null;
  const national = parsed.nationalNumber.replace(/^0/, "");
  return /^7[789]\d{7}$/.test(national) ? e164Digits(parsed) : null;
}

function parseCleaned(cleaned: string, region: CountryCode): PhoneNumber | null {
  if (cleaned.startsWith("+")) return parseAs(cleaned, "US");
  if (cleaned.startsWith("00")) return parseAs(`+${cleaned.slice(2)}`, "US");
  return parseAs(cleaned, region);
}

/**
 * Validates and cleans a phone number using libphonenumber-js.
 * Local numbers default to the Jordanian (JO) region and must match its mobile prefix (077/078/079);
 * explicit international numbers (with a country code) are accepted too.
 * Returns a clean E.164 target without the leading "+" (the format required by WhatsApp deep links).
 */
export function normalizeWhatsAppPhone(input: string | null | undefined, region: CountryCode = "JO"): JordanianWhatsAppPhone {
  const cleaned = latinDigits(input ?? "").replace(/[^\d+]/g, "");
  if (!cleaned) return { value: null, error: JORDANIAN_PHONE_WARNING };

  const parsed = parseCleaned(cleaned, region);
  if (parsed && parsed.isValid()) {
    if (parsed.country === "JO") {
      const joined = jordanianMobileE164(parsed);
      if (joined) return { value: joined, error: null };
    } else {
      return { value: e164Digits(parsed), error: null };
    }
  }

  return { value: null, error: JORDANIAN_PHONE_WARNING };
}

/** Jordanian-specific normalization: only accepts Jordanian mobile numbers with the 077/078/079 prefix. */
export function normalizeJordanianWhatsAppPhone(input: string | null | undefined): JordanianWhatsAppPhone {
  const cleaned = latinDigits(input ?? "").replace(/[^\d+]/g, "");
  if (!cleaned) return { value: null, error: JORDANIAN_PHONE_WARNING };

  const parsed = parseCleaned(cleaned, "JO");
  if (parsed && parsed.isValid()) {
    const joined = jordanianMobileE164(parsed);
    if (joined) return { value: joined, error: null };
  }

  return { value: null, error: JORDANIAN_PHONE_WARNING };
}

export function formatWhatsAppPhone(input: string | null | undefined, region?: CountryCode) {
  return normalizeWhatsAppPhone(input, region).value ?? "";
}

/** Kept for backward compatibility with whatsapp-helper and booking flows. */
export function formatJordanianWhatsAppPhone(input: string | null | undefined) {
  return normalizeJordanianWhatsAppPhone(input).value ?? "";
}

export function buildWhatsAppLinks(phone: string, message: string) {
  const encodedText = encodeURIComponent(message);
  return {
    nativeUrl: `whatsapp://send?phone=${phone}&text=${encodedText}`,
    fallbackUrl: `https://wa.me/${phone}?text=${encodedText}`,
  };
}

type WhatsAppLinking = {
  canOpenURL: (url: string) => Promise<boolean>;
  openURL: (url: string) => Promise<unknown>;
};

function nativeLinking(): WhatsAppLinking {
  const { Linking } = require("react-native") as { Linking: WhatsAppLinking };
  return Linking;
}

/**
 * Opens a WhatsApp chat directly with the given phone and message.
 * Normalizes the phone to a clean Jordanian E.164 target, tries the native
 * whatsapp:// scheme first, then falls back to a browser-capable wa.me link.
 * Shows an error alert when the number is invalid or WhatsApp cannot be opened.
 * Throws a stable error code for callers that need to branch on the outcome.
 */
export async function openWhatsAppChat(phone: string, message: string, linking?: WhatsAppLinking): Promise<string> {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized.value) {
    showAlert("رقم غير صالح", "يرجى إدخال رقم هاتف أردني صحيح (077/078/079) قبل إرسال رسالة واتساب.");
    throw new Error("invalid-whatsapp-phone");
  }
  const Linking = linking ?? nativeLinking();
  const links = buildWhatsAppLinks(normalized.value, message);
  try {
    if (await Linking.canOpenURL(links.nativeUrl)) {
      await Linking.openURL(links.nativeUrl);
      return links.nativeUrl;
    }
  } catch {
    // A custom-scheme availability check may reject on some devices; continue to wa.me safely.
  }
  try {
    if (await Linking.canOpenURL(links.fallbackUrl)) {
      await Linking.openURL(links.fallbackUrl);
      return links.fallbackUrl;
    }
  } catch {
    // Fall through; the caller surfaces a consistent error.
  }
  showAlert("تعذر فتح واتساب", "تحقق من تثبيت واتساب على هذا الجهاز ثم حاول مرة أخرى.");
  throw new Error("whatsapp-unavailable");
}

/** Legacy alias kept for existing callers; normalizes input and opens the chat. */
export async function openJordanianWhatsApp(input: { phone: string | null | undefined; message: string; linking?: WhatsAppLinking }) {
  const normalized = normalizeJordanianWhatsAppPhone(input.phone);
  if (!normalized.value) throw new Error("invalid-whatsapp-phone");
  const Linking = input.linking ?? nativeLinking();
  const links = buildWhatsAppLinks(normalized.value, input.message);
  const openedUrl = await openWhatsAppChat(normalized.value, input.message, Linking);
  return {
    ...links,
    openedUrl,
    usedFallback: openedUrl.startsWith("https://") ? (true as const) : (false as const),
  };
}
