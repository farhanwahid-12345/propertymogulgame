import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Handshake, FileSignature, Scale, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromPennies, toPennies } from "@/lib/formatCurrency";
import type { Tenant } from "@/components/game/tenant-selector";

// ─── Lease term presets ──────────────────────────────────────────────────────

const TERM_OPTIONS = [
  { label: "1 year", years: 1 },
  { label: "2 years", years: 2 },
  { label: "3 years", years: 3 },
  { label: "5 years", years: 5 },
  { label: "7 years", years: 7 },
  { label: "10 years", years: 10 },
  { label: "15 years", years: 15 },
  { label: "20 years", years: 20 },
  { label: "25 years", years: 25 },
] as const;

const REVIEW_OPTIONS = [
  { label: "1-year reviews", years: 1 },
  { label: "2-year reviews", years: 2 },
  { label: "3-year reviews", years: 3 },
  { label: "5-year reviews", years: 5 },
  { label: "7-year reviews", years: 7 },
  { label: "10-year reviews", years: 10 },
] as const;

type BreakChoice = 'none' | 'tenant_mid' | 'mutual_mid';

const BREAK_OPTIONS: { id: BreakChoice; label: string; help: string }[] = [
  { id: 'none', label: 'No break clause', help: 'Tenant locked in for the full term.' },
  { id: 'tenant_mid', label: 'Tenant break @ midpoint', help: 'Tenant can walk away mid-term.' },
  { id: 'mutual_mid', label: 'Mutual break @ midpoint', help: 'Either party can end the lease mid-term.' },
];

// ─── Negotiation maths ───────────────────────────────────────────────────────

/**
 * Counter-offer the tenant proposes against the player's asking rent.
 *   counter = asking × (0.85 + covenant / 500)   ⇒ ~0.85 (weak) to ~1.05 (very strong)
 * Clamped to [0.78, 1.05] so even ultra-strong covenants don't outright over-offer.
 */
function tenantCounterRent(askingPennies: number, covenantStrength: number): number {
  const cov = Math.max(0, Math.min(100, covenantStrength));
  const factor = Math.min(1.05, Math.max(0.78, 0.85 + cov / 500));
  return Math.max(1, Math.round(askingPennies * factor));
}

/**
 * Probability the tenant accepts the player's rent without counter-offering.
 * Stronger covenants negotiate harder ⇒ less willing to accept anything above
 * their fair value; weaker covenants accept more readily to secure premises.
 */
function tenantAcceptanceChance(askingPennies: number, marketPennies: number, covenantStrength: number): number {
  if (askingPennies <= marketPennies) return 1;
  const overAsk = (askingPennies - marketPennies) / Math.max(1, marketPennies);
  // Weak covenant (20): tolerates up to ~12% above market. Strong (90): only ~3%.
  const tolerance = Math.max(0.02, 0.15 - covenantStrength * 0.0013);
  return Math.max(0, Math.min(1, 1 - overAsk / tolerance));
}

/**
 * Stronger covenants prefer longer terms; weaker covenants want flexibility.
 * Returns true if the tenant will entertain the proposed term length.
 */
function tenantAcceptsTerm(termYears: number, covenantStrength: number): boolean {
  if (termYears <= 3) return covenantStrength <= 60; // strong covenants want commitment
  if (termYears <= 5) return true;
  if (termYears <= 10) return covenantStrength >= 35;
  return covenantStrength >= 60; // 15-year lease — only blue-chip covenants
}

// ─── Component ───────────────────────────────────────────────────────────────

interface HeadsOfTermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertyName: string;
  tenant: Tenant | null;
  /** Asking rent the property is currently advertised at (pennies). */
  askingRentPennies: number;
  /** monthsPlayed snapshot for lease start/break-clause maths. */
  monthsPlayed: number;
  /** Phase 3/4 — 'new' = letting a vacant unit; 'review' = rent review on a sitting tenant; 'renewal' = new term for a sitting tenant. */
  mode?: 'new' | 'review' | 'renewal';
  /** Phase 3 — current rent (pennies) at the moment of review (for delta display). Used only when mode='review'. */
  currentRentPennies?: number;
  onSign?: (
    propertyId: string,
    tenant: Tenant,
    terms: {
      agreedRentPennies: number;
      termMonths: number;
      reviewFrequencyMonths: number;
      breakClause: { type: 'none' | 'tenant' | 'mutual'; atMonth?: number };
    },
  ) => void;
  /** Phase 3 — settle a contractual rent review at the agreed rent. Called instead of onSign when mode='review'. */
  onSettleReview?: (propertyId: string, agreedRentPennies: number) => void;
  /** Phase 4 — sign a renewal HoT for a sitting commercial tenant. Called instead of onSign when mode='renewal'. */
  onRenew?: (
    propertyId: string,
    terms: {
      agreedRentPennies: number;
      termMonths: number;
      reviewFrequencyMonths: number;
      breakClause: { type: 'none' | 'tenant' | 'mutual'; atMonth?: number };
    },
  ) => void;
}

export function HeadsOfTermsDialog({
  open,
  onOpenChange,
  propertyId,
  propertyName,
  tenant,
  askingRentPennies,
  monthsPlayed,
  mode = 'new',
  currentRentPennies,
  onSign,
  onSettleReview,
  onRenew,
}: HeadsOfTermsDialogProps) {
  const isReview = mode === 'review';
  const isRenewal = mode === 'renewal';
  const covenant = tenant?.covenantStrength ?? 50;
  const askingPounds = Math.round(fromPennies(askingRentPennies));
  const currentRentPounds = currentRentPennies != null
    ? Math.round(fromPennies(currentRentPennies))
    : null;

  // ── Local negotiation state
  const [proposedRentPounds, setProposedRentPounds] = useState<number>(askingPounds);
  const [termYears, setTermYears] = useState<number>(5);
  const [reviewYears, setReviewYears] = useState<number>(5);
  const [breakChoice, setBreakChoice] = useState<BreakChoice>('none');
  const [stage, setStage] = useState<'open' | 'counter' | 'rejected'>('open');
  const [tenantCounterPounds, setTenantCounterPounds] = useState<number | null>(null);
  const [agreedRentPounds, setAgreedRentPounds] = useState<number | null>(null);

  // Reset on open
  useMemo(() => {
    if (open) {
      setProposedRentPounds(askingPounds);
      setTermYears(5);
      setReviewYears(5);
      setBreakChoice('none');
      setStage('open');
      setTenantCounterPounds(null);
      setAgreedRentPounds(null);
    }
  }, [open, askingPounds]);

  if (!tenant) return null;

  const proposedRentPennies = toPennies(proposedRentPounds);
  // In review mode, "market" baseline = the proposed market uplift (askingRent);
  // tenant tolerance is measured against that, same maths as new lets.
  const acceptanceChance = tenantAcceptanceChance(proposedRentPennies, askingRentPennies, covenant);
  const termOk = isReview ? true : tenantAcceptsTerm(termYears, covenant);

  const covenantTone =
    covenant >= 80 ? 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10' :
    covenant >= 55 ? 'text-sky-300 border-sky-400/40 bg-sky-400/10' :
    covenant >= 30 ? 'text-amber-300 border-amber-400/40 bg-amber-400/10' :
                     'text-red-300 border-red-400/40 bg-red-400/10';

  const handlePropose = () => {
    if (!termOk) {
      setStage('rejected');
      setAgreedRentPounds(null);
      return;
    }
    // Roll acceptance
    if (Math.random() < acceptanceChance) {
      setAgreedRentPounds(proposedRentPounds);
      setStage('counter'); // re-use 'counter' stage UI but show "Accepted" pathway via agreedRent
      setTenantCounterPounds(null);
    } else {
      const counter = tenantCounterRent(proposedRentPennies, covenant);
      setTenantCounterPounds(Math.round(fromPennies(counter)));
      setAgreedRentPounds(null);
      setStage('counter');
    }
  };

  const handleAcceptCounter = () => {
    if (tenantCounterPounds == null) return;
    setAgreedRentPounds(tenantCounterPounds);
  };

  const handleSign = () => {
    const finalRentPounds = agreedRentPounds ?? proposedRentPounds;
    if (isReview) {
      onSettleReview?.(propertyId, toPennies(finalRentPounds));
      onOpenChange(false);
      return;
    }
    const termMonths = termYears * 12;
    const breakAtMonth = monthsPlayed + Math.floor(termMonths / 2);
    const breakClause: { type: 'none' | 'tenant' | 'mutual'; atMonth?: number } =
      breakChoice === 'none' ? { type: 'none' } :
      breakChoice === 'tenant_mid' ? { type: 'tenant', atMonth: breakAtMonth } :
                                      { type: 'mutual', atMonth: breakAtMonth };

    const terms = {
      agreedRentPennies: toPennies(finalRentPounds),
      termMonths,
      reviewFrequencyMonths: reviewYears * 12,
      breakClause,
    };
    if (isRenewal) {
      onRenew?.(propertyId, terms);
    } else {
      onSign?.(propertyId, tenant, terms);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] sm:w-full max-h-[90vh] sm:max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FileSignature className="h-5 w-5 text-amber-300" />
            {isReview ? 'Rent Review' : isRenewal ? 'Lease Renewal' : 'Heads of Terms'} — {propertyName}
          </DialogTitle>
        </DialogHeader>

        {isReview && currentRentPounds != null && (
          <div className="glass rounded-xl p-3 border border-sky-400/30 bg-sky-400/5 text-xs">
            Contractual review due. Current rent <span className="font-semibold text-foreground">£{currentRentPounds.toLocaleString()}/mo</span>.
            Suggested market rent <span className="font-semibold text-foreground">£{askingPounds.toLocaleString()}/mo</span> ({(((askingPounds - currentRentPounds) / Math.max(1, currentRentPounds)) * 100).toFixed(1)}%).
            Lease length, break clause, and review frequency are fixed for this review.
          </div>
        )}



        {/* Tenant summary */}
        <div className="glass rounded-xl p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="h-4 w-4 text-sky-300" />
              <div>
                <div className="font-semibold text-sm">{tenant.companyName ?? tenant.name}</div>
                {tenant.sector && (
                  <div className="text-[11px] text-muted-foreground capitalize">
                    {tenant.sector.replace('_', ' ')}
                  </div>
                )}
              </div>
            </div>
            <Badge variant="outline" className={cn("text-[11px]", covenantTone)}>
              <Scale className="h-3 w-3 mr-1" />
              Covenant {covenant}/100
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground italic">{tenant.description}</p>
        </div>

        {/* Tenant profile — preferences hint */}
        <div className="glass rounded-xl p-3 border border-border/40 bg-muted/20 space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tenant profile
          </div>
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            <div>Preferred term: {covenant >= 70 ? '10–15 years' : covenant >= 40 ? '5 years' : '1–3 years'}</div>
            <div>Preferred review frequency: {covenant >= 70 ? '5-year reviews' : '3-year reviews'}</div>
            <div>Break clause preference: {covenant < 40 ? 'Tenant break preferred' : 'None preferred'}</div>
            <div>Rent expectation: Asking £{askingPounds.toLocaleString()}/mo{covenant >= 70 && ' — strong covenants typically negotiate down 5–15%.'}</div>
          </div>
        </div>

        {/* Rent negotiation */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Proposed rent (£/mo)
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              value={proposedRentPounds}
              min={Math.round(askingPounds * 0.3)}
              max={Math.round(askingPounds * 3)}
              step={25}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) setProposedRentPounds(Math.max(1, v));
                setStage('open');
                setAgreedRentPounds(null);
                setTenantCounterPounds(null);
              }}
              className="flex-1 px-3 py-1.5 rounded-md bg-background/30 border border-border text-sm"
            />
            <span className="text-[11px] text-muted-foreground">
              Asking £{askingPounds.toLocaleString()}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Acceptance likelihood: <span className={cn(
              acceptanceChance >= 0.7 ? 'text-emerald-300' :
              acceptanceChance >= 0.4 ? 'text-amber-300' : 'text-red-300'
            )}>{Math.round(acceptanceChance * 100)}%</span>
          </div>
        </div>

        {!isReview && (<>
        {/* Lease length */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 flex-wrap">
            <Calendar className="h-3 w-3" /> Lease length
          </div>
          <div className="grid grid-cols-4 gap-2">
            {TERM_OPTIONS.map(opt => {
              const active = termYears === opt.years;
              const ok = tenantAcceptsTerm(opt.years, covenant);
              return (
                <button
                  key={opt.years}
                  type="button"
                  onClick={() => { setTermYears(opt.years); setStage('open'); setAgreedRentPounds(null); setTenantCounterPounds(null); }}
                  className={cn(
                    "px-2 py-1.5 rounded-md text-xs border transition-all",
                    active ? "ring-2 ring-primary bg-primary/10" : "bg-background/30 hover:bg-background/50",
                    !ok && "opacity-50",
                  )}
                  title={ok ? '' : 'Tenant unlikely to accept this term length'}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {!termOk && (
            <div className="text-[11px] text-red-300">
              ⚠ A covenant of {covenant} is unlikely to commit to {termYears} years.
            </div>
          )}
        </div>

        {/* Break clause */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Break clause
          </div>
          <div className="space-y-1.5">
            {BREAK_OPTIONS.map(opt => {
              const active = breakChoice === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBreakChoice(opt.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-xs border transition-all",
                    active ? "ring-2 ring-primary bg-primary/10" : "bg-background/30 hover:bg-background/50",
                  )}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground">{opt.help}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rent review frequency */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rent review frequency
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {REVIEW_OPTIONS.map(opt => {
              const active = reviewYears === opt.years;
              return (
                <button
                  key={opt.years}
                  type="button"
                  onClick={() => setReviewYears(opt.years)}
                  className={cn(
                    "px-2 py-1.5 rounded-md text-xs border transition-all",
                    active ? "ring-2 ring-primary bg-primary/10" : "bg-background/30 hover:bg-background/50",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        </>)}


        {/* Counter-offer / rejection feedback */}
        {stage === 'counter' && agreedRentPounds == null && tenantCounterPounds != null && (
          <div className="glass rounded-xl p-3 border border-amber-400/30 bg-amber-400/5 space-y-2">
            <div className="text-xs font-semibold text-amber-300 flex items-center gap-1 flex-wrap">
              <Handshake className="h-3 w-3" /> Tenant counter-offer
            </div>
            <div className="text-sm">
              {tenant.companyName ?? tenant.name} would prefer{' '}
              <span className="font-semibold text-foreground">£{tenantCounterPounds.toLocaleString()}/mo</span>.
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={handleAcceptCounter}>
                Accept £{tenantCounterPounds.toLocaleString()}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setStage('open'); setTenantCounterPounds(null); }}>
                Revise offer
              </Button>
            </div>
          </div>
        )}

        {stage === 'counter' && agreedRentPounds != null && (
          <div className="glass rounded-xl p-3 border border-emerald-400/30 bg-emerald-400/5">
            <div className="text-xs font-semibold text-emerald-300">
              ✓ Agreed at £{agreedRentPounds.toLocaleString()}/mo — ready to sign.
            </div>
          </div>
        )}

        {stage === 'rejected' && (
          <div className="glass rounded-xl p-3 border border-red-400/30 bg-red-400/5">
            <div className="text-xs font-semibold text-red-300">
              Tenant won't engage at these terms. Try a different lease length or break clause.
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {agreedRentPounds == null ? (
            <Button className="w-full sm:w-auto" onClick={handlePropose}>
              <Handshake className="h-4 w-4 mr-1" /> Propose terms
            </Button>
          ) : (
            <Button className="w-full sm:w-auto" onClick={handleSign}>
              <FileSignature className="h-4 w-4 mr-1" /> Sign Heads of Terms
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
