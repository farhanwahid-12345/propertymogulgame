import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface FirstTimeTooltipProps {
  id: string;
  content: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}

const activeIds = new Set<string>();

export function FirstTimeTooltip({ id, content, side = "top", children }: FirstTimeTooltipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (activeIds.has(id)) return;
    const key = `ftt_${id}`;
    if (localStorage.getItem(key)) return;

    activeIds.add(id);
    localStorage.setItem(key, "1");
    setVisible(true);

    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, [id]);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div className="relative">
      {children}
      {visible && (
        <div className={cn(
          "absolute z-50 glass rounded-xl p-3 text-xs leading-snug max-w-[280px] shadow-lg animate-fade-in border border-primary/40",
          positionClasses[side]
        )}>
          <div className="font-semibold text-foreground mb-1">Did you know?</div>
          <div className="text-muted-foreground">{content}</div>
        </div>
      )}
    </div>
  );
}
