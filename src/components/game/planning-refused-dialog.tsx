import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { XCircle, AlertTriangle } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";

/**
 * Sibling to PlanningApprovedDialog. Auto-opens whenever the LPA refuses a
 * planning application so the player can't miss the bad news (toasts alone
 * were too easy to dismiss). Shows the refusal reason + cooldown countdown.
 */
export function PlanningRefusedDialog() {
  const pendingIds = useGameStore((s: any) => s.pendingPlanningRefusals as string[] | undefined) || [];
  const planningApplications = useGameStore((s: any) => s.planningApplications as any[]) || [];
  const propertyLocks = useGameStore((s: any) => s.propertyLocks as any[]) || [];
  const ownedProperties = useGameStore((s) => s.ownedProperties);
  const monthsPlayed = useGameStore((s) => s.monthsPlayed);
  const dismiss = useGameStore((s: any) => s.dismissPlanningRefusal);
  const clearAll = useGameStore((s: any) => s.clearPlanningRefusals);

  const items = useMemo(() => {
    return pendingIds
      .map((id) => {
        const app = planningApplications.find((a: any) => a.id === id);
        if (!app) return null;
        const propName =
          ownedProperties.find((p) => p.id === app.propertyId)?.name || "property";
        const lock = propertyLocks.find(
          (l: any) =>
            l.propertyId === app.propertyId &&
            l.reason === "planning_cooldown" &&
            l.untilMonth > monthsPlayed,
        );
        const cooldownMonths = lock ? Math.max(0, lock.untilMonth - monthsPlayed) : 0;
        return { id, app, propName, cooldownMonths };
      })
      .filter(Boolean) as Array<{ id: string; app: any; propName: string; cooldownMonths: number }>;
  }, [pendingIds, planningApplications, ownedProperties, propertyLocks, monthsPlayed]);

  const open = items.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) clearAll?.();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Planning refused
          </DialogTitle>
          <DialogDescription>
            The LPA has refused the {items.length === 1 ? "application" : "following applications"}.
            A 6-month cooldown applies before you can resubmit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {items.map(({ id, app, propName, cooldownMonths }) => (
            <div
              key={id}
              className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="font-medium text-sm">{app.renovationName}</span>
                </div>
                <div className="text-xs text-muted-foreground">{propName}</div>
                {app.refusalReason && (
                  <div className="text-[11px] text-muted-foreground italic mt-1">
                    "{app.refusalReason}"
                  </div>
                )}
                <Badge variant="outline" className="text-[10px] mt-1 border-destructive/40 text-destructive">
                  Cooldown: {cooldownMonths} mo until resubmission
                </Badge>
              </div>
              <Button size="sm" variant="ghost" onClick={() => dismiss?.(id)}>
                Got it
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => clearAll?.()}>
            Dismiss all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
