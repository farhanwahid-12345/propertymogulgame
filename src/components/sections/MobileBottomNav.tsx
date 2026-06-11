/**
 * Phase 3 (v5) — fixed bottom navigation for mobile (< md breakpoint).
 *
 * Lets players jump between the Market and Bank tabs and scroll to the
 * portfolio section without scrolling back to the top action row.
 * Hidden at md+ where the inline tabs are already in view.
 */
import { Store, Landmark, Building2, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function MobileBottomNav({ activeTab, setActiveTab }: Props) {
  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const Btn = ({
    label,
    icon: Icon,
    active,
    onClick,
  }: {
    label: string;
    icon: typeof Store;
    active?: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[56px] min-w-[44px] rounded-xl transition-colors",
        active
          ? "text-primary bg-primary/15"
          : "text-muted-foreground hover:text-foreground active:bg-white/5",
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-white/10 px-2 pt-1"
      style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      aria-label="Primary navigation"
    >
      <div className="flex items-stretch gap-1">
        <Btn
          label="Market"
          icon={Store}
          active={activeTab === "market"}
          onClick={() => {
            setActiveTab("market");
            scrollToId("section-tabs");
          }}
        />
        <Btn
          label="Bank"
          icon={Landline}
          active={activeTab === "bank"}
          onClick={() => {
            setActiveTab("bank");
            scrollToId("section-tabs");
          }}
        />
        <Btn label="Portfolio" icon={Building2} onClick={() => scrollToId("section-tabs")} />
        <Btn
          label="Top"
          icon={ArrowUp}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        />
      </div>
    </nav>
  );
}
