import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/game/confirm-dialog";
import { InfoTip, TIP_TEXTS } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

type Metric = "cashflow" | "epc" | "satisfaction" | "yield";
type Tone = "good" | "warn" | "bad" | "none";

const TONE_CLASS: Record<Tone, string> = {
  good: "border-success/50 bg-success/15",
  warn: "border-yellow-400/50 bg-yellow-400/10",
  bad: "border-destructive/60 bg-destructive/15",
  none: "border-border bg-muted/20",
};

const CITY_LABEL: Record<string, string> = {
  middlesbrough: "Middlesbrough", leeds: "Leeds", manchester: "Manchester", london: "London",
};

interface Props {
  properties: any[];
  tenants: any[];
  mortgages: any[];
  listings: any[];
  onOpen: (id: string) => void;
  onListForSale: (id: string, askingPounds: number) => void;
}

export function PortfolioMap({ properties, tenants, mortgages, listings, onOpen, onListForSale }: Props) {
  const [metric, setMetric] = useState<Metric>("cashflow");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = useMemo(() => properties.map((p) => {
    const debtPay = mortgages.filter((m) => m.propertyId === p.id).reduce((s, m) => s + (m.monthlyPayment ?? 0), 0);
    const cashflow = (p.monthlyIncome ?? 0) - debtPay;
    const sats = tenants.filter((t) => t.propertyId === p.id).map((t) => t.satisfaction ?? 0);
    const sat = sats.length ? sats.reduce((a, b) => a + b, 0) / sats.length : null;
    const epc: string | undefined = p.epcRating;
    const y = p.value > 0 ? ((p.monthlyIncome ?? 0) * 12 / p.value) * 100 : 0;
    let tone: Tone = "none"; let label = "";
    if (metric === "cashflow") { tone = cashflow < 0 ? "bad" : cashflow < 100 ? "warn" : "good"; label = `£${Math.round(cashflow).toLocaleString()}/mo`; }
    if (metric === "epc") { tone = !epc ? "none" : epc <= "C" ? "good" : epc === "D" ? "warn" : "bad"; label = epc ? `EPC ${epc}` : "EPC ?"; }
    if (metric === "satisfaction") { tone = sat == null ? "none" : sat >= 60 ? "good" : sat >= 35 ? "warn" : "bad"; label = sat == null ? "Empty" : `${Math.round(sat)}% happy`; }
    if (metric === "yield") { tone = y >= 7 ? "good" : y >= 5 ? "warn" : "bad"; label = `${y.toFixed(1)}%`; }
    const listed = listings.some((l) => l.propertyId === p.id);
    return { p, tone, label, listed, city: p.city || "middlesbrough" };
  }), [properties, tenants, mortgages, listings, metric]);

  const byCity = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) { if (!m.has(r.city)) m.set(r.city, []); m.get(r.city)!.push(r); }
    return Array.from(m.entries());
  }, [rows]);

  const sellable = rows.filter((r) => selected.has(r.p.id) && !r.listed);
  const totalAsking = sellable.reduce((s, r) => s + (r.p.value ?? 0), 0);
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted-foreground">Colour by</span>
        <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <SelectTrigger className="h-7 w-[170px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cashflow">Cash flow after mortgage</SelectItem>
            <SelectItem value="epc">Energy rating (EPC)</SelectItem>
            <SelectItem value="satisfaction">Tenant happiness</SelectItem>
            <SelectItem value="yield">Yield</SelectItem>
          </SelectContent>
        </Select>
        {metric === "epc" && <InfoTip text={TIP_TEXTS.MEES} />}
        {metric === "yield" && <InfoTip text={TIP_TEXTS.YIELD} />}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground">{selected.size} selected</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.p.id)))}>
            {selected.size === rows.length ? "Clear" : "Select all"}
          </Button>
          {sellable.length === 0 ? (
            <Button size="sm" className="h-7 text-xs" disabled>List selected for sale</Button>
          ) : (
            <ConfirmDialog
              trigger={<Button size="sm" className="h-7 text-xs">List selected for sale</Button>}
              title={`List ${sellable.length} ${sellable.length === 1 ? "property" : "properties"} for sale?`}
              description={`Each will be listed at its current value — £${Math.round(totalAsking).toLocaleString()} in total. Properties already for sale are skipped. Buyers' offers arrive over the coming months.`}
              confirmLabel="List for sale"
              onConfirm={() => {
                sellable.forEach((r) => onListForSale(r.p.id, Math.round(r.p.value ?? 0)));
                setSelected(new Set());
              }}
            />
          )}
        </div>
      </div>

      {byCity.map(([city, list]) => (
        <div key={city}>
          <div className="text-xs font-semibold text-muted-foreground mb-1.5">{CITY_LABEL[city] ?? city} · {list.length}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {list.map(({ p, tone, label, listed }) => (
              <div key={p.id} className={cn("relative rounded-xl border p-2 text-left transition hover:scale-[1.02]", TONE_CLASS[tone])}>
                <Checkbox className="absolute top-2 right-2" checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} />
                <button type="button" className="w-full text-left pr-5" onClick={() => onOpen(p.id)}>
                  <div className="text-xs font-semibold truncate">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">£{Math.round(p.value ?? 0).toLocaleString()}</div>
                  <div className="text-xs font-bold mt-1">{label}</div>
                  {listed && <div className="text-[10px] text-primary mt-0.5">For sale</div>}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

    </div>
  );
}
