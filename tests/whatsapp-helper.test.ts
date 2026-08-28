import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { Booking, Chalet, DEFAULT_SETTINGS } from "../lib/booking-model";
import { formatWhatsAppPhone, generateBookingWhatsAppMessage, generateBookingWhatsAppUrl, generateSelectedBookingWhatsAppMessage } from "../lib/whatsapp-helper";
import { generateConsolidatedWhatsAppMessage } from "../lib/whatsapp-message-engine";
import { JORDANIAN_PHONE_WARNING, buildWhatsAppLinks, normalizeJordanianWhatsAppPhone, openJordanianWhatsApp } from "../lib/whatsapp";

const consolidatedEngine = readFileSync(resolve(process.cwd(), "lib/whatsapp-message-engine.ts"), "utf8");

const booking: Booking = { id: "booking-1", customerName: "ليان", phone: "079 123 4567", chaletId: "rose", chaletName: "شاليه الوردة", startDate: "2026-08-20", endDate: "2026-08-21", bookingType: "24h", startTime: "09:00", endTime: "09:00", price: 200, depositAmount: 50, payments: [{ id: "payment-1", amount: 75, date: "2026-08-18" }], notes: "", status: "confirmed", createdAt: "2026-08-18T10:00:00.000Z" };
const settings = { ...DEFAULT_SETTINGS, whatsAppEnabled: true, ownerPhone: "0791111111", enableDisclaimer: true, disclaimerText: "تنبيه السلامة حول المسبح مطلوب.", whatsAppOptions: { includeGuestAndChalet: true, includeSchedule: true, includeFinancials: true, includeLocation: true, includeContacts: true } };
const chalet: Chalet = { id: "rose", name: "شاليه الوردة", color: "#0F8B83", locationUrl: "https://maps.google.com/?q=31.95,35.91", guardianPhone: "0792222222", createdAt: "2026-08-18T10:00:00.000Z" };

describe("WhatsApp booking message", () => {
  it("builds a complete Arabic message with remaining balance, refundable deposit, contacts and disclaimer", () => {
    const message = generateBookingWhatsAppMessage(booking, settings, "ar", chalet);
    expect(message).toContain("ليان");
    expect(message).toContain("شاليه الوردة");
    expect(message).toContain("المتبقي");
    expect(message).toContain("125.00");
    expect(message).toContain("التأمين القابل للاسترداد");
    expect(message).toContain("50.00");
    expect(message).toContain("https://maps.google.com");
    expect(message).toContain("هاتف الإدارة".replace("هاتف ", ""));
    expect(message).toContain("تنبيه السلامة");
  });

  it("marks the rental paid and omits the security deposit when neither is applicable", () => {
    const message = generateBookingWhatsAppMessage({ ...booking, depositAmount: 0, payments: [{ id: "paid", amount: 200, date: "2026-08-18" }] }, { ...settings, enableDisclaimer: false }, "ar", chalet);
    expect(message).toContain("مكتمل السداد");
    expect(message).not.toContain("التأمين القابل للاسترداد");
    expect(message).not.toContain("تنبيه السلامة");
  });

  it("respects switches that hide financial and contact information", () => {
    const message = generateBookingWhatsAppMessage(booking, { ...settings, whatsAppOptions: { ...settings.whatsAppOptions, includeFinancials: false, includeContacts: false, includeLocation: false } }, "en", chalet);
    expect(message).toContain("Hello Layan".replace("Layan", "ليان"));
    expect(message).not.toContain("Financial summary");
    expect(message).not.toContain("Management:");
    expect(message).not.toContain("maps.google.com");
  });

  it("normalizes local and Arabic-digit phones and encodes Arabic text in wa.me URLs", () => {
    expect(formatWhatsAppPhone("079 123 4567")).toBe("962791234567");
    expect(formatWhatsAppPhone("٠٧٩١٢٣٤٥٦٧")).toBe("962791234567");
    const url = generateBookingWhatsAppUrl(booking, settings, "ar", chalet);
    expect(url).toMatch(/^https:\/\/wa\.me\/962791234567\?text=/);
    expect(url).toContain(encodeURIComponent("ليان"));
    expect(url).not.toContain("ليان");
  });

  it("accepts every supported Jordanian mobile prefix and rejects malformed or non-Jordanian targets", () => {
    expect(normalizeJordanianWhatsAppPhone("0791234567")).toEqual({ value: "962791234567", error: null });
    expect(normalizeJordanianWhatsAppPhone("078-123-4567")).toEqual({ value: "962781234567", error: null });
    expect(normalizeJordanianWhatsAppPhone("(077) 123 4567")).toEqual({ value: "962771234567", error: null });
    expect(normalizeJordanianWhatsAppPhone("+962 79 123 4567")).toEqual({ value: "962791234567", error: null });
    expect(normalizeJordanianWhatsAppPhone("079123456")).toEqual({ value: null, error: JORDANIAN_PHONE_WARNING });
    expect(normalizeJordanianWhatsAppPhone("0761234567")).toEqual({ value: null, error: JORDANIAN_PHONE_WARNING });
  });

  it("builds encoded native and web WhatsApp targets, then falls back to wa.me if the app scheme is unavailable", async () => {
    const message = "أهلًا 👋\nموعدك غدًا";
    const links = buildWhatsAppLinks("962791234567", message);
    expect(links.nativeUrl).toContain("whatsapp://send?phone=962791234567&text=");
    expect(links.fallbackUrl).toContain("https://wa.me/962791234567?text=");
    expect(links.fallbackUrl).toContain("%0A");
    const opened: string[] = [];
    const result = await openJordanianWhatsApp({ phone: "0791234567", message, linking: { canOpenURL: async (url) => url.startsWith("https://"), openURL: async (url) => { opened.push(url); return true; } } });
    expect(result.usedFallback).toBe(true);
    expect(opened).toEqual([links.fallbackUrl]);
  });

  it("combines only the checked WhatsApp sections, including custom confirmation and contract terms", () => {
    const message = generateSelectedBookingWhatsAppMessage({
      selectedItems: ["confirmation", "arrival", "terms"],
      booking,
      settings,
      language: "ar",
      chalet,
      customConfirmationTemplate: "أهلًا {العميل}، تم تأكيد {الشاليه}.",
      customContractTerms: "عدم تجاوز عدد الضيوف المتفق عليه\nتسليم الشاليه في الموعد",
    });
    expect(message).toContain("تأكيد الحجز");
    expect(message).toContain("أهلًا ليان، تم تأكيد شاليه الوردة.");
    expect(message).toContain("تعليمات الوصول");
    expect(message).toContain("شروط الإقامة");
    expect(message).toContain("1. عدم تجاوز عدد الضيوف المتفق عليه");
    expect(message).not.toContain("إيصال الحجز");
  });

  it("uses the global custom receipt template and replaces paid and remaining values", () => {
    const message = generateSelectedBookingWhatsAppMessage({
      selectedItems: ["receipt"],
      booking,
      settings,
      language: "ar",
      chalet,
      customReceiptTemplate: "إيصال {العميل}: مدفوع {المدفوع}، متبقي {المتبقي}.",
    });
    expect(message).toContain("إيصال ليان: مدفوع 75.00 د.أ، متبقي 125.00 د.أ.");
  });

  it("adds the unified header once and appends only selected operational modules", () => {
    const message = generateConsolidatedWhatsAppMessage({
      selectedModules: ["arrival", "checkout"],
      booking,
      settings: { ...settings, enableDisclaimer: false },
      language: "ar",
      chalet,
      baseHeaderTemplate: "ترويسة للحجز {المرجع}\nالعميل: {العميل}\nالشروط: {الشروط}",
      arrivalBlockTemplate: "وصول إضافي إلى {الشاليه}",
      checkoutBlockTemplate: "مغادرة إضافية: {المغادرة}",
      contractBlockTemplate: "إقرار لا يجب ظهوره",
      stayTerms: "المحافظة على الشاليه\nالتسليم في الموعد",
    });
    expect(message.match(/ترويسة للحجز/g)).toHaveLength(1);
    expect(message).toContain("وصول إضافي إلى شاليه الوردة");
    expect(message).toContain("مغادرة إضافية:");
    expect(message).toContain("1. المحافظة على الشاليه");
    expect(message).not.toContain("إقرار لا يجب ظهوره");
  });

  it("uses the shared Jordanian engine and checks native plus fallback availability before opening the consolidated message", () => {
    expect(consolidatedEngine).toContain("openJordanianWhatsApp");
    expect(consolidatedEngine).toContain("phone: options.booking.phone");
    const engine = readFileSync(resolve(process.cwd(), "lib/whatsapp.ts"), "utf8");
    expect(engine).toContain("Linking.canOpenURL");
    expect(engine).toContain("https://wa.me/${phone}?text=${encodedText}");
    expect(engine).toContain('throw new Error("whatsapp-unavailable")');
  });
});
