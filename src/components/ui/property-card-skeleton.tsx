import { Skeleton } from "@/components/ui/skeleton";

/**
 * Phase 5 #7 — Skeleton loader matching the PropertyCard layout.
 * Used as a Suspense fallback / loading state while data or
 * lazy-loaded card content is in flight.
 */
export function PropertyCardSkeleton() {
  return (
    <div className="glass rounded-2xl p-3 space-y-3" data-testid="property-card-skeleton">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <Skeleton className="h-3 w-1/3" />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
    </div>
  );
}

/** Compact row skeleton — for estate-agent listings, conveyancing rows. */
export function ListingRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/30" data-testid="listing-row-skeleton">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Skeleton className="h-8 w-8 rounded-md shrink-0" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-7 w-16 rounded-md" />
    </div>
  );
}

/** Generic panel skeleton — used as Suspense fallback for lazy dialog bodies. */
export function PanelSkeleton() {
  return (
    <div className="space-y-3 p-2" data-testid="panel-skeleton">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-24 w-full rounded-md" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  );
}
