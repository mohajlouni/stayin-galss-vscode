import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, activePaymentMethods, normalizeAppData, normalizePaymentMethodOptions } from "../lib/booking-model";

describe("payment-method settings", () => {
  it("normalizes editable methods with icons and exposes only active, non-archived methods", () => {
    const methods = normalizePaymentMethodOptions([
      { id: "cash-owner", label: "نقدًا بيد المالك", isActive: true, icon: "💵" },
      { id: "bank-company", label: "تحويل بنكي للشركة", isActive: false, icon: "🏦" },
      { id: "wallet-custom", label: "محفظة إلكترونية", isActive: true, icon: "📱", isArchived: true },
      { id: "cash-owner", label: "مكرر", isActive: true, icon: "💳" },
    ]);
    expect(methods).toEqual(expect.arrayContaining([
      { id: "cash-owner", label: "نقدًا بيد المالك", isActive: true, icon: "💵", isArchived: undefined },
      { id: "bank-company", label: "تحويل بنكي للشركة", isActive: false, icon: "🏦", isArchived: undefined },
      { id: "wallet-custom", label: "محفظة إلكترونية", isActive: true, icon: "📱", isArchived: true },
    ]));
    expect(activePaymentMethods({ paymentMethods: methods })).toContainEqual({ id: "cash-owner", label: "نقدًا بيد المالك", isActive: true, icon: "💵", isArchived: undefined });
    expect(activePaymentMethods({ paymentMethods: methods }).some((method) => method.id === "wallet-custom")).toBe(false);
  });

  it("keeps custom methods and their icons through normalized app data", () => {
    const data = normalizeAppData({
      bookings: [], waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [],
      settings: { businessName: "منشأة", businessPhone: "", currency: "د.أ", bookingTypes: DEFAULT_SETTINGS.bookingTypes, paymentMethods: [{ id: "bank-company", label: "تحويل بنكي للشركة", isActive: true, icon: "🏦" }] },
    });
    expect(data.settings.paymentMethods).toContainEqual({ id: "bank-company", label: "تحويل بنكي للشركة", isActive: true, icon: "🏦", isArchived: undefined });
  });

  it("provides CRUD management and sends active customized methods into both booking collection selectors", () => {
    const form = readFileSync("app/booking-form.tsx", "utf8");
    const model = readFileSync("lib/booking-model.ts", "utf8");
    const store = readFileSync("lib/booking-store.tsx", "utf8");
    const settings = readFileSync("app/(tabs)/settings.tsx", "utf8");
    const more = readFileSync("app/(tabs)/more.tsx", "utf8");
    const management = readFileSync("app/payment-methods.tsx", "utf8");
    expect(form).toContain("activePaymentMethods(settings)");
    expect(form).toContain("selected.icon");
    expect(form).toContain("option.icon");
    expect(form).toContain('required={Number(depositAmount || 0) > 0}');
    expect(form).toContain('flexDirection: rentRow');
    expect(form).toContain('!existing && Number(initialPayment || 0) > 0 ? <PaymentMethodChoices');
    expect(form).toContain("طريقة دفع العربون");
    expect(form).toContain('selected?.label ?? (language === "ar" ? "اختر طريقة الدفع"');
    expect(form).toContain("طريقة استلام التأمين");
    expect(model).toContain("بطاقة / دفع إلكتروني");
    expect(model).toContain("PAYMENT_METHOD_ICON_OPTIONS");
    expect(store).toContain('PAYMENT_METHODS_STORAGE_KEY = "@stayin_payment_methods"');
    expect(store).toContain("persistPaymentMethods");
    expect(settings).toContain("إدارة طرق الدفع");
    expect(settings).toContain('router.push("/payment-methods" as never)');
    expect(more).toContain('route: "/payment-methods"');
    expect(management).toContain("إضافة طريقة دفع");
    expect(management).toContain("تعديل طريقة الدفع");
    expect(management).toContain("delete-outline");
    expect(management).toContain("PAYMENT_METHOD_ICON_OPTIONS");
  });

  it("preserves recipient routing and commission metadata without changing legacy payment records", () => {
    const data = normalizeAppData({
      bookings: [{ id: "b-routing", customerName: "عميل", phone: "0790000000", startDate: "2026-08-26", endDate: "2026-08-26", bookingType: "morning", startTime: "09:00", endTime: "17:00", price: 100, depositAmount: 20, depositPaymentMethod: "click", depositCollection: { id: "d-routing", amount: 20, date: "2026-08-26", paymentMethod: "click", recipientType: "staff", handlerUserId: 12, handlerName: "موظف التحصيل", recipientAccountLabel: "0791234567", calculatedCommission: 2, commissionType: "percent" }, payments: [{ id: "p-routing", amount: 50, date: "2026-08-26", paymentMethod: "click", recipientType: "staff", handlerUserId: 12, handlerName: "موظف التحصيل", recipientAccountLabel: "0791234567", calculatedCommission: 5, commissionType: "percent" }], notes: "", status: "confirmed", createdAt: "2026-08-26T08:00:00.000Z" }],
      waitlist: [], chalets: [], turnoverTasks: [], specialPriceRules: [], auditLog: [],
      settings: { businessName: "منشأة", businessPhone: "", currency: "د.أ", bookingTypes: DEFAULT_SETTINGS.bookingTypes, paymentMethods: [{ id: "click", label: "تحويل CliQ", isActive: true, icon: "⚡", defaultRecipientType: "staff" }], paymentRouting: { masterAccounts: { cliqAlias: "مالك CliQ", bankDetails: "JO00TEST", cashHandlerLabel: "صندوق المالك" } } },
    });
    expect(data.settings.paymentMethods?.[0]).toMatchObject({ id: "click", defaultRecipientType: "staff" });
    expect(data.bookings[0].payments[0]).toMatchObject({ recipientType: "staff", handlerUserId: 12, calculatedCommission: 5 });
    expect(data.bookings[0].depositCollection).toMatchObject({ recipientType: "staff", handlerName: "موظف التحصيل", calculatedCommission: 2 });
  });

  it("connects master accounts, permitted staff recipients, and settlement reporting to booking payments", () => {
    const form = readFileSync("app/booking-form.tsx", "utf8");
    const management = readFileSync("app/payment-methods.tsx", "utf8");
    const members = readFileSync("app/user-management.tsx", "utf8");
    const reporting = readFileSync("lib/reporting.ts", "utf8");
    expect(form).toContain("CollectionRecipientSelector");
    expect(form).toContain("collectionRecipients");
    expect(form).toContain("calculatedCommission");
    expect(management).toContain("حسابات المالك الرئيسية");
    expect(management).toContain("defaultRecipientType");
    expect(members).toContain("allowDirectCollection");
    expect(members).toContain("commissionRate");
    expect(reporting).toContain("collectionSettlements");
    expect(reporting).toContain("netDueToOwner");
  });
});
