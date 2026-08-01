import { NextResponse } from "next/server";

/** Lightweight liveness — no secrets or dependency details. */
export async function GET() {
  return NextResponse.json(
    { ok: true, service: "routeledger" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
