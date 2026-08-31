import { DEFAULT_DEVICE_SETTINGS, type AppData, type DeviceSettings, normalizeAppData } from "./booking-model";

type WorkspaceSyncError = {
  code?: unknown;
  data?: { code?: unknown };
  shape?: { data?: { code?: unknown } };
};

export function workspaceSyncErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const syncError = error as WorkspaceSyncError;
  const code = syncError.data?.code ?? syncError.shape?.data?.code ?? syncError.code;
  return typeof code === "string" ? code : null;
}

export function isWorkspaceVersionConflict(error: unknown) {
  return workspaceSyncErrorCode(error) === "CONFLICT";
}

export function isWorkspaceSessionError(error: unknown) {
  const code = workspaceSyncErrorCode(error);
  return code === "UNAUTHORIZED" || code === "FORBIDDEN";
}

function mergeById<T extends { id: string }>(workspaceItems: T[], deviceItems: T[]) {
  const known = new Set(workspaceItems.map((item) => item.id));
  return [...workspaceItems, ...deviceItems.filter((item) => !known.has(item.id))];
}

function deviceSettingsOverrides(device: AppData["settings"]["device"]): Partial<DeviceSettings> {
  if (!device) return {};
  return Object.fromEntries(Object.entries(device).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(DEFAULT_DEVICE_SETTINGS[key as keyof DeviceSettings]))) as Partial<DeviceSettings>;
}

function hasUserData(data: AppData) {
  return Boolean(data.bookings.length || data.waitlist.length || data.chalets.length || data.expenses?.length || data.specialPriceRules.length || data.auditLog.length || data.customers?.length || data.contracts?.length || data.assets?.length || data.maintenanceTasks?.length || data.notifications?.length || data.weatherLogs?.length || data.utilityReadings?.length || data.loyaltyAccounts?.length || data.loyaltyTransactions?.length || Object.keys(deviceSettingsOverrides(data.settings.device)).length);
}

/**
 * Preserves records created on a device before it joins a workspace.
 * Workspace records stay authoritative for matching IDs; device-only records are appended.
 */
export function mergeWorkspaceAppData(workspaceData: AppData, deviceData: AppData) {
  if (!hasUserData(deviceData)) return { data: workspaceData, merged: false };
  const localDeviceOverrides = deviceSettingsOverrides(deviceData.settings.device);
  const merged = normalizeAppData({
    ...workspaceData,
    bookings: mergeById(workspaceData.bookings, deviceData.bookings),
    waitlist: mergeById(workspaceData.waitlist, deviceData.waitlist),
    turnoverTasks: mergeById(workspaceData.turnoverTasks, deviceData.turnoverTasks),
    expenses: mergeById(workspaceData.expenses ?? [], deviceData.expenses ?? []),
    chalets: mergeById(workspaceData.chalets, deviceData.chalets),
    specialPriceRules: mergeById(workspaceData.specialPriceRules, deviceData.specialPriceRules),
    auditLog: mergeById(workspaceData.auditLog, deviceData.auditLog),
    customers: mergeById(workspaceData.customers ?? [], deviceData.customers ?? []),
    contracts: mergeById(workspaceData.contracts ?? [], deviceData.contracts ?? []),
    assets: mergeById(workspaceData.assets ?? [], deviceData.assets ?? []),
    maintenanceTasks: mergeById(workspaceData.maintenanceTasks ?? [], deviceData.maintenanceTasks ?? []),
    notifications: mergeById(workspaceData.notifications ?? [], deviceData.notifications ?? []),
    weatherLogs: mergeById(workspaceData.weatherLogs ?? [], deviceData.weatherLogs ?? []),
    utilityReadings: mergeById(workspaceData.utilityReadings ?? [], deviceData.utilityReadings ?? []),
    loyaltyAccounts: mergeById(workspaceData.loyaltyAccounts ?? [], deviceData.loyaltyAccounts ?? []),
    loyaltyTransactions: mergeById(workspaceData.loyaltyTransactions ?? [], deviceData.loyaltyTransactions ?? []),
    settings: { ...workspaceData.settings, device: { ...DEFAULT_DEVICE_SETTINGS, ...workspaceData.settings.device, ...localDeviceOverrides } },
  });
  const mergedChanged = JSON.stringify(merged) !== JSON.stringify(workspaceData);
  return { data: merged, merged: mergedChanged };
}
