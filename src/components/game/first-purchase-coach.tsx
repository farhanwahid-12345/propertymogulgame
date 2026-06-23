import { PartyPopper, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LS_KEY = "pm_first_purchase_coach_seen";

export function isFirstPurchaseCoachSeen(): boolean {
  try {
    return window.localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function markFirstPurchaseCoachSeen() {
  try {
    window.localStorage.setItem(LS_KEY, "1");
  } catch {
    /* noop */
  }
}

interface Props {
  onShowMe: () => void;
  onDismiss: () => void;
}

export function FirstPurchaseCoach({ onShowMe, onDismiss }: Props) {
  const handleDismiss = () => {
    markFirstPurchaseCoachSeen();
    onDismiss();
  };

  return (
    <div
      role="dialog"
      aria-label="First purchase coach"
      className={cn(
        "fixed z-50 pointer-events-auto",
        "left-3 right-3 bottom-3 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[22rem]",
      )}
    >
      <div className="glass rounded-2xl border border-white/10 shadow-2xl p-4 bg-background/90 backdrop-blur-xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded-lg bg-primary/15 p-1.5">
            <PartyPopper className="h-5 w-5 text-primary" />
          </span>
          <span className="font-semibold text-base">Your first property!</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={handleDismiss}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors ml-auto"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Now head to the <strong className="text-foreground">Your Empire</strong> section and pick a tenant from the applicants. You'll see their profile, risk level, and the rent they'll pay. Once placed, rent arrives at the end of each month automatically. Keep an eye on Operations for any concerns they raise.
        </p>

        <div className="flex items-center justify-between gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            Got it
          </Button>
          <Button
            size="sm"
            onClick={() => {
              markFirstPurchaseCoachSeen();
              onShowMe();
            }}
          >
            Show me
          </Button>
        </div>
      </div>
    </div>
  );
}
