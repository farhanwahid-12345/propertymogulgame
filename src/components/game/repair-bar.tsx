import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RepairBarProps {
  score: number; // 0-100
  className?: string;
  showLabel?: boolean;
}

export function RepairBar({ score, className, showLabel = true }: RepairBarProps) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const colorClass =
    s >= 75 ? "bg-emerald-400" :
    s >= 55 ? "bg-blue-400" :
    s >= 35 ? "bg-amber-400" :
    "bg-red-400";
  const iconClass =
    s >= 75 ? "text-emerald-400" :
    s >= 55 ? "text-blue-400" :
    s >= 35 ? "text-amber-400" :
    "text-red-400";
  const label =
    s >= 75 ? "Excellent" :
    s >= 55 ? "Good" :
    s >= 35 ? "Worn" :
    "Dilapidated";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-2 px-1 cursor-help", className)}>
            <Wrench className={cn("h-3.5 w-3.5 shrink-0", iconClass)} />
            <div
              className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={s}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Property condition: ${label}`}
            >
              <div className={cn("h-full transition-all", colorClass)} style={{ width: `${s}%` }} />
            </div>

            {showLabel && (
              <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">{s}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="text-xs font-semibold mb-1">Property Condition: {label} ({s}/100)</div>
          <div className="text-[11px] text-muted-foreground">
            Decays with tenant wear over time. Boost via "Top Up Repairs" or full renovations. Premium tenants need ≥75, standard ≥55.
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
