## Goal

Reduce vertical clutter on the main page by merging the four standalone panels (Conveyancing, Planning Applications, Tenant Concerns, Activity) into a single compact tabbed component, shrink the DTI bar into an inline pill, and stop surfacing refused planning applications outside the renovation flow.

## Changes

### 1. New `OperationsCenter` component
Create `src/components/ui/operations-center.tsx`. Single glass card with:

- A header showing "Operations" plus a total count badge.
- A horizontal tab strip (using existing `Tabs`) with these tabs, each showing a count badge:
  - **Conveyancing** — current `ConveyancingTracker` body
  - **Planning** — pending-only planning applications (refused entries excluded — see #4)
  - **Renovations** — current `RenovationTracker` "Active Renovations" body
  - **Concerns** — current `TenantConcernsFeed` body
  - **Activity** — current `ActivityFeed` body (existing internal category filter is preserved)
- Tabs with zero items render a muted empty state. If everything is empty, the whole card collapses to a single thin "All quiet" line so it doesn't waste space.
- Default active tab = first non-empty tab in the order above; falls back to Activity.
- Body uses a fixed max height (`max-h-[360px]`) with internal scroll so the card never grows taller than the activity feed used to be.

### 2. Wire it into `src/pages/Index.tsx`
Replace the current sequence of `<ConveyancingTracker>`, `<RenovationTracker>`, `<TenantConcernsFeed>`, `<ActivityFeed>` (lines ~238–293) with a single `<OperationsCenter>` that receives all the props those components currently take. `EvictionTimelineFeed` and `DepositDisputesFeed` stay outside the center — they are action-required dialogs, not feeds.

### 3. Shrink the DTI display
In `src/components/ui/game-stats.tsx` (lines ~209–244):

- Remove the standalone full-width DTI card.
- Replace it with an inline pill rendered next to the existing LTV pill in the header row (around line 180). Format: `DTI 42%` with the same colour rules (success / yellow / danger).
- Move the explanatory tooltip onto the pill (Info icon next to the value).
- Drop the 0%–80% scale labels entirely; the colour conveys the risk band.

### 4. Hide refused planning applications from the main UI
In `src/components/ui/renovation-tracker.tsx`:

- Change `visibleApplications` filter to `a.status === 'pending'` only (drop the 2-month refused window).
- Refused applications continue to exist in state and are surfaced inside the renovation sub-menu (the existing `RenovationDialog` already reads `planningApplications` and shows the cooldown there).

Verify: read `src/components/ui/renovation-dialog.tsx` during implementation to confirm the refused state is shown when the user opens a renovation; if not, add a small "Refused — Xmo cooldown remaining" line inside that dialog so the player still sees why an option is blocked.

## Files touched

- **new**: `src/components/ui/operations-center.tsx`
- **edit**: `src/pages/Index.tsx` — swap four panels for one
- **edit**: `src/components/ui/game-stats.tsx` — DTI to inline pill
- **edit**: `src/components/ui/renovation-tracker.tsx` — drop refused-app window
- **edit**: `src/components/ui/renovation-dialog.tsx` — ensure refusal cooldown visible inside the renovation flow (only if not already)

## Out of scope

- No changes to game logic, store, or types.
- `ConveyancingTracker`, `RenovationTracker`, `TenantConcernsFeed`, `ActivityFeed` remain as components — `OperationsCenter` composes them so we don't duplicate markup. Their outer "glass card" wrappers will be removed via a `bare` prop (or by rendering their inner content) so we don't get nested cards inside the tabs.
