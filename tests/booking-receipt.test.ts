import { describe, expect, it } from "vitest";
import { buildBookingReceiptHtml } from "../lib/booking-receipt-markup";

describe("booking receipt markup", () => {
  it("includes guest, chalet, stay period, financials, and deposit information", () => {
    const html = buildBookingReceiptHtml({ businessName: "مجموعة قرية النخيل", businessLogoUrl: "https://example.com/logo.png", guestName: "عمر", phone: "0790000000", chaletName: "النوح", bookingReference: "#012608212", bookingType: "سهرة", checkInLabel: "الجمعة، 21/08/2026 · 10:00 م", checkOutLabel: "السبت، 22/08/2026 · 9:00 ص", periodLabel: "سهرة · 10:00 م — 9:00 ص", rentalTotal: "105.00 د.أ", paidAmount: "50.00 د.أ", rentalBalance: "55.00 د.أ", initialPaymentMethod: "نقدًا بيد المالك", depositRecorded: "100.00 د.أ", depositPaymentMethod: "تحويل CliQ", depositRefunded: "0.00 د.أ", depositHeld: "100.00 د.أ" });
    expect(html).toContain("إيصال حجز");
    expect(html).toContain("تفاصيل الإقامة");
    expect(html).toContain("الجمعة، 21/08/2026");
    expect(html).toContain("السبت، 22/08/2026");
    expect(html).toContain("ملخص الإيجار");
    expect(html).toContain("التأمين");
    expect(html).toContain("طريقة الدفعة الأولى");
    expect(html).toContain("طريقة استلام التأمين");
    expect(html).toContain('src="https://example.com/logo.png"');
  });

  it("uses the StayIn monogram when a custom business logo is not supplied", () => {
    const html = buildBookingReceiptHtml({ businessName: "منشأتي", guestName: "عمر", phone: "0790000000", chaletName: "النوح", bookingType: "سهرة", checkInLabel: "الجمعة، 21/08/2026", checkOutLabel: "السبت، 22/08/2026", periodLabel: "10:00 م — 9:00 ص", rentalTotal: "105.00 د.أ", paidAmount: "50.00 د.أ", rentalBalance: "55.00 د.أ", depositRecorded: "100.00 د.أ", depositRefunded: "0.00 د.أ", depositHeld: "100.00 د.أ" });
    expect(html).toContain('class="logo-fallback">S</div>');
  });
});
