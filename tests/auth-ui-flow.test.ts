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
    expect(auth).toContain("الحساب غير مسجل، يرجى إنشاء حساب جديد من تبويب إنشاء حساب");
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
    expect(auth).toContain("أوافق على الشروط والأحكام وسياسة الخصوصية");
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
    expect(engine).toContain("verifyOtp");
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
});
