import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DashboardStats } from "@/lib/types/database";

export function DashboardStatsCards({ stats }: { stats: DashboardStats }) {
  const active =
    stats.pending + stats.inTransit + stats.atStop + stats.delayed;

  const cards = [
    {
      label: "Total Deliveries",
      value: stats.totalDeliveries,
      hint: "All company shipments",
    },
    {
      label: "Active",
      value: active,
      hint: "Pending, in transit, at stop, or delayed",
    },
    {
      label: "In Transit",
      value: stats.inTransit,
      hint: "Actively moving",
    },
    {
      label: "Delivered",
      value: stats.delivered,
      hint: "Completed successfully",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="pb-2">
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{card.value}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{card.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
