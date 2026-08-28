import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("QA sandbox and shared-staff isolation", () => {
  it("keeps the demo seeder behind the server-side super-admin boundary", () => {
    const router = source("server/routers.ts");
    expect(router).toMatch(/qaSandbox:\s*router\(/);
    expect(router).toMatch(/seed:\s*adminProcedure/);
    expect(router).toMatch(/preview:\s*adminProcedure/);
  });

  it("uses stable sandbox-only identities, creates two isolated facilities, and assigns staff to both", () => {
    const db = source("server/db.ts");
    expect(db).toContain('"stay-in-qa-sandbox-owner-v1"');
    expect(db).toContain('"staff@test.com"');
    expect(db).toContain('"قرية النخلة"');
    expect(db).toContain('"شاليهات الواحة"');
    expect(db).toContain('ensureQaSandboxMembership({ workspaceId: result.workspace.id, userId: staff.id');
    expect(db).toContain("database.delete(activeWorkspaces).where(eq(activeWorkspaces.userId, staff.id))");
  });

  it("keeps role previews non-destructive while exposing facility-scoped units, bookings, and WhatsApp template", () => {
    const db = source("server/db.ts");
    const screen = source("app/admin/qa-sandbox.tsx");
    expect(db).toContain("simulationOnly: true as const");
    expect(db).toContain('action: "qa-sandbox-simulated"');
    expect(db).toContain("whatsAppBaseHeaderTemplate");
    expect(screen).toContain("لا تغيّر جلسة OAuth");
    expect(screen).toContain("اختر المنشأة للعمل");
    expect(screen).toContain("معاينة عزل المنشأة وصلاحيات الدور");
  });

  it("reuses the existing membership selector for real multi-facility routing", () => {
    const selector = source("app/workspace-select.tsx");
    const store = source("lib/booking-store.tsx");
    expect(selector).toContain('memberships.length > 1 ? "اختر المنشأة للعمل"');
    expect(selector).toContain("trpc.workspace.select.useMutation");
    expect(store).toContain("${STORAGE_KEY}:workspace-${activeWorkspaceId}");
    expect(store).toContain("trpc.workspace.data.useQuery");
  });
});
