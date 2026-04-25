import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, Volume2, Droplets, Plug, ShieldAlert, Smile } from "lucide-react";
import { fromPennies } from "@/lib/formatCurrency";
import type { TenantConcern } from "@/types/game";
import type { Property } from "@/types/game";

interface Props {
  concerns: TenantConcern[];
  ownedProperties: Pick<Property, 'id' | 'name'>[];
  playerCash: number; // pennies
  monthsPlayed: number;
  onResolve: (concernId: string) => void;
  onSnooze: (concernId: string) => void;
}

const CATEGORY_ICON = {
  maintenance: Wrench,
  noise: Volume2,
  mould: Droplets,
  appliance: Plug,
  safety: ShieldAlert,
} as const;

const CATEGORY_LABEL = {
  maintenance: "Maintenance",
  noise: "Noise",
  mould: "Mould / Damp",
  appliance: "Appliance",
  safety: "Safety",
} as const;

export function TenantConcernsFeed({
  concerns,
  ownedProperties,
  playerCash,
  monthsPlayed,
  onResolve,
  onSnooze,
}: Props) {
  const active = concerns.filter(c => c && !c.resolvedMonth);
  const propName = (id: string) => ownedProperties.find(p => p.id === id)?.name || "Unknown property";

  return (
    <Card className="glass border-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          🛠️ Tenant Concerns
          {active.length > 0 && (
            <Badge variant="outline" className="text-xs border-amber-400/40 text-amber-300">
              {active.length} active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {active.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Smile className="h-4 w-4 text-emerald-400" />
            No concerns — tenants are happy 😊
          </div>
        ) : (
          active.map(c => {
            const Icon = CATEGORY_ICON[c.category] || Wrench;
            const monthsOpen = Math.max(0, monthsPlayed - (c.raisedMonth || 0));
            const cost = fromPennies(c.resolveCost || 0);
            const canAfford = playerCash >= (c.resolveCost || 0);
            return (
              <div
                key={c.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/40"
              >
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${c.source === 'damage' ? 'text-red-400' : 'text-amber-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{propName(c.propertyId)}</span>
                    {c.source === 'damage' ? (
                      <Badge variant="destructive" className="text-[10px]">
                        🔧 Damage
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {CATEGORY_LABEL[c.category] || "Maintenance"}
                      </Badge>
                    )}
                    {monthsOpen > 0 && (
                      <Badge variant="outline" className="text-[10px] border-red-400/30 text-red-400">
                        {monthsOpen}mo open · -{c.satisfactionPenaltyIfIgnored || 0}/mo
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.description || "Tenant concern"}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    disabled={!canAfford}
                    onClick={() => onResolve(c.id)}
                  >
                    Resolve £{cost.toLocaleString()}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => onSnooze(c.id)}
                  >
                    Snooze
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
