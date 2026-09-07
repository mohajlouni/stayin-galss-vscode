import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_DATA, expireElapsedRecords, normalizeAppData } from "../lib/booking-model";
import { SupabaseDataError, isSupabaseRpcMissing } from "../lib/supabase-data";
import { mergeWorkspaceAppData } from "../lib/workspace-sync";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Supabase app.* RPC schema is created and exposed to PostgREST", () => {
  const init = read("supabase/migrations/0001_init_schema.sql");
  const expose = read("supabase/migrations/0002_postgrest_expose_app_schema.sql");

  it("0001 creates the app schema and the whole-workspace / session wrappers", () => {
    expect(init).toContain("create schema if not exists app;");
    expect(init).toContain("grant usage on schema app to anon, authenticated;");
    expect(init).toMatch(/create or replace function app\.my_workspace\(\)[\s\S]{0,120}security definer/);
    expect(init).toMatch(/create or replace function app\.get_workspace_state\(\)[\s\S]{0,120}security definer/);
    expect(init).toMatch(/create or replace function app\.save_workspace_state\(p_payload jsonb\)[\s\S]{0,120}security definer/);
  });

  it("0002 exposes the app schema to PostgREST so rpc/app.* stops 404ing with PGRST202", () => {
    expect(expose).toContain("pgrst.db_schemas = 'public, graphql_public, app'");
    expect(expose).toContain("grant usage on schema app to authenticator;");
    expect(expose).toContain("notify pgrst, 'reload schema';");
  });
});

describe("client routes the workspace snapshot to the app.* RPCs", () => {
  const data = read("lib/supabase-data.ts");

  it("pulls the workspace state and resolves the supabase workspace id via app.*", () => {
    expect(data).toContain('.rpc("app.get_workspace_state")');
    expect(data).toContain('.rpc("app.my_workspace")');
    expect(data).toContain('.rpc("app.save_workspace_state"');
    expect(read("lib/booking-store.tsx")).toContain('subscribeToTable("workspace_state"');
  });

  it("detects a permanently missing RPC (PGRST202 / 404 / missing config)", () => {
    expect(isSupabaseRpcMissing({ code: "PGRST202", message: "Could not find the function app.get_workspace_state in the schema cache" })).toBe(true);
    expect(isSupabaseRpcMissing(new SupabaseDataError("getWorkspaceState: Could not find the function app.get_workspace_state in the schema cache", "QUERY_FAILED"))).toBe(true);
    expect(isSupabaseRpcMissing({ status: 404, message: "Not Found" })).toBe(true);
    expect(isSupabaseRpcMissing(new SupabaseDataError("Supabase is not configured", "NOT_CONFIGURED"))).toBe(true);
    expect(isSupabaseRpcMissing(new Error("fetch failed"))).toBe(false);
  });
});

describe("missing RPC falls back to real local state, never mock fixtures", () => {
  it("EMPTY_DATA initializes maintenance tasks and assets as empty arrays", () => {
    expect(EMPTY_DATA.maintenanceTasks).toEqual([]);
    expect(EMPTY_DATA.assets).toEqual([]);
  });

  it("a null/404 Supabase pull merges into an empty clean state", () => {
    const clean = expireElapsedRecords(mergeWorkspaceAppData(EMPTY_DATA, EMPTY_DATA).data);
    expect(clean.maintenanceTasks).toEqual([]);
    expect(clean.assets).toEqual([]);
  });

  it("normalizing the clean state keeps the lists empty", () => {
    const normalized = normalizeAppData({ ...EMPTY_DATA, maintenanceTasks: undefined, assets: undefined });
    expect(normalized.maintenanceTasks ?? []).toEqual([]);
    expect(normalized.assets ?? []).toEqual([]);
  });

  it("the store never seeds or re-injects demo maintenance fixtures on failure", () => {
    const store = read("lib/booking-store.tsx");
    for (const fixture of ["مزرعة الهدى", "فحص بويلر المسبح", "فلاتر الماء", "مكيف مركزي", "بويلر المسبح", "شاليه النخيل 1"]) {
      expect(store).not.toContain(fixture);
    }
    expect(store).toContain("supabaseEndpointDown");
    expect(store).toContain("isSupabaseRpcMissing");
  });
});