/**
 * Quick win #2 — notification triage.
 *
 * Sits above the Operations domain tabs and splits everything demanding
 * attention into three buckets: Urgent (things that cost you the property or
 * the tenant), Financial (money in/out decisions) and Opportunities (upside).
 * Each row deep-links to the Operations tab that can action it.
 *
 * Read-only: derives entirely from the store, keeps no state of its own beyond
 * the selected bucket.
 */
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, PoundSterling, Sparkles } from "lucide-react";
import { fromPennies } from "@/lib/formatCurrency";

export type TriageBucket = "urgent" | "financial" | "opportunities";

export interface TriageItem {
  id: string;
  bucket: TriageBucket;
  title: string;
  detail: string;
  /** Operations tab this item is actioned from. */
  target?: string;
}

interface TriageSource {
  monthsPlayed: number;
  ownedProperties: any[];
  tenants?: any[];
  tenantConcerns?: any[];
  pendingEvictions?: any[];
  propertyListings?: any[];
  exTenantDebts?: any[];
  renovations?: any[];
  planningApplications?: any[];
  conveyancing?: any[];
  pendingLeaseRenewals?: any[];
  pendingDamages?: any[];
}

const BUCKET_META: Record<TriageBucket, { label: string; icon: typeof AlertTriangle; tone: string }> = {
  urgent: { label: "Urgent", icon: AlertTriangle, tone: "text-red-300" },
  financial: { label: "Financial", icon: PoundSterling, tone: "text-amber-300" },
  opportunities: { label: "Opportunities", icon: Sparkles, tone: "text-emerald-300" },
};

/** Pure derivation so it can be unit-tested without React. */
export function deriveTriageItems(s: TriageSource): TriageItem[] {
  const items: TriageItem[] = [];
  const nameOf = (id: string) => s.ownedProperties.find((p: any) => p.id === id)?.name ?? id;

  // ── Urgent ───────────────────────────────────────────────
  (s.tenants || []).forEach((t: any) => {
    const arrears = t.arrearsMonths ?? 0;
    if (arrears >= 2) {
      items.push({
        id: `arrears-${t.propertyId}-${t.slotIndex ?? 0}`,
        bucket: "urgent",
        title: `${t.name} — ${arrears} months in arrears`,
        detail: `${nameOf(t.propertyId)} · grounds for possession available`,
        target: "evictions",
      });
    }
  });
  (s.tenantConcerns || []).forEach((c: any) => {
    if (c.resolvedMonth) return;
    const isEpc = /epc|mees/i.test(`${c.type || ""} ${c.title || ""} ${c.description || ""}`);
    items.push({
      id: `concern-${c.id}`,
      bucket: "urgent",
      title: c.title || (isEpc ? "EPC / MEES issue" : "Tenant concern"),
      detail: nameOf(c.propertyId),
      target: isEpc ? "renovations" : "concerns",
    });
  });
  (s.pendingEvictions || []).forEach((ev: any) => {
    items.push({
      id: `evict-${ev.propertyId}-${ev.slotIndex ?? 0}`,
      bucket: "urgent",
      title: `Possession under way — ${ev.tenantName ?? "tenant"}`,
      detail: `${nameOf(ev.propertyId)} · vacates by month ${ev.effectiveMonth}`,
      target: "evictions",
    });
  });

  // ── Financial ────────────────────────────────────────────
  (s.pendingDamages || []).forEach((d: any) => {
    if (!d || d.paidMonth) return;
    items.push({
      id: `damage-${d.id}`,
      bucket: "financial",
      title: `Repair bill £${fromPennies(d.repairCost ?? 0).toLocaleString()}`,
      detail: nameOf(d.propertyId),
      target: "concerns",
    });
  });
  (s.exTenantDebts || []).forEach((d: any) => {
    if ((d.remainingDebtPennies ?? 0) <= 0) return;
    items.push({
      id: `debt-${d.id}`,
      bucket: "financial",
      title: `£${fromPennies(d.remainingDebtPennies).toLocaleString()} owed by ${d.tenantName}`,
      detail: `${d.propertyName} · ${String(d.status || "").replace(/_/g, " ")}`,
      target: "extdebts",
    });
  });
  (s.propertyListings || []).forEach((l: any) => {
    const offers = (l.offers || []).length;
    if (offers === 0) return;
    items.push({
      id: `offers-${l.propertyId}`,
      bucket: "financial",
      title: `${offers} offer${offers === 1 ? "" : "s"} to review`,
      detail: `${nameOf(l.propertyId)} · asking £${Math.round(l.askingPrice ?? 0).toLocaleString()}`,
      target: "listings",
    });
  });

  // ── Opportunities ────────────────────────────────────────
  (s.pendingLeaseRenewals || []).forEach((r: any) => {
    items.push({
      id: `renewal-${r.propertyId}`,
      bucket: "opportunities",
      title: "Commercial lease renewal on the table",
      detail: `${nameOf(r.propertyId)} · expires month ${r.expiryMonth}`,
      target: "commercial",
    });
  });
  (s.planningApplications || []).forEach((a: any) => {
    if (a.outcome && a.outcome !== "pending") return;
    items.push({
      id: `planning-${a.id ?? a.propertyId}`,
      bucket: "opportunities",
      title: "Planning application in progress",
      detail: nameOf(a.propertyId),
      target: "planning",
    });
  });
  (s.ownedProperties || []).forEach((p: any) => {
    const vacant = !(s.tenants || []).some((t: any) => t.propertyId === p.id);
    if (!vacant) return;
    items.push({
      id: `vacant-${p.id}`,
      bucket: "opportunities",
      title: "Empty unit — no rent coming in",
      detail: `${p.name} · find a tenant to restart income`,
      target: p.type === "commercial" ? "commercial" : "listings",
    });
  });

  return items;
}

interface Props extends TriageSource {
  /** Jump to an Operations domain tab. */
  onNavigate?: (tab: string) => void;
}

export function NotificationTriage({ onNavigate, ...source }: Props) {
  const items = useMemo(() => deriveTriageItems(source), [source]);
  const counts: Record<TriageBucket, number> = {
    urgent: items.filter(i => i.bucket === "urgent").length,
    financial: items.filter(i => i.bucket === "financial").length,
    opportunities: items.filter(i => i.bucket === "opportunities").length,
  };
  const [bucket, setBucket] = useState<TriageBucket>(
    counts.urgent > 0 ? "urgent" : counts.financial > 0 ? "financial" : "opportunities",
  );

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-3" data-tutorial="ops-triage">
      <Tabs value={bucket} onValueChange={(v) => setBucket(v as TriageBucket)}>
        <TabsList className="flex w-full bg-white/[0.06] border-0 h-auto">
          {(Object.keys(BUCKET_META) as TriageBucket[]).map((key) => {
            const meta = BUCKET_META[key];
            const Icon = meta.icon;
            return (
              <TabsTrigger key={key} value={key} className="flex-1 text-[11px] py-1.5 gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${meta.tone}`} />
                {meta.label}
                {counts[key] > 0 && (
                  <Badge variant="outline" className="h-4 px-1 text-[10px] border-white/20">
                    {counts[key]}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {(Object.keys(BUCKET_META) as TriageBucket[]).map((key) => (
          <TabsContent key={key} value={key} className="mt-2 space-y-1.5">
            {counts[key] === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2 text-center">Nothing here right now.</p>
            ) : (
              items.filter(i => i.bucket === key).slice(0, 8).map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-2.5 py-1.5"
                >
                  <div className="min-w-0 text-[11px]">
                    <div className="font-medium truncate">{i.title}</div>
                    <div className="text-muted-foreground truncate">{i.detail}</div>
                  </div>
                  {i.target && onNavigate && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] shrink-0"
                      onClick={() => onNavigate(i.target!)}
                    >
                      View →
                    </Button>
                  )}
                </div>
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
