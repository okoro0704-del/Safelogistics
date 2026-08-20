import { createClient as createServiceClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";

/** Server-only Supabase client. Never import from client components. */
export function createServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  const { url } = getSupabaseEnv();
  return createServiceClient(url, serviceRoleKey, {
    db: { schema: "pm" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
