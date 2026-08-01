/**
 * In-memory cooldown for domain infrastructure operations (per domain id).
 */

const attempts = new Map<string, number>();
const COOLDOWN_MS = 30_000;

export function canAttemptDomainAction(domainId: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const last = attempts.get(domainId);
  if (!last) return { allowed: true };
  const elapsed = Date.now() - last;
  if (elapsed >= COOLDOWN_MS) return { allowed: true };
  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((COOLDOWN_MS - elapsed) / 1000),
  };
}

export function recordDomainActionAttempt(domainId: string) {
  attempts.set(domainId, Date.now());
}

/** @deprecated use canAttemptDomainAction */
export const canAttemptVerification = canAttemptDomainAction;
/** @deprecated use recordDomainActionAttempt */
export const recordVerificationAttempt = recordDomainActionAttempt;
