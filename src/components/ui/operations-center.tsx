import { useMemo, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Hourglass, FileText, Hammer, Wrench, Sparkles } from "lucide-react";
import { ConveyancingTracker } from "@/components/ui/conveyancing-tracker";
import { RenovationTracker } from "@/components/ui/renovation-tracker";
import { TenantConcernsFeed } from "@/components/ui/tenant-concerns-feed";
import type {
  Conveyancing,
  Renovation,
  PlanningApplication,
  TenantConcern,
  TenantDeparture,
  TenantEvent,
  MacroEconomicEvent,
  TaxRecord,
} from "@/types/game";

interface OperationsCenterProps {
  monthsPlayed: number;
  conveyancing: Conveyancing[];
  renovations: Renovation[];
  planningApplications: PlanningApplication[];
  tenantConcerns: TenantConcern[];
  ownedProperties: Array<{ id: string; name: string }>;
  ownedPropertiesFull: any[]; // for renovation tracker
  playerCash: number; // pennies
  onResolveConcern: (id: string) => void;
  onSnoozeConcern: (id: string) => void;
  onWithdrawConveyancing?: (conveyancingId: string) => void;
  // activity feed
  tenantHistory?: TenantDeparture[];
  tenantEvents?: Array<TenantEvent & { amount: number }>;
  economicEvents?: MacroEconomicEvent[];
  taxRecords?: TaxRecord[];
}

type TabKey = "conveyancing" | "planning" | "renovations" | "concerns";

export function OperationsCenter(props: OperationsCenterProps) {
  const {
    monthsPlayed,
    conveyancing,
    renovations,
    planningApplications,
    tenantConcerns,
    ownedProperties,
    ownedPropertiesFull,
    playerCash,
    onResolveConcern,
    onSnoozeConcern,
    onWithdrawConveyancing,
    tenantHistory = [],
    tenantEvents = [],
    economicEvents = [],
    taxRecords = [],
  } = props;

  const ownedIds = new Set(ownedProperties.map(p => p.id));

  const counts = useMemo(() => {
    const conv = conveyancing.length;
    const plan = planningApplications.filter(a => a.status === 'pending').length;
    const reno = renovations.length;
    const concerns = tenantConcerns.filter(c => c && !c.resolvedMonth && ownedIds.has(c.propertyId)).length;
    return { conv, plan, reno, concerns };
  }, [conveyancing, planningApplications, renovations, tenantConcerns, ownedIds]);

  const totalActionable = counts.conv + counts.plan + counts.reno + counts.concerns;
  const allEmpty =
    counts.conv === 0 &&
    counts.plan === 0 &&
    counts.reno === 0 &&
    counts.concerns === 0;

  // Default tab → first non-empty
  const defaultTab: TabKey = useMemo(() => {
    if (counts.concerns > 0) return "concerns";
    if (counts.conv > 0) return "conveyancing";
    if (counts.plan > 0) return "planning";
    return "renovations";
  }, [counts]);

  const [tab, setTab] = useState<TabKey>(defaultTab);
  // Re-sync when there's nothing on current tab and default has changed
  useEffect(() => {
    const isCurrentEmpty =
      (tab === "conveyancing" && counts.conv === 0) ||
      (tab === "planning" && counts.plan === 0) ||
      (tab === "renovations" && counts.reno === 0) ||
      (tab === "concerns" && counts.concerns === 0);
    if (isCurrentEmpty) setTab(defaultTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTab]);

  if (allEmpty) {
    return (
      <div className="glass p-3 animate-fade-in flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-emerald-400" />
        All quiet — no operations in progress.
      </div>
    );
  }

  const tabDef: Array<{ key: TabKey; label: string; icon: any; count: number }> = [
    { key: "conveyancing", label: "Conveyancing", icon: Hourglass, count: counts.conv },
    { key: "planning", label: "Planning", icon: FileText, count: counts.plan },
    { key: "renovations", label: "Renovations", icon: Hammer, count: counts.reno },
    { key: "concerns", label: "Concerns", icon: Wrench, count: counts.concerns },
  ];

  return (
    <div className="glass p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Operations</h2>
          {totalActionable > 0 && (
            <Badge variant="secondary" className="text-xs">{totalActionable} active</Badge>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="grid w-full grid-cols-4 bg-white/[0.06] border-0 mb-3">
          {tabDef.map(t => {
            const Icon = t.icon;
            return (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg text-xs gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
                {t.count > 0 && (
                  <Badge variant="outline" className="ml-0.5 h-4 px-1 text-[10px] border-current">
                    {t.count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="max-h-[360px] overflow-y-auto pr-1">
          <TabsContent value="conveyancing" className="mt-0">
            <ConveyancingTracker conveyancing={conveyancing} monthsPlayed={monthsPlayed} bare />
          </TabsContent>

          <TabsContent value="planning" className="mt-0">
            {counts.plan === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No pending planning applications.
              </p>
            ) : (
              <RenovationTracker
                renovations={[]}
                ownedProperties={ownedPropertiesFull}
                monthsPlayed={monthsPlayed}
                planningApplications={planningApplications}
                bare
              />
            )}
          </TabsContent>

          <TabsContent value="renovations" className="mt-0">
            <RenovationTracker
              renovations={renovations}
              ownedProperties={ownedPropertiesFull}
              monthsPlayed={monthsPlayed}
              planningApplications={planningApplications}
              hidePlanning
              bare
            />
          </TabsContent>

          <TabsContent value="concerns" className="mt-0">
            <TenantConcernsFeed
              concerns={tenantConcerns}
              ownedProperties={ownedProperties}
              playerCash={playerCash}
              monthsPlayed={monthsPlayed}
              onResolve={onResolveConcern}
              onSnooze={onSnoozeConcern}
              bare
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
