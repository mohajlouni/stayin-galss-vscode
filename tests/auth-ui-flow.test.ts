import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("auth UI test flow", () => {
  it("validates phone or email before opening the external identity portal", () => {
    const auth = source("components/unified-auth-screen.tsx");
    expect(auth).toContain("normalizeInternationalPhone");
    expect(auth).toContain("emailPattern");
    expect(auth).toContain("startOAuthLogin()");
    expect(auth).toContain('pathname: "/auth/forgot-password"');
    expect(auth).toContain("LinearGradient");
    expect(auth).toContain("أهلاً بك مجدداً");
    expect(auth).toContain("setShowSecret");
    expect(auth).toContain("🇯🇴");
    expect(auth).toContain("biometricLogin");
    expect(auth).toContain("أنشئ حساباً جديداً");
    expect(auth).toContain('edges={["top", "bottom", "left", "right"]}');
    expect(auth).toContain("phoneShell");
    expect(auth).toContain("phoneInput");
    expect(auth).toContain("right: 0");
    expect(auth).toContain("validateName");
    expect(auth).toContain("validateContact");
    expect(auth).toContain("nameLiveError");
    expect(auth).toContain("contactLiveError");
    expect(auth).toContain("FieldValidation");
    expect(auth).toContain("أدخل الاسم الكامل للمتابعة.");
    expect(auth).toContain("أدخل رقم الهاتف للمتابعة.");
    expect(auth).toContain("أدخل البريد الإلكتروني للمتابعة.");
    expect(auth).toContain("check-circle-outline");
    expect(auth).toContain('accessibilityRole="link"');
    expect(auth).not.toContain("مخصّصان لفحص الواجهة فقط");
  });

  it("keeps the dark visual hierarchy and switches registration inside the same Arabic tabbed screen", () => {
    const auth = source("components/unified-auth-screen.tsx");
    const login = source("app/auth/login.tsx");
    const root = source("app/_layout.tsx");
    expect(auth).toContain('bg: "#070B10"');
    expect(auth).toContain('surface: "rgba(15, 22, 33, 0.30)"');
    expect(auth).toContain('primary: "#FF6B47"');
    expect(auth).toContain('containerClassName="bg-transparent"');
    expect(auth).toContain('accessibilityRole="tab"');
    expect(auth).toContain("changeTab");
    expect(auth).toContain("Animated.timing(formOpacity");
    expect(auth).toContain("الاسم الكامل");
    expect(auth).toContain("كلمة المرور أو رمز الدخول");
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

  it("provides a public preview-only forgot password sequence without sending a code", () => {
    const forgot = source("app/auth/forgot-password.tsx");
    const root = source("app/_layout.tsx");
    expect(forgot).toContain("هذه معاينة لتسلسل الواجهة فقط");
    expect(forgot).toContain("continuePreview");
    expect(forgot).toContain("normalizeInternationalPhone");
    expect(forgot).not.toContain("startOAuthLogin");
    expect(forgot).not.toContain("fetch(");
    expect(root).not.toContain("AuthNavigationGuard");
  });
});
