import AsyncStorage from "@react-native-async-storage/async-storage";

export const LEGAL_VERSIONS = { terms: "2026-08-24", privacy: "2026-08-24", conditions: "2026-08-24" } as const;
const PENDING_REGISTRATION_KEY = "stay-in.pending-registration.v1";

export type PendingRegistration = { name: string; contactType: "phone" | "email"; phone: string | null; email: string | null; acceptedAt: string; termsVersion: string; privacyVersion: string; conditionsVersion: string };

export async function savePendingRegistration(registration: PendingRegistration) { await AsyncStorage.setItem(PENDING_REGISTRATION_KEY, JSON.stringify(registration)); }
export async function getPendingRegistration(): Promise<PendingRegistration | null> { const value = await AsyncStorage.getItem(PENDING_REGISTRATION_KEY); if (!value) return null; try { return JSON.parse(value) as PendingRegistration; } catch { await AsyncStorage.removeItem(PENDING_REGISTRATION_KEY); return null; } }
export async function clearPendingRegistration() { await AsyncStorage.removeItem(PENDING_REGISTRATION_KEY); }
