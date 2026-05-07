import { ReactNode, useState } from "react";
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
  defaultOpenMobile?: boolean;
  alwaysOpenDesktop?: boolean;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  id,
  title,
  badge,
  defaultOpenMobile = false,
  alwaysOpenDesktop = true,
  children,
  className,
}: CollapsibleSectionProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(defaultOpenMobile);

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
            "w-full glass rounded-2xl px-4 py-3 flex items-center justify-between",
            "text-left mb-2"
          )}
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{title}</span>
            {badge}
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    </section>
  );
}
