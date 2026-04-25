import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Gavel, Home, UserMinus, AlertTriangle, ShieldAlert } from "lucide-react";
import { fromPennies } from "@/lib/formatCurrency";
import { EvictionAppealDialog } from "@/components/ui/eviction-appeal-dialog";
import type { PendingEviction, Property, PropertyTenant, EvictionGround } from "@/types/game";

interface Props {
  pendingEvictions: PendingEviction[];
  ownedProperties: Pick<Property, 'id' | 'name' | 'condition'>[];
  tenants: PropertyTenant[];
  monthsPlayed: number;
  onAppealEviction?: (propertyId: string) => void;
}

const GROUND_META: Record<EvictionGround, { label: string; icon: typeof Gavel; tone: string }> = {
  rent_arrears: { label: "Rent Arrears", icon: AlertTriangle, tone: "text-danger border-danger/30" },
  landlord_sale: { label: "Landlord Sale", icon: Home, tone: "text-[hsl(var(--stat-credit))] border-[hsl(var(--stat-credit))]/30" },
  landlord_move_in: { label: "Landlord Move-In", icon: UserMinus, tone: "text-amber-400 border-amber-400/30" },
  antisocial_behaviour: { label: "Antisocial Behaviour", icon: ShieldAlert, tone: "text-danger border-danger/30" },
};

/** Format an in-game month index into a friendly "Month N (Year Y, Mon M)" label. */
function formatGameMonth(monthIndex: number): string {
  const year = Math.floor(monthIndex / 12) + 1;
  const monthInYear = (monthIndex % 12) + 1;
  return `Month ${monthIndex} · Y${year} M${monthInYear}`;
}

export function EvictionTimelineFeed({
  pendingEvictions,
  ownedProperties,
  tenants,
  monthsPlayed,
  onAppealEviction,
}: Props) {
  if (!pendingEvictions || pendingEvictions.length === 0) return null;

  // Sort by closest effective month first
  const sorted = [...pendingEvictions].sort((a, b) => a.effectiveMonth - b.effectiveMonth);

  return (
    <Card className="glass border-0 animate-fade-in">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Gavel className="h-4 w-4 text-amber-400" />
          Eviction Timeline
          <Badge variant="outline" className="text-xs border-amber-400/40 text-amber-300">
            {sorted.length} pending
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map(ev => {
          const meta = GROUND_META[ev.ground];
          const Icon = meta.icon;
          const property = ownedProperties.find(p => p.id === ev.propertyId);
          const tenantRec = tenants.find(t => t.propertyId === ev.propertyId);

          const totalNotice = Math.max(1, ev.effectiveMonth - ev.servedMonth);
          const elapsed = Math.max(0, monthsPlayed - ev.servedMonth);
          const monthsRemaining = Math.max(0, ev.effectiveMonth - monthsPlayed);
          const progressPct = Math.min(100, (elapsed / totalNotice) * 100);

          // Deposit refund estimate — mirrors store logic (50% withheld if dilapidated)
          const depositPennies = tenantRec?.depositHeld || 0;
          const isDilapidated = property?.condition === 'dilapidated';
          const refundEstimatePennies = isDilapidated
            ? Math.floor(depositPennies * 0.5)
            : depositPennies;

          return (
            <div
              key={ev.propertyId}
              className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-2"
            >
              <div className="flex items-start gap-3">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.tone.split(' ')[0]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">
                      {property?.name || ev.propertyId}
                    </span>
                    <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>
                      {meta.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
                      Tenant: {ev.tenantName}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1 mt-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Notice served</div>
                      <div className="font-medium">{formatGameMonth(ev.servedMonth)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Effective from</div>
                      <div className="font-medium text-amber-300">{formatGameMonth(ev.effectiveMonth)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Deposit refund (est.)</div>
                      <div className={`font-medium ${isDilapidated ? 'text-danger' : 'text-success'}`}>
                        £{fromPennies(refundEstimatePennies).toLocaleString()}
                        {isDilapidated && depositPennies > 0 && (
                          <span className="text-[10px] text-muted-foreground ml-1">(50% withheld)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Notice progress</span>
                  <span>
                    {monthsRemaining === 0
                      ? "Tenant vacates this month"
                      : `${monthsRemaining} month${monthsRemaining === 1 ? '' : 's'} remaining`}
                  </span>
                </div>
                <Progress value={progressPct} className="h-1.5" />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
