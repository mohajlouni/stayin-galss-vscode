import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Expo Go supports local notifications, but Android Expo Go cannot obtain remote
 * push tokens from SDK 53 onward. Keep this guard separate from local reminder code.
 */
export function isExpoGoRuntime() {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** Remote token registration is reserved for development/production app builds. */
export function canRegisterRemotePushNotifications() {
  return Platform.OS !== "web" && !isExpoGoRuntime();
}

/**
 * The only supported entry point for remote token registration. Returning null in
 * Expo Go prevents the SDK 53+ Android warning while leaving local reminders intact.
 */
export async function getRemoteExpoPushToken(projectId: string) {
  if (!canRegisterRemotePushNotifications()) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
