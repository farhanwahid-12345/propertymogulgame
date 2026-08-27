import { useMemo, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Hourglass, FileText, Hammer, Wrench, Sparkles, ShieldAlert, Tag, Coins, Megaphone,
} from "lucide-react";
import { ConveyancingTracker } from "@/components/game/conveyancing-tracker";
import { RenovationTracker } from "@/components/game/renovation-tracker";
import { TenantConcernsFeed } from "@/components/game/tenant-concerns-feed";
import { fromPennies } from "@/lib/formatCurrency";
import type {
  Conveyancing,
  Renovation,
  PlanningApplication,
  TenantConcern,
  TenantDeparture,
  TenantEvent,
  MacroEconomicEvent,
  TaxRecord,
  PendingEviction,
  PropertyListing,
  ExTenantDebt,
  CommercialSearchUpdate,
} from "@/types/game";

interface OperationsCenterProps {
  monthsPlayed: number;
  conveyancing: Conveyancing[];
  renovations: Renovation[];
  planningApplications: PlanningApplication[];
  tenantConcerns: TenantConcern[];
  ownedProperties: Array<{ id: string; name: string }>;
  ownedPropertiesFull: any[]; // for renovation tracker
  playerCash: number; // pennies
  onResolveConcern: (id: string) => void;
  onSnoozeConcern: (id: string) => void;
  onWithdrawConveyancing?: (conveyancingId: string) => void;
  // activity feed
  tenantHistory?: TenantDeparture[];
  tenantEvents?: Array<TenantEvent & { amount: number }>;
  economicEvents?: MacroEconomicEvent[];
  taxRecords?: TaxRecord[];
  // Phase 2 — evictions / listings / ex-tenant debts
  pendingEvictions?: PendingEviction[];
  propertyListings?: PropertyListing[];
  exTenantDebts?: ExTenantDebt[];
  onCancelEviction?: (propertyId: string, slotIndex?: number) => void;
  onCancelListing?: (propertyId: string) => void;
  onFileExTenantCCJ?: (debtId: string) => void;
  onNegotiateExTenantSettlement?: (debtId: string, pct: number) => void;
  onWriteOffExTenantDebt?: (debtId: string) => void;
  onRefileExTenantCCJ?: (debtId: string) => void;
  // Phase 7 — commercial letting agent comms
  commercialSearchUpdates?: CommercialSearchUpdate[];
  commercialAgentChase?: Record<string, number>;
  vacantCommercialProperties?: Array<{ id: string; name: string; preMarketing?: boolean; monthlyIncome?: number }>;
  onChaseCommercialAgent?: (propertyId: string) => void;
  /** Improvements #7 item 2 — pipeline used to answer agent questions. */
  pendingCommercialApplicants?: Array<{ propertyId: string; tenant: any; arrivalMonth: number }>;
}

type TabKey =
  | "conveyancing" | "planning" | "renovations" | "concerns"
  | "evictions" | "listings" | "extdebts" | "commercial";


/** Improvements #7 item 2 — questions the player can put to the lettings agent. */
const AGENT_QUESTIONS: Array<{ key: 'howLong' | 'better' | 'howMuch'; label: string }> = [
  { key: 'howLong', label: 'How long will this take?' },
  { key: 'better', label: 'Can we find better tenants?' },
  { key: 'howMuch', label: 'How much more could we get?' },
];

/** Derive a concrete, data-driven answer from the live applicant pipeline. */
function answerAgentQuestion(
  key: 'howLong' | 'better' | 'howMuch',
  pipeline: Array<{ tenant: any; arrivalMonth: number }>,
  monthsPlayed: number,
  prop: { preMarketing?: boolean; monthlyIncome?: number },
): string {
  const arrived = pipeline.filter(a => a.arrivalMonth <= monthsPlayed);
  const upcoming = pipeline.filter(a => a.arrivalMonth > monthsPlayed)
    .sort((a, b) => a.arrivalMonth - b.arrivalMonth);
  const covOf = (a: { tenant: any }) => a.tenant?.covenantStrength ?? 50;
  const bestArrivedCov = arrived.length ? Math.max(...arrived.map(covOf)) : 0;
  const bestUpcoming = upcoming[0];

  if (key === 'howLong') {
    if (arrived.length > 0) {
      return `You already have ${arrived.length} applicant${arrived.length === 1 ? '' : 's'} ready to view terms — we could have heads of terms agreed this month.`;
    }
    if (bestUpcoming) {
      const eta = Math.max(1, bestUpcoming.arrivalMonth - monthsPlayed);
      return `We expect the next applicant in ~${eta} month${eta === 1 ? '' : 's'}. Realistically ${eta}–${eta + 2} months to a signed lease.`;
    }
    return prop.preMarketing
      ? `Nothing firm yet, but marketing early usually secures a replacement within 3–5 months of lease end.`
      : `Nothing firm yet — typical letting time for a unit like this is 3–6 months.`;
  }

  if (key === 'better') {
    const chance = arrived.length === 0 ? 45 : bestArrivedCov >= 75 ? 12 : bestArrivedCov >= 60 ? 28 : 45;
    const strongerUpcoming = upcoming.find(a => covOf(a) > bestArrivedCov);
    if (strongerUpcoming) {
      return `Yes — a stronger covenant (${Math.round(covOf(strongerUpcoming))}/100) is due around month ${strongerUpcoming.arrivalMonth}. Roughly a ${chance}% chance per month of an even better one appearing.`;
    }
    return bestArrivedCov >= 75
      ? `Unlikely — the covenant on the table (${Math.round(bestArrivedCov)}/100) is about as strong as this location attracts. Only ~${chance}% chance of better each month.`
      : `Possible — roughly a ${chance}% chance each month of a stronger covenant enquiring. Holding out costs you the void rent in the meantime.`;
  }

  // howMuch
  const asking = prop.monthlyIncome ?? 0;
  const upliftLow = Math.round(asking * 0.03);
  const upliftHigh = Math.round(asking * (bestArrivedCov >= 70 ? 0.06 : 0.12));
  if (asking <= 0) {
    return `Hard to say without a rent on file — we'd benchmark against comparable units in the parade first.`;
  }
  return `Realistically £${upliftLow.toLocaleString()}–£${upliftHigh.toLocaleString()}/mo above the current figure${bestArrivedCov >= 70 ? ' — but a strong covenant will resist much more than that' : ' if you can wait for a better covenant'}.`;
}

export function OperationsCenter(props: OperationsCenterProps) {
  const {
    monthsPlayed,
    conveyancing,
    renovations,
    planningApplications,
    tenantConcerns,
    ownedProperties,
    ownedPropertiesFull,
    playerCash,
    onResolveConcern,
    onSnoozeConcern,
    onWithdrawConveyancing,
    pendingEvictions = [],
    propertyListings = [],
    exTenantDebts = [],
    onCancelEviction,
    onCancelListing,
    onFileExTenantCCJ,
    onNegotiateExTenantSettlement,
    onWriteOffExTenantDebt,
    onRefileExTenantCCJ,
    commercialSearchUpdates = [],
    commercialAgentChase = {},
    pendingCommercialApplicants = [],
    vacantCommercialProperties = [],
    onChaseCommercialAgent,
  } = props;

  // Improvements #7 item 2 — agent Q&A answers, keyed by `${propertyId}:${question}`.
  const [agentAnswers, setAgentAnswers] = useState<Record<string, string>>({});

  const ownedIds = new Set(ownedProperties.map(p => p.id));
  const nameOf = (id: string) => ownedProperties.find(p => p.id === id)?.name || id;

  const openDebts = exTenantDebts.filter(d => d.status !== 'settled' && d.status !== 'written_off');

  const counts = useMemo(() => {
    const conv = conveyancing.length;
    const plan = planningApplications.filter(a => a.status === 'pending').length;
    const reno = renovations.length;
    const concerns = tenantConcerns.filter(c => c && !c.resolvedMonth && ownedIds.has(c.propertyId)).length;
    const ev = pendingEvictions.length;
    const lis = propertyListings.length;
    const ext = openDebts.length;
    const comm = vacantCommercialProperties.length;
    return { conv, plan, reno, concerns, ev, lis, ext, comm };
  }, [conveyancing, planningApplications, renovations, tenantConcerns, ownedIds, pendingEvictions, propertyListings, openDebts, vacantCommercialProperties]);

  const totalActionable = counts.conv + counts.plan + counts.reno + counts.concerns + counts.ev + counts.lis + counts.ext + counts.comm;
  const allEmpty = totalActionable === 0;

  const defaultTab: TabKey = useMemo(() => {
    if (counts.concerns > 0) return "concerns";
    if (counts.ev > 0) return "evictions";
    if (counts.ext > 0) return "extdebts";
    if (counts.conv > 0) return "conveyancing";
    if (counts.plan > 0) return "planning";
    if (counts.lis > 0) return "listings";
    return "renovations";
  }, [counts]);

  const [tab, setTab] = useState<TabKey>(defaultTab);
  // Re-sync when there's nothing on current tab and default has changed
  useEffect(() => {
    const isCurrentEmpty =
      (tab === "conveyancing" && counts.conv === 0) ||
      (tab === "planning" && counts.plan === 0) ||
      (tab === "renovations" && counts.reno === 0) ||
      (tab === "concerns" && counts.concerns === 0) ||
      (tab === "evictions" && counts.ev === 0) ||
      (tab === "listings" && counts.lis === 0) ||
      (tab === "extdebts" && counts.ext === 0) ||
      (tab === "commercial" && counts.comm === 0);
    if (isCurrentEmpty) setTab(defaultTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTab]);

  // Phase 2 — listen for deep-link events from compact property-card badges.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: string } | undefined;
      const requested = detail?.tab;
      if (requested === 'evictions') setTab('evictions');
      else if (requested === 'listings') setTab('listings');
      else if (requested === 'extdebts') setTab('extdebts');
      else if (requested === 'commercial') setTab('commercial');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pm:open-operations', handler as EventListener);
      return () => window.removeEventListener('pm:open-operations', handler as EventListener);
    }
  }, []);

  if (allEmpty) {
    return null;
  }

  const tabDef: Array<{ key: TabKey; label: string; icon: any; count: number }> = [
    { key: "evictions", label: "Evictions", icon: ShieldAlert, count: counts.ev },
    { key: "listings", label: "Listings", icon: Tag, count: counts.lis },
    { key: "extdebts", label: "Ex-Debts", icon: Coins, count: counts.ext },
    { key: "commercial", label: "Comm. Letting", icon: Megaphone, count: counts.comm },
    { key: "conveyancing", label: "Conveyancing", icon: Hourglass, count: counts.conv },
    { key: "planning", label: "Planning", icon: FileText, count: counts.plan },
    { key: "renovations", label: "Renovations", icon: Hammer, count: counts.reno },
    { key: "concerns", label: "Concerns", icon: Wrench, count: counts.concerns },
  ];

  return (
    <div className="glass p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Operations</h2>
          {totalActionable > 0 && (
            <Badge variant="secondary" className="text-xs">{totalActionable} active</Badge>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="flex flex-wrap w-full bg-white/[0.06] border-0 mb-3 h-auto">
          {tabDef.map(t => {
            const Icon = t.icon;
            return (
              <TabsTrigger
                key={t.key}
                value={t.key}
                data-tutorial={t.key === 'conveyancing' ? 'ops-conveyancing' : t.key === 'concerns' ? 'ops-concerns' : undefined}
                className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg text-xs gap-1.5 flex-1 min-w-[90px]"
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
                {t.count > 0 && (
                  <Badge variant="outline" className="ml-0.5 h-4 px-1 text-[10px] border-current">
                    {t.count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="max-h-[360px] overflow-y-auto pr-1">
          <TabsContent value="conveyancing" className="mt-0">
            <ConveyancingTracker conveyancing={conveyancing} monthsPlayed={monthsPlayed} bare onWithdraw={onWithdrawConveyancing} />
          </TabsContent>

          <TabsContent value="planning" className="mt-0">
            {counts.plan === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No pending planning applications.
              </p>
            ) : (
              <RenovationTracker
                renovations={[]}
                ownedProperties={ownedPropertiesFull}
                monthsPlayed={monthsPlayed}
                planningApplications={planningApplications}
                bare
              />
            )}
          </TabsContent>

          <TabsContent value="renovations" className="mt-0">
            <RenovationTracker
              renovations={renovations}
              ownedProperties={ownedPropertiesFull}
              monthsPlayed={monthsPlayed}
              planningApplications={planningApplications}
              hidePlanning
              bare
            />
          </TabsContent>

          <TabsContent value="concerns" className="mt-0">
            <TenantConcernsFeed
              concerns={tenantConcerns}
              ownedProperties={ownedProperties}
              playerCash={playerCash}
              monthsPlayed={monthsPlayed}
              onResolve={onResolveConcern}
              onSnooze={onSnoozeConcern}
              onNavigateToRenovations={(propertyId) => {
                setTab('renovations');
                requestAnimationFrame(() => {
                  const el = document.querySelector(`[data-property-id="${propertyId}"]`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  // Phase 6 #15 — auto-open the renovation dialog for the target property.
                  window.dispatchEvent(
                    new CustomEvent('pm:open-renovation-for-property', { detail: { propertyId } })
                  );
                });
              }}
              bare
            />
          </TabsContent>

          <TabsContent value="evictions" className="mt-0 space-y-2">
            {pendingEvictions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No pending evictions.</p>
            ) : pendingEvictions.map((ev) => {
              const remaining = Math.max(0, ev.effectiveMonth - monthsPlayed);
              return (
                <div key={`${ev.propertyId}_${ev.slotIndex ?? 0}_${ev.servedMonth}`} className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs space-y-0.5">
                    <div className="font-semibold text-destructive flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {nameOf(ev.propertyId)}
                      {(ev.slotIndex ?? 0) > 0 && <span className="text-muted-foreground">· unit {(ev.slotIndex ?? 0) + 1}</span>}
                    </div>
                    <div className="text-muted-foreground">
                      {ev.tenantName} · Ground: {ev.ground.replace(/_/g, ' ')}
                    </div>
                    <div className="text-muted-foreground">
                      Served month {ev.servedMonth} · Vacates by month {ev.effectiveMonth} ({remaining}mo remaining)
                    </div>
                  </div>
                  {onCancelEviction && (
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onCancelEviction(ev.propertyId, ev.slotIndex)}>
                      Cancel notice
                    </Button>
                  )}
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="listings" className="mt-0 space-y-2">
            {propertyListings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No properties on the market.</p>
            ) : propertyListings.map((l: any) => {
              const days = l.listingMonth != null ? `${monthsPlayed - l.listingMonth}mo on market` : '';
              const offers = (l.offers || []).length;
              return (
                <div key={l.propertyId} className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs space-y-0.5">
                    <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5" />
                      {nameOf(l.propertyId)}
                    </div>
                    <div className="text-muted-foreground">
                      Asking £{Math.round(l.askingPrice ?? 0).toLocaleString()} · {days}
                    </div>
                    <div className="text-muted-foreground">
                      {offers === 0 ? 'No offers yet' : `${offers} offer${offers === 1 ? '' : 's'} — open the property card to review`}
                    </div>
                  </div>
                  {onCancelListing && (
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onCancelListing(l.propertyId)}>
                      Cancel listing
                    </Button>
                  )}
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="extdebts" className="mt-0 space-y-2">
            {openDebts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No outstanding ex-tenant debts.</p>
            ) : openDebts.map((d) => {
              const filedMo = d.ccjFiledMonth ?? -999;
              const canRefile = d.status === 'ccj_filed' && (monthsPlayed - filedMo) >= 6;
              return (
                <div key={d.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="text-xs space-y-0.5">
                      <div className="font-semibold text-foreground">{d.tenantName} <span className="text-muted-foreground font-normal">— {d.propertyName}</span></div>
                      <div className="text-muted-foreground">
                        Owed originally: £{fromPennies(d.originalArrearsPennies).toLocaleString()} · Recovered: £{fromPennies(d.totalRecoveredPennies).toLocaleString()} · Outstanding: £{fromPennies(d.remainingDebtPennies).toLocaleString()}
                      </div>
                      <div className="text-muted-foreground">Vacated month {d.vacatedMonth}</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        d.status === 'monthly_recovery' ? 'text-green-300 border-green-400/40 bg-green-500/10' :
                        d.status === 'ccj_filed' ? 'text-amber-300 border-amber-400/40 bg-amber-500/10' :
                        'text-muted-foreground border-white/20'
                      }
                    >
                      {d.status === 'monthly_recovery'
                        ? `Recovering £${fromPennies(d.monthlyRecoveryPennies || 0).toLocaleString()}/mo`
                        : d.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {d.status === 'chasing' && onFileExTenantCCJ && (
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onFileExTenantCCJ(d.id)}>
                        ⚖️ File CCJ (£100)
                      </Button>
                    )}
                    {canRefile && onRefileExTenantCCJ && (
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onRefileExTenantCCJ(d.id)}>
                        Re-file CCJ (£100)
                      </Button>
                    )}
                    {d.status !== 'monthly_recovery' && onNegotiateExTenantSettlement && (
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onNegotiateExTenantSettlement(d.id, 0.55)}>
                        Negotiate 55% settlement
                      </Button>
                    )}
                    {onWriteOffExTenantDebt && (
                      <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onWriteOffExTenantDebt(d.id)}>
                        Write off
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="commercial" className="mt-0 space-y-3">
            {vacantCommercialProperties.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No vacant commercial units.</p>
            ) : vacantCommercialProperties.map(prop => {
              const propUpdates = commercialSearchUpdates
                .filter(u => u.propertyId === prop.id)
                .sort((a, b) => b.month - a.month)
                .slice(0, 6);
              const latest = propUpdates[0];
              const pipelineFor = (id: string) =>
                pendingCommercialApplicants.filter(a => a.propertyId === id);
              const lastChase = commercialAgentChase[prop.id] ?? -999;
              const canChase = (monthsPlayed - lastChase) >= 2;
              const chaseWait = Math.max(0, 2 - (monthsPlayed - lastChase));
              return (
                <div key={prop.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="text-xs space-y-0.5">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <Megaphone className="h-3.5 w-3.5 text-primary" />
                        {prop.name}
                        {prop.preMarketing && (
                          <Badge variant="outline" className="border-amber-400/40 bg-amber-500/10 text-amber-300 text-[9px]">
                            Pre-marketing
                          </Badge>
                        )}
                      </div>
                      {latest?.estimatedNextApplicantMonth != null && (
                        <div className="text-muted-foreground">
                          Next applicant expected ~ month {latest.estimatedNextApplicantMonth}
                          {' '}({Math.max(0, latest.estimatedNextApplicantMonth - monthsPlayed)}mo)
                          {' · '}{latest.leadCount} lead{latest.leadCount === 1 ? '' : 's'} in pipeline
                        </div>
                      )}
                    </div>
                    {onChaseCommercialAgent && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={!canChase}
                        onClick={() => onChaseCommercialAgent(prop.id)}
                      >
                        {canChase ? '📣 Chase agent' : `Chase in ${chaseWait}mo`}
                      </Button>
                    )}
                  </div>
                  {/* Improvements #7 item 2 — ask the lettings agent */}
                  <div className="flex flex-wrap gap-1.5">
                    {AGENT_QUESTIONS.map(q => (
                      <Button
                        key={q.key}
                        size="sm"
                        variant="secondary"
                        className="h-6 text-[10px] px-2"
                        onClick={() => setAgentAnswers(prev => ({
                          ...prev,
                          [`${prop.id}:${q.key}`]: answerAgentQuestion(
                            q.key,
                            pipelineFor(prop.id),
                            monthsPlayed,
                            prop,
                          ),
                        }))}
                      >
                        {q.label}
                      </Button>
                    ))}
                  </div>
                  {AGENT_QUESTIONS.some(q => agentAnswers[`${prop.id}:${q.key}`]) && (
                    <div className="rounded-md border border-sky-400/30 bg-sky-500/5 p-2 space-y-1">
                      {AGENT_QUESTIONS.map(q => {
                        const a = agentAnswers[`${prop.id}:${q.key}`];
                        if (!a) return null;
                        return (
                          <div key={q.key} className="text-[11px]">
                            <span className="text-sky-300 font-medium">{q.label}</span>
                            <span className="text-foreground/90"> — {a}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {propUpdates.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">No updates yet — first month-end report incoming.</p>
                    ) : propUpdates.map(u => (
                      <div key={u.id} className="text-[11px] flex items-start gap-2">
                        <Badge
                          variant="outline"
                          className={
                            u.kind === 'advice' ? 'border-sky-400/40 bg-sky-500/10 text-sky-300' :
                            u.kind === 'new_enquiry' ? 'border-green-400/40 bg-green-500/10 text-green-300' :
                            u.kind === 'chase' ? 'border-amber-400/40 bg-amber-500/10 text-amber-300' :
                            'border-white/20 text-muted-foreground'
                          }
                        >
                          M{u.month}
                        </Badge>
                        <span className="text-foreground/90 flex-1">
                          {u.kind === 'advice' && <span className="mr-1">💡</span>}
                          {u.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
