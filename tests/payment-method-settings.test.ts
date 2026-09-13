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

  it("renders a fixed abstract method dropdown and cascades recipients per collection method", () => {
    const form = readFileSync("app/booking-form.tsx", "utf8");
    const model = readFileSync("lib/booking-model.ts", "utf8");
    const store = readFileSync("lib/booking-store.tsx", "utf8");
    const more = readFileSync("app/(tabs)/more.tsx", "utf8");
    const management = readFileSync("app/payment-methods.tsx", "utf8");
    expect(form).toContain("abstractPaymentMethodOptions(language)");
    expect(form).toContain("methodRecipients(initialPaymentMethod)");
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
    expect(more).toContain('route: "/payment-methods"');
    expect(management).toContain("إضافة صندوق عهدة وتحصيل (موظف / حارس)");
    expect(management).toContain("تعديل حساب الخزينة");
    expect(management).toContain("delete-outline");
    expect(management).toContain("الخزينة المركزية / المالك");
    expect(management).toContain("const active = item.isActive !== false");
    expect(management).toContain("✓ مفعّل وجاهز");
    expect(management).toContain("⚠️ بيانات غير مكتملة");
    expect(management).toContain("بانتظار الإعداد — يلزم إدخال الاسم المستعار والبنك");
    expect(management).toContain("isActive: item.isActive === false ? false : undefined");
    expect(management).toContain("⚠️ لا يمكن إتمام الحفظ — بيانات غير مكتملة");
    expect(management).toContain("✓ تم حفظ وتحديث طرق الدفع بنجاح");
    expect(management).toContain("✓ مكتمل ومفعّل");
    expect(management).toContain("⚠️ بانتظار استكمال البيانات");
    expect(management).toContain("channelTint");
    expect(management).toContain("rank(a.kind) - rank(b.kind)");
    expect(management).toContain("mergeOwnerVaults");
    expect(management).toContain("بيد المالك / كاش الخزينة المركزية");
    expect(management).toContain("rows.some((row) => row.isActive !== false)");
    expect(management).toContain("channelRowHead");
    expect(management).toContain("isChannelRowComplete(item.kind, item)");
    expect(management).toContain("الحد الأقصى للعهدة النقدية");
    expect(management).toContain("redFields.has");
    expect(management).toContain("scrollToFirstError");
    expect(management).toContain("⚠️ بدون معرف");
    expect(management).toContain("const isChannelComplete = (kind");
    expect(management).toContain("isChannelRowComplete");
    expect(management).toContain('(data.iban ?? "").trim().length >= 15');
    expect(management).toContain('Boolean((data.bankName ?? "").trim()) && (data.iban ?? "").trim().length >= 15');
    expect(management).toContain('isChannelComplete("cash", { label: row.label })');
    expect(management).toContain("⚠️ لا يمكن الحفظ — يجب تفعيل وإكمال بيانات طريقة دفع واحدة على الأقل");
    expect(management).toContain("must enable and complete at least one payment method");
    expect(management).toContain("collectMissingTokens");
    expect(management).toContain("missingRed");
    expect(management).toContain("hasCompleteActiveChannel");
    expect(management).toContain("channel:mandate");
    expect(management).toContain("يرجى إكمال بيانات الحساب عبر زر التعديل أولاً");
    expect(management).toContain("الظهور في قوالب الرسائل (واتساب)");
    expect(management).not.toContain("تضمين هذا الحساب في رسائل الواتساب وقوالب الحجز للعميل");
    expect(management).toContain("تعيين كافتراضي ★");
    expect(management).toContain("حسابات مسجلة");
    expect(management).toContain("معطّل");
    expect(management).toContain("ChannelSwitch");
    expect(management).toContain("isActive: complete ? undefined : false");
    expect(management).toContain("⚠️ لا يمكن الحفظ — يرجى إدخال اسم المستلم ورقم الهاتف");
    expect(management).toContain("اسم نقطة التحصيل");
    expect(management).toContain("#F43F5E");
    expect(management).toContain("#10B981");
    expect(management).toContain("#334155");
    expect(management).toContain("activeFloatCount");
    expect(management).toContain("c.isActive !== false");
    const auditModule = readFileSync("lib/payment-audit.ts", "utf8");
    expect(management).toContain("سجل تعديلات الحسابات 📋");
    expect(management).toContain("appendPaymentMethodAudit");
    expect(management).toContain("loadPaymentMethodAudit");
    expect(management).toContain("type PaymentMethodAuditAction");
    expect(auditModule).toContain("إضافة حساب جديد");
    expect(auditModule).toContain("تفعيل قناة");
    expect(auditModule).toContain("تعطيل قناة");
    expect(auditModule).toContain("تغيير الحساب الافتراضي");
    expect(auditModule).toContain("@stayin_payment_methods_audit");
    expect(management).toContain("تعيين الحساب كافتراضي لطريقة");
    expect(management).toContain("إيقاف التفعيل في قوالب الواتساب");
    expect(management).toContain("نوع الحركة");
    expect(management).toContain("القناة والحساب");
    expect(management).toContain("القائم بالعملية");
    expect(management).toContain("التاريخ والوقت");
    expect(management).toContain("لا يمكن تعيينه افتراضيًا — يجب تفعيل الحساب وإكمال بياناته أولًا");
    expect(management).toContain("حذف الحساب");
    expect(management).toContain("setEditingAccountId(account.id)");
    expect(management).toContain("existingIds.has(item.id) ? item.id : createOwnerAccountId()");
    expect(management).not.toContain("ownerFlags");
    expect(management).not.toContain("floatDraft.whatsApp");
    expect(management).not.toContain("ownerFlags.whatsApp");
    expect(management).not.toContain("disabled={lockedEdit}");
    expect(management).toContain("accessibilityState={{ checked: item.whatsApp, disabled: !active }}");
    expect(management).toContain("whatsApp: false");
    expect(management).toContain("يجب تفعيل الحساب أولاً لتضمينه في الرسائل");
    expect(management).toContain("✓ تم إرجاع الحساب الافتراضي إلى حساب المالك الأساسي");
    expect(management).toContain("siblings(\"vault\")");
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
    expect(management).toContain("حساب الاستلام الافتراضي");
    expect(members).toContain("allowDirectCollection");
    expect(members).toContain("commissionRate");
    expect(reporting).toContain("collectionSettlements");
    expect(reporting).toContain("netDueToOwner");
  });
});
