import { describe, expect, it } from "vitest";

import { buildFinancialReceiptHtml } from "../lib/financial-receipt-markup";

describe("financial receipt PDF markup", () => {
  it("includes the movement identity, timestamp and escaped customer data", () => {
    const html = buildFinancialReceiptHtml({ businessName: "مجموعة النخيل", guestName: "أحمد <حميد>", chaletName: "المايا", bookingReference: "#MY2608193", movementTitle: "دفعة إيجار", amountLabel: "+30.00 د.أ", dateLabel: "21/08/2026", timeLabel: "4:15 م", paymentMethodLabel: "كاش بيد الحارس", note: "عربون" });
    expect(html).toContain("إيصال حركة مالية");
    expect(html).toContain("4:15 م");
    expect(html).toContain("أحمد &lt;حميد&gt;");
  });
});
