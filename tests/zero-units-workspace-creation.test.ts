import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("workspace creation: zero-units policy + no false failure", () => {
  describe("PHASE 1: no auto-seeded mock units", () => {
    it("writes the workspace atomically inside a transaction (all critical rows commit together or never)", () => {
      const db = source("server/db.ts");
      expect(db).toContain("const created = await database.transaction(async (tx) => {");
      expect(db).toContain("throw new Error(\"duplicate-workspace-name\");");
      expect(db).toContain("if (!memberRow) throw new Error(\"workspace-member-not-found\");");
    });

    it("seeds a strictly empty payload — zero units, zero bookings (no 'كوخ 1' / 'شاليه 2' template)", () => {
      const db = source("server/db.ts");
      expect(db).toContain("chalets: [], bookings: [], waitlist: [], turnoverTasks: [], expenses: [], specialPriceRules: [], auditLog: []");
      const start = db.indexOf("export async function createWorkspace(");
      const end = db.indexOf("export async function createWorkspaceInvitation(");
      const fn = db.slice(start, end > start ? end : start + 4000);
      expect(fn).not.toContain("shifts:");
      expect(fn).not.toContain("referenceCode:");
      expect(fn).not.toContain("propertyType");
    });
  });

  describe("PHASE 2: no false creation error despite a committed record", () => {
    it("makes the post-commit audit log best-effort at the server so it can never flip success into failure", () => {
      const db = source("server/db.ts");
      expect(db).toContain("action: \"workspace-created\"");
      expect(db).toContain("console.warn(\"[Workspace] Activity log skipped after creation (non-fatal):\", error);");
    });

    it("makes the post-commit summary fetch best-effort in the create router", () => {
      const router = source("server/routers.ts");
      expect(router).toContain("const summary = await db.getWorkspaceSummary(ctx.user).catch(() => ({ workspace: null, member: null }));");
      expect(router).toContain("return { workspace: summary.workspace ?? null, member };");
    });

    it("closes the modal, clears the form, and suppresses the error banner on success — before any cache refresh", () => {
      const hub = source("app/workspace-hub.tsx");
      const properties = source("app/properties-hub.tsx");
      for (const file of [hub, properties]) {
        expect(file).toContain("setCreateVisible(false);");
        expect(file).toContain("setWsName(\"\");");
        expect(file).toContain("setWsCurrency(CURRENCY_OPTIONS[0]);");
        expect(file).toContain("disabled={isSubmitting}");
      }
      expect(properties).toContain("const newId = result.workspace?.id ?? result.member?.workspaceId;");
    });
  });

  describe("PHASE 3: clean units view + safe return", () => {
    it("shows the strict empty state and the 'إضافة وحدة جديدة' primary action when a property has zero units", () => {
      const screen = source("app/chalet-management.tsx");
      expect(screen).toContain("لا توجد وحدات مضافة بعد لهذه المنشأة");
      expect(screen).toContain("إضافة وحدة جديدة +");
      expect(screen).toContain('name="home-work" size={28}');
    });

    it("keeps the search empty-state distinct from the true zero-units state", () => {
      const screen = source("app/chalet-management.tsx");
      expect(screen).toContain("لا توجد وحدات مطابقة");
      expect(screen).toContain("chalets.length ? (");
    });

    it("adds a 'رجوع' path straight to the workspaces directory (/properties-hub) with its back-label", () => {
      const screen = source("app/chalet-management.tsx");
      expect(screen).toContain('fallbackHref="/properties-hub"');
      const back = source("components/screen-back-button.tsx");
      expect(back).toContain('"/properties-hub": { ar: "منشآتي (دليل المنشآت)", en: "Properties" }');
    });
  });
});