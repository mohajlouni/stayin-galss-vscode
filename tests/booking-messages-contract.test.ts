import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const helper = readFileSync(resolve(process.cwd(), "lib/whatsapp-helper.ts"), "utf8");
const contract = readFileSync(resolve(process.cwd(), "lib/booking-contract.ts"), "utf8");
const detail = readFileSync(resolve(process.cwd(), "app/booking-detail.tsx"), "utf8");

describe("reviewed guest messaging and stay contract", () => {
  it("provides confirmation, arrival, and checkout message templates", () => {
    expect(helper).toContain('"confirmation" | "arrival" | "checkout"');
    expect(helper).toContain("generateBookingTemplateMessage");
    expect(helper).toContain("openBookingTemplateWhatsApp");
  });

  it("offers one checkbox-based WhatsApp composer that combines selected content", () => {
    expect(helper).toContain("WHATSAPP_SEND_ITEMS");
    expect(helper).toContain("generateSelectedBookingWhatsAppMessage");
    expect(helper).toContain("openSelectedBookingWhatsApp");
    expect(detail).toContain("وحدات اختيارية");
    expect(detail).toContain("accessibilityRole=\"checkbox\"");
    expect(detail).toContain("إرسال عبر واتساب");
    expect(detail).toContain("openWhatsAppComposer");
    expect(detail).toContain("lastWhatsAppMessageModules");
    expect(detail).toContain("updateDeviceSettings({ lastWhatsAppMessageModules: selected })");
    expect(detail).toContain("إدارة القوالب");
    expect(detail).toContain("onManageTemplates");
    expect(detail).toContain("استعادة النص الافتراضي");
    expect(detail).toContain("DEFAULT_DEVICE_SETTINGS");
    expect(detail).toContain("معاينة الرسالة النهائية");
    expect(detail).toContain("generateConsolidatedWhatsAppMessage");
    expect(detail).toContain("فتح إدارة القوالب");
    expect(contract).toContain("عقد إقامة");
    expect(contract).toContain("مشاركة عقد الإقامة");
  });
});
