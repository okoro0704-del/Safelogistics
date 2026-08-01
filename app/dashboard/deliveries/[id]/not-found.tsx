import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardNotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg items-center px-4">
      <Card className="w-full text-center">
        <CardHeader>
          <CardTitle>Delivery Not Found</CardTitle>
          <CardDescription>
            We couldn&apos;t find that delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard/deliveries">Back to My Deliveries</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
