/** Pure, dependency-free passwordless Email-OTP engine (validators, error
 *  classification, countdown formatting). Kept free of React/React Native so it
 *  can be unit-tested in isolation under vitest. */

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SupabaseOtpError =
  | "not-configured"
  | "invalid-email"
  | "invalid-otp"
  | "expired-otp"
  | "rate-limited"
  | "network"
  | "unknown";

export const SUPABASE_OTP_ERROR_MESSAGES: Record<SupabaseOtpError, string> = {
  "not-configured": "تسجيل الدخول عبر البريد الإلكتروني غير مفعّل بعد على هذا التطبيق.",
  "invalid-email": "أدخل بريدًا إلكترونيًا صحيحًا، مثل name@example.com.",
  "invalid-otp": "رمز التحقق غير صحيح. تحقق منه وأعد المحاولة.",
  "expired-otp": "انتهت صلاحية رمز التحقق. اضغط «إعادة إرسال الرمز» للحصول على رمز جديد.",
  "rate-limited": "طلبت عدة رموز في وقت قصير. انتظر قليلًا ثم أعد المحاولة.",
  network: "تعذر الاتصال بالشبكة. تحقق من اتصال الإنترنت ثم أعد المحاولة.",
  unknown: "حدث خطأ غير متوقع أثناء التحقق. حاول مرة أخرى.",
};

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "أدخل البريد الإلكتروني للمتابعة.";
  return emailPattern.test(trimmed) ? null : "أدخل بريدًا إلكترونيًا صحيحًا، مثل name@example.com.";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalizes an entered OTP: drops all whitespace, zero-width and other
 * invisible characters, keeping only the ASCII digits that make up the token.
 * Pasting an email code often carries trailing spaces / invisible separators;
 * stripping them ensures the exact token is forwarded to `verifyOtp` with no
 * truncation and no stray characters.
 */
export function normalizeOtpToken(token: string): string {
  return String(token ?? "").replace(/[^\d]/g, "");
}

export function isOtpTokenPresent(token: string): boolean {
  return normalizeOtpToken(token).length > 0;
}

export function classifyOtpError(error: unknown): SupabaseOtpError {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const status = (error as { status?: number })?.status;
  if (/network|fetch failed|load failed|connection|timeout|abort|offline|internet/i.test(message)) return "network";
  if (/invalid otp|token has expired|token already used|otp|invalid_otp/i.test(message)) {
    if (/expired|already used|has expired/i.test(message)) return "expired-otp";
    return "invalid-otp";
  }
  if (/rate|too many|seconds|throttl|limit/i.test(message) || status === 429) return "rate-limited";
  return "unknown";
}

/**
 * Outcome of probing whether an email corresponds to a signup that is pending
 * email verification (`auth.users` with `email_confirmed_at IS NULL`).
 */
export type SignupProbeResult = "pending" | "confirmed" | "not-found" | "network" | "unknown";

/**
 * Classifies the error produced by `supabase.auth.resend({ type: "signup" })`
 * (or `signInWithOtp` with `shouldCreateUser: false`) into a signup state:
 * - "pending"     → an unverified signup exists (resend is accepted).
 * - "confirmed"   → the email is already confirmed (resend refused as
 *                   "already confirmed"), so it is a normal verified login.
 * - "not-found"   → no such signup/account exists (fresh, or purged after 7d).
 * - "network"     → transport failure.
 * - "unknown"     → any other error.
 */
export function classifySignupProbeError(error: unknown): SignupProbeResult {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const status = (error as { status?: number })?.status;
  if (/network|fetch failed|load failed|connection|timeout|abort|offline|internet/i.test(message)) return "network";
  // A confirmed address refuses a signup resend ("already confirmed").
  if (/already confirmed|already signed up|confirmed|email already registered|account already exists/i.test(message)) return "confirmed";
  // A truly absent identity must be *confirmed by the response text*. We do NOT
  // treat a bare status 400 as "not-found": modern Supabase returns 400 for many
  // reasons (rate limits, ambiguous resend states) that also cover an unverified
  // account. Down-concluding a real unverified signup to "absent" would make a
  // login report "الحساب غير مسجل" instead of the recovery/verification path.
  if (/user not found|signup not found|does ?not exist|doesn'?t exist|no such user|no user|email not found|not registered|account not found/i.test(message)) return "not-found";
  if (/rate|too many|seconds|throttl|limit/i.test(message) || status === 429) return "unknown";
  return "unknown";
}

/** True when the resend probe indicates a pending (unverified) signup. */
export function isSignupProbePending(result: SignupProbeResult): boolean {
  return result === "pending";
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Unified smart identifier: auto-detects whether the user typed an email or a
 * Jordanian phone number. This replaces the old phone/email toggle with a single
 * field. Pure and dependency-free so it can be unit-tested in isolation.
 */

const arToEnDigits: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export type IdentifierKind = "email" | "phone" | "invalid";

export type ClassifiedIdentifier = { kind: IdentifierKind; raw: string; email: string | null; phone: string | null };

function normalizePhoneDigits(value: string): string {
  return Array.from(value)
    .map((ch) => arToEnDigits[ch] ?? ch)
    .join("")
    .replace(/[^\d+]/g, "");
}

/** Validates a Jordanian mobile number: +962 followed by 7 then 8 more digits (9 total). */
export function isValidJordanianPhone(phone: string): boolean {
  const cleaned = normalizePhoneDigits(phone).replace(/^00/, "+");
  const normalized = cleaned.startsWith("+") ? cleaned : `+962${cleaned.replace(/^0/, "")}`;
  return /^\+9627\d{8}$/.test(normalized);
}

/** Auto-detects email vs Jordanian phone. Prefers email when '@' is present. */
export function classifyIdentifier(input: string): ClassifiedIdentifier {
  const raw = input.trim();
  if (!raw) return { kind: "invalid", raw, email: null, phone: null };

  if (raw.includes("@")) {
    const email = normalizeEmail(raw);
    if (emailPattern.test(email)) return { kind: "email", raw, email, phone: null };
    return { kind: "invalid", raw, email: null, phone: null };
  }

  if (/[\d٠-٩۰-۹]/.test(raw)) {
    const phone = normalizePhoneDigits(raw).replace(/^00/, "+");
    const normalized = phone.startsWith("+") ? phone : `+962${phone.replace(/^0/, "")}`;
    if (isValidJordanianPhone(normalized)) return { kind: "phone", raw, email: null, phone: normalized };
    return { kind: "invalid", raw, email: null, phone: null };
  }

  return { kind: "invalid", raw, email: null, phone: null };
}

export type IdentifierValidation =
  | { ok: true; kind: "email"; email: string }
  | { ok: true; kind: "phone"; phone: string }
  | { ok: false; kind: "invalid"; reason: "empty" | "email" | "phone" };

export function validateIdentifier(input: string): IdentifierValidation {
  const raw = input.trim();
  if (!raw) return { ok: false, kind: "invalid", reason: "empty" };
  const classified = classifyIdentifier(raw);
  if (classified.kind === "email") return { ok: true, kind: "email", email: classified.email! };
  if (classified.kind === "phone") return { ok: true, kind: "phone", phone: classified.phone! };
  return { ok: false, kind: "invalid", reason: raw.includes("@") ? "email" : "phone" };
}

/** Password policy: at least 8 characters, containing letters and numbers, no symbols. */
export function validatePassword(password: string): string | null {
  const value = password ?? "";
  if (!value) return "أدخل كلمة المرور للمتابعة.";
  if (value.length < 8) return "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.";
  if (!/[A-Za-z]/.test(value)) return "يجب أن تحتوي كلمة المرور على أحرف.";
  if (!/\d/.test(value)) return "يجب أن تحتوي كلمة المرور على أرقام.";
  if (/[^\w\u0600-\u06FF]/.test(value)) return "لا تُستخدم رموز خاصة في كلمة المرور.";
  return null;
}

export function passwordsMatch(password: string, confirm: string): boolean {
  return password === confirm;
}

export type AuthError =
  | "not-configured"
  | "unregistered"
  | "wrong-password"
  | "invalid-password"
  | "invalid-email"
  | "provider-unavailable"
  | "email-not-confirmed"
  | "deletion-pending"
  | "network"
  | "unknown";

export const AUTH_ERROR_MESSAGES: Record<AuthError, string> = {
  "not-configured": "تسجيل الدخول غير مفعّل بعد على هذا التطبيق.",
  unregistered: "هذا الحساب غير مسجل، يرجى إنشاء حساب جديد.",
  "wrong-password": "كلمة المرور غير صحيحة، يرجى التأكد وإعادة المحاولة.",
  "invalid-password": "كلمة المرور لا تستوفي المتطلبات. استخدم 8 أحرف على الأقل مع أحرف وأرقام.",
  "invalid-email": "أدخل بريدًا إلكترونيًا صحيحًا، مثل name@example.com.",
  "provider-unavailable": "تسجيل الدخول عبر هذا المزود غير مفعّل حالياً في إعدادات الخادم",
  "email-not-confirmed": "حسابك مسجل ولكنه غير موثّق بعد. أرسلنا لك رمز تحقق جديداً إلى بريدك الإلكتروني.",
  "deletion-pending": "تم تقديم طلب حذف لحسابك وهو فعّال حاليًا.",
  network: "تعذر الاتصال بالشبكة. تحقق من اتصال الإنترنت ثم أعد المحاولة.",
  unknown: "حدث خطأ غير متوقع أثناء الدخول. حاول مرة أخرى.",
};

export function classifyAuthError(error: unknown): AuthError {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (/network|fetch failed|load failed|connection|timeout|abort|offline|internet/i.test(message)) return "network";

  // Supabase raises `400 validation_failed: Unsupported provider: provider is
  // not enabled` when an OAuth button points at a provider disabled in the
  // server auth settings. Show a friendly notice instead of a raw JSON alert.
  if (/unsupported provider|provider is not enabled|not enabled|validation_failed/i.test(message)) return "provider-unavailable";

  // A registered but still unverified account. Distinct from "Invalid login
  // credentials": confirming requires resending the sign-up OTP, not a password.
  if (/email not confirmed|not confirmed|email_not_confirmed|unconfirmed/i.test(message)) return "email-not-confirmed";

  if (/invalid login credentials|invalid_credentials|invalidentries|user not found|not registered/i.test(message)) return "unregistered";
  if (/invalid password|invalid_credentials|wrong password|password/i.test(message)) return "wrong-password";
  if (message.includes("كلمة المرور غير صحيحة") || message.includes("كلمة المرور خاطئة") || message.includes("كلمة المرور غير مطابقة")) return "wrong-password";

  if (message.includes("الحساب غير مسجل") || message.includes("لم يتم العثور على حساب") || message.includes("unregistered")) return "unregistered";
  return "unknown";
}

/**
 * Super Admin master credentials used for the direct login bypass. The server
 * merges this identity to the canonical owner `openId` and returns
 * `role: "super_admin"`, so no Supabase Auth record or email confirmation is
 * required to sign in — the bridge issues the owner session directly.
 */
export const SUPER_ADMIN_EMAIL = "moh.ajlouni.90@gmail.com";
export const SUPER_ADMIN_PASSWORD = "Ajlouni911";

/** True when the identifier is the Super Admin email (case-insensitive). */
export function isSuperAdminEmail(identifier: string): boolean {
  return normalizeEmail(identifier) === SUPER_ADMIN_EMAIL;
}

/** True when the supplied password matches the Super Admin master password. */
export function isSuperAdminPassword(password: string): boolean {
  return String(password ?? "") === SUPER_ADMIN_PASSWORD;
}

/**
 * True when the identifier is the Super Admin identity (email OR the canonical
 * Jordanian phone shape) AND the password matches. Used by the client to route
 * straight to the server bridge instead of a (possibly unseeded) Supabase auth.
 */
export function isSuperAdminCredential(identifier: string, password: string): boolean {
  if (!isSuperAdminPassword(password)) return false;
  const normalized = normalizeEmail(identifier);
  if (normalized === SUPER_ADMIN_EMAIL) return true;
  const classified = classifyIdentifier(identifier);
  return classified.kind === "phone" && classified.phone === "+962797402940";
}
