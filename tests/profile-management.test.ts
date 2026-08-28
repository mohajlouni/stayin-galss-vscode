import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("profile management", () => {
  it("uses authenticated backend procedures for the profile and avatar upload", () => {
    const router = source("server/routers.ts");
    const database = source("server/db.ts");
    expect(router).toContain("profile: router");
    expect(router).toContain("update: protectedProcedure");
    expect(router).toContain("uploadAvatar: protectedProcedure");
    expect(router).toContain("2 * 1024 * 1024");
    expect(router).toContain("storagePut(`profiles/${ctx.user.id}/avatar.${extension}`");
    expect(database).toContain("updateUserProfile(userId");
    expect(database).toContain("eq(users.id, userId)");
  });

  it("offers name, phone, avatar selection, and a profile entry from the More screen", () => {
    const profile = source("app/profile.tsx");
    const more = source("app/(tabs)/more.tsx");
    expect(profile).toContain("launchImageLibraryAsync");
    expect(profile).toContain("launchCameraAsync");
    expect(profile).toContain("حفظ التغييرات");
    expect(profile).toContain("normalizeInternationalPhone");
    expect(profile).toContain("رقم الهاتف الدولي");
    expect(profile).toContain("COUNTRY_DIALING_CODES");
    expect(profile).toContain("اختر رمز الدولة");
    expect(more).toContain("ملفي الشخصي");
    expect(more).toContain('router.push("/profile")');
  });
});
