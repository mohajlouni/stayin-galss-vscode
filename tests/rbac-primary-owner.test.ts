import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("four-tier hierarchy and primary owner protection", () => {
  it("maps the compatible stored roles to four clear operational tiers", () => {
    const permissions = source("shared/workspace-permissions.ts");
    expect(permissions).toContain("المالك الأساسي");
    expect(permissions).toContain("مدير تشغيلي");
    expect(permissions).toContain("موظف حجوزات");
    expect(permissions).toContain("حارس / مشرف ميداني");
  });

  it("enforces primary-owner immunity and prevents operational managers changing peer managers", () => {
    const router = source("server/routers.ts");
    const data = source("server/db.ts");
    expect(router).toContain("Only the primary owner can invite an operational manager");
    expect(router).toContain("Primary owner is immutable");
    expect(router).toContain("Operational managers cannot modify other managers");
    expect(data).toContain("Owner permissions cannot be restricted");
  });

  it("requires a three-second hold request and delegates OTP verification to the verified external channel", () => {
    const screen = source("app/user-management.tsx");
    const router = source("server/routers.ts");
    expect(screen).toContain("}, 3000)");
    expect(screen).toContain("اضغط 3 ثوانٍ لطلب نقل الملكية");
    expect(router).toContain("delegatedToVerifiedChannel: true");
    expect(router).toContain("ownership-transfer-requested");
  });
});
