import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("auth UI test flow", () => {
  it("uses one smart identifier (email auto-detect) and strictly rejects non-Super-Admin phone login without opening a legacy portal", () => {
    const auth = source("components/unified-auth-screen.tsx");
    expect(auth).toContain("validateIdentifier");
    expect(auth).toContain(`"البريد الإلكتروني أو رقم الهاتف"`);
    expect(auth).toContain("signInWithPasswordFlow");
    expect(auth).toContain("هذا الحساب غير مسجل، يرجى إنشاء حساب جديد.");
    expect(auth).not.toContain("startOAuthLogin(");
    expect(auth).toContain('pathname: "/auth/forgot-password"');
    expect(auth).toContain("LinearGradient");
    expect(auth).toContain("أهلاً بك مجدداً");
    expect(auth).toContain("biometricLogin");
    expect(auth).toContain("أنشئ حساباً جديداً");
    expect(auth).toContain('edges={["top", "bottom", "left", "right"]}');
    expect(auth).toContain("validateName");
    expect(auth).toContain("FieldValidation");
    expect(auth).toContain("أدخل الاسم الكامل للمتابعة.");
    expect(auth).toContain("أدخل البريد الإلكتروني أو رقم الهاتف للمتابعة.");
    expect(auth).toContain("check-circle-outline");
    expect(auth).toContain('accessibilityRole="link"');
    expect(auth).not.toContain("🇯🇴");
    expect(auth).not.toContain("phoneShell");
    expect(auth).not.toContain("phoneInput");
    expect(auth).not.toContain("الدخول برمز عبر البريد الإلكتروني");
    expect(auth).not.toContain("مخصّصان لفحص الواجهة فقط");
  });

  it("keeps the dark visual hierarchy and a single-fixed registration inside the same Arabic tabbed screen", () => {
    const auth = source("components/unified-auth-screen.tsx");
    const login = source("app/auth/login.tsx");
    const root = source("app/_layout.tsx");
    expect(auth).toContain("useColors()");
    expect(auth).toContain("makeStyles(colors, isRTL)");
    expect(auth).toContain('containerClassName="bg-transparent"');
    expect(auth).toContain('accessibilityRole="tab"');
    expect(auth).toContain("changeTab");
    expect(auth).toContain("Animated.timing(formOpacity");
    expect(auth).toContain("الاسم الكامل");
    expect(auth).toContain("registerEmail");
    expect(auth).toContain("registerPhone");
    expect(auth).toContain("البريد الإلكتروني");
    expect(auth).toContain("رقم الهاتف");
    expect(auth).toContain("أوافق على");
    expect(auth).toContain("شروط وأحكام الاستخدام");
    expect(auth).toContain("باستخدامك لتطبيق StayIn، فإنك تقر بقراءة الشروط وفهمها والالتزام بها.");
    expect(auth).toContain("TermsModal");
    expect(auth).toContain("PrivacyModal");
    expect(auth).toContain("LanguageSwitcher");
    expect(auth).toContain('accessibilityRole="checkbox"');
    expect(auth).toContain("savePendingRegistration");
    expect(auth).toContain("LEGAL_VERSIONS");
    expect(auth).toContain("إنشاء حساب ومتابعة");
    expect(auth).toContain("لديك حساب بالفعل؟");
    expect(login).toContain("UnifiedAuthScreen");
    expect(root).toContain("headerShown: false");
    expect(auth).not.toContain("<Stack.Screen");
  });

  it("keeps a standalone Arabic registration route with a clear back action", () => {
    const register = source("app/auth/register.tsx");
    const auth = source("components/unified-auth-screen.tsx");
    expect(register).toContain('initialTab="register"');
    expect(register).toContain("standaloneRegister");
    expect(auth).toContain('router.replace("/auth/login")');
    expect(auth).toContain("arrow-forward");
  });

  it("provides a password or Email-OTP recovery flow that re-authenticates without a password", () => {
    const forgot = source("app/auth/forgot-password.tsx");
    const otp = source("app/auth/otp.tsx");
    const emailEntry = source("app/auth/email-otp.tsx");
    const engine = source("lib/supabase-otp.tsx");
    const screen = source("components/unified-auth-screen.tsx");
    expect(forgot).toContain("requestPasswordlessEmail");
    expect(forgot).toContain('pathname: "/auth/otp"');
    expect(forgot).toContain("استرجاع الوصول");
    expect(forgot).not.toContain("startOAuthLogin");
    expect(engine).toContain("signInWithOtp");
    expect(engine).toContain("shouldCreateUser: true");
    expect(engine).toContain("fullName");
    expect(engine).toContain("role: \"owner\"");
    expect(engine).toContain("verifyOtp");
    expect(engine).toContain("signInWithOtp");
    expect(engine).toContain("exchangeSupabaseOtp");
    expect(engine).toContain("signInWithPasswordFlow");
    expect(engine).toContain("socialSignIn");
    expect(screen).toContain("requestEmailSignupOtp");
    expect(otp).toContain("useOtpCountdown(300)");
    expect(otp).toContain("إعادة إرسال الرمز");
    expect(otp).toContain("verifyEmailOtp");
    expect(otp).toContain("activateEmailSignup");
    expect(emailEntry).toContain("requestPasswordlessEmail");
    expect(otp).not.toContain("startOAuthLogin");
  });

  it("aligns the OTP screen to a 6-digit standard that accepts longer tokens without truncation, with auto-submit and the verify config", () => {
    const otp = source("app/auth/otp.tsx");
    const engine = source("lib/supabase-otp.tsx");
    expect(otp).toContain("const OTP_LENGTH = 6");
    expect(otp).toContain("const MAX_OTP_LENGTH");
    expect(otp).toContain('Array(OTP_LENGTH).fill("")');
    expect(otp).toContain('replace(/[^\\d]/g, "").slice(0, MAX_OTP_LENGTH)');
    expect(otp).toContain("cleanToken.length < OTP_LENGTH");
    expect(otp).toContain("token length=");
    expect(otp).toContain("المكوّن من 6 أرقام");
    expect(otp).toContain("Auto-submit once the user types or pastes at least 6 digits");
    expect(engine).toContain("supabase.auth.verifyOtp({ email, token, type: \"email\" })");
    expect(engine).toContain('type: "email"');
  });

  it("routes Super Admin email/phone + master password to the direct login bypass", () => {
    const screen = source("components/unified-auth-screen.tsx");
    const engine = source("lib/supabase-otp.tsx");
    expect(screen).toContain("signInSuperAdmin");
    expect(screen).toContain("isSuperAdminCredential");
    expect(screen).toContain("runSuperAdminLogin");
    expect(engine).toContain("signInSuperAdmin");
    expect(engine).toContain("exchangeSuperAdminLogin");
  });

  it("surfaces a friendly message when an OAuth provider is not enabled", () => {
    const engine = source("lib/supabase-otp-engine.ts");
    expect(engine).toContain("provider-unavailable");
    expect(engine).toContain("تسجيل الدخول عبر هذا المزود غير مفعّل حالياً في إعدادات الخادم");
    expect(engine).toContain("Unsupported provider");
  });

  it("never reports an unverified account as either unregistered or wrong-password; the backend decides existence", () => {
    const screen = source("components/unified-auth-screen.tsx");
    const engine = source("lib/supabase-otp.tsx");
    const classification = source("lib/supabase-otp-engine.ts");
    expect(screen).toContain('result.error === "email-not-confirmed"');
    expect(screen).toContain("resendSignupCode(email)");
    expect(screen).toContain('{ email, mode: "signup" }');
    expect(engine).toContain('if (code === "email-not-confirmed") return "email-not-confirmed"');
    expect(engine).toContain("checkIdentityStatus(email)");
    expect(engine).toContain("identity.checked");
    expect(engine).toContain('if (existence === "absent") return "unregistered"');
    expect(engine).toContain('if (existence === "exists") return "wrong-password"');
    expect(classification).toContain("email not confirmed");
    expect(classification).toContain("email-not-confirmed");
  });

  it("binds the password chosen at sign-up to the verified Supabase account instead of leaving it passwordless", () => {
    const engine = source("lib/supabase-otp.tsx");
    expect(engine).toContain("pendingSignupPasswordByEmail");
    expect(engine).toContain("pendingSignupPasswordByEmail.set(email, input.password)");
    expect(engine).toContain("pendingSignupPasswordByEmail.get(email)");
    expect(engine).toContain("updateUser({ password: pendingPassword })");
    expect(engine).toContain("pendingSignupPasswordByEmail.delete(email)");
  });

  it("shows the single honest wrong-password message backed by the backend identity check, with the recovery link nearby", () => {
    const screen = source("components/unified-auth-screen.tsx");
    const engine = source("lib/supabase-otp.tsx");
    const classification = source("lib/supabase-otp-engine.ts");
    expect(screen).toContain('result.error === "wrong-password"');
    expect(screen).toContain('AUTH_ERROR_MESSAGES["wrong-password"]');
    expect(screen).toContain("«نسيت كلمة المرور؟»");
    expect(engine).toContain("checkIdentityStatus(email)");
    expect(engine).toContain('identity.registered ? "wrong-password" : "unregistered"');
    expect(classification).toContain("invalid login credentials");
  });

  it("pins the persisted deletion notice on login with a recovery action and a dismiss", () => {
    const screen = source("components/unified-auth-screen.tsx");
    const storage = source("lib/_core/auth.ts");
    expect(screen).toContain("Auth.peekPostLogoutNotice()");
    expect(screen).toContain("Auth.consumePostLogoutNotice()");
    expect(screen).toContain("طلب حذف الحساب فعّال");
    expect(screen).toContain("استرجاع الحساب");
    expect(screen).toContain('pathname: "/account-recovery"');
    expect(storage).toContain("peekPostLogoutNotice");
    expect(storage).toContain("scheduledFor");
  });

  it("separates the two login messages on the backend too: an identity-status endpoint with the exact Arabic texts", () => {
    const oauth = source("server/_core/oauth.ts");
    const api = source("lib/_core/api.ts");
    expect(oauth).toContain('"/api/auth/identity-status"');
    expect(oauth).toContain("هذا الحساب غير مسجل، يرجى إنشاء حساب جديد.");
    expect(oauth).toContain("كلمة المرور غير صحيحة، يرجى التأكد وإعادة المحاولة.");
    expect(oauth).toContain("isSuperAdminEmail(email)");
    expect(api).toContain("checkIdentityStatus");
  });

  it("detects a pending-deletion account at password login and routes to OTP recovery with remaining days instead of a wrong-password dead-end", () => {
    const engine = source("lib/supabase-otp.tsx");
    const screen = source("components/unified-auth-screen.tsx");
    expect(engine).toContain("checkPendingDeletion(email)");
    expect(engine).toContain('error: "deletion-pending"');
    expect(engine).toContain("pendingDeletion: { scheduledFor");
    expect(screen).toContain('result.error === "deletion-pending" && result.pendingDeletion');
    expect(screen).toContain("تم تقديم طلب حذف لحسابك وهو فعّال، وسيتم حذف الحساب نهائيًا");
    expect(screen).toContain("استرجاع الحساب");
    expect(screen).toContain('pathname: "/account-recovery"');
  });
});
