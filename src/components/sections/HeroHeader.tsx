import { useEffect, useState } from "react";
import transporterBridgeHero from "@/assets/transporter-bridge-hero.jpg";
import { GameClock, SpeedSelector } from "@/components/ui/game-clock";
import { NotificationCentre } from "@/components/ui/notification-centre";
import { Button } from "@/components/ui/button";
import { Pause, Play, Volume2, VolumeX, MoreVertical, HelpCircle, RotateCcw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useGameStore } from "@/stores/gameStore";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sound";
import { replayTour } from "@/lib/onboarding";
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
  pendingEvictions?: PendingEviction[];
  planningApplications?: PlanningApplication[];
  lastCorporationTaxMonth?: number;
  entityType?: EntityType;
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
  pendingEvictions,
  planningApplications,
  lastCorporationTaxMonth,
  entityType,
}: HeroHeaderProps) {
  const isPaused = useGameStore((s) => s.isPaused);
  const togglePause = useGameStore((s) => s.togglePause);
  const resetGame = useGameStore((s) => s.resetGame);
  const reputation = useGameStore((s) => (s as any).landlordReputation ?? 50);
  const currentMarketRate = useGameStore((s) => (s as any).currentMarketRate ?? 0);
  const totalDebtPennies = useGameStore((s) => {
    const ms = (s as any).mortgages || [];
    const ls = (s as any).loans || [];
    return ms.reduce((a: number, m: any) => a + (m.remainingPennies ?? m.remaining ?? 0), 0)
      + ls.reduce((a: number, l: any) => a + (l.remainingPennies ?? l.remaining ?? 0), 0);
  });
  const [compact, setCompact] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(() => isSoundEnabled());

  useEffect(() => {
    let ticking = false;
    let currentCompact = window.scrollY > 96;
    setCompact(currentCompact);
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        // Hysteresis: enter compact >96px, leave <48px → no thrash near threshold.
        if (!currentCompact && y > 96) {
          currentCompact = true;
          setCompact(true);
        } else if (currentCompact && y < 48) {
          currentCompact = false;
          setCompact(false);
        }
        ticking = false;
      });
    };
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
          compact ? "py-1" : "pb-3 pt-6 md:pt-8",
        )}
      >
        <div className="container mx-auto min-w-0">
          <div className="flex items-center justify-between gap-3 flex-nowrap min-w-0">
            <div className="min-w-0 flex-1">
              <h1
                className={cn(
                  "font-bold tracking-tight gradient-text transition-all truncate",
                  compact ? "text-base md:text-lg" : "text-2xl md:text-3xl",
                )}
              >
                Property Tycoon{compact ? "" : " 🏘️"}
              </h1>
              {!compact && (
                <p className="hidden md:flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                  <span>Build your empire, one house at a time!</span>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[10px] font-medium"
                    title={`Landlord reputation: ${Math.round(reputation)}/100`}
                  >
                    ⭐ {Math.round(reputation)}
                  </span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 justify-end flex-nowrap shrink-0">
              <div className="glass rounded-full px-3 py-1 hidden sm:flex items-center w-[220px]">
                <GameClock
                  monthsPlayed={monthsPlayed}
                  timeUntilNextMonth={timeUntilNextMonth}
                  inline
                />
              </div>
              <div className="glass rounded-full px-1.5 py-1 flex items-center">
                <SpeedSelector compact={compact} />
              </div>
              <div className="glass rounded-full px-1 py-0.5 flex items-center gap-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={togglePause}
                  className="rounded-full h-8 w-8 p-0"
                  aria-label={isPaused ? "Resume game" : "Pause game"}
                  title={isPaused ? "Resume" : "Pause"}
                >
                  {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={toggleSound}
                  className="rounded-full h-8 w-8 p-0"
                  aria-label={soundOn ? "Mute sound" : "Enable sound"}
                  title={soundOn ? "Sound on" : "Sound off"}
                >
                  {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                </Button>
                <NotificationCentre
                  monthsPlayed={monthsPlayed}
                  tenantHistory={tenantHistory}
                  tenantEvents={tenantEvents}
                  economicEvents={economicEvents}
                  renovations={renovations}
                  conveyancing={conveyancing}
                  taxRecords={taxRecords}
                  ownedProperties={ownedProperties}
                  pendingEvictions={pendingEvictions}
                  planningApplications={planningApplications}
                  lastCorporationTaxMonth={lastCorporationTaxMonth}
                  entityType={entityType}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full h-8 w-8 p-0"
                      aria-label="More options"
                      title="More"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => replayTour()}>
                      <HelpCircle className="h-4 w-4 mr-2" />
                      Replay tour
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        if (window.confirm("Reset the game? All progress will be lost.")) {
                          resetGame();
                        }
                      }}
                      className="text-destructive focus:text-destructive"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset game
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
