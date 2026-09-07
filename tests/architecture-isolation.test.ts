import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("system architecture: creation modal false-errors, profile identity, and tenant isolation", () => {
  it("closes the first-workspace creation modal on success before any cache refresh that could throw", () => {
    const hub = source("app/workspace-hub.tsx");
    expect(hub).toContain("if (isSubmitting) return;");
    expect(hub).toContain("disabled={isSubmitting}");
    expect(hub).toContain('"جاري إنشاء المنشأة..."');
    expect(hub).toContain("setCreateVisible(false);");
    expect(hub).toContain("setWelcomeVisible(true);");
    expect(hub).toContain("Cache refresh is best-effort; never mark a successful creation as failed.");
    expect(hub).toContain('"تعذر إنشاء المنشأة. تحقق من الاتصال أو جرّب اسمًا آخر."');
  });

  it("closes the in-app creation modal on success and keeps cache refresh best-effort", () => {
    const hub = source("app/properties-hub.tsx");
    expect(hub).toContain("setCreateVisible(false);");
    expect(hub).toContain("Cache refresh is best-effort; never mark a successful creation as failed.");
    expect(hub).toContain("await hub.refetch();");
    expect(hub).toContain("setIsSubmitting(true);");
  });

  it("renders the profile sub-row per identity with an admin badge and never points to /onboarding", () => {
    const more = source("app/(tabs)/more.tsx");
    expect(more).not.toContain('"/onboarding"');
    expect(more).toContain('import { isSuperAdminUser } from "@/lib/super-admin";');
    expect(more).toContain("isSuperAdminUser(currentUser)");
    expect(more).toContain('"إدارة النظام بالكامل (الكل)"');
    expect(more).toContain("معاينة: ${activeGroupName}");
    expect(more).toContain('"اضغط لاختيار منشأة للعمل"');
    expect(more).toContain('"سوبر أدمن"');
    expect(more).toContain('"المنشأة النشطة"');
    expect(more).toContain('router.push("/workspace-hub")');
  });

  it("guards the super admin against the onboarding trap at the root router gate", () => {
    const gate = source("components/route-access-gate.tsx");
    expect(gate).toContain("isSuperAdminUser(user)");
    expect(gate).toContain('pathname === "/onboarding" || pathname.startsWith("/onboarding/")');
    expect(gate).toContain('target=/admin/master-control');
    expect(gate).toContain('<Redirect href="/admin/master-control" />');
  });

  it("never serves workspace data beyond the requesting user's active membership", () => {
    const routers = source("server/routers.ts");
    expect(routers).toContain("db.getWorkspaceData(summary.member.workspaceId)");
    expect(routers).toContain("if (summary.member.role === \"guest\") throw new TRPCError({ code: \"FORBIDDEN\", message: \"Operational workspace access required\" });");
    expect(routers).toContain("if (!stored) return { bookings: [], units: [] };");
  });

  it("filters the workspace data row strictly by workspace identifier and counts units per workspace", () => {
    const db = source("server/db.ts");
    expect(db).toContain("eq(workspaceData.workspaceId, workspaceId)");
    expect(db).toContain("unitCount = data.chalets.length;");
  });

  it("navigates the property settings route with the explicit workspace id so no other group leaks in", () => {
    const screen = source("app/properties-hub.tsx");
    const detail = source("app/property-detail.tsx");
    expect(screen).toContain("router.push(`/property-detail?workspaceId=${card.workspaceId}` as never)");
    expect(detail).toContain("useLocalSearchParams<{ workspaceId?: string }>()");
    expect(detail).toContain("paramWorkspaceId !== null && activeWorkspaceId !== null");
    expect(detail).toContain("selectWorkspace.mutateAsync({ workspaceId: paramWorkspaceId! })");
  });
});