import { NextResponse } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase/env";

/** Lightweight liveness — no secrets. Includes Supabase host for deploy checks. */
export async function GET() {
  let supabaseHost: string | null = null;
  let looksLocal = false;
  let supabaseUrlNormalized: string | null = null;
  let hadExtraPath = false;
  try {
    const { url, rawUrl } = getSupabaseEnv();
    supabaseHost = new URL(url).host;
    supabaseUrlNormalized = url;
    looksLocal = /127\.0\.0\.1|localhost/i.test(url);
    try {
      const p = new URL(rawUrl.trim()).pathname.replace(/\/+$/, "");
      hadExtraPath = Boolean(p && p !== "/");
    } catch {
      hadExtraPath = false;
    }
  } catch {
    supabaseHost = null;
  }

  return NextResponse.json(
    {
      ok: true,
      service: "parcel-movement",
      supabaseHost,
      supabaseUrlNormalized,
      looksLocal,
      hadExtraPath,
      netlify: process.env.NETLIFY === "true",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
