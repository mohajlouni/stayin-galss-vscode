import { type Booking, type Customer } from "./booking-model";

const LATIN = "0123456789";
const ARABIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN = "۰۱۲۳۴۵۶۷۸۹";

/** Extracts digits while translating Arabic-Indic and Eastern numerals to Latin. */
export function phoneDigits(value: string | undefined) {
  return (value ?? "").split("").map((character) => {
    const arabicIndex = ARABIC.indexOf(character);
    if (arabicIndex >= 0) return LATIN[arabicIndex];
    const easternIndex = EASTERN.indexOf(character);
    if (easternIndex >= 0) return LATIN[easternIndex];
    return character;
  }).join("").replace(/\D/g, "");
}

/**
 * Canonical E.164 key used as the CRM deduplication identity.
 * Jordanian local numbers ("079…") become "+96279…"; "00" international prefixes are unwrapped.
 */
export function phoneE164(value: string | undefined) {
  let digits = phoneDigits(value);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits) return "";
  if (digits.startsWith("0") && digits.length <= 12) digits = `962${digits.slice(1)}`;
  return `+${digits.slice(0, 15)}`;
}

export function findCustomerByPhone(customers: Customer[], phone: string | undefined) {
  const key = phoneE164(phone);
  if (!key) return undefined;
  return customers.find((customer) => customer.e164 === key || phoneE164(customer.phone) === key);
}

/** Blacklist guard used to block a booking confirmation; supports safely overriding the same account. */
export function isBlacklistedCustomer(customers: Customer[], phone: string | undefined, ignoreCustomerId?: string) {
  const customer = findCustomerByPhone(customers, phone);
  return Boolean(customer && customer.isBlacklisted && customer.id !== ignoreCustomerId);
}

export function searchCustomers(customers: Customer[], query: string, limit = 60) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...customers].sort((left, right) => right.totalSpent - left.totalSpent).slice(0, limit);
  const digits = phoneDigits(query);
  return customers.filter((customer) => customer.name.toLocaleLowerCase().includes(normalized) || (digits && (phoneDigits(customer.phone).includes(digits) || phoneDigits(customer.e164).includes(digits)) || customer.nationalId?.includes(normalized)))
    .sort((left, right) => Number(right.isBlacklisted) - Number(left.isBlacklisted) || right.totalSpent - left.totalSpent)
    .slice(0, limit);
}

export type CustomerBookingUpsert = { customers: Customer[]; created: boolean; customerId: string };

/** Records a booked stay on the guest's CRM profile, updating lifetime metrics and the latest stay. */
export function upsertCustomerFromBooking(customers: Customer[], booking: Pick<Booking, "id" | "customerName" | "phone" | "startDate" | "payments" | "price" | "status">): CustomerBookingUpsert {
  const existing = findCustomerByPhone(customers, booking.phone);
  const paidAmount = booking.payments.reduce((sum, payment) => sum + (payment.voidedAt ? 0 : Math.max(0, Number(payment.amount || 0))), 0);
  if (existing) {
    const customer: Customer = {
      ...existing,
      phone: booking.phone.trim() || existing.phone,
      e164: phoneE164(booking.phone) || existing.e164,
      totalBookingsCount: existing.totalBookingsCount + (booking.status === "cancelled" ? 0 : 1),
      totalSpent: Math.max(0, Number(existing.totalSpent)) + (booking.status === "cancelled" ? 0 : paidAmount),
      lastBookingDate: booking.startDate,
      updatedAt: new Date().toISOString(),
    };
    return { customers: customers.map((item) => item.id === existing.id ? customer : item), created: false, customerId: existing.id };
  }
  const id = `customer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const customer: Customer = { id, name: booking.customerName.trim(), phone: booking.phone.trim(), e164: phoneE164(booking.phone), totalBookingsCount: booking.status === "cancelled" ? 0 : 1, totalSpent: booking.status === "cancelled" ? 0 : paidAmount, isBlacklisted: false, lastBookingDate: booking.startDate, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  return { customers: [...customers, customer], created: true, customerId: id };
}

/** Keeps a pending booking's entered guest name/phone in the CRM only when confirmation is skipped yet. */
export function ensurePlaceholderCustomer(customers: Customer[], name: string, phone: string): { customers: Customer[]; customer: Customer } {
  const existing = findCustomerByPhone(customers, phone);
  if (existing) return { customers, customer: existing };
  const customer: Customer = { id: `customer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim().slice(0, 120), phone: phone.trim(), e164: phoneE164(phone), totalBookingsCount: 0, totalSpent: 0, isBlacklisted: false, createdAt: new Date().toISOString() };
  return { customers: [...customers, customer], customer };
}

export function customerVipTier(customer: Pick<Customer, "totalBookingsCount" | "totalSpent">): "bronze" | "silver" | "gold" {
  const bookings = Math.max(0, customer.totalBookingsCount || 0);
  const spent = Math.max(0, customer.totalSpent || 0);
  if (bookings >= 10 || spent >= 1500) return "gold";
  if (bookings >= 4 || spent >= 500) return "silver";
  return "bronze";
}

export function customerVipLabel(tier: ReturnType<typeof customerVipTier>, language: "ar" | "en") {
  return ({ gold: ["عميل ذهبي", "Gold guest"], silver: ["عميل مميز", "Silver guest"], bronze: ["عميل فعال", "Active guest"] } as const)[tier][language === "ar" ? 0 : 1];
}