# Renovation Realism: Planning Permission + Ceiling Prices

Two related improvements that make heavy renovations feel governed by real-world UK constraints:

1. **Planning permission gate** for major works (extensions, conversions) — fee, wait, and a probabilistic decision based on real planning rules.
2. **Ceiling-price diminishing returns** — a postcode/area cap on what the market will pay, so over-developing a £60k terrace stops yielding 1:1 value uplift.

---

## 1. Planning Permission

### Which renovations require it?

Mapped to real UK Permitted Development (PD) / full-application rules:

| Renovation | PP needed? | Base approval % | Notes |
|---|---|---|---|
| Basic Repairs, Redecoration, Kitchen, Bathroom, Central Heating, Double Glazing | **No** | — | Internal works / PD |
| Loft Conversion | **Yes (often)** | 80% | Usually PD but front dormers / large volumes need PP — model as needing it |
| Single-Story (Rear) Extension | **Yes** | 70% | PD limits often exceeded in this size class |
| Conservatory | **Maybe** | 90% | Usually PD; soft gate at very high approval |
| Convert to HMO (4-bed) | **Yes** | 65% | Article 4 / sui generis common in many areas |
| Convert to HMO (6-bed) | **Yes** | 50% | Sui generis — full application always |
| Convert to Flats (2 units) | **Yes** | 55% | Material change of use |
| Commercial → Residential | **Yes** | 75% | Class MA prior approval, mostly granted |

Approval % is then **modified** by:
- **Property type / area conservatism**: luxury / Nunthorpe area = stricter (-10%); standard residential neutral; commercial → residential = follow base.
- **Property value vs. neighbourhood ceiling**: over-developing a £60k terrace into 6-bed HMO is more likely to be refused (-10% if `value > 0.7 × ceiling`).
- **Player's previous track record** (light touch): each prior approval +1%, each refusal −2%, capped ±10%.

### Mechanics

- **Fee**: `£250 (householder)` for extensions/loft/conservatory, `£500 (full)` for HMOs and flats, `£0 (prior approval class MA)` for commercial→residential. Charged immediately on submission, **non-refundable**.
- **Wait time**: 2 in-game months (≈ statutory 8-week determination period). HMO-6 and flat conversion: 3 months (major application).
- **Outcome**: rolled at submission time and stored. Player sees "Planning: Pending (X mo)" on the property card and renovation tracker.
- **On approval** → renovation auto-starts (cost debited then; ROI clock from approval month).
- **On refusal** → fee is lost; toast explains the reason ("over-development for area", "loss of family housing stock", etc.). Player can resubmit after a 6-month cooldown.

### New types (`src/types/game.ts`)

```ts
export type PlanningStatus = 'pending' | 'approved' | 'refused';

export interface PlanningApplication {
  id: string;
  propertyId: string;
  renovationTypeId: string;
  submittedMonth: number;
  decisionMonth: number;        // submittedMonth + waitMonths
  status: PlanningStatus;
  feePaid: number;              // pennies
  approvalProb: number;         // rolled probability for transparency
  refusalReason?: string;
}

// On RenovationType (renovation-dialog.tsx):
requiresPlanning?: boolean;
planningWaitMonths?: number;     // default 2
planningFee?: number;            // pounds, default 250
baseApprovalProb?: number;       // 0-1
```

Add `planningApplications: PlanningApplication[]` to `GameState` + bump `SAVE_VERSION` to `9` with a migration that defaults the array to `[]`.

### Store changes (`src/stores/gameStore.ts`)

- New action: `submitPlanningApplication(propertyId, renovationType)` — debits fee, creates the application, rolls outcome immediately but reveals it only at `decisionMonth`.
- `processMonthEnd` (in monthly tick): for each pending application where `monthsPlayed >= decisionMonth`, surface the result via toast and:
  - **approved** → call `startRenovation` directly (which debits the build cost + starts the work timer); remove the application.
  - **refused** → mark refused, keep visible 1 month, drop afterward; lock retry for 6 months via existing `propertyLocks` reason `'planning_cooldown'`.
- Update `startRenovation` so it can be called either directly (no PP needed) **or** after a `PlanningApplication` is approved. Add a new entry-point gate:
  - If renovation requires planning AND no approved application exists for `(propertyId, renovationTypeId)`, route to `submitPlanningApplication` instead of starting work immediately.

### UI changes

- **`src/components/ui/renovation-dialog.tsx`** — When `requiresPlanning`, the cost card shows a new "Requires Planning" badge with `~X% approval, £Y fee, ~2 mo wait`. The "Start Renovation" CTA renames to **"Submit Planning Application (£Y)"** for those entries; subsequent flow handled by store.
- **`src/components/ui/renovation-tracker.tsx`** — Add a top section "Planning Applications" listing pending PPs with `(monthsPlayed - submittedMonth) / waitMonths` progress and a chip showing approval %.
- **Property card**: small "📋 Planning pending" pill when an application exists for that property.

---

## 2. Ceiling Prices (Postcode Saturation)

Real-world: spending £50k on a TS1 terrace doesn't return 1.5×. Buyers cap out at the local price ceiling regardless of finish.

### Data model — neighbourhood ceilings

Add `NEIGHBORHOOD_CEILINGS` to `src/lib/engine/constants.ts`, calibrated for Middlesbrough realism (£):

```ts
export const NEIGHBORHOOD_CEILINGS: Record<string, { residential: number; luxury: number; commercial: number }> = {
  'Linthorpe':            { residential: 200_000, luxury: 320_000, commercial: 280_000 },
  'Acklam':               { residential: 220_000, luxury: 380_000, commercial: 260_000 },
  'Marton':               { residential: 280_000, luxury: 450_000, commercial: 300_000 },
  'Nunthorpe':            { residential: 380_000, luxury: 700_000, commercial: 350_000 },
  'Middlesbrough Centre': { residential: 180_000, luxury: 600_000, commercial: 800_000 },
  'Hemlington':           { residential: 200_000, luxury: 350_000, commercial: 220_000 },
  'North Ormesby':        { residential: 110_000, luxury: 160_000, commercial: 180_000 },
  'Pallister Park':       { residential: 130_000, luxury: 200_000, commercial: 200_000 },
  'Port Clarence':        { residential: 95_000,  luxury: 140_000, commercial: 220_000 },
  'South Bank':           { residential: 110_000, luxury: 160_000, commercial: 380_000 },
  'Captain Cook Square':  { residential: 220_000, luxury: 400_000, commercial: 600_000 },
};
const DEFAULT_CEILING = { residential: 180_000, luxury: 350_000, commercial: 300_000 };

export function getCeilingPrice(p: { neighborhood: string; type: 'residential' | 'commercial' | 'luxury' }): number {
  const entry = NEIGHBORHOOD_CEILINGS[p.neighborhood] ?? DEFAULT_CEILING;
  return entry[p.type] ?? DEFAULT_CEILING[p.type];
}
```

These values are stored in **pounds** for readability; convert to pennies at the call site.

### Diminishing-returns formula (`src/lib/engine/renovation.ts`)

New helper:

```ts
/** Shrinks the renovation value uplift as current value approaches the area ceiling. */
export function applyCeilingDiminishingReturns(
  rawUplift: number,        // pounds
  currentValue: number,     // pounds
  ceilingPrice: number,     // pounds
): { uplift: number; diminishingFactor: number } {
  if (ceilingPrice <= 0) return { uplift: rawUplift, diminishingFactor: 1 };
  // 0 below 60% of ceiling, smoothly tapers to 0.1× at/above ceiling.
  const ratio = Math.min(1, currentValue / ceilingPrice);
  // Below 60% ratio → full 1.0 multiplier. From 0.6 to 1.0 ratio → linear taper to 0.1.
  let factor: number;
  if (ratio <= 0.6) factor = 1.0;
  else factor = Math.max(0.1, 1.0 - ((ratio - 0.6) / 0.4) * 0.9);
  return { uplift: Math.round(rawUplift * factor), diminishingFactor: factor };
}
```

This produces the curve the user described (`1.0 → 0.1` near ceiling) and applies the user's example formula:

```
New Value = Current Value + (Renovation Uplift × Multiplier × DiminishingFactor)
```

where the existing `getRenovationScaleMultiplier` is the size/value scaling already in place.

### Where it's applied

- **Dialog preview** (`renovation-dialog.tsx`): when computing `valueUp` for display, call `applyCeilingDiminishingReturns` so players **see** the cap before committing. Show a small footer chip when factor < 0.7: `"⚠ Approaching area ceiling — uplift reduced to 40%"`.
- **Store completion** (`processMonthEnd` renovation completion branch in `gameStore.ts`, lines 1284-1295): apply the diminishing factor to `actualValueGain` (and a softer 0.5× of the same factor to `actualRentGain`, since rent ceilings exist too but are less brutal).
- **Rent uplift**: scale by `0.5 + 0.5 × diminishingFactor` so rent caps gracefully — landlords can still squeeze a bit more rent even when capital uplift flattens.

### Invariants

- Diminishing returns apply **after** the existing probabilistic ROI roll (60/25/10/5), so a "major issues" outcome still zeroes everything.
- Cost is **never** reduced — players still pay the full scaled cost, which is the strategic friction the user wants.
- The dialog's value-range chip (`£low–£high`) is recomputed against the diminished number so expectations match reality.

---

## Memory updates

- New: `mem://game-mechanics/property-management/planning-permission` — describes which renovations require it, fees, wait, approval probability inputs, 6-month refusal cooldown.
- New: `mem://game-mechanics/property-management/ceiling-prices` — describes the postcode ceiling map, 0.6→1.0 ratio taper to 0.1× factor, applies to value & half-strength to rent.
- Update `mem://game-mechanics/property-management/renovation-and-depreciation` with a one-liner pointer to the two new files.

---

## Files changed

- `src/types/game.ts` — `PlanningApplication`, `PlanningStatus`; add field on `GameState`; bump `SAVE_VERSION` to 9.
- `src/lib/engine/constants.ts` — `NEIGHBORHOOD_CEILINGS`, `getCeilingPrice`, `'planning_cooldown'` on `PropertyLock` reason union.
- `src/lib/engine/renovation.ts` — `applyCeilingDiminishingReturns`.
- `src/components/ui/renovation-dialog.tsx` — flag PP-requiring entries, planning badge + fee/wait/% display, ceiling preview, CTA copy switch.
- `src/components/ui/renovation-tracker.tsx` — Planning Applications panel.
- `src/components/ui/property-card.tsx` — pending-PP pill.
- `src/stores/gameStore.ts` — `submitPlanningApplication`, monthly resolve loop, route `startRenovation` through PP gate, apply ceiling factor on completion, save migration v8→v9.
- `src/hooks/useGameState.ts` — expose `submitPlanningApplication`, `planningApplications`.

## Open questions / defaults assumed

- I'm assuming player wants pending PPs to be visible per-property only (not a global Bank/Planning tab). Easy to add a tab later if desired.
- Refusal cooldown defaults to 6 months; if too punishing we can drop to 3.
- Ceiling map is calibrated for current Middlesbrough levels; we can tune any neighbourhood if the curve feels off in playtest.
