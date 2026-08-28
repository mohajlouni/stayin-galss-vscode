import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(resolve(process.cwd(), "app/quick-search.tsx"), "utf8");
const home = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");

describe("quick search", () => {
  it("searches bookings and active waitlist requests by guest, phone, and booking reference", () => {
    expect(screen).toContain("booking.bookingReference");
    expect(screen).toContain("entry.status === \"active\"");
    expect(screen).toContain("الاسم أو الهاتف أو مرجع الحجز");
  });

  it("makes the unified search accessible from the home screen", () => {
    expect(home).toContain('appRouter.push("/quick-search" as never)');
    expect(home).toContain("بحث سريع بالاسم أو الهاتف أو المرجع");
  });
});
