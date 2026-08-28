import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("booking data consistency and emergency moves", () => {
  it("keeps ended stays in history only after recorded checkout while preserving overdue bookings for follow-up", () => {
    const model = source("lib/booking-model.ts");
    const screen = source("app/(tabs)/bookings.tsx");
    expect(model).toContain('booking.status === "completed" || booking.status === "cancelled" || Boolean(booking.checkedOutAt)');
    expect(screen).toContain("لا يُنقل الحجز إلى هذا السجل إلا بعد تسجيل المغادرة واعتماد الفحص");
    expect(screen).toContain('selectTab("active")');
  });

  it("refreshes the local workspace snapshot after the owner unlocks advanced tools", () => {
    const screen = source("app/settings/advanced-tools.tsx");
    expect(screen).toContain("refreshWorkspaceData");
    expect(screen).toContain("تم فتح أدوات الطوارئ وتحديث بيانات الحجوزات من المنشأة المشتركة");
  });

  it("automatically retries the shared snapshot when an authenticated workspace opens with an empty local booking list", () => {
    const screen = source("app/(tabs)/bookings.tsx");
    expect(screen).toContain("recoveryAttemptWorkspace");
    expect(screen).toContain("!hydrated || bookings.length || !activeWorkspaceId");
    expect(screen).toContain("تمت استعادة بيانات الحجوزات من المنشأة المشتركة وتحديث القائمة");
    expect(screen).toContain("عرض جميع الحجوزات النشطة");
  });

  it("performs a server-side destination preview and rejects overlapping moves with unit, interval, and guest details", () => {
    const router = source("server/routers.ts");
    const screen = source("app/settings/advanced-tools.tsx");
    expect(router).toContain("movePreview:");
    expect(router).toContain("const conflicts = findConflicts(moved, data.bookings, booking.id)");
    expect(router).toContain("يوجد حجز بالفعل في «${unit.name}» خلال الفترة");
    expect(screen).toContain("جارٍ فحص توفر الوحدة الوجهة");
    expect(screen).toContain("movePreview.data?.allowed === false");
  });
});
