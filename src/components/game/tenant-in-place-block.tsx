import type { Property } from "@/types/game";
import { fromPennies } from "@/lib/formatCurrency";

const covenantLabel = (cov: number, isNational?: boolean): string => {
  if (isNational) return "National covenant";
  if (cov >= 75) return "Strong";
  if (cov >= 50) return "Standard";
  return "Weak";
};

const covenantColor = (cov: number, isNational?: boolean): string => {
  if (isNational || cov >= 75) return "text-green-400";
  if (cov >= 50) return "text-amber-400";
  return "text-orange-400";
};

/**
 * Phase 3 — tenant-in-place details block, surfaced beneath standard property
 * info in the Estate Agent and Auction House listings.
 */
export function TenantInPlaceBlock({ property }: { property: Property }) {
  const lease = property.commercialLease;
  const tenant = property.sittingTenant;
  if (!lease || !tenant) return null;

  // Listings store remaining lease months as `expiryMonth - startMonth` (the
  // start month is the negative elapsed portion). Once owned, both fields are
  // absolute monthsPlayed values — we only render this block on listings, so
  // the placeholder semantics apply.
  const remainingMonths = Math.max(0, (lease.expiryMonth ?? 0) - (lease.startMonth ?? 0));
  const years = Math.floor(remainingMonths / 12);
  const months = remainingMonths % 12;

  const cov = tenant.covenantStrength ?? 50;
  const rentPounds = fromPennies(lease.negotiatedRentPennies);
  const annualPounds = rentPounds * 12;

  // Next review = months until the next review date, modulo the review cycle.
  const reviewCycle = lease.reviewFrequencyMonths || 60;
  const elapsedInCycle = Math.max(0, lease.termMonths - remainingMonths) % reviewCycle;
  const monthsToReview = Math.max(1, reviewCycle - elapsedInCycle);

  return (
    <div className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">🏢 Tenant in place</span>
        <span className={`font-medium ${covenantColor(cov, tenant.isNational)}`}>
          {covenantLabel(cov, tenant.isNational)} ({cov})
        </span>
      </div>
      <div className="text-muted-foreground">
        <span className="font-medium text-foreground">{tenant.companyName ?? tenant.name}</span>
        {tenant.sector && (
          <span className="ml-1 capitalize">· {tenant.sector.replace('_', ' ')}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div>
          <span className="text-muted-foreground">Rent:</span>{' '}
          <span className="font-medium text-green-400">£{rentPounds.toLocaleString()}/mo</span>
        </div>
        <div>
          <span className="text-muted-foreground">Annual:</span>{' '}
          <span className="font-medium">£{annualPounds.toLocaleString()}</span>
        </div>
        <div className="col-span-2">
          <span className="text-muted-foreground">Lease remaining:</span>{' '}
          <span className="font-medium">{years}y {months}m</span>
        </div>
        <div>
          <span className="text-muted-foreground">Next review:</span>{' '}
          <span className="font-medium">{monthsToReview}mo</span>
        </div>
        <div>
          <span className="text-muted-foreground">Type:</span>{' '}
          <span className="font-medium">FRI</span>
        </div>
      </div>
    </div>
  );
}
