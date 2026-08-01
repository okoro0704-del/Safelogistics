import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { CustomerWithStats } from "@/lib/types/database";

export function CustomerTable({ customers }: { customers: CustomerWithStats[] }) {
  if (customers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
        <h2 className="text-base font-semibold">No customers yet.</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Create your first customer to start assigning deliveries.
        </p>
        <Button asChild className="mt-4">
          <Link href="/admin/customers/new">Create Customer</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Deliveries</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr
                key={customer.id}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-3 font-medium">{customer.full_name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {customer.email}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {customer.phone || "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {customer.delivery_count}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(customer.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/customers/${customer.id}`}>View</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
