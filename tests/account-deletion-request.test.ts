import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("account deletion request", () => {
  it("uses a protected, reversible request flow rather than direct account deletion", () => {
    const router = source("server/routers.ts");
    const database = source("server/db.ts");
    expect(router).toContain("accountDeletion: router");
    expect(router).toContain('confirmation: z.literal("DELETE")');
    expect(router).toContain("cancel: protectedProcedure");
    expect(database).toContain("requestAccountDeletion");
    expect(database).toContain("14 * 24 * 60 * 60 * 1000");
    expect(database).toContain('status: "cancelled"');
  });

  it("requires typed confirmation and offers cancellation from the dedicated screen", () => {
    const screen = source("app/account-deletion.tsx");
    const security = source("app/account-security.tsx");
    expect(screen).toContain('confirmationValid');
    expect(screen).toContain('v === "DELETE"');
    expect(screen).toContain('"حذف"');
    expect(screen).toContain('confirmation: "DELETE"');
    expect(screen).toContain("إلغاء طلب الحذف والاحتفاظ بالحساب");
    expect(screen).toContain("لا يُحذف شيء فورًا");
    expect(security).toContain('router.push("/account-deletion")');
  });

  it("keeps the delete action responsive and tolerant of invisible characters or stray spaces", () => {
    const screen = source("app/account-deletion.tsx");
    expect(screen).toContain("normalizeConfirmation");
    expect(screen).toContain('replace(/[\\u200B\\u200C\\u200D\\uFEFF\\s]/g, "")');
    expect(screen).toContain('disabled={request.isPending}');
    expect(screen).toContain('nv === "حذف"');
    expect(screen).toContain("تأكيد مطلوب");
  });

  it("executes the request directly on press, signs out immediately (no alert tap), and surfaces a clear error on failure", () => {
    const screen = source("app/account-deletion.tsx");
    expect(screen).toContain("runDeleteRequest");
    expect(screen).toContain("request.mutateAsync");
    expect(screen).toContain("onPress={submit}");
    expect(screen).toContain("جاري تقديم الطلب");
    expect(screen).toContain("تم تقديم طلب حذف الحساب. تم تسجيل خروجك وتعطيل الحساب، ولديك مهلة 14 يومًا لاسترجاعه قبل الحذف النهائي.");
    expect(screen).toContain("Auth.setPostLogoutNotice");
    expect(screen).toContain("Auth.removeSessionToken()");
    expect(screen).toContain("Auth.clearUserInfo()");
    expect(screen).toContain("void logout();");
    expect(screen).toContain('router.replace("/auth/login")');
    expect(screen).toContain("setSubmitError");
    expect(screen).toContain("تعذر تسجيل طلب حذف الحساب");
    // The logout must NOT be deferred behind an alert confirmation tap.
    expect(screen).not.toContain('onPress: () => { void logout();');
  });

  it("immediately signs out, redirects to login with notice, and offers a 14-day recovery via OTP", () => {
    const screen = source("app/account-deletion.tsx");
    const recovery = source("app/account-recovery.tsx");
    const routers = source("server/routers.ts");
    const db = source("server/db.ts");
    const gate = source("components/route-access-gate.tsx");
    expect(screen).toContain("14 يومًا");
    expect(screen).toContain("استرجاعه عبر البريد أو البصمة قبل انتهائها");
    expect(recovery).toContain("إرسال رمز OTP لاستعادة الحساب");
    expect(recovery).toContain("هذا الحساب معطّل وقيد الحذف النهائي");
    expect(recovery).toContain("تم إلغاء طلب الحذف واستعادة حسابك بنجاح");
    expect(routers).toContain("requestRecoveryOtp");
    expect(routers).toContain("verifyRecoveryOtp");
    expect(routers).toContain("recoverDeletedAccountByEmail");
    expect(db).toContain("getPendingDeletionByEmail");
    expect(gate).toContain("/account-recovery");
  });

  it("asks the returning user directly whether to cancel deletion, with actionable choices instead of a passive pending screen", () => {
    const recovery = source("app/account-recovery.tsx");
    expect(recovery).toContain('"decision" | "recovery" | "otp"');
    expect(recovery).toContain("هل تريد إلغاء طلب الحذف والحفاظ على حسابك وبياناتك؟");
    expect(recovery).toContain("نعم، إلغاء الحذف والحفاظ على حسابي");
    expect(recovery).toContain("لا، متابعة الحذف");
    expect(recovery).toContain('setStep("recovery")');
    expect(recovery).toContain("سيُحذف حسابك نهائيًا بعد انتهاء المهلة");
  });

  it("cancels the deletion request immediately on press with inline feedback instead of a dead-end", () => {
    const screen = source("app/account-deletion.tsx");
    expect(screen).toContain("cancelRequest");
    expect(screen).toContain("cancel.mutate(undefined");
    expect(screen).toContain("تم إلغاء طلب حذف الحساب والاحتفاظ بحسابك وبياناتك بنجاح");
    expect(screen).toContain("تعذر إلغاء طلب الحذف. تحقق من اتصالك بالإنترنت ثم أعد المحاولة");
    expect(screen).not.toContain('Alert.alert(language === "ar" ? "إلغاء طلب الحذف"');
  });

  it("exposes a public check for a pending deletion by email so login can detect and offer OTP recovery", () => {
    const oauth = source("server/_core/oauth.ts");
    const api = source("lib/_core/api.ts");
    const engine = source("lib/supabase-otp.tsx");
    expect(oauth).toContain('app.post("/api/auth/check-pending-deletion"');
    expect(oauth).toContain("getPendingDeletionByEmail(email)");
    expect(api).toContain("checkPendingDeletion");
    expect(api).toContain("/api/auth/check-pending-deletion");
    expect(engine).toContain('error: "deletion-pending"');
  });
});
