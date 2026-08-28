import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const moreScreens = [
  "app/(tabs)/waitlist.tsx",
  "app/(tabs)/settings.tsx",
  "app/chalet-management.tsx",
  "app/audit-log.tsx",
  "app/user-management.tsx",
];

describe("more sub-screen navigation", () => {
  it("uses the shared compact header for every direct More sub-screen", () => {
    moreScreens.forEach((path) => {
      const source = read(path);
      expect(source).toContain("SubScreenHeader");
    });
    const header = read("components/sub-screen-header.tsx");
    expect(header).toContain('fallbackHref = "/(tabs)/more"');
    expect(header).toContain("returnToFallback");
  });

  it("keeps the More tab root free of a redundant back action", () => {
    expect(read("app/(tabs)/more.tsx")).not.toContain("backHref=");
  });

  it("does not expose a separate booking history route from More", () => {
    expect(read("app/(tabs)/more.tsx")).not.toContain('route: "/booking-history"');
    expect(read("app/booking-history.tsx")).toContain('href={"/(tabs)/bookings"');
    const bookings = read("app/(tabs)/bookings.tsx");
    expect(bookings).not.toContain("isMoreHistory");
    expect(bookings).not.toContain("mode=history");
  });

  it("supports an explicit route return before attempting stack history", () => {
    const button = read("components/screen-back-button.tsx");
    expect(button).toContain("returnToFallback?: boolean");
    expect(button).toContain("if (returnToFallback) router.replace(fallbackHref)");
  });
});
