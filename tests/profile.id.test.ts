import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("My profile screen: smart user ID + in-app email OTP", () => {
  it("shows the read-only smart user ID (#Uxxxx) with a copy action", () => {
    const profile = source("app/profile.tsx");
    expect(profile).toContain("معرّف المستخدم");
    expect(profile).toContain("copyUserCode");
    expect(profile).toContain("Clipboard.setStringAsync");
    expect(profile).toContain("نسخ");
    expect(profile).toContain("userCode ?? ");
    expect(profile).toContain("writingDirection: \"ltr\"");
    expect(profile).toContain("content-copy");
  });

  it("changes the email inside the app via OTP instead of the external identity portal", () => {
    const profile = source("app/profile.tsx");
    const oauth = source("constants/oauth.ts");
    expect(profile).toContain("requestEmailChangeOtp");
    expect(profile).toContain("verifyEmailChangeOtp");
    expect(profile).toContain("تغيير البريد الإلكتروني");
    expect(profile).toContain("إرسال رمز التحقق");
    expect(profile).toContain("رمز التحقق");
    expect(profile).toContain("دون مغادرة التطبيق");
    // The email flow must not rely on the external OAuth identity portal.
    expect(profile).not.toContain("startOAuthLogin");
    expect(profile).toContain("no external portal");
  });

  it("keeps the international phone field without request-verification (SMS/WhatsApp) buttons", () => {
    const profile = source("app/profile.tsx");
    expect(profile).toContain("normalizeInternationalPhone");
    expect(profile).toContain("countryForInternationalPhone");
    expect(profile).toContain("formatInternationalPhoneHint");
    // Phone is a plain contact field: no phone-OTP / WhatsApp verify controls.
    expect(profile.toLowerCase()).not.toContain("whatsapp");
    expect(profile.toLowerCase()).not.toContain("sms");
  });

  it("exposes the email-change procedures and DB persistence on the profile router", () => {
    const routers = source("server/routers.ts");
    const db = source("server/db.ts");
    expect(routers).toContain("requestEmailChangeOtp");
    expect(routers).toContain("verifyEmailChangeOtp");
    expect(routers).toContain("signInWithOtp");
    expect(routers).toContain("type: \"email\"");
    expect(routers).toContain("updateUserEmail(ctx.user.id, email)");
    expect(db).toContain("export async function updateUserEmail");
  });

  it("assigns smart user codes at bootstrap and persists them in the schema/db layer", () => {
    const schema = source("drizzle/schema.ts");
    const db = source("server/db.ts");
    const index = source("server/_core/index.ts");
    const helper = source("lib/user-code.ts");
    expect(schema).toContain("userCode");
    expect(db).toContain("export async function ensureUserCodes");
    expect(db).toContain("ensureUserCodeColumn");
    expect(index).toContain("ensureUserCodes()");
    expect(helper).toContain("SUPER_ADMIN_USER_CODE = 1000");
    expect(helper).toContain("OWNER_CODE_START = 1011");
    expect(helper).toContain("RESERVED_USER_CODE_START = 1001");
  });
});
