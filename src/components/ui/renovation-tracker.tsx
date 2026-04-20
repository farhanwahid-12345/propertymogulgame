import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Hammer } from "lucide-react";
import type { Renovation } from "@/types/game";
import type { Property } from "@/components/ui/property-card";

interface RenovationTrackerProps {
  renovations: Renovation[];
  ownedProperties: Property[];
}

export function RenovationTracker({ renovations, ownedProperties }: RenovationTrackerProps) {
  if (!renovations || renovations.length === 0) return null;

  const now = Date.now();

  return (
    <div className="glass p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Hammer className="h-5 w-5 text-orange-400" />
        <h2 className="text-xl font-bold text-foreground">Active Renovations</h2>
        <Badge variant="secondary" className="text-xs">{renovations.length}</Badge>
      </div>

      <div className="space-y-3">
        {renovations.map((r) => {
          const renovationType = r?.type;
          if (!renovationType) return null;

          const property = ownedProperties.find((p) => p.id === r.propertyId);
          const total = Math.max(1, r.completionDate - r.startDate);
          const elapsed = Math.max(0, Math.min(total, now - r.startDate));
          const progress = (elapsed / total) * 100;
          const msRemaining = Math.max(0, r.completionDate - now);
          // 1 in-game month = 180s = 180_000ms
          const monthsRemaining = Math.ceil(msRemaining / 180_000);
          const Icon = renovationType.icon || Hammer;

          return (
            <div key={r.id} className="glass p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-4 w-4 text-orange-400 shrink-0" />
                  <span className="font-semibold text-sm truncate">
                    {property?.name || "Unknown Property"}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {renovationType.name}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  Spent: <span className="text-foreground font-medium">£{renovationType.cost.toLocaleString()}</span>
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {monthsRemaining === 0
                      ? "Completes shortly"
                      : `Completes in ~${monthsRemaining} ${monthsRemaining === 1 ? "month" : "months"}`}
                  </span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-success">+£{renovationType.rentIncrease}/mo rent</span>
                <span className="text-success">+£{renovationType.valueIncrease.toLocaleString()} value</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
