import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SaleEvent {
  kind: 'offer' | 'counter' | 'accepted' | 'walkaway';
  title: string;
  message: string;
}

const TONE: Record<SaleEvent['kind'], string> = {
  offer: "border-emerald-400/30 bg-emerald-400/5 text-emerald-200",
  counter: "border-amber-400/30 bg-amber-400/5 text-amber-200",
  accepted: "border-emerald-400/30 bg-emerald-400/5 text-emerald-200",
  walkaway: "border-red-400/30 bg-red-400/5 text-red-200",
};

/**
 * Improvements #7 item 5 — surfaces sale milestones (offers, counter-offers,
 * acceptances, walk-aways) as pop-ups now that the dashboard listings panel has
 * moved into the Estate Agent window. Events are queued so a busy month-end
 * doesn't drop any.
 */
export function SaleEventDialog() {
  const [queue, setQueue] = useState<SaleEvent[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as SaleEvent | undefined;
      if (!detail?.title) return;
      setQueue(prev => (prev.length >= 6 ? prev : [...prev, detail]));
    };
    window.addEventListener('pm:sale-event', handler as EventListener);
    return () => window.removeEventListener('pm:sale-event', handler as EventListener);
  }, []);

  const current = queue[0];
  if (!current) return null;

  const dismiss = () => setQueue(prev => prev.slice(1));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-md w-[92vw]">
        <DialogHeader>
          <DialogTitle className="text-base">{current.title}</DialogTitle>
        </DialogHeader>
        <div className={`glass rounded-xl p-3 border text-sm ${TONE[current.kind]}`}>
          {current.message}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" onClick={dismiss}>
            {queue.length > 1 ? `Next (${queue.length - 1} more)` : 'Got it'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
