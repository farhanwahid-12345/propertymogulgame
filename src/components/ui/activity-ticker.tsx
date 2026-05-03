import { useMemo, useState } from "react";
import { History, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ActivityFeed } from "@/components/ui/activity-feed";
import { fromPennies } from "@/lib/formatCurrency";
import type {
  Conveyancing,
  Renovation,
  TenantDeparture,
  TenantEvent,
  MacroEconomicEvent,
  TaxRecord,
} from "@/types/game";

interface Props {
  monthsPlayed: number;
  tenantHistory?: TenantDeparture[];
  tenantEvents?: Array<TenantEvent & { amount: number }>;
  economicEvents?: MacroEconomicEvent[];
  renovations?: Renovation[];
  conveyancing?: Conveyancing[];
  taxRecords?: TaxRecord[];
  ownedProperties?: Array<{ id: string; name: string }>;
}

interface TickerItem {
  id: string;
  month: number;
  label: string;
}

export function ActivityTicker(props: Props) {
  const {
    monthsPlayed,
    tenantHistory = [],
    tenantEvents = [],
    economicEvents = [],
    renovations = [],
    conveyancing = [],
    taxRecords = [],
    ownedProperties = [],
  } = props;
  const [open, setOpen] = useState(false);

  const propName = (id: string) =>
    ownedProperties.find(p => p.id === id)?.name || "property";

  const items = useMemo<TickerItem[]>(() => {
    const out: TickerItem[] = [];

    tenantHistory.forEach(d => {
      const reason =
        d.reason === "eviction_completed" ? "evicted" :
        d.reason === "low_satisfaction"   ? "moved out" : "tenancy ended";
      out.push({ id: `td_${d.id}`, month: d.month, label: `${d.tenantName} ${reason} — ${d.propertyName}` });
    });
    tenantEvents.forEach((e, i) => {
      const label =
        e.type === "default" ? "Rent default" :
        e.type === "damage"  ? "Tenant damage" : "Early exit";
      out.push({ id: `te_${e.propertyId}_${e.month}_${i}`, month: e.month, label: `${label} — ${propName(e.propertyId)}` });
    });
    economicEvents.forEach((ev, i) => {
      out.push({ id: `ee_${ev.id || i}`, month: ev.month, label: ev.name });
    });
    renovations.forEach(r => {
      const cm = (r as any).completionMonth;
      if (typeof cm === "number" && monthsPlayed >= cm) {
        out.push({ id: `rn_${r.id}`, month: cm, label: `Renovation done — ${propName(r.propertyId)}` });
      }
    });
    conveyancing.forEach(c => {
      if (monthsPlayed < (c.completionMonth ?? Infinity)) return;
      const isBuy = c.status === "buying";
      out.push({ id: `cv_${c.id}`, month: c.completionMonth, label: `${isBuy ? "Bought" : "Sold"} ${c.propertyName}` });
    });
    taxRecords.forEach((t, i) => {
      out.push({
        id: `tx_${t.month}_${i}`,
        month: t.month,
        label: `${t.description || t.type.replace(/_/g, " ")} (£${fromPennies(t.amount).toLocaleString()})`,
      });
    });

    return out.sort((a, b) => b.month - a.month).slice(0, 12);
  }, [tenantHistory, tenantEvents, economicEvents, renovations, conveyancing, taxRecords, ownedProperties, monthsPlayed]);

  if (items.length === 0) return null;

  return (
    <div className="glass rounded-2xl px-3 py-2 flex items-center gap-2 text-xs animate-fade-in">
      <History className="h-3.5 w-3.5 text-primary shrink-0" />
      <span className="text-muted-foreground shrink-0 font-semibold uppercase tracking-wide text-[10px]">
        Activity
      </span>
      <div className="flex-1 overflow-x-auto whitespace-nowrap">
        {items.map((it, idx) => (
          <span key={it.id} className="text-muted-foreground">
            {idx > 0 && <span className="mx-2 text-border">·</span>}
            <span className="text-foreground/60">M{it.month}</span>{' '}
            <span>{it.label}</span>
          </span>
        ))}
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0">
            View all <ChevronRight className="h-3 w-3 ml-0.5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Activity Feed</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ActivityFeed {...props} bare />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
