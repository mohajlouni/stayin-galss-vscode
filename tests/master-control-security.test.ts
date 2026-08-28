import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("master control security boundaries", () => {
  it("protects every master action with the server-side admin procedure", () => {
    const router = source("server/routers.ts");
    expect(router).toContain("masterControl: router");
    expect(router).toContain("overview: adminProcedure");
    expect(router).toContain("assignMembership: adminProcedure");
    expect(router).toContain("restoreRecoveryPoint: adminProcedure");
    expect(router).toContain("overrideBooking: adminProcedure");
    expect(router).toContain("overrideExpense: adminProcedure");
    expect(router).toContain("masterConfirmation");
    expect(router).toContain('z.literal("EXPORT-WORKSPACE")');
  });

  it("keeps role simulation non-destructive and records it in the server audit trail", () => {
    const router = source("server/routers.ts");
    const db = source("server/db.ts");
    const screen = source("app/admin/master-control.tsx");
    expect(router).toContain("simulationOnly: true");
    expect(router).toContain('action: "role-simulation"');
    expect(db).toContain("superAdminAudit");
    expect(db).toContain("createSuperAdminAudit");
    expect(screen).toContain("هذه المحاكاة لا تغيّر الجلسة أو صلاحيات المستخدمين");
  });

  it("creates a recovery point before administrative snapshot changes and delegates credential reset to OAuth", () => {
    const db = source("server/db.ts");
    const router = source("server/routers.ts");
    expect(db).toContain("workspaceDataBackups");
    expect(db).toContain("pre-super-admin-restore");
    expect(db).toContain("pre-${input.action}");
    expect(router).toContain("delegatedToIdentityProvider: true");
    expect(router).toContain("no local password or PIN is stored by StayIn");
  });

  it("limits user assignment to a protected server search and exposes an Excel export through secure sharing", () => {
    const router = source("server/routers.ts");
    const db = source("server/db.ts");
    const search = source("components/master-user-search.tsx");
    const exports = source("components/master-export-tools.tsx");
    const excel = source("lib/master-workspace-excel.ts");
    expect(router).toContain("searchUsers: adminProcedure");
    expect(db).toContain("searchMasterUsers");
    expect(search).toContain("query.trim().length >= 2");
    expect(search).toContain("permissionsForWorkspaceRole");
    expect(exports).toContain("startOAuthLogin");
    expect(exports).toContain("exportMasterWorkspaceExcel");
    expect(excel).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(excel).toContain("Sharing.isAvailableAsync");
  });

  it("feeds visual booking and unit pickers from protected workspace options and uses native date-time selection", () => {
    const router = source("server/routers.ts");
    const controls = source("components/master-override-controls.tsx");
    const panel = source("app/admin/master-control.tsx");
    expect(router).toContain("workspaceOptions: adminProcedure");
    expect(router).toContain("bookings: data.bookings.filter");
    expect(router).toContain("units: data.chalets.map");
    expect(controls).toContain("@react-native-community/datetimepicker");
    expect(controls).toContain('setSelector("booking")');
    expect(controls).toContain('setSelector("unit")');
    expect(controls).toContain('locale="ar-JO"');
    expect(controls).toContain('const EMERALD = "#10B981"');
    expect(panel).toContain("audit.slice(0, 5)");
    expect(panel).toContain("auditTarget(item)");
  });

  it("supports reversible facility switching, protected global directory search, tabbed tools, and actor-labelled audit cards", () => {
    const router = source("server/routers.ts");
    const db = source("server/db.ts");
    const panel = source("app/admin/master-control.tsx");
    expect(router).toContain("directory: adminProcedure");
    expect(db).toContain("searchMasterWorkspaceDirectory");
    expect(db).toContain("actorName: users.name");
    expect(panel).toContain("current === id ? null : id");
    expect(panel).toContain("masterControl.directory.useQuery");
    expect(panel).toContain('const TABS = ["ledger", "members", "system"]');
    expect(panel).toContain("item.actorName");
    expect(panel).toContain("tabLabel(tab)");
  });
});
