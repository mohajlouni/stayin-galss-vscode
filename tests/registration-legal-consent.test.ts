import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_VERSIONS } from "../lib/legal-versions";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("registration and legal consent", () => {
  it("requires one consolidated legal agreement before starting secure account creation", () => {
    const register = source("app/auth/register.tsx");
    const auth = source("components/unified-auth-screen.tsx");
    expect(register).toContain("UnifiedAuthScreen");
    expect(auth).toContain("!accepted");
    expect(auth).toContain("savePendingRegistration");
    expect(auth).toContain("requestEmailSignupOtp");
    expect(auth).not.toContain("startOAuthLogin");
    expect(auth).toContain("TermsModal");
    expect(auth).toContain("PrivacyModal");
    expect(auth).toContain("أوافق على");
    expect(auth).toContain("شروط وأحكام الاستخدام");
    expect(auth).toContain("سياسة الخصوصية");
    expect(auth).toContain("accessibilityRole=\"checkbox\"");
  });

  it("persists the agreed document versions only after a protected session exists", () => {
    const router = source("server/routers.ts");
    const session = source("lib/auth-session.tsx");
    const database = source("server/db.ts");
    expect(router).toContain("completeRegistration: protectedProcedure");
    expect(router).toContain("termsVersion");
    expect(database).toContain("legalAcceptedAt");
    expect(session).toContain("clearPendingRegistration");
    expect(LEGAL_VERSIONS.terms).toBe("2026-08-24");
  });

  it("keeps legal screens public so they are readable before signing in", () => {
    const routeGate = source("components/route-access-gate.tsx");
    expect(routeGate).toContain("PUBLIC_ROUTE_PREFIXES");
    expect(routeGate).toContain('"/legal/"');
    expect(routeGate).toContain("isPublicRoute(pathname)");
    expect(source("app/legal/terms.tsx")).toContain("شروط استخدام StayIn");
    expect(source("app/legal/privacy.tsx")).toContain("سياسة الخصوصية");
    expect(source("app/legal/conditions.tsx")).toContain("الأحكام التشغيلية");
  });
});
