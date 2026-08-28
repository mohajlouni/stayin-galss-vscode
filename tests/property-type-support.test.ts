import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeAppData, propertyTypeIcon, propertyTypeLabel } from "../lib/booking-model";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("property type support", () => {
  it("migrates existing chalet records to the chalet type without changing linked booking names", () => {
    const data = normalizeAppData({
      chalets: [{ id: "legacy-unit", name: "شاليه المايا", color: "#0F8B83", createdAt: "2026-01-01" }],
      bookings: [{ id: "booking-1", customerName: "أحمد", phone: "0790000000", chaletName: "شاليه المايا", startDate: "2026-08-24", endDate: "2026-08-24", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 100, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-24" }],
    });
    expect(data.chalets[0]).toMatchObject({ id: "legacy-unit", name: "شاليه المايا", propertyType: "chalet" });
    expect(data.bookings[0]).toMatchObject({ chaletId: "legacy-unit", chaletName: "شاليه المايا" });
  });

  it("preserves selected property types and resolves their localized labels and icons", () => {
    const data = normalizeAppData({ chalets: [{ id: "farm", name: "مزرعة السهل", propertyType: "farm", color: "#4D7C0F", createdAt: "2026-01-01" }] });
    expect(data.chalets[0].propertyType).toBe("farm");
    expect(propertyTypeLabel("farm", "ar")).toBe("مزرعة");
    expect(propertyTypeIcon("villa")).toBe("castle");
    expect(propertyTypeLabel("unexpected", "ar")).toBe("شاليه");
  });

  it("uses universal management labels and property-type visual markers in key booking views", () => {
    expect(source("app/chalet-management.tsx")).toContain("إدارة الوحدات / العقارات");
    expect(source("app/chalet-profile.tsx")).toContain("نوع العقار");
    expect(source("components/chalet-switcher.tsx")).toContain("اختيار الوحدة / العقار");
    expect(source("components/booking-card.tsx")).toContain("propertyTypeIcon");
    expect(source("app/(tabs)/calendar.tsx")).toContain("propertyTypeIcon");
  });

  it("renders an RTL property-unit dropdown with image fallback, brand color, and selected state in the booking form", () => {
    const form = source("app/booking-form.tsx");
    expect(form).toContain("الوحدة العقارية");
    expect(form).toContain("PropertyUnitSelector");
    expect(form).toContain("chalet.imageUri");
    expect(form).toContain("propertyTypeIcon(chalet.propertyType)");
    expect(form).toContain("check-circle");
    expect(form).toContain("unitSelectorTrigger");
    expect(form).toContain("unitSelectorSheet");
    expect(form).toContain("اختر الوحدة العقارية");
  });
});
