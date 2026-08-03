import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/service";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isLocalSupabaseUrl(url: string) {
  return /127\.0\.0\.1|localhost/i.test(url);
}

async function masterAdminCount(
  service: ReturnType<typeof createServiceRoleClient>,
) {
  const { count, error } = await service
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "master_admin");
  if (error) throw error;
  return count ?? 0;
}

/** Public: whether first-time Master Admin setup is still available. */
export async function GET() {
  try {
    const { url } = getSupabaseEnv();
    const service = createServiceRoleClient();
    const masters = await masterAdminCount(service);
    return NextResponse.json({
      setupAvailable: masters === 0,
      supabaseHost: new URL(url).host,
      misconfiguredLocal:
        process.env.NETLIFY === "true" && isLocalSupabaseUrl(url),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bootstrap status unavailable.";
    return NextResponse.json(
      { setupAvailable: false, error: message },
      { status: 500 },
    );
  }
}

type Body = {
  email?: string;
  password?: string;
  fullName?: string;
  bootstrapSecret?: string;
};

/**
 * One-time Master Admin bootstrap via Auth Admin API.
 * Allowed when zero master_admin profiles exist, OR when
 * MASTER_BOOTSTRAP_SECRET matches (password repair).
 */
export async function POST(request: Request) {
  try {
    const { url } = getSupabaseEnv();
    if (process.env.NETLIFY === "true" && isLocalSupabaseUrl(url)) {
      return NextResponse.json(
        {
          error:
            "Netlify is still using a localhost Supabase URL. Set NEXT_PUBLIC_SUPABASE_URL to https://YOUR_PROJECT.supabase.co (and matching anon + service_role keys), then redeploy.",
        },
        { status: 500 },
      );
    }

    const body = (await request.json()) as Body;
    const forceSecret = process.env.MASTER_BOOTSTRAP_SECRET?.trim();
    const force =
      Boolean(forceSecret) &&
      Boolean(body.bootstrapSecret) &&
      body.bootstrapSecret === forceSecret;

    const service = createServiceRoleClient();
    const masters = await masterAdminCount(service);
    if (masters > 0 && !force) {
      return NextResponse.json(
        {
          error:
            "A Master Admin already exists. Sign in at /hub/login, reset the password in Supabase → Authentication → Users, or delete the master profile row and reuse /hub/setup. Optional: set MASTER_BOOTSTRAP_SECRET in Netlify to force a password repair.",
        },
        { status: 403 },
      );
    }
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.fullName ?? "Platform Master").trim() ||
      "Platform Master";

    if (!email || !email.includes("@") || email.endsWith(".local")) {
      return NextResponse.json(
        {
          error:
            "Use a normal email (not *.local). Example: master@safelogistics.app",
        },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    let userId: string | null = null;

    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (created.error) {
      const msg = created.error.message.toLowerCase();
      const exists =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists");

      if (!exists) {
        return NextResponse.json(
          { error: created.error.message },
          { status: 400 },
        );
      }

      // User exists in Auth — reset password + confirm email via Admin API
      const listed = await service.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (listed.error) {
        return NextResponse.json(
          { error: listed.error.message },
          { status: 400 },
        );
      }
      const existing = listed.data.users.find(
        (u) => u.email?.toLowerCase() === email,
      );
      if (!existing) {
        return NextResponse.json(
          {
            error:
              "That email exists in Auth but could not be loaded. Reset the password in Supabase → Authentication → Users, then try again.",
          },
          { status: 400 },
        );
      }

      const updated = await service.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (updated.error) {
        return NextResponse.json(
          { error: updated.error.message },
          { status: 400 },
        );
      }
      userId = existing.id;
    } else {
      userId = created.data.user?.id ?? null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Auth user was not created." },
        { status: 500 },
      );
    }

    // Trigger blocks role changes on UPDATE — delete then insert
    await service.from("profiles").delete().eq("id", userId);

    const { error: profileError } = await service.from("profiles").insert({
      id: userId,
      email,
      full_name: fullName,
      role: "master_admin",
      company_id: null,
    });

    if (profileError) {
      return NextResponse.json(
        {
          error: `Auth user ready, but profile failed: ${profileError.message}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      email,
      message: "Master Admin created. Sign in at /hub/login.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bootstrap failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
