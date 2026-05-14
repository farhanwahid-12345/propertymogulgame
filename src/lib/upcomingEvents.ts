/**
 * Pure helpers used to populate the upcoming-events strip inside the
 * notification centre. Kept free of React so the same logic is easy to
 * reuse / test.
 */
import type { PendingEviction, PlanningApplication, EntityType } from "@/types/game";

export interface UpcomingRow {
  id: string;
  category: "tax" | "eviction" | "planning";
  title: string;
  detail: string;
  monthsAway: number;
}

export function monthLabel(n: number): string {
  if (n <= 0) return "Now";
  if (n === 1) return "Next month";
  return `In ${n} months`;
}

export interface BuildUpcomingArgs {
  monthsPlayed: number;
  entityType: EntityType;
  pendingEvictions: PendingEviction[];
  planningApplications: PlanningApplication[];
  lastCorporationTaxMonth: number;
}

export function buildUpcomingRows({
  monthsPlayed,
  entityType,
  pendingEvictions,
  planningApplications,
  lastCorporationTaxMonth,
}: BuildUpcomingArgs): UpcomingRow[] {
  const rows: UpcomingRow[] = [];
  const monthInYear = monthsPlayed % 12;

  if (entityType === "sole_trader") {
    const due = (10 - monthInYear + 12) % 12;
    rows.push({
      id: "tax-sole",
      category: "tax",
      title: "Self-Assessment due",
      detail: "Income tax + payment on account",
      monthsAway: due === 0 ? 12 : due,
    });
  } else {
    const lastTaxYear = Math.floor(lastCorporationTaxMonth / 12);
    const currentYear = Math.floor(monthsPlayed / 12);
    const dueYear = lastTaxYear >= currentYear ? currentYear + 1 : currentYear;
    const dueMonth = dueYear * 12;
    rows.push({
      id: "tax-corp",
      category: "tax",
      title: "Corporation tax filing",
      detail: "Annual profit assessment",
      monthsAway: Math.max(0, dueMonth - monthsPlayed),
    });
  }

  pendingEvictions
    .filter(e => e.effectiveMonth > monthsPlayed)
    .slice(0, 3)
    .forEach(e => rows.push({
      id: `ev-${e.propertyId}-${e.servedMonth}-${e.tenantName}`,
      category: "eviction",
      title: `Eviction: ${e.tenantName}`,
      detail: e.ground.replace(/_/g, " "),
      monthsAway: e.effectiveMonth - monthsPlayed,
    }));

  planningApplications
    .filter(a => a.status === "pending" && a.decisionMonth > monthsPlayed)
    .slice(0, 3)
    .forEach(a => rows.push({
      id: `plan-${a.id}`,
      category: "planning",
      title: `Planning: ${a.renovationName}`,
      detail: `${Math.round(a.approvalProb * 100)}% approval estimate`,
      monthsAway: a.decisionMonth - monthsPlayed,
    }));

  rows.sort((a, b) => a.monthsAway - b.monthsAway);
  return rows.slice(0, 6);
}
