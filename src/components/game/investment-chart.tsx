import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { fromPennies } from "@/lib/formatCurrency";
import { INVESTMENT_PRODUCTS, type InvestmentKind } from "@/lib/engine/investments";
import type { InvestmentHolding } from "@/types/game";

const RANGES = [
  { id: '3M', months: 3 },
  { id: '6M', months: 6 },
  { id: '1Y', months: 12 },
  { id: '5Y', months: 60 },
  { id: 'ALL', months: Infinity },
] as const;
type RangeId = typeof RANGES[number]['id'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** Game starts Jan 2024; month index → "Mar 25". */
function label(m: number) {
  return `${MONTHS[((m % 12) + 12) % 12]} ${String(24 + Math.floor(m / 12)).padStart(2, '0')}`;
}

interface Props {
  investments: InvestmentHolding[];
  monthsPlayed: number;
}

/** Stock-site style value chart for each investment, or the whole pot. */
export function InvestmentChart({ investments, monthsPlayed }: Props) {
  const [range, setRange] = useState<RangeId>('1Y');
  const [selected, setSelected] = useState<'all' | InvestmentKind>('all');

  const data = useMemo(() => {
    const months = RANGES.find(r => r.id === range)!.months;
    const from = months === Infinity ? -Infinity : monthsPlayed - months;
    const pool = selected === 'all' ? investments : investments.filter(h => h.kind === selected);
    const byMonth = new Map<number, { value: number; paid: number }>();
    const allMonths = new Set<number>();
    pool.forEach(h => (h.history || []).forEach(p => allMonths.add(p.month)));
    const sorted = [...allMonths].filter(m => m >= from).sort((a, b) => a - b);
    for (const m of sorted) {
      let value = 0, paid = 0;
      for (const h of pool) {
        // carry last known point forward
        const pts = (h.history || []).filter(p => p.month <= m);
        const last = pts[pts.length - 1];
        if (last) { value += last.balancePennies; paid += last.contributedPennies; }
      }
      byMonth.set(m, { value, paid });
    }
    return sorted.map(m => ({
      month: label(m),
      value: Math.round(fromPennies(byMonth.get(m)!.value)),
      paid: Math.round(fromPennies(byMonth.get(m)!.paid)),
    }));
  }, [investments, range, selected, monthsPlayed]);

  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  const change = last - first;
  const pct = first > 0 ? (change / first) * 100 : 0;
  const up = change >= 0;
  const color = up ? 'hsl(var(--success))' : 'hsl(var(--danger))';
  const gradId = `invGrad-${up ? 'up' : 'down'}`;

  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-xs text-muted-foreground">
            {selected === 'all' ? 'All investments' : INVESTMENT_PRODUCTS[selected].name}
          </div>
          <div className="text-2xl font-bold">£{last.toLocaleString()}</div>
          {data.length > 1 && (
            <div className={`text-xs font-semibold ${up ? 'text-success' : 'text-danger'}`}>
              {up ? '▲' : '▼'} £{Math.abs(change).toLocaleString()} ({up ? '+' : ''}{pct.toFixed(2)}%) · {range}
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <Button key={r.id} size="sm" variant={range === r.id ? 'default' : 'ghost'}
              className="h-7 px-2 text-xs" onClick={() => setRange(r.id)}>{r.id}</Button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        <Button size="sm" variant={selected === 'all' ? 'secondary' : 'outline'} className="h-6 px-2 text-[10px]"
          onClick={() => setSelected('all')}>All</Button>
        {investments.map(h => (
          <Button key={h.kind} size="sm" variant={selected === h.kind ? 'secondary' : 'outline'}
            className="h-6 px-2 text-[10px]" onClick={() => setSelected(h.kind)}>
            {INVESTMENT_PRODUCTS[h.kind].name}
          </Button>
        ))}
      </div>

      {data.length < 2 ? (
        <p className="py-8 text-center text-[11px] text-muted-foreground">
          The chart fills in at each month-end — come back after a month or two.
        </p>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} minTickGap={20} />
              <YAxis width={56} domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => `£${Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(1)}k` : v}`} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n: string) => [`£${v.toLocaleString()}`, n === 'value' ? 'Value' : 'Paid in']}
              />
              <Area type="monotone" dataKey="paid" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4"
                fill="none" strokeWidth={1} dot={false} />
              <Area type="monotone" dataKey="value" stroke={color} fill={`url(#${gradId})`} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">Dashed line = money you've paid in. One point per in-game month.</p>
    </div>
  );
}
