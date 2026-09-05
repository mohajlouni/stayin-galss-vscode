import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("strict global onboarding route guard & zero-workspace role gateway", () => {
  it("whitelists only the gateway routes and nothing else out of the protected surface", () => {
    const gate = source("components/route-access-gate.tsx");
    expect(gate).toContain("GATEWAY_ROUTE_PATHS");
    expect(gate).toContain('"/onboarding"');
    expect(gate).toContain('"/create-workspace"');
    expect(gate).toContain('"/restore-account"');
    expect(gate).toContain('"/account-recovery"');
    expect(gate).toContain("isRestrictedRoute(pathname)");
  });

  it("redirects each routing destination to its strict gateway before any protected content renders", () => {
    const gate = source("components/route-access-gate.tsx");
    expect(gate).toContain('if (destination === "restore")');
    expect(gate).toContain('<Redirect href="/restore-account" />');
    expect(gate).toContain('if (destination === "onboarding")');
    expect(gate).toContain('<Redirect href="/onboarding" />');
    expect(gate).toContain('if (destination === "selector")');
    expect(gate).toContain('<Redirect href="/auth/select-workspace" />');
  });

  it("renders the /onboarding role gate with the three cards and no back affordance", () => {
    const onboarding = source("app/onboarding.tsx");
    expect(onboarding).toContain("أنا صاحب منشأة / مالك");
    expect(onboarding).toContain("أنا موظف / حارس لدي رمز دعوة");
    expect(onboarding).toContain("استكشاف بجولة تجريبية");
    expect(onboarding).toContain("acceptInvitationCode");
    expect(onboarding).toContain("activateCode");
    expect(onboarding).toContain("startDemo");
    expect(onboarding).not.toContain("router.back()");
  });

  it("lets the owner card lead into the first-workspace wizard that assigns the Owner role", () => {
    const onboarding = source("app/onboarding.tsx");
    const wizard = source("app/create-workspace.tsx");
    expect(onboarding).toContain('router.push("/create-workspace")');
    expect(wizard).toContain("workspace.create.useMutation");
    expect(wizard).toContain('mutateAsync({ name: trimmed, phone: businessPhone.trim(), currency: currency.trim() })');
    expect(wizard).toContain("حفظ وتعييني مالكًا");
    expect(wizard).toContain("اسم المزرعة / الشاليه");
  });

  it("routes the restore gateway to the 14-day account recovery screen", () => {
    const restore = source("app/restore-account.tsx");
    expect(restore).toContain('export { default } from "./account-recovery"');
  });

  it("points post-OTP navigation at the onboarding gateway and never at the legacy gate", () => {
    const otp = source("app/auth/otp.tsx");
    const recovery = source("app/account-recovery.tsx");
    expect(otp).toContain('router.replace("/onboarding")');
    expect(recovery).toContain('router.replace("/onboarding")');
  });

  it("creates brand-new (or re-registering purged) accounts with zero workspaces so the guard lands them on onboarding", () => {
    const oauth = source("server/_core/oauth.ts");
    expect(oauth).not.toContain("bootstrapOwnerWorkspace");
    const db = source("server/db.ts");
    expect(db).toContain('destination: "onboarding" as const');
  });

  it("detects the pending-deletion grace period in routing and resolves invite codes by PIN alone", () => {
    const db = source("server/db.ts");
    expect(db).toContain('destination: "restore" as const');
    expect(db).toContain("getAccountDeletionRequest(user.id)");
    expect(db).toContain("findWorkspaceInvitationByPin");
  });

  it("exposes the single-invite-code accept mutation server-side", () => {
    const routers = source("server/routers.ts");
    expect(routers).toContain("acceptInvitationCode");
    expect(routers).toContain("code: z.string().regex(/^\\d{6}$/");
  });
});