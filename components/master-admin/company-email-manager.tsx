"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

type EmailDomain = {
  id: string;
  domain: string;
  normalized_domain: string;
  status: string;
  resend_domain_id: string | null;
  last_error: string | null;
};

type Mailbox = {
  id: string;
  full_address: string;
  local_part: string;
  is_default: boolean;
};

type CompanyDomainOption = {
  id: string;
  normalized_domain: string;
  status: string;
};

export function CompanyEmailManager({
  companyId,
  companyDomains,
}: {
  companyId: string;
  companyDomains: CompanyDomainOption[];
}) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [domains, setDomains] = useState<EmailDomain[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedDomain, setSelectedDomain] = useState(
    companyDomains.find((d) => d.status === "active")?.normalized_domain ??
      companyDomains[0]?.normalized_domain ??
      "",
  );
  const [error, setError] = useState<string | null>(null);
  const [dnsHint, setDnsHint] = useState<
    Array<{ type: string; name: string; value: string }>
  >([]);

  function load() {
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/email`,
      );
      const payload = (await response.json()) as {
        error?: string;
        domains?: EmailDomain[];
        mailboxes?: Mailbox[];
      };
      if (!response.ok) {
        setError(payload.error ?? "Unable to load email settings.");
        return;
      }
      setDomains(payload.domains ?? []);
      setMailboxes(payload.mailboxes ?? []);
      setError(null);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function onProvision() {
    if (!selectedDomain) return;
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "provision",
            domain: selectedDomain,
          }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        records?: Array<{ type: string; name: string; value: string }>;
      };
      if (!response.ok) {
        const message = payload.error ?? "Unable to provision email.";
        setError(message);
        toastError(message);
        return;
      }
      setDnsHint(payload.records ?? []);
      success(payload.message ?? "Email domain provisioned.");
      load();
      router.refresh();
    });
  }

  function onVerify(emailDomainId: string) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "verify",
            email_domain_id: emailDomainId,
          }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        status?: string;
        records?: Array<{ type: string; name: string; value: string }>;
      };
      if (!response.ok) {
        const message = payload.error ?? "Unable to verify email domain.";
        setError(message);
        toastError(message);
        return;
      }
      setDnsHint(payload.records ?? []);
      success(
        payload.status === "verified"
          ? "Email domain verified."
          : "Still pending DNS verification.",
      );
      load();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Resend email domain</CardTitle>
          <CardDescription>
            Provision MX/SPF/DKIM via Resend and push records to Namecheap when
            the registrar is configured. Inbound mail lands in the tenant Admin
            inbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email-domain">Domain</Label>
            <select
              id="email-domain"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
            >
              <option value="">Select a company domain</option>
              {companyDomains.map((d) => (
                <option key={d.id} value={d.normalized_domain}>
                  {d.normalized_domain}
                  {d.status === "active" ? " (active)" : ` (${d.status})`}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            onClick={onProvision}
            disabled={pending || !selectedDomain}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Provision with Resend
          </Button>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email domains</CardTitle>
        </CardHeader>
        <CardContent>
          {domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No email domains yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {domains.map((domain) => (
                <li
                  key={domain.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-mono text-sm">{domain.normalized_domain}</p>
                    {domain.last_error ? (
                      <p className="text-xs text-destructive">
                        {domain.last_error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        domain.status === "verified"
                          ? "success"
                          : domain.status === "failed"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {domain.status}
                    </Badge>
                    {domain.status !== "verified" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => onVerify(domain.id)}
                      >
                        Verify
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mailboxes</CardTitle>
          <CardDescription>
            App inbox addresses receive mail into `/admin/inbox`.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mailboxes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mailboxes yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {mailboxes.map((box) => (
                <li key={box.id} className="font-mono">
                  {box.full_address}
                  {box.is_default ? " (default)" : ""}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {dnsHint.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>DNS records</CardTitle>
            <CardDescription>
              Applied automatically when Namecheap DNS is available; otherwise
              add these manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {dnsHint.map((row, index) => (
              <div
                key={`${row.type}-${row.name}-${index}`}
                className="rounded-md border border-border p-2 font-mono text-xs"
              >
                <p>
                  {row.type} {row.name}
                </p>
                <p className="break-all text-muted-foreground">{row.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
