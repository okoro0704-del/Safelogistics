"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

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
import { normalizeHostname, type CompanyDomain } from "@/lib/domains/normalize";

type SearchResult = {
  domain: string;
  available: boolean;
  premium?: boolean;
  priceCents?: number | null;
  currency?: string;
  error?: string | null;
};

function formatRegistrarPrice(cents: number | null | undefined, currency = "USD") {
  if (cents == null) return "Available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function BuyDomainPanel({
  companyId,
  onPurchased,
}: {
  companyId: string;
  onPurchased: (domain: CompanyDomain) => void;
}) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [years, setYears] = useState(1);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSelected(null);
    const domain = normalizeHostname(query);
    if (!domain) {
      setError("Enter a domain such as example.com");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/master-admin/domains/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const payload = (await response.json()) as {
        error?: string;
        results?: SearchResult[];
      };
      if (!response.ok) {
        const message = payload.error ?? "Unable to search domains.";
        setError(message);
        toastError(message);
        return;
      }
      setResults(payload.results ?? []);
      const first = payload.results?.[0] ?? null;
      if (first?.available) setSelected(first);
    });
  }

  function onPurchase() {
    if (!selected?.available) return;
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/domains/purchase`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain: selected.domain,
            years,
          }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        domain?: CompanyDomain;
      };
      if (!response.ok || !payload.domain) {
        const message = payload.error ?? "Unable to purchase domain.";
        setError(message);
        toastError(message);
        return;
      }
      success(payload.message ?? "Domain purchased.");
      onPurchased(payload.domain);
      setQuery("");
      setResults([]);
      setSelected(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buy domain</CardTitle>
        <CardDescription>
          Search and register via Namecheap on the platform account, then attach
          the hostname to Netlify automatically. Prefer the free managed
          subdomain ({`{slug}.apps.webfinance.app`}) when available.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={onSearch}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-2">
            <Label htmlFor="buy-domain">Domain</Label>
            <Input
              id="buy-domain"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="acmelogistics.com"
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={pending || !query.trim()} variant="outline">
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Search className="size-4" aria-hidden />
            )}
            Search
          </Button>
        </form>

        {results.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {results.map((row) => (
              <li
                key={row.domain}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-mono font-medium">{row.domain}</p>
                  <p className="text-muted-foreground">
                    {row.available
                      ? formatRegistrarPrice(row.priceCents, row.currency ?? "USD")
                      : row.error || "Unavailable"}
                    {row.premium ? " · Premium" : ""}
                  </p>
                </div>
                {row.available ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={selected?.domain === row.domain ? "default" : "outline"}
                    onClick={() => setSelected(row)}
                    disabled={pending}
                  >
                    {selected?.domain === row.domain ? "Selected" : "Select"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {selected?.available ? (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <div className="space-y-2">
              <Label htmlFor="buy-years">Years</Label>
              <Input
                id="buy-years"
                type="number"
                min={1}
                max={10}
                value={years}
                onChange={(e) => setYears(Number(e.target.value) || 1)}
              />
            </div>
            <Button type="button" onClick={onPurchase} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Purchasing…
                </>
              ) : (
                `Purchase ${selected.domain}`
              )}
            </Button>
          </div>
        ) : null}

        {error ? (
          <p
            className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
