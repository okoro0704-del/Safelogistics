import Link from "next/link";

import { DeliveryStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import type { DeliveryWithRelations } from "@/lib/types/database";

export function DeliveryTable({
  deliveries,
  emptyTitle = "No deliveries found.",
  emptyDescription = "Create a delivery to begin tracking shipments.",
  emptyActionHref = "/admin/deliveries/new",
  emptyActionLabel = "Create Delivery",
}: {
  deliveries: DeliveryWithRelations[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionHref?: string;
  emptyActionLabel?: string;
}) {
  if (deliveries.length === 0) {
    return (
      <DeliveryEmptyWithLink
        title={emptyTitle}
        description={emptyDescription}
        href={emptyActionHref}
        label={emptyActionLabel}
      />
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {deliveries.map((delivery) => (
          <article
            key={delivery.id}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/admin/deliveries/${delivery.id}`}
                className="font-mono text-sm font-semibold text-primary hover:underline"
              >
                {delivery.tracking_number}
              </Link>
              <DeliveryStatusBadge status={delivery.status} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {delivery.origin_name} → {delivery.destination_name}
            </p>
            <p className="mt-1 text-sm">
              <span className="text-muted-foreground">Current: </span>
              {delivery.current_stop?.name ?? "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Updated {formatRelativeTime(delivery.updated_at)}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3 w-full">
              <Link href={`/admin/deliveries/${delivery.id}`}>View</Link>
            </Button>
          </article>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Tracking</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 font-medium">Current</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr
                  key={delivery.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium md:text-sm">
                    <Link
                      href={`/admin/deliveries/${delivery.id}`}
                      className="text-primary hover:underline"
                    >
                      {delivery.tracking_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {delivery.customer?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {delivery.origin_name} → {delivery.destination_name}
                  </td>
                  <td className="px-4 py-3">
                    {delivery.current_stop?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <DeliveryStatusBadge status={delivery.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span title={formatDateTime(delivery.updated_at)}>
                      {formatRelativeTime(delivery.updated_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/deliveries/${delivery.id}`}>
                        View
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function DeliveryEmptyWithLink({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      <Button asChild className="mt-4">
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}
