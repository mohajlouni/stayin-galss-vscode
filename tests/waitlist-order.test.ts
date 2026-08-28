import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/(tabs)/waitlist.tsx"), "utf8");

describe("Waitlist chronological ordering", () => {
  it("places active requests with the nearest actual start time first", () => {
    expect(source).toContain("const waitlistStartTimestamp");
    expect(source).toContain('Date.parse(`${entry.requestedDate}T${entry.startTime ?? "09:00"}:00`)');
    expect(source).toContain("toSorted((left, right) => waitlistStartTimestamp(left) - waitlistStartTimestamp(right))");
  });

  it("keeps converted and cancelled requests in their separate history tabs", () => {
    expect(source).toContain('entry.status === "cancelled"');
    expect(source).toContain('entry.status === "promoted"');
    expect(source).toContain('waitlistTab === "active" ? activeWaitlist : waitlistTab === "promoted" ? promotedWaitlist : cancelledWaitlist');
  });
});
