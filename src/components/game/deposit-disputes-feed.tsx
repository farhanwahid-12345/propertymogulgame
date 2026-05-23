import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gavel, BadgePoundSterling, CheckCircle2, XCircle, Scale } from "lucide-react";
import { fromPennies } from "@/lib/formatCurrency";
import type { DepositDispute } from "@/types/game";

interface Props {
  disputes: DepositDispute[];
  onDispute: (disputeId: string) => void;
  onDismiss: (disputeId: string) => void;
}

const STATUS_META: Record<DepositDispute['status'], { label: string; tone: string; icon: typeof Gavel }> = {
  open: { label: "Open", tone: "text-amber-300 border-amber-400/40", icon: Gavel },
  won: { label: "You Won", tone: "text-success border-success/40", icon: CheckCircle2 },
  settled: { label: "Settled 50/50", tone: "text-amber-300 border-amber-400/40", icon: Scale },
  lost: { label: "Tenant Won", tone: "text-danger border-danger/40", icon: XCircle },
};

export function DepositDisputesFeed({ disputes, onDispute, onDismiss }: Props) {
  if (!disputes || disputes.length === 0) return null;
  const sorted = [...disputes].sort((a, b) => {
    if (a.status === 'open' && b.status !== 'open') return -1;
    if (a.status !== 'open' && b.status === 'open') return 1;
    return b.raisedMonth - a.raisedMonth;
  });

  return (
    <Card className="glass border-0 animate-fade-in">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BadgePoundSterling className="h-4 w-4 text-amber-400" />
          Deposit Disputes
          <Badge variant="outline" className="text-xs border-amber-400/40 text-amber-300">
            {sorted.filter(d => d.status === 'open').length} open
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map(d => {
          const meta = STATUS_META[d.status];
          const Icon = meta.icon;
          return (
            <div
              key={d.id}
              className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-2"
            >
              <div className="flex items-start gap-3">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.tone.split(' ')[0]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{d.propertyName}</span>
                    <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.label}</Badge>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
                      Tenant: {d.tenantName}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Withheld</div>
                      <div className="font-medium text-amber-300">£{fromPennies(d.withheldAmount).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Already refunded</div>
                      <div className="font-medium">£{fromPennies(d.refundedAmount).toLocaleString()}</div>
                    </div>
                  </div>

                  {d.status === 'open' && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      The tenant has lodged a TDS adjudication request. You can defend the deduction (free) or refund the full amount.
                    </p>
                  )}
                </div>
              </div>

              {d.status === 'open' ? (
                <div className="flex flex-wrap gap-2 pt-1 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => onDismiss(d.id)}
                  >
                    Refund in Full
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="text-xs"
                    onClick={() => onDispute(d.id)}
                  >
                    <Scale className="h-3 w-3 mr-1" />
                    Defend at TDS
                  </Button>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => onDismiss(d.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
