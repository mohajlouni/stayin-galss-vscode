/**
 * Supabase data-access layer (Phase B — isolated, non-breaking).
 *
 * IMPORTANT: This module is intentionally STANDALONE. It is NOT wired into the
 * existing local store (`lib/booking-store.tsx`) or any screen, so the existing
 * 507-test suite and production data flow remain completely unchanged. It is a
 * typed, tenant-scoped wrapper around the `app.*` SECURITY DEFINER functions
 * created in `supabase/migrations/0001_init_schema.sql`.
 *
 * Every call requires the custom session `token` issued by our own backend.
 * The token is sent as the `X-StayIn-Token` header so the Postgres helpers in
 * `app.session_context()` can resolve the caller's workspace and enforce tenancy.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import { supabase, isSupabaseConfigured } from "./supabase";

export { isSupabaseConfigured };

/** Thrown when a Supabase CRUD call fails. */
export class SupabaseDataError extends Error {
  constructor(
    message: string,
    public readonly code: string | null = null,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SupabaseDataError";
  }
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

/** A lightweight client bound to a custom session token (sent as a header). */
function clientWithToken(token: string) {
  return createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-StayIn-Token": token },
    },
  });
}

/** Live check (reads env at call time) so the guard is testable/deterministic. */
function isConfiguredNow(): boolean {
  return Boolean(url && anonKey && process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
}

function assertConfigured(): void {
  if (!isConfiguredNow()) {
    throw new SupabaseDataError(
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
      "NOT_CONFIGURED",
    );
  }
}

async function unwrap<T>(promise: PromiseLike<{ data: T | null; error: unknown }>, label: string): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    const message = error instanceof Error ? error.message : "Unknown Supabase error";
    throw new SupabaseDataError(`${label}: ${message}`, "QUERY_FAILED", { label });
  }
  if (data === null) {
    throw new SupabaseDataError(`${label}: no row returned`, "EMPTY_RESULT", { label });
  }
  return data;
}

// ---------------------------------------------------------------------------
// Row shapes (mirror the normalized tables from the migration).
// ---------------------------------------------------------------------------

export interface SupabaseBooking {
  id: string;
  workspace_id: string;
  booking_reference?: string | null;
  customer_id?: string | null;
  customer_name: string;
  phone: string;
  chalet_id?: string | null;
  chalet_name?: string | null;
  start_date: string;
  end_date: string;
  booking_type: string;
  start_time: string;
  end_time: string;
  price: number;
  discount_amount: number;
  deposit_amount: number;
  status: string;
  notes: string;
  payments: unknown;
  meta: unknown;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface SupabaseChalet {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  shifts: unknown;
  created_at: string;
  [key: string]: unknown;
}

export interface SupabaseCustomer {
  id: string;
  workspace_id: string;
  name: string;
  phone: string;
  e164: string;
  is_blacklisted: boolean;
  created_at: string;
  [key: string]: unknown;
}

export interface SupabaseMaintenanceTask {
  id: string;
  workspace_id: string;
  title: string;
  frequency: string;
  next_due_date: string;
  status: string;
  created_at: string;
  [key: string]: unknown;
}

export interface SupabaseUtilityReading {
  id: string;
  workspace_id: string;
  chalet_id?: string | null;
  booking_id?: string | null;
  type: string;
  check_in_reading: number;
  created_at: string;
  [key: string]: unknown;
}

export interface SupabaseSettings {
  workspace_id: string;
  payload: unknown;
  updated_at: string;
}

export interface SupabaseWorkspaceState {
  workspace_id: string;
  payload: unknown;
  version: number;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export async function listBookings(token: string): Promise<SupabaseBooking[]> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.list_bookings"), "listBookings");
}

export async function getBooking(token: string, id: string): Promise<SupabaseBooking> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.get_booking", { p_id: id }), "getBooking");
}

export async function upsertBooking(token: string, booking: SupabaseBooking): Promise<SupabaseBooking> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.upsert_booking", { p_booking: booking }), "upsertBooking");
}

export async function deleteBooking(token: string, id: string): Promise<boolean> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.delete_booking", { p_id: id }), "deleteBooking");
}

// ---------------------------------------------------------------------------
// Chalets
// ---------------------------------------------------------------------------

export async function listChalets(token: string): Promise<SupabaseChalet[]> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.list_chalets"), "listChalets");
}

export async function upsertChalet(token: string, chalet: Record<string, unknown>): Promise<SupabaseChalet> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.upsert_chalet", { p_chalet: chalet }), "upsertChalet");
}

export async function deleteChalet(token: string, id: string): Promise<boolean> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.delete_chalet", { p_id: id }), "deleteChalet");
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function listCustomers(token: string, search?: string): Promise<SupabaseCustomer[]> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.list_customers", { p_search: search ?? null }), "listCustomers");
}

export async function upsertCustomer(token: string, customer: Record<string, unknown>): Promise<SupabaseCustomer> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.upsert_customer", { p_customer: customer }), "upsertCustomer");
}

export async function deleteCustomer(token: string, id: string): Promise<boolean> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.delete_customer", { p_id: id }), "deleteCustomer");
}

// ---------------------------------------------------------------------------
// Maintenance tasks
// ---------------------------------------------------------------------------

export async function listMaintenanceTasks(token: string): Promise<SupabaseMaintenanceTask[]> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.list_maintenance_tasks"), "listMaintenanceTasks");
}

export async function upsertMaintenanceTask(
  token: string,
  task: Record<string, unknown>,
): Promise<SupabaseMaintenanceTask> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.upsert_maintenance_task", { p_task: task }), "upsertMaintenanceTask");
}

// ---------------------------------------------------------------------------
// Utility readings
// ---------------------------------------------------------------------------

export async function listUtilityReadings(token: string): Promise<SupabaseUtilityReading[]> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.list_utility_readings"), "listUtilityReadings");
}

export async function upsertUtilityReading(
  token: string,
  reading: Record<string, unknown>,
): Promise<SupabaseUtilityReading> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.upsert_utility_reading", { p_reading: reading }), "upsertUtilityReading");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(token: string): Promise<SupabaseSettings> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.get_settings"), "getSettings");
}

export async function upsertSettings(token: string, payload: unknown): Promise<SupabaseSettings> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.upsert_settings", { p_payload: payload }), "upsertSettings");
}

// ---------------------------------------------------------------------------
// Whole-workspace state (round-trips the client's AppData blob)
// ---------------------------------------------------------------------------

export async function getWorkspaceState(token: string): Promise<SupabaseWorkspaceState> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.get_workspace_state"), "getWorkspaceState");
}

export async function saveWorkspaceState(token: string, payload: unknown): Promise<SupabaseWorkspaceState> {
  assertConfigured();
  return unwrap(clientWithToken(token).rpc("app.save_workspace_state", { p_payload: payload }), "saveWorkspaceState");
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

export type RealtimeTable =
  | "bookings"
  | "chalets"
  | "customers"
  | "maintenance_tasks"
  | "utility_readings";

export interface RealtimeChange {
  eventType: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

/**
 * Subscribes to `postgres_changes` on a given table for the current workspace
 * and returns the Supabase channel so the caller can `.unsubscribe()` it.
 */
export function subscribeToTable(
  table: RealtimeTable,
  workspaceId: string,
  onPayload: (change: RealtimeChange) => void,
) {
  assertConfigured();
  const client = supabase;
  if (!client) throw new SupabaseDataError("Supabase client is unavailable.", "NOT_CONFIGURED");
  return client.channel(`${table}_channel`).on(
    "postgres_changes",
    { event: "*", schema: "public", table, filter: `workspace_id=eq.${workspaceId}` },
    (payload) => {
      const change: RealtimeChange = {
        eventType: String(payload.eventType),
        new: (payload.new as Record<string, unknown> | null) ?? null,
        old: (payload.old as Record<string, unknown> | null) ?? null,
      };
      onPayload(change);
    },
  ).subscribe();
}
