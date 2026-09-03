import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { exchangeSupabaseOtp } from "@/lib/_core/api";
import { useAuthSession } from "@/lib/auth-session";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  AUTH_ERROR_MESSAGES,
  classifyAuthError,
  classifyIdentifier,
  classifyOtpError,
  isOtpTokenPresent,
  isSuperAdminCredential,
  isSuperAdminEmail,
  isSuperAdminPassword,
  normalizeEmail,
  normalizeOtpToken,
  passwordsMatch,
  SUPER_ADMIN_EMAIL,
  validateEmail,
  validateIdentifier,
  validatePassword,
  type AuthError,
  type IdentifierKind,
  type SupabaseOtpError,
  SUPABASE_OTP_ERROR_MESSAGES,
} from "@/lib/supabase-otp-engine";

export type { AuthError, IdentifierKind, SupabaseOtpError } from "@/lib/supabase-otp-engine";
export { AUTH_ERROR_MESSAGES, SUPABASE_OTP_ERROR_MESSAGES, classifyAuthError, classifyIdentifier, formatCountdown, isSuperAdminCredential, isSuperAdminEmail, isSuperAdminPassword, passwordsMatch, SUPER_ADMIN_EMAIL, validateIdentifier, validatePassword } from "@/lib/supabase-otp-engine";

/**
 * Passwordless Email OTP authentication on top of Supabase Auth, bridged into
 * the existing StayIn backend session so routing, tRPC headers, and workspace
 * access keep working unchanged. All messages are user-friendly Arabic.
 */

function emailRedirectToForPlatform(): string | undefined {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin || undefined;
  }
  return undefined;
}

/** Requests a passwordless email login code. Creates the user automatically when missing. */
export async function requestPasswordlessEmail(email: string): Promise<{ error: SupabaseOtpError | null }> {
  const validation = validateEmail(email);
  if (validation) return { error: "invalid-email" };
  if (!isSupabaseConfigured || !supabase) return { error: "not-configured" };

  // "signInWithOtp" both signs in an existing user and (with shouldCreateUser)
  // provisions a brand-new one — the email OTP token is the shared proof.
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: {
      shouldCreateUser: true,
      emailRedirectTo: emailRedirectToForPlatform(),
    },
  });
  if (error) return { error: classifyOtpError(error) };
  return { error: null };
}

/** Re-sends a fresh login code; callable after the countdown ends. */
export async function resendPasswordlessEmail(email: string): Promise<{ error: SupabaseOtpError | null }> {
  return requestPasswordlessEmail(email);
}

export type VerifyEmailOtpResult =
  | { ok: true; email: string }
  | { ok: false; error: SupabaseOtpError };

/**
 * Verifies the emailed OTP, then immediately bridges the resulting Supabase
 * session into the StayIn backend session and refreshes the auth context.
 */
export async function verifyEmailOtp(input: { email: string; token: string; refresh: ReturnType<typeof useAuthSession>["refresh"] }): Promise<VerifyEmailOtpResult> {
  const email = normalizeEmail(input.email);
  const token = normalizeOtpToken(input.token);

  if (!isSupabaseConfigured || !supabase) return { ok: false, error: "not-configured" };
  if (!isOtpTokenPresent(token)) return { ok: false, error: "invalid-otp" };

  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { ok: false, error: classifyOtpError(error) };

  // The Supabase client now holds a session; send its access token to our API
  // so the app's own session (routing/workspace/tRPC/data) is established.
  const session = supabase.auth.getSession();
  const accessToken = (await session).data.session?.access_token;
  if (!accessToken) return { ok: false, error: "unknown" };

  try {
    await exchangeSupabaseOtp({ supabaseAccessToken: accessToken, name: email, mode: "signin", provider: "email" });
  } catch {
    return { ok: false, error: "unknown" };
  }

  await input.refresh();
  return { ok: true, email };
}

export type SignInWithPasswordResult =
  | { ok: true; email: string }
  | { ok: false; error: AuthError };

/**
 * Direct Super Admin login bypass. When the identifier is the Super Admin email
 * or phone and the password matches the master credential, we authenticate
 * straight through the server (which issues the owner session with
 * `role: "super_admin"`) instead of relying on a Supabase Auth record that may
 * not be seeded or email-confirmed.
 */
export async function signInSuperAdmin(input: { identifier: string; password: string; refresh: ReturnType<typeof useAuthSession>["refresh"] }): Promise<SignInWithPasswordResult> {
  if (!isSuperAdminCredential(input.identifier, input.password)) {
    return { ok: false, error: "wrong-password" };
  }

  const { exchangeSuperAdminLogin } = await import("@/lib/_core/api");
  const result = await exchangeSuperAdminLogin({ identifier: input.identifier.trim(), password: input.password });
  if (!result.ok) {
    console.error("[CRITICAL LOGIN ERROR]:", result.error);
    const code = classifyAuthError(result.error ?? "");
    if (code === "network") return { ok: false, error: "network" };
    if (code === "wrong-password") return { ok: false, error: "wrong-password" };
    if (code === "unregistered") return { ok: false, error: "unregistered" };
    // Surface the exact underlying error instead of masking it behind a generic
    // message; the UI catch displays this raw message.
    throw new Error(result.error ?? "Unknown login error");
  }

  await input.refresh();
  const identifier = classifyIdentifier(input.identifier);
  return { ok: true, email: identifier.kind === "email" && identifier.email ? identifier.email : SUPER_ADMIN_EMAIL };
}

/**
 * Email + password sign-in. After Supabase verifies the credentials we bridge the
 * resulting session. The server independently enforces the registration gate:
 * an identity that was never created through sign-up returns
 * "الحساب غير مسجل، يرجى إنشاء حساب جديد".
 */
export async function signInWithPasswordFlow(input: { email: string; password: string; refresh: ReturnType<typeof useAuthSession>["refresh"] }): Promise<SignInWithPasswordResult> {
  // Defensive: if a Super Admin phone-shaped identifier (e.g. "0797402940") ever
  // reaches this path, route straight to the direct bypass — never forward a
  // phone number to Supabase password auth (SMS auth is disabled there).
  if (isSuperAdminCredential(input.email, input.password)) {
    return signInSuperAdmin({ identifier: input.email, password: input.password, refresh: input.refresh });
  }

  const email = normalizeEmail(input.email);
  const validation = validateEmail(email);
  if (validation) return { ok: false, error: "invalid-email" };
  if (input.password.length < 8) return { ok: false, error: "invalid-password" };

  if (!isSupabaseConfigured || !supabase) return { ok: false, error: "not-configured" };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: input.password });
  if (error || !data.session) {
    console.error("[Login Error] Supabase email/password sign-in failed", error ?? "no session");
    return { ok: false, error: classifyAuthError(error ?? new Error("sign-in-failed")) };
  }

  try {
    await exchangeSupabaseOtp({ supabaseAccessToken: data.session.access_token, name: email, mode: "signin", provider: "password" });
  } catch (err) {
    console.error("[Login Error] Session bridge failed", err);
    const code = classifyAuthError(err);
    if (code === "unregistered") return { ok: false, error: "unregistered" };
    return { ok: false, error: "unknown" };
  }

  await input.refresh();
  return { ok: true, email };
}

export type EmailSignupActivationResult =
  | { ok: true; email: string }
  | { ok: false; error: SupabaseOtpError | AuthError };

/**
 * Requests the sign-up confirmation OTP using the native numeric OTP flow. The
 * default Supabase SMTP cannot send custom magic-link templates (broken
 * `localhost` links render as "null is unreachable"), so we transition sign-up
 * to the built-in 6-digit OTP path. `shouldCreateUser: true` provisions the
 * Supabase Auth identity on demand and emails a numeric code that the user
 * enters on the verification screen. Account creation on the StayIn side is
 * deferred until the OTP is verified via `activateEmailSignup`.
 */
export async function requestEmailSignupOtp(input: { email: string; password: string; name: string; phone?: string | null }): Promise<{ error: SupabaseOtpError | null }> {
  const email = normalizeEmail(input.email);
  const validation = validateEmail(email);
  if (validation) return { error: "invalid-email" };
  const passwordIssue = validatePassword(input.password);
  if (passwordIssue) return { error: "unknown" };
  if (!isSupabaseConfigured || !supabase) return { error: "not-configured" };

  // Numerical sign-up OTP. `shouldCreateUser: true` provisions the Supabase Auth
  // identity on demand and emails a 6-digit numeric code (not a magic link); the
  // name/phone/role ride along as user_metadata so the new owner profile is
  // created complete once the code is verified.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: {
        fullName: input.name.trim(),
        phone: (input.phone ?? "").trim(),
        role: "owner",
      },
    },
  });
  if (error) return { error: classifyOtpError(error) };
  return { error: null };
}

/**
 * Finalizes sign-up: verifies the Email OTP, then tells the server this is a
 * sign-up (`mode: "signup"`) so it creates the account (only now), retains the
 * Super Admin merge, and provisions the first default workspace for a genuine
 * new user.
 */
export async function activateEmailSignup(input: { email: string; token: string; name: string; refresh: ReturnType<typeof useAuthSession>["refresh"] }): Promise<EmailSignupActivationResult> {
  const email = normalizeEmail(input.email);
  const token = normalizeOtpToken(input.token);

  if (!isSupabaseConfigured || !supabase) return { ok: false, error: "not-configured" };
  if (!isOtpTokenPresent(token)) return { ok: false, error: "invalid-otp" };

  // The sign-up code was delivered through the native numeric OTP flow
  // (`signInWithOtp`), so the token verifies against the `email` OTP type.
  // Fall back to `signup` for providers that deliver a confirmation-style code.
  const verified = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (verified.error) {
    const signup = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    if (signup.error) return { ok: false, error: classifyOtpError(verified.error) };
  }

  const session = supabase.auth.getSession();
  const accessToken = (await session).data.session?.access_token;
  if (!accessToken) return { ok: false, error: "unknown" };

  try {
    await exchangeSupabaseOtp({ supabaseAccessToken: accessToken, name: input.name.trim() || email, mode: "signup", provider: "email" });
  } catch {
    return { ok: false, error: "unknown" };
  }

  await input.refresh();
  return { ok: true, email };
}

export type SocialSignInResult =
  | { ok: true }
  | { ok: false; error: AuthError };

/**
 * Native full-width Google / Apple OAuth button. Uses Supabase
 * `signInWithOAuth`, captures the resulting session via `onAuthStateChange`, then
 * bridges it into the StayIn session. The server applies the same registration
 * gate and Super Admin merge, and auto-provisions a workspace on first-time
 * social sign-in.
 */
export async function socialSignIn(input: { provider: "google" | "apple"; refresh: ReturnType<typeof useAuthSession>["refresh"] }): Promise<SocialSignInResult> {
  if (!isSupabaseConfigured || !supabase) return { ok: false, error: "not-configured" };
  const client = supabase;

  const sessionPromise = new Promise<{ accessToken: string; email: string } | null>((resolve) => {
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.access_token) {
        resolve({ accessToken: session.access_token, email: session.user?.email ?? "" });
      } else if (event === "SIGNED_OUT") {
        resolve(null);
      }
    });
    setTimeout(() => {
      data.subscription.unsubscribe();
      resolve(null);
    }, 60_000);
  });

  const { error } = await client.auth.signInWithOAuth({
    provider: input.provider,
    options: { redirectTo: emailRedirectToForPlatform(), skipBrowserRedirect: false },
  });
  if (error) {
    console.error("[Login Error] Social provider sign-in failed", error);
    return { ok: false, error: classifyAuthError(error) };
  }

  const captured = await sessionPromise;
  if (!captured || !captured.accessToken || !captured.email) return { ok: false, error: "unknown" };

  try {
    await exchangeSupabaseOtp({ supabaseAccessToken: captured.accessToken, name: captured.email, mode: "signin", provider: input.provider });
  } catch (err) {
    console.error("[Login Error] Social session bridge failed", err);
    const code = classifyAuthError(err);
    if (code === "unregistered") return { ok: false, error: "unregistered" };
    return { ok: false, error: "unknown" };
  }

  await input.refresh();
  return { ok: true };
}

/** 5-minute (300s) countdown clock driving the "Resend code" affordance. */
export function useOtpCountdown(initialSeconds = 300) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) return undefined;
    if (remaining <= 0) return undefined;
    const id = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  const start = useCallback(() => {
    startedRef.current = true;
    setRemaining(initialSeconds);
  }, [initialSeconds]);

  const reset = useCallback(() => {
    setRemaining(initialSeconds);
  }, [initialSeconds]);

  const expired = remaining <= 0;

  return { remaining, expired, start, reset };
}

/**
 * Counts down from `initialSeconds` to 0 and exposes a `restart()` action.
 * Used for the "Resend code" cooldown (60s), independent from the OTP expiry
 * clock: the resend button stays disabled until the cooldown reaches zero.
 */
export function useResendCooldown(initialSeconds = 60) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!active || remaining <= 0) return undefined;
    const id = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [active, remaining]);

  const restart = useCallback(() => {
    setActive(true);
    setRemaining(initialSeconds);
  }, [initialSeconds]);

  const ready = !active || remaining <= 0;

  return { remaining, ready, restart };
}

