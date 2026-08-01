import Link from "next/link";
import { AlertCircle, Inbox, PackageSearch, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type StateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
};

export function EmptyState({
  title,
  description = "Nothing to show here yet.",
  actionLabel,
  onAction,
  href,
}: StateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div className="rounded-full bg-muted p-3 text-muted-foreground">
          <Inbox className="size-6" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        </div>
        {actionLabel && href ? (
          <Button asChild variant="outline">
            <Link href={href}>{actionLabel}</Link>
          </Button>
        ) : actionLabel && onAction ? (
          <Button type="button" variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ErrorState({
  title = "Something went wrong.",
  description = "Please try again in a moment.",
  actionLabel = "Try Again",
  onAction,
}: StateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div className="rounded-full bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="size-6" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        </div>
        {onAction ? (
          <Button type="button" variant="outline" onClick={onAction}>
            <RefreshCw className="size-4" aria-hidden />
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function NotFoundState({
  title = "Delivery Not Found",
  description = "We couldn't find a delivery with that tracking number. Please check the tracking number and try again.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div className="rounded-full bg-muted p-3 text-muted-foreground">
          <PackageSearch className="size-6" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
