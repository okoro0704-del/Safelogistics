// Create a customer Auth user + profile.
// Uses the service role ONLY on the server (Edge Function).
// Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type CreateCustomerBody = {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Caller-scoped client (respects JWT / RLS)
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: isAdmin, error: adminCheckError } = await callerClient.rpc(
      "is_admin",
    );

    if (adminCheckError || !isAdmin) {
      return jsonResponse(
        { error: "Only company admins can create customers" },
        403,
      );
    }

    const body = (await req.json()) as CreateCustomerBody;
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const fullName = body.full_name?.trim();
    const phone = body.phone?.trim() || null;

    if (!email || !password || !fullName) {
      return jsonResponse(
        { error: "email, password, and full_name are required" },
        400,
      );
    }

    if (password.length < 8) {
      return jsonResponse(
        { error: "password must be at least 8 characters" },
        400,
      );
    }

    // Privileged client — server only
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (createError || !created.user) {
      return jsonResponse(
        { error: createError?.message ?? "Failed to create auth user" },
        400,
      );
    }

    // Attach profile under the caller's company (uses caller's JWT)
    const { data: profile, error: profileError } = await callerClient.rpc(
      "admin_register_customer_profile",
      {
        p_user_id: created.user.id,
        p_full_name: fullName,
        p_email: email,
        p_phone: phone,
      },
    );

    if (profileError) {
      // Best-effort rollback of the Auth user if profile creation fails
      await adminClient.auth.admin.deleteUser(created.user.id);
      return jsonResponse(
        { error: profileError.message ?? "Failed to create customer profile" },
        400,
      );
    }

    return jsonResponse({
      user_id: created.user.id,
      email,
      profile,
      message:
        "Customer created. Share the credentials with the customer securely.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
