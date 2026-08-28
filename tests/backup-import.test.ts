import { describe, expect, it } from "vitest";

import { BACKUP_VERSION, parseBackupData, serializeBackup } from "../lib/backup-import";

describe("parseBackupData", () => {
  it("prepares a valid backup for preview while filling optional data safely", () => {
    const result = parseBackupData(JSON.stringify({
      backupVersion: BACKUP_VERSION,
      bookings: [{ id: "booking-1", customerName: "سارة", phone: "0790000000", chaletId: "rose", chaletName: "الوردة", startDate: "2026-08-20", endDate: "2026-08-21", bookingType: "multi-day", startTime: "09:00", endTime: "21:00", price: 150, discountAmount: 0, depositAmount: 40, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-01T10:00:00.000Z" }],
      settings: { businessName: "شاليه الواحة", currency: "د.أ" },
    }));

    expect(result.bookings).toHaveLength(1);
    expect(result.waitlist).toEqual([]);
    expect(result.settings.businessName).toBe("شاليه الواحة");
    expect(result.settings.device?.language).toBe("ar");
  });

  it("rejects a malformed file before it reaches the import confirmation", () => {
    expect(() => parseBackupData(JSON.stringify({ bookings: "not-an-array" }))).toThrow("invalid backup");
    expect(() => parseBackupData(JSON.stringify({ bookings: [{ id: "bad", customerName: "سارة", phone: "", startDate: "not-a-date", endDate: "2026-08-20", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: -1, payments: [], notes: "", status: "confirmed" }], settings: {} }))).toThrow("invalid backup");
    expect(() => parseBackupData("not-json")).toThrow();
  });

  it("rejects invalid time strings and deposit refunds above the recorded deposit", () => {
    const valid = { id: "booking-3", customerName: "نور", phone: "0770000000", startDate: "2026-08-21", endDate: "2026-08-21", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 200, depositAmount: 50, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-20T10:00:00.000Z" };
    expect(() => parseBackupData(JSON.stringify({ bookings: [{ ...valid, startTime: "25:00" }], settings: {} }))).toThrow("invalid backup");
    expect(() => parseBackupData(JSON.stringify({ bookings: [{ ...valid, depositRefunds: [{ id: "refund-1", amount: 60, date: "2026-08-21" }] }], settings: {} }))).toThrow("invalid backup");
  });

  it("serializes a versioned backup that can be restored without changing financial values", () => {
    const raw = serializeBackup({ bookings: [{ id: "booking-2", customerName: "ليان", phone: "0780000000", startDate: "2026-08-21", endDate: "2026-08-21", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 200, discountAmount: 20, depositAmount: 50, payments: [{ id: "payment-1", amount: 80, date: "2026-08-20", recordedAt: "2026-08-20T16:15:00.000Z", paymentMethod: "bank-transfer", receiptUri: "file:///documents/payment-1.jpg" }], depositRefunds: [{ id: "refund-1", amount: 20, date: "2026-08-21", recordedAt: "2026-08-21T17:20:00.000Z", paymentMethod: "wallet" }], notes: "", status: "confirmed", createdAt: "2026-08-20T10:00:00.000Z" }], waitlist: [], turnoverTasks: [], chalets: [], specialPriceRules: [], auditLog: [], settings: { businessName: "الواحة", businessPhone: "", currency: "د.أ", bookingTypes: { morning: { label: "صباحي", startTime: "09:00", endTime: "21:00" }, evening: { label: "سهرة", startTime: "22:00", endTime: "09:00" }, "24h": { label: "24 ساعة", startTime: "09:00", endTime: "09:00" }, custom: { label: "فترة مخصصة", startTime: "09:00", endTime: "17:00" }, "multi-day": { label: "عدة أيام", startTime: "09:00", endTime: "21:00" } } } });
    expect(JSON.parse(raw).backupVersion).toBe(BACKUP_VERSION);
    expect(parseBackupData(raw).bookings[0]).toMatchObject({ price: 200, discountAmount: 20, depositAmount: 50, payments: [{ amount: 80, recordedAt: "2026-08-20T16:15:00.000Z", paymentMethod: "bank-transfer", receiptUri: "file:///documents/payment-1.jpg" }], depositRefunds: [{ amount: 20, recordedAt: "2026-08-21T17:20:00.000Z", paymentMethod: "wallet" }] });
  });

  it("preserves a saved decision to keep an unpaid booking ahead of its waitlist request", () => {
    const result = parseBackupData(JSON.stringify({ backupVersion: BACKUP_VERSION, bookings: [{ id: "booking-priority", customerName: "سامي", phone: "0790000000", startDate: "2026-09-10", endDate: "2026-09-10", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 100, payments: [], notes: "", status: "confirmed", waitlistPriorityAcknowledgedForId: "wait-priority", waitlistPriorityAcknowledgedAt: "2026-09-09T09:00:00.000Z", waitlistPriorityAcknowledgedByName: "المالك", createdAt: "2026-08-20T10:00:00.000Z" }], waitlist: [{ id: "wait-priority", customerName: "قيس", phone: "0790000001", requestedDate: "2026-09-10", endDate: "2026-09-10", bookingType: "morning", startTime: "09:00", endTime: "21:00", notes: "", status: "active", createdAt: "2026-08-20T10:00:00.000Z" }], auditLog: [{ id: "audit-priority", action: "booking-waitlist-priority-confirmed", subjectName: "سامي", details: "تم تأكيد الحجز", createdAt: "2026-09-09T09:00:00.000Z" }], settings: { businessName: "StayIn", currency: "د.أ" } }));
    expect(result.bookings[0]).toMatchObject({ waitlistPriorityAcknowledgedForId: "wait-priority", waitlistPriorityAcknowledgedByName: "المالك" });
    expect(result.auditLog[0].action).toBe("booking-waitlist-priority-confirmed");
  });

  it("preserves the action actor used by the audit-log footer", () => {
    const result = parseBackupData(JSON.stringify({ backupVersion: BACKUP_VERSION, bookings: [], waitlist: [], auditLog: [{ id: "audit-actor", action: "payment-updated", subjectName: "سامي", details: "النخلة · 100 ← 125", actorName: "أحمد", createdAt: "2026-08-22T10:00:00.000Z" }], settings: { businessName: "StayIn", currency: "د.أ" } }));
    expect(result.auditLog[0]).toMatchObject({ action: "payment-updated", actorName: "أحمد" });
  });

  it("preserves the creator role used by booking-card identity indicators", () => {
    const result = parseBackupData(JSON.stringify({ backupVersion: BACKUP_VERSION, bookings: [{ id: "booking-role", customerName: "نور", phone: "0790000000", startDate: "2026-09-10", endDate: "2026-09-10", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 100, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-20T10:00:00.000Z", createdByUserId: 3, createdByName: "أحمد", createdByRole: "employee" }], settings: { businessName: "StayIn", currency: "د.أ" } }));
    expect(result.bookings[0]).toMatchObject({ createdByUserId: 3, createdByName: "أحمد", createdByRole: "employee" });
  });

  it("accepts and preserves the automatic waitlist-cancellation activity from synchronized data", () => {
    const result = parseBackupData(JSON.stringify({
      backupVersion: BACKUP_VERSION,
      bookings: [],
      waitlist: [{ id: "wait-1", customerName: "سامي", phone: "0790000000", requestedDate: "2026-08-23", endDate: "2026-08-23", bookingType: "morning", startTime: "09:00", endTime: "21:00", notes: "", status: "cancelled", cancelledAt: "2026-08-23T09:00:00.000Z", cancellationReason: "start-time", createdAt: "2026-08-22T10:00:00.000Z" }],
      auditLog: [{ id: "audit-wait-1", action: "waitlist-cancelled", subjectName: "سامي", details: "النوح · أُلغي تلقائيًا عند وقت بداية الحجز", createdAt: "2026-08-23T09:00:00.000Z" }],
      settings: { businessName: "StayIn", currency: "د.أ" },
    }));
    expect(result.waitlist[0]).toMatchObject({ status: "cancelled", cancellationReason: "start-time" });
    expect(result.auditLog[0]).toMatchObject({ action: "waitlist-cancelled", subjectName: "سامي" });
  });
});
