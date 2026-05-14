import { useEffect, useState } from "react";
import transporterBridgeHero from "@/assets/transporter-bridge-hero.jpg";
import { GameClock } from "@/components/ui/game-clock";
import { NotificationCentre } from "@/components/ui/notification-centre";
import { Button } from "@/components/ui/button";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sound";
import { cn } from "@/lib/utils";
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
  const togglePause = useGameStore((s) => s.togglePause);
  const [compact, setCompact] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(() => isSoundEnabled());

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handler = () => setSoundOn(isSoundEnabled());
    window.addEventListener("pm:sound-toggled", handler);
    return () => window.removeEventListener("pm:sound-toggled", handler);
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
  };

  return (
    <div
      className={cn(
        "sticky top-0 z-30 bg-cover bg-center transition-all duration-300 will-change-[height]",
        compact ? "h-[56px]" : "h-[120px] md:h-[160px]",
      )}
      style={{ backgroundImage: `url(${transporterBridgeHero})` }}
    >
      <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
      {isPaused && !compact && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-primary/90 text-primary-foreground text-[11px] font-semibold shadow-lg backdrop-blur">
          ⏸ Paused
        </div>
      )}
      <div
        className={cn(
          "relative w-full px-4 h-full flex items-center transition-all",
          compact ? "py-1" : "pb-3 pt-6 md:pt-8 items-end",
        )}
      >
        <div className="container mx-auto">
          <div className={cn("flex items-center justify-between gap-3 flex-wrap", !compact && "items-end")}>
            <div className="min-w-0">
              <h1
                className={cn(
                  "font-bold tracking-tight gradient-text transition-all",
                  compact ? "text-base md:text-lg" : "text-2xl md:text-3xl",
                )}
              >
                Property Tycoon{compact ? "" : " 🏘️"}
              </h1>
              {!compact && (
                <p className="hidden md:block text-sm text-muted-foreground mt-0.5">
                  Build your empire, one house at a time!
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-md justify-end">
              <div className={cn("flex-1 min-w-[160px]", compact ? "max-w-[220px]" : "max-w-sm")}>
                <GameClock
                  monthsPlayed={monthsPlayed}
                  timeUntilNextMonth={timeUntilNextMonth}
                  inline
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={togglePause}
                className="glass rounded-full h-8 w-8 p-0"
                aria-label={isPaused ? "Resume game" : "Pause game"}
                title={isPaused ? "Resume" : "Pause"}
              >
                {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleSound}
                className="glass rounded-full h-8 w-8 p-0"
                aria-label={soundOn ? "Mute sound" : "Enable sound"}
                title={soundOn ? "Sound on" : "Sound off"}
              >
                {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </Button>
              <div className="glass rounded-full px-1 py-0.5 flex items-center">
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
