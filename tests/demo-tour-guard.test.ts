import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const demoMode = read("lib/demo-mode.tsx");
const demoData = read("lib/demo-data.ts");
const bookingStore = read("lib/booking-store.tsx");
const routeAccessGate = read("components/route-access-gate.tsx");
const workspaceGate = read("app/workspace-gate.tsx");
const rootLayout = read("app/_layout.tsx");

describe("in-memory demo tour and zero-workspace guard", () => {
  it("provides a persisted-free demo mode with enter/exit and an intercepted-write notice", () => {
    expect(demoMode).toContain("DemoModeProvider");
    expect(demoMode).toContain("export function useDemoMode");
    expect(demoMode).toContain("enterDemo");
    expect(demoMode).toContain("exitDemo");
    expect(demoMode).toContain("showDemoNotice");
  });

  it("ships a realistic in-memory mock dataset with sample units, bookings, and financials", () => {
    expect(demoData).toContain("buildDemoAppData");
    expect(demoData).toContain("DEMO_WORKSPACE_ID");
    expect(demoData).toContain("شاليه");
    expect(demoData).toContain("morning");
    expect(demoData).toContain("evening");
    expect(demoData).toContain('"24h"');
    expect(demoData).toContain("expenses");
    expect(demoData).toContain("chalets");
    expect(demoData).toContain("customers");
  });

  it("mounts the mock data in-memory and short-circuits every write so nothing persists", () => {
    expect(bookingStore).toContain("useDemoMode");
    expect(bookingStore).toContain("import { buildDemoAppData }");
    expect(bookingStore).toContain("buildDemoAppData(user?.name)");
    expect(bookingStore).toContain("if (isDemo)");
    expect(bookingStore).toContain("showDemoNotice");
  });

  it("locks zero-workspace users to the workspace gate while allowing demo access to protected routes", () => {
    expect(routeAccessGate).toContain("useDemoMode");
    expect(routeAccessGate).toContain('destination === "onboarding"');
    expect(routeAccessGate).toContain('<Redirect href="/workspace-gate" />');
    expect(workspaceGate).toContain("استكشف التطبيق");
    expect(workspaceGate).toContain("جولة تجريبية");
    expect(workspaceGate).toContain("enterDemo");
  });

  it("wires the demo provider at the root and renders a persistent exit banner", () => {
    expect(rootLayout).toContain("<DemoModeProvider>");
    expect(rootLayout).toContain("<DemoBanner />");
    expect(rootLayout).toContain("الوضع التجريبي");
    expect(rootLayout).toContain("تأسيس منشأتك الحقيقية الآن");
  });
});
