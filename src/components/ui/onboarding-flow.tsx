import { useState } from "react";
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
  ArrowRight, Store, Landmark, ClipboardList, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntityType } from "@/types/game";

interface Props {
  open: boolean;
  /** Called when entity is picked. The tour continues after this. */
  onEntityPick: (entity: EntityType) => void;
  /** Called when the tour is finished or skipped (sets onboardingCompleted). */
  onFinish: () => void;
  /** If true, entity has already been chosen — jump straight to the tour (used for "Replay tour"). */
  skipEntity?: boolean;
}

const STEPS = [
  { icon: Home,      title: "Buy",       body: "Browse the estate agent or auction house. Properties in Middlesbrough start from £40k." },
  { icon: Users,     title: "Tenant",    body: "Pick a tenant — premium pays more but is fussy; budget is steadier on rent." },
  { icon: Wrench,    title: "Maintain",  body: "Resolve concerns before they bite satisfaction. Renovate to add value and boost rent." },
  { icon: PiggyBank, title: "Profit",    body: "Bank monthly cashflow, refinance equity, or sell up. Mind your tax bill in April." },
];

type Stage = 'welcome' | 'entity' | 'tour-market' | 'tour-bank' | 'tour-ops' | 'tour-alerts';

const TOUR_STEPS: { id: Stage; icon: typeof Store; title: string; body: string; index: number }[] = [
  { id: 'tour-market', icon: Store,         title: "The Market", index: 1,
    body: "Switch to the Market tab to view estate agent listings and the auction house. That's where you'll spend most of your first hour." },
  { id: 'tour-bank',   icon: Landmark,      title: "The Bank", index: 2,
    body: "The Bank tab gathers mortgages, overdraft, loans and your tax bill. Refinance equity here to fund your next deposit." },
  { id: 'tour-ops',    icon: ClipboardList, title: "Operations", index: 3,
    body: "Conveyancing, renovations and planning permission live in Operations. Open it to see what's in-flight and chase tenant concerns." },
  { id: 'tour-alerts', icon: Bell,          title: "Action Required", index: 4,
    body: "Evictions, deposit disputes and important warnings appear under Action Required. Clear them before they drag your reputation down." },
];

export function OnboardingFlow({ open, onEntityPick, onFinish, skipEntity = false }: Props) {
  const [stage, setStage] = useState<Stage>(skipEntity ? 'tour-market' : 'welcome');
  const [picked, setPicked] = useState<EntityType | null>(null);

  if (!open) return null;

  // ── Welcome ──
  if (stage === 'welcome') {
    return (
      <Dialog open={open}>
        <DialogContent className="max-w-2xl" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
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
            <Button variant="ghost" onClick={onFinish}>Skip intro</Button>
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
      <Dialog open={open}>
        <DialogContent className="max-w-2xl" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
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
            <Button variant="ghost" onClick={() => { if (picked) onEntityPick(picked); onFinish(); }} disabled={!picked}>
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

  // ── Tour steps ──
  const tourIndex = TOUR_STEPS.findIndex(s => s.id === stage);
  const tour = TOUR_STEPS[tourIndex];
  if (!tour) return null;
  const Icon = tour.icon;
  const isLast = tourIndex === TOUR_STEPS.length - 1;

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="rounded-lg bg-primary/15 p-1.5">
              <Icon className="h-5 w-5 text-primary" />
            </span>
            {tour.title}
            <span className="ml-auto text-xs text-muted-foreground font-normal">
              {tour.index} / {TOUR_STEPS.length}
            </span>
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-relaxed">
            {tour.body}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5 my-2">
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

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onFinish}>Skip tour</Button>
          <div className="flex gap-2">
            {tourIndex > 0 && (
              <Button variant="ghost" onClick={() => setStage(TOUR_STEPS[tourIndex - 1].id)}>
                Back
              </Button>
            )}
            <Button
              onClick={() => {
                if (isLast) onFinish();
                else setStage(TOUR_STEPS[tourIndex + 1].id);
              }}
            >
              {isLast ? <>Got it <Check className="h-4 w-4 ml-2" /></> : <>Next <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
