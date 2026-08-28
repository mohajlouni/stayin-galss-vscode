import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

describe("sub-screen header standard", () => {
  it("uses one compact header backed by the shared return component", () => {
    const header = read("components/sub-screen-header.tsx");
    expect(header).toContain("ScreenBackButton");
    expect(header).toContain('fallbackHref = "/(tabs)/more"');
    expect(header).toContain("minHeight: 48");
  });

  it("removes large logo headers from audited management screens", () => {
    const paths = [
      "app/chalet-management.tsx",
      "app/user-management.tsx",
      "app/expenses.tsx",
      "app/turnover-tasks.tsx",
      "app/(tabs)/settings.tsx",
      "app/audit-log.tsx",
      "app/(tabs)/waitlist.tsx",
    ];
    for (const path of paths) expect(read(path)).toContain("SubScreenHeader");
    expect(read("app/user-management.tsx")).not.toContain("CompactScreenHeader");
    expect(read("app/expenses.tsx")).not.toContain("CompactScreenHeader");
    expect(read("app/turnover-tasks.tsx")).not.toContain("CompactScreenHeader");
  });

  it("keeps the regular bookings header and tabbed booking views without a More history screen", () => {
    const bookings = read("app/(tabs)/bookings.tsx");
    expect(bookings).toContain("CompactScreenHeader");
    expect(bookings).toContain('useState<"active" | "history">("active")');
    expect(bookings).not.toContain("isMoreHistory");
  });
});
