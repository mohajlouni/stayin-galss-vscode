import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/oauth";

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  userCode?: string | null;
  loginMethod: string | null;
  role?: string | null;
  isSuperAdmin?: boolean;
  lastSignedIn: Date;
};

export async function getSessionToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(SESSION_TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") throw new Error("Window is not available");
      window.localStorage.setItem(SESSION_TOKEN_KEY, token);
      return;
    }
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
  } catch {
    throw new Error("Unable to store the session securely");
  }
}

export async function removeSessionToken(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_TOKEN_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  } catch {
    // A failed local cleanup must not prevent the caller from clearing UI state.
  }
}

export async function getUserInfo(): Promise<User | null> {
  try {
    const info = Platform.OS === "web"
      ? window.localStorage.getItem(USER_INFO_KEY)
      : await SecureStore.getItemAsync(USER_INFO_KEY);
    return info ? JSON.parse(info) as User : null;
  } catch {
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  try {
    const serialized = JSON.stringify(user);
    if (Platform.OS === "web") {
      window.localStorage.setItem(USER_INFO_KEY, serialized);
      return;
    }
    await SecureStore.setItemAsync(USER_INFO_KEY, serialized);
  } catch {
    throw new Error("Unable to store user session data");
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      window.localStorage.removeItem(USER_INFO_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(USER_INFO_KEY);
  } catch {
    // A failed local cleanup must not prevent the caller from clearing UI state.
  }
}

const POST_LOGOUT_NOTICE_KEY = "stay-in.post-logout-notice.v1";

export type DeletionNotice = {
  message: string;
  scheduledFor?: string;
};

function readDeletionNotice(value: string | null): DeletionNotice | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { message?: unknown; scheduledFor?: unknown };
    if (typeof parsed.message === "string" && parsed.message) {
      return { message: parsed.message, scheduledFor: typeof parsed.scheduledFor === "string" ? parsed.scheduledFor : undefined };
    }
  } catch {
    // Legacy plain-string format written before the structured payload.
  }
  return value.trim() ? { message: value } : null;
}

/**
 * Persists the account-deletion confirmation so the login screen can PIN it
 * (show it as an in-screen notice with the remaining grace period and a
 * recovery action) instead of a transient alert that can be lost. `scheduledFor`
 * is the ISO date of the permanent deletion so the screen can show a countdown.
 */
export async function setPostLogoutNotice(message: string, scheduledFor?: string): Promise<void> {
  const payload = JSON.stringify({ message, scheduledFor: scheduledFor ?? null });
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(POST_LOGOUT_NOTICE_KEY, payload);
      return;
    }
    await SecureStore.setItemAsync(POST_LOGOUT_NOTICE_KEY, payload);
  } catch {
    // Best-effort only: a failure must not block the forced sign-out.
  }
}

/** Reads the persisted deletion notice WITHOUT removing it (pinned until dismissed). */
export async function peekPostLogoutNotice(): Promise<DeletionNotice | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return null;
      return readDeletionNotice(window.localStorage.getItem(POST_LOGOUT_NOTICE_KEY));
    }
    return readDeletionNotice(await SecureStore.getItemAsync(POST_LOGOUT_NOTICE_KEY));
  } catch {
    return null;
  }
}

/** Reads and removes the persisted deletion notice (called only when dismissed). */
export async function consumePostLogoutNotice(): Promise<DeletionNotice | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return null;
      const value = window.localStorage.getItem(POST_LOGOUT_NOTICE_KEY);
      if (value) window.localStorage.removeItem(POST_LOGOUT_NOTICE_KEY);
      return readDeletionNotice(value);
    }
    const value = await SecureStore.getItemAsync(POST_LOGOUT_NOTICE_KEY);
    if (value) await SecureStore.deleteItemAsync(POST_LOGOUT_NOTICE_KEY);
    return readDeletionNotice(value);
  } catch {
    return null;
  }
}
