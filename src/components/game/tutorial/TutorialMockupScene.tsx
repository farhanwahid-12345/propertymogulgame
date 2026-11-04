import type { TutorialMockup } from "@/stores/tutorialStore";
import { TutorialMockupCard } from "./TutorialMockups";

/**
 * Large "practice" preview of a game screen, shown beside the tutorial card
 * when the real element is not on screen (e.g. the player skipped buying).
 * Purely visual — no game state is read or changed.
 */
const SCREEN_TITLE: Record<TutorialMockup, string> = {
  purchase: "Estate Agent · Purchase details",
  conveyancing: "Operations · Conveyancing",
  tenant: "Property · Choose a tenant",
  rent: "Your portfolio · Monthly rent",
  concerns: "Operations · Tenant concerns",
  epc: "Your portfolio · EPC rating",
  renovate: "Property · Renovations",
  evictions: "Operations · Evictions",
};

function FakeCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold">🏠 89 Borough Road</span>
        <span className="rounded-md bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-bold">EPC D</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Value", "£52k"], ["Net /mo", "+£273"], ["Yield", "11.8%"]].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-muted/50 py-1.5">
            <div className="text-[10px] text-muted-foreground">{k}</div>
            <div className="text-sm font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <span className="flex-1 rounded-md bg-primary text-primary-foreground text-center text-xs py-1.5">Select tenant</span>
        <span className="flex-1 rounded-md border border-border text-center text-xs py-1.5">Renovate</span>
      </div>
    </div>
  );
}

export function TutorialMockupScene({ kind }: { kind: TutorialMockup }) {
  return (
    <div className="glass w-[380px] max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 bg-muted/40">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
        <span className="ml-2 text-xs font-medium">{SCREEN_TITLE[kind]}</span>
        <span className="ml-auto rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-semibold uppercase">Example</span>
      </div>
      <div className="p-4 space-y-3">
        {kind !== "evictions" && kind !== "purchase" && <FakeCard />}
        <TutorialMockupCard kind={kind} />
        <p className="text-[11px] text-muted-foreground">
          This is a preview. Buy a property to see the real thing in your game.
        </p>
      </div>
    </div>
  );
}
