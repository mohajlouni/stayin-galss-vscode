import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_DEVICE_SETTINGS, DEFAULT_SETTINGS, normalizeAppData, type AppData } from "../lib/booking-model";
import { isWorkspaceSessionError, isWorkspaceVersionConflict, mergeWorkspaceAppData } from "../lib/workspace-sync";

const bookingStoreSource = readFileSync(resolve(process.cwd(), "lib/booking-store.tsx"), "utf8");

function makeData(overrides: Partial<AppData> = {}) {
  return normalizeAppData({
    bookings: [],
    waitlist: [],
    turnoverTasks: [],
    expenses: [],
    chalets: [],
    specialPriceRules: [],
    auditLog: [],
    settings: { ...DEFAULT_SETTINGS, businessName: "StayIn", businessPhone: "", currency: "د.أ", ...overrides.settings },
    ...overrides,
  });
}

describe("workspace synchronization safeguards", () => {
  it("keeps device-only bookings, chalets, and message templates when workspace data arrives", () => {
    const workspace = makeData({
      chalets: [{ id: "remote-chalet", name: "النوح", color: "#0F8B83", createdAt: "2026-08-20T00:00:00.000Z" }],
    });
    const device = makeData({
      chalets: [{ id: "device-chalet", name: "آدم", color: "#EA580C", createdAt: "2026-08-23T00:00:00.000Z" }],
      bookings: [{ id: "device-booking", customerName: "سعد", phone: "0799999999", chaletId: "device-chalet", chaletName: "آدم", startDate: "2026-08-24", endDate: "2026-08-24", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 100, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-23T00:00:00.000Z" }],
      settings: { ...DEFAULT_SETTINGS, businessName: "StayIn", businessPhone: "", currency: "د.أ", device: { ...DEFAULT_DEVICE_SETTINGS, receiptMessageTemplate: "قالب جديد محفوظ" } },
    });

    const result = mergeWorkspaceAppData(workspace, device);

    expect(result.merged).toBe(true);
    expect(result.data.chalets.map((item) => item.id)).toEqual(["remote-chalet", "device-chalet"]);
    expect(result.data.bookings.map((item) => item.id)).toContain("device-booking");
    expect(result.data.settings.device?.receiptMessageTemplate).toBe("قالب جديد محفوظ");
  });

  it("preserves local additions when a manual refresh receives an older workspace snapshot", () => {
    const olderWorkspace = makeData({
      bookings: [{ id: "remote-booking", customerName: "ضيف سابق", phone: "0791111111", chaletName: "النوح", startDate: "2026-08-20", endDate: "2026-08-20", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 90, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-20T00:00:00.000Z" }],
    });
    const currentDevice = makeData({
      bookings: [{ id: "new-device-booking", customerName: "حجز جديد", phone: "0792222222", chaletName: "آدم", startDate: "2026-08-24", endDate: "2026-08-24", bookingType: "evening", startTime: "22:00", endTime: "09:00", price: 125, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-23T18:00:00.000Z" }],
      settings: { ...DEFAULT_SETTINGS, businessName: "StayIn", businessPhone: "", currency: "د.أ", device: { ...DEFAULT_DEVICE_SETTINGS, readyMessageTemplate: "قالب محلي جديد" } },
    });

    const refreshed = mergeWorkspaceAppData(olderWorkspace, currentDevice).data;

    expect(refreshed.bookings.map((item) => item.id)).toEqual(expect.arrayContaining(["remote-booking", "new-device-booking"]));
    expect(refreshed.settings.device?.readyMessageTemplate).toBe("قالب محلي جديد");
  });

  it("does not overwrite workspace templates with untouched defaults from a device that only has a new booking", () => {
    const workspace = makeData({
      settings: { ...DEFAULT_SETTINGS, businessName: "StayIn", businessPhone: "", currency: "د.أ", device: { ...DEFAULT_DEVICE_SETTINGS, readyMessageTemplate: "قالب المنشأة المحفوظ" } },
    });
    const device = makeData({
      bookings: [{ id: "offline-booking", customerName: "حجز محلي", phone: "0793333333", chaletName: "آدم", startDate: "2026-08-25", endDate: "2026-08-25", bookingType: "morning", startTime: "09:00", endTime: "21:00", price: 100, payments: [], notes: "", status: "confirmed", createdAt: "2026-08-23T18:00:00.000Z" }],
    });

    const merged = mergeWorkspaceAppData(workspace, device).data;

    expect(merged.bookings.map((item) => item.id)).toContain("offline-booking");
    expect(merged.settings.device?.readyMessageTemplate).toBe("قالب المنشأة المحفوظ");
  });

  it("distinguishes an actual version conflict from a stale session", () => {
    expect(isWorkspaceVersionConflict({ data: { code: "CONFLICT" } })).toBe(true);
    expect(isWorkspaceVersionConflict({ data: { code: "UNAUTHORIZED" } })).toBe(false);
    expect(isWorkspaceSessionError({ data: { code: "UNAUTHORIZED" } })).toBe(true);
    expect(isWorkspaceSessionError({ data: { code: "CONFLICT" } })).toBe(false);
  });

  it("imports legacy device data into one workspace only before scoped storage takes over", () => {
    expect(bookingStoreSource).toContain("LEGACY_MIGRATION_WORKSPACE_KEY");
    expect(bookingStoreSource).toContain("!raw && !migratedWorkspaceId");
    expect(bookingStoreSource).toContain("AsyncStorage.setItem(LEGACY_MIGRATION_WORKSPACE_KEY, String(activeWorkspaceId))");
  });
});
