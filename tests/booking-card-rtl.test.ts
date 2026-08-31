import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/booking-card.tsx"), "utf8");

describe("BookingCard RTL structure", () => {
  it("keeps guest content before the chalet identity block in the booking card header", () => {
    expect(source).toContain('rowBetween: { flexDirection: "row"');
    expect(source.indexOf("<View style={styles.guestInfo}")).toBeLessThan(source.indexOf("<View style={[styles.chaletBadge"));
  });

  it("keeps schedule information before the creator slot and financial slots in canonical order", () => {
    expect(source.indexOf("<View style={styles.scheduleInfo}")).toBeLessThan(source.indexOf('accessibilityRole="button" accessibilityLabel={creatorKnown'));
    const balanceIndex = source.indexOf("<FinancialSlot label={balanceLabel}");
    const depositIndex = source.indexOf("<FinancialSlot label={depositLabel}");
    const totalIndex = source.indexOf('<FinancialSlot label={`${isArabic ? "الإجمالي"');
    expect(balanceIndex).toBeGreaterThan(-1);
    expect(balanceIndex).toBeLessThan(depositIndex);
    expect(depositIndex).toBeLessThan(totalIndex);
    expect(source).toContain("numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.64}");
  });

  it("isolates numeric runs and keeps Arabic labels explicitly right-directed", () => {
    expect(source).toContain('return `\\u200E${value}\\u200E`;');
    expect(source).toContain("const phoneText = numberRun(booking.phone);");
    expect(source).toContain("const referenceText = numberRun(formatBookingReference(booking.bookingReference));");
    expect(source).toContain("formatBookingReference");
    expect(source).toContain("createdByName");
    expect(source).not.toContain("المستخدم:");
    expect(source).toContain("styles.bookingReference");
    expect(source).toContain("styles.creatorSlotText");
    expect(source).toContain("creatorActivityOpen");
    expect(source).toContain("عرض سجل إجراءات");
    expect(source).toContain("creatorRoleIcon");
    expect(source).toContain('booking.createdByRole === "owner"');
    expect(source).toContain('booking.createdByRole === "employee"');
    expect(source).toContain("سجّل هذا الحجز");
    expect(source).toContain("guestMetaArabic");
    expect(source).toContain('scheduleDate: { width: "100%", fontSize: 12, fontWeight: "800", writingDirection: "rtl" }');
    expect(source).toContain('textAlign: isCompactView ? "center" : isArabic ? "center" : textAlign');
    expect(source).toContain('creatorSlot: { flex: 1, minWidth: 100, maxWidth: "32%"');
    expect(source).toContain('periodTag: { flex: 1, minWidth: 90, maxWidth: "32%"');
    expect(source).toContain('financialSlot: { flex: 1, minWidth: 90, maxWidth: "32%"');
    expect(source).toContain('financialText: { flex: 1, minWidth: 0, fontSize: 9, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }');
    expect(source).toContain("تأمين مسترد:");
    expect(source).toContain("دفعة:");
    expect(source).toContain("تأمين:");
    expect(source).toContain("لا يوجد تأمين");
    expect(source).not.toContain("تأمين قيد الحيازة");
  });
});
