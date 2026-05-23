import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Hammer, FileText } from "lucide-react";
import type { Renovation, PlanningApplication } from "@/types/game";
import type { Property } from "@/components/ui/property-card";

interface RenovationTrackerProps {
  renovations: Renovation[];
  ownedProperties: Property[];
  /** Current in-game month — used for game-time progress. */
  monthsPlayed: number;
  /** Pending/decided planning applications. Refused entries are no longer surfaced here — see renovation dialog. */
  planningApplications?: PlanningApplication[];
  /** When true, render only the body (no outer glass card). */
  bare?: boolean;
  /** When true, hide planning applications (caller handles them in their own tab). */
  hidePlanning?: boolean;
}

export function RenovationTracker({
  renovations,
  ownedProperties,
  monthsPlayed,
  planningApplications = [],
  bare = false,
  hidePlanning = false,
}: RenovationTrackerProps) {
  // Only pending planning applications show up; refused entries live inside the renovation dialog cooldown banner.
  const visibleApplications = hidePlanning
    ? []
    : planningApplications.filter(a => a.status === 'pending');

  if ((!renovations || renovations.length === 0) && visibleApplications.length === 0) {
    if (bare) {
      return (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No active renovations.
        </p>
      );
    }
    return null;
  }

  const now = Date.now();

  const inner = (
    <div className="space-y-5">
      {renovations.length > 0 && (
        <div>
          {!bare && (
            <div className="flex items-center gap-2 mb-4">
              <Hammer className="h-5 w-5 text-orange-400" />
              <h2 className="text-xl font-bold text-foreground">Active Renovations</h2>
              <Badge variant="secondary" className="text-xs">{renovations.length}</Badge>
            </div>
          )}

          <div className="space-y-3">
            {renovations.map((r) => {
              const renovationType = r?.type;
              if (!renovationType) return null;

              const property = ownedProperties.find((p) => p.id === r.propertyId);

              let progress: number;
              let monthsRemaining: number;
              if (typeof r.completionMonth === 'number' && typeof r.startMonth === 'number') {
                const total = Math.max(1, r.completionMonth - r.startMonth);
                const elapsed = Math.max(0, Math.min(total, monthsPlayed - r.startMonth));
                progress = (elapsed / total) * 100;
                monthsRemaining = Math.max(0, r.completionMonth - monthsPlayed);
              } else {
                const total = Math.max(1, r.completionDate - r.startDate);
                const elapsed = Math.max(0, Math.min(total, now - r.startDate));
                progress = (elapsed / total) * 100;
                monthsRemaining = Math.ceil(Math.max(0, r.completionDate - now) / 180_000);
              }

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
      )}

      {visibleApplications.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-amber-300" />
            <h2 className="text-xl font-bold text-foreground">Planning Applications</h2>
            <Badge variant="secondary" className="text-xs">{visibleApplications.length}</Badge>
          </div>

          <div className="space-y-3">
            {visibleApplications.map((app) => {
              const property = ownedProperties.find((p) => p.id === app.propertyId);
              const total = Math.max(1, app.decisionMonth - app.submittedMonth);
              const elapsed = Math.max(0, Math.min(total, monthsPlayed - app.submittedMonth));
              const progress = (elapsed / total) * 100;
              const monthsRemaining = Math.max(0, app.decisionMonth - monthsPlayed);

              return (
                <div key={app.id} className="glass p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-amber-300 shrink-0" />
                      <span className="font-semibold text-sm truncate">
                        {property?.name || "Unknown Property"}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {app.renovationName}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-amber-400/30 text-amber-300">
                      Pending LPA decision
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {monthsRemaining === 0
                          ? "Decision imminent"
                          : `Decision in ~${monthsRemaining} ${monthsRemaining === 1 ? "month" : "months"}`}
                      </span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  if (bare) return inner;

  return <div className="glass p-5 animate-fade-in">{inner}</div>;
}
