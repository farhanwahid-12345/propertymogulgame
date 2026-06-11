/**
 * Phase 3 (v5) — lightweight "Install Property Mogul" banner.
 *
 * Shown on second+ session if the browser fires `beforeinstallprompt`.
 * Dismissal is sticky via localStorage.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pm_install_dismissed";

export function InstallPromptBanner({ sessionCount }: { sessionCount: number }) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (hidden || !evt || sessionCount < 2) return null;

  const install = async () => {
    try {
      await evt.prompt();
      await evt.userChoice;
    } finally {
      setEvt(null);
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* noop */
    }
    setHidden(true);
  };

  return (
    <div
      role="region"
      aria-label="Install app"
      className="fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-4 z-50 max-w-[92vw] w-[360px] glass rounded-2xl border border-white/10 px-3 py-2 shadow-lg flex items-center gap-3"
    >
      <span className="text-lg" aria-hidden="true">📲</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Install Property Mogul</p>
        <p className="text-[11px] text-muted-foreground leading-tight">
          Play offline, faster launches.
        </p>
      </div>
      <Button size="sm" className="h-8 px-3 text-xs" onClick={install}>
        Install
      </Button>
      <button
        type="button"
        aria-label="Dismiss install banner"
        onClick={dismiss}
        className="text-muted-foreground hover:text-foreground p-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
