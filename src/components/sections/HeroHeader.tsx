import transporterBridgeHero from "@/assets/transporter-bridge-hero.jpg";
import { GameClock } from "@/components/ui/game-clock";
import { NotificationCentre } from "@/components/ui/notification-centre";
import { useGameStore } from "@/stores/gameStore";
import type {
  Conveyancing,
  Renovation,
  TenantDeparture,
  TenantEvent,
  MacroEconomicEvent,
  TaxRecord,
} from "@/types/game";

interface HeroHeaderProps {
  monthsPlayed: number;
  timeUntilNextMonth: number;
  tenantHistory?: TenantDeparture[];
  tenantEvents?: Array<TenantEvent & { amount: number }>;
  economicEvents?: MacroEconomicEvent[];
  renovations?: Renovation[];
  conveyancing?: Conveyancing[];
  taxRecords?: TaxRecord[];
  ownedProperties?: Array<{ id: string; name: string }>;
}

export function HeroHeader({
  monthsPlayed,
  timeUntilNextMonth,
  tenantHistory,
  tenantEvents,
  economicEvents,
  renovations,
  conveyancing,
  taxRecords,
  ownedProperties,
}: HeroHeaderProps) {
  const isPaused = useGameStore((s) => s.isPaused);

  return (
    <div
      className="relative h-[120px] md:h-[160px] bg-cover bg-center flex items-end"
      style={{ backgroundImage: `url(${transporterBridgeHero})` }}
    >
      <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
      {isPaused && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-primary/90 text-primary-foreground text-[11px] font-semibold shadow-lg backdrop-blur">
          ⏸ Paused
        </div>
      )}
      <div className="relative w-full px-4 pb-3 pt-6 md:pt-8">
        <div className="container mx-auto">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight gradient-text">
                Property Tycoon 🏘️
              </h1>
              <p className="hidden md:block text-sm text-muted-foreground mt-0.5">
                Build your empire, one house at a time!
              </p>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md justify-end">
              <div className="flex-1 min-w-[180px] max-w-sm">
                <GameClock
                  monthsPlayed={monthsPlayed}
                  timeUntilNextMonth={timeUntilNextMonth}
                  inline
                />
              </div>
              <div className="glass rounded-full px-1.5 py-1 flex items-center">
                <NotificationCentre
                  monthsPlayed={monthsPlayed}
                  tenantHistory={tenantHistory}
                  tenantEvents={tenantEvents}
                  economicEvents={economicEvents}
                  renovations={renovations}
                  conveyancing={conveyancing}
                  taxRecords={taxRecords}
                  ownedProperties={ownedProperties}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
