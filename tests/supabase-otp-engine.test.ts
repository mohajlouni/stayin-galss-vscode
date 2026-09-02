import { describe, expect, it } from "vitest";

import {
  AUTH_ERROR_MESSAGES,
  SUPABASE_OTP_ERROR_MESSAGES,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
  classifyAuthError,
  classifyIdentifier,
  classifyOtpError,
  formatCountdown,
  isSuperAdminCredential,
  isSuperAdminEmail,
  isValidJordanianPhone,
  passwordsMatch,
  validateEmail,
  validateIdentifier,
  validatePassword,
} from "@/lib/supabase-otp-engine";

describe("Supabase passwordless Email OTP engine", () => {
  it("rejects an empty or malformed email before touching the network", () => {
    expect(validateEmail("   ")).not.toBeNull();
    expect(validateEmail("not-an-email")).not.toBeNull();
    expect(validateEmail("owner@stayin.test")).toBeNull();
  });

  it("classifies raw errors into typed, user-safe codes", () => {
    expect(classifyOtpError(new Error("Network request failed"))).toBe("network");
    expect(classifyOtpError(new Error("Token has expired or is already used"))).toBe("expired-otp");
    expect(classifyOtpError(new Error("Invalid OTP"))).toBe("invalid-otp");
    expect(classifyOtpError(new Error("rate limit exceeded"))).toBe("rate-limited");
    expect(classifyOtpError(new Error("boom"))).toBe("unknown");
  });

  it("maps every error code to a user-friendly Arabic message", () => {
    expect(SUPABASE_OTP_ERROR_MESSAGES["invalid-otp"]).toContain("رمز التحقق غير صحيح");
    expect(SUPABASE_OTP_ERROR_MESSAGES["expired-otp"]).toContain("انتهت صلاحية");
    expect(SUPABASE_OTP_ERROR_MESSAGES["rate-limited"]).toContain("عدة رموز");
    expect(SUPABASE_OTP_ERROR_MESSAGES["network"]).toContain("تعذر الاتصال");
    expect(SUPABASE_OTP_ERROR_MESSAGES["invalid-email"]).toContain("صحيحًا");
    expect(SUPABASE_OTP_ERROR_MESSAGES["not-configured"]).toContain("غير مفعّل");
  });

  it("formats the 5-minute countdown as mm:ss", () => {
    expect(formatCountdown(300)).toBe("5:00");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(9)).toBe("0:09");
    expect(formatCountdown(0)).toBe("0:00");
  });
});

describe("Unified smart identifier classifier", () => {
  it("auto-detects a valid email and normalizes it to lowercase", () => {
    const email = classifyIdentifier("  Owner@StayIn.Example.COM ");
    expect(email.kind).toBe("email");
    expect(email.email).toBe("owner@stayin.example.com");
  });

  it("auto-detects a Jordanian phone in local, +962, and Arabic-digit forms", () => {
    expect(classifyIdentifier("0797402940").kind).toBe("phone");
    expect(classifyIdentifier("+962797402940").kind).toBe("phone");
    expect(classifyIdentifier("0795402940").phone).toBe("+962795402940");
    expect(classifyIdentifier("٠٧٩٧٤٠٢٩٤٠").kind).toBe("phone");
  });

  it("rejects malformed identifiers (invalid email or non-Jordanian phone)", () => {
    expect(classifyIdentifier("not-an-email").kind).toBe("invalid");
    expect(classifyIdentifier("079123").kind).toBe("invalid");
    expect(classifyIdentifier("+201001234567").kind).toBe("invalid");
    expect(classifyIdentifier("").kind).toBe("invalid");
  });

  it("splits a smart email-vs-phone form via validateIdentifier", () => {
    expect(validateIdentifier("owner@stayin.test")).toEqual({ ok: true, kind: "email", email: "owner@stayin.test" });
    expect(validateIdentifier("0797402940").kind).toBe("phone");
    expect(validateIdentifier("   ").ok).toBe(false);
  });

  it("validates Jordanian mobile shape independently", () => {
    expect(isValidJordanianPhone("+962790000000")).toBe(true);
    expect(isValidJordanianPhone("+9627900000")).toBe(false);
    expect(isValidJordanianPhone("+966500000000")).toBe(false);
  });
});

describe("Password policy and real-time match", () => {
  it("requires at least 8 characters with letters and numbers, no symbols", () => {
    expect(validatePassword("")).not.toBeNull();
    expect(validatePassword("short1")).not.toBeNull();
    expect(validatePassword("onlyletters")).not.toBeNull();
    expect(validatePassword("12345678")).not.toBeNull();
    expect(validatePassword("Abcdef1!")).not.toBeNull();
    expect(validatePassword("Stayin2026")).toBeNull();
  });

  it("matches password confirmation in real time", () => {
    expect(passwordsMatch("Stayin2026", "Stayin2026")).toBe(true);
    expect(passwordsMatch("Stayin2026", "Stayin2027")).toBe(false);
  });
});

describe("Auth error classification and messages", () => {
  it("maps unregistered identities to the Arabic registration gate message", () => {
    expect(AUTH_ERROR_MESSAGES.unregistered).toBe("الحساب غير مسجل، يرجى إنشاء حساب جديد من تبويب إنشاء حساب");
  });

  it("classifies login errors into typed codes", () => {
    expect(classifyAuthError(new Error("Invalid login credentials"))).toBe("unregistered");
    expect(classifyAuthError(new Error("Invalid password"))).toBe("wrong-password");
    expect(classifyAuthError(new Error("Network request failed"))).toBe("network");
    expect(classifyAuthError(new Error("boom"))).toBe("unknown");
  });

  it("classifies an unsupported OAuth provider as provider-unavailable", () => {
    expect(classifyAuthError(new Error("400 validation_failed: Unsupported provider: provider is not enabled"))).toBe("provider-unavailable");
    expect(classifyAuthError(new Error("Unsupported provider: Provider is not enabled"))).toBe("provider-unavailable");
    expect(AUTH_ERROR_MESSAGES["provider-unavailable"]).toBe("تسجيل الدخول عبر هذا المزود غير مفعّل حالياً في إعدادات الخادم");
  });

  it("classifies the server Arabic wrong-password message", () => {
    expect(classifyAuthError(new Error("كلمة المرور غير صحيحة. تحقق منها وأعد المحاولة."))).toBe("wrong-password");
    expect(classifyAuthError(new Error("كلمة المرور خاطئة"))).toBe("wrong-password");
  });
});

describe("Super Admin credential bypass", () => {
  it("recognizes the canonical master email", () => {
    expect(SUPER_ADMIN_EMAIL).toBe("moh.ajlouni.90@gmail.com");
    expect(isSuperAdminEmail("  MOH.AJLOUNI.90@GMAIL.COM ")).toBe(true);
    expect(isSuperAdminEmail("other@example.com")).toBe(false);
  });

  it("matches email + master password as a Super Admin credential", () => {
    expect(isSuperAdminCredential("moh.ajlouni.90@gmail.com", "Ajlouni911")).toBe(true);
    expect(isSuperAdminCredential("MOH.AJLOUNI.90@GMAIL.COM", "Ajlouni911")).toBe(true);
  });

  it("matches phone shapes + master password as a Super Admin credential", () => {
    expect(isSuperAdminCredential("0797402940", "Ajlouni911")).toBe(true);
    expect(isSuperAdminCredential("+962797402940", "Ajlouni911")).toBe(true);
    expect(isSuperAdminCredential("٠٧٩٧٤٠٢٩٤٠", "Ajlouni911")).toBe(true);
  });

  it("rejects wrong password or a non-Super-Admin identity", () => {
    expect(SUPER_ADMIN_PASSWORD).toBe("Ajlouni911");
    expect(isSuperAdminCredential("moh.ajlouni.90@gmail.com", "wrongpass1")).toBe(false);
    expect(isSuperAdminCredential("0797402940", "wrongpass1")).toBe(false);
    expect(isSuperAdminCredential("someone@example.com", "Ajlouni911")).toBe(false);
    expect(isSuperAdminCredential("0790000001", "Ajlouni911")).toBe(false);
  });
});

