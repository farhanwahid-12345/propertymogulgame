import { useEffect, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Phase 3 #6 — Contextual MEES/EPC tutorial.
 *
 * Fires once the first time the player encounters a sub-Band-E (E/F/G) property
 * anywhere — estate agent listings, auction lots, or owned portfolio.
 * Persists via `seenEpcTutorial`.
 */
export function EpcTutorialDialog() {
  const seen = useGameStore((s: any) => s.seenEpcTutorial);
  const estate = useGameStore((s) => s.estateAgentProperties);
  const auction = useGameStore((s) => s.auctionProperties);
  const owned = useGameStore((s) => s.ownedProperties);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (seen) return;
    const all = [...(estate || []), ...(auction || []), ...(owned || [])];
    const triggered = all.some((p: any) =>
      p?.epcRating && ['E', 'F', 'G'].includes(p.epcRating),
    );
    if (triggered) setOpen(true);
  }, [seen, estate, auction, owned]);

  const dismiss = () => {
    setOpen(false);
    useGameStore.setState({ seenEpcTutorial: true } as any);
  };

  if (seen) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>📋 EPC & MEES — what to watch for</DialogTitle>
          <DialogDescription>
            Just spotted a property with a poor Energy Performance Certificate. Here's why it matters.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <strong className="text-amber-300">Today</strong>
            <p className="text-muted-foreground mt-1">
              Properties rated <strong>F or G</strong> cannot legally be let
              under MEES (Minimum Energy Efficiency Standards). You'll need to
              upgrade before a tenant can move in.
            </p>
          </div>
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <strong className="text-destructive">From 2030 (in-game month 60)</strong>
            <p className="text-muted-foreground mt-1">
              The minimum rises to <strong>Band C</strong>. Anything D or worse
              becomes unlettable. Plan EPC upgrades into your renovation
              pipeline early — the Renovation dialog lets you choose a target
              band.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Cheap F/G stock can be a bargain if you can afford the works. Run
            the numbers before you bid.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={dismiss}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
