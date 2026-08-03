/**
 * Normalize project URL to origin only.
 * Values like https://xxx.supabase.co/rest/v1 break Auth Admin paths
 * ("Invalid path specified in request URL").
 */
export function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not a valid URL. Use https://YOUR_PROJECT_REF.supabase.co with no /rest/v1 path.",
    );
  }

  const origin = parsed.origin;
  if (!origin || origin === "null") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be an absolute https://…supabase.co URL.",
    );
  }

  return origin;
}

export function getSupabaseEnv() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!rawUrl || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local.",
    );
  }

  const url = normalizeSupabaseUrl(rawUrl);

  return { url, anonKey, rawUrl };
}
