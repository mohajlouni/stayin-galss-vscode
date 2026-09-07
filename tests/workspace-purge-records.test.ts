import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("workspace purge engine — granular record wipe with typed challenges", () => {
  describe("PHASE 1: checkbox layout & categorization", () => {
    it("organizes the ten purge targets under three group headers", () => {
      const modal = source("components/workspace-purge-modal.tsx");
      expect(modal).toContain("القسم الأول: السجلات التشغيلية والخدمية");
      expect(modal).toContain("القسم الثاني: العملاء والماليات");
      expect(modal).toContain("القسم الثالث: الأصول والمنشأة (إجراء هيكلي)");
      expect(modal).toContain("الحجوزات والتقويم ومواعيد الإشغال");
      expect(modal).toContain("طلبات وقائمة الانتظار");
      expect(modal).toContain("الصيانة الوقائية والأصول وجرد المعدات");
      expect(modal).toContain("مركز الإشعارات والتنبيهات السابقة");
      expect(modal).toContain("قاعدة العملاء وسجل النزلاء والقائمة السوداء");
      expect(modal).toContain("برنامج الولاء والنقاط ومكافآت الضيوف");
      expect(modal).toContain("السجلات المالية (سندات القبض، المصروفات، وتصفية العهد)");
      expect(modal).toContain("التقارير والإحصائيات التراكمية");
      expect(modal).toContain("حذف كافة الوحدات والعقارات التابعة لهذه المنشأة");
      expect(modal).toContain("حذف المنشأة بالكامل من الحساب");
    });

    it("shows the workspace identity banner, the accuracy warning, and a 'selectAllRecords' action", () => {
      const modal = source("components/workspace-purge-modal.tsx");
      expect(modal).toContain("تصفير وإدارة بيانات منشأة");
      expect(modal).toContain("حدد بدقة البيانات التي ترغب في مسحها لهذه المنشأة وحدها.");
      expect(modal).toContain("تحديد كافة السجلات والبيانات");
    });

    it("derives its data from the server-defined purge category constant", () => {
      const db = source("server/db.ts");
      expect(db).toContain("export const PURGE_RECORD_CATEGORIES");
      expect(db).toContain("bookings");
      expect(db).toContain("waitlist");
      expect(db).toContain("maintenance");
      expect(db).toContain("notifications");
      expect(db).toContain("customers");
      expect(db).toContain("loyalty");
      expect(db).toContain("financials");
      expect(db).toContain("analytics");
      expect(db).toContain("units");
      expect(db).toContain("workspace");
    });
  });

  describe("PHASE 2: two-step verification & input challenge", () => {
    it("requires the exact challenge phrase 'تصفير' for record purges and 'حذف' for workspace deletion", () => {
      const db = source("server/db.ts");
      expect(db).toContain('challenge !== "حذف" && challenge !== "DELETE"');
      expect(db).toContain('challenge !== "تصفير" && challenge !== "DELETE"');
      expect(db).toContain("purge-challenge-not-matched");
      expect(db).toContain("purge-nothing-selected");
    });

    it("renders the typed challenge field with its Arabic instruction and placeholder", () => {
      const modal = source("components/workspace-purge-modal.tsx");
      expect(modal).toContain('اكتب كلمة "تصفير" لتأكيد مسح السجلات، أو كلمة "حذف" إذا اخترت حذف المنشأة:');
      expect(modal).toContain("اكتب هنا للتأكيد...");
    });

    it("blocks workspace deletion when this is the user's only owned workspace (single-workspace protection)", () => {
      const modal = source("components/workspace-purge-modal.tsx");
      expect(modal).toContain("isOnlyOwnedWorkspace");
      expect(modal).toContain("لا يمكن حذف هذه المنشأة لأنها الوحيدة المملوكة لحسابك");
      const router = source("server/routers.ts");
      expect(router).toContain("owner-must-keep-one");
    });
  });

  describe("PHASE 3: backend multi-entity scoped execution", () => {
    it("requires owner or Super Admin (#U1000) and enforces a recovery-point write before any payload mutation", () => {
      const router = source("server/routers.ts");
      expect(router).toContain("purgeRecords: protectedProcedure");
      expect(router).toContain("isSuperAdminActor(ctx.user, ENV.ownerOpenId)");
      expect(router).toContain('owned.ownerUserId !== ctx.user.id');
      const db = source("server/db.ts");
      expect(db).toContain("saveOwnerEmergencySnapshot");
      expect(db).toContain('action: "workspace-purge"');
      expect(db).toContain('subject: "تصفير بيانات المنشأة"');
    });

    it("knocks out every selectable category strictly scoped by the single active workspace", () => {
      const db = source("server/db.ts");
      expect(db).toContain("selected.includes(\"bookings\")");
      expect(db).toContain("selected.includes(\"waitlist\")");
      expect(db).toContain("selected.includes(\"maintenance\")");
      expect(db).toContain("selected.includes(\"notifications\")");
      expect(db).toContain("selected.includes(\"customers\")");
      expect(db).toContain("selected.includes(\"loyalty\")");
      expect(db).toContain("selected.includes(\"financials\")");
      expect(db).toContain("selected.includes(\"analytics\")");
      expect(db).toContain("selected.includes(\"units\")");
      expect(db).toContain("selected.includes(\"workspace\")");
      expect(db).toContain("workspace-data-invalid");
    });

    it("routes structural workspace deletion through the owner-gated, single-workspace-protected delete path", () => {
      const db = source("server/db.ts");
      const start = db.indexOf("export async function purgeWorkspaceRecords");
      const end = db.indexOf("export async function getWorkspaceRouting");
      const fn = db.slice(start, end > start ? end : start + 2000);
      expect(fn).toContain("deleteWorkspaceIfOwner(actor, workspaceId)");
    });
  });

  describe("PHASE 4: client invalidation & legacy coexistence", () => {
    it("invalidates the active workspace cache after a record purge so every screen shows its clean zero-state", () => {
      const modal = source("components/workspace-purge-modal.tsx");
      expect(modal).toContain("utils.workspace.invalidate()");
    });

    it("returns to the workspace directory after a full workspace deletion", () => {
      const screen = source("app/account-security.tsx");
      expect(screen).toContain("router.replace(\"/properties-hub\")");
    });

    it("confirms the old legacy quick-reset row was removed and only the granular purge modal entry remains", () => {
      const screen = source("app/account-security.tsx");
      expect(screen).not.toContain("تصفير الحجوزات والعمليات المالية");
      expect(screen).not.toContain("حذف الحجوزات والمصروفات والدفعات فقط مع بقاء الوحدات والحساب.");
      expect(screen).toContain("إدارة تصفير بيانات المنشأة");
      expect(screen).toContain("WorkspacePurgeModal");
      expect(screen).toContain("setPurgeVisible(true)");
    });

    it("wires the new purge modal into the sensitive area and triggers on the Super Admin path too", () => {
      const screen = source("app/account-security.tsx");
      expect(screen).toContain("إدارة تصفير بيانات المنشأة");
      expect(screen).toContain("WorkspacePurgeModal");
      expect(screen).toContain("isSuperAdmin");
    });

    it("adds the purge method into the workspace data context for all screens to zero out instantly", () => {
      const store = source("lib/booking-store.tsx");
      expect(store).toContain("purgeWorkspaceRecords");
      expect(store).toContain("purgeRecordsRemote");
      expect(store).toContain("trpc.workspace.purgeRecords.useMutation()");
    });
  });

  describe("PHASE 5: live router registration (guards against 'No procedure found on path workspace.purgeRecords')", () => {
    it("registers a mutation under the workspace router on the exported appRouter", async () => {
      const { appRouter } = await import("../server/routers");
      const registry = (appRouter as unknown as {
        _def: { procedures: Record<string, { _def: { type?: string; inputs?: Array<{ parse: (value: unknown) => unknown }> } }> };
      })._def.procedures;
      const purge = registry["workspace.purgeRecords"];
      expect(purge).toBeTruthy();
      expect(purge._def.type).toBe("mutation");
      expect(Array.isArray(purge._def.inputs) && purge._def.inputs.length > 0).toBe(true);
    });

    it("exposes the exact input schema contract the store sends (workspaceId + categories + challenge)", async () => {
      const { appRouter } = await import("../server/routers");
      const registry = (appRouter as unknown as {
        _def: { procedures: Record<string, { _def: { inputs?: Array<{ parse: (value: unknown) => unknown }> } }> };
      })._def.procedures;
      const inputs = registry["workspace.purgeRecords"]._def.inputs ?? [];
      const parser = inputs[inputs.length - 1];
      expect(parser).toBeTruthy();
      parser!.parse({ workspaceId: 1, categories: ["bookings"], challenge: "تصفير" });
      expect(() => parser!.parse({ workspaceId: 1, categories: [], challenge: "تصفير" })).toThrow();
      expect(() => parser!.parse({ workspaceId: 1, categories: ["bogus"], challenge: "تصفير" })).toThrow();
    });
  });
});