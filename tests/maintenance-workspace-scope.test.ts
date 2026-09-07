import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("preventive maintenance is free of static mock fixtures", () => {
  const sources = ["app/maintenance-dashboard.tsx", "lib/booking-store.tsx"].map(read);

  it("drops all legacy mock task/asset fixtures", () => {
    const legacy = ["مزرعة الهدى", "فحص بويلر المسبح", "فلاتر الماء", "مكيف مركزي", "بويلر المسبح", "فيلا النخيل VIP", "شاليه النخيل 1", "شاليه الواحة"];
    for (const fixture of legacy) {
      for (const source of sources) {
        expect(source, fixture).not.toContain(fixture);
      }
    }
  });

  it("initializes task and asset lists as empty arrays with no fallback seeding", () => {
    const model = read("lib/booking-model.ts");
    expect(model).toContain("assets: []");
    expect(model).toContain("maintenanceTasks: []");
  });
});

describe("preventive maintenance data is scoped to the active workspace", () => {
  it("stores per-workspace data under a workspace-scoped key", () => {
    const store = read("lib/booking-store.tsx");
    expect(store).toContain("STORAGE_KEY}:workspace-${activeWorkspaceId}");
  });

  it("refetches server data whenever the active workspace changes", () => {
    const store = read("lib/booking-store.tsx");
    expect(store).toContain("activeWorkspaceId");
    expect(store).toContain("refreshWorkspaceData");
  });

  it("filters remote realtime subscriptions by workspace_id", () => {
    const data = read("lib/supabase-data.ts");
    expect(data).toContain("workspace_id=eq.${workspaceId}");
  });
});

describe("maintenance dashboard renders workspace-aware empty states and guards", () => {
  const source = read("app/maintenance-dashboard.tsx");

  it("uses the exact workspace-scoped empty state texts", () => {
    expect(source).toContain("لا توجد مهام صيانة مجدولة لهذه المنشأة");
    expect(source).toContain("لا توجد أصول مسجلة لهذه المنشأة حالياً");
  });

  it("offers clear add-task/add-asset CTAs in the empty states", () => {
    expect(source).toContain("emptyCta");
    expect(source.match(/openCreateTask/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(source.match(/openCreateAsset/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("binds unit chips dynamically to the workspace units and guards the zero-unit case", () => {
    expect(source).toContain("chalets.map((chalet) =>");
    expect(source).toContain("يجب إضافة وحدة أولاً للمنشأة قبل تسجيل صيانة أو أصول");
    expect(source).toContain("openCreateTask");
    expect(source).toContain("openCreateAsset");
  });
});