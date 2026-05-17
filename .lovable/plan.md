# Continue: Final Three Refinements

Three items remain from the prior plan. Each is scoped tightly to avoid scope creep.

## 1. Fixed-Term Mortgage Selector

Add an "Initial Fixed Term" selector to all three buy/borrow flows so players can lock rates.

**UI (in three components):**
- `mortgage-provider-selector.tsx` (Estate Agent buy)
- Auction buy flow (same selector component reused)
- `portfolio-mortgage.tsx` (Bank tab)

Add a shadcn `Select` with options:
- SVR / Tracker (0%)
- 2-year fixed (−0.4%)
- 5-year fixed (−0.2%)
- 10-year fixed (+0.1%)

**Engine (`gameStore.ts`, `types/game.ts`):**
- Extend `Mortgage` with `fixedTermYears?: 0 | 2 | 5 | 10` and `fixedUntilMonth?: number`.
- Thread `fixedTermYears` param through `buyProperty`, `buyPropertyAtPrice`, and `handlePortfolioMortgage`.
- Apply rate delta at origination; on dynamic-rate ticks, skip rate adjustment while `month < fixedUntilMonth`.
- When fix expires, snap to current SVR + spread and emit a `notify` toast + chime.

## 2. Tenant Risk Weighting

Make tenant risk score actually matter for missed-rent and antisocial events.

**`src/lib/tenantRent.ts`:**
- Replace flat missed-rent probability with `riskScore`-based curve:
  - low (0–30): 1% / month
  - medium (31–65): 5% / month
  - high (66–100): 15% / month

**`gameStore.ts` monthly tick:**
- Add antisocial-behaviour event: `p = riskScore/1000` per occupied unit.
  - Fires a tenant-concern with 6-month decay.
  - Unlocks `antisocial_behaviour` eviction ground (already in eviction enum if present; otherwise add).
  - Applies −5 satisfaction to up to 2 neighbour properties owned by player in same neighbourhood.

**`tenant-selector.tsx` + `property-card.tsx`:**
- Show a small risk band chip (Low/Med/High) coloured semantically.

## 3. EPC Rating System

Add Energy Performance Certificate ratings as a new property attribute affecting tenants and renovations.

**Types (`types/game.ts`):**
- `epcRating: 'A'|'B'|'C'|'D'|'E'|'F'|'G'`

**Generation (`lib/engine/market.ts`):**
- Roll on creation weighted by property age/condition (newer/renovated → higher).

**Monthly tick (`gameStore.ts`):**
- If `epcRating` is F or G and property is occupied, push a "EPC below E — illegal to let" concern that decays satisfaction at 2× normal rate. (Reflects MEES regulations.)
- Annual EICR check: small cost (~£150) added to existing tenant-concern cost cycle.

**Renovation (`lib/engine/renovation.ts` + `renovation-dialog.tsx`):**
- New renovation type `epc_upgrade`:
  - Cost scales by rating jumps requested (e.g. G→C = 4 jumps × £2.5k × sqft factor).
  - Adds small value uplift (~2% per jump, capped).
  - Allowed while occupied (non-disruptive works only) up to D→C; below D requires vacancy.

**Display (`property-card.tsx`):**
- Coloured EPC badge (A green → G red) next to the existing chips.

## Files Touched

```text
Modified:
  src/types/game.ts
  src/stores/gameStore.ts
  src/hooks/useGameState.ts
  src/lib/tenantRent.ts
  src/lib/engine/market.ts
  src/lib/engine/renovation.ts
  src/lib/engine/constants.ts
  src/components/ui/mortgage-provider-selector.tsx
  src/components/ui/portfolio-mortgage.tsx
  src/components/ui/tenant-selector.tsx
  src/components/ui/renovation-dialog.tsx
  src/components/ui/property-card.tsx
  src/lib/notifications.ts
```

## Out of Scope

- No changes to existing chime mapping, net-worth calc, or onboarding (all shipped previously).
- No new auction logic beyond passing `fixedTermYears` through.
- Existing saves: EPC defaults to 'D' for legacy properties; `fixedTermYears` defaults to 0.
