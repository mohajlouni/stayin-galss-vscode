import { describe, expect, it } from "vitest";
import { advanceMaintenanceDueDate, assetConditionLabel, isMaintenanceDueToday, isMaintenanceOverdue, isMaintenanceUpcoming, maintenanceDueInDays, maintenanceFrequencyLabel, maintenanceIntervalDays, maintenanceStats, maintenanceTaskStatusLabel, nextMaintenanceDueDate } from "../lib/maintenance";
import { localDateISO, type MaintenanceTask } from "../lib/booking-model";

const task: MaintenanceTask = {
  id: "m1",
  chaletId: "ch1",
  chaletName: "شاليه الأمل",
  title: "فحص المكيف",
  frequency: "weekly",
  nextDueDate: "2026-01-10",
  status: "pending",
  createdAt: "2026-01-01T10:00:00.000Z",
};

describe("maintenance scheduling", () => {
  it("maps frequencies to day intervals", () => {
    expect(maintenanceIntervalDays({ frequency: "daily" })).toBe(1);
    expect(maintenanceIntervalDays({ frequency: "weekly" })).toBe(7);
    expect(maintenanceIntervalDays({ frequency: "monthly" })).toBe(30);
    expect(maintenanceIntervalDays({ frequency: "custom", customIntervalDays: 45 })).toBe(45);
    expect(maintenanceIntervalDays({ frequency: "custom", customIntervalDays: undefined })).toBe(1);
    expect(maintenanceIntervalDays({ frequency: "custom", customIntervalDays: -3 })).toBe(3);
  });

  it("advances due dates in whole days without month corruption", () => {
    expect(advanceMaintenanceDueDate("2026-01-31", 1)).toBe("2026-02-01");
    expect(advanceMaintenanceDueDate("2026-01-28", 30)).toBe("2026-02-27");
  });

  it("computes the next due date from last completion or creation", () => {
    expect(nextMaintenanceDueDate({ frequency: "weekly", createdAt: "2026-01-01T10:00:00.000Z" })).toBe("2026-01-08");
    expect(nextMaintenanceDueDate({ frequency: "daily", lastCompletedDate: "2026-01-05", createdAt: "2026-01-01T10:00:00.000Z" })).toBe("2026-01-06");
  });
});

describe("maintenance due windows", () => {
  it("classifies overdue, due today, and upcoming", () => {
    const now = new Date("2026-01-10T12:00:00Z").getTime();
    const today = localDateISO(new Date(now));
    expect(isMaintenanceOverdue({ ...task, nextDueDate: "2026-01-09", status: "pending" }, now)).toBe(true);
    expect(isMaintenanceOverdue({ ...task, nextDueDate: today, status: "pending" }, now)).toBe(false);
    expect(isMaintenanceDueToday({ ...task, nextDueDate: today, status: "pending" }, now)).toBe(true);
    expect(isMaintenanceDueToday({ ...task, nextDueDate: "2026-01-12", status: "pending" }, now)).toBe(false);
    expect(isMaintenanceUpcoming({ ...task, nextDueDate: "2026-01-13", status: "pending" }, now)).toBe(true);
    expect(isMaintenanceUpcoming({ ...task, nextDueDate: "2026-01-20", status: "pending" }, now)).toBe(false);
    expect(isMaintenanceDueToday({ ...task, nextDueDate: "2026-01-10", status: "completed" }, now)).toBe(false);
  });

  it("normalizes due-in-days arithmetic", () => {
    expect(maintenanceDueInDays({ nextDueDate: "2026-01-10" }, new Date("2026-01-10T12:00:00Z").getTime())).toBe(0);
    expect(maintenanceDueInDays({ nextDueDate: "2026-01-11" }, new Date("2026-01-10T12:00:00Z").getTime())).toBe(1);
    expect(maintenanceDueInDays({ nextDueDate: "january" }, Date.now())).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("maintenanceStats", () => {
  it("groups tasks by urgency", () => {
    const now = new Date("2026-01-10T12:00:00Z").getTime();
    const today = localDateISO(new Date(now));
    const stats = maintenanceStats([
      { ...task, nextDueDate: "2026-01-05", status: "in_progress" },
      { ...task, id: "m2", nextDueDate: today, status: "pending" },
      { ...task, id: "m3", nextDueDate: "2026-01-12", status: "pending" },
      { ...task, id: "m4", nextDueDate: "2026-01-08", status: "completed" },
    ], now);
    expect(stats).toEqual({ overdue: 1, dueToday: 1, upcoming: 1, completed: 1, total: 4 });
  });
});

describe("labels", () => {
  it("localizes maintenance and asset labels", () => {
    expect(maintenanceFrequencyLabel("weekly", "ar")).toBe("أسبوعيًا");
    expect(maintenanceFrequencyLabel("daily", "en")).toBe("Daily");
    expect(maintenanceTaskStatusLabel("in_progress", "ar")).toBe("قيد التنفيذ");
    expect(assetConditionLabel("needs_service", "ar")).toBe("بحاجة لصيانة");
    expect(assetConditionLabel("good", "en")).toBe("Good");
  });
});