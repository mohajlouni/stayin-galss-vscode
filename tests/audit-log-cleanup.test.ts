import { describe, expect, it } from "vitest";

import { normalizeAppData } from "../lib/booking-model";

describe("audit log cleanup", () => {
  it("removes old payment updates that have identical before and after amounts", () => {
    const normalized = normalizeAppData({
      auditLog: [
        { id: "no-change", action: "payment-updated", subjectName: "سامي", details: "النخلة · تم تعديل دفعة الإيجار من 100 د.أ إلى 100 د.أ", createdAt: "2026-08-22T06:41:00.000Z" },
        { id: "changed", action: "payment-updated", subjectName: "سامي", details: "النخلة · تم تعديل دفعة الإيجار من 100 د.أ إلى 125 د.أ", createdAt: "2026-08-22T06:42:00.000Z" },
      ],
    });

    expect(normalized.auditLog.map((entry) => entry.id)).toEqual(["changed"]);
  });
});
