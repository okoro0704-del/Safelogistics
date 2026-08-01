"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CompanyFilters({
  search,
  status,
}: {
  search: string;
  status: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(search);
  const [statusValue, setStatusValue] = useState(status);

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      { value: "active", label: "Active" },
      { value: "suspended", label: "Suspended" },
    ],
    [],
  );

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    if (statusValue && statusValue !== "all") params.set("status", statusValue);
    else params.delete("status");
    params.delete("billing");
    router.push(`/master-admin/companies?${params.toString()}`);
  }

  return (
    <form
      onSubmit={apply}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end"
    >
      <div className="flex-1 space-y-2">
        <Label htmlFor="company-search">Search</Label>
        <Input
          id="company-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Company name or slug"
        />
      </div>
      <div className="space-y-2 sm:w-48">
        <Label htmlFor="company-status">Status</Label>
        <select
          id="company-status"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={statusValue}
          onChange={(e) => setStatusValue(e.target.value)}
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit">Filter</Button>
      <Button asChild type="button" variant="outline">
        <Link href="/master-admin/companies">Clear</Link>
      </Button>
    </form>
  );
}
