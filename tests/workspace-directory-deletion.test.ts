import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("workspaces directory: luxury cards, route-param sync, and safe deletion", () => {
  it("renders the glassmorphic header banner with an active-properties counter and the management subtitle", () => {
    const screen = source("app/properties-hub.tsx");
    expect(screen).toContain("منشآتك ومساحات العمل");
    expect(screen).toContain("[");
    expect(screen).toContain("منشآت نشطة");
    expect(screen).toContain("إدارة شاملة لعقاراتك، تبديل بيئة العمل المباشرة، وتعديل إعدادات الحجوزات والعملات.");
    expect(screen).toContain("GlowGlassCard");
  });

  it("builds elevated property cards with currency, unit-count, role badges and a glowing active badge", () => {
    const screen = source("app/properties-hub.tsx");
    expect(screen).toContain("🟢 المنشأة النشطة حالياً");
    expect(screen).toContain("activeBadgeText");
    expect(screen).toContain("currency-exchange");
    expect(screen).toContain("card.currency");
    expect(screen).toContain("card.unitCount");
    expect(screen).toContain("home-work");
    expect(screen).toContain('role === "owner"');
    expect(screen).toContain('roleBadgeLabel(card.role, language)');
  });

  it("offers the three actions: work, manage-with-route-param, and delete", () => {
    const screen = source("app/properties-hub.tsx");
    expect(screen).toContain("العمل على هذه المنشأة ➔");
    expect(screen).toContain("إدارة وتعديل المنشأة ✏️");
    expect(screen).toContain("حذف المنشأة");
    expect(screen).toContain("onManage={() => void applyThen(card.workspaceId, () => router.push(`/property-detail?workspaceId=${card.workspaceId}` as never))}");
    expect(screen).toContain('router.replace("/(tabs)")');
  });

  it("guards the last remaining owned workspace behind the ownership constraint and tooltip", () => {
    const screen = source("app/properties-hub.tsx");
    expect(screen).toContain("const ownedCount = cards.filter((card) => card.role === \"owner\").length;");
    expect(screen).toContain("canDelete={card.role === \"owner\" && ownedCount > 1}");
    expect(screen).toContain("لا يمكن حذف هذه المنشأة؛ يجب أن يحتوي حسابك على منشأة واحدة نشطة على الأقل.");
    expect(screen).toContain("ownedCount <= 1");
    expect(screen).toContain("disabled={!canDelete || busy}");
  });

  it("runs the typing-challenge confirmation modal for permanent workspace deletion", () => {
    const screen = source("app/properties-hub.tsx");
    expect(screen).toContain("تأكيد حذف المنشأة نهائياً");
    expect(screen).toContain("تحذير: سيتم حذف المنشأة وجميع سجلات الحجز والوحدات التابعة لها نهائياً.");
    expect(screen).toContain("لتأكيد الحذف، اكتب كلمة 'حذف' أو 'DELETE' أدناه:");
    expect(screen).toContain("const challengeLocked = challenge !== \"حذف\" && challenge !== \"DELETE\";");
    expect(screen).toContain("disabled={challengeLocked || deleteWorkspace.isPending}");
    expect(screen).toContain("trpc.workspace.delete.useMutation");
    expect(screen).toContain("deleteWorkspace.mutateAsync({ workspaceId: deleteTarget.workspaceId, confirmation: challenge })");
    expect(screen).toContain("await utils.workspace.invalidate();");
    expect(screen).toContain("تم حذف المنشأة 🗑️");
  });

  it("exposes a server-side delete guarded by the challenge and the single-owned-workspace floor", () => {
    const routers = source("server/routers.ts");
    expect(routers).toContain("delete: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), confirmation: z.string().trim().max(16) }))");
    expect(routers).toContain("input.confirmation !== \"حذف\" && input.confirmation !== \"DELETE\"");
    expect(routers).toContain("owner-must-keep-one");
    expect(routers).toContain("deleteWorkspaceIfOwner(ctx.user, input.workspaceId)");
  });

  it("cascades the family of workspace table rows but never the owner's last workspace", () => {
    const db = source("server/db.ts");
    expect(db).toContain("export async function deleteWorkspaceIfOwner");
    expect(db).toContain("workspace.ownerUserId !== user.id");
    expect(db).toContain("owner-must-keep-one");
    expect(db).toContain("database.delete(workspaceData).where(eq(workspaceData.workspaceId, workspaceId))");
    expect(db).toContain("database.delete(workspaceActivity).where(eq(workspaceActivity.workspaceId, workspaceId))");
    expect(db).toContain("database.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId))");
    expect(db).toContain("database.delete(activeWorkspaces).where(eq(activeWorkspaces.workspaceId, workspaceId))");
    expect(db).toContain("database.delete(workspaces).where(eq(workspaces.id, workspaceId))");
  });

  it("synchronizes the edit screen context from the route parameter so no stale snapshot is bound", () => {
    const screen = source("app/property-detail.tsx");
    expect(screen).toContain("useLocalSearchParams<{ workspaceId?: string }>()");
    expect(screen).toContain("paramWorkspaceId !== null && activeWorkspaceId !== null");
    expect(screen).toContain("needsContextSwitch");
    expect(screen).toContain("selectWorkspace.mutateAsync({ workspaceId: paramWorkspaceId! })");
    expect(screen).toContain("await utils.workspace.invalidate();");
    expect(screen).toContain("contextSwitching");
    expect(screen).toContain("جارٍ تحميل بيانات المنشأة المطلوبة…");
  });
});