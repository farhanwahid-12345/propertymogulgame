import type { TutorialMockup } from "@/stores/tutorialStore";

/**
 * Static illustration cards shown inside the tutorial tooltip when the real
 * element for a step isn't on screen (e.g. the player skipped buying).
 * Purely visual — no game state is read or changed.
 */
function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className={strong ? "font-semibold text-foreground" : "text-foreground"}>{v}</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1.5 mb-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80 mb-1">
        Example
      </div>
      {children}
    </div>
  );
}

function PropertyHeader() {
  return (
    <div className="flex items-center justify-between mb-1">
      <span className="text-sm font-semibold">🏠 89 Borough Road</span>
      <span className="text-[10px] text-muted-foreground">Middlesbrough</span>
    </div>
  );
}

export function TutorialMockupCard({ kind }: { kind: TutorialMockup }) {
  switch (kind) {
    case "purchase":
      return (
        <Shell>
          <PropertyHeader />
          <Row k="Price" v="£52,000" strong />
          <Row k="Mortgage (75% LTV)" v="£39,000" />
          <Row k="Deposit" v="£13,000" />
          <Row k="Stamp duty" v="£1,560" />
          <Row k="Solicitor" v="£600" />
          <Row k="Mortgage fee (1%)" v="£390" />
          <div className="border-t border-border pt-1.5">
            <Row k="Cash needed" v="£15,550" strong />
          </div>
        </Shell>
      );
    case "conveyancing":
      return (
        <Shell>
          <PropertyHeader />
          <div className="text-xs text-muted-foreground">Conveyancing in progress · 2 months left</div>
          <div className="h-1.5 rounded-full bg-border overflow-hidden">
            <div className="h-full w-1/3 bg-primary" />
          </div>
        </Shell>
      );
    case "tenant":
      return (
        <Shell>
          <div className="text-xs font-semibold mb-1">Applicants</div>
          <Row k="⭐ Professional couple" v="£560/mo" />
          <Row k="🎓 Student" v="£510/mo" />
          <Row k="👨‍👩‍👧 Family" v="£470/mo" />
          <div className="text-[10px] text-muted-foreground pt-1">Reference checks: £75</div>
        </Shell>
      );
    case "rent":
      return (
        <Shell>
          <PropertyHeader />
          <Row k="Rent" v="£513/mo" strong />
          <Row k="Mortgage" v="−£180/mo" />
          <Row k="Insurance & costs" v="−£60/mo" />
          <div className="border-t border-border pt-1.5">
            <Row k="Cash flow" v="+£273/mo" strong />
          </div>
        </Shell>
      );
    case "concerns":
      return (
        <Shell>
          <PropertyHeader />
          <Row k="🔧 Boiler not heating" v="Fix £350" />
          <div className="text-[10px] text-muted-foreground">1 month before satisfaction drops</div>
          <Row k="Satisfaction" v="72%" />
        </Shell>
      );
    case "epc":
      return (
        <Shell>
          <PropertyHeader />
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primary/20 text-primary px-2 py-0.5 text-xs font-bold">EPC D</span>
            <span className="text-[10px] text-muted-foreground">Must reach C before 2030 to re-let</span>
          </div>
        </Shell>
      );
    case "renovate":
      return (
        <Shell>
          <PropertyHeader />
          <Row k="Insulation (EPC +1)" v="£2,500" />
          <Row k="New kitchen" v="£6,000" />
          <Row k="Rear extension · planning" v="£28,000" />
        </Shell>
      );
    case "evictions":
      return (
        <Shell>
          <div className="text-sm font-semibold mb-1">🏬 Unit 4, Parkway Retail</div>
          <Row k="Arrears" v="2 months" strong />
          <Row k="Forfeit (re-entry)" v="Instant · ~1 in 3 win relief" />
          <Row k="Court route" v="1 mo notice + 2–5 mo" />
        </Shell>
      );
    default:
      return null;
  }
}
