import { ReactNode, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  id?: string;
  title: ReactNode;
  badge?: ReactNode;
  /** One-line summary visible when collapsed (right-aligned in trigger). */
  summary?: ReactNode;
  defaultOpenMobile?: boolean;
  /** When false, the section can be collapsed on desktop too. Default true (legacy). */
  alwaysOpenDesktop?: boolean;
  /** Default open state on desktop when alwaysOpenDesktop is false. */
  defaultOpenDesktop?: boolean;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  id,
  title,
  badge,
  summary,
  defaultOpenMobile = false,
  alwaysOpenDesktop = true,
  defaultOpenDesktop = true,
  children,
  className,
}: CollapsibleSectionProps) {
  const isMobile = useIsMobile();
  const storageKey = id ? `pm:section-open:${id}` : null;

  const initialOpen = (() => {
    if (typeof window !== "undefined" && storageKey) {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "1") return true;
      if (stored === "0") return false;
    }
    return isMobile ? defaultOpenMobile : defaultOpenDesktop;
  })();

  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    if (storageKey) {
      window.localStorage.setItem(storageKey, open ? "1" : "0");
    }
  }, [open, storageKey]);

  // Legacy: desktop "always open" — render plainly with no chrome
  if (!isMobile && alwaysOpenDesktop) {
    return (
      <section id={id} className={className}>
        {children}
      </section>
    );
  }

  return (
    <section id={id} className={className}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          data-collapse-trigger
          data-state={open ? "open" : "closed"}
          className={cn(
            "w-full glass rounded-2xl px-4 py-3 flex items-center justify-between gap-3",
            "text-left mb-2"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-foreground truncate">{title}</span>
            {badge}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!open && summary ? (
              <span className="text-xs text-muted-foreground truncate max-w-[260px]">
                {summary}
              </span>
            ) : null}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    </section>
  );
}
