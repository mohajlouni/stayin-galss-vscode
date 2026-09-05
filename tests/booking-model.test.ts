import { describe, expect, it } from "vitest";
import { Booking, PERIOD_COLORS, bookingCoversDate, bookingMatchesSearch, bookingPeriodReferenceDigit, bookingReferenceFor, bookingToWaitlistEntry, calculateRentalTotal, classifyBookingType, configuredBookingPrice, dateLabel, DEFAULT_SETTINGS, expireElapsedRecords, formatBookingReference, formatTime12, getActiveChaletShifts, getChaletShifts, getBookingRange, getBookingTimestampRange, getRentalBreakdown, hasConflict, hasDayConflict, isBookingExpired, isBookingPeriodEndedToday, isBookingStartDatePast, isInvalidTimeOrder, isValidBusinessLogoUrl, isValidChaletColor, isValidChaletReferenceCode, isWaitlistExpired, isValidGoogleMapsUrl, isValidGuardianPhone, matchesBookingListFilter, normalizeAppData, normalizeBookingEndDate, normalizeBookingReferences, normalizeChaletReferenceCodes, paymentMethodLabel, paymentStatus, refundableDepositAmount, remainingAmount, remainingRefundableDeposit, rentalBalance, resolvedBookingPrice, splitBookingsByCheckout, suggestChaletReferenceCode, totalDepositRefunded, totalPaid, typeColors } from "../lib/booking-model";
import { suggestNearestAvailableCheckout } from "../lib/booking-model";
import { bookingOccupancyStatus, depositFinancialStatus } from "../lib/booking-model";
const base = (overrides: Partial<Booking> = {}): Booking => ({ id: "1", customerName: "أحمد", phone: "079", startDate: "2026-08-17", endDate: "2026-08-17", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 100, payments: [{ id: "p", amount: 25, date: "2026-08-17" }], notes: "", status: "confirmed", createdAt: "" , ...overrides });
describe("booking calculations", () => { it("calculates paid and remaining", () => { const b = base(); expect(totalPaid(b)).toBe(25); expect(remainingAmount(b)).toBe(75); expect(paymentStatus(b)).toBe("deposit"); }); it("detects overlap", () => { expect(hasConflict(base({ id: "2", startTime: "20:00" }), [base()])).toBe(true); expect(hasConflict(base({ id: "2", startDate: "2026-08-18" }), [base()])).toBe(false); }); it("extends evening booking to next day", () => { const range = getBookingRange(base({ bookingType: "evening", startTime: "22:00", endTime: "09:00" })); expect(range.end - range.start).toBe(11 * 60); }); it("blocks another booking on the same day", () => { expect(hasDayConflict(base({ id: "2", startDate: "2026-08-17", endDate: "2026-08-17" }), [base()])).toBe(true); }); it("formats Arabic 12-hour time", () => { expect(formatTime12("09:05")).toBe("9:05 ص"); expect(formatTime12("22:10")).toBe("10:10 م"); }); it("keeps insurance amount separate from booking price", () => { const b = base({ depositAmount: 35 }); expect(b.price).toBe(100); expect(b.depositAmount).toBe(35); }); it("covers every day of a multi-day booking", () => { const b = base({ startDate: "2026-08-20", endDate: "2026-08-23", bookingType: "multi-day" }); expect(bookingCoversDate(b, "2026-08-20")).toBe(true); expect(bookingCoversDate(b, "2026-08-21")).toBe(true); expect(bookingCoversDate(b, "2026-08-22")).toBe(true); expect(bookingCoversDate(b, "2026-08-23")).toBe(true); expect(bookingCoversDate(b, "2026-08-24")).toBe(false); }); it("keeps Gregorian date stable", () => { expect(dateLabel("2026-08-20")).toContain("آب"); }); it("does not conflict with waitlisted entries", () => { expect(hasConflict(base({ id: "2" }), [base({ status: "waitlisted" })])).toBe(false); }); it("allows morning and evening on the same day when times do not overlap", () => { const morning = base({ startTime: "09:00", endTime: "17:00" }); const evening = base({ id: "2", bookingType: "evening", startTime: "22:00", endTime: "09:00" }); expect(hasConflict(evening, [morning])).toBe(false); }); it("rejects an exit time before entry for normal bookings", () => { expect(isInvalidTimeOrder(base({ startTime: "18:00", endTime: "09:00" }))).toBe(true); }); it("allows overnight evening time", () => { expect(isInvalidTimeOrder(base({ bookingType: "evening", startTime: "22:00", endTime: "09:00" }))).toBe(false); }); it("conflicts only within the same chalet", () => { expect(hasConflict(base({ id: "2", chaletName: "الوردة" }), [base({ chaletName: "الوردة" })])).toBe(true); expect(hasConflict(base({ id: "3", chaletName: "الياسمين" }), [base({ chaletName: "الوردة" })])).toBe(false); }); it("allows morning after an evening ends next morning", () => { const evening = base({ id: "2", startDate: "2026-08-20", endDate: "2026-08-20", bookingType: "evening", startTime: "22:00", endTime: "09:00", chaletName: "الوردة" }); const morning = base({ startDate: "2026-08-21", endDate: "2026-08-21", startTime: "09:00", endTime: "21:00", chaletName: "الوردة" }); expect(hasConflict(morning, [evening])).toBe(false); }); it("classifies new bookings from dates and configured times", () => { expect(classifyBookingType({ startDate: "2026-08-01", endDate: "2026-08-01", startTime: "09:00", endTime: "21:00" }, DEFAULT_SETTINGS)).toBe("morning"); expect(classifyBookingType({ startDate: "2026-08-20", endDate: "2026-08-20", startTime: "22:00", endTime: "09:00" }, DEFAULT_SETTINGS)).toBe("evening"); expect(classifyBookingType({ startDate: "2026-08-20", endDate: "2026-08-21", startTime: "09:00", endTime: "09:00" }, DEFAULT_SETTINGS)).toBe("24h"); expect(classifyBookingType({ startDate: "2026-08-01", endDate: "2026-08-05", startTime: "10:00", endTime: "12:00" }, DEFAULT_SETTINGS)).toBe("multi-day"); }); it("uses changed period settings for classification", () => { const settings = { ...DEFAULT_SETTINGS, bookingTypes: { ...DEFAULT_SETTINGS.bookingTypes, morning: { ...DEFAULT_SETTINGS.bookingTypes.morning, startTime: "08:00", endTime: "16:00" } } }; expect(classifyBookingType({ startDate: "2026-08-01", endDate: "2026-08-01", startTime: "08:00", endTime: "16:00" }, settings)).toBe("morning"); }); it("calculates rental total by multi-day quantity", () => { expect(calculateRentalTotal(100, { startDate: "2026-08-01", endDate: "2026-08-05", startTime: "10:00", endTime: "12:00" }, DEFAULT_SETTINGS)).toBe(500); expect(calculateRentalTotal(100, { startDate: "2026-08-01", endDate: "2026-08-01", startTime: "09:00", endTime: "21:00" }, DEFAULT_SETTINGS)).toBe(100); }); it("uses weekend rate and applies JOD discount", () => { const settings = { ...DEFAULT_SETTINGS, weekendPrice: 150 }; const booking = { startDate: "2026-08-06", endDate: "2026-08-08", startTime: "09:00", endTime: "21:00" }; const breakdown = getRentalBreakdown(100, booking, settings); expect(breakdown.weekendCount).toBe(2); expect(breakdown.gross).toBe(400); expect(calculateRentalTotal(100, booking, settings, 50)).toBe(350); }); });

describe("rental and refundable deposit policy", () => {
  it("keeps refundable security deposit outside rental balance and payment status", () => {
    const booking = base({ price: 300, depositAmount: 80, payments: [{ id: "rental-payment", amount: 120, date: "2026-08-17" }] });
    expect(rentalBalance(booking)).toBe(180);
    expect(remainingAmount(booking)).toBe(180);
    expect(refundableDepositAmount(booking)).toBe(80);
    expect(paymentStatus(booking)).toBe("deposit");
  });
});

describe("payment metadata", () => {
  it("excludes voided payments from paid and remaining rental calculations", () => {
    const booking = base({ payments: [{ id: "active", amount: 40, date: "2026-08-17" }, { id: "voided", amount: 60, date: "2026-08-17", voidedAt: "2026-08-18T10:00:00.000Z" }] });
    expect(totalPaid(booking)).toBe(40);
    expect(rentalBalance(booking)).toBe(60);
  });

  it("preserves a payment method and local receipt URI during data normalization", () => {
    const data = normalizeAppData({ bookings: [base({ payments: [{ id: "receipt-payment", amount: 50, date: "2026-08-17", paymentMethod: "bank-transfer", receiptUri: "file:///documents/payment.jpg" }] })] });
    expect(data.bookings[0].payments[0]).toMatchObject({ paymentMethod: "bank-transfer", receiptUri: "file:///documents/payment.jpg" });
    expect(paymentMethodLabel("cash-guardian")).toBe("كاش بيد الحارس");
  });

  it("preserves the refund method so deposit returns remain auditable", () => {
    const data = normalizeAppData({ bookings: [base({ depositAmount: 50, depositRefunds: [{ id: "refund-method", amount: 20, date: "2026-08-18", paymentMethod: "wallet" }] })] });
    expect(data.bookings[0].depositRefunds?.[0]).toMatchObject({ paymentMethod: "wallet" });
  });
});

describe("24-hour checkout dates", () => {
  it("moves a same-time 24-hour checkout to the following calendar day", () => {
    const booking = normalizeBookingEndDate(base({ bookingType: "24h", startDate: "2026-08-25", endDate: "2026-08-25", startTime: "09:00", endTime: "09:00" }));
    expect(booking.endDate).toBe("2026-08-26");
  });

  it("moves an evening checkout to the following morning when legacy data shares the start date", () => {
    const booking = normalizeBookingEndDate(base({ bookingType: "evening", startDate: "2026-08-21", endDate: "2026-08-21", startTime: "22:00", endTime: "09:00" }));
    expect(booking.endDate).toBe("2026-08-22");
  });

  it("retains an already explicit next-day checkout date", () => {
    const booking = normalizeBookingEndDate(base({ bookingType: "24h", startDate: "2026-08-25", endDate: "2026-08-26", startTime: "09:00", endTime: "09:00" }));
    expect(booking.endDate).toBe("2026-08-26");
  });
});

describe("active booking and history separation", () => {
  it("moves every elapsed stay to history while keeping only future or in-progress bookings active", () => {
    const now = new Date(2026, 7, 20, 12, 0).getTime();
    const expired = base({ id: "expired", startDate: "2026-08-20", endDate: "2026-08-20", startTime: "09:00", endTime: "11:59" });
    const active = base({ id: "active", startDate: "2026-08-20", endDate: "2026-08-20", startTime: "09:00", endTime: "13:00" });
    const completed = base({ id: "completed", startDate: "2026-08-21", endDate: "2026-08-21", startTime: "09:00", endTime: "21:00", status: "completed" });
    const cancelled = base({ id: "cancelled", startDate: "2026-08-21", endDate: "2026-08-21", startTime: "09:00", endTime: "21:00", status: "cancelled" });
    const result = splitBookingsByCheckout([expired, active, completed, cancelled], now);
    expect(result.activeBookings.map((booking) => booking.id)).toEqual(["active"]);
    expect(result.historyBookings.map((booking) => booking.id)).toEqual(["expired", "completed", "cancelled"]);
  });
});


describe("rental and refundable deposit refunds", () => {
  it("tracks deposit refunds separately from rent and retains the remaining amount", () => {
    const booking = base({ depositAmount: 80, depositRefunds: [{ id: "refund-1", amount: 30, date: "2026-08-18", note: "تسليم الشاليه" }] });
    expect(totalDepositRefunded(booking)).toBe(30);
    expect(remainingRefundableDeposit(booking)).toBe(50);
    expect(remainingAmount(booking)).toBe(75);
  });

  it("reports whether a deposit is held, fully refunded, or absent", () => {
    expect(depositFinancialStatus(base())).toBe("none");
    expect(depositFinancialStatus(base({ depositAmount: 80 }))).toBe("held");
    expect(depositFinancialStatus(base({ depositAmount: 80, depositRefunds: [{ id: "refund-all", amount: 80, date: "2026-08-18" }] }))).toBe("fully-refunded");
  });
});

describe("booking occupancy status", () => {
  const booking = base({ startDate: "2026-08-20", endDate: "2026-08-20", startTime: "09:00", endTime: "21:00" });
  it("distinguishes upcoming, currently occupied, and ended stays for cancellation confirmation", () => {
    expect(bookingOccupancyStatus(booking, new Date(2026, 7, 20, 8, 59).getTime())).toBe("upcoming");
    expect(bookingOccupancyStatus(booking, new Date(2026, 7, 20, 12, 0).getTime())).toBe("in-house");
    expect(bookingOccupancyStatus(booking, new Date(2026, 7, 20, 21, 0).getTime())).toBe("ended");
  });
});

describe("overnight and multi-day conflict handling", () => {
  it("blocks a next-morning stay that overlaps an overnight evening booking", () => {
    const evening = base({ id: "evening", chaletId: "rose", startDate: "2026-08-20", endDate: "2026-08-20", bookingType: "evening", startTime: "22:00", endTime: "09:00" });
    const overlap = base({ id: "morning-overlap", chaletId: "rose", startDate: "2026-08-21", endDate: "2026-08-21", bookingType: "custom", startTime: "08:30", endTime: "10:00" });
    const boundary = base({ id: "morning-boundary", chaletId: "rose", startDate: "2026-08-21", endDate: "2026-08-21", bookingType: "morning", startTime: "09:00", endTime: "21:00" });
    expect(hasConflict(overlap, [evening])).toBe(true);
    expect(hasConflict(boundary, [evening])).toBe(false);
  });

  it("blocks a booking that overlaps the final day of a multi-day stay", () => {
    const multiDay = base({ id: "stay", chaletId: "rose", startDate: "2026-08-20", endDate: "2026-08-22", bookingType: "multi-day", startTime: "09:00", endTime: "12:00" });
    const overlap = base({ id: "checkout-overlap", chaletId: "rose", startDate: "2026-08-22", endDate: "2026-08-22", bookingType: "custom", startTime: "11:30", endTime: "14:00" });
    const boundary = base({ id: "checkout-boundary", chaletId: "rose", startDate: "2026-08-22", endDate: "2026-08-22", bookingType: "custom", startTime: "12:00", endTime: "18:00" });
    expect(hasConflict(overlap, [multiDay])).toBe(true);
    expect(hasConflict(boundary, [multiDay])).toBe(false);
  });

  it("keeps the same time available in another chalet", () => {
    const evening = base({ id: "evening", chaletId: "rose", startDate: "2026-08-20", endDate: "2026-08-20", bookingType: "evening", startTime: "22:00", endTime: "09:00" });
    const otherChalet = base({ id: "other", chaletId: "jasmine", startDate: "2026-08-21", endDate: "2026-08-21", bookingType: "custom", startTime: "08:30", endTime: "10:00" });
    expect(hasConflict(otherChalet, [evening])).toBe(false);
  });
});

describe("multi-day smart booking selection", () => {
  it("uses the overnight color for a multi-day stay instead of the morning sky blue", () => {
    expect(typeColors["multi-day"].text).toBe("#8B5CF6");
    expect(typeColors["multi-day"].text).not.toBe(typeColors.morning.text);
  });

  it("keeps every period and waitlist indicator on its reserved semantic color", () => {
    expect(PERIOD_COLORS).toEqual({ morning: "#0284C7", evening: "#4F46E5", "24h": "#8B5CF6", "multi-day": "#8B5CF6", custom: "#F97316", waitlist: "#EAB308" });
    expect(typeColors.morning.text).toBe(PERIOD_COLORS.morning);
    expect(typeColors.evening.text).toBe(PERIOD_COLORS.evening);
    expect(typeColors["24h"].text).toBe(PERIOD_COLORS["24h"]);
    expect(typeColors["multi-day"].text).toBe(PERIOD_COLORS["multi-day"]);
  });

  it("classifies a two-day range as multi-day", () => {
    expect(classifyBookingType({ startDate: "2026-08-01", endDate: "2026-08-02", startTime: "09:00", endTime: "21:00" }, DEFAULT_SETTINGS)).toBe("multi-day");
  });

  it("classifies a five-day range as multi-day regardless of partial-day times", () => {
    expect(classifyBookingType({ startDate: "2026-08-01", endDate: "2026-08-05", startTime: "10:00", endTime: "12:00" }, DEFAULT_SETTINGS)).toBe("multi-day");
  });
});

describe("chalet period conflict handling", () => {
  const roseMorning = base({ id: "rose-morning", chaletId: "rose", chaletName: "الوردة", startTime: "09:00", endTime: "21:00", bookingType: "morning" });

  it("blocks a second morning booking in the same chalet and time window", () => {
    const duplicateMorning = base({ id: "new-morning", chaletId: "rose", chaletName: "الوردة", startTime: "09:00", endTime: "21:00", bookingType: "morning" });
    expect(hasConflict(duplicateMorning, [roseMorning])).toBe(true);
  });

  it("keeps an evening available when the morning period alone is booked", () => {
    const evening = base({ id: "rose-evening", chaletId: "rose", chaletName: "الوردة", startTime: "22:00", endTime: "09:00", bookingType: "evening" });
    expect(hasConflict(evening, [roseMorning])).toBe(false);
  });

  it("copies all booking details when the request is deferred to the waitlist", () => {
    const deferred = bookingToWaitlistEntry(roseMorning, "wait-rose-morning");
    expect(deferred).toMatchObject({ id: "wait-rose-morning", customerName: "أحمد", chaletId: "rose", requestedDate: "2026-08-17", endDate: "2026-08-17", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 100, notes: "" });
    expect(deferred.payments).toEqual(roseMorning.payments);
    expect(deferred.payments).not.toBe(roseMorning.payments);
  });
});

describe("chalet operational details", () => {
  it("accepts secure optional business logo URLs while discarding unsafe values during migration", () => {
    expect(isValidBusinessLogoUrl("")).toBe(true);
    expect(isValidBusinessLogoUrl("https://cdn.example.com/resort-logo.png")).toBe(true);
    expect(isValidBusinessLogoUrl("http://cdn.example.com/resort-logo.png")).toBe(false);
    expect(normalizeAppData({ settings: { businessLogoUrl: "http://unsafe.example/logo.png" } as never }).settings.businessLogoUrl).toBeUndefined();
    expect(normalizeAppData({ settings: { businessLogoUrl: "https://cdn.example.com/resort-logo.png" } as never }).settings.businessLogoUrl).toBe("https://cdn.example.com/resort-logo.png");
  });

  it("preserves cleaned per-chalet location, Maps URL, and contact details while migrating stored data", () => {
    const data = normalizeAppData({ chalets: [{ id: "rose", name: "  الوردة  ", color: "#0F8B83", location: "  عمّان — طريق المطار  ", locationUrl: " https://maps.google.com/?q=31.95,35.91 ", guardianName: "  أبو أحمد  ", guardianPhone: " 0790000000 ", contactPhone: " 0780000000 ", notes: "  رمز البوابة 1234  ", createdAt: "2026-01-01" }] });
    expect(data.chalets[0]).toMatchObject({ name: "الوردة", location: "عمّان — طريق المطار", locationUrl: "https://maps.google.com/?q=31.95,35.91", guardianName: "أبو أحمد", guardianPhone: "0790000000", contactPhone: "0780000000", notes: "رمز البوابة 1234" });
  });

  it("moves legacy global Maps and guard values to every existing chalet without retaining them in settings", () => {
    const data = normalizeAppData({ chalets: [{ id: "rose", name: "الوردة", color: "#0F8B83", createdAt: "2026-01-01" }], settings: { locationUrl: "https://maps.google.com/?q=31.95,35.91", guardPhone: "0792222222" } as never });
    expect(data.chalets[0]).toMatchObject({ locationUrl: "https://maps.google.com/?q=31.95,35.91", guardianPhone: "0792222222" });
    expect(data.settings).not.toHaveProperty("locationUrl");
    expect(data.settings).not.toHaveProperty("guardPhone");
  });

  it("keeps old chalet records valid when optional details do not exist", () => {
    const data = normalizeAppData({ chalets: [{ id: "old", name: "الياسمين", color: "#4379D8", createdAt: "2026-01-01" }] });
    expect(data.chalets[0]).toMatchObject({ id: "old", name: "الياسمين", color: "#4379D8" });
    expect(data.chalets[0].location).toBeUndefined();
  });

  it("accepts empty or valid Google Maps and guard phone values while rejecting malformed entries", () => {
    expect(isValidGoogleMapsUrl("")).toBe(true);
    expect(isValidGoogleMapsUrl("https://maps.google.com/?q=31.95,35.91")).toBe(true);
    expect(isValidGoogleMapsUrl("https://maps.app.goo.gl/Example")).toBe(true);
    expect(isValidGoogleMapsUrl("http://maps.google.com/?q=31.95,35.91")).toBe(false);
    expect(isValidGoogleMapsUrl("https://example.com/map")).toBe(false);
    expect(isValidGuardianPhone("0791234567")).toBe(true);
    expect(isValidGuardianPhone("٠٧٩١٢٣٤٥٦٧")).toBe(true);
    expect(isValidGuardianPhone("123")).toBe(false);
  });

  it("links legacy booking names to the canonical chalet ID when a chalet list already exists", () => {
    const data = normalizeAppData({ chalets: [{ id: "rose", name: "الوردة", color: "#0F8B83", createdAt: "2026-01-01" }], bookings: [base({ chaletId: undefined, chaletName: "الوردة" })] });
    expect(data.bookings[0]).toMatchObject({ chaletId: "rose", chaletName: "الوردة" });
  });
});

describe("nearest available checkout suggestion", () => {
  it("returns the closest earlier checkout that does not overlap the next chalet booking", () => {
    const nextBooking = base({ id: "next", chaletId: "rose", startDate: "2026-08-10", endDate: "2026-08-11", bookingType: "multi-day", startTime: "09:00", endTime: "21:00" });
    const extension = base({ id: "current", chaletId: "rose", startDate: "2026-08-05", endDate: "2026-08-11", bookingType: "multi-day", startTime: "09:00", endTime: "21:00" });
    expect(suggestNearestAvailableCheckout(extension, [nextBooking], extension.id)).toBe("2026-08-09");
  });
});

describe("automatic expiry", () => {
  const checkout = new Date(2026, 7, 17, 21, 0).getTime();

  it("creates exact timestamp bounds for overnight and multi-day stays", () => {
    const overnight = getBookingTimestampRange(base({ bookingType: "evening", startDate: "2026-08-17", endDate: "2026-08-17", startTime: "22:00", endTime: "09:00" }));
    const multiDay = getBookingTimestampRange(base({ bookingType: "multi-day", startDate: "2026-08-17", endDate: "2026-08-20", startTime: "09:00", endTime: "21:00" }));
    expect(overnight.end - overnight.start).toBe(11 * 60 * 60 * 1000);
    expect(multiDay.end - multiDay.start).toBe(84 * 60 * 60 * 1000);
  });

  it("expires a booking exactly at its checkout minute without expiring an active one", () => {
    const booking = base({ startDate: "2026-08-17", endDate: "2026-08-17", startTime: "09:00", endTime: "21:00" });
    expect(isBookingExpired(booking, checkout - 60_000)).toBe(false);
    expect(isBookingExpired(booking, checkout)).toBe(true);
  });

  it("uses the following morning as the checkout for overnight stays and waitlist requests", () => {
    const overnight = base({ bookingType: "evening", startDate: "2026-08-17", endDate: "2026-08-17", startTime: "22:00", endTime: "09:00" });
    const request = bookingToWaitlistEntry(overnight, "overnight-request");
    const nextMorning = new Date(2026, 7, 18, 9, 0).getTime();
    expect(isBookingExpired(overnight, nextMorning - 60_000)).toBe(false);
    expect(isBookingExpired(overnight, nextMorning)).toBe(true);
    expect(isWaitlistExpired(request, nextMorning)).toBe(true);
  });

  it("keeps an elapsed checked-in stay pending explicit checkout while preserving future and completed records", () => {
    const elapsed = base({ id: "elapsed", startDate: "2026-08-17", endDate: "2026-08-17", startTime: "09:00", endTime: "21:00", checkedInAt: "2026-08-17T09:10:00.000Z" });
    const completed = base({ id: "completed", startDate: "2026-08-17", endDate: "2026-08-17", startTime: "09:00", endTime: "21:00", status: "completed" });
    const future = base({ id: "future", startDate: "2026-08-18", endDate: "2026-08-18", startTime: "09:00", endTime: "21:00" });
    const elapsedRequest = bookingToWaitlistEntry(elapsed, "elapsed-request");
    const futureRequest = { ...bookingToWaitlistEntry(future, "future-request"), customerName: "عميل مستقبل", phone: "0791234567" };
    const result = expireElapsedRecords(normalizeAppData({ bookings: [elapsed, completed, future], waitlist: [elapsedRequest, futureRequest] }), checkout);
    expect(result.bookings.find((item) => item.id === "elapsed")?.status).toBe("confirmed");
    expect(result.bookings.find((item) => item.id === "elapsed")?.checkedInAt).toBe("2026-08-17T09:10:00.000Z");
    expect(result.bookings.find((item) => item.id === "completed")?.status).toBe("completed");
    expect(result.bookings.find((item) => item.id === "future")?.status).toBe("confirmed");
    expect(result.waitlist.find((item) => item.id === "elapsed-request")?.status).toBe("promoted");
    expect(result.waitlist.find((item) => item.id === "elapsed-request")?.promotedBookingId).toBe("elapsed");
    expect(result.waitlist.find((item) => item.id === "future-request")?.status).toBe("active");
  });

  it("keeps completed history from blocking a new reservation in the same chalet", () => {
    const archived = base({ id: "archived", chaletId: "rose", status: "completed" });
    const replacement = base({ id: "replacement", chaletId: "rose" });
    expect(hasConflict(replacement, [archived])).toBe(false);
  });
});

describe("booking list references, search, and filters", () => {
  it("generates operational references from chalet code, start date, and period", () => {
    const chalets = [
      { id: "n1", name: "النوح", referenceCode: "n1", color: "#000000", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "m2", name: "المايا", referenceCode: "M2", color: "#000000", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    const bookings = normalizeBookingReferences([
      base({ id: "morning", chaletId: "n1", startDate: "2026-08-21", bookingType: "morning" }),
      base({ id: "evening", chaletId: "n1", startDate: "2026-08-21", bookingType: "evening" }),
      base({ id: "full", chaletId: "m2", startDate: "2026-08-21", bookingType: "24h" }),
    ], chalets);
    expect(bookings.find((booking) => booking.id === "morning")?.bookingReference).toBe("#N12608211");
    expect(bookings.find((booking) => booking.id === "evening")?.bookingReference).toBe("#N12608212");
    expect(bookings.find((booking) => booking.id === "full")?.bookingReference).toBe("#M22608213");
    expect(bookingReferenceFor(base({ chaletId: "n1", startDate: "2026-08-21", bookingType: "morning" }), chalets)).toBe("#N12608211");
    expect(bookingPeriodReferenceDigit("multi-day")).toBe("3");
    expect(formatBookingReference("##N12608211#")).toBe("#N12608211");
    expect(formatBookingReference("N12608211")).toBe("#N12608211");
  });

  it("normalizes unit codes to unique U01..U99 values, reassigning legacy codes", () => {
    const codes = normalizeChaletReferenceCodes([
      { id: "one", name: "الأول", referenceCode: "ن1", color: "#000000", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "two", name: "الثاني", referenceCode: "U01", color: "#000000", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "three", name: "الثالث", color: "#000000", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(codes.map((chalet) => chalet.referenceCode)).toEqual(["U01", "U02", "U03"]);
    expect(isValidChaletReferenceCode("N1")).toBe(true);
    expect(isValidChaletReferenceCode("N123")).toBe(false);
    expect(suggestChaletReferenceCode(["U01", "U02"])).toBe("U03");
    expect(suggestChaletReferenceCode(["01", "02"])).toBe("U01");
  });

  it("searches guest, phone, chalet, and reference fields case-insensitively", () => {
    const booking = base({ customerName: "ليان", phone: "0791234567", bookingReference: "#26-1007" });
    expect(bookingMatchesSearch(booking, "الوردة", "ليان")).toBe(true);
    expect(bookingMatchesSearch(booking, "الوردة", "3456")).toBe(true);
    expect(bookingMatchesSearch(booking, "الوردة", "وردة")).toBe(true);
    expect(bookingMatchesSearch(booking, "الوردة", "#26-1007")).toBe(true);
    expect(bookingMatchesSearch(booking, "الوردة", "الياسمين")).toBe(false);
  });

  it("isolates remaining balances and contextual status filters without mutating bookings", () => {
    const due = base({ status: "confirmed", startDate: "2026-08-25", endDate: "2026-08-30", price: 100, payments: [{ id: "part", amount: 30, date: "2026-08-01" }] });
    const paid = base({ id: "paid", status: "confirmed", startDate: "2026-08-25", endDate: "2026-08-30", price: 100, payments: [{ id: "full", amount: 100, date: "2026-08-01" }] });
    const completed = base({ id: "completed", status: "completed" });
    const cancelled = base({ id: "cancelled", status: "cancelled" });
    expect(matchesBookingListFilter(due, "balance", "2026-08-20")).toBe(true);
    expect(matchesBookingListFilter(paid, "balance", "2026-08-20")).toBe(false);
    expect(matchesBookingListFilter(due, "upcoming", "2026-08-20")).toBe(true);
    expect(matchesBookingListFilter(due, "today", "2026-08-20")).toBe(false);
    expect(matchesBookingListFilter(completed, "completed", "2026-08-20")).toBe(true);
    expect(matchesBookingListFilter(cancelled, "cancelled", "2026-08-20")).toBe(true);
  });
});

describe("period pricing", () => {
  const pricingSettings = { ...DEFAULT_SETTINGS, weekendDays: [4, 5, 6], periodPricing: { morning: { weekdayPrice: 100, weekendPrice: 150 }, evening: { weekdayPrice: 180, weekendPrice: 240 }, "24h": { weekdayPrice: 260, weekendPrice: 320 } } };

  it("uses the configured weekday or weekend rate for the selected booking period", () => {
    expect(configuredBookingPrice({ bookingType: "morning", startDate: "2026-08-19", endDate: "2026-08-19" }, pricingSettings)).toBe(100);
    expect(configuredBookingPrice({ bookingType: "morning", startDate: "2026-08-20", endDate: "2026-08-20" }, pricingSettings)).toBe(150);
    expect(configuredBookingPrice({ bookingType: "evening", startDate: "2026-08-21", endDate: "2026-08-21" }, pricingSettings)).toBe(240);
  });

  it("keeps a manual entry instead of replacing it with the automatic rate", () => {
    expect(resolvedBookingPrice(150, "125", true)).toBe(125);
    expect(resolvedBookingPrice(150, "125", false)).toBe(150);
  });

  it("adds weekday and weekend rates across a multi-day stay", () => {
    expect(configuredBookingPrice({ bookingType: "multi-day", startDate: "2026-08-19", endDate: "2026-08-22" }, pricingSettings)).toBe(550);
  });

  it("prioritizes occasion rules, then seasonal rules, then chalet-specific rates", () => {
    const chalet = { id: "rose", name: "الوردة", color: "#0F8B83", createdAt: "2026-01-01", periodPricing: { morning: { weekdayPrice: 175, weekendPrice: 200 }, evening: { weekdayPrice: 0, weekendPrice: 0 }, "24h": { weekdayPrice: 0, weekendPrice: 0 } } };
    expect(configuredBookingPrice({ bookingType: "morning", startDate: "2026-08-19", endDate: "2026-08-19" }, pricingSettings, chalet)).toBe(175);
    expect(configuredBookingPrice({ bookingType: "morning", startDate: "2026-08-19", endDate: "2026-08-19" }, pricingSettings, chalet, [{ id: "season", name: "الصيف", startDate: "2026-08-01", endDate: "2026-08-31", price: 220, kind: "season", createdAt: "2026-01-01" }, { id: "occasion", name: "عطلة", startDate: "2026-08-19", endDate: "2026-08-19", price: 300, kind: "occasion", createdAt: "2026-01-01" }])).toBe(300);
  });
});

describe("dynamic chalet shifts", () => {
  const chalet = { id: "dynamic", name: "الموج", color: "#123ABC", createdAt: "2026-01-01", weekendDays: [5, 6], shifts: [{ id: "sunset", name: "غروب", startTime: "16:00", endTime: "23:00", weekdayPrice: 145, weekendPrice: 190, isActive: true, color: "#EA580C" }, { id: "overnight", name: "مبيت", startTime: "22:00", endTime: "09:00", weekdayPrice: 210, weekendPrice: 260, isActive: false, color: "#7C3AED" }] };

  it("migrates legacy times and prices into stable, editable shift records", () => {
    const data = normalizeAppData({ chalets: [{ id: "legacy", name: "النوح", color: "#0F8B83", periodTimes: { morning: { startTime: "08:00", endTime: "16:00" }, evening: { startTime: "21:00", endTime: "09:00" }, "24h": { startTime: "10:00", endTime: "10:00" } }, periodPricing: { morning: { weekdayPrice: 120, weekendPrice: 150 }, evening: { weekdayPrice: 200, weekendPrice: 240 }, "24h": { weekdayPrice: 280, weekendPrice: 320 } }, createdAt: "2026-01-01" }] });
    expect(data.chalets[0].shifts).toEqual(expect.arrayContaining([expect.objectContaining({ id: "legacy-morning", name: "صباحي", startTime: "08:00", endTime: "16:00", weekdayPrice: 120, weekendPrice: 150, isActive: true, color: expect.stringMatching(/^#[0-9A-F]{6}$/) }), expect.objectContaining({ id: "legacy-evening", startTime: "21:00", endTime: "09:00", weekdayPrice: 200, isActive: true })]));
  });

  it("keeps a custom shift name and prices while assigning it to a new booking", () => {
    const normalized = normalizeAppData({ chalets: [chalet], bookings: [base({ chaletId: "dynamic", chaletName: "الموج", bookingType: "custom", shiftId: "sunset", startTime: "16:00", endTime: "23:00" })] });
    expect(normalized.bookings[0]).toMatchObject({ shiftId: "sunset", shiftName: "غروب", shiftColor: "#06B6D4" });
    expect(configuredBookingPrice({ bookingType: "custom", shiftId: "sunset", startDate: "2026-08-19", endDate: "2026-08-19" }, DEFAULT_SETTINGS, chalet)).toBe(145);
    expect(configuredBookingPrice({ bookingType: "custom", shiftId: "sunset", startDate: "2026-08-21", endDate: "2026-08-21" }, DEFAULT_SETTINGS, chalet)).toBe(190);
  });

  it("blocks overlapping custom shifts while preserving a boundary handoff", () => {
    const overnight = base({ id: "overnight", chaletId: "dynamic", bookingType: "custom", shiftId: "overnight", startDate: "2026-08-20", endDate: "2026-08-20", startTime: "22:00", endTime: "09:00" });
    const overlap = base({ id: "overlap", chaletId: "dynamic", bookingType: "custom", shiftId: "morning-early", startDate: "2026-08-21", endDate: "2026-08-21", startTime: "08:30", endTime: "12:00" });
    const handoff = base({ id: "handoff", chaletId: "dynamic", bookingType: "custom", shiftId: "morning", startDate: "2026-08-21", endDate: "2026-08-21", startTime: "09:00", endTime: "17:00" });
    expect(getBookingRange(overnight).end - getBookingRange(overnight).start).toBe(11 * 60);
    expect(hasConflict(overlap, [overnight])).toBe(true);
    expect(hasConflict(handoff, [overnight])).toBe(false);
  });

  it("accepts HEX colors only and exposes every supplied dynamic shift without a fixed count", () => {
    const manyShifts = Array.from({ length: 12 }, (_, index) => ({ id: `shift-${index}`, name: `فترة ${index + 1}`, startTime: "09:00", endTime: "17:00", weekdayPrice: index, weekendPrice: index + 10, isActive: index !== 5, color: "#0F8B83" }));
    expect(getChaletShifts({ id: "many", name: "شاليه واسع", color: "#ABCDEF", shifts: manyShifts, createdAt: "2026-01-01" })).toHaveLength(12);
    expect(isValidChaletColor("#A1B2C3")).toBe(true);
    expect(isValidChaletColor("#ABC")).toBe(false);
    expect(isValidChaletColor("blue")).toBe(false);
  });

  it("preserves inactive shifts while exposing only active ones for new bookings", () => {
    const normalized = normalizeAppData({ chalets: [chalet] });
    expect(getChaletShifts(normalized.chalets[0])).toHaveLength(2);
    expect(getActiveChaletShifts(normalized.chalets[0])).toEqual([expect.objectContaining({ id: "sunset", isActive: true, color: "#06B6D4" })]);
  });

  it("formats both configured clock representations from the same stored 24-hour time", () => {
    expect(formatTime12("21:00", "ar", "12h")).toBe("9:00 م");
    expect(formatTime12("21:00", "ar", "24h")).toBe("21:00");
  });
});
