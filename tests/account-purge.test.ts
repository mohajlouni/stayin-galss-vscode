import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("super-admin permanent account purge", () => {
  it("provides a privileged, server-gated permanent purge requiring a typed confirmation", () => {
    const db = source("server/db.ts");
    const router = source("server/routers.ts");
    const screen = source("app/admin/manage-deletions.tsx");
    expect(db).toContain("export async function purgeUserByContact");
    expect(db).toContain("export async function previewPurgeByContact");
    expect(db).toContain("db.delete(workspaceMembers)");
    expect(db).toContain("db.delete(accountDeletionRequests)");
    expect(db).toContain("db.delete(sessions)");
    expect(db).toContain('action: "user-purged"');
    expect(db).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(db).toContain('typed !== "حذف" && typed !== "DELETE"');
    expect(router).toContain("purgeUserByContact: adminProcedure");
    expect(router).toContain("previewPurge: adminProcedure");
    expect(screen).toContain("masterControl.purgeUserByContact.useMutation");
    expect(screen).toContain("masterControl.previewPurge.useQuery");
    expect(screen).toContain("typedConfirmation");
  });

  it("resolves a purge target by email, phone, or numeric id", () => {
    const db = source("server/db.ts");
    expect(db).toContain("resolveUsersByContact");
    expect(db).toContain("term.includes(\"@\")");
    expect(db).toContain("users.phone");
    expect(db).toContain("users.id, Number(term)");
  });

  it("shows a read-only preview of all related records and uses a strict red confirmation modal", () => {
    const screen = source("app/admin/manage-deletions.tsx");
    expect(screen).toContain("السجلات المرتبطة التي ستُمسح");
    expect(screen).toContain("حذف نهائي لا رجعة فيه");
    expect(screen).toContain('placeholder="اكتب «حذف» أو «DELETE» للتأكيد"');
    expect(screen).toContain('typed.trim() !== "حذف" && typed.trim() !== "DELETE"');
    expect(screen).toContain("<Modal");
  });

  it("lists pending-deletion accounts with remaining time and archives removed accounts with the actor", () => {
    const db = source("server/db.ts");
    const router = source("server/routers.ts");
    const screen = source("app/admin/manage-deletions.tsx");
    const card = source("app/admin/master-control.tsx");
    expect(db).toContain("export async function listPendingDeletionAccounts");
    expect(db).toContain("remainingMs");
    expect(db).toContain("export async function getPendingDeletionCount");
    expect(db).toContain("export async function listRemovedAccounts");
    expect(router).toContain("pendingDeletions: adminProcedure");
    expect(router).toContain("pendingDeletionCount: adminProcedure");
    expect(router).toContain("removedAccounts: adminProcedure");
    expect(screen).toContain("masterControl.pendingDeletions.useQuery");
    expect(screen).toContain("masterControl.removedAccounts.useQuery");
    expect(screen).toContain("قيد المهلة (١٤ يومًا)");
    expect(screen).toContain("سجل المحذوفات");
    expect(screen).toContain("حذف نهائي الآن");
    expect(card).toContain("فتح قائمة طلبات الحذف");
    expect(card).toContain("router.push(\"/admin/manage-deletions\")");
    expect(card).toContain("pendingDeletionCount");
  });
});
