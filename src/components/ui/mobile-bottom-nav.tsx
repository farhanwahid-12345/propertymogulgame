import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  alertCount?: number;
}

const NAV_ITEMS = [
  { id: "market", label: "Market", icon: "🏪", target: "section-market" },
  { id: "ops", label: "Ops", icon: "🔨", target: "section-ops" },
  { id: "empire", label: "Empire", icon: "🏰", target: "section-empire" },
  { id: "bank", label: "Bank", icon: "🏦", target: null },
  { id: "alerts", label: "Alerts", icon: "⚠️", target: "section-alerts" },
];

export function MobileBottomNav({ activeTab, onTabChange, alertCount = 0 }: MobileBottomNavProps) {
  const handleClick = (item: typeof NAV_ITEMS[number]) => {
    if (item.id === "market" || item.id === "bank") {
      onTabChange(item.id);
      const el = document.getElementById("section-tabs");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (item.target) {
      const el = document.getElementById(item.target);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      // also expand collapsible if any
      const trigger = el?.querySelector<HTMLButtonElement>("[data-collapse-trigger]");
      if (trigger?.getAttribute("data-state") === "closed") trigger.click();
    }
  };

  return (
    <nav
      className={cn(
        "md:hidden fixed bottom-0 inset-x-0 z-40",
        "glass border-t border-white/10",
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const active = (item.id === "market" || item.id === "bank") && activeTab === item.id;
          const showBadge = item.id === "alerts" && alertCount > 0;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => handleClick(item)}
                className={cn(
                  "relative w-full h-14 flex flex-col items-center justify-center gap-0.5",
                  "text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span>{item.label}</span>
                {showBadge && (
                  <Badge
                    variant="destructive"
                    className="absolute top-1 right-1/2 translate-x-3 h-4 min-w-4 px-1 text-[9px]"
                  >
                    {alertCount > 9 ? "9+" : alertCount}
                  </Badge>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
