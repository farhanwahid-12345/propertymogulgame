import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ScrollText, AlertTriangle, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tenant } from "@/components/ui/tenant-selector";

interface Props {
  propertyId: string;
  propertyName: string;
  /** Pounds */
  currentRent: number;
  /** Pounds — local-market reference (value × yield/12). */
  marketRent: number;
  /** Months since last rent rise on this property (lastRentIncrease). */
  monthsSinceLastIncrease: number;
  tenant: Tenant;
  tenantSatisfaction: number;
  /** Player cash (pounds) — for tribunal fee affordability check. */
  playerCash: number;
  /** Apply the negotiated rent, in pounds. `outcome` drives satisfaction / lock. */
  onApply: (
    propertyId: string,
    newRentPounds: number,
    outcome: 'accepted' | 'counter_accepted' | 'tribunal_landlord' | 'tribunal_tenant',
    tribunalFeePounds: number,
  ) => void;
  trigger?: React.ReactNode;
}

const TRIBUNAL_FEE = 275; // pounds
const MAX_RAISE_PCT = 0.03; // 3%/yr cap (existing rule)

type Phase = 'compose' | 'response' | 'tribunal_result';

export function RentNegotiationDialog({
  propertyId,
  propertyName,
  currentRent,
  marketRent,
  monthsSinceLastIncrease,
  tenant,
  tenantSatisfaction,
  playerCash,
  onApply,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [proposed, setProposed] = useState<number>(Math.round(currentRent * 1.03));
  const [phase, setPhase] = useState<Phase>('compose');
  const [tenantCounter, setTenantCounter] = useState<number | null>(null);
  const [tribunalResult, setTribunalResult] = useState<null | {
    figure: number;
    outcome: 'tribunal_landlord' | 'tribunal_tenant';
  }>(null);

  const yearlyCapBlocked = monthsSinceLastIncrease < 12;
  const maxAllowed = Math.round(currentRent * (1 + MAX_RAISE_PCT));
  const minAllowed = currentRent;

  // Acceptance probability — closer to market + happy tenant + premium profile = more likely
  const acceptanceProb = useMemo(() => {
    const proposedVsMarket = marketRent > 0 ? proposed / marketRent : 1;
    // 100% accept at/below market, drops to ~10% at 1.15× market
    const marketScore = Math.max(0, 1 - Math.max(0, proposedVsMarket - 1) * 6);
    const satScore = Math.min(1, Math.max(0, tenantSatisfaction / 100));
    const profileBias =
      tenant.profile === 'premium' ? 1.10 :
      tenant.profile === 'standard' ? 1.00 :
      tenant.profile === 'budget' ? 0.85 : 0.75; // risky pushes back
    const raw = 0.55 * marketScore + 0.35 * satScore;
    return Math.max(0.05, Math.min(0.95, raw * profileBias));
  }, [proposed, marketRent, tenantSatisfaction, tenant.profile]);

  const reset = () => {
    setProposed(Math.round(currentRent * 1.03));
    setPhase('compose');
    setTenantCounter(null);
    setTribunalResult(null);
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) reset();
  };

  const handleServeNotice = () => {
    if (yearlyCapBlocked) return;
    if (proposed < minAllowed || proposed > maxAllowed) return;

    const roll = Math.random();
    if (roll < acceptanceProb) {
      // Tenant accepts
      onApply(propertyId, proposed, 'accepted', 0);
      setOpen(false);
      reset();
    } else {
      // Tenant counter-offers somewhere between current and proposed
      const counter = Math.round(currentRent + (proposed - currentRent) * (0.3 + Math.random() * 0.4));
      setTenantCounter(counter);
      setPhase('response');
    }
  };

  const handleAcceptCounter = () => {
    if (tenantCounter == null) return;
    onApply(propertyId, tenantCounter, 'counter_accepted', 0);
    setOpen(false);
    reset();
  };

  const handleTribunal = () => {
    if (playerCash < TRIBUNAL_FEE) return;
    // 60% tribunal sides with landlord (sets to proposed, capped at market)
    // 40% sides with tenant (sets to lower of counter/median(current, market))
    const landlordWin = Math.random() < 0.60;
    if (landlordWin) {
      const figure = Math.round(Math.min(proposed, marketRent || proposed));
      setTribunalResult({ figure: Math.max(currentRent, figure), outcome: 'tribunal_landlord' });
    } else {
      const median = Math.round((currentRent + (marketRent || currentRent)) / 2);
      const figure = Math.min(tenantCounter ?? median, median);
      setTribunalResult({ figure: Math.max(currentRent, figure), outcome: 'tribunal_tenant' });
    }
    setPhase('tribunal_result');
  };

  const handleApplyTribunal = () => {
    if (!tribunalResult) return;
    onApply(propertyId, tribunalResult.figure, tribunalResult.outcome, TRIBUNAL_FEE);
    setOpen(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="text-xs border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10">
            <ScrollText className="h-3 w-3 mr-1" />
            Propose Rent Increase
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-emerald-400" />
            Section 13 Rent Increase Notice
          </DialogTitle>
          <DialogDescription>
            Serve {tenant.name} a formal Section 13 notice to raise rent on{" "}
            <span className="font-semibold text-foreground">{propertyName}</span>.
            Tenant may accept, counter-offer, or refer to the First-tier Tribunal.
          </DialogDescription>
        </DialogHeader>

        {phase === 'compose' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 rounded-md bg-muted/40 border border-border">
                <div className="text-xs text-muted-foreground">Current rent</div>
                <div className="font-semibold">£{currentRent.toLocaleString()}/mo</div>
              </div>
              <div className="p-2 rounded-md bg-muted/40 border border-border">
                <div className="text-xs text-muted-foreground">Local market</div>
                <div className="font-semibold">£{Math.round(marketRent).toLocaleString()}/mo</div>
              </div>
            </div>

            {yearlyCapBlocked ? (
              <div className="p-3 rounded-md bg-amber-400/10 border border-amber-400/30 text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                Rent can only be raised once per 12 months. Wait{" "}
                <strong className="text-foreground">{12 - monthsSinceLastIncrease} more month(s)</strong>.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-xs">
                    Proposed new rent (max +3% / £{maxAllowed.toLocaleString()})
                  </Label>
                  <Slider
                    min={minAllowed}
                    max={maxAllowed}
                    step={5}
                    value={[proposed]}
                    onValueChange={(v) => setProposed(v[0])}
                  />
                  <Input
                    type="number"
                    value={proposed}
                    min={minAllowed}
                    max={maxAllowed}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setProposed(Math.max(minAllowed, Math.min(maxAllowed, v)));
                    }}
                    className="h-8 text-sm"
                  />
                </div>

                <div className="p-3 rounded-md bg-muted/40 border border-border space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Increase</span>
                    <span className="font-semibold">
                      +£{(proposed - currentRent).toLocaleString()}/mo
                      {' '}({(((proposed - currentRent) / currentRent) * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Tenant likely to accept</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        acceptanceProb > 0.6 ? "border-emerald-400/40 text-emerald-300" :
                        acceptanceProb > 0.35 ? "border-amber-400/40 text-amber-300" :
                                                 "border-red-400/40 text-red-300"
                      )}
                    >
                      {Math.round(acceptanceProb * 100)}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Notice period</span>
                    <span>2 months</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {phase === 'response' && tenantCounter != null && (
          <div className="space-y-3">
            <div className="p-3 rounded-md bg-muted/40 border border-border text-sm space-y-2">
              <p>
                <span className="font-semibold text-foreground">{tenant.name}</span> rejected your figure of{" "}
                £{proposed.toLocaleString()}/mo and counter-offered:
              </p>
              <div className="text-center text-2xl font-bold text-emerald-400">
                £{tenantCounter.toLocaleString()}/mo
              </div>
              <p className="text-xs text-muted-foreground">
                Accept the counter, or refer to the First-tier Tribunal (£{TRIBUNAL_FEE} fee).
                Tribunal decides the final rent and locks it for 12 months.
              </p>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Scale className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
              <p>Tribunal: <strong className="text-emerald-300">60%</strong> sides with landlord (caps at market), <strong className="text-red-300">40%</strong> sides with tenant.</p>
            </div>
          </div>
        )}

        {phase === 'tribunal_result' && tribunalResult && (
          <div className="space-y-3">
            <div className={cn(
              "p-3 rounded-md border text-sm space-y-1",
              tribunalResult.outcome === 'tribunal_landlord'
                ? "bg-emerald-400/10 border-emerald-400/30"
                : "bg-red-400/10 border-red-400/30"
            )}>
              <p className="font-semibold text-foreground">
                Tribunal {tribunalResult.outcome === 'tribunal_landlord' ? 'sided with you' : 'sided with the tenant'}.
              </p>
              <p className="text-xs text-muted-foreground">Final rent set for the next 12 months:</p>
              <div className="text-center text-2xl font-bold">
                £{tribunalResult.figure.toLocaleString()}/mo
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {phase === 'compose' && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button
                onClick={handleServeNotice}
                disabled={yearlyCapBlocked || proposed <= currentRent}
              >
                Serve Notice
              </Button>
            </>
          )}
          {phase === 'response' && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Withdraw</Button>
              <Button variant="outline" onClick={handleTribunal} disabled={playerCash < TRIBUNAL_FEE}>
                Tribunal £{TRIBUNAL_FEE}
              </Button>
              <Button onClick={handleAcceptCounter}>Accept Counter</Button>
            </>
          )}
          {phase === 'tribunal_result' && (
            <Button onClick={handleApplyTribunal}>Apply Decision</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
