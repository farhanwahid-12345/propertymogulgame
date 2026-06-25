import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, Volume2, VolumeX, Droplets, Plug, ShieldAlert, Smile } from "lucide-react";
import { fromPennies } from "@/lib/formatCurrency";
import type { TenantConcern } from "@/types/game";
import type { Property } from "@/types/game";
import { isSoundEnabled, setSoundEnabled, playConcernChime } from "@/lib/sound";
import { useGameStore } from "@/stores/gameStore";
import { CONCERN_RESOLVE_CONDITION_LIFT, scoreFromConditionTier } from "@/lib/engine/constants";

interface Props {
  concerns: TenantConcern[];
  ownedProperties: Pick<Property, 'id' | 'name'>[];
  playerCash: number; // pennies
  monthsPlayed: number;
  onResolve: (concernId: string) => void;
  onSnooze: (concernId: string) => void;
  /** Route the player to the Renovations tab for the given property (used for MEES/EPC concerns). */
  onNavigateToRenovations?: (propertyId: string) => void;
  /** When true, render only the body (no outer Card / heading). */
  bare?: boolean;
}

const CATEGORY_ICON = {
  maintenance: Wrench,
  noise: Volume2,
  mould: Droplets,
  appliance: Plug,
  safety: ShieldAlert,
} as const;

const CATEGORY_LABEL = {
  maintenance: "Maintenance",
  noise: "Noise",
  mould: "Mould / Damp",
  appliance: "Appliance",
  safety: "Safety",
} as const;

export function TenantConcernsFeed({
  concerns,
  ownedProperties,
  playerCash,
  monthsPlayed,
  onResolve,
  onSnooze,
  onNavigateToRenovations,
  bare = false,
}: Props) {
  const ownedIds = new Set(ownedProperties.map(p => p.id));
  const active = concerns.filter(c => c && !c.resolvedMonth && ownedIds.has(c.propertyId));
  const propName = (id: string) => ownedProperties.find(p => p.id === id)?.name || "Unknown property";
  const propsFull = useGameStore((s) => s.ownedProperties);
  const conditionScoreFor = (id: string) => {
    const p = propsFull.find((x: any) => x.id === id);
    if (!p) return 100;
    return (p as any).conditionScore ?? scoreFromConditionTier((p as any).condition);
  };

  // Flashing + chime when new concerns arrive
  const seenIds = useRef<Set<string>>(new Set());
  const [flashing, setFlashing] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(() => isSoundEnabled());

  useEffect(() => {
    const handler = (e: Event) => setSoundOn((e as CustomEvent<boolean>).detail);
    window.addEventListener('pm:sound-toggled', handler);
    return () => window.removeEventListener('pm:sound-toggled', handler);
  }, []);

  useEffect(() => {
    const newIds = active.map(c => c.id).filter(id => !seenIds.current.has(id));
    if (newIds.length > 0) {
      // Initial mount — don't chime, just record
      const isInitial = seenIds.current.size === 0;
      newIds.forEach(id => seenIds.current.add(id));
      if (!isInitial) {
        playConcernChime();
        setFlashing(true);
      }
    }
    if (active.length === 0) setFlashing(false);
  }, [active.map(c => c.id).join('|')]);

  const stopFlashing = () => setFlashing(false);
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const body = (
    <div className="space-y-2">
      {active.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Smile className="h-4 w-4 text-emerald-400" />
          No concerns — tenants are happy 😊
        </div>
      ) : (
        active.map(c => {
          const Icon = CATEGORY_ICON[c.category] || Wrench;
          const monthsOpen = Math.max(0, monthsPlayed - (c.raisedMonth || 0));
          const grace = (c.category === 'safety' || c.category === 'noise' || c.source === 'damage') ? 1 : 2;
          const graceRemaining = Math.max(0, grace - monthsOpen);
          const isDecaying = monthsOpen > grace;
          const cost = fromPennies(c.resolveCost || 0);
          const canAfford = playerCash >= (c.resolveCost || 0);
          const isMeesConcern = c.id.startsWith('mees2030_warn_') || (c.description?.includes('lettings ban from 2030') ?? false);
          return (
            <div
              key={c.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/40"
            >
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${c.source === 'damage' ? 'text-red-400' : 'text-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{propName(c.propertyId)}</span>
                  {c.source === 'damage' ? (
                    <Badge variant="destructive" className="text-[10px]">🔧 Damage</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {CATEGORY_LABEL[c.category] || "Maintenance"}
                    </Badge>
                  )}
                  {isDecaying ? (
                    <Badge variant="outline" className="text-[10px] border-red-400/40 text-red-400">
                      ⚠ Decaying · -{c.satisfactionPenaltyIfIgnored || 0}/mo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-emerald-400/40 text-emerald-300">
                      ⏳ Resolve in {graceRemaining}mo
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{c.description || "Tenant concern"}</p>
                {(() => {
                  const score = conditionScoreFor(c.propertyId);
                  const lift = CONCERN_RESOLVE_CONDITION_LIFT[c.category] ?? 3;
                  return (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {score < 50 && (
                        <span className="text-[10px] text-red-300/90">
                          🔧 Repair bar low ({Math.round(score)}) — fix the bar to reduce future risk
                        </span>
                      )}
                      {c.source === 'damage' && (
                        <span className="text-[10px] text-emerald-300/90">
                          ✅ Resolving lifts repair bar +{lift}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                {isMeesConcern ? (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs bg-amber-600 hover:bg-amber-500"
                    onClick={() => onNavigateToRenovations?.(c.propertyId)}
                  >
                    Plan EPC upgrade →
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      disabled={!canAfford}
                      onClick={() => onResolve(c.id)}
                    >
                      Resolve £{cost.toLocaleString()}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => onSnooze(c.id)}
                    >
                      Snooze
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  if (bare) return body;

  return (
    <Card
      className={`glass border-0 ${flashing && active.length > 0 ? 'animate-pulse ring-2 ring-amber-400/60' : ''}`}
      onMouseEnter={stopFlashing}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          🛠️ Tenant Concerns
          {active.length > 0 && (
            <Badge variant="outline" className={`text-xs border-amber-400/40 text-amber-300 ${flashing ? 'animate-pulse' : ''}`}>
              {active.length} active
            </Badge>
          )}
          <button
            type="button"
            onClick={toggleSound}
            className="ml-auto text-muted-foreground hover:text-foreground"
            title={soundOn ? 'Mute concern alerts' : 'Unmute concern alerts'}
            aria-label={soundOn ? 'Mute' : 'Unmute'}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
