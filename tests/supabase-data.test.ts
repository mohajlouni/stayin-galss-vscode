import { describe, expect, it } from "vitest";

import {
  SupabaseDataError,
  isSupabaseConfigured,
  listBookings,
  listChalets,
  listCustomers,
  listMaintenanceTasks,
  listUtilityReadings,
  getSettings,
  getWorkspaceState,
  saveWorkspaceState,
  subscribeToTable,
  upsertBooking,
  upsertChalet,
} from "../lib/supabase-data";

describe("Supabase data layer (Phase B)", () => {
  it("exposes a typed SupabaseDataError carrying an error code", () => {
    const err = new SupabaseDataError("boom", "QUERY_FAILED", { label: "x" });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SupabaseDataError");
    expect(err.message).toBe("boom");
    expect(err.code).toBe("QUERY_FAILED");
    expect(err.context).toEqual({ label: "x" });
  });

  it("reads the configured flag from the environment", () => {
    // The vitest setup loads .env, so the Supabase public vars are present.
    expect(typeof isSupabaseConfigured).toBe("boolean");
  });

  it("exposes the full public CRUD + realtime API surface", () => {
    expect(typeof listBookings).toBe("function");
    expect(typeof upsertBooking).toBe("function");
    expect(typeof listChalets).toBe("function");
    expect(typeof upsertChalet).toBe("function");
    expect(typeof listCustomers).toBe("function");
    expect(typeof listMaintenanceTasks).toBe("function");
    expect(typeof listUtilityReadings).toBe("function");
    expect(typeof getSettings).toBe("function");
    expect(typeof getWorkspaceState).toBe("function");
    expect(typeof saveWorkspaceState).toBe("function");
    expect(typeof subscribeToTable).toBe("function");
  });

  it("throws a typed error when the data layer is not configured", async () => {
    const previousUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    try {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      await expect(listBookings("token")).rejects.toBeInstanceOf(SupabaseDataError);
    } finally {
      if (previousUrl !== undefined) process.env.EXPO_PUBLIC_SUPABASE_URL = previousUrl;
      if (previousKey !== undefined) process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = previousKey;
    }
  });
});
