import { useState } from "react";
import { GameClock, SpeedSelector } from "@/components/game/game-clock";
import { NotificationCentre } from "@/components/game/notification-centre";
import { AchievementsInlineButton } from "@/components/game/achievements-dialog";
import { SaveSlotsInlineButton } from "@/components/game/save-slots-dialog";
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
import { ConfirmDialog } from "@/components/game/confirm-dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
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
  currentMarketRate?: number;
  totalDebt?: number;
  landlordReputation?: number;
  reputationLog?: Array<{ month: number; delta: number; reason: string }>;
  netMonthlyCashflow?: number;
  netWorth?: number;
  level?: number;
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
  totalDebt,
  landlordReputation,
  reputationLog,
}: HeroHeaderProps) {
  const repColour =
    (landlordReputation ?? 0) >= 75
      ? '#4ade80'
      : (landlordReputation ?? 0) >= 50
        ? '#facc15'
        : '#f87171';
  const isPaused = useGameStore((s) => s.isPaused);
  const togglePause = useGameStore((s) => s.togglePause);
  const resetGame = useGameStore((s) => s.resetGame);
  const [soundOn, setSoundOn] = useState<boolean>(() => isSoundEnabled());

  const toggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-background/95 backdrop-blur-md border-b border-border/30">
      <div className="relative w-full px-4 flex items-center">
        <div className="container mx-auto min-w-0">
          <div className="flex items-center justify-between gap-3 flex-nowrap min-w-0">
            <div className="min-w-0 flex-1">
              <h1 className="font-bold tracking-tight gradient-text truncate text-base md:text-lg">
                Property Tycoon
              </h1>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-4 glass rounded-full px-4 py-1.5 text-xs">
                {/* In-game month */}
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span>📅</span>
                  <span className="font-medium text-foreground">M {monthsPlayed}</span>
                </div>
                <div className="w-px h-3 bg-border/50" />
                {/* Landlord reputation */}
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span>⭐</span>
                  <span
                    className="font-medium"
                    style={{
                      color:
                        (landlordReputation ?? 0) >= 75
                          ? '#4ade80'
                          : (landlordReputation ?? 0) >= 50
                            ? '#facc15'
                            : '#f87171',
                    }}
                  >
                    {landlordReputation ?? 0}
                    <span className="text-muted-foreground font-normal"> rep</span>
                  </span>
                </div>
                <div className="w-px h-3 bg-border/50" />
                {/* Total debt */}
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span>💳</span>
                  <span className="font-medium text-foreground">
                    £
                    {totalDebt && totalDebt >= 1000000
                      ? `${(totalDebt / 1000000).toFixed(1)}M`
                      : totalDebt && totalDebt >= 1000
                        ? `${(totalDebt / 1000).toFixed(0)}k`
                        : (totalDebt ?? 0).toFixed(0)}
                    <span className="text-muted-foreground font-normal"> debt</span>
                  </span>
                </div>
              </div>
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
                <SpeedSelector compact />
              </div>
              <div className="glass rounded-full px-1 py-0.5 flex items-center gap-0.5 flex-wrap">
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
                <AchievementsInlineButton />
                <SaveSlotsInlineButton />
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
                    <ConfirmDialog
                      title="Reset the game?"
                      description="All progress will be lost. This cannot be undone."
                      confirmLabel="Reset"
                      destructive
                      onConfirm={() => resetGame()}
                      trigger={
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          className="text-destructive focus:text-destructive"
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Reset game
                        </DropdownMenuItem>
                      }
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
