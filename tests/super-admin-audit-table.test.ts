import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("super admin central blocking — persistent audit table must exist at startup", () => {
  it("creates the stayInSuperAdminAudit table idempotently at server boot like every other safety-net table", () => {
    const db = source("server/db.ts");
    const core = source("server/_core/index.ts");
    expect(db).toContain("export async function ensureSuperAdminAuditTable()");
    expect(db).toContain("CREATE TABLE IF NOT EXISTS stayInSuperAdminAudit");
    expect(db).toContain("id int NOT NULL AUTO_INCREMENT PRIMARY KEY");
    expect(db).toContain("actorUserId int NOT NULL");
    expect(db).toContain("action varchar(80) NOT NULL");
    expect(db).toContain("createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP");
    expect(db).toContain("stayInSuperAdminAudit_actorUserId_idx");
    expect(core).toContain("ensureSuperAdminAuditTable");
  });

  it("wires the whole central-blocking mutation path: admin gate → flag upsert → audit append", () => {
    const router = source("server/routers.ts");
    const db = source("server/db.ts");
    expect(router).toContain("update: adminProcedure");
    expect(router).toContain('await db.updateGlobalFeatureFlag({ flag: input.flag, enabled: input.enabled, actorUserId: ctx.user.id });');
    expect(router).toContain("createSuperAdminAudit({ actorUserId: ctx.user.id, action: \"feature-flag-updated\"");
    expect(router).toContain('details: JSON.stringify({ flag: input.flag, enabled: input.enabled })');
    expect(router).toContain("return { success: true as const }");
    expect(db).toContain("export async function updateGlobalFeatureFlag");
  });

  it("keeps the audit journal readable for the overview that feeds the blocking screen metrics", () => {
    const router = source("server/routers.ts");
    const db = source("server/db.ts");
    expect(router).toContain("db.listSuperAdminAudit()");
    expect(db).toContain("export async function listSuperAdminAudit");
    expect(db).toContain(".from(superAdminAudit)");
  });

  it("decouples flag persistence from audit journaling so a dead audit table can never freeze the switches", () => {
    const router = source("server/routers.ts");
    const updateBlock = router.slice(router.indexOf("global: router"), router.indexOf("return { success: true as const }"));
    expect(updateBlock).toContain("await db.updateGlobalFeatureFlag({ flag: input.flag, enabled: input.enabled, actorUserId: ctx.user.id });");
    expect(updateBlock.indexOf("updateGlobalFeatureFlag")).toBeLessThan(updateBlock.indexOf("createSuperAdminAudit"));
    expect(updateBlock).toContain("try {");
    expect(updateBlock).toContain("catch (error)");
    expect(router).toContain("flag state already persisted");
  });
});