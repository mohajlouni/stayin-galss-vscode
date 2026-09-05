import { type Booking, type Chalet, type Expense, refundableDepositAmount, remainingRefundableDeposit, rentalTotal, totalDepositRefunded, totalPaid } from "./booking-model";

import { expenseAmountForChalet, type Payment, type PaymentRecipientType } from "./booking-model";

import { type AppData, type StaffFloatAccount, DEFAULT_SETTINGS, staffFloatAccounts, staffFloatOutstanding, staffFloatPaidOutTotal, staffFloatSettledTotal, staffFloatCollectedTotal } from "./booking-model";

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
  /** إجمالي خصومات الأضرار/الغرامات من التأمين (إيرادات تعويضات). */
  compensationRevenue: number;
  /** ما استُلم مباشرة في إيرادات الخزينة العامة للمنشأة (owner/member). */
  ownerDirectReceived: number;
  /** ما استُلم على ذمة موظف (عهدة) لحين التوريد. */
  staffFloatCollected: number;
  /* كشوف عهد الموظفين (كل ما لم يُسلّم للخزينة العامة). */
  staffFloatStatements: StaffFloatStatement[];
  /* بند خصوم الأضرار التفصيلي. */
  depositCompensations: DepositCompensationRow[];
  expenses: number;
  netProfit: number;
  paymentMethods: Record<ReportPaymentMethod, number>;
  depositCollectionMethods: Record<ReportPaymentMethod, number>;
  collectionSettlements: CollectionSettlement[];
  chaletPerformance: ChaletPerformance[];
};

export type CollectionSettlement = { key: string; recipientType: PaymentRecipientType; handlerUserId?: number; handlerName: string; fundsHeld: number; commission: number; netDueToOwner: number };

/** إيرادات تعويضات مخصومة من تأمين الحجوزات (أضرار/غرامات) — بند مستقل عن الإيجار. */
export type DepositCompensationRow = { bookingId: string; customerName: string; chaletName?: string; amount: number; date: string; note?: string; sourceFloatId?: string };

/** كشف حساب عهدة موظف: ما استلمه، وما خرج منه، وما سُوّي للمالك، وما تبقى عليه. */
export type StaffFloatStatement = {
  float: StaffFloatAccount;
  collectedTotal: number;
  paidOutTotal: number;
  settledTotal: number;
  outstanding: number;
  settlements: { id: string; amount: number; settledAt: string; note?: string; settledByName?: string }[];
};

function collectionPaymentEvents(bookings: Booking[]): Payment[] {
  // Rental payments only. Refundable security deposits are held for the guest
  // and returned on checkout, so they must never inflate funds held by the
  // owner (netDueToOwner) — excluding them also removes refunded deposits.
  return bookings.flatMap((booking) => booking.payments.filter((payment) => !payment.voidedAt));
}

/** مستلم عبر حساب المالك المباشر (owner أو member) — البداية لمالك الجزء الأول. */
function ownerDirectReceived(bookings: Booking[]): number {
  let total = 0;
  for (const booking of bookings) {
    for (const payment of booking.payments) {
      if (!payment.voidedAt && (payment.recipientTargetId === "owner" || typeof payment.recipientTargetId === "string" && payment.recipientTargetId.startsWith("member-"))) total += Math.max(0, Number(payment.amount || 0));
    }
    const deposit = booking.depositCollection;
    if (deposit && !deposit.voidedAt && deposit.recipientTargetId === "owner") total += Math.max(0, Number(deposit.amount || 0));
  }
  return Math.round(total * 100) / 100;
}

export function depositCompensationRows(bookings: Booking[]): DepositCompensationRow[] {
  return bookings.flatMap((booking) => {
    const compensation = booking.depositCompensation;
    if (!compensation || !(Number(compensation.amount) > 0)) return [];
    return [{ bookingId: booking.id, customerName: booking.customerName, chaletName: booking.chaletName, amount: Math.max(0, Number(compensation.amount)), date: compensation.date, note: compensation.note, sourceFloatId: compensation.sourceFloatId } satisfies DepositCompensationRow];
  }).sort((left, right) => right.date.localeCompare(left.date));
}

export function staffFloatStatements(data: Pick<AppData, "bookings" | "staffFloatSettlements" | "settings">): StaffFloatStatement[] {
  return staffFloatAccounts(data.settings).map((account) => {
    const settlements = (data.staffFloatSettlements ?? []).filter((entry) => entry.floatId === account.id).map((entry) => ({ id: entry.id, amount: entry.amount, settledAt: entry.settledAt, note: entry.note, settledByName: entry.settledByName })).sort((left, right) => right.settledAt.localeCompare(left.settledAt));
    return {
      float: account,
      collectedTotal: staffFloatCollectedTotal(data, account.id),
      paidOutTotal: staffFloatPaidOutTotal(data, account.id),
      settledTotal: staffFloatSettledTotal(data, account.id),
      outstanding: staffFloatOutstanding(data, account.id),
      settlements,
    };
  }).filter((statement) => statement.collectedTotal > 0 || statement.settledTotal > 0 || statement.outstanding > 0 || statement.float.isActive);
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

export function summarizeFinancialReport(bookings: Booking[], chalets: Chalet[], expenses: Expense[] = [], extra: { settlements?: AppData["staffFloatSettlements"]; settings?: AppData["settings"] } = {}): FinancialReportSummary {
  const paymentMethods = REPORT_PAYMENT_METHODS.reduce<Record<ReportPaymentMethod, number>>((summary, method) => {
    summary[method] = bookings.reduce((sum, booking) => sum + booking.payments.filter((payment) => !payment.voidedAt && payment.paymentMethod === method).reduce((paymentSum, payment) => paymentSum + Math.max(0, Number(payment.amount || 0)), 0), 0);
    return summary;
  }, { "cash-guardian": 0, "cash-owner": 0, click: 0 });
  const depositCollectionMethods = REPORT_PAYMENT_METHODS.reduce<Record<ReportPaymentMethod, number>>((summary, method) => {
    summary[method] = bookings.reduce((sum, booking) => {
      const liveCollection = booking.depositCollection && !booking.depositCollection.voidedAt && Number(booking.depositCollection.amount) > 0 ? booking.depositCollection : undefined;
      if (liveCollection?.paymentMethod === method) return sum + Math.max(0, Number(liveCollection.amount || 0));
      // Legacy check-in collection: recorded at check-in but before structured
      // depositCollection tracking existed. Only counts when actually received.
      if (!liveCollection && booking.depositPaymentRecordedAt && booking.depositPaymentMethod === method) return sum + Math.max(0, Number(booking.depositAmount || 0));
      return sum;
    }, 0);
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
  const compensations = depositCompensationRows(bookings);
  const compensationRevenue = compensations.reduce((sum, row) => sum + row.amount, 0);
  const ownerReceived = ownerDirectReceived(bookings);
  const statements = staffFloatStatements({ bookings, staffFloatSettlements: extra.settlements ?? [], settings: extra.settings ?? DEFAULT_SETTINGS });
  const staffFloatCollected = statements.reduce((sum, statement) => sum + statement.collectedTotal, 0);
  return {
    bookingCount: bookings.length,
    rentalTotal: rentalTotalValue,
    paid: bookings.reduce((sum, booking) => sum + totalPaid(booking), 0),
    remaining: bookings.reduce((sum, booking) => sum + Math.max(0, rentalTotal(booking) - totalPaid(booking)), 0),
    depositRecorded: bookings.reduce((sum, booking) => sum + refundableDepositAmount(booking), 0),
    depositRefunded: bookings.reduce((sum, booking) => sum + totalDepositRefunded(booking), 0),
    depositHeld: bookings.reduce((sum, booking) => sum + remainingRefundableDeposit(booking), 0),
    compensationRevenue,
    ownerDirectReceived: ownerReceived,
    staffFloatCollected,
    staffFloatStatements: statements,
    depositCompensations: compensations,
    expenses: totalExpenses,
    netProfit: rentalTotalValue - totalExpenses,
    paymentMethods,
    depositCollectionMethods,
    collectionSettlements: summarizeCollectionSettlements(bookings),
    chaletPerformance,
  };
}
