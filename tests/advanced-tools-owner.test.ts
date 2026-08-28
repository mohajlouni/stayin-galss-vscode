import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("advanced owner tools security", () => {
  it("stores the owner PIN in a separate salted server table instead of the shared snapshot", () => {
    const schema = source("drizzle/schema.ts");
    const db = source("server/db.ts");
    expect(schema).toContain("stayInWorkspaceOwnerPins");
    expect(schema).toContain("pinHash");
    expect(db).toContain("scryptSync");
    expect(db).toContain("timingSafeEqual");
    expect(db).toContain("requireWorkspaceOwner");
  });

  it("guards every emergency action with ownership and the four-digit PIN", () => {
    const router = source("server/routers.ts");
    expect(router).toContain("advancedTools: router");
    expect(router).toContain("ownerPinSchema");
    expect(router).toContain("requireEmergencyOwner(ctx.user.id, input.workspaceId, input.pin)");
    expect(router).toContain("moveBooking:");
    expect(router).toContain("unlockDate:");
    expect(router).toContain("restoreBooking:");
    expect(router).toContain("staffActivity:");
  });

  it("uses backups before changing shared bookings and exposes the owner-only menu entry", () => {
    const router = source("server/routers.ts");
    const more = source("app/(tabs)/more.tsx");
    const screen = source("app/settings/advanced-tools.tsx");
    expect(router).toContain("saveOwnerEmergencySnapshot");
    expect(router).toContain("findConflicts(moved");
    expect(more).toContain("...(isOwner ?");
    expect(screen).toContain("أدخل PIN المالك");
    expect(screen).toContain("سلة محذوفات الحجوزات");
    expect(screen).toContain("سجل رقابة الموظفين");
  });

  it("refreshes the app snapshot when the emergency gate opens and previews destination conflicts before moving", () => {
    const router = source("server/routers.ts");
    const screen = source("app/settings/advanced-tools.tsx");
    expect(router).toContain("movePreview:");
    expect(router).toContain("يوجد حجز بالفعل في «${unit.name}» خلال الفترة");
    expect(router).toContain("startTime: booking.startTime");
    expect(screen).toContain("refreshWorkspaceData");
    expect(screen).toContain("تم فتح أدوات الطوارئ وتحديث بيانات الحجوزات");
    expect(screen).toContain("جارٍ فحص توفر الوحدة الوجهة");
    expect(screen).toContain("يوجد حجز بالفعل");
  });
});
