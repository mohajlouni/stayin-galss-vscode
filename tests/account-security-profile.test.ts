import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("profile account security", () => {
  it("places account security and deletion access inside the profile", () => {
    const profile = source("app/profile.tsx");
    const links = source("components/profile-security-links.tsx");
    const more = source("app/(tabs)/more.tsx");
    expect(profile).toContain("ProfileSecurityLinks");
    expect(links).toContain('router.push("/account-security")');
    expect(links).toContain("أمان الحساب");
    expect(more).not.toContain('route: "/account-deletion"');
  });

  it("uses secure identity handling, a plain header, and reliable local sign out", () => {
    const security = source("app/account-security.tsx");
    const session = source("lib/auth-session.tsx");
    const auth = source("hooks/use-auth.ts");
    const toggle = source("components/app-toggle.tsx");
    const settings = source("app/(tabs)/settings.tsx");
const login = source("app/auth/login.tsx");
const register = source("app/auth/register.tsx");
const unifiedAuth = source("components/unified-auth-screen.tsx");
    const oauth = source("constants/oauth.ts");
    expect(security).toContain("تغيير كلمة المرور");
    expect(security).toContain("openPassword");
    expect(security).toContain("كلمة المرور الحالية");
    expect(security).toContain("signInWithPassword");
    expect(security).toContain("updateUser");
    expect(security).toContain("<CompactScreenHeader plain");
    expect(security).toContain("setConfirmation(\"signout\")");
    expect(security).toContain('router.replace("/auth/login")');
    expect(security).toContain("void logout();");
    expect(security).toContain("AppToggle");
    expect(security).toContain('router.push("/account-deletion")');
    expect(security).toContain("الدخول ببصمة الإصبع / الوجه");
    expect(security).toContain("toggleBiometrics");
    expect(session).toContain("hasHardwareAsync()");
    expect(session).toContain("isEnrolledAsync()");
    expect(auth).toContain("The device must still be able to clear its local session while offline.");
    expect(auth).toContain("setUser(null);");
    expect(auth).toContain("void Api.logout()");
    expect(toggle).toContain('accessibilityRole="switch"');
    expect(toggle).toContain("const thumbLeft = isRTL");
    expect(settings).toContain("AppToggle");
    expect(login).toContain("UnifiedAuthScreen");
    expect(register).toContain("UnifiedAuthScreen");
    expect(unifiedAuth).toContain("AppToggle");
    expect(oauth).toContain("Secure identity portal is not configured");
  });

  it("places a prominent clickable profile card at the top of the more screen", () => {
    const more = source("app/(tabs)/more.tsx");
    expect(more).toContain("styles.profileCard");
    expect(more).toContain('router.push("/profile")');
    expect(more).toContain("currentUser.avatarUrl");
    expect(more).toContain("currentUser.fullName");
    expect(more).toContain("currentUser.email ??");
  });

  it("shows a verified email read-only and changes it inside the app via a 6-digit OTP, without an external identity portal", () => {
    const profile = source("app/profile.tsx");
    const header = source("components/compact-screen-header.tsx");
    expect(profile).toContain('plain showDateTime={false}');
    expect(header).toContain("showDateTime?: boolean");
    expect(header).toContain("{showDateTime ? <LiveDateTime");
    expect(profile).toContain("البريد الإلكتروني الموثق");
    expect(profile).toContain("verifiedEmail");
    expect(profile).toContain("requestEmailChangeOtp");
    expect(profile).toContain("verifyEmailChangeOtp");
    expect(profile).toContain("تغيير البريد الإلكتروني");
    expect(profile).toContain("رمز التحقق");
    expect(profile).not.toContain("startOAuthLogin");
    expect(profile).not.toContain("بوابة الهوية");
  });

  it("shows all password fields (current, new, confirm) with eye toggles and a biometric / OTP recovery for forgotten passwords", () => {
    const security = source("app/account-security.tsx");
    expect(security).toContain("كلمة المرور الحالية");
    expect(security).toContain("كلمة المرور الجديدة");
    expect(security).toContain("تأكيد كلمة المرور الجديدة");
    expect(security).toContain("نسيت كلمة المرور الحالية؟ التحقق بواسطة البصمة / Face ID");
    expect(security).toContain("التحقق ببصمة الإصبع / الوجه");
    expect(security).toContain("إرسال رمز تحقق OTP إلى البريد");
    expect(security).toContain("setPwShowCurrent");
    expect(security).toContain("setPwShowNew");
    expect(security).toContain("setPwShowConfirm");
    expect(security).toContain("تحديث كلمة المرور");
    expect(security).toContain("تم تحديث كلمة المرور بنجاح.");
    expect(security).toContain("Password updated successfully.");
  });
});
