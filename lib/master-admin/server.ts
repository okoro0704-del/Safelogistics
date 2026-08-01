import { randomBytes } from "crypto";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export { createServiceRoleClient };

export function generateTemporaryPassword() {
  return `Tmp-${randomBytes(9).toString("base64url")}`;
}

export async function requireMasterAdminApi() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const { data: isMaster, error } = await supabase.rpc("is_master_admin");
  if (error || !isMaster) {
    return {
      ok: false as const,
      status: 403,
      error: "Only the platform Master Admin can perform this action.",
    };
  }

  return { ok: true as const, supabase, user };
}
