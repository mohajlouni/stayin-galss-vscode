import { COOKIE_NAME, SESSION_TTL_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { ensureLocalDevAccess, getDb, getUserByOpenId, upsertUser } from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { isSuperAdminPhone, SUPER_ADMIN_EMAIL } from "./identity";
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
    | {
        openId: string;
        name?: string | null;
        email?: string | null;
        loginMethod?: string | null;
        lastSignedIn?: Date | null;
      },
) {
  return {
    id: (user as any)?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
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
      res.json({ user: buildUserResponse(user) });
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
