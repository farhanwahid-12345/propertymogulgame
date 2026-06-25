import { useEffect, useState } from "react";
import transporterBridgeHero from "@/assets/transporter-bridge-hero.jpg";
import { GameClock, SpeedSelector } from "@/components/game/game-clock";
import { NotificationCentre } from "@/components/game/notification-centre";
import { ReputationBadge } from "@/components/game/reputation-badge";
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
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/game/confirm-dialog";
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
  netMonthlyCashflow?: number;
  netWorth?: number;
  level?: number;
}

const PROGRESSION_TARGETS: Array<{ minLevel: number; target: number; label: string }> = [
  { minLevel: 1, target: 250_000,   label: "£250k net worth" },
  { minLevel: 2, target: 500_000,   label: "£500k net worth" },
  { minLevel: 3, target: 1_000_000, label: "£1M net worth" },
  { minLevel: 4, target: 2_500_000, label: "£2.5M net worth" },
  { minLevel: 5, target: 5_000_000, label: "£5M net worth" },
  { minLevel: 6, target: 10_000_000, label: "£10M empire" },
];

function pickGoal(level: number, netWorth: number) {
  const tier = PROGRESSION_TARGETS.filter(t => t.minLevel <= Math.max(1, level));
  const next = tier.find(t => netWorth < t.target) || PROGRESSION_TARGETS.find(t => netWorth < t.target);
  return next || PROGRESSION_TARGETS[PROGRESSION_TARGETS.length - 1];
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
  currentMarketRate = 0,
  totalDebt = 0,
  netMonthlyCashflow = 0,
  netWorth = 0,
  level = 1,
}: HeroHeaderProps) {
  const goalTargetPounds = useGameStore((s) => ((s as any).goalTarget ?? 0) / 100);
  const goalAchievedAt = useGameStore((s) => (s as any).goalAchievedAt as number | undefined);
  const tierGoal = pickGoal(level, netWorth);
  const goal = goalTargetPounds > 0 && !goalAchievedAt
    ? { target: goalTargetPounds, label: `£${goalTargetPounds.toLocaleString()} net worth` }
    : tierGoal;
  const goalPct = Math.max(0, Math.min(100, (netWorth / goal.target) * 100));
  const isPaused = useGameStore((s) => s.isPaused);
  const togglePause = useGameStore((s) => s.togglePause);
  const resetGame = useGameStore((s) => s.resetGame);
  const reputation = useGameStore((s) => (s as any).landlordReputation ?? 50);
  const reputationLog = useGameStore((s) => ((s as any).reputationLog || []) as Array<{ id: string; month: number; reason: string; delta: number; category: string }>);
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
    // Outer wrapper is ALWAYS 56px tall in layout. No height transitions —
    // animating layout-affecting properties (height) reflows the entire
    // document on every frame and causes the sticky-header "jump" bug.
    // The expanding band below uses max-height transitions that only repaint.
    <div
      className="sticky top-0 z-30 h-[56px] bg-cover bg-center"
      style={{ backgroundImage: `url(${transporterBridgeHero})` }}
    >
      <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />

      {/* Expanding band — absolutely positioned BELOW the 56px sticky strip.
          Only max-height animates; the document beneath the sticky header
          never reflows because the outer wrapper's layout height is fixed. */}
      <div
        aria-hidden={compact}
        className={cn(
          "absolute inset-x-0 top-[56px] overflow-hidden bg-cover bg-center transition-[max-height] duration-300 ease-in-out will-change-[max-height]",
          compact ? "max-h-0" : "max-h-[112px] md:max-h-[152px]",
        )}
        style={{ backgroundImage: `url(${transporterBridgeHero})` }}
      >
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        {isPaused && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-primary/90 text-primary-foreground text-[11px] font-semibold shadow-lg backdrop-blur">
            ⏸ Paused
          </div>
        )}
        <div className="relative w-full px-4 pt-2 pb-3">
          <div className="container mx-auto min-w-0">
            <h1 className="font-bold tracking-tight gradient-text text-2xl md:text-3xl truncate">
              Property Tycoon 🏘️
            </h1>
            <div className="hidden md:flex flex-col gap-1 mt-0.5">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Build your empire, one house at a time!</span>
                <ReputationBadge reputation={reputation} log={reputationLog} />
              </p>
              <div
                className="flex items-center gap-2 max-w-md"
                title={`Goal: ${goal.label} — £${netWorth.toLocaleString()} of £${goal.target.toLocaleString()}`}
                aria-label={`Progression goal: ${goal.label}`}
              >
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 shrink-0">
                  {goalAchievedAt ? `🏆 ${goal.label}` : `🎯 ${goal.label}`}
                </span>
                <div
                  className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={Math.floor(goalPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progress toward goal: ${goal.label}`}
                >
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary/60"
                    style={{ width: `${goalPct}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground/80 shrink-0 w-8 text-right">
                  {Math.floor(goalPct)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Always-visible 56px control strip */}
      <div className="relative w-full px-4 h-full flex items-center">
        <div className="container mx-auto min-w-0">
          <div className="flex items-center justify-between gap-3 flex-nowrap min-w-0">
            <div className="min-w-0 flex-1">
              <h1
                className={cn(
                  "font-bold tracking-tight gradient-text truncate text-base md:text-lg transition-opacity duration-200",
                  compact ? "opacity-100" : "opacity-0",
                )}
              >
                Property Tycoon
              </h1>
            </div>
            <div className="flex items-center gap-2 justify-end flex-nowrap shrink-0">
              {compact && (
                <div
                  className="glass rounded-full px-3 py-1 hidden md:flex items-center gap-2 text-[11px] text-muted-foreground whitespace-nowrap"
                  title={`Cash flow £${netMonthlyCashflow.toLocaleString()}/mo · Market rate ${(currentMarketRate * 100).toFixed(2)}% · Total debt £${totalDebt.toLocaleString()} · Month ${monthsPlayed}`}
                >
                  <span className={cn(netMonthlyCashflow >= 0 ? "text-success" : "text-danger", "font-semibold")}>
                    {netMonthlyCashflow >= 0 ? "📈" : "📉"} £{netMonthlyCashflow.toLocaleString()}/mo
                  </span>
                  <span className="opacity-60">·</span>
                  <span>{(currentMarketRate * 100).toFixed(2)}%</span>
                  <span className="opacity-60">·</span>
                  <span>Debt £{totalDebt.toLocaleString()}</span>
                  <span className="opacity-60">·</span>
                  <span>M {monthsPlayed}</span>
                </div>
              )}
              {!compact && (
                <div
                  className="glass rounded-full px-3 py-1 hidden md:flex items-center gap-2 text-[11px] text-muted-foreground whitespace-nowrap"
                  title={`Cash flow £${netMonthlyCashflow.toLocaleString()}/mo · Market rate ${(currentMarketRate * 100).toFixed(2)}% · Total debt £${totalDebt.toLocaleString()} · Month ${monthsPlayed}`}
                >
                  <span className={cn(netMonthlyCashflow >= 0 ? "text-success" : "text-danger", "font-semibold")}>
                    {netMonthlyCashflow >= 0 ? "📈" : "📉"} £{netMonthlyCashflow.toLocaleString()}/mo
                  </span>
                  <span className="opacity-60">·</span>
                  <span>{(currentMarketRate * 100).toFixed(2)}%</span>
                  <span className="opacity-60">·</span>
                  <span>Debt £{totalDebt.toLocaleString()}</span>
                  <span className="opacity-60">·</span>
                  <span>M {monthsPlayed}</span>
                </div>
              )}
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
    </div>
  );
}
