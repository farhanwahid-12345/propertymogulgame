import { useEffect, useState } from "react";
import { Bell, Volume2, VolumeX, Pause, Play } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActivityFeed } from "@/components/ui/activity-feed";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sound";
import { useGameStore } from "@/stores/gameStore";
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
  // Total feed item count = sum of all the streams the ActivityFeed shows.
  const total =
    (props.tenantHistory?.length || 0) +
    (props.tenantEvents?.length || 0) +
    (props.economicEvents?.length || 0) +
    (props.renovations?.filter((r) => r.completionMonth !== undefined).length || 0) +
    (props.conveyancing?.length || 0) +
    (props.taxRecords?.length || 0);

  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(getReadCount());
  const [soundOn, setSoundOn] = useState<boolean>(isSoundEnabled());
  const isPaused = useGameStore((s) => s.isPaused);
  const togglePause = useGameStore((s) => s.togglePause);

  // Auto-clear: when 4+ unread accumulate beyond the last seen mark, mark
  // older items as read so the badge focuses on the freshest events.
  useEffect(() => {
    const unread = Math.max(0, total - read);
    if (unread > 4) {
      const newRead = total - 4;
      setRead(newRead);
      setReadCount(newRead);
    }
  }, [total, read]);

  useEffect(() => {
    const handler = (e: Event) => setSoundOn(!!(e as CustomEvent).detail);
    window.addEventListener('pm:sound-toggled', handler);
    return () => window.removeEventListener('pm:sound-toggled', handler);
  }, []);

  const unread = Math.max(0, total - read);

  const markAllRead = () => {
    setRead(total);
    setReadCount(total);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // Soft mark on open so the badge clears.
      markAllRead();
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={togglePause}
        aria-label={isPaused ? 'Resume game' : 'Pause game'}
        title={isPaused ? 'Resume' : 'Pause'}
        className="h-8 w-8 rounded-full"
      >
        {isPaused ? <Play className="h-4 w-4 text-primary" /> : <Pause className="h-4 w-4" />}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => {
          const next = !soundOn;
          setSoundOn(next);
          setSoundEnabled(next);
        }}
        aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
        title={soundOn ? 'Sound on' : 'Muted'}
        className="h-8 w-8 rounded-full"
      >
        {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
      </Button>

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
    </div>
  );
}
