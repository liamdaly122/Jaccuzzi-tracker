// =============================================================================
//  lib/supabase.ts
//  Server-ONLY Supabase client using the service_role key.
//
//  The `server-only` import below makes the build FAIL if this file is ever
//  imported into a client component — that guard is what keeps the secret key
//  out of the browser (and is why we can safely skip Row Level Security).
// =============================================================================

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "in your Vercel project's Environment Variables (see README.md).",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
