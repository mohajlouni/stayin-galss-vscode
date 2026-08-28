import { type Booking, type Chalet, type Expense, refundableDepositAmount, remainingRefundableDeposit, rentalTotal, totalDepositRefunded, totalPaid } from "./booking-model";

import { expenseAmountForChalet, type Payment, type PaymentRecipientType } from "./booking-model";

export type ReportRange = "today" | "month" | "all";
export const REPORT_PAYMENT_METHODS = ["cash-guardian", "cash-owner", "click"] as const;
export type ReportPaymentMethod = (typeof REPORT_PAYMENT_METHODS)[number];

export type ChaletPerformance = {
  chaletId: string;
  chaletName: string;
  color: string;
  bookingCount: number;
  revenue: number;
  expenses: number;
  netProfit: number;
};

export type FinancialReportSummary = {
  bookingCount: number;
  rentalTotal: number;
  paid: number;
  remaining: number;
  depositRecorded: number;
  depositRefunded: number;
  depositHeld: number;
  expenses: number;
  netProfit: number;
  paymentMethods: Record<ReportPaymentMethod, number>;
  depositCollectionMethods: Record<ReportPaymentMethod, number>;
  collectionSettlements: CollectionSettlement[];
  chaletPerformance: ChaletPerformance[];
};

export type CollectionSettlement = { key: string; recipientType: PaymentRecipientType; handlerUserId?: number; handlerName: string; fundsHeld: number; commission: number; netDueToOwner: number };

function collectionPaymentEvents(bookings: Booking[]): Payment[] {
  return bookings.flatMap((booking) => [
    ...booking.payments.filter((payment) => !payment.voidedAt),
    ...(booking.depositCollection && !booking.depositCollection.voidedAt ? [booking.depositCollection] : booking.depositAmount && booking.depositPaymentMethod ? [{ id: `legacy-deposit-${booking.id}`, amount: booking.depositAmount, date: booking.depositPaymentRecordedAt?.slice(0, 10) ?? booking.createdAt.slice(0, 10), paymentMethod: booking.depositPaymentMethod, recipientType: booking.depositPaymentMethod === "cash-guardian" ? "guard" as const : "owner" as const, handlerName: booking.depositPaymentMethod === "cash-guardian" ? "الحارس" : "حساب المالك الرئيسي" }] : []),
  ]);
}

function summarizeCollectionSettlements(bookings: Booking[]): CollectionSettlement[] {
  const groups = new Map<string, CollectionSettlement>();
  collectionPaymentEvents(bookings).forEach((payment) => {
    const recipientType = payment.recipientType ?? (payment.paymentMethod === "cash-guardian" ? "guard" : "owner");
    const handlerName = payment.handlerName || (recipientType === "owner" ? "حساب المالك الرئيسي" : recipientType === "guard" ? "الحارس" : "الموظف / الوسيط");
    const key = recipientType === "owner" ? "owner" : `${recipientType}-${payment.handlerUserId ?? handlerName}`;
    const existing = groups.get(key) ?? { key, recipientType, handlerUserId: payment.handlerUserId, handlerName, fundsHeld: 0, commission: 0, netDueToOwner: 0 };
    existing.fundsHeld += Math.max(0, Number(payment.amount || 0));
    existing.commission += recipientType === "owner" ? 0 : Math.max(0, Number(payment.calculatedCommission || 0));
    existing.netDueToOwner = recipientType === "owner" ? existing.fundsHeld : Math.max(0, existing.fundsHeld - existing.commission);
    groups.set(key, existing);
  });
  return [...groups.values()].sort((left, right) => right.fundsHeld - left.fundsHeld || left.handlerName.localeCompare(right.handlerName, "ar"));
}

export function selectReportBookings(bookings: Booking[], range: ReportRange, today: string, selectedChaletId?: string | null) {
  const month = today.slice(0, 7);
  return bookings.filter((booking) => booking.status !== "cancelled" && booking.status !== "waitlisted" && (!selectedChaletId || booking.chaletId === selectedChaletId) && (range === "today" ? booking.startDate === today : range === "month" ? booking.startDate.startsWith(month) : true));
}

export function selectReportExpenses(expenses: Expense[], range: ReportRange, today: string, selectedChaletId?: string | null) {
  const month = today.slice(0, 7);
  return expenses.filter((expense) => (range === "today" ? expense.date === today : range === "month" ? expense.date.startsWith(month) : true)).flatMap((expense) => {
    if (!selectedChaletId) return [expense];
    const amount = expenseAmountForChalet(expense, selectedChaletId);
    return amount > 0 ? [{ ...expense, chaletId: selectedChaletId, amount }] : [];
  });
}

export function summarizeFinancialReport(bookings: Booking[], chalets: Chalet[], expenses: Expense[] = []): FinancialReportSummary {
  const paymentMethods = REPORT_PAYMENT_METHODS.reduce<Record<ReportPaymentMethod, number>>((summary, method) => {
    summary[method] = bookings.reduce((sum, booking) => sum + booking.payments.filter((payment) => !payment.voidedAt && payment.paymentMethod === method).reduce((paymentSum, payment) => paymentSum + Math.max(0, Number(payment.amount || 0)), 0), 0);
    return summary;
  }, { "cash-guardian": 0, "cash-owner": 0, click: 0 });
  const depositCollectionMethods = REPORT_PAYMENT_METHODS.reduce<Record<ReportPaymentMethod, number>>((summary, method) => {
    summary[method] = bookings.reduce((sum, booking) => sum + (booking.depositPaymentMethod === method ? Math.max(0, Number(booking.depositAmount || 0)) : 0), 0);
    return summary;
  }, { "cash-guardian": 0, "cash-owner": 0, click: 0 });
  const totalExpenses = expenses.reduce((sum, expense) => sum + Math.max(0, Number(expense.amount || 0)), 0);

  const chaletPerformance = chalets.map((chalet) => {
    const chaletBookings = bookings.filter((booking) => booking.chaletId === chalet.id);
    const chaletRevenue = chaletBookings.reduce((sum, booking) => sum + rentalTotal(booking), 0);
    const chaletExpenses = expenses.reduce((sum, expense) => sum + expenseAmountForChalet(expense, chalet.id), 0);
    return { chaletId: chalet.id, chaletName: chalet.name, color: chalet.color, bookingCount: chaletBookings.length, revenue: chaletRevenue, expenses: chaletExpenses, netProfit: chaletRevenue - chaletExpenses };
  }).filter((chalet) => chalet.bookingCount > 0 || chalet.expenses > 0).sort((left, right) => right.netProfit - left.netProfit || right.revenue - left.revenue || right.bookingCount - left.bookingCount);

  const rentalTotalValue = bookings.reduce((sum, booking) => sum + rentalTotal(booking), 0);
  return {
    bookingCount: bookings.length,
    rentalTotal: rentalTotalValue,
    paid: bookings.reduce((sum, booking) => sum + totalPaid(booking), 0),
    remaining: bookings.reduce((sum, booking) => sum + Math.max(0, rentalTotal(booking) - totalPaid(booking)), 0),
    depositRecorded: bookings.reduce((sum, booking) => sum + refundableDepositAmount(booking), 0),
    depositRefunded: bookings.reduce((sum, booking) => sum + totalDepositRefunded(booking), 0),
    depositHeld: bookings.reduce((sum, booking) => sum + remainingRefundableDeposit(booking), 0),
    expenses: totalExpenses,
    netProfit: rentalTotalValue - totalExpenses,
    paymentMethods,
    depositCollectionMethods,
    collectionSettlements: summarizeCollectionSettlements(bookings),
    chaletPerformance,
  };
}
