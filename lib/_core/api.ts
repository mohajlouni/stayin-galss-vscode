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
export async function exchangeSupabaseOtp(input: { supabaseAccessToken: string; name?: string | null; mode?: "signin" | "signup"; provider?: string | null }): Promise<{ pendingDeletion?: PendingDeletionInfo | null }> {
  const result = await apiCall<{ app_session_id: string; user: AuthenticatedUser | null; pendingDeletion?: PendingDeletionInfo | null }>("/api/auth/supabase-otp", {
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
  return { pendingDeletion: result.pendingDeletion ?? null };
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
    if (!response.ok) return { pending: false, scheduledFor: null };
    const body = (await response.json()) as { pending?: boolean; scheduledFor?: string | null };
    return { pending: Boolean(body.pending), scheduledFor: body.scheduledFor ?? null };
  } catch {
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
    if (!response.ok) return { registered: false, checked: false };
    const body = (await response.json()) as { registered?: boolean };
    return { registered: Boolean(body.registered), checked: true };
  } catch {
    return { registered: false, checked: false };
  }
}

/**
 * Direct Super Admin login that bypasses Supabase Auth entirely. The server
 * validates the master credential against the canonical owner identity and
 * issues the owner session, so it works even if the Supabase Auth user has not
 * been seeded or email-confirmed.
 *
 * The request uses an absolute API URL (never a relative `fetch` path, which
 * fails on Expo native) with an explicit `Content-Type: application/json`. If
 * the network call throws or is blocked, we fall back to a local in-memory
 * bridge so the Super Admin can still reach the workspace gate: a session token
 * and the canonical owner profile (`stay-in-preview-owner-v1`, role
 * `super_admin`) are persisted to secure storage, and native session restore
 * accepts it without a server round-trip.
 */
export async function exchangeSuperAdminLogin(input: { identifier: string; password: string }): Promise<{ ok: boolean; error?: string; local?: boolean }> {
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
    const result = await response.json() as { app_session_id: string; user: AuthenticatedUser | null };
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
    return { ok: true };
  } catch (err) {
    console.error("[CRITICAL LOGIN ERROR] /api/auth/super-admin-login network failure", err);
    // Local bypass: only for the canonical Super Admin master credential.
    if (isSuperAdminCredentialLocal(input.identifier, input.password)) {
      try {
        await Auth.setSessionToken(`local-super-admin-${Date.now()}`);
        await Auth.setUserInfo({
          id: 1,
          openId: "stay-in-preview-owner-v1",
          name: "مالك StayIn (سوبر أدمن)",
          email: "moh.ajlouni.90@gmail.com",
          phone: "0797402940",
          avatarUrl: null,
          userCode: "U1000",
          loginMethod: "super-admin-local",
          role: "super_admin",
          isSuperAdmin: true,
          lastSignedIn: new Date(),
        });
        return { ok: true, local: true };
      } catch (localErr) {
        console.error("[CRITICAL LOGIN ERROR] local bypass persist failed", localErr);
        return { ok: false, error: localErr instanceof Error ? localErr.message : String(localErr) };
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

function isSuperAdminCredentialLocal(identifier: string, password: string): boolean {
  const hasPassword = String(password ?? "") === "Ajlouni911";
  if (!hasPassword) return false;
  const normalized = String(identifier ?? "").trim().toLowerCase();
  if (normalized === "moh.ajlouni.90@gmail.com") return true;
  const phoneDigits = normalized.replace(/[^\d]/g, "").replace(/^0+/, "");
  return phoneDigits === "797402940" || phoneDigits === "962797402940";
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
