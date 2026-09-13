import type MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";

import { PERMISSION_KEYS, type PermissionKey, type PermissionPreset, type WorkspacePermissions } from "@/shared/workspace-permissions";

export type GranularCapability = "bookings" | "cash_float" | "discounts_rates" | "float_expenses" | "maintenance_turnaround" | "client_contacts" | "financial_reports";

export const GRANULAR_PERMISSIONS: readonly { key: GranularCapability; icon: ComponentProps<typeof MaterialIcons>["name"]; ar: string; en: string; managerOnly?: boolean; grants: readonly PermissionKey[] }[] = [
  { key: "bookings", icon: "calendar-month", ar: "عرض وإدارة الحجوزات", en: "View & manage bookings", grants: ["create_bookings", "edit_bookings"] },
  { key: "cash_float", icon: "payments", ar: "استلام الكاش وتحصيل العهد", en: "Cash & float collection", grants: ["manage_payments"] },
  { key: "discounts_rates", icon: "percent", ar: "تطبيق الخصومات وتعديل الأسعار", en: "Apply discounts & custom rates", grants: ["edit_bookings", "manage_payments"] },
  { key: "float_expenses", icon: "receipt-long", ar: "تسجيل المصروفات من العهدة", en: "Record float expenses", grants: ["manage_payments"] },
  { key: "maintenance_turnaround", icon: "home-repair-service", ar: "إدارة الصيانة والنظافة", en: "Maintenance & unit turnaround", grants: ["edit_bookings"] },
  { key: "client_contacts", icon: "contacts", ar: "الاطلاع على هواتف وبيانات العملاء", en: "View client contacts", grants: ["create_bookings"] },
  { key: "financial_reports", icon: "bar-chart", ar: "الاطلاع على التقارير المالية والأرباح", en: "Financial reports & P&L", grants: ["view_financial_reports", "refund_security_deposits", "cancel_delete_bookings", "view_audit_logs"], managerOnly: true },
];

export const OPERATIONAL_PERMISSION_COUNT = GRANULAR_PERMISSIONS.length;

function allCapabilities(): readonly GranularCapability[] {
  return GRANULAR_PERMISSIONS.map((entry) => entry.key);
}

export function capabilitiesForRole(role: "staff" | "mini-admin" | "guard"): readonly GranularCapability[] {
  if (role === "mini-admin") return allCapabilities();
  if (role === "staff") return ["bookings", "cash_float", "discounts_rates", "float_expenses", "maintenance_turnaround", "client_contacts"];
  return [];
}

export function capabilitiesForPreset(preset: PermissionPreset): readonly GranularCapability[] {
  switch (preset) {
    case "manager":
    case "mini-admin":
      return allCapabilities();
    case "staff":
      return ["bookings", "cash_float", "discounts_rates", "float_expenses", "maintenance_turnaround", "client_contacts"];
    default:
      return [];
  }
}

export function capabilitiesToPermissions(active: readonly GranularCapability[]): WorkspacePermissions {
  const allowed = new Set<PermissionKey>();
  for (const key of active) {
    const entry = GRANULAR_PERMISSIONS.find((item) => item.key === key);
    if (entry) {
      for (const grant of entry.grants) allowed.add(grant);
    }
  }
  return PERMISSION_KEYS.reduce((permissions, key) => {
    permissions[key] = allowed.has(key);
    return permissions;
  }, {} as WorkspacePermissions);
}