import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("strict global onboarding route guard & unified workspace role hub", () => {
  it("whitelists only the gateway routes (workspace-hub + restore) and nothing else out of the protected surface", () => {
    const gate = source("components/route-access-gate.tsx");
    expect(gate).toContain("GATEWAY_ROUTE_PATHS");
    expect(gate).toContain('"/workspace-hub"');
    expect(gate).toContain('"/restore-account"');
    expect(gate).toContain('"/account-recovery"');
    expect(gate).not.toContain('router.replace("/onboarding")');
    expect(gate).not.toContain('"/create-workspace"');
    expect(gate).toContain("isRestrictedRoute(pathname)");
  });

  it("keeps home and tenant pages free for the role guard and only bounces restore/onboarding/selector users to the gateways", () => {
    const gate = source("components/route-access-gate.tsx");
    expect(gate).toContain('if (destination === "restore")');
    expect(gate).toContain('if (destination === "onboarding")');
    expect(gate).toContain('if (destination === "selector")');
    expect(gate).toContain('<Redirect href="/workspace-hub" />');
    expect(gate).toContain('pathname: "/restore-account"');
    expect(gate).toContain("routing.data?.deletion?.scheduledFor");
    expect(gate).not.toContain('destination === "admin" &&');
    expect(gate).not.toContain('pathname === "/" || pathname === "/workspace-hub"');
  });

  it("lets the super admin use the unified hub as the workspace switcher while the initial login still lands on the command center", () => {
    const hub = source("app/workspace-hub.tsx");
    const db = source("server/db.ts");
    const authScreen = source("components/unified-auth-screen.tsx");
    expect(hub).toContain('routing.data?.destination === "restore"');
    expect(hub).toContain('routing.data?.destination === "dashboard"');
    expect(hub).toContain('return <Redirect href="/(tabs)" />;');
    expect(hub).not.toContain('routing.data?.destination === "admin"');
    expect(hub).not.toContain('href="/admin/master-control"');
    expect(db).toContain('destination: "admin" as const');
    expect(db).toContain("alwaysPromptWorkspaceSelection");
    expect(db).toContain("setWorkspaceSelectionPreference");
    expect(authScreen).toContain('if (destination === "admin")');
    expect(authScreen).not.toContain('router.replace("/admin/master-control")');
    expect(authScreen).toContain('router.replace("/(tabs)")');
  });

  it("exposes the always-show-picker preference toggle on the hub for workspace members", () => {
    const hub = source("app/workspace-hub.tsx");
    const routers = source("server/routers.ts");
    expect(hub).toContain("إظهار شاشة اختيار المنشآت دائماً عند تسجيل الدخول");
    expect(hub).toContain("لديك حق الوصول لأكثر من منشأة، اختر المنشأة المطلوبة للمتابعة.");
    expect(hub).toContain("setAlwaysPrompt");
    expect(hub).toContain("trpc.workspace.setAlwaysPrompt.useMutation");
    expect(routers).toContain("setAlwaysPrompt: protectedProcedure.input(z.object({ enabled: z.boolean() }))");
  });

  it("renders the unified hub with the owner create button, the invite-code path, and multi-workspace picker — no demo, no back affordance", () => {
    const hub = source("app/workspace-hub.tsx");
    expect(hub).toContain("محور المنشأة والدور");
    expect(hub).toContain("إنشاء منشأة جديدة");
    expect(hub).toContain("أدخل رمز الدعوة");
    expect(hub).toContain("تفعيل والدخول");
    expect(hub).not.toContain("تجربة استعراضية");
    expect(hub).not.toContain("startDemo");
    expect(hub).not.toContain("useDemoMode");
    expect(hub).toContain("acceptInvitationCode");
    expect(hub).toContain("activate");
    expect(hub).toContain("selectWorkspace.mutateAsync");
    expect(hub).not.toContain("router.back()");
  });

  it("creates the first workspace from the built-in modal with name, currency, and phone, assigning the Owner role", () => {
    const hub = source("app/workspace-hub.tsx");
    expect(hub).toContain("trpc.workspace.create.useMutation");
    expect(hub).toContain('createWorkspace.mutateAsync({ name: trimmed, phone: wsPhone.trim(), currency: wsCurrency.trim() })');
    expect(hub).toContain("حفظ وتعييني مالكًا");
    expect(hub).toContain("اسم المنشأة");
    expect(hub).toContain("مثال: قرية أمواج السياحية");
    expect(hub).toContain("CURRENCY_OPTIONS");
  });

  it("guards the onboarding gateway to a single first workspace and rejects duplicate names or double submits", () => {
    const hub = source("app/workspace-hub.tsx");
    expect(hub).toContain("workspaceCount === 0");
    expect(hub).toContain("إنشاء منشأة جديدة");
    expect(hub).not.toContain("إضافة منشأة جديدة");
    expect(hub).not.toContain("Add a new property");
    expect(hub).toContain("المنشآت الإضافية تُضاف من داخل التطبيق");
    expect(hub).toContain("const [isSubmitting, setIsSubmitting] = useState(false);");
    expect(hub).toContain("if (isSubmitting) return;");
    expect(hub).toContain("يوجد لديك منشأة بهذا الاسم بالفعل. اختر اسمًا مختلفًا.");
    expect(hub).toContain("جاري إنشاء المنشأة...");
    expect(hub).toContain("disabled={isSubmitting}");
    expect(hub).toContain("setWelcomeVisible(true)");
    expect(hub).toContain("setIsSubmitting(false)");
  });

  it("greets the brand-new owner with a luxury welcome dialog pointing at the first unit and the calendar", () => {
    const hub = source("app/workspace-hub.tsx");
    expect(hub).toContain("welcomeVisible");
    expect(hub).toContain("مرحباً بك في عالم StayIn! 🌴");
    expect(hub).toContain("تم تأسيس منشأتك بنجاح وأصبحت المالك المعتمد.");
    expect(hub).toContain("خطوتك التالية: ابدأ بإضافة وحداتك الإيجارية");
    expect(hub).toContain("إضافة أول وحدة الآن ➔");
    expect(hub).toContain('router.replace("/chalet-profile?mode=add"');
    expect(hub).toContain("استكشاف لوحة التحكم والتقويم");
    expect(hub).toContain('router.replace("/(tabs)/calendar")');
  });

  it("moves additional property creation into the in-app properties hub, never the gateway", () => {
    const propertiesHub = source("app/properties-hub.tsx");
    expect(propertiesHub).toContain("+ إضافة منشأة جديدة");
    expect(propertiesHub).toContain("trpc.workspace.create.useMutation");
    expect(propertiesHub).toContain("اسم المنشأة");
    expect(propertiesHub).toContain("يوجد لديك منشأة بهذا الاسم بالفعل. اختر اسمًا مختلفًا.");
    expect(propertiesHub).toContain("جاري إنشاء المنشأة...");
    expect(propertiesHub).toContain("if (isSubmitting) return;");
  });

  it("routes the restore gateway to the 14-day account recovery screen", () => {
    const restore = source("app/restore-account.tsx");
    expect(restore).toContain('export { default } from "./account-recovery"');
  });

  it("points post-OTP and account-recovery navigation at the unified hub and never at legacy gates", () => {
    const otp = source("app/auth/otp.tsx");
    const recovery = source("app/account-recovery.tsx");
    expect(otp).toContain('router.replace("/workspace-hub")');
    expect(recovery).toContain('router.replace("/workspace-hub")');
  });

  it("creates brand-new (or re-registering purged) accounts with zero workspaces so the guard lands them on the hub", () => {
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

  it("removes the scattered legacy gates so there is a single entry screen", () => {
    const access = source("components/route-access-gate.tsx");
    const authScreen = source("components/unified-auth-screen.tsx");
    const callback = source("app/oauth/callback.tsx");
    expect(access).not.toContain('router.replace("/onboarding")');
    expect(access).not.toContain('"/create-workspace"');
    expect(access).not.toContain('"/auth/select-workspace"');
    expect(authScreen).toContain('router.replace("/workspace-hub")');
    expect(authScreen).not.toContain('router.replace("/workspace-gate")');
    expect(callback).toContain('router.replace("/workspace-hub")');
  });

  it("keeps in-app navigation free for the super admin while the literal /onboarding trap redirects to the command center", () => {
    const gate = source("components/route-access-gate.tsx");
    const hub = source("app/workspace-hub.tsx");
    const helper = source("lib/super-admin.ts");
    expect(gate).not.toContain('pathname === "/" || pathname === "/workspace-hub"');
    expect(gate).not.toContain('destination === "admin" &&');
    expect(gate).toContain('pathname === "/onboarding" || pathname.startsWith("/onboarding/")');
    expect(gate).toContain("isSuperAdminUser(user)");
    expect(gate).toContain('<Redirect href="/admin/master-control" />');
    expect(gate).toContain("if (destination === \"restore\")");
    expect(hub).not.toContain("isSuperAdminUser(user)");
    expect(hub).not.toContain('<Redirect href="/admin/master-control" />');
    expect(helper).toContain("SUPER_ADMIN_EMAIL");
    expect(helper).toContain("isSuperAdminPhone");
    expect(helper).toContain("SUPER_ADMIN_USER_CODE");
  });

  it("adds the command-center button and workspace prompt so home resolves the dashboard without a bounce", () => {
    const widget = source("components/home-top-widget.tsx");
    const home = source("app/(tabs)/index.tsx");
    expect(widget).toContain("isSuperAdminUser(currentUser)");
    expect(widget).toContain('router.push("/admin/master-control")');
    expect(widget).toContain("مركز الإدارة العليا");
    expect(home).toContain("activeWorkspaceId");
    expect(home).toContain('appRouter.push("/workspace-hub"');
    expect(home).toContain('appRouter.push("/admin/master-control"');
  });

  it("enforces the hard immunity lock for #U1000 across every destructive and role-mutation endpoint (403)", () => {
    const routers = source("server/routers.ts");
    const db = source("server/db.ts");
    const identity = source("server/_core/identity.ts");
    expect(identity).toContain("ROOT_USER_IDENTIFIERS");
    expect(identity).toContain("matchesRootAccountCode");
    expect(routers).toContain("ROOT_IMMUNITY_VIOLATION");
    expect(routers).toContain('code: "FORBIDDEN", message: ROOT_IMMUNITY_VIOLATION');
    expect(routers).toContain("findImmutableRootByContact(input.contact)");
    expect(routers).toContain("isImmutableRootUserId(input.userId)");
    expect(routers).toContain("isImmutableRootActor(ctx.user)");
    expect(db).toContain("isImmutableRootAccount(user[0])");
    expect(db).toContain("!isImmutableRootAccount(row.user)");
  });

  it("hides the permanent-deletion controls for the immune root account in the master and self-deletion UIs", () => {
    const del = source("app/admin/deletion-management.tsx");
    const self = source("app/account-deletion.tsx");
    expect(del).toContain("isSuperAdminUser");
    expect(del).toContain("#U1000");
    expect(del).toContain("محصّن");
    expect(self).toContain("isSuperAdminUser(currentUser)");
    expect(self).toContain("محصّن");
  });

  it("keeps logout out of the master control header and shows the super admin account data instead", () => {
    const master = source("app/admin/master-control.tsx");
    const security = source("app/account-security.tsx");
    expect(master).toContain("useAuthSession");
    expect(master).toContain("currentUser.userCode");
    expect(master).toContain("مدير النظام · Super Admin");
    expect(master).toContain('router.push("/profile")');
    expect(master).not.toContain("تسجيل الخروج");
    expect(security).toContain("تسجيل الخروج من هذا الجهاز");
  });

  it("lands a super admin on the home screen from the login destination — not the command center", () => {
    const authScreen = source("components/unified-auth-screen.tsx");
    const api = source("lib/_core/api.ts");
    const engine = source("lib/supabase-otp.tsx");
    expect(authScreen).toContain('if (destination === "admin")');
    expect(authScreen).not.toContain('router.replace("/admin/master-control")');
    expect(authScreen).toContain('router.replace("/(tabs)")');
    expect(api).toContain('destination?: LoginDestination');
    expect(api).toContain('export type LoginDestination = "admin" | "restore" | "onboarding" | "dashboard" | "selector"');
    expect(engine).toContain('destination?: LoginDestination');
  });
});