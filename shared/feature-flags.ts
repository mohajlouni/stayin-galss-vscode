export const GLOBAL_FEATURE_FLAG_KEYS = [
  "feat_maintenance",
  "feat_notifications",
  "feat_loyalty_suite",
  "feat_lunar_calendar",
  "feat_customers_blacklist",
  "feat_automation_weather",
  "feat_guest_checkin",
  "feat_cleaning_inspection",
  "feat_advanced_tools",
  "feat_digital_contracts",
  "feat_invoicing_receipts",
  "feat_whatsapp_integration",
  "feat_audit_log",
] as const;

export type GlobalFeatureFlagKey = (typeof GLOBAL_FEATURE_FLAG_KEYS)[number];

export const WORKSPACE_FEATURE_PREFERENCE_KEYS = [
  "maintenance_assets",
  "notifications_center",
  "loyalty_points",
] as const;

export type WorkspaceFeaturePreferenceKey = (typeof WORKSPACE_FEATURE_PREFERENCE_KEYS)[number];

export const DEFAULT_GLOBAL_FEATURE_FLAGS: Record<GlobalFeatureFlagKey, boolean> = {
  feat_maintenance: true,
  feat_notifications: true,
  feat_loyalty_suite: true,
  feat_lunar_calendar: true,
  feat_customers_blacklist: true,
  feat_automation_weather: true,
  feat_guest_checkin: true,
  feat_cleaning_inspection: true,
  feat_advanced_tools: true,
  feat_digital_contracts: true,
  feat_invoicing_receipts: true,
  feat_whatsapp_integration: true,
  feat_audit_log: true,
};

export const DEFAULT_WORKSPACE_FEATURE_PREFERENCES: Record<WorkspaceFeaturePreferenceKey, boolean> = {
  maintenance_assets: true,
  notifications_center: true,
  loyalty_points: true,
};

/** كل مفتاح تفضيل في مساحة العمل يرتبط بحجب مركزي واحد يُعطّل الميزة عند تعطيله. */
export const FEATURE_KILL_TO_PREFERENCE: Record<GlobalFeatureFlagKey, WorkspaceFeaturePreferenceKey | null> = {
  feat_maintenance: "maintenance_assets",
  feat_notifications: "notifications_center",
  feat_loyalty_suite: "loyalty_points",
  feat_lunar_calendar: null,
  feat_customers_blacklist: null,
  feat_automation_weather: null,
  feat_guest_checkin: null,
  feat_cleaning_inspection: null,
  feat_advanced_tools: null,
  feat_digital_contracts: null,
  feat_invoicing_receipts: null,
  feat_whatsapp_integration: null,
  feat_audit_log: null,
};

/** الحجب المركزي يعلو تفضيلات المالك دائمًا (منطق AND لكل مفتاح تفضيل مرصود). */
export function mergeGlobalOverPreference(
  global: Record<string, boolean>,
  serverPreferences: Record<string, boolean>,
): Record<WorkspaceFeaturePreferenceKey, boolean> {
  const merged: Record<WorkspaceFeaturePreferenceKey, boolean> = { ...DEFAULT_WORKSPACE_FEATURE_PREFERENCES };
  for (const preference of WORKSPACE_FEATURE_PREFERENCE_KEYS) {
    const preferenceEnabled = serverPreferences[preference] ?? DEFAULT_WORKSPACE_FEATURE_PREFERENCES[preference];
    let enabled = preferenceEnabled;
    for (const attribute of GLOBAL_FEATURE_FLAG_KEYS) {
      if (FEATURE_KILL_TO_PREFERENCE[attribute] === preference) {
        enabled = enabled && (global[attribute] ?? DEFAULT_GLOBAL_FEATURE_FLAGS[attribute]);
      }
    }
    merged[preference] = enabled;
  }
  return merged;
}

/** خريطة التوجيه لكل ميزة محجوبة: المسار المعني يتحول لشاشة الحجب عند تعطيل الحجب المركزي. */
export const FEATURE_ROUTE_GUARD_MAP: Record<string, GlobalFeatureFlagKey> = {
  "/maintenance-dashboard": "feat_maintenance",
  "/notifications": "feat_notifications",
  "/loyalty": "feat_loyalty_suite",
  "/crm": "feat_customers_blacklist",
  "/(tabs)/crm": "feat_customers_blacklist",
  "/settings/advanced-tools": "feat_advanced_tools",
  "/whatsapp-templates": "feat_whatsapp_integration",
  "/audit-log": "feat_audit_log",
  "/expenses": "feat_invoicing_receipts",
};