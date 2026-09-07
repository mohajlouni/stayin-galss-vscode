import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeAppData, type Booking, type MaintenanceTask, type Settings } from "../lib/booking-model";
import {
  hasMaintenanceCollision,
  isBookingDateMaintenanceBlocked,
  isShiftMaintenanceBlocked,
  isUnitFullyBlocked,
  maintenanceBlockCoversPeriod,
  maintenanceBlocksForChaletDate,
  maintenanceBlocksForDate,
  taskBlockPeriod,
} from "../lib/maintenance-blocks";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const baseTask: MaintenanceTask = {
  id: "mt-1",
  chaletId: "ch-1",
  chaletName: "شاليه البحر",
  title: "صيانة التكييف",
  frequency: "monthly",
  nextDueDate: "2026-03-10",
  status: "scheduled",
  createdAt: "2026-03-01T08:00:00.000Z",
};

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: "b-1",
  customerName: "أحمد",
  phone: "0790000000",
  chaletId: "ch-1",
  chaletName: "شاليه البحر",
  startDate: "2026-03-10",
  endDate: "2026-03-10",
  bookingType: "morning",
  startTime: "09:00",
  endTime: "21:00",
  price: 100,
  payments: [],
  notes: "",
  status: "confirmed",
  createdAt: "2026-03-01T08:00:00.000Z",
  ...overrides,
});

describe("maintenance block periods", () => {
  it("derives the active block period from the task, defaulting to full day", () => {
    expect(taskBlockPeriod({ status: "scheduled", blockBooking: true })).toBe("full_day");
    expect(taskBlockPeriod({ status: "scheduled", blockBooking: true, blockPeriod: "evening" })).toBe("evening");
    expect(taskBlockPeriod({ status: "scheduled", blockBooking: false })).toBeUndefined();
    expect(taskBlockPeriod({ status: "completed", blockBooking: true })).toBeUndefined();
    expect(taskBlockPeriod({ status: "cancelled", blockBooking: true })).toBeUndefined();
    expect(taskBlockPeriod({ status: "in_progress", blockBooking: true })).toBe("full_day");
  });

  it("maps each block period to the matching operational shifts", () => {
    expect(maintenanceBlockCoversPeriod("full_day", "morning")).toBe(true);
    expect(maintenanceBlockCoversPeriod("full_day", "evening")).toBe(true);
    expect(maintenanceBlockCoversPeriod("full_day", "overnight")).toBe(true);
    expect(maintenanceBlockCoversPeriod("morning", "morning")).toBe(true);
    expect(maintenanceBlockCoversPeriod("morning", "evening")).toBe(false);
    expect(maintenanceBlockCoversPeriod("evening", "evening")).toBe(true);
    expect(maintenanceBlockCoversPeriod("evening", "morning")).toBe(false);
    expect(maintenanceBlockCoversPeriod("overnight", "overnight")).toBe(true);
    expect(maintenanceBlockCoversPeriod("overnight", "full_day")).toBe(true);
    expect(maintenanceBlockCoversPeriod("overnight", "morning")).toBe(false);
  });
});

describe("calendar block derivation from active tasks", () => {
  it("lists only non-completed, non-cancelled blocking tasks scheduled on the date and unit", () => {
    const tasks = [
      { ...baseTask, id: "a", status: "scheduled" as const, blockBooking: true, nextDueDate: "2026-03-10" },
      { ...baseTask, id: "b", status: "scheduled" as const, blockBooking: false, nextDueDate: "2026-03-10" },
      { ...baseTask, id: "c", status: "completed" as const, blockBooking: true, nextDueDate: "2026-03-10" },
      { ...baseTask, id: "d", status: "scheduled" as const, blockBooking: true, nextDueDate: "2026-03-11" },
      { ...baseTask, id: "e", chaletId: "ch-2", status: "scheduled" as const, blockBooking: true, nextDueDate: "2026-03-10" },
      { ...baseTask, id: "f", status: "cancelled" as const, blockBooking: true, nextDueDate: "2026-03-10" },
    ];
    expect(maintenanceBlocksForDate(tasks, "2026-03-10").map((task) => task.id).sort()).toEqual(["a", "e"]);
    expect(maintenanceBlocksForChaletDate(tasks, "2026-03-10", "ch-1").map((task) => task.id)).toEqual(["a"]);
    expect(maintenanceBlocksForChaletDate(tasks, "2026-03-10", "ch-2").map((task) => task.id)).toEqual(["e"]);
  });

  it("flags full-day and per-shift blocking for a unit+date", () => {
    const fullDay = [{ ...baseTask, blockBooking: true, blockPeriod: "full_day" as const }];
    expect(isUnitFullyBlocked(fullDay, "2026-03-10", "ch-1")).toBe(true);
    expect(isShiftMaintenanceBlocked(fullDay, "2026-03-10", "ch-1", { id: "s1", name: "صباحي", periodKind: "morning" })).toBe(true);

    const eveningOnly = [{ ...baseTask, blockBooking: true, blockPeriod: "evening" as const }];
    expect(isUnitFullyBlocked(eveningOnly, "2026-03-10", "ch-1")).toBe(false);
    expect(isShiftMaintenanceBlocked(eveningOnly, "2026-03-10", "ch-1", { id: "s1", name: "صباحي", periodKind: "morning" })).toBe(false);
    expect(isShiftMaintenanceBlocked(eveningOnly, "2026-03-10", "ch-1", { id: "s2", name: "مسائي", periodKind: "evening" })).toBe(true);
  });

  it("lets a completed, cancelled, or deleted task release the calendar block automatically", () => {
    expect(isUnitFullyBlocked([{ ...baseTask, status: "completed" as const, blockBooking: true, blockPeriod: "full_day" as const }], "2026-03-10", "ch-1")).toBe(false);
    expect(isUnitFullyBlocked([{ ...baseTask, status: "cancelled" as const, blockBooking: true, blockPeriod: "full_day" as const }], "2026-03-10", "ch-1")).toBe(false);
    expect(isUnitFullyBlocked([], "2026-03-10", "ch-1")).toBe(false);
    // Rescheduling moves the block (new due date), freeing the old date.
    expect(isUnitFullyBlocked([{ ...baseTask, blockBooking: true, blockPeriod: "full_day" as const }], "2026-03-11", "ch-1")).toBe(false);
  });
});

describe("booking collision verification", () => {
  it("rejects a full-day block over a confirmed booking on the same date", () => {
    const task = { ...baseTask, blockBooking: true, blockPeriod: "full_day" as const };
    expect(hasMaintenanceCollision(task, [booking()], DEFAULT_SETTINGS)).toBe(true);
  });

  it("allows a period block when the conflicting booking is in the other shift", () => {
    const task = { ...baseTask, blockBooking: true, blockPeriod: "morning" as const };
    const eveningBooking = booking({ bookingType: "evening", startTime: "22:00", endTime: "09:00" });
    expect(hasMaintenanceCollision(task, [eveningBooking], DEFAULT_SETTINGS)).toBe(false);
  });

  it("does not count cancelled/completed/waitlisted bookings as collisions", () => {
    const task = { ...baseTask, blockBooking: true, blockPeriod: "full_day" as const };
    expect(hasMaintenanceCollision(task, [booking({ status: "cancelled" })], DEFAULT_SETTINGS)).toBe(false);
    expect(hasMaintenanceCollision(task, [booking({ status: "completed" })], DEFAULT_SETTINGS)).toBe(false);
    expect(hasMaintenanceCollision(task, [booking({ status: "waitlisted" })], DEFAULT_SETTINGS)).toBe(false);
  });

  it("ignores collisions on other units and when blocking is off", () => {
    const task = { ...baseTask, blockBooking: true, blockPeriod: "full_day" as const };
    expect(hasMaintenanceCollision(task, [booking({ chaletId: "ch-9" })], DEFAULT_SETTINGS)).toBe(false);
    expect(hasMaintenanceCollision({ ...baseTask, blockBooking: false }, [booking()], DEFAULT_SETTINGS)).toBe(false);
  });

  it("locks new bookings landing on a maintenance-blocked unit/date", () => {
    const tasks = [{ ...baseTask, blockBooking: true, blockPeriod: "full_day" as const }];
    expect(isBookingDateMaintenanceBlocked(tasks, "2026-03-10", "ch-1", "morning")).toBe(true);
    expect(isBookingDateMaintenanceBlocked(tasks, "2026-03-09", "ch-1", "morning")).toBe(false);
    expect(isBookingDateMaintenanceBlocked([], "2026-03-10", "ch-1", "morning")).toBe(false);
    // period-specific block frees the untouched shift
    const eveningOnly = [{ ...baseTask, blockBooking: true, blockPeriod: "evening" as const }];
    expect(isBookingDateMaintenanceBlocked(eveningOnly, "2026-03-10", "ch-1", "morning")).toBe(false);
    expect(isBookingDateMaintenanceBlocked(eveningOnly, "2026-03-10", "ch-1", "evening")).toBe(true);
  });
});

describe("data model normalization", () => {
  it("preserves blockBooking and blockPeriod through normalizeAppData", () => {
    const data = normalizeAppData({
      chalets: [],
      bookings: [],
      waitlist: [],
      turnoverTasks: [],
      specialPriceRules: [],
      auditLog: [],
      settings: DEFAULT_SETTINGS as unknown as Settings,
      maintenanceTasks: [{ ...baseTask, blockBooking: true, blockPeriod: "overnight" }],
    });
    expect(data.maintenanceTasks?.[0]?.blockBooking).toBe(true);
    expect(data.maintenanceTasks?.[0]?.blockPeriod).toBe("overnight");
    expect(data.maintenanceTasks?.[0]?.title).toBe("صيانة التكييف");
  });
});

describe("STEP 2 UI wiring sanity", () => {
  it("exposes the blocking toggle and scope selector in the maintenance modal", () => {
    const source = read("app/maintenance-dashboard.tsx");
    expect(source).toContain("إيقاف حجز الوحدة أثناء الصيانة");
    expect(source).toContain("blockBooking");
    expect(source).toContain("blockPeriod");
    expect(source).toContain("maintenance-block-collision");
    expect(source).toContain("يوجد حجز مؤكد مسبقاً للوحدة في هذا الموعد");
  });

  it("renders the calendar maintenance badge and locks blocked shifts", () => {
    const source = read("app/(tabs)/calendar.tsx");
    expect(source).toContain("isShiftMaintenanceBlocked");
    expect(source).toContain("صيانة: ");
    expect(source).toContain("hasMaintenance");
  });

  it("guards the standalone booking form against maintenance-blocked slots", () => {
    const source = read("app/booking-form.tsx");
    expect(source).toContain("isBookingDateMaintenanceBlocked");
  });
});