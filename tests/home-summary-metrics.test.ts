import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
const moreSource = readFileSync(resolve(process.cwd(), "app/(tabs)/more.tsx"), "utf8");

describe("Home compact summary metrics", () => {
  it("keeps the same compact container while showing today, occupancy, and outstanding balance", () => {
    expect(source).toContain('summaryBar: { minHeight: 104');
    expect(source).toContain('"حجوزات اليوم"');
    expect(source).toContain('"نسبة الإشغال"');
    expect(source).toContain('"الرصيد المستحق"');
    expect(source).toContain("const occupancyPercent");
  });

  it("keeps the waitlist out of permanent summary metrics and shows it only as a conditional indicator", () => {
    expect(source).toContain("pendingWaitlist.length > 0 ? <Pressable");
    expect(source).toContain("styles.waitlistIndicator");
    expect(source).toContain('entry.status === "active"');
    expect(source).toContain("!isWaitlistExpired(entry, clock)");
    expect(source).toContain('params: { tab: "active" }');
    expect(source).not.toContain('label={language === "ar" ? "الانتظار"');
  });

  it("offers protected recovery guidance when the device has no local data and no signed-in session", () => {
    expect(source).toContain("هل لديك بيانات منشأة محفوظة؟");
    expect(source).toContain("اضغط لتسجيل الدخول واستعادتها بأمان.");
    expect(source).toContain("bookings.length === 0 && !isAuthenticated");
    expect(source).toContain("void startOAuthLogin()");
    expect(moreSource).toContain("lastSyncLabel");
    expect(moreSource).toContain("آخر مزامنة:");
    expect(moreSource).toContain("تحديث بيانات المنشأة");
    expect(moreSource).toContain("CompactSyncIndicator");
    expect(moreSource).toContain("useInternetAvailability");
    expect(moreSource).toContain("connectionLabel");
  });
});
