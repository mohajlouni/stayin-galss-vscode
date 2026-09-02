import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { GUEST_PERMISSIONS, MANAGER_PERMISSIONS, permissionsForWorkspaceRole } from "../shared/workspace-permissions";

const projectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("multi-tenant identity foundation", () => {
  it("maps organization roles to explicit permission baselines", () => {
    expect(permissionsForWorkspaceRole("owner")).toEqual(MANAGER_PERMISSIONS);
    expect(permissionsForWorkspaceRole("admin")).toEqual(MANAGER_PERMISSIONS);
    expect(permissionsForWorkspaceRole("guest")).toEqual(GUEST_PERMISSIONS);
    expect(permissionsForWorkspaceRole("staff").create_bookings).toBe(true);
    expect(permissionsForWorkspaceRole("caretaker").create_bookings).toBe(false);
  });

  it("persists the active organization and supports all required membership roles", () => {
    const schema = projectFile("drizzle/schema.ts");
    expect(schema).toContain('WORKSPACE_ROLES = ["owner", "admin", "staff", "caretaker", "guest"]');
    expect(schema).toContain('mysqlTable("stayInActiveWorkspaces"');
    expect(schema).toContain('role: mysqlEnum("role", WORKSPACE_ROLES)');
  });

  it("exposes safe routing, tenant selection, and tenant-scoped workspace endpoints", () => {
    const database = projectFile("server/db.ts");
    const router = projectFile("server/routers.ts");
    const gate = projectFile("app/workspace-gate.tsx");
    const selector = projectFile("app/workspace-select.tsx");
    const bookingStore = projectFile("lib/booking-store.tsx");
    expect(database).toContain("getWorkspaceRouting");
    expect(database).toContain("setActiveWorkspace");
    expect(router).toContain("routing: protectedProcedure");
    expect(router).toContain("select: protectedProcedure");
    expect(router).toContain("create: protectedProcedure");
    expect(gate).toContain("<Redirect");
    expect(gate).toContain('"/auth/select-workspace"');
    expect(selector).toContain("selectWorkspace.mutateAsync");
    expect(bookingStore).toContain("scopedStorageKey");
    expect(bookingStore).toContain("canSyncWorkspace");
  });
});
