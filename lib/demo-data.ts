import { AppData, Booking, Chalet, Customer, Expense, Settings } from "./booking-model";

export const DEMO_WORKSPACE_ID = "demo-preview";

function isoDaysAgo(days: number, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function buildDemoAppData(userName?: string): AppData {
  const now = new Date().toISOString();
  const operator = userName?.trim() || "زيّان المعمّري";

  const chalets: Chalet[] = [
    { id: "demo-chalet-1", name: "شاليه نخيل ١", propertyType: "chalet", referenceCode: "CH-100", color: "#0F8B83", location: "البحر الميت، الأردن", guardianName: "أبو أديب", guardianPhone: "0791234567", contactPhone: "0791234567", nearWater: true, hasHeatedPool: false, weekendDays: [5, 6], createdAt: isoDaysAgo(90) },
    { id: "demo-chalet-2", name: "مزرعة الهدى", propertyType: "farm", referenceCode: "FA-200", color: "#4D7C0F", location: "جرش، الأردن", guardianName: "أبو يوسف", guardianPhone: "0787654321", contactPhone: "0787654321", hasHeatedPool: true, weekendDays: [5, 6], createdAt: isoDaysAgo(60) },
  ];

  const customers: Customer[] = [
    { id: "demo-cust-1", name: "أحمد الحجايا", phone: "0791111111", e164: "962791111111", totalBookingsCount: 2, totalSpent: 190, isBlacklisted: false, createdAt: isoDaysAgo(30), lastBookingDate: dateDaysAgo(2) },
    { id: "demo-cust-2", name: "هدى النوايسة", phone: "0772222222", e164: "962772222222", totalBookingsCount: 1, totalSpent: 220, isBlacklisted: false, createdAt: isoDaysAgo(12), lastBookingDate: dateDaysAgo(2) },
    { id: "demo-cust-3", name: "معاذ الطراونة", phone: "0783333333", e164: "962783333333", totalBookingsCount: 1, totalSpent: 120, isBlacklisted: false, createdAt: isoDaysAgo(5), lastBookingDate: dateDaysAgo(4) },
  ];

  const bookings: Booking[] = [
    {
      id: "demo-booking-1", bookingReference: "ST-1042", customerName: "أحمد الحجايا", phone: "0791111111",
      chaletId: "demo-chalet-1", chaletName: "شاليه نخيل ١", startDate: dateDaysAgo(6), endDate: dateDaysAgo(6),
      bookingType: "24h", shiftName: "24 ساعة", startTime: "09:00", endTime: "09:00", price: 180,
      discountAmount: 0, depositAmount: 50, depositPaymentMethod: "cash-owner", payments: [
        { id: "demo-pay-1", amount: 50, date: dateDaysAgo(6), recordedAt: isoDaysAgo(6), note: "دفعة تأمين", paymentMethod: "cash-owner" },
        { id: "demo-pay-2", amount: 130, date: dateDaysAgo(6), recordedAt: isoDaysAgo(6, 11), note: "المتبقي من الإيجار", paymentMethod: "click" },
      ],
      notes: "عائلة حاجزة باليوم الكامل.",
      status: "completed", createdAt: isoDaysAgo(8), checkedInAt: isoDaysAgo(6, 9), checkedOutAt: isoDaysAgo(5, 10),
      createdByRole: "owner", createdByName: operator, bookingSource: "manual_host",
    },
    {
      id: "demo-booking-2", bookingReference: "ST-1087", customerName: "هدى النوايسة", phone: "0772222222",
      chaletId: "demo-chalet-2", chaletName: "مزرعة الهدى", startDate: dateDaysAgo(2), endDate: dateDaysAgo(2),
      bookingType: "evening", shiftName: "سهرة", startTime: "22:00", endTime: "09:00", price: 95,
      discountAmount: 0, depositAmount: 30, depositPaymentMethod: "click", payments: [
        { id: "demo-pay-3", amount: 95, date: dateDaysAgo(2), recordedAt: isoDaysAgo(2, 9), note: "دفعة كاملة", paymentMethod: "click" },
      ],
      notes: "",
      status: "completed", createdAt: isoDaysAgo(4), checkedInAt: isoDaysAgo(2, 22), checkedOutAt: isoDaysAgo(1, 9),
      createdByRole: "owner", createdByName: operator, bookingSource: "manual_host",
    },
    {
      id: "demo-booking-3", bookingReference: "ST-1113", customerName: "معاذ الطراونة", phone: "0783333333",
      chaletId: "demo-chalet-1", chaletName: "شاليه نخيل ١", startDate: dateDaysAgo(1), endDate: dateDaysAgo(1),
      bookingType: "morning", shiftName: "صباحي", startTime: "09:00", endTime: "21:00", price: 120,
      discountAmount: 0, depositAmount: 40, depositPaymentMethod: "cash-guardian", payments: [
        { id: "demo-pay-4", amount: 40, date: dateDaysAgo(1), recordedAt: isoDaysAgo(1, 9), note: "عربون", paymentMethod: "cash-guardian" },
      ],
      notes: "حجز قادم لم يتم تسجيل الوصول بعد.",
      status: "awaiting-deposit", createdAt: isoDaysAgo(3),
      createdByRole: "owner", createdByName: operator, bookingSource: "manual_host",
    },
    {
      id: "demo-booking-4", bookingReference: "ST-1130", customerName: "سعد الخوالدة", phone: "0794444444",
      chaletId: "demo-chalet-2", chaletName: "مزرعة الهدى", startDate: dateDaysAgo(0), endDate: dateDaysAgo(0),
      bookingType: "evening", shiftName: "سهرة", startTime: "22:00", endTime: "09:00", price: 95,
      discountAmount: 0, depositAmount: 30, payments: [],
      notes: "",
      status: "confirmed", createdAt: isoDaysAgo(1),
      createdByRole: "owner", createdByName: operator, bookingSource: "manual_host",
    },
  ];

  const expenses: Expense[] = [
    { id: "demo-exp-1", chaletId: "demo-chalet-1", chaletName: "شاليه نخيل ١", amount: 60, date: dateDaysAgo(3), category: "cleaning-supplies", note: "لوازم تنظيف", paymentMethod: "cash", createdAt: isoDaysAgo(3), createdByName: operator },
    { id: "demo-exp-2", chaletId: "demo-chalet-2", chaletName: "مزرعة الهدى", amount: 120, date: dateDaysAgo(2), category: "maintenance", note: "صيانة المسبح", paymentMethod: "click", createdAt: isoDaysAgo(2), createdByName: operator },
  ];

  const settings: Settings = {
    businessName: "تجربة StayIn — منشأة استعراضية",
    businessPhone: "0790000000",
    currency: "د.أ",
    weekendDays: [5, 6],
    bookingTypes: {
      morning: { label: "صباحي", startTime: "09:00", endTime: "21:00" },
      evening: { label: "سهرة", startTime: "22:00", endTime: "09:00" },
      "24h": { label: "24 ساعة", startTime: "09:00", endTime: "09:00" },
      custom: { label: "فترة مخصصة", startTime: "09:00", endTime: "17:00" },
      "multi-day": { label: "عدة أيام", startTime: "09:00", endTime: "21:00" },
    },
  };

  return {
    bookings,
    waitlist: [
      {
        id: "demo-wl-1", customerName: "لينا عبيدات", phone: "0795555555", chaletId: "demo-chalet-1", chaletName: "شاليه نخيل ١",
        requestedDate: dateDaysAgo(-3), endDate: dateDaysAgo(-3), bookingType: "24h", shiftName: "24 ساعة", startTime: "09:00", endTime: "09:00",
        price: 180, depositAmount: 0, notes: "متابعة طلب الانتظار.", status: "active", createdAt: isoDaysAgo(1),
      },
    ],
    turnoverTasks: [
      { id: "demo-turnover-1", checkoutBookingId: "demo-booking-2", nextBookingId: "demo-booking-4", chaletId: "demo-chalet-2", chaletName: "مزرعة الهدى", dueAt: isoDaysAgo(1, 10), status: "in-progress", createdAt: isoDaysAgo(1), startedAt: isoDaysAgo(1, 9) },
    ],
    expenses,
    chalets,
    settings,
    specialPriceRules: [],
    auditLog: [
      { id: "demo-audit-1", action: "booking-checked-out", subjectName: "أحمد الحجايا", details: "شاليه نخيل ١ · تم إنهاء الإقامة بعد فحص الشاليه", createdAt: isoDaysAgo(5, 10), actorName: operator, bookingId: "demo-booking-1" },
      { id: "demo-audit-2", action: "booking-checked-in", subjectName: "هدى النوايسة", details: "مزرعة الهدى · تم تسجيل الوصول", createdAt: isoDaysAgo(2, 22), actorName: operator, bookingId: "demo-booking-2" },
    ],
    customers,
    contracts: [],
    assets: [
      { id: "demo-asset-1", chaletId: "demo-chalet-1", chaletName: "شاليه نخيل ١", name: "مكيف مركزي", category: "أجهزة", condition: "good", purchaseCost: 900, createdAt: isoDaysAgo(80) },
      { id: "demo-asset-2", chaletId: "demo-chalet-2", chaletName: "مزرعة الهدى", name: "بويلر المسبح", category: "مسبح", condition: "needs_service", purchaseCost: 450, createdAt: isoDaysAgo(50) },
    ],
    maintenanceTasks: [
      { id: "demo-maint-1", chaletId: "demo-chalet-2", chaletName: "مزرعة الهدى", assetId: "demo-asset-2", assetName: "بويلر المسبح", title: "فحص بويلر المسبح", frequency: "monthly", nextDueDate: dateDaysAgo(5), status: "pending", cost: 50, createdAt: isoDaysAgo(10) },
    ],
    notifications: [
      { id: "demo-notif-1", recipients: ["owner", "manager"], type: "new_booking", title: "حجز جديد", body: `تم استلام حجز جديد من سعد الخوالدة في مزرعة الهدى (ST-1130).`, isRead: false, createdAt: isoDaysAgo(1), dataPayload: { bookingId: "demo-booking-4" } },
    ],
    weatherLogs: [],
    utilityReadings: [],
    loyaltyAccounts: [],
    loyaltyTransactions: [],
  };
}
