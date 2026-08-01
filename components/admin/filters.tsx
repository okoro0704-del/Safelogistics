"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DELIVERY_STATUSES, formatDeliveryStatus } from "@/lib/format";
import type { DeliveryStatus } from "@/lib/types/database";

export function DeliveryFilters({
  search,
  status,
}: {
  search?: string;
  status?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [localSearch, setLocalSearch] = useState(search ?? "");
  const [localStatus, setLocalStatus] = useState(status ?? "all");

  const hasFilters = useMemo(
    () => Boolean(localSearch.trim()) || (localStatus && localStatus !== "all"),
    [localSearch, localStatus],
  );

  function applyFilters(nextSearch: string, nextStatus: string) {
    const params = new URLSearchParams();
    if (nextSearch.trim()) params.set("q", nextSearch.trim());
    if (nextStatus && nextStatus !== "all") params.set("status", nextStatus);
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_14rem_auto_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        applyFilters(localSearch, localStatus);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="delivery-search">Search</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="delivery-search"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder="Tracking number or customer name"
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="delivery-status">Status</Label>
        <select
          id="delivery-status"
          value={localStatus}
          onChange={(event) => setLocalStatus(event.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
        >
          <option value="all">All statuses</option>
          {DELIVERY_STATUSES.map((value) => (
            <option key={value} value={value}>
              {formatDeliveryStatus(value as DeliveryStatus)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Filtering…" : "Apply"}
        </Button>
        {hasFilters ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setLocalSearch("");
              setLocalStatus("all");
              applyFilters("", "all");
            }}
          >
            <X className="size-4" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function CustomerSearch({ search }: { search?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(search ?? "");

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();
        if (value.trim()) params.set("q", value.trim());
        const query = params.toString();
        startTransition(() => {
          router.push(query ? `${pathname}?${query}` : pathname);
        });
      }}
    >
      <div className="flex-1 space-y-2">
        <Label htmlFor="customer-search">Search customers</Label>
        <Input
          id="customer-search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Name or email"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Searching…" : "Search"}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setValue("");
              startTransition(() => router.push(pathname));
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  );
}
