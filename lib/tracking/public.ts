import type { PublicTrackingResult } from "@/lib/types/database";
import { normalizeTrackingNumber } from "@/lib/utils";

/**
 * Public tracking via rate-limited server API.
 * Company scope is derived from hostname on the server — never pass company_id.
 */
export async function fetchPublicTracking(
  trackingNumber: string,
): Promise<PublicTrackingResult> {
  const response = await fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tracking_number: normalizeTrackingNumber(trackingNumber),
    }),
  });

  const payload = (await response.json()) as PublicTrackingResult & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Unable to look up tracking number.");
  }

  return payload;
}
