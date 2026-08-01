import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CustomerDeliveryStats } from "@/lib/customer/queries";

const cards: Array<{
  key: keyof CustomerDeliveryStats;
  label: string;
  hint: string;
}> = [
  { key: "active", label: "Active Deliveries", hint: "In progress or pending" },
  { key: "delivered", label: "Delivered", hint: "Completed shipments" },
  { key: "total", label: "Total Deliveries", hint: "All of your shipments" },
];

export function CustomerStats({ stats }: { stats: CustomerDeliveryStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardHeader className="pb-2">
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {stats[card.key]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{card.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
