import { getApiBaseUrl } from "@/constants/oauth";

import * as Auth from "./auth";

export type AuthenticatedUser = {
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
  lastSignedIn: string;
};

export type LoginDestination = "admin" | "restore" | "onboarding" | "dashboard" | "selector";

export type PendingDeletionInfo = {
  scheduledFor: string;
  requestedAt: string;
};

export async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  const sessionToken = await Auth.getSessionToken();
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;

  const baseUrl = getApiBaseUrl();
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = baseUrl ? `${cleanBaseUrl}${cleanEndpoint}` : endpoint;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed (${response.status})`;
      try {
        const errorJson = JSON.parse(errorText) as { error?: string; message?: string };
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        // Never write untrusted response bodies, cookies, or headers to device logs.
      }
      throw new Error(errorMessage);
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) return await response.json() as T;

    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch (error) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      // eslint-disable-next-line no-console
      console.error(`[apiCall] ${endpoint} -> ${url} failed:`, error);
    }
    throw error instanceof Error ? error : new Error("Unknown API request failure");
  }
}

export async function exchangeOAuthCode(
  code: string,
  state: string,
): Promise<{ sessionToken: string; user: AuthenticatedUser | null }> {
  const params = new URLSearchParams({ code, state });
  const result = await apiCall<{ app_session_id: string; user: AuthenticatedUser | null }>(`/api/oauth/mobile?${params.toString()}`);
  return { sessionToken: result.app_session_id, user: result.user };
}

/**
 * Local dev login: accepts any phone number and any password against the local
 * API server (no identity portal). Stored as a bearer session used by both web
 * and native so login works across different hosts (localhost page -> LAN API).
 */
export async function startLocalLogin(input: { phone: string; password: string }): Promise<boolean> {
  const result = await apiCall<{ sessionToken: string; user: AuthenticatedUser | null }>("/api/dev/local-login", {
    method: "POST",
    body: JSON.stringify({ phone: input.phone, password: input.password }),
  });

  await Auth.setSessionToken(result.sessionToken);
  if (result.user) {
    await Auth.setUserInfo({
      id: result.user.id,
      openId: result.user.openId,
      name: result.user.name,
      email: result.user.email,
      phone: result.user.phone ?? null,
      avatarUrl: result.user.avatarUrl ?? null,
      userCode: result.user.userCode ?? null,
      loginMethod: result.user.loginMethod ?? null,
      lastSignedIn: new Date(result.user.lastSignedIn),
    });
  }
  return true;
}

export async function logout(): Promise<void> {
  await apiCall<void>("/api/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<AuthenticatedUser | null> {
  try {
    const result = await apiCall<{ user: AuthenticatedUser | null }>("/api/auth/me");
    return result.user;
  } catch {
    return null;
  }
}

/**
 * Bridges a successfully verified Supabase Auth session into the StayIn backend
 * session: sends the Supabase access token to the server, which validates it,
 * resolves the canonical identity (merging the Super Admin to the owner openId,
 * enforcing the registration gate, and provisioning the first workspace on
 * first-time sign-up activation), then returns an app session token + user.
 * Stores the pair exactly like the OAuth/local login paths so routing, tRPC
 * headers, and workspace access keep working unchanged.
 */
export async function exchangeSupabaseOtp(input: { supabaseAccessToken: string; name?: string | null; mode?: "signin" | "signup"; provider?: string | null }): Promise<{ pendingDeletion?: PendingDeletionInfo | null; destination?: LoginDestination }> {
  const result = await apiCall<{ app_session_id: string; user: AuthenticatedUser | null; pendingDeletion?: PendingDeletionInfo | null; destination?: LoginDestination }>("/api/auth/supabase-otp", {
    method: "POST",
    body: JSON.stringify({
      supabaseAccessToken: input.supabaseAccessToken,
      name: input.name ?? null,
      mode: input.mode ?? "signin",
      provider: input.provider ?? "email",
    }),
  });

  await Auth.setSessionToken(result.app_session_id);
  if (result.user) {
    await Auth.setUserInfo({
      id: result.user.id,
      openId: result.user.openId,
      name: result.user.name,
      email: result.user.email,
      phone: result.user.phone ?? null,
      avatarUrl: result.user.avatarUrl ?? null,
      userCode: result.user.userCode ?? null,
      loginMethod: result.user.loginMethod ?? null,
      role: result.user.role ?? null,
      isSuperAdmin: result.user.isSuperAdmin ?? false,
      lastSignedIn: new Date(result.user.lastSignedIn),
    });
  }
  return { pendingDeletion: result.pendingDeletion ?? null, destination: result.destination };
}

/**
 * Checks whether an email currently has an active (within-grace-period) account
 * deletion request. Public and keyed by email so the login screen can detect a
 * pending-deletion account and show the recovery message instead of a generic
 * "wrong password" dead-end.
 */
export async function checkPendingDeletion(email: string): Promise<{ pending: boolean; scheduledFor: string | null }> {
  const baseUrl = getApiBaseUrl();
  const url = baseUrl ? `${baseUrl}/api/auth/check-pending-deletion` : "/api/auth/check-pending-deletion";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      credentials: "include",
    });
    if (!response.ok) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        // eslint-disable-next-line no-console
        console.error(`[api] check-pending-deletion ${url} -> HTTP ${response.status}`);
      }
      return { pending: false, scheduledFor: null };
    }
    const body = (await response.json()) as { pending?: boolean; scheduledFor?: string | null };
    return { pending: Boolean(body.pending), scheduledFor: body.scheduledFor ?? null };
  } catch (err) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      // eslint-disable-next-line no-console
      console.error(`[api] check-pending-deletion ${url} failed:`, err instanceof Error ? err.message : err);
    }
    return { pending: false, scheduledFor: null };
  }
}

/**
 * Authoritative identity-existence check against the backend. After a failed
 * password login the screen calls this to separate two honest messages:
 * - `registered: true`  -> the email exists in the system, the password failed.
 * - `registered: false` -> the email is not registered at all.
 * `checked: false` signals the backend could not be reached (network/server
 * unavailable); callers then fall back to the last-resort message instead of
 * guessing.
 */
export async function checkIdentityStatus(email: string): Promise<{ registered: boolean; checked: boolean }> {
  const baseUrl = getApiBaseUrl();
  const url = baseUrl ? `${baseUrl}/api/auth/identity-status` : "/api/auth/identity-status";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      credentials: "include",
    });
    if (!response.ok) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        // eslint-disable-next-line no-console
        console.error(`[api] identity-status ${url} -> HTTP ${response.status}`);
      }
      return { registered: false, checked: false };
    }
    const body = (await response.json()) as { registered?: boolean };
    return { registered: Boolean(body.registered), checked: true };
  } catch (err) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      // eslint-disable-next-line no-console
      console.error(`[api] identity-status ${url} failed:`, err instanceof Error ? err.message : err);
    }
    return { registered: false, checked: false };
  }
}

/**
 * Direct Super Admin login that bypasses Supabase Auth entirely. The server
 * validates the master credential (resolved from the environment) against the
 * canonical owner identity and issues the owner session, so it works even if
 * the Supabase Auth user has not been seeded or email-confirmed.
 *
 * The request uses an absolute API URL (never a relative `fetch` path, which
 * fails on Expo native) with an explicit `Content-Type: application/json`.
 * Password verification happens server-side only; the client never holds the
 * master secret and has no local fallback that fabricates an owner session.
 */
export async function exchangeSuperAdminLogin(input: { identifier: string; password: string }): Promise<{ ok: boolean; error?: string; destination?: LoginDestination }> {
  const baseUrl = getApiBaseUrl();
  const url = baseUrl ? `${baseUrl}/api/auth/super-admin-login` : "/api/auth/super-admin-login";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: input.identifier, password: input.password }),
      credentials: "include",
    });
    if (!response.ok) {
      let message = `API request failed (${response.status})`;
      try {
        const body = await response.text();
        const json = JSON.parse(body) as { error?: string; message?: string };
        message = json.error || json.message || message;
      } catch {
        // keep the status-based message
      }
      return { ok: false, error: message };
    }
    const result = await response.json() as { app_session_id: string; user: AuthenticatedUser | null; destination?: LoginDestination };
    await Auth.setSessionToken(result.app_session_id);
    if (result.user) {
      await Auth.setUserInfo({
        id: result.user.id,
        openId: result.user.openId,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone ?? null,
        avatarUrl: result.user.avatarUrl ?? null,
        userCode: result.user.userCode ?? null,
        loginMethod: result.user.loginMethod ?? null,
        role: result.user.role ?? null,
        isSuperAdmin: result.user.isSuperAdmin ?? false,
        lastSignedIn: new Date(result.user.lastSignedIn),
      });
    }
    return { ok: true, destination: result.destination };
  } catch (err) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      // eslint-disable-next-line no-console
      console.error("[api] super-admin-login failed", { url, baseUrl, cause: err instanceof Error ? err.message : String(err), err });
    } else {
      console.error("[CRITICAL LOGIN ERROR] /api/auth/super-admin-login network failure", err);
    }
    // No local bypass: authentication is delegated strictly to the backend. A
    // failure here must surface exactly what the server/network reported so the
    // session is never fabricated from client-held secrets.
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function establishSession(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}
