import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  Users,
  Hammer,
  Banknote,
  TrendingUp,
  AlertTriangle,
  Home,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fromPennies } from "@/lib/formatCurrency";
import type {
  TenantDeparture,
  TenantEvent,
  MacroEconomicEvent,
  Renovation,
  Conveyancing,
  TaxRecord,
} from "@/types/game";

type Category = "all" | "tenants" | "property" | "finance" | "market";

interface ActivityFeedProps {
  monthsPlayed: number;
  tenantHistory?: TenantDeparture[];
  tenantEvents?: Array<TenantEvent & { amount: number }>; // amount may already be pounds via wrapper
  economicEvents?: MacroEconomicEvent[];
  renovations?: Renovation[];
  conveyancing?: Conveyancing[];
  taxRecords?: TaxRecord[];
  ownedProperties?: Array<{ id: string; name: string }>;
}

interface FeedItem {
  id: string;
  month: number;
  category: Exclude<Category, "all">;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  detail?: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  all: "All",
  tenants: "Tenants",
  property: "Property",
  finance: "Finance",
  market: "Market",
};

export function ActivityFeed({
  monthsPlayed,
  tenantHistory = [],
  tenantEvents = [],
  economicEvents = [],
  renovations = [],
  conveyancing = [],
  taxRecords = [],
  ownedProperties = [],
}: ActivityFeedProps) {
  const [filter, setFilter] = useState<Category>("all");

  const propName = (id: string) =>
    ownedProperties.find(p => p.id === id)?.name || "property";

  const items = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];

    // Tenant departures
    tenantHistory.forEach(d => {
      const reasonLabel =
        d.reason === "eviction_completed"
          ? `Evicted (${d.detail || "notice expired"})`
          : d.reason === "low_satisfaction"
          ? `Moved out — low satisfaction`
          : `Tenancy ended`;
      out.push({
        id: `td_${d.id}`,
        month: d.month,
        category: "tenants",
        icon: Users,
        iconClass: "text-amber-400",
        title: `${d.tenantName} left ${d.propertyName}`,
        detail: reasonLabel,
      });
    });

    // Tenant events (defaults, damages, etc.)
    tenantEvents.forEach((e, i) => {
      const label =
        e.type === "default"
          ? "Rent default"
          : e.type === "damage"
          ? "Tenant-caused damage"
          : "Early exit";
      out.push({
        id: `te_${e.propertyId}_${e.month}_${i}`,
        month: e.month,
        category: "tenants",
        icon: AlertTriangle,
        iconClass: "text-red-400",
        title: `${label} — ${propName(e.propertyId)}`,
        detail: e.amount ? `£${Math.round(e.amount).toLocaleString()}` : undefined,
      });
    });

    // Economic / macro events
    economicEvents.forEach((ev, i) => {
      out.push({
        id: `ee_${ev.id || i}`,
        month: ev.month,
        category: "market",
        icon: TrendingUp,
        iconClass: "text-blue-400",
        title: ev.name,
        detail: ev.description,
      });
    });

    // Renovation completions (only those that have completed)
    renovations.forEach(r => {
      const cm = (r as any).completionMonth;
      if (typeof cm === "number" && monthsPlayed >= cm) {
        out.push({
          id: `rn_${r.id}`,
          month: cm,
          category: "property",
          icon: Hammer,
          iconClass: "text-emerald-400",
          title: `Renovation complete — ${propName(r.propertyId)}`,
          detail: r.type?.name,
        });
      }
    });

    // Conveyancing completions (already-completed entries are pruned, so show current ones near completion)
    conveyancing.forEach(c => {
      const done = monthsPlayed >= (c.completionMonth ?? Infinity);
      if (!done) return;
      const isBuy = c.status === "buying";
      const amount = isBuy ? c.purchasePrice : c.salePrice;
      out.push({
        id: `cv_${c.id}`,
        month: c.completionMonth,
        category: "property",
        icon: Home,
        iconClass: isBuy ? "text-violet-400" : "text-cyan-400",
        title: `${isBuy ? "Purchase" : "Sale"} completed — ${c.propertyName}`,
        detail: amount ? `£${fromPennies(amount).toLocaleString()}` : undefined,
      });
    });

    // Tax records
    taxRecords.forEach((t, i) => {
      out.push({
        id: `tx_${t.month}_${i}`,
        month: t.month,
        category: "finance",
        icon: Banknote,
        iconClass: "text-yellow-400",
        title: t.description || t.type.replace(/_/g, " "),
        detail: `£${fromPennies(t.amount).toLocaleString()}`,
      });
    });

    return out
      .filter(i => filter === "all" || i.category === filter)
      .sort((a, b) => b.month - a.month)
      .slice(0, 50);
  }, [
    tenantHistory,
    tenantEvents,
    economicEvents,
    renovations,
    conveyancing,
    taxRecords,
    ownedProperties,
    monthsPlayed,
    filter,
  ]);

  return (
    <Card className="glass border-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Activity
          <Badge variant="outline" className="text-xs">
            {items.length}
          </Badge>
        </CardTitle>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {(Object.keys(CATEGORY_LABEL) as Category[]).map(cat => (
            <Button
              key={cat}
              size="sm"
              variant={filter === cat ? "default" : "outline"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setFilter(cat)}
            >
              {CATEGORY_LABEL[cat]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No activity yet — get playing!
          </p>
        ) : (
          <ScrollArea className="h-[320px] pr-3">
            <div className="space-y-2">
              {items.map(item => {
                const Icon = item.icon;
                const monthsAgo = Math.max(0, monthsPlayed - item.month);
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/40"
                  >
                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", item.iconClass)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{item.title}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {monthsAgo === 0 ? "this month" : `${monthsAgo}mo ago`}
                        </Badge>
                      </div>
                      {item.detail && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <ArrowRight className="h-3 w-3" />
                          {item.detail}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
