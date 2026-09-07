import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("workspace duplication prevention & absolute per-workspace isolation", () => {
  it("PHASE 1: rejects a duplicate workspace name at the database layer for the same owner", () => {
    const db = source("server/db.ts");
    const createBlock = db.slice(db.indexOf("export async function createWorkspace"), db.indexOf("export async function getWorkspaceSummary"));
    expect(createBlock).toContain('const existingByName = (await tx.select().from(workspaces).where(and(eq(workspaces.ownerUserId, input.user.id), eq(workspaces.name, workspaceName))).limit(1))[0];');
    expect(createBlock).toContain('if (existingByName) throw new Error("duplicate-workspace-name");');
    expect(createBlock.indexOf("existingByName")).toBeLessThan(createBlock.indexOf("tx.insert(workspaces)"));
  });

  it("PHASE 1: surfaces the duplicate as a CONFLICT with the exact Arabic message", () => {
    const router = source("server/routers.ts");
    expect(router).toContain('if (error instanceof Error && error.message === "duplicate-workspace-name") throw new TRPCError({ code: "CONFLICT", message: "يوجد منشأة مسجلة مسبقاً بهذا الاسم، يرجى اختيار اسم مختلف." });');
  });

  it("PHASE 1: both creation forms pre-check locally AND render the server's conflict message", () => {
    const hubs = [source("app/properties-hub.tsx"), source("app/workspace-hub.tsx")];
    for (const hub of hubs) {
      expect(hub).toContain('const duplicate =');
      expect(hub).toContain("يوجد لديك منشأة بهذا الاسم بالفعل. اختر اسمًا مختلفًا.");
      expect(hub).toContain('trpcError?.data?.code === "CONFLICT"');
      expect(hub).toContain("يوجد منشأة مسجلة مسبقاً بهذا الاسم، يرجى اختيار اسم مختلف.");
    }
  });

  it("PHASE 2: deletion requires the typed challenge and blocks the last remaining owned workspace", () => {
    const db = source("server/db.ts");
    const router = source("server/routers.ts");
    const hub = source("app/properties-hub.tsx");
    expect(db).toContain('if (ownedCount <= 1) throw new Error("owner-must-keep-one");');
    expect(router).toContain('input.confirmation !== "حذف" && input.confirmation !== "DELETE"');
    expect(hub).toContain('canDelete={card.role === "owner" && ownedCount > 1}');
    expect(hub).toContain('challenge !== "حذف" && challenge !== "DELETE"');
  });

  it("PHASE 3: a freshly created workspace starts with zero units and zero bookings — never inherits preview data", () => {
    const db = source("server/db.ts");
    const createBlock = db.slice(db.indexOf("export async function createWorkspace"), db.indexOf("export async function getWorkspaceSummary"));
    expect(createBlock).toContain("const seeded = normalizeAppData({ settings: { ...DEFAULT_SETTINGS, businessName: workspaceName");
    expect(createBlock).toContain("chalets: [], bookings: [], waitlist: [], turnoverTasks: [], expenses: [], specialPriceRules: [], auditLog: []");
    expect(createBlock).not.toContain("chalets: [{");
    expect(createBlock).not.toContain("demo-chalet-1");
    expect(createBlock).not.toContain("مجموعة المعاينة");
    expect(db).toContain("getWorkspaceData(input.workspaceId)");
  });

  it("PHASE 4: switching workspaces updates the active pointer and invalidates every cached query", () => {
    const hub = source("app/workspace-hub.tsx");
    const router = source("server/routers.ts");
    expect(hub).toContain("const selectWorkspace = trpc.workspace.select.useMutation();");
    expect(hub).toContain("await utils.workspace.invalidate();");
    expect(router).toContain('select: protectedProcedure.input');
    expect(router).toContain("setActiveWorkspace(ctx.user.id, input.workspaceId)");
  });
});