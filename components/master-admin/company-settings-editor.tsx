"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  COMPANY_CURRENCIES,
  COMPANY_TIMEZONES,
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  type CompanySettingsRow,
} from "@/lib/company-settings";

export function CompanySettingsEditor({
  companyId,
  companyName,
  initial,
}: {
  companyId: string;
  companyName: string;
  initial: CompanySettingsRow | null;
}) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [timezone, setTimezone] = useState(
    initial?.timezone ?? DEFAULT_TIMEZONE,
  );
  const [currency, setCurrency] = useState(
    initial?.currency ?? DEFAULT_CURRENCY,
  );
  const [supportEmail, setSupportEmail] = useState(
    initial?.support_email ?? "",
  );
  const [supportPhone, setSupportPhone] = useState(
    initial?.support_phone ?? "",
  );
  const [websiteUrl, setWebsiteUrl] = useState(initial?.website_url ?? "");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timezone,
            currency,
            support_email: supportEmail,
            support_phone: supportPhone,
            website_url: websiteUrl,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        const message = payload.error ?? "Unable to save company settings.";
        setError(message);
        toastError(message);
        return;
      }
      success("Company settings saved.");
      router.refresh();
    });
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>App settings</CardTitle>
        <CardDescription>
          Operational configuration for {companyName}. Visual branding is
          managed separately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="settings-timezone">Timezone</Label>
              <select
                id="settings-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {COMPANY_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
                {timezone &&
                !(COMPANY_TIMEZONES as readonly string[]).includes(timezone) ? (
                  <option value={timezone}>{timezone}</option>
                ) : null}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-currency">Currency</Label>
              <select
                id="settings-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {COMPANY_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-support-email">Support email</Label>
            <Input
              id="settings-support-email"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-support-phone">Support phone</Label>
            <Input
              id="settings-support-phone"
              type="tel"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-website">Website</Label>
            <Input
              id="settings-website"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://"
            />
          </div>
          {error ? (
            <p
              className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Save settings"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
