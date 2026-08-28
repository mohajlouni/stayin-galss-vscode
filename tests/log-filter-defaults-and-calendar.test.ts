import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

describe("saved log filters and calendar date picker", () => {
  it("stores independent default ranges for activity and ended stays", () => {
    const model = read("lib/booking-model.ts");
    const preferences = read("lib/app-preferences.tsx");
    expect(model).toContain("auditLogDefaultRange");
    expect(model).toContain("activeBookingDefaultRange");
    expect(model).toContain("endedStayDefaultRange");
    expect(preferences).toContain("auditLogDefaultRange");
    expect(preferences).toContain("activeBookingDefaultRange");
    expect(preferences).toContain("endedStayDefaultRange");
  });

  it("exposes default-range controls separately in activity and ended-stay filters", () => {
    const audit = read("app/audit-log.tsx");
    const bookings = read("app/(tabs)/bookings.tsx");
    expect(audit).toContain("updateDeviceSettings({ auditLogDefaultRange: timeRange })");
    expect(audit).toContain('"two-days"');
    expect(audit).toContain('"month"');
    expect(bookings).toContain("endedStayDefaultRange");
    expect(bookings).toContain("activeBookingDefaultRange");
    expect(bookings).toContain('defaultRangeScope={isHistoryView ? "history" : "active"}');
    expect(bookings).toContain("onSetDefault");
  });

  it("uses a calendar picker that displays formatted dates and weekdays", () => {
    const picker = read("components/calendar-date-picker.tsx");
    const bookings = read("app/(tabs)/bookings.tsx");
    expect(picker).toContain("gregorianMonthGrid");
    expect(picker).toContain("weekdayLabel");
    expect(picker).toContain("formatDate");
    expect(bookings).toContain("CalendarDateField");
  });

  it("highlights today and provides a compact year-selection mode", () => {
    const picker = read("components/calendar-date-picker.tsx");
    expect(picker).toContain("const isToday = date === today");
    expect(picker).toContain("todayDot");
    expect(picker).toContain("yearMode");
    expect(picker).toContain("yearChoices");
    expect(picker).toContain("Choose a year");
  });
});
