import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(resolve(process.cwd(), "app/whatsapp-templates.tsx"), "utf8");
const detail = readFileSync(resolve(process.cwd(), "app/booking-detail.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "app/(tabs)/settings.tsx"), "utf8");

describe("WhatsApp templates management", () => {
  it("offers one automatic header and editable operational modules with preview and restoration", () => {
    expect(screen).toContain('const SECTIONS: TemplateSection[] = ["base", "arrival", "checkout", "contract"]');
    expect(screen).toContain("الترويسة الأساسية");
    expect(screen).toContain("whatsAppBaseHeaderTemplate");
    expect(screen).toContain("arrivalMessageBlockTemplate");
    expect(screen).toContain("checkoutMessageBlockTemplate");
    expect(screen).toContain("contractMessageBlockTemplate");
    expect(screen).toContain("استعادة الافتراضي");
    expect(screen).toContain("معاينة ببيانات تجريبية");
  });

  it("opens the standalone screen from WhatsApp and Settings without stacking modals", () => {
    expect(detail).toContain('setWhatsAppComposerOpen(false)');
    expect(detail).toContain('router.push("/whatsapp-templates" as never)');
    expect(detail).toContain("generateConsolidatedWhatsAppMessage");
    expect(settings).toContain('router.push("/whatsapp-templates" as never)');
  });
});
