import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseBackupData, serializeBackup } from "../lib/backup-import";
import { ABSTRACT_PAYMENT_METHODS, LEDGER_PAYMENT_METHODS, DEFAULT_SETTINGS, abstractPaymentMethodOptions, ledgerPaymentMethod, normalizeAppData, paymentMethodLabel, type Booking, type Chalet } from "../lib/booking-model";
import { REPORT_PAYMENT_METHODS, reportPaymentMethodBucket, summarizeFinancialReport } from "../lib/reporting";

const booking = (overrides: Partial<Booking> = {}): Booking => ({ id: "b-1", customerName: "سامي", phone: "0790000000", chaletId: "c-1", startDate: "2026-09-10", endDate: "2026-09-10", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 120, payments: [], notes: "", status: "confirmed", createdAt: "2026-09-10T08:00:00.000Z", ...overrides });
const chalet = (id: string, name: string, color: string): Chalet => ({ id, name, color, createdAt: "2026-08-01T00:00:00.000Z" });

describe("ledger abstract payment methods", () => {
  it("provides a fixed abstract list that is never bound to a specific recipient", () => {
    expect(LEDGER_PAYMENT_METHODS).toEqual(["CASH", "CLIQ", "IBAN", "OTHER"]);
    expect(ABSTRACT_PAYMENT_METHODS.map((item) => item.id)).toEqual(["cash", "cliq", "iban", "other"]);
    const arabic = abstractPaymentMethodOptions("ar");
    expect(arabic.map((item) => item.label)).toEqual(["نقداً", "الحوالة عبر CliQ", "الحوالة البنكية (IBAN)", "بطاقة / دفع إلكتروني / أخرى"]);
    expect(arabic.some((item) => item.label.includes("بيد"))).toBe(false);
    expect(abstractPaymentMethodOptions("en").map((item) => item.label)).toEqual(["Cash", "CliQ transfer", "Bank transfer (IBAN)", "Card / electronic / other"]);
  });

  it("classifies any legacy or new method id into its abstract ledger method", () => {
    expect(ledgerPaymentMethod("cash")).toBe("CASH");
    expect(ledgerPaymentMethod("cash-owner")).toBe("CASH");
    expect(ledgerPaymentMethod("cash-guardian")).toBe("CASH");
    expect(ledgerPaymentMethod("cliq")).toBe("CLIQ");
    expect(ledgerPaymentMethod("click")).toBe("CLIQ");
    expect(ledgerPaymentMethod("iban")).toBe("IBAN");
    expect(ledgerPaymentMethod("bank-transfer")).toBe("IBAN");
    expect(ledgerPaymentMethod("other")).toBe("OTHER");
    expect(ledgerPaymentMethod("card")).toBe("OTHER");
    expect(ledgerPaymentMethod("wallet")).toBe("OTHER");
    expect(ledgerPaymentMethod("mystery")).toBeUndefined();
    expect(ledgerPaymentMethod(undefined)).toBeUndefined();
  });

  it("labels abstract methods in Arabic and keeps legacy labels untouched", () => {
    expect(paymentMethodLabel("cash")).toBe("نقداً");
    expect(paymentMethodLabel("cliq")).toBe("الحوالة عبر CliQ");
    expect(paymentMethodLabel("iban")).toBe("الحوالة البنكية (IBAN)");
    expect(paymentMethodLabel("other")).toBe("بطاقة / دفع إلكتروني / أخرى");
    expect(paymentMethodLabel("CASH", "en")).toBe("Cash");
    expect(paymentMethodLabel("cash-guardian")).toBe("كاش بيد الحارس");
    expect(paymentMethodLabel("cash-owner")).toBe("كاش بيد المالك");
    expect(paymentMethodLabel("click")).toBe("تحويل CliQ");
    expect(paymentMethodLabel("bank-transfer")).toBe("تحويل بنكي");
    expect(paymentMethodLabel("card")).toBe("بطاقة / دفع إلكتروني");
  });

  it("normalizes the explicit ledger payload on booking payments and deposits", () => {
    const data = normalizeAppData({
      bookings: [booking({ payments: [{ id: "p-cash", amount: 50, date: "2026-09-10", paymentMethod: "cash", recipientType: "guard", recipientTargetId: "float-f1", recipientEntityId: "float-f1", recipientSubAccountId: "f1#cash", isCustody: true }], depositCollection: { id: "d-cliq", amount: 30, date: "2026-09-10", paymentMethod: "cliq", recipientType: "owner", recipientTargetId: "owner", recipientEntityId: "owner", recipientSubAccountId: "owner-cliq", isCustody: false } })],
      waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [],
      settings: { businessName: "منشأة", businessPhone: "", currency: "د.أ", bookingTypes: DEFAULT_SETTINGS.bookingTypes },
    });
    expect(data.bookings[0].payments[0]).toMatchObject({ paymentMethod: "cash", recipientEntityId: "float-f1", recipientSubAccountId: "f1#cash", isCustody: true, recipientTargetId: "float-f1" });
    expect(data.bookings[0].depositCollection).toMatchObject({ paymentMethod: "cliq", recipientEntityId: "owner", recipientSubAccountId: "owner-cliq", isCustody: false });
  });

  it("keeps the ledger payload through a serialized backup round-trip", () => {
    const data = normalizeAppData({
      bookings: [booking({ payments: [{ id: "p-iban", amount: 40, date: "2026-09-10", paymentMethod: "iban", recipientType: "owner", recipientTargetId: "owner", recipientEntityId: "owner", recipientSubAccountId: "owner-bank", isCustody: false }] })],
      waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [],
      settings: { businessName: "منشأة", businessPhone: "", currency: "د.أ", bookingTypes: DEFAULT_SETTINGS.bookingTypes },
    });
    const restored = parseBackupData(serializeBackup(data));
    expect(restored.bookings[0].payments[0]).toMatchObject({ paymentMethod: "iban", recipientEntityId: "owner", recipientSubAccountId: "owner-bank", isCustody: false });
  });
});

describe("ledger payment reporting buckets", () => {
  it("maps every method to the fixed report buckets or stays invisible for non-cash/cliq lanes", () => {
    expect(reportPaymentMethodBucket("cash-guardian")).toBe("cash-guardian");
    expect(reportPaymentMethodBucket("cash-owner")).toBe("cash-owner");
    expect(reportPaymentMethodBucket("click")).toBe("click");
    expect(reportPaymentMethodBucket("cash", true)).toBe("cash-guardian");
    expect(reportPaymentMethodBucket("cash", false)).toBe("cash-owner");
    expect(reportPaymentMethodBucket("cash")).toBe("cash-owner");
    expect(reportPaymentMethodBucket("cliq")).toBe("click");
    expect(reportPaymentMethodBucket("iban")).toBeUndefined();
    expect(reportPaymentMethodBucket("other")).toBeUndefined();
    expect(reportPaymentMethodBucket("bank-transfer")).toBeUndefined();
    expect(reportPaymentMethodBucket(undefined)).toBeUndefined();
    expect(REPORT_PAYMENT_METHODS).toEqual(["cash-guardian", "cash-owner", "click"]);
  });

  it("aggregates abstract cash/cliq payments into the legacy buckets with custody splitting", () => {
    const data = [
      booking({ payments: [{ id: "p1", amount: 50, date: "2026-09-10", paymentMethod: "cash", isCustody: true }, { id: "p2", amount: 20, date: "2026-09-10", paymentMethod: "cash", isCustody: false }, { id: "p3", amount: 30, date: "2026-09-10", paymentMethod: "cliq" }, { id: "p4", amount: 40, date: "2026-09-10", paymentMethod: "iban", isCustody: false }] }),
      booking({ id: "b-2", chaletId: "c-2", payments: [{ id: "legacy", amount: 60, date: "2026-09-10", paymentMethod: "cash-guardian" }] }),
    ];
    const summary = summarizeFinancialReport(data, [chalet("c-1", "النوح", "#C87947"), chalet("c-2", "المايا", "#C9587A")]);
    expect(summary.paymentMethods["cash-guardian"]).toBe(110);
    expect(summary.paymentMethods["cash-owner"]).toBe(20);
    expect(summary.paymentMethods.click).toBe(30);
  });

  it("places abstract custody deposits into the guardian collection bucket", () => {
    const data = [booking({ depositCollection: { id: "d-cash", amount: 70, date: "2026-09-10", paymentMethod: "cash", recipientType: "guard", recipientTargetId: "float-f1", isCustody: true } }), booking({ id: "b-2", depositCollection: { id: "d-cliq", amount: 25, date: "2026-09-10", paymentMethod: "cliq", recipientType: "owner", recipientTargetId: "owner" } })];
    const summary = summarizeFinancialReport(data, [chalet("c-1", "النوح", "#C87947"), chalet("c-2", "المايا", "#C9587A")]);
    expect(summary.depositCollectionMethods["cash-guardian"]).toBe(70);
    expect(summary.depositCollectionMethods.click).toBe(25);
  });
});

describe("booking form cascading recipient wiring", () => {
  const form = readFileSync("app/booking-form.tsx", "utf8");
  const model = readFileSync("lib/booking-model.ts", "utf8");
  const backup = readFileSync("lib/backup-import.ts", "utf8");

  it("binds the abstract method dropdown and stores the explicit ledger payload", () => {
    expect(form).toContain("abstractPaymentMethodOptions(language)");
    expect(form).toContain("recipientsForMethod");
    expect(form).toContain("methodRecipients(initialPaymentMethod)");
    expect(form).toContain("recipientEntityId");
    expect(form).toContain("recipientSubAccountId");
    expect(form).toContain("isCustody: recipient ? recipient.type !== \"owner\" : false");
    expect(form).toContain("لا توجد حسابات مفعلة لهذه الطريقة");
    expect(form).not.toContain("بيد المالك");
    expect(form).not.toContain("بيد الحارس");
    expect(form).not.toContain("activePaymentMethods");
  });

  it("exposes the abstract labels and backup schema fields in the supporting libs", () => {
    expect(model).toContain("بطاقة / دفع إلكتروني / أخرى");
    expect(backup).toContain("recipientEntityId");
    expect(backup).toContain("recipientSubAccountId");
    expect(backup).toContain("isCustody");
  });
});