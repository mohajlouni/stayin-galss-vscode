import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPLOYEE_PERMISSIONS, GUEST_PERMISSIONS, MANAGER_PERMISSIONS, normalizeWorkspacePermissions, permissionsForPreset } from "../shared/workspace-permissions";

const schema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const management = readFileSync(resolve(process.cwd(), "app/user-management.tsx"), "utf8");
const tabs = readFileSync(resolve(process.cwd(), "app/(tabs)/_layout.tsx"), "utf8");
const reports = readFileSync(resolve(process.cwd(), "app/(tabs)/reports.tsx"), "utf8");
const store = readFileSync(resolve(process.cwd(), "lib/booking-store.tsx"), "utf8");
const access = readFileSync(resolve(process.cwd(), "lib/workspace-access.ts"), "utf8");

describe("workspace roles and invitations", () => {
  it("provides workspace membership, expiring invitation, audit, and server-side owner checks", () => {
    expect(schema).toContain("stayInWorkspaces");
    expect(schema).toContain("stayInWorkspaceMembers");
    expect(schema).toContain("stayInWorkspaceInvitations");
    expect(schema).toContain("stayInWorkspaceActivity");
    expect(schema).toContain("stayInWorkspaceData");
    expect(db).toContain("createHash(\"sha256\")");
    expect(db).toContain("gt(workspaceInvitations.expiresAt, new Date())");
    expect(routers).toContain("protectedProcedure");
    expect(routers).toContain("bootstrapOwner");
    expect(routers).toContain("inviteEmployee");
    expect(routers).toContain("acceptInvitation");
    expect(routers).toContain("saveData");
    expect(routers).toContain("workspace-data-conflict");
    expect(routers).toContain("canManageWorkspace");
  });

  it("offers the owner detailed invitation controls and uses granular permissions in the app", () => {
    expect(management).toContain("إنشاء رمز دعوة");
    expect(management).toContain("تفعيل دعوة الموظف");
    expect(management).toContain("تخصيص الصلاحيات");
    expect(management).toContain("updateMemberPermissions");
    expect(routers).toContain("workspacePermissionsSchema");
    expect(db).toContain("updateWorkspaceMemberPermissions");
    expect(tabs).toContain('can("view_financial_reports")');
    expect(reports).toContain('can("view_financial_reports")');
    expect(store).toContain('can("manage_payments")');
    expect(store).toContain('can("refund_security_deposits")');
    expect(store).toContain('can("cancel_delete_bookings")');
    expect(store).toContain("recordedByName");
    expect(store).toContain("remoteVersion");
    expect(store).toContain("expectedVersion: remoteVersion");
    expect(store).toContain("isAuthenticated && activeWorkspaceId !== null && !isGuest");
    expect(store).toContain("isWorkspaceVersionConflict");
    expect(store).toContain("isWorkspaceSessionError");
    expect(store).toContain("setSyncConflict(isWorkspaceVersionConflict(error))");
  });

  it("uses the requested manager and employee permission presets while normalizing older data", () => {
    expect(Object.values(MANAGER_PERMISSIONS).every(Boolean)).toBe(true);
    expect(permissionsForPreset("employee")).toEqual(EMPLOYEE_PERMISSIONS);
    expect(EMPLOYEE_PERMISSIONS).toMatchObject({ create_bookings: true, manage_payments: true, view_financial_reports: false, refund_security_deposits: false, edit_bookings: false, cancel_delete_bookings: false, view_audit_logs: false });
    expect(normalizeWorkspacePermissions({ create_bookings: true }, "employee")).toMatchObject({ create_bookings: true, manage_payments: true, view_audit_logs: false });
  });

  it("treats an unsigned installation as guest mode while preserving employee restrictions after sign-in", () => {
    expect(access).toContain("? GUEST_PERMISSIONS");
    expect(access).toContain("isAuthenticated && (role === \"owner\" || role === \"admin\")");
    expect(access).toContain('role === "staff"');
    expect(GUEST_PERMISSIONS.create_bookings).toBe(false);
    expect(EMPLOYEE_PERMISSIONS.edit_bookings).toBe(false);
  });
});
