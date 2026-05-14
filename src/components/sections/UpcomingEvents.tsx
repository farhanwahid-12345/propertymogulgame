import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Hammer, Receipt, Gavel } from "lucide-react";
import type { PendingEviction, PlanningApplication, EntityType } from "@/types/game";

interface Props {
  monthsPlayed: number;
  entityType: EntityType;
  pendingEvictions: PendingEviction[];
  planningApplications: PlanningApplication[];
  lastCorporationTaxMonth: number;
}

interface Row {
  icon: React.ReactNode;
  title: string;
  detail: string;
  monthsAway: number;
}

function monthLabel(n: number): string {
  if (n <= 0) return "Now";
  if (n === 1) return "Next month";
  return `In ${n} months`;
}

export function UpcomingEvents({
  monthsPlayed,
  entityType,
  pendingEvictions,
  planningApplications,
  lastCorporationTaxMonth,
}: Props) {
  const rows: Row[] = [];

  // Tax cycle — UK income tax on Jan 31 (~month 10 of year cycle), corp tax 9 months after year-end
  const monthInYear = monthsPlayed % 12;
  if (entityType === 'sole_trader') {
    // Self-Assessment: Jan 31 ≈ month 10
    const due = (10 - monthInYear + 12) % 12;
    rows.push({
      icon: <Receipt className="h-4 w-4 text-amber-400" />,
      title: "Self-Assessment due",
      detail: "Income tax + payment on account",
      monthsAway: due === 0 ? 12 : due,
    });
  } else {
    const lastTaxYear = Math.floor(lastCorporationTaxMonth / 12);
    const currentYear = Math.floor(monthsPlayed / 12);
    const dueYear = lastTaxYear >= currentYear ? currentYear + 1 : currentYear;
    const dueMonth = dueYear * 12;
    rows.push({
      icon: <Receipt className="h-4 w-4 text-amber-400" />,
      title: "Corporation tax filing",
      detail: "Annual profit assessment",
      monthsAway: Math.max(0, dueMonth - monthsPlayed),
    });
  }

  // Pending evictions (effective month)
  pendingEvictions
    .filter(e => e.effectiveMonth > monthsPlayed)
    .slice(0, 3)
    .forEach(e => rows.push({
      icon: <Gavel className="h-4 w-4 text-red-400" />,
      title: `Eviction: ${e.tenantName}`,
      detail: e.ground.replace(/_/g, ' '),
      monthsAway: e.effectiveMonth - monthsPlayed,
    }));

  // Planning decisions
  planningApplications
    .filter(a => a.status === 'pending' && a.decisionMonth > monthsPlayed)
    .slice(0, 3)
    .forEach(a => rows.push({
      icon: <Hammer className="h-4 w-4 text-sky-400" />,
      title: `Planning: ${a.renovationName}`,
      detail: `${Math.round(a.approvalProb * 100)}% approval estimate`,
      monthsAway: a.decisionMonth - monthsPlayed,
    }));

  rows.sort((a, b) => a.monthsAway - b.monthsAway);

  return (
    <Card className="glass border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          Upcoming Events
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No scheduled events. The diary is clear.</p>
        ) : rows.slice(0, 6).map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-white/[0.04] border border-white/5">
            <div className="flex items-center gap-2 min-w-0">
              {r.icon}
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{r.title}</div>
                <div className="text-[11px] text-muted-foreground truncate capitalize">{r.detail}</div>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] whitespace-nowrap">
              {monthLabel(r.monthsAway)}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
