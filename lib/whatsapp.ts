export const JORDANIAN_PHONE_WARNING = "يرجى إدخال رقم هاتف أردني صحيح مكون من 10 أرقام (079/078/077)";

export type JordanianWhatsAppPhone = {
  value: string | null;
  error: string | null;
};

const ARABIC_DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };

function latinDigits(value: string) {
  return Array.from(value).map((character) => ARABIC_DIGITS[character] ?? character).join("");
}

/** Validates Jordanian 077/078/079 mobiles and returns an E.164-compatible WhatsApp target without +. */
export function normalizeJordanianWhatsAppPhone(input: string | null | undefined): JordanianWhatsAppPhone {
  let digits = latinDigits(input ?? "").replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0?7[789]\d{7}$/.test(digits)) return { value: `962${digits.startsWith("0") ? digits.slice(1) : digits}`, error: null };
  if (/^9627[789]\d{7}$/.test(digits)) return { value: digits, error: null };
  return { value: null, error: JORDANIAN_PHONE_WARNING };
}

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

/** Opens the native WhatsApp scheme first; wa.me remains a browser-capable fallback. */
export async function openJordanianWhatsApp(input: { phone: string | null | undefined; message: string; linking?: WhatsAppLinking }) {
  const normalized = normalizeJordanianWhatsAppPhone(input.phone);
  if (!normalized.value) throw new Error("invalid-whatsapp-phone");
  const Linking = input.linking ?? nativeLinking();
  const links = buildWhatsAppLinks(normalized.value, input.message);
  try {
    if (await Linking.canOpenURL(links.nativeUrl)) {
      await Linking.openURL(links.nativeUrl);
      return { ...links, openedUrl: links.nativeUrl, usedFallback: false as const };
    }
  } catch {
    // A custom-scheme availability check may reject on a device; continue to wa.me safely.
  }
  try {
    if (await Linking.canOpenURL(links.fallbackUrl)) {
      await Linking.openURL(links.fallbackUrl);
      return { ...links, openedUrl: links.fallbackUrl, usedFallback: true as const };
    }
  } catch {
    // The final error stays consistent for callers and translated UI messages.
  }
  throw new Error("whatsapp-unavailable");
}
