import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/stores/gameStore";
import { cn } from "@/lib/utils";
import type { MacroEconomicEvent } from "@/types/game";

const STYLES: Record<MacroEconomicEvent['type'], { ring: string; bg: string; emoji: string }> = {
  rate_cut:        { ring: "ring-green-500/40",  bg: "bg-green-500/10",  emoji: "📉" },
  rate_cut_small:  { ring: "ring-green-500/30",  bg: "bg-green-500/5",   emoji: "📉" },
  tech_boom:       { ring: "ring-blue-500/40",   bg: "bg-blue-500/10",   emoji: "🚀" },
  recession:       { ring: "ring-red-500/40",    bg: "bg-red-500/10",    emoji: "📉" },
  rate_hike:       { ring: "ring-amber-500/40",  bg: "bg-amber-500/10",  emoji: "📈" },
  mild_correction: { ring: "ring-amber-500/30",  bg: "bg-amber-500/5",   emoji: "〰️" },
};

export function MacroEventModal() {
  const economicEvents = useGameStore((s) => s.economicEvents);
  const seenIds = useGameStore((s) => ((s as any).seenEconomicEventIds || []) as string[]);
  const markSeen = useGameStore((s) => (s as any).markEconomicEventsSeen as (ids: string[]) => void);

  // Show the newest unseen event as a modal. Older unseen events stay in the
  // activity feed — we don't queue a stack of popups.
  const unseen = useMemo(() => {
    const seen = new Set(seenIds);
    return (economicEvents || []).filter((e) => !seen.has(e.id));
  }, [economicEvents, seenIds]);

  const current = unseen[unseen.length - 1] || null;
  const open = !!current;

  const handleClose = () => {
    // Mark every unseen event as seen so we don't queue old popups.
    if (unseen.length > 0) markSeen(unseen.map((e) => e.id));
  };

  if (!current) return null;
  const style = STYLES[current.type] || STYLES.mild_correction;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className={cn("max-w-sm border ring-1", style.ring, style.bg)}>
        <DialogHeader>
          <div className="text-4xl mb-2" aria-hidden>{style.emoji}</div>
          <DialogTitle className="text-lg">{current.name}</DialogTitle>
          <DialogDescription className="text-sm text-foreground/80">
            {current.description}
          </DialogDescription>
        </DialogHeader>
        <div className="text-xs text-muted-foreground">Month {current.month}</div>
        <DialogFooter>
          <Button onClick={handleClose} variant="default" className="w-full sm:w-auto">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
