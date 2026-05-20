Four scoped fixes/improvements covering planning UX, furnishing economics, the buy grid, and the renovation dialog's batch mode.

---

## 1. Pop-up when planning permission is refused

Currently a refusal only fires a destructive toast. Mirror the existing `PlanningApprovedDialog` pattern with a sibling refusal dialog so the player can't miss it.

- **`src/types/game.ts`** — add `pendingPlanningRefusals: string[]`.
- **`src/stores/gameStore.ts`**
  - Initial state: `pendingPlanningRefusals: []`.
  - In the monthly planning resolution (lines ~1244-1257), when `app.approved === false`, push `app.id` into `pendingPlanningRefusals` (alongside the existing toast + cooldown lock).
  - Bump the "drop refused after 2 months" filter so refused apps stay in `planningApplications` until the celebration dialog acknowledges them (drop only when no longer in `pendingPlanningRefusals`). Avoid the race that currently deletes the app before the dialog can read it.
  - Add `dismissPlanningRefusal(id)` and `clearPlanningRefusals()` actions parallel to the existing approval ones.
- **`src/components/ui/planning-refused-dialog.tsx`** (new) — copy `PlanningApprovedDialog` structure: red `AlertTriangle` icon, lists each refused app with `propName`, `renovationName`, `refusalReason`, and a "6-month cooldown — next resubmit in N mo" badge derived from the matching `propertyLocks` entry. Single "Dismiss" / "Dismiss all" buttons.
- **`src/pages/Index.tsx`** — render `<PlanningRefusedDialog />` next to `<PlanningApprovedDialog />`.

## 2. Furnishing actually raises the advertised rent

`furnishProperty` updates `furnishingTier` but never touches `monthlyIncome` / `baseRent`, so the property card shows the same rent as before. The multiplier in `tenantRent.ts` only kicks in when a tenant is later selected, and even then it multiplies `baseRent` (which is unchanged), so the "+5% / +12%" promised in the dialog never shows on the card.

- **`src/stores/gameStore.ts` `furnishProperty`**: after updating `furnishingTier`, recompute `monthlyIncome` from the canonical `baseRent`:
  - `newMonthly = floor(baseRent * getFurnishingRentMultiplier(tier) * getConditionRentMultiplierShared(condition))`.
  - `baseRent` stays untouched so `calcTenantRent` keeps using one multiplier (no double-counting when a tenant is later picked — the existing tenant path uses `baseRent`, not `monthlyIncome`).
  - On the `unfurnished` revert branch, set `monthlyIncome = floor(baseRent * condition multiplier)`.
- **`src/components/ui/furnishing-dialog.tsx`**: surface the new effective rent in the per-tier card (small "New advertised rent £X/mo" line under the % badge) so the promise matches the visible number.

## 3. Shrink the Estate Agent buy-cards by ~half

- **`src/components/ui/estate-agent-window.tsx`** (lines ~521-567):
  - Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3`.
  - Replace `CardHeader` + `CardContent` with a single compact body: `p-3 space-y-1`, `text-base` title, `text-[11px]` neighborhood, tighter rows using `text-xs`.
  - Drop the "*Actual rent varies by tenant" footnote inside each card (it's the same on all of them — move to a single line above the grid).
  - Bump `affordableProperties.slice(0, 12)` to `slice(0, 20)` since cards are smaller.
  - Selection ring (`ring-2 ring-primary`) preserved.

## 4. Batch mode in the renovate tab supports planning + extension-aware conversion sizing

Today batch mode hides any renovation that still needs planning (`batchPlanningBlock`). Allow batching planning submissions, combine them into one decision, and feed extension `sqftAdded` into any conversion in the same batch so the conversion is priced/rented/valued against the post-extension footprint.

- **`src/components/ui/renovation-dialog.tsx`**
  - Remove `batchPlanningBlock`; planning-required renos become selectable in batch mode unless they have a pending app or are in cooldown.
  - When the batch contains both an extension (with `sqftAdded`) and a conversion, derive an `extensionSqftInBatch` and recompute the conversion's `scaledCost / scaledRent / scaledValue` against `effectiveInternalSqft + extensionSqftInBatch`. Show this uplift in the batch summary footer ("Conversion sized for {newSqft} sqft").
  - Combined planning fee = sum of each item's `planningFee`. Apply a 10% planning-bundle discount when the batch has ≥2 planning items (separate from the 5% works discount).
  - Combined approval probability: compute each item's prob via `computePlanningApprovalProbability` (extension-affected conversion uses post-extension sqft only for cost/rent/value, not for prob), then show a "combined chance" = product of individual probs. Render per-item % too so the player understands the weakest link.
  - CTA logic in the bottom button:
    - If every selected item already has an approval (or doesn't need one) → "Start N renovations · £X" (existing flow).
    - Else if at least one needs planning → "Submit N planning applications · £X" which calls a new store action `submitBatchPlanningApplications(propertyId, renovationTypes[])`.
- **`src/stores/gameStore.ts`** — add `submitBatchPlanningApplications`: thin wrapper that iterates `submitPlanningApplication` but
  - debits a single combined fee with the 10% discount,
  - for any conversion in the batch, scales its `renovationCostPennies` (stored on the app) using a `scaleInputs` whose `internalSqft` includes the batch's extension `sqftAdded` — so when the player later starts the conversion it already accounts for the bigger footprint,
  - shows one consolidated "Batch planning submitted — N decisions in ~M mo" toast.
- Existing auto-queue of approved extensions inside `startRenovation` (lines 3169-3242) already handles the build-side bundling, so no changes there.

---

## Technical notes

- `monthlyIncome` recompute in `furnishProperty` is gated by the existing tenant/conveyancing checks, so it only ever runs on a vacant, settled property.
- The refusal dialog reads `propertyLocks` for the "next resubmit in N mo" copy; no new field needed.
- The batched approval-prob product is a display aid; the engine still rolls each application independently in `submitPlanningApplication`, preserving the per-item outcome and refusal-reason fidelity.
- Batch UI changes stay inside the renovation dialog; the store gains one new action.
- No schema/migration impact; the new `pendingPlanningRefusals` slice initializes to `[]` for existing saves via the same lazy-init pattern used by `pendingPlanningCelebrations`.
