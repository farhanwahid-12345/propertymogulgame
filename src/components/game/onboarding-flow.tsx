import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2, User, Check, Home, Users, Wrench, PiggyBank,
  ArrowRight, Store, Landmark, ClipboardList, Bell, X,
  ShoppingCart, CalendarDays, KeyRound, Heart, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ONBOARDING_DONE_KEY as LS_DONE_KEY } from "@/lib/onboarding";
import type { EntityType } from "@/types/game";

interface Props {
  open: boolean;
  onEntityPick: (entity: EntityType) => void;
  onFinish: () => void;
  skipEntity?: boolean;
  /** Active page tab (e.g. "market" | "bank"). Used to drive the tour. */
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

const STEPS = [
  { icon: Home,      title: "Buy",       body: "Browse the estate agent or auction house. Properties in Middlesbrough start from £40k." },
  { icon: Users,     title: "Tenant",    body: "Pick a tenant — premium pays more but is fussy; budget is steadier on rent." },
  { icon: Wrench,    title: "Maintain",  body: "Resolve concerns before they bite satisfaction. Renovate to add value and boost rent." },
  { icon: PiggyBank, title: "Profit",    body: "Bank monthly cashflow, refinance equity, or sell up. Mind your tax bill in April." },
];

type Stage = 'welcome' | 'entity' | 'tour-market' | 'tour-buying' | 'tour-bank' | 'tour-ops' | 'tour-monthend' | 'tour-mortgage' | 'tour-tenants' | 'tour-satisfaction' | 'tour-epc' | 'tour-renovations' | 'tour-tax' | 'tour-alerts';

interface TourStep {
  id: Stage;
  icon: typeof Store;
  title: string;
  body: string;
  index: number;
  /** Tab to switch to before scrolling/highlighting. */
  tab?: string;
  /** DOM id of the element to scroll into view and highlight. */
  scrollId?: string;
}

const TOUR_STEPS: TourStep[] = [
  { id: 'tour-market', icon: Store,         title: "The Market", index: 1, tab: 'market', scrollId: 'section-tabs',
    body: "This is the Market tab — estate agent listings and the auction house. We've switched you here now so you can see what's for sale." },
  { id: 'tour-buying', icon: ShoppingCart,  title: "Making an Offer", index: 2, tab: 'market', scrollId: 'section-market',
    body: "Pick a property, make an offer (cash or mortgage), then wait through conveyancing. Solicitor fees and stamp duty apply on completion." },
  { id: 'tour-bank',   icon: Landmark,      title: "The Bank", index: 3, tab: 'bank', scrollId: 'section-tabs',
    body: "The Bank tab covers mortgages, overdraft, loans and your tax bill. Refinance equity here to fund your next deposit." },
  { id: 'tour-mortgage', icon: KeyRound,    title: "Your first mortgage", index: 4, tab: 'market', scrollId: 'section-market',
    body: "When buying with a mortgage, your LTV (Loan to Value) determines your deposit. 75% LTV on a £100k property means a £25k deposit. Your credit score affects the rates you're offered — keep it above 700 for the best deals." },
  { id: 'tour-tenants', icon: Users,        title: "Tenants and deposit", index: 5, tab: 'market', scrollId: 'section-tabs',
    body: "Once your purchase completes, select a tenant from the applicants list. You'll hold 5 weeks' rent as a deposit in case of damage. Premium tenants pay more; risky tenants may miss rent but can be evicted for antisocial behaviour after 1 month." },
  { id: 'tour-satisfaction', icon: Heart,     title: "Satisfaction and concerns", index: 6, tab: 'bank', scrollId: 'section-ops',
    body: "Tenant satisfaction drops if you ignore repair concerns. Below 40% they may leave mid-tenancy. Respond to concerns within 1 month to avoid reputation damage. Your landlord reputation (shown in the header) affects your borrowing power." },
  { id: 'tour-epc', icon: Zap,              title: "EPC and MEES", index: 7, tab: 'bank', scrollId: 'section-ops',
    body: "Every property has an EPC rating (A–G). From 2030, any property rated D or below cannot be re-let. Improve ratings through the renovation menu — insulation, heating upgrades, and double glazing all help." },
  { id: 'tour-renovations', icon: Wrench,    title: "Operations and renovations", index: 8, tab: 'bank', scrollId: 'section-ops',
    body: "The Operations panel tracks your conveyancing, active renovations, and planning applications. Extensions and conversions require planning permission — submit first, then wait for approval before works can begin." },
  { id: 'tour-tax', icon: CalendarDays,      title: "Month end and tax", index: 9, tab: undefined, scrollId: 'game-clock-controls',
    body: "Rent, mortgage payments, council tax and expenses all settle at month end. In April (month 4, 16, 28…) your annual tax bill is calculated. As a sole trader, Section 24 limits your mortgage interest relief to a 20% tax credit — this is why many landlords incorporate." },
  { id: 'tour-alerts', icon: Bell,           title: "Action Required", index: 10, tab: 'market', scrollId: 'section-alerts',
    body: "Eviction notices, deposit disputes and financial warnings appear here. Evictions take 2+ months — serve notice early if a tenant is in persistent arrears. Clear all items before they compound into bigger problems." },
];



export function OnboardingFlow({ open, onEntityPick, onFinish, skipEntity = false, setActiveTab }: Props) {
  const [stage, setStage] = useState<Stage>(skipEntity ? 'tour-market' : 'welcome');
  const [picked, setPicked] = useState<EntityType | null>(null);

  // Drive the page underneath when entering a tour step.
  useEffect(() => {
    if (!open) return;
    const step = TOUR_STEPS.find(s => s.id === stage);
    if (!step) return;
    if (step.tab && setActiveTab) setActiveTab(step.tab);

    // Wait a tick so the new tab content paints before we scroll/highlight.
    const raf = requestAnimationFrame(() => {
      if (!step.scrollId) return;
      const el = document.getElementById(step.scrollId);
      if (!el) return;
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* noop */ }
      el.classList.add('tour-highlight');
      window.setTimeout(() => el.classList.remove('tour-highlight'), 2500);
    });
    return () => cancelAnimationFrame(raf);
  }, [stage, open, setActiveTab]);

  const finish = useCallback(() => {
    // Parent handles persistence (dismissTour) — single write path.
    onFinish();
  }, [onFinish]);

  if (!open) return null;

  // ── Welcome ──
  if (stage === 'welcome') {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) setStage('entity'); }}>
        <DialogContent className="max-w-2xl" onPointerDownOutside={(e) => e.preventDefault()}>

          <DialogHeader>
            <DialogTitle className="text-xl">Welcome to Property Tycoon 🏘️</DialogTitle>
            <DialogDescription>
              You start with <strong className="text-foreground">£100,000</strong> cash. Build a buy-to-let empire on Teesside.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-2">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className="glass rounded-2xl p-3 border border-white/10 text-center">
                  <Icon className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <div className="font-semibold text-sm mb-1">{s.title}</div>
                  <div className="text-[11px] text-muted-foreground leading-snug">{s.body}</div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => setStage('entity')}>Skip intro</Button>
            <Button onClick={() => setStage('entity')} className="w-full sm:w-auto">
              Get started <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Entity pick ──
  if (stage === 'entity') {
    return (
      <Dialog open={open} onOpenChange={() => { /* entity choice is mandatory; ignore close */ }}>
        <DialogContent className="max-w-2xl" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-xl">How will you trade?</DialogTitle>
            <DialogDescription>
              Choose your business structure. This affects how rental income and gains are taxed. You can incorporate to LTD later for £1,000.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPicked('sole_trader')}
              className={cn(
                "text-left glass rounded-2xl p-4 border transition-all",
                picked === 'sole_trader' ? "border-primary/60 ring-2 ring-primary/40" : "border-white/10 hover:border-white/20",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-semibold"><User className="h-4 w-4 text-emerald-400" />Sole Trader</div>
                <Badge variant="outline" className="text-[10px]">No setup fee</Badge>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                <li>Income tax 20 / 40 / 45% bands + £12,570 allowance</li>
                <li>Mortgage interest: <span className="text-amber-300">20% tax credit only</span> (Section 24)</li>
                <li>CGT on sales: 24%</li>
              </ul>
            </button>

            <button
              type="button"
              onClick={() => setPicked('ltd')}
              className={cn(
                "text-left glass rounded-2xl p-4 border transition-all",
                picked === 'ltd' ? "border-primary/60 ring-2 ring-primary/40" : "border-white/10 hover:border-white/20",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-sky-400" />Limited Company</div>
                <Badge variant="outline" className="text-[10px] border-amber-400/40 text-amber-300">£1,000 setup</Badge>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                <li>Corp tax 19% → 25% with marginal relief</li>
                <li>Mortgage interest: <span className="text-emerald-300">fully deductible</span></li>
                <li>No CGT — gains taxed as profit</li>
              </ul>
            </button>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => { if (picked) onEntityPick(picked); finish(); }} disabled={!picked}>
              Skip tour
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStage('welcome')}>Back</Button>
              <Button
                disabled={!picked}
                onClick={() => { if (picked) { onEntityPick(picked); setStage('tour-market'); } }}
              >
                <Check className="h-4 w-4 mr-2" />
                Confirm {picked === 'ltd' ? 'Limited Company' : picked === 'sole_trader' ? 'Sole Trader' : ''}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Tour steps: non-blocking floating coach card ──
  const tourIndex = TOUR_STEPS.findIndex(s => s.id === stage);
  const tour = TOUR_STEPS[tourIndex];
  if (!tour) return null;
  const Icon = tour.icon;
  const isLast = tourIndex === TOUR_STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-label={tour.title}
      className={cn(
        "fixed z-50 pointer-events-auto",
        // Mobile: bottom sheet style; Desktop: bottom-right floating card
        "left-3 right-3 bottom-3 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[22rem]",
      )}
    >
      <div className="glass rounded-2xl border border-white/10 shadow-2xl p-4 bg-background/90 backdrop-blur-xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded-lg bg-primary/15 p-1.5">
            <Icon className="h-5 w-5 text-primary" />
          </span>
          <span className="font-semibold text-base">{tour.title}</span>
          <span className="ml-auto text-xs text-muted-foreground">{tour.index} / {TOUR_STEPS.length}</span>
          <button
            type="button"
            aria-label="Close tour"
            onClick={finish}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{tour.body}</p>

        <div className="flex gap-1.5 my-3">
          {TOUR_STEPS.map((s, i) => (
            <div
              key={s.id}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= tourIndex ? "bg-primary" : "bg-white/10",
              )}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>Skip tour</Button>
          <div className="flex gap-2">
            {tourIndex > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStage(TOUR_STEPS[tourIndex - 1].id)}>
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                if (isLast) finish();
                else setStage(TOUR_STEPS[tourIndex + 1].id);
              }}
            >
              {isLast ? <>Got it <Check className="h-4 w-4 ml-2" /></> : <>Next <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { LS_DONE_KEY as ONBOARDING_DONE_KEY };
