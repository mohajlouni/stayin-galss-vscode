import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("master control center must stay visible for the super admin", () => {
  it("shows the مركز الإدارة العليا entry by super-admin identity, not by a fragile admin query result", () => {
    const more = source("app/(tabs)/more.tsx");
    expect(more).toContain("مركز الإدارة العليا");
    expect(more).toContain('route: "/admin/master-control"');
    expect(more).toContain("isSuperAdmin && flags.master_control");
    expect(more).not.toContain("masterControl.data");
    expect(more).not.toContain("trpc.masterControl.overview.useQuery");
  });

  it("distinguishes a real server outage from a permission denial instead of showing a misleading locked card", () => {
    const master = source("app/admin/master-control.tsx");
    expect(master).toContain('overview.error?.data?.code === "UNAUTHORIZED"');
    expect(master).toContain("overview.error && overview.error.data?.code !== \"FORBIDDEN\"");
    expect(master).toContain("تعذر الاتصال بخادم الإدارة العليا");
    expect(master).toContain("إعادة المحاولة");
    expect(master).toContain("overview.refetch()");
    expect(master).toContain("هذه اللوحة مخصصة لمدير النظام فقط");
  });
});