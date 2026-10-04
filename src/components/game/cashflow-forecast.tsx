import { useMemo, useState } from "react";
import { LineChart as LineIcon } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/stores/gameStore";
import { useForecastWorker } from "@/hooks/useForecastWorker";
import { fromPennies } from "@/lib/formatCurrency";

const gbp = (p: number) => `£${Math.round(fromPennies(p)).toLocaleString()}`;

export function CashflowForecastButton() {
  const [open, setOpen] = useState(false);
  const cash = useGameStore(st => st.cash);
  const monthsPlayed = useGameStore(st => st.monthsPlayed);
  const ownedProperties = useGameStore(st => st.ownedProperties);
  const tenants = useGameStore(st => st.tenants);
  const mortgages = useGameStore(st => st.mortgages);
  const args = useMemo(() => open ? {
    cash, monthsPlayed, ownedProperties, tenants: tenants || [], mortgages: mortgages || [],
  } : null, [open, cash, monthsPlayed, ownedProperties, tenants, mortgages]);
  const { data } = useForecastWorker(args);
  const firstNegative = data.find(d => d.cash < 0);
  const fixes = data.filter(d => d.fixEnding.length > 0);
  const chart = data.map(d => ({ label: `M${d.month}`, cash: fromPennies(d.cash), net: fromPennies(d.net) }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <LineIcon className="h-3.5 w-3.5" /> Forecast
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl glass border-border bg-background/95">
        <DialogHeader><DialogTitle>12-month cash-flow forecast</DialogTitle></DialogHeader>
        {firstNegative ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
            Cash is projected to go negative in month {firstNegative.month} ({gbp(firstNegative.cash)}).
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Cash stays positive across the next 12 months on current rents.</p>
        )}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `£${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => `£${Math.round(v).toLocaleString()}`} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
              <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="cash" name="Projected cash" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {fixes.length > 0 && (
          <div className="text-xs space-y-1">
            <p className="font-medium">Fixed rates ending (payments assumed to rise to lender SVR):</p>
            {fixes.map(f => <p key={f.month} className="text-muted-foreground">Month {f.month}: {f.fixEnding.join(", ")}</p>)}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Estimate using today's occupied rents, mortgage payments and insurance. Excludes tax bills, repairs and new purchases.
        </p>
      </DialogContent>
    </Dialog>
  );
}
