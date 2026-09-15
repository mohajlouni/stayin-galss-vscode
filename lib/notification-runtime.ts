import Constants, { AppOwnership, ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

/**
 * Expo Go supports local notifications, but Android Expo Go cannot obtain remote
 * push tokens from SDK 53 onward. Keep this guard separate from local reminder code.
 * Uses both `executionEnvironment` and the deprecated `appOwnership` for defense-in-depth.
 */
export function isExpoGoRuntime() {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient || Constants.appOwnership === AppOwnership.Expo;
}

/** Remote token registration is reserved for development/production app builds. */
export function canRegisterRemotePushNotifications() {
  return Platform.OS !== "web" && !isExpoGoRuntime();
}

/**
 * The only supported entry point for remote token registration. Returning null in
 * Expo Go prevents the SDK 53+ Android warning while leaving local reminders intact.
 *
 * `expo-notifications` is loaded lazily on purpose: its barrel file re-exports
 * `getExpoPushTokenAsync`, which runs `TokenAutoRegistration.fx` at module scope and
 * immediately calls `addPushTokenListener` -> `warnOfExpoGoPushUsage`. A static import
 * would therefore fire the Expo Go warning before this guard could ever run.
 */
export async function getRemoteExpoPushToken(projectId: string) {
  if (!canRegisterRemotePushNotifications()) return null;
  const Notifications = await import("expo-notifications");
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
