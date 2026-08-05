"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, RefreshCw, ShieldCheck, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  normalizeHostname,
  txtRecordName,
  txtRecordValue,
  type CompanyDomain,
} from "@/lib/domains/normalize";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function statusVariant(status: CompanyDomain["status"]) {
  switch (status) {
    case "active":
      return "success" as const;
    case "pending":
    case "provisioning":
    case "verifying":
      return "warning" as const;
    case "failed":
      return "danger" as const;
    default:
      return "secondary" as const;
  }
}

function Mark({ ok, pending }: { ok: boolean; pending?: boolean }) {
  if (ok) return <span className="text-success">✓</span>;
  if (pending) return <span className="text-amber-600">⏳</span>;
  return <span className="text-muted-foreground">—</span>;
}

export function CompanyDomainsManager({
  companyId,
  companySlug,
  initialDomains,
}: {
  companyId: string;
  companySlug?: string;
  initialDomains: CompanyDomain[];
}) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [domains, setDomains] = useState(initialDomains);
  const [domainInput, setDomainInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [instructionsFor, setInstructionsFor] = useState<CompanyDomain | null>(
    null,
  );
  const [disableTarget, setDisableTarget] = useState<CompanyDomain | null>(
    null,
  );
  const [progressFor, setProgressFor] = useState<{
    domain: CompanyDomain;
    steps: Array<{ id: string; label: string; done: boolean; active?: boolean }>;
  } | null>(null);

  const normalizedPreview = useMemo(
    () => normalizeHostname(domainInput),
    [domainInput],
  );

  function refresh() {
    router.refresh();
  }

  function upsertDomain(next: CompanyDomain) {
    setDomains((prev) => {
      const exists = prev.some((d) => d.id === next.id);
      if (!exists) return [...prev, next];
      return prev.map((d) => (d.id === next.id ? next : d));
    });
  }

  function onAdd(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/domains`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: domainInput }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        domain?: CompanyDomain;
      };
      if (!response.ok || !payload.domain) {
        const message = payload.error ?? "Unable to add domain.";
        setError(message);
        toastError(message);
        return;
      }
      setDomainInput("");
      upsertDomain(payload.domain);
      setInstructionsFor(payload.domain);
      success("Domain added. Connect it to configure DNS.");
      refresh();
    });
  }

  function runProvision(domain: CompanyDomain) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/domains/${domain.id}/provision`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        domain?: CompanyDomain;
        manual_fallback?: boolean;
      };
      if (!response.ok || !payload.domain) {
        const message =
          payload.error ??
          "We couldn't configure DNS automatically. Please try again or use manual DNS configuration.";
        setError(message);
        toastError(message);
        return;
      }
      upsertDomain(payload.domain);
      success(payload.message ?? "Provisioning started.");
      if (payload.manual_fallback) setInstructionsFor(payload.domain);
      refresh();
    });
  }

  function runStatusCheck(domain: CompanyDomain) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/domains/${domain.id}/status`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        domain?: CompanyDomain;
        activated?: boolean;
        health?: {
          steps: Array<{
            id: string;
            label: string;
            done: boolean;
            active?: boolean;
          }>;
        };
      };
      if (!response.ok && !payload.domain) {
        const message = payload.error ?? "Unable to check domain status.";
        setError(message);
        toastError(message);
        return;
      }
      if (payload.domain) upsertDomain(payload.domain);
      if (payload.health?.steps) {
        setProgressFor({
          domain: payload.domain ?? domain,
          steps: payload.health.steps,
        });
      }
      if (payload.activated) {
        success(payload.message ?? "Domain verified successfully.");
      } else {
        success(
          payload.message ??
            "DNS changes can take several minutes to propagate.",
        );
      }
      refresh();
    });
  }

  function runPatch(
    domain: CompanyDomain,
    action: "disable" | "enable" | "set_primary",
  ) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/domains/${domain.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        domain?: CompanyDomain;
      };
      if (!response.ok || !payload.domain) {
        const message = payload.error ?? "Unable to update domain.";
        setError(message);
        toastError(message);
        return;
      }
      if (action === "set_primary") {
        setDomains((prev) =>
          prev.map((d) =>
            d.id === payload.domain!.id
              ? payload.domain!
              : { ...d, is_primary: false },
          ),
        );
      } else {
        upsertDomain(payload.domain);
      }
      success(payload.message ?? "Domain updated.");
      setDisableTarget(null);
      refresh();
    });
  }

  async function copyText(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    success(`${label} copied.`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add domain</CardTitle>
          <CardDescription>
            Connect a custom hostname. Until DNS is ready, use path preview
            {companySlug ? (
              <>
                {" "}
                (
                <a
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                  href={`/t/${companySlug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  /t/{companySlug}
                </a>
                )
              </>
            ) : null}{" "}
            on your Netlify platform URL. Automatic DNS uses the configured
            provider when available; otherwise use manual instructions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onAdd} className="space-y-3" noValidate>
            <div className="space-y-2">
              <Label htmlFor="custom-domain">Custom domain</Label>
              <Input
                id="custom-domain"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="swiftlogistics.com"
                autoComplete="off"
              />
              {normalizedPreview && normalizedPreview !== domainInput.trim() ? (
                <p className="text-xs text-muted-foreground">
                  Will be saved as{" "}
                  <span className="font-mono">{normalizedPreview}</span>
                </p>
              ) : null}
            </div>
            {error ? (
              <p
                className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending || !domainInput.trim()}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Adding…
                </>
              ) : (
                "Add Domain"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Domains</CardTitle>
          <CardDescription>
            Only active domains resolve to this tenant. Hostname routing never
            bypasses authentication or RLS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No custom domains yet.{" "}
              {companySlug ? (
                <>
                  Use{" "}
                  <a
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                    href={`/t/${companySlug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    /t/{companySlug}
                  </a>{" "}
                  on the platform host to preview this app.
                </>
              ) : (
                "The platform path preview continues to work."
              )}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {domains.map((domain) => {
                const dnsOk =
                  domain.dns_status === "configured" ||
                  domain.dns_status === "manual" ||
                  domain.status === "active";
                const ownershipOk = Boolean(domain.verified_at);
                const appOk = domain.status === "active";
                const sslOk =
                  domain.ssl_status === "ready" || domain.status === "active";

                return (
                  <li
                    key={domain.id}
                    className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono font-medium">
                            {domain.normalized_domain}
                          </p>
                          <Badge variant={statusVariant(domain.status)}>
                            {domain.status}
                          </Badge>
                          {domain.is_primary ? (
                            <Badge variant="outline">Primary</Badge>
                          ) : null}
                        </div>
                        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                          <p>
                            <Mark
                              ok={dnsOk}
                              pending={
                                domain.status === "provisioning" ||
                                domain.status === "verifying"
                              }
                            />{" "}
                            DNS
                          </p>
                          <p>
                            <Mark
                              ok={ownershipOk}
                              pending={domain.status === "verifying"}
                            />{" "}
                            Ownership
                          </p>
                          <p>
                            <Mark ok={appOk} /> Application
                          </p>
                          <p>
                            <Mark
                              ok={sslOk}
                              pending={domain.ssl_status === "provisioning"}
                            />{" "}
                            SSL
                          </p>
                        </div>
                        {domain.last_error ? (
                          <p className="text-xs text-destructive" role="alert">
                            {domain.last_error}
                          </p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          Created {formatDate(domain.created_at)}
                          {domain.verified_at
                            ? ` · Verified ${formatDate(domain.verified_at)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(domain.status === "pending" ||
                          domain.status === "failed") && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => runProvision(domain)}
                          >
                            <Zap className="size-4" aria-hidden />
                            {domain.status === "failed"
                              ? "Retry"
                              : "Connect Domain"}
                          </Button>
                        )}
                        {(domain.status === "provisioning" ||
                          domain.status === "verifying" ||
                          domain.status === "pending") && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => runStatusCheck(domain)}
                          >
                            <RefreshCw className="size-4" aria-hidden />
                            Check Status
                          </Button>
                        )}
                        {domain.status !== "active" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setInstructionsFor(domain)}
                          >
                            Manual Instructions
                          </Button>
                        ) : null}
                        {domain.status === "verifying" ||
                        domain.status === "pending" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => runStatusCheck(domain)}
                          >
                            <ShieldCheck className="size-4" aria-hidden />
                            Verify
                          </Button>
                        ) : null}
                        {domain.status === "active" ? (
                          <>
                            {!domain.is_primary ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() =>
                                  runPatch(domain, "set_primary")
                                }
                              >
                                Set as Primary
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => setDisableTarget(domain)}
                            >
                              Disable
                            </Button>
                          </>
                        ) : null}
                        {domain.status === "disabled" ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => runPatch(domain, "enable")}
                          >
                            Enable Domain
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(instructionsFor)}
        onOpenChange={(open) => !open && setInstructionsFor(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              DNS instructions · {instructionsFor?.normalized_domain}
            </DialogTitle>
            <DialogDescription>
              Add these records at your DNS provider if automatic setup is
              unavailable. DNS changes can take several minutes to propagate.
            </DialogDescription>
          </DialogHeader>
          {instructionsFor ? (
            <div className="space-y-3 text-sm">
              {(
                [
                  ["Type", "TXT"],
                  ["Name / Host", txtRecordName()],
                  [
                    "Value",
                    txtRecordValue(instructionsFor.verification_token),
                  ],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-md border border-border bg-muted/40 p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => copyText(label, value)}
                    >
                      <Copy className="size-3.5" aria-hidden />
                      Copy
                    </Button>
                  </div>
                  <p className="break-all font-mono text-xs">{value}</p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Also point the hostname at your application target (
                <code className="font-mono">CUSTOM_DOMAIN_TARGET</code>) with a
                CNAME (or ALIAS at apex).
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setInstructionsFor(null)}
            >
              Close
            </Button>
            {instructionsFor ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  const target = instructionsFor;
                  setInstructionsFor(null);
                  runStatusCheck(target);
                }}
              >
                Check Status
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(progressFor)}
        onOpenChange={(open) => !open && setProgressFor(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connecting domain…</DialogTitle>
            <DialogDescription>
              {progressFor?.domain.normalized_domain}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {progressFor?.steps.map((step) => (
              <li
                key={step.id}
                className={cn(
                  "flex items-center gap-2",
                  step.done ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.done ? (
                  <span className="text-success">✓</span>
                ) : step.active ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <span>—</span>
                )}
                {step.label}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" onClick={() => setProgressFor(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(disableTarget)}
        onOpenChange={(open) => !open && setDisableTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Disable {disableTarget?.normalized_domain}?
            </DialogTitle>
            <DialogDescription>
              Users will no longer access this company through this domain.
              Provider-managed DNS records created by the platform are removed
              where possible. Re-enabling requires fresh ownership verification.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDisableTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !disableTarget}
              onClick={() =>
                disableTarget && runPatch(disableTarget, "disable")
              }
            >
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
