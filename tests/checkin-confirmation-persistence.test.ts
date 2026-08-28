import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { normalizeAppData } from "../lib/booking-model";

describe("check-in confirmation persistence", () => {
  it("retains the verified arrival details and its booking-scoped audit event", () => {
    const actualArrivalAt = "2026-08-23T17:45:00.000Z";
    const data = normalizeAppData({
      bookings: [{ id: "booking-arrival-1", customerName: "محمد", phone: "07979546132", chaletId: "chalet-1", chaletName: "آدم", startDate: "2026-08-23", endDate: "2026-08-24", bookingType: "morning", startTime: "10:00", endTime: "21:00", price: 125, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-20T10:00:00.000Z", checkedInAt: actualArrivalAt, checkInConfirmation: { actualArrivalAt, rentalBalanceVerified: true, rentalBalancePaymentMethod: "cash-owner", securityDepositVerified: true, securityDepositPaymentMethod: "click", identityNote: "تم التحقق من هوية الضيف" } }],
      chalets: [{ id: "chalet-1", name: "آدم", color: "#0D9488", createdAt: "2026-08-20T10:00:00.000Z" }],
      auditLog: [{ id: "audit-arrival-1", action: "booking-checked-in", bookingId: "booking-arrival-1", subjectName: "محمد", details: "آدم · تم تسجيل الوصول", createdAt: actualArrivalAt, actorName: "MohAjlouni" }],
    });
    expect(data.bookings[0].checkInConfirmation).toEqual({ actualArrivalAt, rentalBalanceVerified: true, rentalBalancePaymentMethod: "cash-owner", securityDepositVerified: true, securityDepositPaymentMethod: "click", identityNote: "تم التحقق من هوية الضيف" });
    expect(data.auditLog[0]).toMatchObject({ action: "booking-checked-in", bookingId: "booking-arrival-1", actorName: "MohAjlouni" });
  });

  it("uses independent payment-method cards rather than ambiguous switches", () => {
    const source = readFileSync("components/check-in-confirmation-sheet.tsx", "utf8");
    expect(source).toContain("PaymentMethodCard");
    expect(source).toContain("دفعة المتبقي عند الوصول");
    expect(source).toContain("استلام التأمين");
    expect(source).not.toContain("<Switch");
  });
});
