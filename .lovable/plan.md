# Plan: Three fixes — concerns merge, one-shot renovations, net worth audit

## 1. Remove the Property Damage dialog — fold damage into Tenant Concerns

**Problem:** The damage dialog interrupts gameplay with a modal, duplicating what the concerns feed already does inline.

**Strategy:** Convert each newly-generated `PropertyDamage` into a `TenantConcern` (category `maintenance`) at the moment it's created. Then delete the dialog entirely.

### Changes

**`src/stores/gameStore.ts`** — `processMarketUpdate` damage-generation block (around line 1100-1132):
- Replace `pendingDamages.push(...)` with concern-creation logic. Each damage becomes:
  ```ts
  {
    id: `concern_damage_${Date.now()}_${propertyId}`,
    propertyId,
    tenantProfile: tenant.profile,
    category: 'maintenance',
    description: `Repair needed: ${randomDamageDescription()}`, // e.g. "Boiler repair", "Roof leak"
    raisedMonth: prev.monthsPlayed,
    resolveCost: Math.floor(maxDmg), // already in pennies
    satisfactionPenaltyIfIgnored: 5, // higher than typical concerns since it's actual damage
  }
  ```
- Append to `tenantConcerns` instead of `pendingDamages`.
- Keep `damageHistory` and `annualRepairCosts` updates so the cap & cooldown still work — but move them into the concern-resolve path (see below).

**`src/stores/gameStore.ts`** — `resolveTenantConcern` (line 1969):
- When the concern's id starts with `concern_damage_` (or add an explicit `isDamage: boolean` flag on the concern), also update `annualRepairCosts` and `damageHistory` to keep the cap and 48-month cooldown enforced.
- Cleaner: extend `TenantConcern` type with optional `source?: 'damage' | 'tenant'` and branch on that.

**`src/types/game.ts`:**
- Add `source?: 'damage' | 'tenant'` to `TenantConcern`.
- Leave `PropertyDamage` type in place but unused — flag for removal in a later cleanup pass.

**`src/pages/Index.tsx`:**
- Delete the entire damage-dialog block: imports (line 13), `damageDialogOpen` state, `currentDamageRef`, the `useEffect` (lines 28-42), `handlePayDamage`/`handleTakeLoan`/`handleDismissDamage`, and the `<PropertyDamageDialog>` JSX (lines 409-420).

**`src/components/ui/property-damage-dialog.tsx`:**
- Delete the file.

**`src/components/ui/tenant-concerns-feed.tsx`:**
- Add a small visual marker for damage-sourced concerns (e.g. `🔧 Damage` red badge instead of standard maintenance badge) so the player can tell "real damage" apart from cosmetic complaints. Look up `c.source === 'damage'` and render a destructive-variant badge.

**Migration safety:** existing saves may still have `pendingDamages`. Add a one-time migration in `migrateState` (`src/stores/gameStore.ts` line ~334) that converts any leftover `pendingDamages` into concerns and clears the array.

---

## 2. One-shot renovations — disable per-property after completion

**Problem:** After completing a `kitchen_upgrade`, the dialog still lets you click it again. Same for every renovation.

**Strategy:** Persist a per-property list of completed renovation type ids. The dialog already has an `activeRenovations` list of ids — extend the same mechanism with a `completedRenovations` list.

### Changes

**`src/types/game.ts`:**
- Add to `Property`: `completedRenovationIds?: string[]` (defaults to `[]`).

**`src/stores/gameStore.ts`:**
- `processMarketUpdate` completion block (line 980-1018): when applying `completedRenovations.forEach`, append `renovation.type.id` to `updatedProperties[idx].completedRenovationIds`:
  ```ts
  completedRenovationIds: [...(updatedProperties[idx].completedRenovationIds || []), renovation.type.id],
  ```
- `sanitizeProperty` (line ~70): backfill `completedRenovationIds: asArray(property?.completedRenovationIds, [])` for legacy saves.
- `migrateState`: bump `SAVE_VERSION` to 6 and ensure backfill runs.

**`src/components/ui/renovation-dialog.tsx`:**
- Add prop: `completedRenovationIds?: string[]`.
- Add a helper `isCompleted = (r) => completedRenovationIds.includes(r.id)`.
- Treat `completed` like `inProgress` — disabled, opacity-40, but show a distinct ✅ badge ("Completed") and update the in-progress conditional to render either the completion badge or the progress bar.
- Block selection: include `isCompleted(renovation)` in the `blocked` check.

**`src/components/ui/property-card.tsx`:**
- Pass `property.completedRenovationIds` through to `<RenovationDialog>`.

**`src/pages/Index.tsx`:**
- No change — already passes `property` whole; just pipe through the new field via property card props.

**Conversions special case:** Conversions (`hmo`, `flats`, etc.) are already gated by `currentSubtype !== 'standard'` (renovation-dialog line 272). Leave that logic — it'll naturally exclude them once a conversion is done. But also add their id to `completedRenovationIds` for consistency (so a player who reverts the subtype somehow can't re-do).

**Toast/notification:** No new toast needed — the existing "Renovation Complete" toast already fires.

---

## 3. Net worth audit — confirm/fix the over-counting

**Reported symptom:** "net worth is going up too quickly".

### Likely causes (ranked)

1. **Double-counting condition upgrades.** In `upgradeCondition` (line 1672), we replace `value` with `newValue = property.value × multiplier`. This is correct. But: monthly appreciation drift in `processMonthEnd` (line 648-672) ALSO multiplies `value` regardless of recent upgrade. If both run in the same month, you compound. **Fix:** This is acceptable (both are real value sources). No change needed unless we observe runaway growth.

2. **Renovation completion + appreciation overlap.** `completedRenovations` adds `actualValueGain` to value (line 1001). Same month, monthly drift multiplies that already-uplifted value. Compounding is real but small (drift is ~0.45%/mo). **No change needed.**

3. **🚩 Real bug — `marketValue` drift in cards but `value` in netWorth.** `useGameState` netWorth uses `p.value` (line 112), but the portfolio summary in `Index.tsx` uses `p.marketValue || p.value` (line 89). If `marketValue` and `value` ever diverge (and they do — appreciation drift updates `value`, renovation only updates one of them in some paths), the user sees TWO different totals on screen.

4. **🚩 Real bug — escrow double-counting.** `useGameState` `netWorth` adds `inflightBuyCapital` (line 109-112). But when conveyancing **completes**, the property is added to `ownedProperties` with its full `value` AND the cash was already deducted from `cash` at purchase-time (it lives in `conv.cashHeld` until completion). The flow:
   - **At purchase:** cash debited, `cashHeld` set on conveyancing record. NetWorth = (cash - paid) + cashHeld + 0 properties = cash − 0 ✅
   - **At completion:** `cashHeld` cleared, property `value` added. NetWorth = cash + 0 escrow + propertyValue ✅
   - This actually looks correct. Need to double-check the timing in `processMonthEnd`/conveyancing completion to ensure `cashHeld` is zeroed in the same `set()` call that adds the property.

5. **🚩 Real bug — fees & stamp duty are paid from cash, but the property's `value` is set to the (higher) listed price.** When you buy a £100k property for £80k with £4k of fees, cash drops by £84k, property value reads £80k (post fix #1 from earlier), so net worth dropped by £4k — correct. But for at-or-above-listed purchases, value stays at the listing price while cash absorbs the full purchase price + fees → net worth dips by fees only. Also correct.

### Proposed audit + fixes

**`src/stores/gameStore.ts`:**
- Add a dev-only invariant log (`if (import.meta.env.DEV) console.debug(...)`) that prints net-worth components every month-end so we can spot the spike.

**`src/pages/Index.tsx`:**
- Change line 89 from `(p.marketValue || p.value)` → `p.value` so the portfolio "Total Value" matches the netWorth calc. This eliminates the visual mismatch and removes a +5-10% phantom uplift that comes from `marketValue` being stale-high vs `value`.

**`src/stores/gameStore.ts` — conveyancing completion** (line 491-503):
- Verify `cashHeld` is set to 0 (or the buy is removed from `conveyancing[]`) in the **same** `set()` as adding the property to `ownedProperties`. From the code I read it is removed from the array, so the escrow contribution drops to 0 and value contribution kicks in atomically. ✅ No change required, just verify by inspection.

**`src/stores/gameStore.ts` — `processMarketUpdate` renovation completion**:
- Currently bumps both `value` and `marketValue` by `actualValueGain` (lines 1001-1002). Good — keeps them in sync.

**`src/stores/gameStore.ts` — `upgradeCondition`**:
- Already updates both `value` and `marketValue` (line 1672). Good.

**`src/stores/gameStore.ts` — monthly appreciation** (line 648-672):
- Currently only updates `value`. **Fix:** also update `marketValue` proportionally so the two never drift:
  ```ts
  const drift = newValue / p.value;
  return { ...p, value: newValue, marketValue: Math.round((p.marketValue || p.value) * drift), monthsSinceLastRenovation: resetMonths };
  ```
- This is the **most likely cause** of net worth visually outpacing reality: `marketValue` is rendered in tiles and was ratcheting up while `value` did its own (slower or different) drift, so the two compound side-by-side in the player's perception.

---

## Files modified

| File | Change |
|---|---|
| `src/types/game.ts` | Add `source?` to `TenantConcern`; add `completedRenovationIds?` to `Property`; bump `SAVE_VERSION` to 6 |
| `src/stores/gameStore.ts` | Damage→concern conversion in `processMarketUpdate`; track `completedRenovationIds` on completion; sync `marketValue` with monthly drift; one-time migration of `pendingDamages`; sanitizer backfills |
| `src/pages/Index.tsx` | Delete damage dialog wiring (~25 LOC); change Total Value to use `p.value` |
| `src/components/ui/property-damage-dialog.tsx` | **Delete file** |
| `src/components/ui/tenant-concerns-feed.tsx` | Show distinct badge for `source === 'damage'` concerns |
| `src/components/ui/renovation-dialog.tsx` | Accept `completedRenovationIds`; render ✅ Completed state; block selection |
| `src/components/ui/property-card.tsx` | Pipe `completedRenovationIds` to `RenovationDialog` |
| `mem://game-mechanics/property-management/maintenance` | Update — damage now flows through tenant concerns, no separate dialog |
| `mem://game-mechanics/property-management/renovation-and-depreciation` | Note one-shot per property |

No changes to engine math; the net-worth fix is a sync issue between `value` and `marketValue`, not a recalc.
