import { NextResponse } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase/env";

/** Lightweight liveness — no secrets. Includes Supabase host for deploy checks. */
export async function GET() {
  let supabaseHost: string | null = null;
  let looksLocal = false;
  try {
    const { url } = getSupabaseEnv();
    supabaseHost = new URL(url).host;
    looksLocal = /127\.0\.0\.1|localhost/i.test(url);
  } catch {
    supabaseHost = null;
  }

  return NextResponse.json(
    {
      ok: true,
      service: "safelogistics",
      supabaseHost,
      looksLocal,
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
