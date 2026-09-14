import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isSuperAdminEmail, isSuperAdminPhone, matchesSuperAdminIdentity } from "../server/_core/identity";

const identity = readFileSync(resolve(process.cwd(), "server/_core/identity.ts"), "utf8");
const trpc = readFileSync(resolve(process.cwd(), "server/_core/trpc.ts"), "utf8");
const oauth = readFileSync(resolve(process.cwd(), "server/_core/oauth.ts"), "utf8");
const envSource = readFileSync(resolve(process.cwd(), "server/_core/env.ts"), "utf8");
const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");

// Regression guard for the retired hardcoded master password. The literal is
// split so the raw secret value never appears (grep-able) anywhere in the repo.
const RETIRED_MASTER_PASSWORD = "Ajlouni" + "911";

const OWNER_OPEN_ID = "stay-in-preview-owner-v1";

describe("owner master identity (super admin)", () => {
  it("declares the owner email and all phone aliases in one source of truth", () => {
    expect(identity).toContain('SUPER_ADMIN_EMAIL = "moh.ajlouni.90@gmail.com"');
    expect(identity).toContain('"797402940"');
    expect(identity).toContain('"962797402940"');
  });

  it("recognizes every phone alias of the super admin", () => {
    expect(isSuperAdminPhone("0797402940")).toBe(true);
    expect(isSuperAdminPhone("797402940")).toBe(true);
    expect(isSuperAdminPhone("+962797402940")).toBe(true);
    expect(isSuperAdminPhone("962797402940")).toBe(true);
    expect(isSuperAdminPhone("00962797402940")).toBe(true);
    expect(isSuperAdminPhone("0790000001")).toBe(false);
    expect(isSuperAdminPhone(null)).toBe(false);
  });

  it("matches by email (case-insensitive) and by the reserved owner openId", () => {
    expect(isSuperAdminEmail("MOH.AJLOUNI.90@GMAIL.COM")).toBe(true);
    expect(matchesSuperAdminIdentity({ email: "moh.ajlouni.90@gmail.com" }, "anything")).toBe(true);
    expect(matchesSuperAdminIdentity({ openId: OWNER_OPEN_ID }, OWNER_OPEN_ID)).toBe(true);
    expect(matchesSuperAdminIdentity({ phone: "+962797402940" }, "anything")).toBe(true);
    expect(matchesSuperAdminIdentity({ openId: "someone-else" }, OWNER_OPEN_ID)).toBe(false);
  });

  it("gates the adminProcedure on explicit master identity, not only the stored role", () => {
    expect(trpc).toContain("matchesSuperAdminIdentity(ctx.user, ENV.ownerOpenId)");
  });

  it("distinguishes an expired/missing session (UNAUTHORIZED) from a logged-in non-admin (FORBIDDEN)", () => {
    const nullSessionIndex = trpc.indexOf("if (!ctx.user) {");
    const identityIndex = trpc.indexOf("matchesSuperAdminIdentity(ctx.user, ENV.ownerOpenId)");
    expect(nullSessionIndex).toBeGreaterThanOrEqual(0);
    expect(identityIndex).toBeGreaterThan(nullSessionIndex);
    expect(trpc).toContain('code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG');
    expect(trpc).toContain('code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG');
  });

  it("grants the super-admin role at user sync when identity matches and persists the phone", () => {
    expect(dbSource).toContain('const textFields = ["name", "email", "phone", "loginMethod"] as const;');
    expect(dbSource).toContain("matchesSuperAdminIdentity({ openId: user.openId, phone: user.phone, email: user.email }, ENV.ownerOpenId)");
  });

  it("routes the super admin local login to the owner openId with the official email", () => {
    expect(oauth).toContain("isSuperAdminPhone(digits)");
    expect(oauth).toContain("ENV.ownerOpenId");
    expect(oauth).toContain("SUPER_ADMIN_EMAIL");
  });

  it("provides a direct Super Admin login bypass guarded by the env-configured master password", () => {
    expect(oauth).toContain('"/api/auth/super-admin-login"');
    expect(oauth).toContain("ENV.superAdminMasterPassword");
    expect(oauth).toContain("isSuperAdminEmail(identifier)");
    expect(oauth).toContain("isSuperAdminPhone(identifier)");
    expect(oauth).toContain("role: \"super_admin\"");
    expect(oauth).toContain("establishSuperAdminSession()");
    // The master secret must never appear as a literal in server code.
    expect(oauth).not.toContain(RETIRED_MASTER_PASSWORD);
  });

  it("resolves the super-admin master password and PIN strictly from the environment", () => {
    expect(envSource).toContain("superAdminMasterPassword: requireMasterSecret(process.env.SUPER_ADMIN_MASTER_PASSWORD");
    expect(envSource).toContain("superAdminMasterPin: requireMasterSecret(process.env.SUPER_ADMIN_MASTER_PIN");
    expect(envSource).not.toContain("Ajlouni" + "911");
    // Regression guard: the retired hardcoded master PIN must never return.
    expect(envSource).not.toContain("246" + "810");
  });

  it("gates the emergency owner gate with the env-configured master PIN instead of a hardcoded literal", () => {
    const routersSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(routersSource).toContain("ENV.superAdminMasterPin");
    expect(routersSource).not.toContain("246" + "810");
  });

  it("auto-seeds a confirmed Supabase user when a service-role key is configured", () => {
    expect(oauth).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(oauth).toContain("seedSupabaseSuperAdmin(SUPER_ADMIN_EMAIL)");
    expect(oauth).toContain("email_confirm: true");
  });

  it("re-orders the super admin login: identity-only destination, zero workspace/tenant queries", () => {
    expect(dbSource).toContain("getLoginDestination");
    expect(dbSource).toContain("matchesSuperAdminIdentity({ openId: user.openId ?? null, email: user.email ?? null, phone: user.phone ?? null }, ENV.ownerOpenId)");
    expect(dbSource).toContain("const routing = await getWorkspaceRouting(user);");
    expect(dbSource).toContain("await getAccountDeletionRequest(user.id).catch(() => null)");
    expect(oauth).toContain("const destination = await getLoginDestination(saved);");
    expect(oauth).toContain("destination,");
    expect(oauth).not.toContain("linkOwnerWorkspace");
  });
});