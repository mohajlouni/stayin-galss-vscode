import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync("app/chalet-profile.tsx", "utf8");

describe("chalet profile fixed six periods", () => {
  it("defines exactly six locked periods with the required names", () => {
    for (const name of ["صباحي", "سهرة", "يوم كامل", "عدة أيام", "مناسبة / تصوير", "فترة مخصصة"]) {
      expect(source).toContain(name);
    }
  });

  it("activates the first four and pauses the last two by default", () => {
    const activeCount = (source.match(/defaultActive: true/g) || []).length;
    const pausedCount = (source.match(/defaultActive: false/g) || []).length;
    expect(activeCount).toBe(4);
    expect(pausedCount).toBe(2);
  });

  it("removes the add-shift, delete, and color-picker controls", () => {
    expect(source).not.toContain("إضافة فترة مخصصة");
    expect(source).not.toContain("Add custom shift");
    expect(source).not.toContain("Remove shift");
    expect(source).not.toContain("updateShiftPeriodKind");
    expect(source).not.toContain("RESERVED_PERIOD_META");
    expect(source).not.toContain("removeShift(");
  });

  it("shows a next-day badge when the period crosses midnight", () => {
    expect(source).toContain("اليوم التالي");
    expect(source).toContain("crossesMidnight");
  });

  it("renders shift times through the account time format (12h/24h)", () => {
    expect(source).toContain("formatTime(shift.startTime)");
    expect(source).toContain("formatTime(shift.endTime)");
    expect(source).toContain('"12h" ? "12 ساعة" : "24 ساعة"');
  });

  it("uses a wheel time picker instead of manual typing", () => {
    expect(source).toContain("DateTimePicker");
    expect(source).toContain('mode="time"');
  });
});
