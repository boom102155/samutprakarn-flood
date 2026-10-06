import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null | undefined;

/** Server-only Supabase client. Never import this module into client components. */
export function getSupabaseAdmin() {
  if (adminClient !== undefined) return adminClient;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  adminClient = url && serviceRoleKey
    ? createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    : null;

  return adminClient;
}
