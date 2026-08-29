import { Platform } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";

import * as Auth from "./auth";

export type AuthenticatedUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  loginMethod: string | null;
  lastSignedIn: string;
};

export async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (Platform.OS !== "web") {
    const sessionToken = await Auth.getSessionToken();
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  }

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
 * API server (no identity portal). Web uses the cookie redirect flow; native
 * stores the returned session token and user like the mobile OAuth exchange.
 */
export async function startLocalLogin(input: { phone: string; password: string }): Promise<boolean> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams({ phone: input.phone, password: input.password });
    window.location.href = `${getApiBaseUrl()}/api/dev/local-login?${params.toString()}`;
    return true;
  }

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
