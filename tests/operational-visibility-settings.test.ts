import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

describe("operational visibility settings", () => {
  it("defaults operational controls to visible and migrates older settings safely", () => {
    const model = read("lib/booking-model.ts");
    expect(model).toContain("showGuestCheckIn: true");
    expect(model).toContain("showTurnoverTasks: true");
    expect(model).toContain("showDailyTasks: true");
    expect(model).toContain("showGuestCheckIn: incomingSettings.device.showGuestCheckIn !== false");
  });

  it("exposes three persisted operational switches in settings", () => {
    const settings = read("app/(tabs)/settings.tsx");
    expect(settings).toContain("إظهار تسجيل وصول الضيف");
    expect(settings).toContain("إظهار التنظيف والفحص");
    expect(settings).toContain("إظهار مهام اليوم");
    expect(settings).toContain("updateDeviceSettings({ showDailyTasks: value })");
  });

  it("applies the visibility controls in the Home and bookings workflows", () => {
    const home = read("app/(tabs)/index.tsx");
    const bookings = read("app/(tabs)/bookings.tsx");
    const daily = read("components/daily-operations-panel.tsx");
    expect(home).toContain("deviceSettings.showGuestCheckIn");
    expect(bookings).toContain("deviceSettings.showGuestCheckIn");
    expect(home).toContain("deviceSettings.showDailyTasks");
    expect(home).toContain("showTurnoverAction={deviceSettings.showTurnoverTasks}");
    expect(daily).toContain("showTurnoverAction = true");
  });
});
