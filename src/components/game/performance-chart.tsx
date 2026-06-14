import { useState, useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useGameStore } from '@/stores/gameStore';
import { fromPennies } from '@/lib/formatCurrency';
import { Button } from '@/components/ui/button';

type Series = 'netWorth' | 'cashflow' | 'rentalIncome';

const SERIES_META: Record<Series, { label: string; color: string }> = {
  netWorth: { label: 'Net Worth', color: 'hsl(var(--primary))' },
  cashflow: { label: 'Cashflow', color: 'hsl(var(--success))' },
  rentalIncome: { label: 'Rental Income', color: 'hsl(var(--stat-credit))' },
};

export function PerformanceChart() {
  const snapshots = useGameStore((s) => s.monthlySnapshots) || [];
  const [series, setSeries] = useState<Series>('netWorth');

  const data = useMemo(
    () =>
      snapshots.map((s) => ({
        month: s.month,
        netWorth: Math.round(fromPennies(s.netWorth)),
        cashflow: Math.round(fromPennies(s.cashflow)),
        rentalIncome: Math.round(fromPennies(s.rentalIncome)),
        propertyCount: s.propertyCount,
      })),
    [snapshots],
  );

  const last = data[data.length - 1];

  if (data.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No snapshots yet — play through a month-end to populate the chart.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(SERIES_META) as Series[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={series === k ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => setSeries(k)}
          >
            {SERIES_META[k].label}
          </Button>
        ))}
      </div>

      <div className="space-y-3 lg:grid lg:grid-cols-4 lg:gap-4 lg:space-y-0">
        {last && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-2 text-center text-xs">
            <div className="rounded bg-muted/30 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Net Worth</div>
              <div className="font-bold">£{last.netWorth.toLocaleString()}</div>
            </div>
            <div className="rounded bg-muted/30 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Cashflow</div>
              <div className={`font-bold ${last.cashflow >= 0 ? 'text-success' : 'text-danger'}`}>
                £{last.cashflow.toLocaleString()}
              </div>
            </div>
            <div className="rounded bg-muted/30 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Rent /mo</div>
              <div className="font-bold">£{last.rentalIncome.toLocaleString()}</div>
            </div>
            <div className="rounded bg-muted/30 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Portfolio</div>
              <div className="font-bold">{last.propertyCount}</div>
            </div>
          </div>
        )}

        <div className="lg:col-span-3">
          <div className="h-64 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`£${v.toLocaleString()}`, SERIES_META[series].label]}
                  labelFormatter={(m) => `Month ${m}`}
                />
                <Line
                  type="monotone"
                  dataKey={series}
                  stroke={SERIES_META[series].color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground text-center">
        Last {data.length} month{data.length === 1 ? '' : 's'} (capped at 60).
      </div>
    </div>
  );
}

