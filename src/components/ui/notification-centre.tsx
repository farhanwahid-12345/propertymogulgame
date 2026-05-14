import { useEffect, useState, useMemo } from "react";
import { Bell, CalendarClock, Hammer, Receipt, Gavel, Info, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActivityFeed } from "@/components/ui/activity-feed";
import { useNotifications, markAllRead, clearNotifications, type AppNotification } from "@/lib/notifications";
import { buildUpcomingRows, monthLabel } from "@/lib/upcomingEvents";
import { cn } from "@/lib/utils";
import type {
  Conveyancing,
  Renovation,
  TenantDeparture,
  TenantEvent,
  MacroEconomicEvent,
  TaxRecord,
  PendingEviction,
  PlanningApplication,
  EntityType,
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
  // Upcoming-events feed
  pendingEvictions?: PendingEviction[];
  planningApplications?: PlanningApplication[];
  lastCorporationTaxMonth?: number;
  entityType?: EntityType;
}

const SEVERITY_ICON: Record<AppNotification["severity"], { icon: any; cls: string }> = {
  info: { icon: Info, cls: "text-blue-400" },
  success: { icon: CheckCircle2, cls: "text-emerald-400" },
  warning: { icon: AlertTriangle, cls: "text-amber-400" },
  destructive: { icon: XCircle, cls: "text-red-400" },
};

const UPCOMING_ICON = {
  tax: { icon: Receipt, cls: "text-amber-400" },
  eviction: { icon: Gavel, cls: "text-red-400" },
  planning: { icon: Hammer, cls: "text-sky-400" },
} as const;

export function NotificationCentre(props: Props) {
  const { items, unread } = useNotifications();
  const [open, setOpen] = useState(false);

  const upcoming = useMemo(() => {
    if (!props.entityType) return [];
    return buildUpcomingRows({
      monthsPlayed: props.monthsPlayed,
      entityType: props.entityType,
      pendingEvictions: props.pendingEvictions || [],
      planningApplications: props.planningApplications || [],
      lastCorporationTaxMonth: props.lastCorporationTaxMonth || 0,
    });
  }, [
    props.monthsPlayed,
    props.entityType,
    props.pendingEvictions,
    props.planningApplications,
    props.lastCorporationTaxMonth,
  ]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) markAllRead();
  };

  // Auto-mark read when count grows large to avoid stale "unread" badge
  useEffect(() => {
    if (unread > 30 && !open) markAllRead();
  }, [unread, open]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          className="relative h-8 w-8 rounded-full"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[10px] leading-none flex items-center justify-center rounded-full"
            >
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Notifications</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearNotifications()}
              className="text-xs h-7"
            >
              Clear
            </Button>
          </SheetTitle>
        </SheetHeader>

        {/* Upcoming events */}
        {upcoming.length > 0 && (
          <section className="mt-3">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <CalendarClock className="h-3.5 w-3.5" /> Upcoming
            </div>
            <div className="space-y-1.5">
              {upcoming.map(r => {
                const meta = UPCOMING_ICON[r.category];
                const Icon = meta.icon;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg bg-white/[0.04] border border-white/5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={cn("h-4 w-4 shrink-0", meta.cls)} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.title}</div>
                        <div className="text-[11px] text-muted-foreground truncate capitalize">{r.detail}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                      {monthLabel(r.monthsAway)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Live notifications (toast log) */}
        <section className="mt-4">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Bell className="h-3.5 w-3.5" /> Recent Pings
            {items.length > 0 && (
              <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No recent pings.</p>
          ) : (
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
              {items.slice(0, 30).map(n => {
                const meta = SEVERITY_ICON[n.severity];
                const Icon = meta.icon;
                return (
                  <div
                    key={n.id}
                    className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.04] border border-white/5"
                  >
                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", meta.cls)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{n.title}</div>
                      {n.description && (
                        <div className="text-[11px] text-muted-foreground line-clamp-2">{n.description}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Activity feed (existing aggregate) */}
        <section className="mt-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Activity
          </div>
          <ActivityFeed {...props} bare />
        </section>
      </SheetContent>
    </Sheet>
  );
}
