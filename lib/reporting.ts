import { type Booking, type Chalet, type Expense, refundableDepositAmount, remainingRefundableDeposit, rentalTotal, totalDepositRefunded, totalPaid } from "./booking-model";

import { expenseAmountForChalet, ledgerPaymentMethod, type Payment, type PaymentMethod, type PaymentRecipientType } from "./booking-model";

import { type AppData, type FloatSettlementStatus, type StaffFloatAccount, type StaffFloatSettlement, DEFAULT_SETTINGS, staffFloatAccounts, staffFloatOutstanding, staffFloatPaidOutTotal, staffFloatSettledTotal, staffFloatCollectedTotal, staffFloatReimbursementTotal, staffFloatReimbursementPaidTotal, staffFloatCommissionEarned } from "./booking-model";

export type ReportRange = "today" | "month" | "all";
export const REPORT_PAYMENT_METHODS = ["cash-guardian", "cash-owner", "click"] as const;
export type ReportPaymentMethod = (typeof REPORT_PAYMENT_METHODS)[number];

/** يربط طريقة الدفع (جديدة مجردة أو قديمة) بسلة التقرير الثابتة، مع مراعاة العهدة. */
export function reportPaymentMethodBucket(method: PaymentMethod | undefined, isCustody?: boolean): ReportPaymentMethod | undefined {
  if (!method) return undefined;
  if (method === "cash-guardian") return "cash-guardian";
  if (method === "cash-owner") return "cash-owner";
  if (method === "click") return "click";
  const ledger = ledgerPaymentMethod(method);
  if (ledger === "CLIQ") return "click";
  if (ledger === "CASH") return isCustody === true ? "cash-guardian" : "cash-owner";
  return undefined;
}

function emptyMethodTotals(): Record<ReportPaymentMethod, number> { return { "cash-guardian": 0, "cash-owner": 0, click: 0 }; }
function collectMethodTotals(events: { paymentMethod?: PaymentMethod; isCustody?: boolean; voidedAt?: string; amount?: number }[]): Record<ReportPaymentMethod, number> {
  const totals = emptyMethodTotals();
  for (const event of events) {
    if (event.voidedAt) continue;
    const bucket = reportPaymentMethodBucket(event.paymentMethod, event.isCustody);
    if (bucket) totals[bucket] += Math.max(0, Number(event.amount || 0));
  }
  return totals;
}

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
  /** إجمالي ذمم المالك للموظفين عند صرف مصروفات من جيوبهم الخاصة. */
  staffReimbursementDue: number;
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
  /** عمولات الموظف المستحقة على تحصيلات العهدة (تُخصم من صافي التوريد). */
  commissionEarned: number;
  /** ذمة المالك للموظف: مصروفات دفعها الموظف من جيبه الخاص ولم تُردّ بعد. */
  reimbursementDue: number;
  /** إجمالي التعويضات المصروفة للموظف حتى الآن (تصفية ذمم سابقة). */
  reimbursementPaid: number;
  settlements: { id: string; amount: number; settledAt: string; settlementDate?: string; recipientAccountLabel?: string; channel?: "vault" | "cliq" | "bank"; note?: string; settledByName?: string; status?: FloatSettlementStatus }[];
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

export function staffFloatStatements(data: Pick<AppData, "bookings" | "staffFloatSettlements" | "settings" | "expenses">): StaffFloatStatement[] {
  return staffFloatAccounts(data.settings).map((account) => {
    const settlements = (data.staffFloatSettlements ?? []).filter((entry) => entry.floatId === account.id && entry.status !== "PENDING_APPROVAL" && entry.status !== "REJECTED").map((entry) => ({ id: entry.id, amount: entry.amount, settledAt: entry.settledAt, settlementDate: entry.settlementDate, recipientAccountLabel: entry.recipientAccountLabel, channel: entry.channel, note: entry.note, settledByName: entry.settledByName, status: entry.status })).sort((left, right) => right.settledAt.localeCompare(left.settledAt));
    return {
      float: account,
      collectedTotal: staffFloatCollectedTotal(data, account.id),
      paidOutTotal: staffFloatPaidOutTotal(data, account.id),
      settledTotal: staffFloatSettledTotal(data, account.id),
      outstanding: staffFloatOutstanding(data, account.id),
      commissionEarned: staffFloatCommissionEarned(data, account.id),
      reimbursementDue: staffFloatReimbursementTotal(data, account.id),
      reimbursementPaid: staffFloatReimbursementPaidTotal(data, account.id),
      settlements,
    };
  }).filter((statement) => statement.collectedTotal > 0 || statement.settledTotal > 0 || statement.outstanding > 0 || statement.reimbursementDue > 0 || statement.float.isActive);
}

/** عزل الموظف: يُرجع فقط كشوف العُهد المرتبطة بمعرّف المستخدم نفسه (memberUserId) ولا يجلب عُهد الموظفين الآخرين أبدًا. */
export function staffFloatStatementsForUser(data: Pick<AppData, "bookings" | "staffFloatSettlements" | "settings" | "expenses">, userId: number | undefined): StaffFloatStatement[] {
  if (!Number.isInteger(userId) || !userId) return [];
  return staffFloatStatements(data).filter((statement) => statement.float.memberUserId === userId);
}

/** نوع حركة في كشف حساب الموظف الشخصي (سجل حركات العهدة المستقّل). */
export type StaffFloatLedgerEntryKind = "rental-collected" | "deposit-collected" | "float-expense" | "settled-transfer";

/** سطر فردي في كشف الحساب مع رصيد جارٍ تراكمي يعادل الذمة الفعلية. */
export type StaffFloatLedgerEntry = {
  id: string;
  kind: StaffFloatLedgerEntryKind;
  /** تاريخ الفرز (YYYY-MM-DD) لعرضه في السجل. */
  date: string;
  /** طابع زمني دقيق لترتيب الحركات كرونولوجيًا. */
  at: string;
  label: string;
  /** موجب (+) إلى العهدة أو سالب (-) خرج منها. */
  amount: number;
  /** الرصيد الجاري بعد هذه الحركة. */
  runningBalance: number;
};

/** كشف حساب عهدة صدام/أحمد: تحصيل إيجار (+)، تأمين بحوزته (+)، مصروفات عهدة (-)، توريدات مؤكدة للمالك (-) — بترتيب كرونولوجي ورصيد جارٍ. */
export function staffFloatLedgerForFloat(data: Pick<AppData, "bookings" | "staffFloatSettlements" | "settings" | "expenses">, floatId: string | undefined): { float: StaffFloatAccount | undefined; entries: StaffFloatLedgerEntry[]; netBalance: number } {
  if (!floatId) return { float: undefined, entries: [], netBalance: 0 };
  const float = staffFloatAccounts(data.settings).find((account) => account.id === floatId);
  if (!float) return { float: undefined, entries: [], netBalance: 0 };
  const target = `float-${floatId}`;
  const entries: Array<Omit<StaffFloatLedgerEntry, "runningBalance">> = [];
  for (const booking of data.bookings ?? []) {
    for (const payment of booking.payments ?? []) {
      if (payment.voidedAt || payment.recipientTargetId !== target) continue;
      const amount = Math.max(0, Number(payment.amount || 0));
      if (amount <= 0) continue;
      entries.push({ id: payment.id, kind: "rental-collected", date: payment.date, at: payment.recordedAt ?? booking.createdAt ?? payment.date, label: `${booking.customerName}${booking.chaletName ? ` · ${booking.chaletName}` : ""}`, amount });
    }
    const deposit = booking.depositCollection;
    if (deposit && !deposit.voidedAt && deposit.recipientTargetId === target) {
      const amount = Math.max(0, Number(deposit.amount || 0));
      if (amount > 0) entries.push({ id: deposit.id ?? `deposit-${booking.id}`, kind: "deposit-collected", date: deposit.date, at: deposit.recordedAt ?? booking.createdAt ?? deposit.date, label: `${booking.customerName}${booking.chaletName ? ` · ${booking.chaletName}` : ""}`, amount });
    }
  }
  for (const expense of data.expenses ?? []) {
    if (expense.isFloatExpense !== true || expense.fundingSourceId !== floatId) continue;
    const amount = Math.max(0, Number(expense.amount || 0));
    if (amount <= 0) continue;
    entries.push({ id: expense.id, kind: "float-expense", date: expense.date, at: expense.createdAt ?? expense.date, label: expense.note ?? expense.category, amount: -amount });
  }
  for (const settlement of data.staffFloatSettlements ?? []) {
    if (settlement.floatId !== floatId || settlement.status === "PENDING_APPROVAL" || settlement.status === "REJECTED") continue;
    const amount = Math.max(0, Number(settlement.amount || 0));
    if (amount <= 0) continue;
    entries.push({ id: settlement.id, kind: "settled-transfer", date: settlement.settlementDate ?? settlement.settledAt.slice(0, 10), at: settlement.settledAt, label: settlement.recipientAccountLabel ?? "الخزينة المركزية", amount: -amount });
  }
  entries.sort((left, right) => left.at.localeCompare(right.at) || left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  let running = 0;
  const ledgerEntries: StaffFloatLedgerEntry[] = entries.map((entry) => {
    const runningBalance = Math.round((running += entry.amount) * 100) / 100;
    return { ...entry, runningBalance } satisfies StaffFloatLedgerEntry;
  });
  const netBalance = ledgerEntries.length ? ledgerEntries[ledgerEntries.length - 1].runningBalance : 0;
  return { float, entries: ledgerEntries, netBalance: Math.round(netBalance * 100) / 100 };
}

/** كشف حساب الموظف الشخصي (مستعار): يردّد عهدة المستخدم ذاتها عبر معرّف العهدة المرتبطة بعضوّيته. */
export function staffFloatLedgerForUser(data: Pick<AppData, "bookings" | "staffFloatSettlements" | "settings" | "expenses">, userId: number | undefined): { float: StaffFloatAccount | undefined; entries: StaffFloatLedgerEntry[]; netBalance: number } {
  if (!Number.isInteger(userId) || !userId) return { float: undefined, entries: [], netBalance: 0 };
  const float = staffFloatAccounts(data.settings).find((account) => account.memberUserId === userId);
  if (!float) return { float: undefined, entries: [], netBalance: 0 };
  return staffFloatLedgerForFloat(data, float.id);
}

/** تسميات أنواع حركات كشف العهدة المشتركة بين الشاشات وكشف PDF. */
export const FLOAT_LEDGER_KIND_LABELS: Record<StaffFloatLedgerEntryKind, { ar: string; en: string }> = {
  "rental-collected": { ar: "تحصيل إيجار", en: "Rental collected" },
  "deposit-collected": { ar: "تأمين بحوزته", en: "Deposit held in hand" },
  "float-expense": { ar: "مصروف من العهدة", en: "Float expense receipt" },
  "settled-transfer": { ar: "توريد مؤكد للمالك", en: "Approved transfer to owner" },
};

/** نطاق فترة زمنية لكشف العهدة (تواريخ YYYY-MM-DD شاملة الطرفين). */
export type LedgerPeriodRange = { start: string; end: string };

/** مؤشرات مالية لكشف عهدة ضمن فترة زمنية مع رصيد افتتاحي دقيق. */
export type LedgerPeriodMetrics = {
  openingBalance: number;
  closingBalance: number;
  collected: number;
  expenses: number;
  handedOver: number;
  entries: StaffFloatLedgerEntry[];
};

/** يصفّي كشف العهدة ضمن فترة (أو الكل) ويرصد المؤشرات: المحصل، المصروفات، المورَّد، والرصيد الجاري الفعلي عبر كل الفترات. */
export function staffFloatLedgerForPeriod(data: Pick<AppData, "bookings" | "staffFloatSettlements" | "settings" | "expenses">, floatId: string | undefined, range: LedgerPeriodRange | null): LedgerPeriodMetrics {
  const full = staffFloatLedgerForFloat(data, floatId);
  const round = (value: number) => Math.round(value * 100) / 100;
  if (!full.float || !range) {
    return {
      openingBalance: 0,
      closingBalance: full.netBalance,
      collected: full.entries.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0),
      expenses: full.entries.filter((entry) => entry.kind === "float-expense").reduce((sum, entry) => sum + Math.abs(entry.amount), 0),
      handedOver: full.entries.filter((entry) => entry.kind === "settled-transfer").reduce((sum, entry) => sum + Math.abs(entry.amount), 0),
      entries: full.entries,
    };
  }
  const within = full.entries.filter((entry) => entry.date >= range.start && entry.date <= range.end);
  const prior = full.entries.filter((entry) => entry.date < range.start);
  const openingBalance = prior.length ? prior[prior.length - 1].runningBalance : 0;
  const closingBalance = within.length ? within[within.length - 1].runningBalance : openingBalance;
  const collected = within.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const expenses = within.filter((entry) => entry.kind === "float-expense").reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
  const handedOver = within.filter((entry) => entry.kind === "settled-transfer").reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
  return { openingBalance: round(openingBalance), closingBalance: round(closingBalance), collected: round(collected), expenses: round(expenses), handedOver: round(handedOver), entries: within };
}

/** حجز مغلق (حجوزات وتأمينات) ضُمَّ إلى سند توريد في الأرشيف. */
export type SettlementArchiveBooking = { bookingId: string; customerName: string; date: string; amount: number };

/** مصروف عهدة ضُمَّ إلى سند توريد في الأرشيف. */
export type SettlementArchiveExpense = { expenseId: string; note?: string; category: string; amount: number };

/** سطر في أرشيف سجل التسويات العامة: سند التوريد + بيانات الموظف + الحجوزات والمصروفات المشمولة. */
export type SettlementArchiveEntry = {
  settlement: StaffFloatSettlement;
  floatId: string;
  floatLabel: string;
  memberName?: string;
  staffUserId?: number;
  bookings: SettlementArchiveBooking[];
  expenses: SettlementArchiveExpense[];
};

/** يبني سجل أرشيف التسويات العامة (كاشف لكل الموظفين) بالحجوزات المغلقة والمصروفات المشمولة في كل سند توريد. */
export function settlementArchiveEntries(data: Pick<AppData, "bookings" | "staffFloatSettlements" | "settings" | "expenses">): SettlementArchiveEntry[] {
  const floatById = new Map(staffFloatAccounts(data.settings).map((account) => [account.id, account]));
  const paymentById = new Map<string, SettlementArchiveBooking>();
  for (const booking of data.bookings ?? []) {
    for (const payment of booking.payments ?? []) {
      if (payment.voidedAt) continue;
      paymentById.set(payment.id, { bookingId: booking.id, customerName: booking.customerName, date: booking.startDate, amount: Math.max(0, Number(payment.amount || 0)) });
    }
    const deposit = booking.depositCollection;
    if (deposit && !deposit.voidedAt) paymentById.set(deposit.id ?? `deposit-${booking.id}`, { bookingId: booking.id, customerName: booking.customerName, date: booking.startDate, amount: Math.max(0, Number(deposit.amount || 0)) });
  }
  const expenseById = new Map((data.expenses ?? []).map((expense) => [expense.id, expense]));
  return (data.staffFloatSettlements ?? []).map((settlement) => {
    const float = floatById.get(settlement.floatId);
    const bookings = (settlement.coveredPaymentIds ?? []).flatMap((id) => {
      const row = paymentById.get(id);
      return row ? [{ ...row }] : [];
    });
    const expenses = (settlement.coveredExpenseIds ?? []).flatMap((id) => {
      const expense = expenseById.get(id);
      return expense ? [{ expenseId: id, note: expense.note, category: expense.category, amount: Math.max(0, Number(expense.amount || 0)) }] : [];
    });
    return { settlement, floatId: settlement.floatId, floatLabel: float?.label ?? settlement.floatId, memberName: float?.memberName, staffUserId: float?.memberUserId, bookings, expenses };
  }).sort((left, right) => right.settlement.settledAt.localeCompare(left.settlement.settledAt));
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
  const paymentMethods = collectMethodTotals(bookings.flatMap((booking) => booking.payments));
  const depositCollectionMethods = collectMethodTotals(bookings.flatMap((booking) => {
    const liveCollection = booking.depositCollection && !booking.depositCollection.voidedAt && Number(booking.depositCollection.amount) > 0 ? booking.depositCollection : undefined;
    if (liveCollection) return [{ paymentMethod: liveCollection.paymentMethod, isCustody: liveCollection.isCustody, amount: liveCollection.amount }];
    // Legacy check-in collection: recorded at check-in but before structured
    // depositCollection tracking existed. Only counts when actually received.
    if (booking.depositPaymentRecordedAt) return [{ paymentMethod: booking.depositPaymentMethod, amount: booking.depositAmount }];
    return [];
  }));
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
  const statements = staffFloatStatements({ bookings, staffFloatSettlements: extra.settlements ?? [], settings: extra.settings ?? DEFAULT_SETTINGS, expenses });
  const staffFloatCollected = statements.reduce((sum, statement) => sum + statement.collectedTotal, 0);
  const staffReimbursementDue = statements.reduce((sum, statement) => sum + statement.reimbursementDue, 0);
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
    staffReimbursementDue,
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
