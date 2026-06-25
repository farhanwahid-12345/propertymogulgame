import { useState, useCallback } from "react";
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
  Building2, User, Check, Home, Users, Wrench, PiggyBank, ArrowRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { EntityType } from "@/types/game";
import { useTutorialStore } from "@/stores/tutorialStore";
import { SCENARIO_STEPS } from "@/components/game/tutorial/scenarioSteps";

interface Props {
  open: boolean;
  onEntityPick: (entity: EntityType) => void;
  onFinish: () => void;
  skipEntity?: boolean;
  /** Kept for prop compatibility with OnboardingGate — no longer used. */
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

const STEPS = [
  { icon: Home,      title: "Buy",      body: "Browse the estate agent or auction house. Properties in Middlesbrough start from £40k." },
  { icon: Users,     title: "Tenant",   body: "Pick a tenant — premium pays more but is fussy; budget is steadier on rent." },
  { icon: Wrench,    title: "Maintain", body: "Resolve concerns before they bite satisfaction. Renovate to add value and boost rent." },
  { icon: PiggyBank, title: "Profit",   body: "Bank monthly cashflow, refinance equity, or sell up. Mind your tax bill in April." },
];

type Stage = "welcome" | "entity";

/**
 * Phase 2 — the floating coach card and TOUR_STEPS array have been removed.
 * After the entity picker is confirmed we hand off to the spotlight
 * TutorialEngine driven by SCENARIO_STEPS.
 */
export function OnboardingFlow({ open, onEntityPick, onFinish, skipEntity = false }: Props) {
  const [stage, setStage] = useState<Stage>("welcome");
  const [picked, setPicked] = useState<EntityType | null>(null);
  const startTutorial = useTutorialStore((s) => s.start);

  const beginScenario = useCallback(() => {
    startTutorial(SCENARIO_STEPS);
    onFinish();
  }, [startTutorial, onFinish]);

  if (!open) return null;

  // If we're resuming after an entity is already chosen, skip straight to
  // launching the tutorial scenario.
  if (skipEntity) {
    queueMicrotask(beginScenario);
    return null;
  }

  // ── Welcome ──
  if (stage === "welcome") {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) setStage("entity"); }}>
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
            <Button variant="ghost" onClick={() => setStage("entity")}>Skip intro</Button>
            <Button onClick={() => setStage("entity")} className="w-full sm:w-auto">
              Get started <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Entity pick ──
  return (
    <Dialog open={open} onOpenChange={() => { /* entity is mandatory */ }}>
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
            onClick={() => setPicked("sole_trader")}
            className={cn(
              "text-left glass rounded-2xl p-4 border transition-all",
              picked === "sole_trader" ? "border-primary/60 ring-2 ring-primary/40" : "border-white/10 hover:border-white/20",
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
            onClick={() => setPicked("ltd")}
            className={cn(
              "text-left glass rounded-2xl p-4 border transition-all",
              picked === "ltd" ? "border-primary/60 ring-2 ring-primary/40" : "border-white/10 hover:border-white/20",
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
          <Button
            variant="ghost"
            onClick={() => { if (picked) { onEntityPick(picked); onFinish(); } }}
            disabled={!picked}
          >
            Skip tour
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStage("welcome")}>Back</Button>
            <Button
              disabled={!picked}
              onClick={() => { if (picked) { onEntityPick(picked); beginScenario(); } }}
            >
              <Check className="h-4 w-4 mr-2" />
              Confirm {picked === "ltd" ? "Limited Company" : picked === "sole_trader" ? "Sole Trader" : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
