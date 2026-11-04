import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INVESTMENT_PRODUCTS, type InvestmentKind } from "@/lib/engine/investments";

/**
 * Stock-app style price chart for a market-linked investment. Display-only:
 * the series is a deterministic seeded walk (stable across renders/reloads)
 * built from the product's mean return and volatility, so it never touches
 * game state or the game RNG. Weekly points allow 1W/1M views.
 */
const WEEKS_PER_MONTH = 4;
const HISTORY_WEEKS = 5 * 52;
const RANGES = [
  { key: '1W', weeks: 1 },
  { key: '1M', weeks: 4 },
  { key: '3M', weeks: 13 },
  { key: '1Y', weeks: 52 },
  { key: '5Y', weeks: HISTORY_WEEKS },
] as const;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS: Record<InvestmentKind, number> = { savings: 1, bonds: 2, index: 1337, risky: 4242, crypto: 9001 };

export function buildPriceSeries(kind: InvestmentKind, monthsPlayed: number) {
  const p = INVESTMENT_PRODUCTS[kind];
  const totalWeeks = HISTORY_WEEKS + Math.max(0, Math.floor(monthsPlayed)) * WEEKS_PER_MONTH;
  const rand = seeded(SEEDS[kind]);
  const drift = p.meanMonthlyReturn / WEEKS_PER_MONTH;
  const vol = p.volatility / Math.sqrt(WEEKS_PER_MONTH);
  let price = 100;
  const out: { w: number; price: number }[] = [];
  for (let i = 0; i < totalWeeks; i++) {
    const z = (rand() + rand() + rand() - 1.5) * 2; // ~N(0,1)
    price = Math.max(1, price * (1 + drift + z * vol));
    out.push({ w: i, price });
  }
  return out.slice(-HISTORY_WEEKS);
}

export function MarketPriceChart({ kind, monthsPlayed }: { kind: InvestmentKind; monthsPlayed: number }) {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('1Y');
  const series = useMemo(() => buildPriceSeries(kind, monthsPlayed), [kind, monthsPlayed]);
  const weeks = RANGES.find(r => r.key === range)!.weeks;
  const data = series.slice(-(weeks + 1)).map((d, i, arr) => ({
    label: `${arr.length - 1 - i}w ago`,
    price: +d.price.toFixed(2),
  }));
  const first = data[0]?.price ?? 0;
  const last = data[data.length - 1]?.price ?? 0;
  const change = first ? (last - first) / first : 0;
  const up = change >= 0;
  const colour = up ? 'hsl(var(--success))' : 'hsl(var(--danger))';
  const gid = `mpc-${kind}`;

  return (
    <div className="rounded-lg border border-border/30 bg-background/30 p-2">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <div className="text-xs">
          <span className="font-semibold tabular-nums">{last.toFixed(2)}</span>
          <span className={`ml-2 tabular-nums ${up ? 'text-success' : 'text-danger'}`}>
            {up ? '+' : ''}{(change * 100).toFixed(1)}% ({range})
          </span>
        </div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${range === r.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40'}`}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colour} stopOpacity={0.35} />
                <stop offset="100%" stopColor={colour} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" hide />
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [v.toFixed(2), 'Unit price']}
            />
            <Area type="monotone" dataKey="price" stroke={colour} strokeWidth={1.5} fill={`url(#${gid})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
