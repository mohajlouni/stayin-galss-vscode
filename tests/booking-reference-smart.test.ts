import { describe, expect, it } from "vitest";
import {
  Booking,
  bookingReferenceFor,
  formatBookingReference,
  isValidWorkspaceCode,
  normalizeBookingReferences,
  normalizeWorkspaceCode,
  shiftCodeForBookingType,
  shiftCodeForShift,
  smartBookingReference,
  suggestWorkspaceCode,
} from "../lib/booking-model";

const base = (overrides: Partial<Booking> = {}): Booking => ({
  id: "1",
  customerName: "أحمد",
  phone: "079",
  startDate: "2026-09-04",
  endDate: "2026-09-04",
  bookingType: "morning",
  startTime: "09:00",
  endTime: "21:00",
  price: 100,
  payments: [],
  notes: "",
  status: "confirmed",
  createdAt: "",
  ...overrides,
});

describe("smart booking reference formula", () => {
  it("assembles creator-workspace-unit-date-shift with the hashtag prefix", () => {
    const ref = smartBookingReference({ creatorCode: "U1011", workspaceCode: "E01", unitCode: "U02", date: "2026-09-04", shiftCode: "M" });
    expect(ref).toBe("#U1011-E01-U02-260904-M");
  });

  it("matches the mandatory super-admin example #U1000-E01-U02-260904-N", () => {
    const ref = smartBookingReference({ creatorCode: "U1000", workspaceCode: "E01", unitCode: "U02", date: "2026-09-04", shiftCode: "N" });
    expect(ref).toBe("#U1000-E01-U02-260904-N");
  });

  it("works for the staff example (S2001 / evening N)", () => {
    const ref = smartBookingReference({ creatorCode: "S2001", workspaceCode: "E02", unitCode: "U03", date: "2026-08-20", shiftCode: "N" });
    expect(ref).toBe("#S2001-E02-U03-260820-N");
  });

  it("maps evening سهرة to N and each fixed period to its badge letter", () => {
    expect(shiftCodeForBookingType("morning")).toBe("M");
    expect(shiftCodeForBookingType("evening")).toBe("N");
    expect(shiftCodeForBookingType("24h")).toBe("D");
    expect(shiftCodeForBookingType("multi-day")).toBe("S");
    expect(shiftCodeForBookingType("custom")).toBe("X");
    expect(shiftCodeForShift({ id: "s", name: "سهرة", periodKind: "evening", startTime: "22:00", endTime: "09:00", weekdayPrice: 0, weekendPrice: 0, isActive: true, color: "#000000" }, "evening")).toBe("N");
  });

  it("resolves shift code from the shift period kind when present", () => {
    const morningShift = { id: "s1", name: "صباحي", periodKind: "morning" as const, startTime: "09:00", endTime: "21:00", weekdayPrice: 0, weekendPrice: 0, isActive: true, color: "#000000" };
    const eveningShift = { id: "s2", name: "سهرة", periodKind: "evening" as const, startTime: "22:00", endTime: "09:00", weekdayPrice: 0, weekendPrice: 0, isActive: true, color: "#000000" };
    expect(shiftCodeForShift(morningShift, "custom")).toBe("M");
    expect(shiftCodeForShift(eveningShift, "morning")).toBe("N");
  });

  it("falls back to the booking type when no shift is available", () => {
    expect(shiftCodeForShift(undefined, "24h")).toBe("D");
  });

  it("normalizes creator, workspace and unit codes to a stable output", () => {
    const ref = smartBookingReference({ creatorCode: "u1011", workspaceCode: "e01", unitCode: "u02", date: "2026-09-04", shiftCode: "m" });
    expect(ref).toBe("#U1011-E01-U02-260904-M");
  });

  it("falls back to safe placeholders for invalid codes", () => {
    const ref = smartBookingReference({ creatorCode: "", workspaceCode: "wrong", unitCode: "?ا", date: "2026-09-04", shiftCode: "" });
    expect(ref).toBe("#U0-E0-U00-260904-X");
  });
});

describe("workspace codes", () => {
  it("normalizes and validates E-prefixed codes", () => {
    expect(normalizeWorkspaceCode(" e01 ")).toBe("E01");
    expect(isValidWorkspaceCode("E01")).toBe(true);
    expect(isValidWorkspaceCode("E999")).toBe(true);
    expect(isValidWorkspaceCode("foo")).toBe(false);
    expect(isValidWorkspaceCode("")).toBe(false);
  });

  it("suggests the next unused E-prefixed workspace code", () => {
    expect(suggestWorkspaceCode(["E01", "E02"])).toBe("E03");
    expect(suggestWorkspaceCode(["E01", "E03"])).toBe("E02");
    expect(suggestWorkspaceCode([])).toBe("E01");
  });
});

describe("bookingReferenceFor with context", () => {
  it("produces the smart format when creator and workspace codes are supplied", () => {
    const booking = base({ chaletId: "ch1" });
    const chalets = [{ id: "ch1", name: "الواحة", referenceCode: "U02", color: "#123456", createdAt: "" }];
    const ref = bookingReferenceFor(booking, chalets, { creatorCode: "U1011", workspaceCode: "E01" });
    expect(ref).toBe("#U1011-E01-U02-260904-M");
  });

  it("keeps a legacy-style reference when no context is supplied (backward compatible)", () => {
    const booking = base({ chaletId: "ch1", bookingType: "morning" });
    const chalets = [{ id: "ch1", name: "الواحة", referenceCode: "U02", color: "#123456", createdAt: "" }];
    expect(bookingReferenceFor(booking, chalets)).toBe("#U022609041");
  });

  it("normalizeBookingReferences forwards the context to smart references", () => {
    const bookings = normalizeBookingReferences([base({ id: "b1", chaletId: "ch1" })], [{ id: "ch1", name: "الواحة", referenceCode: "U02", color: "#123456", createdAt: "" }], { creatorCode: "S2001", workspaceCode: "E02" });
    expect(bookings[0].bookingReference).toBe("#S2001-E02-U02-260904-M");
  });

  it("normalizeBookingReferences preserves an existing smart reference", () => {
    const bookings = normalizeBookingReferences([base({ id: "b1", chaletId: "ch1", bookingReference: "#U1011-E01-U02-260904-M" })], [{ id: "ch1", name: "الواحة", referenceCode: "U02", color: "#123456", createdAt: "" }]);
    expect(bookings[0].bookingReference).toBe("#U1011-E01-U02-260904-M");
  });
});

describe("formatBookingReference", () => {
  it("adds a single leading hashtag and trims separators", () => {
    expect(formatBookingReference("U11")).toBe("#U11");
    expect(formatBookingReference("#U11")).toBe("#U11");
    expect(formatBookingReference("")).toBe("—");
  });
});
