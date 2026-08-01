"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CustomerDeliverySearch({ search }: { search?: string }) {
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
        <Label htmlFor="customer-delivery-search">Search by tracking number</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="customer-delivery-search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="DLV-2026-000001"
            className="pl-9 font-mono uppercase"
          />
        </div>
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
