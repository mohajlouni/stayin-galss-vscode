import { describe, expect, it } from "vitest";
import { customerVipLabel, customerVipTier, findCustomerByPhone, isBlacklistedCustomer, phoneDigits, phoneE164, searchCustomers, upsertCustomerFromBooking, type CustomerBookingUpsert } from "../lib/customers";
import { type Customer } from "../lib/booking-model";

const baseCustomer: Customer = { id: "c1", name: "أحمد", phone: "0797402940", e164: "+962797402940", totalBookingsCount: 1, totalSpent: 0, isBlacklisted: false, createdAt: "2026-01-01T10:00:00.000Z" };

describe("customers phone normalization", () => {
  it("translates Arabic-Indic and Eastern digits to Latin", () => {
    expect(phoneDigits("٠٧٩٧٤٠٢٩٤٠")).toBe("0797402940");
    expect(phoneDigits("۰۷۹۷۴۰۲۹۴۰")).toBe("0797402940");
  });

  it("replaces a local leading zero with the Jordanian country code", () => {
    expect(phoneE164("0797402940")).toBe("+962797402940");
  });

  it("unwraps international dialing prefixes", () => {
    expect(phoneE164("00962797402940")).toBe("+962797402940");
    expect(phoneE164("+962797402940")).toBe("+962797402940");
  });

  it("returns empty for worthless input", () => {
    expect(phoneE164(undefined)).toBe("");
    expect(phoneE164("n/a")).toBe("");
  });
});

describe("customers lookups", () => {
  it("finds a customer by exact or normalized phone", () => {
    expect(findCustomerByPhone([baseCustomer], "0797402940")?.id).toBe("c1");
    expect(findCustomerByPhone([baseCustomer], "+962797402940")?.id).toBe("c1");
  });

  it("flags blacklisted customers but allows overriding the same account", () => {
    const blacklisted: Customer = { ...baseCustomer, isBlacklisted: true, blacklistReason: "إتلاف أثاث" };
    expect(isBlacklistedCustomer([blacklisted], "0797402940")).toBe(true);
    expect(isBlacklistedCustomer([blacklisted], "0797402940", "c1")).toBe(false);
  });

  it("searches by name, national id, or phone digits", () => {
    const list = [baseCustomer, { ...baseCustomer, id: "c2", name: "سارة", phone: "0781111111", e164: "+962781111111", nationalId: "9911223344" }];
    const byName = searchCustomers(list, "سارة");
    expect(byName.map((item) => item.id)).toEqual(["c2"]);
    const byPhone = searchCustomers(list, "07811");
    expect(byPhone.map((item) => item.id)).toEqual(["c2"]);
    const byNationalId = searchCustomers(list, "9911");
    expect(byNationalId.map((item) => item.id)).toEqual(["c2"]);
  });
});

describe("upsertCustomerFromBooking", () => {
  const booking = {
    id: "b1",
    customerName: "أحمد",
    phone: "0797402940",
    startDate: "2026-05-01",
    price: 200,
    status: "confirmed" as const,
    payments: [
      { id: "p1", amount: 200, date: "2026-05-01", voidedAt: undefined },
      { id: "p2", amount: 50, date: "2026-01-01", voidedAt: "2026-01-02T00:00:00.000Z" },
    ],
  };

  it("creates a customer on first booking and counts only live payments", () => {
    const result: CustomerBookingUpsert = upsertCustomerFromBooking([], booking);
    expect(result.created).toBe(true);
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0].e164).toBe("+962797402940");
    expect(result.customers[0].totalBookingsCount).toBe(1);
    expect(result.customers[0].totalSpent).toBe(200);
    expect(result.customers[0].lastBookingDate).toBe("2026-05-01");
  });

  it("merges metrics into an existing customer without duplicating", () => {
    const first = upsertCustomerFromBooking([], booking);
    const second = upsertCustomerFromBooking(first.customers, { ...booking, id: "b2", status: "completed" });
    expect(second.created).toBe(false);
    expect(second.customers).toHaveLength(1);
    expect(second.customers[0].totalBookingsCount).toBe(2);
    expect(second.customers[0].totalSpent).toBe(400);
  });

  it("does not inflate metrics for cancelled bookings", () => {
    const cancelled = upsertCustomerFromBooking([], { ...booking, status: "cancelled" });
    expect(cancelled.customers[0].totalBookingsCount).toBe(0);
    expect(cancelled.customers[0].totalSpent).toBe(0);
  });
});

describe("customerVipTier", () => {
  it("ranks by bookings and spend", () => {
    expect(customerVipTier({ totalBookingsCount: 1, totalSpent: 0 })).toBe("bronze");
    expect(customerVipTier({ totalBookingsCount: 5, totalSpent: 0 })).toBe("silver");
    expect(customerVipTier({ totalBookingsCount: 1, totalSpent: 1500 })).toBe("gold");
  });

  it("labels in Arabic", () => {
    expect(customerVipLabel("gold", "ar")).toBe("عميل ذهبي");
  });
});