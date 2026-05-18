import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ReputationLogEntry {
  id: string;
  month: number;
  reason: string;
  delta: number;
  category: string;
}

interface ReputationBadgeProps {
  reputation: number;
  log: ReputationLogEntry[];
}

export function ReputationBadge({ reputation, log }: ReputationBadgeProps) {
  // Trend = sum of last 6 deltas (recent activity)
  const recent = log.slice(-6);
  const recentSum = recent.reduce((s, e) => s + e.delta, 0);
  const trend = recentSum > 0 ? "▲" : recentSum < 0 ? "▼" : "•";
  const trendColor = recentSum > 0 ? "text-success" : recentSum < 0 ? "text-danger" : "text-muted-foreground";

  // Last 10 entries to display, newest first
  const display = [...log].slice(-10).reverse();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[10px] font-medium hover:bg-amber-400/25 transition-colors"
          aria-label={`Landlord reputation: ${Math.round(reputation)} of 100`}
        >
          ⭐ {Math.round(reputation)}
          <span className={cn("ml-0.5", trendColor)}>{trend}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h4 className="font-semibold text-sm">Landlord Reputation</h4>
            <span className="text-xs text-muted-foreground">{Math.round(reputation)}/100</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Gates premium tenants &amp; investor loans. Earned through fair evictions of anti-social tenants;
            lost via walkouts, contested evictions, deposit disputes.
          </p>
          <div className="border-t pt-2">
            <div className="text-[11px] font-medium mb-1">
              Recent activity {recentSum !== 0 && (
                <span className={trendColor}>
                  ({recentSum > 0 ? "+" : ""}{recentSum} pts)
                </span>
              )}
            </div>
            {display.length === 0 ? (
              <div className="text-[11px] text-muted-foreground italic">
                No reputation events yet.
              </div>
            ) : (
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {display.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-2 text-[11px]">
                    <span className="text-foreground/80 leading-snug truncate flex-1">
                      <span className="text-muted-foreground">M{e.month} ·</span> {e.reason}
                    </span>
                    <span className={cn(
                      "font-semibold tabular-nums shrink-0",
                      e.delta > 0 ? "text-success" : "text-danger",
                    )}>
                      {e.delta > 0 ? "+" : ""}{e.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
