import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

/** True when both Supabase env vars are configured. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const BASE_OPTIONS = {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
};

// The client is created lazily and only when configured. `createClient` throws
// at construction when the URL is empty, so we guard it to remain import-safe
// in environments without the env vars (e.g. unit tests, tooling).
let _client: SupabaseClient<any, "public", any> | null = null;

function getOrCreateClient(): SupabaseClient<any, "public", any> | null {
  if (!isSupabaseConfigured) return null;
  if (!_client) _client = createClient(supabaseUrl, supabaseAnonKey, BASE_OPTIONS);
  return _client;
}

/**
 * The shared Supabase client. Null when the env vars are not configured — all
 * callers MUST gate on {@link isSupabaseConfigured} (or `app` helpers) before
 * using it.
 */
export const supabase: SupabaseClient<any, "public", any> | null = getOrCreateClient();
