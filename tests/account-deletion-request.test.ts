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
    expect(database).toContain("30 * 24 * 60 * 60 * 1000");
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
});
