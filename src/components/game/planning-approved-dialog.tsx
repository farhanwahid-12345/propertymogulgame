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
import { CheckCircle2, Sparkles } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";

/**
 * Celebration dialog that auto-opens whenever a planning application is
 * approved. Listed entries clear individually as the player acknowledges
 * them. Players still start the renovation manually from the property card
 * — by design, so they don't burn cash on an unintended click.
 */
export function PlanningApprovedDialog() {
  const pendingIds = useGameStore((s: any) => s.pendingPlanningCelebrations as string[] | undefined) || [];
  const planningApplications = useGameStore((s: any) => s.planningApplications as any[]) || [];
  const ownedProperties = useGameStore((s) => s.ownedProperties);
  const dismiss = useGameStore((s: any) => s.dismissPlanningCelebration);
  const clearAll = useGameStore((s: any) => s.clearPlanningCelebrations);

  const items = useMemo(() => {
    return pendingIds
      .map((id) => {
        const app = planningApplications.find((a: any) => a.id === id);
        if (!app) return null;
        const propName =
          ownedProperties.find((p) => p.id === app.propertyId)?.name || "property";
        return { id, app, propName };
      })
      .filter(Boolean) as Array<{ id: string; app: any; propName: string }>;
  }, [pendingIds, planningApplications, ownedProperties]);

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
            <Sparkles className="h-5 w-5 text-[hsl(var(--stat-credit))]" />
            Planning approved
          </DialogTitle>
          <DialogDescription>
            The LPA has signed off on the {items.length === 1 ? "application" : "following applications"}.
            Open the property in your portfolio to start the work.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {items.map(({ id, app, propName }) => (
            <div
              key={id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-card/50 p-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="font-medium text-sm">{app.renovationName}</span>
                </div>
                <div className="text-xs text-muted-foreground">{propName}</div>
                {app.refusalReason ? null : (
                  <Badge variant="outline" className="text-[10px] mt-1">
                    Ready to build
                  </Badge>
                )}
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
