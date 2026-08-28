import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeGate = readFileSync(resolve(process.cwd(), "components/route-access-gate.tsx"), "utf8");
const workspaceAccess = readFileSync(resolve(process.cwd(), "lib/workspace-access.ts"), "utf8");
const bookings = readFileSync(resolve(process.cwd(), "app/(tabs)/bookings.tsx"), "utf8");
const calendar = readFileSync(resolve(process.cwd(), "app/(tabs)/calendar.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "app/(tabs)/settings.tsx"), "utf8");

describe("Step 1 route privacy and RTL regressions", () => {
  it("keeps private routes behind a declarative session gate", () => {
    expect(routeGate).toContain("PUBLIC_ROUTE_PREFIXES");
    expect(routeGate).toContain("usePathname");
    expect(routeGate).toContain('if (!isAuthenticated && !isPublicRoute(pathname))');
    expect(routeGate).toContain('<Redirect href="/auth/login" />');
    expect(routeGate).not.toContain("router.replace(");
    expect(workspaceAccess).toContain("? GUEST_PERMISSIONS");
  });

  it("derives booking filter and operational layouts from the RTL row", () => {
    expect(bookings).toContain('const row = isRTL ? "row-reverse" : "row";');
    expect(bookings).toContain('contentContainerStyle={[styles.filterOptions, { flexDirection: row');
    expect(bookings).toContain('style={[styles.scrollHint, { flexDirection: row }]}');
    expect(bookings).toContain('const row = language === "ar" ? "row-reverse" : "row";');
    expect(bookings).toContain('style={[styles.scopeBlock, { flexDirection: row }]}');
  });

  it("derives calendar legends, slot actions, and settings controls from RTL", () => {
    expect(calendar).toContain('isRTL={isRTL}');
    expect(calendar).toContain('flexDirection: isRTL ? "row-reverse" : "row"');
    expect(calendar).toContain('flexDirection: row, backgroundColor: colors.surfaceMuted');
    expect(settings).toContain('const row = isRTL ? "row-reverse" : "row";');
    expect(settings).toContain('flexDirection: align === "right" ? "row-reverse" : "row"');
    expect(settings).toContain('flexDirection: isRTL ? "row-reverse" : "row"');
  });
});
