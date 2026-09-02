import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { clearPendingRegistration, getPendingRegistration } from "@/lib/legal-consent";

export type SessionUser = { id: number; fullName: string; phone: string | null; email: string | null; avatarUrl: string | null; createdAt: string };
export type SessionMembership = { userId: number; propertyGroupId: number; role: "owner" | "manager" | "staff" | "caretaker" | "guest"; permissions: string[] };
export type PropertyGroup = { id: number; name: string; logo: string | null; chaletsCount: number | null; currency: string | null; timeZone: string | null };
export type ActiveSession = { currentUser: SessionUser | null; activePropertyGroupId: number | null; isAuthenticated: boolean; rememberMe: boolean; biometricsEnabled: boolean };

const SESSION_PREFERENCES_KEY = "stay-in.session-preferences.v1";
type StoredPreferences = { rememberMe: boolean; biometricsEnabled: boolean };
const defaultPreferences: StoredPreferences = { rememberMe: true, biometricsEnabled: false };
type AuthSessionContextValue = ReturnType<typeof useAuthSessionState>;
const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const value = useAuthSessionState();
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const session = useContext(AuthSessionContext);
  if (!session) throw new Error("useAuthSession must be used within AuthSessionProvider");
  return session;
}

function useAuthSessionState() {
  const auth = useAuth();
  const routing = trpc.workspace.routing.useQuery(undefined, { enabled: auth.isAuthenticated, retry: false });
  const [preferences, setPreferences] = useState<StoredPreferences>(defaultPreferences);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const registrationCommit = trpc.auth.completeRegistration.useMutation();
  const committingRegistration = useRef(false);

  useEffect(() => { void AsyncStorage.getItem(SESSION_PREFERENCES_KEY).then((stored) => { if (stored) { try { setPreferences({ ...defaultPreferences, ...JSON.parse(stored) as Partial<StoredPreferences> }); } catch { /* retain safe defaults */ } } }).finally(() => setPreferencesReady(true)); }, []);
  useEffect(() => { if (Platform.OS === "web") { setBiometricAvailable(false); return; } void Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]).then(([hardware, enrolled]) => setBiometricAvailable(hardware && enrolled)).catch(() => setBiometricAvailable(false)); }, []);
  useEffect(() => { if (!auth.isAuthenticated || committingRegistration.current) return; void getPendingRegistration().then(async (pending) => { if (!pending) return; committingRegistration.current = true; try { await registrationCommit.mutateAsync({ name: pending.name, phone: pending.phone, termsVersion: pending.termsVersion, privacyVersion: pending.privacyVersion, conditionsVersion: pending.conditionsVersion, acceptedAt: pending.acceptedAt }); await clearPendingRegistration(); await auth.refresh(); } catch (error) { console.warn("[AuthSession] Could not persist pending registration", error); } finally { committingRegistration.current = false; } }); }, [auth, registrationCommit]);

  const savePreferences = useCallback(async (next: StoredPreferences) => { setPreferences(next); await AsyncStorage.setItem(SESSION_PREFERENCES_KEY, JSON.stringify(next)); }, []);
  const setRememberMe = useCallback((value: boolean) => savePreferences({ ...preferences, rememberMe: value }), [preferences, savePreferences]);
  const setBiometricsEnabled = useCallback(async (value: boolean) => {
    if (value) {
      if (Platform.OS === "web") return false;
      try {
        const [hasHardware, isEnrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
        if (!hasHardware || !isEnrolled) return false;
      } catch {
        return false;
      }
    }
    await savePreferences({ ...preferences, biometricsEnabled: value });
    return true;
  }, [preferences, savePreferences]);
  const unlockWithBiometrics = useCallback(async () => {
    if (!preferences.biometricsEnabled || !auth.isAuthenticated || !biometricAvailable) return false;
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: "تأكيد الدخول إلى StayIn", promptDescription: "استخدم بصمة الإصبع أو Face ID للمتابعة", cancelLabel: "إلغاء", fallbackLabel: "استخدام رمز الجهاز" });
    return result.success;
  }, [auth.isAuthenticated, biometricAvailable, preferences.biometricsEnabled]);

  const currentUser = useMemo<SessionUser | null>(() => auth.user ? { id: auth.user.id, fullName: auth.user.name?.trim() || "مستخدم StayIn", phone: auth.user.phone ?? null, email: auth.user.email ?? null, avatarUrl: auth.user.avatarUrl ?? null, createdAt: auth.user.lastSignedIn ? new Date(auth.user.lastSignedIn).toISOString() : new Date().toISOString() } : null, [auth.user]);
  const active = routing.data?.activeWorkspace;
  const activePropertyGroup = useMemo<PropertyGroup | null>(() => active ? { id: active.workspace.id, name: active.workspace.name, logo: active.workspace.logoUrl ?? null, chaletsCount: null, currency: active.workspace.currency ?? null, timeZone: active.workspace.timeZone ?? null } : null, [active]);
  const membership = useMemo<SessionMembership | null>(() => active && currentUser ? { userId: currentUser.id, propertyGroupId: active.workspace.id, role: active.member.role === "admin" ? "manager" : active.member.role, permissions: Object.entries(active.member.permissions ?? {}).filter(([, allowed]) => allowed).map(([permission]) => permission) } : null, [active, currentUser]);
  const activeSession = useMemo<ActiveSession>(() => ({ currentUser, activePropertyGroupId: activePropertyGroup?.id ?? null, isAuthenticated: auth.isAuthenticated, rememberMe: preferences.rememberMe, biometricsEnabled: preferences.biometricsEnabled }), [activePropertyGroup?.id, auth.isAuthenticated, currentUser, preferences]);

  return { ...auth, routing, activeSession, currentUser, activePropertyGroup, membership, preferencesReady, biometricAvailable, setRememberMe, setBiometricsEnabled, unlockWithBiometrics };
}
