import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("user doctor reconciles against Supabase Auth state", () => {
  describe("STEP 1: account verification sync", () => {
    it("looks up the live Supabase Auth identity via the service-role Admin API, anchored on email_confirmed_at", () => {
      const db = source("server/db.ts");
      expect(db).toContain("getSupabaseEmailConfirmation");
      expect(db).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(db).toContain("admin.auth.admin.listUsers");
      expect(db).toContain("email_confirmed_at");
      expect(db).toContain("u.email?.toLowerCase() === needle");
      expect(db).toContain(`{ status: "confirmed", emailConfirmedAt: match.email_confirmed_at }`);
      expect(db).toContain(`{ status: "unconfigured", emailConfirmedAt: null }`);
    });

    it("detects provider-managed accounts (supabase / super-admin) instead of flagging them unverified", () => {
      const db = source("server/db.ts");
      expect(db).toContain('userRow.loginMethod === "supabase" || userRow.loginMethod === "super-admin" || (userRow.openId ?? "").startsWith("supabase:")');
      expect(db).toContain("supabaseState = await getSupabaseEmailConfirmation(userRow.email);");
    });

    it("marks verified whenever Supabase confirms the email, and only falls back to local evidence when no auth verdict exists", () => {
      const db = source("server/db.ts");
      expect(db).toContain("const supabaseConfirmed = supabaseState.status === \"confirmed\";");
      expect(db).toContain("const verified = isSuperAdmin || supabaseConfirmed || (!authCheckAvailable && localVerified);");
      expect(db).not.toContain("verified: isSuperAdmin || Boolean(userRow.email && userRow.legalAcceptedAt)");
    });

    it("exposes the reconciled evidence back to the report (authProvider / supabaseLookup / emailConfirmedAt)", () => {
      const db = source("server/db.ts");
      expect(db).toContain('authProvider: isProviderManaged ? "supabase" : "local"');
      expect(db).toContain("supabaseLookup: supabaseState.status");
      expect(db).toContain("emailConfirmedAt: supabaseConfirmed ? supabaseState.emailConfirmedAt : null");
    });
  });

  describe("STEP 2: neutralizing the OTP alarm for provider-managed accounts", () => {
    it("renders an informative (non-alarming) OTP badge when the identity is managed by Supabase Auth", () => {
      const screen = source("app/admin/user-diagnostics.tsx");
      expect(screen).toContain('report.account.authProvider === "supabase"');
      expect(screen).toContain("المصادقة مدارة عبر مزود الهوية المعتمد (Supabase Auth)");
      expect(screen).toContain('tone="info"');
      expect(screen).toContain('icon="shield" label="رمز التحقق (OTP)"');
    });

    it("keeps the legacy local-OTP alarm path only for non-provider-managed accounts", () => {
      const screen = source("app/admin/user-diagnostics.tsx");
      expect(screen).toContain("icon=\"sms\" label=\"رمز التحقق (OTP)\"");
      expect(screen).toContain("otpLabel(report.otp)");
    });

    it("styles the neutral badge with the info tone, not the error tone", () => {
      const screen = source("app/admin/user-diagnostics.tsx");
      expect(screen).toContain('const actionTone = tone === "info" ? "sky" : ok ? "success" : "error";');
      expect(screen).toContain('const finalIcon = tone === "info" ? "shield" : ok ? "check-circle" : "error";');
      expect(screen).toContain('const valueColor = tone === "info" ? colors.sky : ok ? colors.success : colors.error;');
    });
  });

  describe("STEP 3: accurate session detection", () => {
    it("counts live sessions by active JWT refresh tokens (unrevoked and unexpired), not a persistent socket", () => {
      const db = source("server/db.ts");
      expect(db).toContain("eq(sessions.openId, openId)");
      expect(db).toContain("isNull(sessions.revokedAt)");
      expect(db).toContain("gt(sessions.expiresAt, new Date())");
      expect(db).toContain("countUserLiveSessions");
    });

    it("reconciles a recent sign-in heartbeat within the session TTL as an active session", () => {
      const db = source("server/db.ts");
      expect(db).toContain("const recentSignInActive = Boolean(userRow.lastSignedIn && Date.now() - userRow.lastSignedIn.getTime() < SESSION_TTL_MS);");
      expect(db).toContain("const liveSessionCount = sessionCount > 0 ? sessionCount : recentSignInActive ? 1 : 0;");
      expect(db).toContain("liveRefreshTokens: sessionCount");
      expect(db).toContain("recentSignInActive");
    });

    it("surfaces both signals transparently on the report card ('N جلسة حية')", () => {
      const screen = source("app/admin/user-diagnostics.tsx");
      expect(screen).toContain("label=\"الجلسات والأجهزة النشطة\"");
      expect(screen).toContain("report.sessions.count");
      expect(screen).toContain("رموز تنشيط حية:");
      expect(screen).toContain("report.sessions.liveRefreshTokens");
      expect(screen).toContain("نشاط حديث ضمن صلاحية الجلسة");
    });
  });
});