import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("master-control routing vs onboarding isolation", () => {
  it("PHASE 1: routes the super admin 'Full system administration (All)' profile row to the command center", () => {
    const more = source("app/(tabs)/more.tsx");
    expect(more).toContain('"إدارة النظام بالكامل (الكل)"');
    expect(more).toContain("isSuperAdminUserAccount && !activeGroupName ? router.push(\"/admin/master-control\") : router.push(\"/workspace-hub\")");
    expect(more).not.toContain('router.push("/onboarding")');
    expect(more).not.toContain('router.replace("/onboarding")');
    expect(more).toContain('"/admin/master-control"');
  });

  it("PHASE 2: blocks /onboarding for every existing account — super admin goes to master control, owners to their dashboard", () => {
    const gate = source("components/route-access-gate.tsx");
    expect(gate).toContain('pathname === "/onboarding" || pathname.startsWith("/onboarding/")');
    expect(gate).toContain("<Redirect href=\"/admin/master-control\" />");
    expect(gate).toContain('const target = workspaceCount >= 1 ? "/calendar" : "/workspace-hub";');
    expect(gate).toContain("<Redirect href={target} />");
    expect(gate).not.toContain("!isDemo");
    expect(gate).toContain("isSuperAdminUser(user)");
  });

  it("PHASE 2/3: the gate never renders or navigates to onboarding; the hub remains reachable and separated", () => {
    const gate = source("components/route-access-gate.tsx");
    const hub = source("app/workspace-hub.tsx");
    expect(gate).not.toContain("render(<Onboarding");
    expect(gate).not.toContain('router.replace("/onboarding")');
    expect(hub).toContain("محور المنشأة والدور");
    expect(hub).toContain("أدخل رمز الدعوة");
  });
});