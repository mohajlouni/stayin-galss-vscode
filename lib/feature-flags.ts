import { useAuthSession } from "@/lib/auth-session";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { trpc } from "@/lib/trpc";

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
};

export function getFeatureFlags(): FeatureFlagsState {
  return DEFAULT_FEATURE_FLAGS;
}

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return DEFAULT_FEATURE_FLAGS[flag] ?? true;
}

export function useWorkspaceFeatureFlags(workspaceId: number | null): FeatureFlagsState {
  const { isAuthenticated } = useAuthSession();
  const { isOwner } = useWorkspaceAccess();
  const query = trpc.masterControl.featureFlags.get.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled: isAuthenticated && isOwner && workspaceId != null, retry: false });

  if (!isAuthenticated || !isOwner || !workspaceId) {
    return DEFAULT_FEATURE_FLAGS;
  }

  if (query.data) {
    return { ...DEFAULT_FEATURE_FLAGS, ...query.data };
  }

  return DEFAULT_FEATURE_FLAGS;
}

export function useIsFeatureEnabled(workspaceId: number | null, flag: FeatureFlagKey): boolean {
  const flags = useWorkspaceFeatureFlags(workspaceId);
  return flags[flag] ?? true;
}