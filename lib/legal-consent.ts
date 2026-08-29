import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import { LEGAL_VERSIONS } from "./legal-versions";

export { LEGAL_VERSIONS };
const PENDING_REGISTRATION_KEY = "stay-in.pending-registration.v1";

export type PendingRegistration = { name: string; contactType: "phone" | "email"; phone: string | null; email: string | null; acceptedAt: string; termsVersion: string; privacyVersion: string; conditionsVersion: string };

const isNative = Platform.OS !== "web";
let webFallbackRegistration: string | null = null;

export async function savePendingRegistration(registration: PendingRegistration) {
  const payload = JSON.stringify(registration);
  if (!isNative) {
    webFallbackRegistration = payload;
    return;
  }
  await SecureStore.setItemAsync(PENDING_REGISTRATION_KEY, payload);
}

export async function getPendingRegistration(): Promise<PendingRegistration | null> {
  const payload = isNative ? await SecureStore.getItemAsync(PENDING_REGISTRATION_KEY) : webFallbackRegistration;
  if (!payload) return null;
  try {
    return JSON.parse(payload) as PendingRegistration;
  } catch {
    await clearPendingRegistration();
    return null;
  }
}

export async function clearPendingRegistration() {
  if (!isNative) {
    webFallbackRegistration = null;
    return;
  }
  await SecureStore.deleteItemAsync(PENDING_REGISTRATION_KEY);
}