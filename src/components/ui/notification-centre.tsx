import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActivityFeed } from "@/components/ui/activity-feed";
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

const READ_KEY = 'pm_notif_read_count';

function getReadCount(): number {
  if (typeof window === 'undefined') return 0;
  const v = window.localStorage.getItem(READ_KEY);
  return v ? Math.max(0, parseInt(v, 10) || 0) : 0;
}

function setReadCount(n: number): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(READ_KEY, String(Math.max(0, n)));
}

export function NotificationCentre(props: Props) {
  const total =
    (props.tenantHistory?.length || 0) +
    (props.tenantEvents?.length || 0) +
    (props.economicEvents?.length || 0) +
    (props.renovations?.filter((r) => r.completionMonth !== undefined).length || 0) +
    (props.conveyancing?.length || 0) +
    (props.taxRecords?.length || 0);

  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(getReadCount());

  useEffect(() => {
    const unread = Math.max(0, total - read);
    if (unread > 4) {
      const newRead = total - 4;
      setRead(newRead);
      setReadCount(newRead);
    }
  }, [total, read]);

  const unread = Math.max(0, total - read);

  const markAllRead = () => {
    setRead(total);
    setReadCount(total);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) markAllRead();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
          className="relative h-8 w-8 rounded-full"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[10px] leading-none flex items-center justify-center rounded-full"
            >
              {unread > 99 ? '99+' : unread}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Notifications</span>
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-7">
              Clear
            </Button>
          </SheetTitle>
        </SheetHeader>
        <div className="mt-3">
          <ActivityFeed {...props} bare />
        </div>
      </SheetContent>
    </Sheet>
  );
}
