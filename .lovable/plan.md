## Goals

Address three player-facing tenant feedback issues from the screenshot:

1. **Premium-tenant-in-standard-property satisfaction loss is opaque.** Players see satisfaction tank with no actionable hint. Either guide them to renovate to premium, or stop punishing them when an upgrade isn't realistic.
2. **No history view of game actions/events.** Recent tenant events are summarised in stats, but there's no scrollable activity log of what's happened (sales, mortgages, evictions, renovations, concerns, macro events).
3. **No clear notification when a tenant leaves.** A toast fires for low-satisfaction early exits, but other exit paths (eviction completion, end-of-tenancy walk-outs) are silent or easy to miss, and there's no persistent record.

---

## Plan

### 1. Premium-tenant satisfaction guidance

**In `src/stores/gameStore.ts` (~line 847):** when a premium tenant is in a standard-condition property, only apply the −5 penalty if the property is *eligible* for a premium renovation (i.e. there exists at least one uncompleted renovation that would raise condition to premium, AND no `planning_cooldown` lock).

- If upgrade-eligible → keep −5, but change reason text to `"Premium tenant wants premium finish — renovate to fix"` so the property card tooltip explains it.
- If not upgrade-eligible (already at ceiling, planning refused recently, or no premium renovation available) → drop the penalty entirely. Reason text: `"Premium tenant accepts current standard"` with delta 0 (so it's visible but harmless).

**In `src/components/ui/property-card.tsx`:** when the active satisfaction reason is the premium-tenant penalty AND the property is upgrade-eligible, show a small "Renovate to premium" hint button under the satisfaction bar that opens the existing renovation dialog filtered to premium-tier options.

### 2. Activity / history feed

Add a new `ActivityFeed` component (`src/components/ui/activity-feed.tsx`) that aggregates and timestamps:

- Tenant events (`tenantEvents`: defaults, damages, early exits)
- Macro events (`economicEvents`)
- Tenant moved out / moved in (new entries — see §3)
- Eviction completions (from `pendingEvictions` once `effectiveMonth` passes)
- Renovation completions (from `renovations` once `completionMonth` passes)
- Conveyancing completions (purchases & sales)
- Tax payments (`taxRecords`)

Implementation notes:
- Pure derived view — read existing arrays from `gameState`, no new persisted state for already-tracked items. Sort by month desc, cap at 50 entries, with category filter chips (All / Tenants / Property / Finance / Market).
- Render in the dashboard as a new collapsible "Activity" tile next to the existing stats, OR as a new tab in the bottom panel — confirm with placement consistent with current dashboard layout (we'll add it as a new tab in the existing tabs row to follow the dashboard pattern).

### 3. Tenant-left notifications + log

Currently only the low-satisfaction early-exit path emits a toast. Add:

- **Toast on every tenant departure**, including:
  - Eviction completion (in `tickMonth`, when `pendingEvictions` resolve and the tenant record is removed) — toast: "Tenant Evicted — {name} has left {property}".
  - End-of-tenancy walk-out (if the satisfaction tick removes them for any reason) — already covered, keep it.
  - Notice served (tenant *will* leave) — toast: "Eviction Notice Served — {name} leaves in N months".
- **Persistent tenant-departure log entry** added to a new `tenantHistory` slice in state (lightweight: `{ propertyId, propertyName, tenantName, reason, month }`), surfaced inside the Activity Feed and pinned at the top of the property card's tenant section ("Last tenant: {name} left {N} months ago — {reason}").

This guarantees the player can never miss a departure even if a toast was dismissed.

---

## Technical details

- **Types (`src/types/game.ts`):** add `TenantDeparture` interface and `tenantHistory: TenantDeparture[]` field to `GameState`. Bump `SAVE_VERSION` to `10` and add a migration default (`tenantHistory: []`) in the persist rehydrate step.
- **Store (`src/stores/gameStore.ts`):**
  - In the early-exit filter (line ~875), push a `TenantDeparture` entry alongside the existing toast.
  - Add the same push when a `pendingEviction` resolves and the tenant is removed.
  - Refactor the premium-tenant penalty branch (line ~847) to check eligibility via a new helper `canUpgradeToPremium(property, completedRenovationIds, propertyLocks, monthsPlayed)` exposed from `src/lib/engine/renovation.ts`.
- **Hook (`src/hooks/useGameState.ts`):** expose `tenantHistory`.
- **UI:**
  - `src/components/ui/activity-feed.tsx` — new component, glass card, follows existing tracker styling (`renovation-tracker`, `tenant-concerns-feed`).
  - `src/pages/Index.tsx` — mount the feed as a new tab in the dashboard tab strip.
  - `src/components/ui/property-card.tsx` — add the "Renovate to premium" inline hint when applicable; show "Last tenant left {N} months ago" line in the vacant-property state.

---

## Files to modify

- `src/types/game.ts` — add `TenantDeparture`, bump `SAVE_VERSION`.
- `src/stores/gameStore.ts` — premium-tenant eligibility check, eviction-completion toast, departure log writes, rehydration default.
- `src/hooks/useGameState.ts` — expose `tenantHistory`.
- `src/lib/engine/renovation.ts` — `canUpgradeToPremium` helper.
- `src/components/ui/activity-feed.tsx` — **new** component.
- `src/components/ui/property-card.tsx` — premium-renovate hint + last-tenant line.
- `src/pages/Index.tsx` — mount Activity tab.
- `mem://ui/layout/activity-feed.md` — **new** memory documenting the feed.
- `mem://game-mechanics/property-management/tenant-satisfaction.md` — update note about premium-tenant eligibility gating.

No new dependencies. No backend changes.