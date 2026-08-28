export const PERMISSION_KEYS = [
  "view_financial_reports",
  "manage_payments",
  "refund_security_deposits",
  "create_bookings",
  "edit_bookings",
  "cancel_delete_bookings",
  "view_audit_logs",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type WorkspacePermissions = Record<PermissionKey, boolean>;
export type PermissionPreset = "manager" | "employee" | "guest" | "mini-admin" | "staff" | "guard";
export type WorkspaceAccessRole = "owner" | "admin" | "staff" | "guest";

/** Stable stored roles are owner/admin/staff/guest; these labels express the product hierarchy. */
export const WORKSPACE_ROLE_LABELS: Record<WorkspaceAccessRole, { ar: string; tier: 1 | 2 | 3 | 4 }> = {
  owner: { ar: "المالك الأساسي", tier: 1 },
  admin: { ar: "مدير تشغيلي", tier: 2 },
  staff: { ar: "موظف حجوزات", tier: 3 },
  guest: { ar: "حارس / مشرف ميداني", tier: 4 },
};

export const MANAGER_PERMISSIONS: WorkspacePermissions = {
  view_financial_reports: true,
  manage_payments: true,
  refund_security_deposits: true,
  create_bookings: true,
  edit_bookings: true,
  cancel_delete_bookings: true,
  view_audit_logs: true,
};

export const EMPLOYEE_PERMISSIONS: WorkspacePermissions = {
  view_financial_reports: false,
  manage_payments: true,
  refund_security_deposits: false,
  create_bookings: true,
  edit_bookings: false,
  cancel_delete_bookings: false,
  view_audit_logs: false,
};

export const GUEST_PERMISSIONS: WorkspacePermissions = {
  view_financial_reports: false,
  manage_payments: false,
  refund_security_deposits: false,
  create_bookings: false,
  edit_bookings: false,
  cancel_delete_bookings: false,
  view_audit_logs: false,
};

export const MINI_ADMIN_PERMISSIONS = MANAGER_PERMISSIONS;
export const STAFF_PERMISSIONS = EMPLOYEE_PERMISSIONS;
export const GUARD_PERMISSIONS = GUEST_PERMISSIONS;

export function permissionsForPreset(preset: PermissionPreset): WorkspacePermissions {
  return { ...(preset === "manager" || preset === "mini-admin" ? MINI_ADMIN_PERMISSIONS : preset === "guest" || preset === "guard" ? GUARD_PERMISSIONS : STAFF_PERMISSIONS) };
}

export function permissionsForWorkspaceRole(role: WorkspaceAccessRole): WorkspacePermissions {
  return role === "owner" || role === "admin" ? { ...MANAGER_PERMISSIONS } : role === "guest" ? { ...GUEST_PERMISSIONS } : { ...EMPLOYEE_PERMISSIONS };
}

export function normalizeWorkspacePermissions(value: unknown, fallback: PermissionPreset = "employee"): WorkspacePermissions {
  const source = value && typeof value === "object" ? value as Partial<WorkspacePermissions> : {};
  const baseline = permissionsForPreset(fallback);
  return PERMISSION_KEYS.reduce((permissions, key) => {
    permissions[key] = typeof source[key] === "boolean" ? source[key] : baseline[key];
    return permissions;
  }, {} as WorkspacePermissions);
}

export function hasAllWorkspacePermissions(permissions: WorkspacePermissions) {
  return PERMISSION_KEYS.every((key) => permissions[key]);
}
