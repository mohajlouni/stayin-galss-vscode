import { useAuthSession } from "@/lib/auth-session";
import { useDemoMode } from "@/lib/demo-mode";
import { trpc } from "@/lib/trpc";
import {
  DEFAULT_GLOBAL_FEATURE_FLAGS,
  DEFAULT_WORKSPACE_FEATURE_PREFERENCES,
  GLOBAL_FEATURE_FLAG_KEYS,
  WORKSPACE_FEATURE_PREFERENCE_KEYS,
  mergeGlobalOverPreference,
  type GlobalFeatureFlagKey,
  type WorkspaceFeaturePreferenceKey,
} from "@/shared/feature-flags";

export const FEATURE_FLAGS = [
  "loyalty",
  "utility_tracking",
  "maintenance",
  "weather_alerts",
  "whatsapp_templates",
  "advanced_tools",
  "master_control",
  "payment_methods",
  "audit_logs",
  "crm",
  "notifications",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number];
export type FeatureFlagsState = Record<FeatureFlagKey, boolean>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlagsState = {
  loyalty: true,
  utility_tracking: true,
  maintenance: true,
  weather_alerts: true,
  whatsapp_templates: true,
  advanced_tools: true,
  master_control: true,
  payment_methods: true,
  audit_logs: true,
  crm: true,
  notifications: true,
};

export function getFeatureFlags(): FeatureFlagsState {
  return DEFAULT_FEATURE_FLAGS;
}

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return DEFAULT_FEATURE_FLAGS[flag] ?? true;
}

/** مفاتيح الحجب المركزي للإدارة العليا (متاحة لكل المستخدمين للقراءة، والكتابة للسوبر أدمن فقط). */
export function useGlobalFeatureFlags(): Record<GlobalFeatureFlagKey, boolean> {
  const { isAuthenticated } = useAuthSession();
  const { isDemo } = useDemoMode();
  const query = trpc.featureControl.global.list.useQuery(undefined, { enabled: isAuthenticated && !isDemo, retry: false });
  const merged: Record<GlobalFeatureFlagKey, boolean> = { ...DEFAULT_GLOBAL_FEATURE_FLAGS };
  for (const [key, value] of Object.entries(query.data ?? {})) {
    if (GLOBAL_FEATURE_FLAG_KEYS.includes(key as GlobalFeatureFlagKey)) merged[key as GlobalFeatureFlagKey] = Boolean(value);
  }
  return merged;
}

/** تفضيلات المالك لمساحة العمل الحالية مسجلة في قاعدة البيانات. */
export function useWorkspaceFeaturePreferences(workspaceId: number | null): {
  preferences: Record<WorkspaceFeaturePreferenceKey, boolean>;
  effectivePreferences: Record<WorkspaceFeaturePreferenceKey, boolean>;
  isLoading: boolean;
} {
  const { isAuthenticated } = useAuthSession();
  const { isDemo } = useDemoMode();
  const global = useGlobalFeatureFlags();
  const query = trpc.featureControl.workspace.get.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled: isAuthenticated && !isDemo && workspaceId != null, retry: false });
  const serverPreferences = query.data ?? {};
  const preferences: Record<WorkspaceFeaturePreferenceKey, boolean> = { ...DEFAULT_WORKSPACE_FEATURE_PREFERENCES };
  for (const key of WORKSPACE_FEATURE_PREFERENCE_KEYS) {
    const stored = serverPreferences[key];
    if (typeof stored === "boolean") preferences[key] = stored;
  }
  return {
    preferences,
    effectivePreferences: mergeGlobalOverPreference(global, preferences),
    isLoading: query.isLoading,
  };
}

/** دمج الحجب المركزي فوق تفضيلات المالك لعرض الواجهات القديمة. */
export function mapEffectiveToLegacy(global: Record<GlobalFeatureFlagKey, boolean>, preferences: Record<WorkspaceFeaturePreferenceKey, boolean>): FeatureFlagsState {
  return {
    loyalty: preferences.loyalty_points && global.feat_loyalty_suite,
    utility_tracking: true,
    maintenance: preferences.maintenance_assets && global.feat_maintenance,
    weather_alerts: global.feat_automation_weather,
    whatsapp_templates: global.feat_whatsapp_integration,
    advanced_tools: global.feat_advanced_tools,
    master_control: true,
    payment_methods: global.feat_invoicing_receipts,
    audit_logs: global.feat_audit_log,
    crm: global.feat_customers_blacklist && global.feat_loyalty_suite,
    notifications: preferences.notifications_center && global.feat_notifications,
  };
}

export function useWorkspaceFeatureFlags(workspaceId: number | null): FeatureFlagsState {
  const { isAuthenticated } = useAuthSession();
  const { isDemo } = useDemoMode();
  const global = useGlobalFeatureFlags();
  const query = trpc.featureControl.workspace.get.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled: isAuthenticated && !isDemo && workspaceId != null, retry: false });
  const serverPreferences: Record<string, boolean> = {
    ...DEFAULT_WORKSPACE_FEATURE_PREFERENCES,
    ...(query.data ?? {}),
  };
  if (!isAuthenticated || isDemo || !workspaceId) {
    return mapEffectiveToLegacy({ ...DEFAULT_GLOBAL_FEATURE_FLAGS }, { ...DEFAULT_WORKSPACE_FEATURE_PREFERENCES });
  }
  return mapEffectiveToLegacy(global, mergeGlobalOverPreference(global, serverPreferences));
}

export function useIsFeatureEnabled(workspaceId: number | null, flag: FeatureFlagKey): boolean {
  const flags = useWorkspaceFeatureFlags(workspaceId);
  return flags[flag] ?? true;
}