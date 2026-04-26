## Problem

The user receives a "🔧 Property Damage" toast (e.g. *"67 Borough Road. Roof leak causing interior damage. Resolve in the Concerns feed."*) but the Tenant Concerns feed says **"No concerns — tenants are happy 😊"**. Investigation in `src/stores/gameStore.ts` revealed three real bugs that cause damage concerns to disappear (or never appear) after the toast fires.

## Root Causes

1. **Auto-resolve on Premium properties (`processMonthlyTick`, ~line 883)**
   ```ts
   if (property && property.condition === 'premium' && (c.category === 'maintenance' || c.category === 'mould')) {
     return { ...c, resolvedMonth: newMonthNumber };
   }
   ```
   Damage concerns are pushed with `category: 'maintenance'` and `source: 'damage'`. On the next monthly tick, any premium-condition property silently auto-resolves them — so the toast appears, but the concern is gone before the user can act.

2. **Race between `processMarketUpdate` and `processMonthlyTick` (~line 1189 vs line 1383)**
   - `processMarketUpdate` appends damage concerns: `tenantConcerns: [...(prev.tenantConcerns || []), ...newDamageConcerns]`.
   - `processMonthlyTick` reads `prev.tenantConcerns` once into `prevConcerns` and then overwrites with `tenantConcerns: updatedConcerns`.
   - If the two ticks fire close together (worker clock + main-thread scheduling), the monthly tick's snapshot can miss damage concerns added by a market update that landed mid-flight, and overwrite them on commit.

3. **Stale toast referencing a sold property (`67 Borough Road`)**
   The toast shown in the screenshot names a property the user no longer owns. `processMarketUpdate` iterates `prev.tenants`, but a tenant record can linger briefly for a property that was sold/conveyancing-completed in the same tick. The concern is then orphaned (no matching `ownedProperty.id`), so the feed renders the entry but the property name lookup fails — and the orphaned concern can also get filtered out elsewhere.

## Plan

### A. Stop auto-resolving damage concerns (bug #1)
In `src/stores/gameStore.ts` (`processMonthlyTick`, ~line 880–894), tighten the premium auto-resolve so it **only** applies to organic tenant concerns (`source !== 'damage'`):
```ts
if (
  property &&
  property.condition === 'premium' &&
  c.source !== 'damage' &&
  (c.category === 'maintenance' || c.category === 'mould')
) {
  return { ...c, resolvedMonth: newMonthNumber };
}
```
Damage from a roof leak or boiler failure should require the player to pay — premium decor doesn't fix a broken boiler.

### B. Use functional `set` updates and merge by id (bug #2)
- Convert the two writes that touch `tenantConcerns` to functional updaters that read the latest store state, instead of relying on the captured `prev`:
  - `processMarketUpdate` (line 1377): `set(s => ({ ..., tenantConcerns: mergeConcerns(s.tenantConcerns, newDamageConcerns) }))`.
  - `processMonthlyTick` (line 1189): use `set(s => ({ ..., tenantConcerns: mergeConcerns(s.tenantConcerns, updatedConcerns) }))` so any concerns added by a market tick that interleaved are preserved.
- Add a tiny helper near the other store helpers:
  ```ts
  function mergeConcernsById(...lists: TenantConcern[][]): TenantConcern[] {
    const map = new Map<string, TenantConcern>();
    for (const list of lists) for (const c of list || []) if (c?.id) map.set(c.id, c);
    return Array.from(map.values());
  }
  ```
  When merging, prefer the version with `resolvedMonth` set if any list has it (so resolution wins over a stale unresolved copy).

### C. Guard damage generation against stale tenants & orphans (bug #3)
In `processMarketUpdate` (~line 1339), before pushing a damage concern:
- Already skips when no matching `ownedProperty` is found — keep that.
- Additionally skip when the property is in `propertyListings` with status sold, in `conveyancing` with `status === 'selling'`, or has a pending eviction whose effective month has passed.
- If the toast wins the race anyway, also harden the feed render in `src/components/ui/tenant-concerns-feed.tsx` to **filter out concerns whose `propertyId` is not in `ownedProperties`** so the feed never silently swallows an orphan but still avoids the "Unknown property" row when the property genuinely vanished. Add a small one-time cleanup on hydration to drop orphan concerns from saves.

### D. Tighten toast/feed contract
- In `processMarketUpdate`, only call `showToast("🔧 Property Damage", …)` **after** the concern has been added to the new state (move the toast call into a `setTimeout(0)` or after `set()` so the user can never see a toast without the matching concern).
- Increase the toast duration for damage to `~10s` (matches eviction/dispute toasts) so it doesn't disappear before the player notices.

### E. Migration / save sanity
- On hydration in the persist `migrate` block, drop concerns whose `propertyId` no longer maps to an owned property (orphans from earlier bugged saves), so existing players see a clean state.
- No `SAVE_VERSION` bump needed — change is additive cleanup.

## Files To Change
- `src/stores/gameStore.ts` — fixes A, B, C, D, E.
- `src/components/ui/tenant-concerns-feed.tsx` — defensive filter for orphan concerns; small empty-state copy tweak ("All concerns resolved").
- `mem://game-mechanics/property-management/maintenance.md` — note that damage concerns are NOT auto-resolved by premium condition; only organic concerns are.
- `mem://game-mechanics/property-management/tenant-concerns.md` — note merge-by-id behavior and orphan cleanup on hydration.

## Acceptance
- Triggering a damage event always produces a matching, persistent entry in the Tenant Concerns feed (even on Premium properties).
- The feed never shows an "Unknown property" row, and damage toasts never reference a property the player doesn't own.
- Existing saves with orphaned damage concerns self-clean on next load.