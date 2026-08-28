import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/(tabs)/bookings.tsx"), "utf8");

describe("booking waitlist summary", () => {
  it("shows an active conflicting waitlist request below the quick actions", () => {
    expect(source).toContain("function WaitlistBookingSummary");
    expect(source).toContain("طلب انتظار في الفترة نفسها");
    expect(source).toContain("findConflicts({");
    expect(source).toContain("isWaitlistExpired(entry, clock)");
    expect(source).toContain('const row = language === "ar" ? "row-reverse" : "row"');
    expect(source).toContain('width: "32%"');
    expect(source).toContain('color: "#F59E0B"');
    expect(source).toContain("waitlistCountdownLabel(entry, now, language)");
  });

  it("opens the linked waitlist conversion form directly from the booking card", () => {
    expect(source).toContain("openWaitlistPromotion");
    expect(source).toContain("waitlistId: entry.id");
    expect(source).toContain('mode: "promote"');
  });

  it("offers an explicit keep-or-replace decision for an unpaid booking during the final day", () => {
    expect(source).toContain("WaitlistPriorityDecision");
    expect(source).toContain("تنبيه قبل الموعد: حجز بلا دفعة أمام طلب انتظار");
    expect(source).toContain("تأكيد الحجز");
    expect(source).toContain("بدء الاستبدال");
    expect(source).toContain("acknowledgeWaitlistPriority");
  });
});
