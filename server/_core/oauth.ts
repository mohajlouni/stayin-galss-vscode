import { createClient } from "@supabase/supabase-js";
import { COOKIE_NAME, SESSION_TTL_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { ensureLocalDevAccess, getDb, getUserByEmail, getUserByOpenId, linkOwnerWorkspace, upsertUser } from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { isSuperAdminEmail, isSuperAdminPhone, matchesSuperAdminIdentity, SUPER_ADMIN_EMAIL } from "./identity";
import { isAllowedWebOrigin } from "./security";
import { sdk, sessionTokenFromRequest } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

async function syncUser(userInfo: {
  openId?: string | null;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
}) {
  if (!userInfo.openId) {
    throw new Error("openId missing from user info");
  }

  const lastSignedIn = new Date();
  await upsertUser({
    openId: userInfo.openId,
    name: userInfo.name || null,
    email: userInfo.email ?? null,
    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
    lastSignedIn,
  });
  const saved = await getUserByOpenId(userInfo.openId);
  return (
    saved ?? {
      openId: userInfo.openId,
      name: userInfo.name,
      email: userInfo.email,
      loginMethod: userInfo.loginMethod ?? null,
      lastSignedIn,
    }
  );
}

function buildUserResponse(
  user:
    | Awaited<ReturnType<typeof getUserByOpenId>>
    |       {
        openId?: string | null;
        name?: string | null;
        email?: string | null;
        phone?: string | null;
        loginMethod?: string | null;
        lastSignedIn?: Date | null;
        role?: string | null;
      },
) {
  const isSuperAdmin = matchesSuperAdminIdentity(
    { openId: user?.openId ?? null, email: user?.email ?? null, phone: (user as any)?.phone ?? null },
    ENV.ownerOpenId,
  );
  return {
    id: (user as any)?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    phone: (user as any)?.phone ?? null,
    loginMethod: user?.loginMethod ?? null,
    role: isSuperAdmin ? "super_admin" : (user as any)?.role ?? "user",
    isSuperAdmin,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

async function establishLocalDevSession(phoneValue: unknown) {
  const digits = String(phoneValue ?? "").replace(/\D/g, "");
  // تسجيل دخول السوبر أدمن برقمه يوجّه لشخصية المالك المعروفة = وصول شامل + مساحة المعاينة الكاملة.
  const isSuperAdmin = isSuperAdminPhone(digits);
  const openId = isSuperAdmin ? ENV.ownerOpenId : digits ? `local-dev-${digits}` : `local-dev-anonymous`;
  const displayName = isSuperAdmin ? "مالك StayIn (سوبر أدمن)" : digits ? `مستخدم ${digits}` : "مستخدم StayIn (محلي)";
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await upsertUser({ openId, name: displayName, phone: digits || null, email: isSuperAdmin ? SUPER_ADMIN_EMAIL : undefined, loginMethod: "local-dev", lastSignedIn: new Date() });
  const saved = await getUserByOpenId(openId);
  if (!saved?.id) throw new Error("Local user could not be created");
  await ensureLocalDevAccess({ userId: saved.id, displayName, phone: digits || "—" });
  const sessionToken = await sdk.createSessionToken(openId, { name: displayName, expiresInMs: SESSION_TTL_MS });
  return { sessionToken, saved };
}

const SUPER_ADMIN_MASTER_PASSWORD = "Ajlouni911";

/** Creates/updates a Supabase Auth user (confirmed) via the Admin API, when a
 *  service-role key is configured. Failures are non-fatal: the direct login
 *  bypass below still issues the owner session regardless. */
async function seedSupabaseSuperAdmin(email: string): Promise<void> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRole) return;
  try {
    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = existing?.users?.find((u) => u.email?.toLowerCase() === email);
    if (match) {
      await admin.auth.admin.updateUserById(match.id, {
        password: SUPER_ADMIN_MASTER_PASSWORD,
        email_confirm: true,
        user_metadata: { ...(match.user_metadata ?? {}), role: "super_admin" },
      });
    } else {
      await admin.auth.admin.createUser({
        email,
        password: SUPER_ADMIN_MASTER_PASSWORD,
        email_confirm: true,
        user_metadata: { role: "super_admin", name: "مالك StayIn (سوبر أدمن)" },
      });
    }
  } catch (error) {
    console.error("[SuperAdmin] Admin seed failed (non-fatal):", error);
  }
}

/** Establishes the owner session directly for the Super Admin master login. */
async function establishSuperAdminSession() {
  const openId = ENV.ownerOpenId;
  const displayName = "مالك StayIn (سوبر أدمن)";
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await upsertUser({ openId, name: displayName, email: SUPER_ADMIN_EMAIL, phone: "0797402940", loginMethod: "super-admin", lastSignedIn: new Date() });
  const saved = await getUserByOpenId(openId);
  if (!saved?.id) throw new Error("Super Admin user could not be created");
  // Link the owner to their EXISTING workspace (with all real chalets/data)
  // instead of provisioning a fresh demo workspace. Never bootstrap a new empty
  // workspace for the canonical owner identity.
  await linkOwnerWorkspace({ id: saved.id, name: saved.name ?? displayName });
  const sessionToken = await sdk.createSessionToken(openId, { name: displayName, expiresInMs: SESSION_TTL_MS });
  return { sessionToken, saved };
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: SESSION_TTL_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });

      // Redirect to the frontend URL (Expo web on port 8081)
      // Cookie is set with parent domain so it works across both 3000 and 8081 subdomains
      const frontendUrl =
        process.env.EXPO_WEB_PREVIEW_URL ||
        process.env.EXPO_PACKAGER_PROXY_URL ||
        "http://localhost:8081";
      res.redirect(302, frontendUrl);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  app.get("/api/oauth/mobile", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      const user = await syncUser(userInfo);

      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: SESSION_TTL_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });

      res.json({
        app_session_id: sessionToken,
        user: buildUserResponse(user),
      });
    } catch (error) {
      console.error("[OAuth] Mobile exchange failed", error);
      res.status(500).json({ error: "OAuth mobile exchange failed" });
    }
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    // CSRF guard: cookie-clearing endpoint must only be triggered from the
    // same host (origin header, when present, must match the request host).
    // Bearer-token (mobile) calls carry no Origin header and are unaffected.
    const origin = req.headers.origin;
    const host = req.headers.host ?? "";
    if (typeof origin === "string" && origin.trim() !== "" && origin.trim() !== "null") {
      try {
        if (new URL(origin).host !== host) {
          res.status(403).json({ error: "Cross-origin logout blocked" });
          return;
        }
      } catch {
        res.status(403).json({ error: "Invalid origin" });
        return;
      }
    }
    const token = sessionTokenFromRequest(req);
    await sdk.revokeSessionToken(token);
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // Get current authenticated user - works with both cookie (web) and Bearer token (mobile)
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const email = (user?.email ?? "").trim().toLowerCase();
      const pendingDeletion = email ? await (await import("../db")).getPendingDeletionByEmail(email).catch(() => null) : null;
      res.json({
        user: buildUserResponse(user),
        pendingDeletion: pendingDeletion ? { scheduledFor: pendingDeletion.scheduledFor.toISOString(), requestedAt: pendingDeletion.requestedAt.toISOString() } : null,
      });
    } catch (error) {
      console.error("[Auth] /api/auth/me failed:", error);
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  // Establish session cookie from Bearer token
  // Used by iframe preview: frontend receives token via postMessage, then calls this endpoint
  // to get a proper Set-Cookie response from the backend (3000-xxx domain)
  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      // Authenticate using Bearer token from Authorization header
      const user = await sdk.authenticateRequest(req);

      // Get the token from the Authorization header to set as cookie
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();

      // Set cookie for this domain (3000-xxx)
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_TTL_MS });

      res.json({ success: true, user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/session failed:", error);
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.get("/api/dev/preview-login", async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") {
      res.status(404).json({ error: "Preview login is disabled in production" });
      return;
    }

    const previewOpenId = "stay-in-preview-owner-v1";
    const previewName = "مالك المعاينة (محلي)";

    try {
      const db = await getDb();
      if (!db) throw new Error("Database is not available");

      await upsertUser({
        openId: previewOpenId,
        name: previewName,
        email: null,
        loginMethod: "preview-local",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(previewOpenId, {
        name: previewName,
        expiresInMs: SESSION_TTL_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });

      const frontendUrl =
        process.env.EXPO_WEB_PREVIEW_URL ||
        process.env.EXPO_PACKAGER_PROXY_URL ||
        "http://localhost:8081";
      res.redirect(302, frontendUrl);
    } catch (error) {
      console.error("[Preview] Preview login failed:", error);
      res.status(500).json({ error: "Failed to create preview session" });
    }
  });

  // Local dev login: accepts any phone number and any password, no identity portal.
  app.post("/api/dev/local-login", async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") {
      res.status(404).json({ error: "Local login is disabled in production" });
      return;
    }
    try {
      const body = (req.body ?? {}) as { phone?: unknown; password?: unknown };
      const { sessionToken, saved } = await establishLocalDevSession(body.phone);
      const typed = saved as unknown as { phone?: string | null };
      res.json({
        sessionToken,
        user: { ...buildUserResponse(saved), phone: typed.phone ?? null },
      });
    } catch (error) {
      console.error("[Local] Local login failed:", error);
      res.status(500).json({ error: "Failed to create local session" });
    }
  });

  app.get("/api/dev/local-login", async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") {
      res.status(404).json({ error: "Local login is disabled in production" });
      return;
    }
    try {
      const { sessionToken } = await establishLocalDevSession(getQueryParam(req, "phone"));
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });
      let frontendUrl = process.env.EXPO_WEB_PREVIEW_URL || "http://localhost:8081";
      const referer = req.headers.referer;
      if (referer) {
        try {
          const origin = new URL(referer).origin;
          // Only allow redirects back to a web origin trusted by the CORS
          // allowlist (localhost / .manuspre.computer / explicit env origins).
          if (isAllowedWebOrigin(origin)) frontendUrl = origin;
        } catch {
          frontendUrl = "http://localhost:8081";
        }
      }
      res.redirect(302, frontendUrl);
    } catch (error) {
      console.error("[Local] Local login failed:", error);
      res.status(500).json({ error: "Failed to create local session" });
    }
  });
}

/**
 * Bridge: turns a verified Supabase Auth session into a StayIn backend session.
 *
 * The client verifies the identity via the Supabase JS SDK (email OTP, password,
 * or OAuth provider) and sends back the resulting access token. We validate it
 * server-side (signature + live check), resolve the canonical identity, and issue
 * the same signed `app_session_id`/cookie used by the OAuth flow.
 *
 * Identity resolution & gates:
 * - The Super Admin (`moh.ajlouni.90@gmail.com`) is ALWAYS merged to the single
 *   canonical owner `openId` (`OWNER_OPEN_ID`) so we never create a parallel row.
 * - Sign-in (`mode: "signin"`) refuses identities that are not yet registered:
 *   `هذا الحساب غير مسجل، يرجى إنشاء حساب جديد.`. Account creation is exclusively the
 *   sign-up path (`mode: "signup"`), which runs after successful Email OTP
 *   activation and creates the account WITH ZERO workspaces — the routing guard
 *   then forces the brand-new user (or a re-registering purged account) through
 *   the /onboarding gateway where they pick a role. Never provisions for the
 *   Super Admin or on re-login, and never for the Super Admin.
 */
export function registerSupabaseAuthRoutes(app: Express) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

  app.post("/api/auth/check-pending-deletion", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "email is required" });
      return;
    }
    try {
      const { getPendingDeletionByEmail } = await import("../db");
      const pending = await getPendingDeletionByEmail(email).catch(() => null);
      res.json({ pending: Boolean(pending), scheduledFor: pending ? pending.scheduledFor.toISOString() : null });
    } catch (error) {
      console.error("[Auth] /api/auth/check-pending-deletion failed:", error);
      res.status(500).json({ pending: false, scheduledFor: null });
    }
  });

  // Authoritative identity-existence check used by the login screen to separate
  // "this email is not registered in the system" from "this account exists but
  // the password is wrong". Backed by the same store as the registration gate
  // below (users table + the canonical Super Admin identity), so the two never
  // drift apart. Never leaks the password state: only a boolean is returned.
  app.post("/api/auth/identity-status", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "email is required" });
      return;
    }
    try {
      if (isSuperAdminEmail(email)) {
        res.json({ registered: true });
        return;
      }
      const user = (await getUserByEmail(email).catch(() => undefined)) ?? (await getUserByOpenId(`supabase:${email}`).catch(() => undefined));
      res.json({ registered: Boolean(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/identity-status failed:", error);
      res.status(500).json({ registered: false, error: "identity-status-unavailable" });
    }
  });

  app.post("/api/auth/supabase-otp", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { supabaseAccessToken?: unknown; name?: unknown; mode?: unknown; provider?: unknown };
    const accessToken = typeof body.supabaseAccessToken === "string" ? body.supabaseAccessToken.trim() : "";
    const mode = body.mode === "signup" ? "signup" : "signin";
    const provider = typeof body.provider === "string" && body.provider ? body.provider : "email";
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "";

    if (!supabaseUrl || !supabaseAnonKey) {
      res.status(503).json({ error: "Supabase auth is not configured on the server" });
      return;
    }
    if (!accessToken) {
      res.status(400).json({ error: "supabaseAccessToken is required" });
      return;
    }

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (error || !data.user) {
        console.error("[SupabaseOTP] Session verification failed", error?.message ?? "no user");
        res.status(401).json({ error: "The verification session is invalid or expired. Request a new code and try again." });
        return;
      }

      const email = (data.user.email ?? "").trim().toLowerCase();
      if (!email) {
        res.status(400).json({ error: "The verified Supabase identity has no email" });
        return;
      }
      const lastSignedIn = new Date();
      const metadataName = typeof data.user.user_metadata?.name === "string" ? data.user.user_metadata.name : "";
      const displayName = name || metadataName || email;

      // 1) Super Admin always resolves to the single canonical owner openId.
      let resolvedOpenId: string;
      let existing = await getUserByOpenId(ENV.ownerOpenId);

      if (isSuperAdminEmail(email) || existing?.email?.toLowerCase() === email) {
        resolvedOpenId = ENV.ownerOpenId;
        // Keep the canonical email attached to the owner profile if it drifted.
        if (existing && existing.email?.toLowerCase() !== email) {
          await upsertUser({ openId: ENV.ownerOpenId, name: existing.name ?? displayName, email, loginMethod: "supabase", lastSignedIn });
          existing = await getUserByOpenId(ENV.ownerOpenId);
        }
      } else {
        // 2) A registered identity reuses its existing row (no duplicate accounts).
        existing = (await getUserByEmail(email)) ?? (await getUserByOpenId(`supabase:${email}`));
        resolvedOpenId = existing?.openId ?? "";

        // 3) First-time / unregistered identities.
        if (!resolvedOpenId) {
          if (mode !== "signup") {
            res.status(403).json({ error: "هذا الحساب غير مسجل، يرجى إنشاء حساب جديد." });
            return;
          }
          // Genuine new account: create after successful Email OTP activation.
          // It is intentionally created with ZERO workspaces so the routing
          // guard forces it through the /onboarding gateway (role choice:
          // create first workspace as owner, activate an invite code, or demo).
          // A purged account re-registering with the same email follows the
          // same brand-new path and lands on onboarding too.
          resolvedOpenId = `supabase:${email}`;
          await upsertUser({ openId: resolvedOpenId, name: displayName || null, email, loginMethod: "supabase", lastSignedIn });
          existing = await getUserByOpenId(resolvedOpenId);
        } else {
          // Existing user logging in again: keep lastSignedIn fresh, never re-provision.
          await upsertUser({ openId: resolvedOpenId, name: (existing?.name ?? displayName) || null, email, loginMethod: "supabase", lastSignedIn });
          existing = await getUserByOpenId(resolvedOpenId);
        }
      }

      const sessionToken = await sdk.createSessionToken(resolvedOpenId, { name: (existing?.name ?? displayName) || "", expiresInMs: SESSION_TTL_MS });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });

      const pendingDeletion = await (await import("../db")).getPendingDeletionByEmail(email).catch(() => null);

      res.json({
        app_session_id: sessionToken,
        user: buildUserResponse(existing ?? { openId: resolvedOpenId, name: displayName, email, loginMethod: "supabase", lastSignedIn }),
        pendingDeletion: pendingDeletion ? { scheduledFor: pendingDeletion.scheduledFor.toISOString(), requestedAt: pendingDeletion.requestedAt.toISOString() } : null,
      });
    } catch (error) {
      console.error("[SupabaseOTP] Bridge exchange failed", error);
      res.status(500).json({ error: "Could not establish a session for the verified identity" });
    }
  });

  // Direct Super Admin login bypass. Accepts either the master email or the
  // canonical Jordanian phone with the master password `Ajlouni911`, resolves to
  // the single owner `openId`, and issues the owner session with
  // `role: "super_admin"`. Does not require a (possibly unseeded) Supabase Auth
  // record; if a service-role key is configured it also seeds/confirms the user.
  app.post("/api/auth/super-admin-login", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { identifier?: unknown; password?: unknown };
    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    const isEmail = isSuperAdminEmail(identifier);
    const isPhone = isSuperAdminPhone(identifier);
    if (password !== SUPER_ADMIN_MASTER_PASSWORD || (!isEmail && !isPhone)) {
      res.status(403).json({ error: "كلمة المرور غير صحيحة، يرجى التأكد وإعادة المحاولة." });
      return;
    }

    try {
      await seedSupabaseSuperAdmin(SUPER_ADMIN_EMAIL);
      const { sessionToken, saved } = await establishSuperAdminSession();
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });
      const typed = saved as unknown as { phone?: string | null };
      res.json({
        app_session_id: sessionToken,
        user: { ...buildUserResponse(saved), phone: typed.phone ?? null },
      });
    } catch (error) {
      console.error("[SuperAdmin] Login failed:", error);
      res.status(500).json({ error: "Could not establish the Super Admin session" });
    }
  });
}
