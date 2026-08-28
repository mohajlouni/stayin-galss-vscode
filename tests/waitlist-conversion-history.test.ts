import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/(tabs)/waitlist.tsx"), "utf8");

describe("Waitlist conversion history", () => {
  it("provides a dedicated promoted tab between active and cancellation history", () => {
    expect(source).toContain('type WaitlistTab = "active" | "promoted" | "cancelled"');
    expect(source).toContain("سجل التحويل إلى الحجز");
    expect(source).toContain("promotedBookingReference");
    expect(source).toContain("promotedByName");
    expect(source).toContain("ConversionHistory");
    expect(source).toContain("تم التحويل إلى حجز مؤكد");
    expect(source).toContain("مرجع الحجز");
    expect(source).toContain("نفّذ التحويل");
  });
});
