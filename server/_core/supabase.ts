import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Lazily-built anon-key Supabase client. Email OTP (signInWithOtp / verifyOtp)
 *  is delivered by Supabase Auth using the SMTP configured in the dashboard. */
let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured");
  }
  cachedClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return cachedClient;
}
