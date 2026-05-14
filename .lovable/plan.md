## 1. Continuous "Repair Bar" replaces the 3-tier condition

Today every property is `dilapidated | standard | premium` and condition flips at fixed depreciation thresholds. Replace this with a continuous **Condition score (0–100)** that the player tops up by spending money, decays with use, and gates tenant acceptance.

### Data model (`src/types/game.ts`)
- Add `conditionScore: number` (0–100) to `Property`. Migrate legacy values: `premium → 85`, `standard → 60`, `dilapidated → 25`. Bump `SAVE_VERSION` to **17**.
- Keep the `condition` enum as a **derived** value for back-compat (renovation eligibility, satisfaction logic, EPC defaults). Single helper `conditionTierFromScore(score)`:
  ```
  ≥ 80 → 'premium'
  ≥ 45 → 'standard'
  < 45 → 'dilapidated'
  ```
- Add `conditionLastTopUpMonth?: number` for UI/decay smoothing.

### Decay model (per month, `processMonthEnd`)
- Per-property decay (in points) =
  `BASE 0.6` × `tenantWearMultiplier` × `useFactor`
- Tenant wear multipliers: `premium 0.7`, `standard 1.0`, `budget 1.3`, `risky 1.7`, vacant `0.4`.
- `useFactor` clamps decay to ≈ 6–10 pts/year typical (≈ 12 pts/yr risky tenant) — meaning a fully-refurbished property naturally drifts from 100 → ~70 over ~3 years if left alone, never plummeting "unrealistically".
- Floor at 5 (won't decay to 0 from neglect alone — true 0 only via damage events). Damage events still subtract a point chunk (5–15 pts depending on severity) on top of normal decay.
- **Tenant concern resolution refills +3 to +6 pts** (capped at 100), depending on concern category (mould → bigger lift, noise → small).

### Top-up mechanic ("Repair Bar")
- New action `topUpCondition(propertyId, pointsRequested)` in store.
- Cost: linear, `£25/sqft × points/100` (so a 900 sqft terrace at 30 pts costs ~£675 × 30/100 ≈ £202 per point — ballpark £6,750 to fully restore from 0). Tunable constant `CONDITION_TOPUP_COST_PER_POINT_PER_SQFT`.
- Cap top-up at 100; cap per-month spend at `+40 pts` to discourage trivial click-spam.
- Renovation dialog still exists for **conversions**, **EPC upgrades**, and **major refurbishments** that unlock new uplift bands (premium tier ceiling, conversion subtypes). Standard "basic repair" + "full renovation" buttons collapse into the bar.
- New `RepairBar` component on the property card (replaces the condition badge). Shows score + ghost decay forecast + slider/input for top-up + one-tap "Restore to 100" button with cost preview.

### Tenant acceptance thresholds
- Tenant selector blocks selection if `property.conditionScore < tenant.minCondition`. Profiles:
  ```
  premium  ≥ 75
  standard ≥ 55
  budget   ≥ 35
  risky    ≥ 15
  ```
- Inline message instead of letting them in then complaining later: *"Premium tenants need ≥75 condition. Property is at 62."*
- Existing satisfaction effects keep working via the derived condition tier (premium boosts +3, etc.) but the decay-based satisfaction tweak now scales with score gap rather than tier flip — milder swings.

### UI changes
- `property-card.tsx`: replace condition badge with horizontal Repair Bar (color-coded green ≥75 / amber 45–74 / red <45). Tooltip lists current decay rate + months until next tier downgrade.
- `tenant-selector.tsx`: gate options by `minCondition`, show required score.
- `renovation-dialog.tsx`: drop "Basic Repair" + "Full Renovation" entries; keep EPC, kitchen/bathroom, conversions, extensions. These now also bump `conditionScore` (e.g. EPC +10, kitchen +25, full conversion +60).
- `tenant-concerns-feed.tsx`: resolve action shows the bar lift it grants.

### Migration & touch list
- `src/types/game.ts` (field + version), `src/stores/sanitizers.ts` (default + clamp), `src/stores/gameStore.ts` (decay loop, topUp action, concern-resolve lift, tenant-selector gate enforcement, satisfaction adjustments), `src/components/ui/property-card.tsx`, `src/components/ui/tenant-selector.tsx`, `src/components/ui/renovation-dialog.tsx`, `src/components/ui/tenant-concerns-feed.tsx`, `src/lib/engine/constants.ts` (cost + decay constants, `conditionTierFromScore` helper).
- New: `src/components/ui/repair-bar.tsx`.

---

## 2. Stop "Mortgage Rejected" toasts firing outside the buy submenu

The estate-agent flow already shows an inline `Mortgage Denied: …` banner and disables submission. Toasts are still leaking from:
- `buyPropertyAtPrice` (auction completion path, store line ~1906)
- `buyProperty` (property-card direct buy, store line ~1822)
- `handlePortfolioMortgage` (portfolio mortgage path, store line ~3028)

### Fix
- Pre-check eligibility at every entry point that calls these store actions (auction win, property-card buy, portfolio mortgage dialog) and **disable the trigger button** with the same inline `Mortgage Denied: …` banner already used in the estate-agent dialog.
- In the store actions themselves, downgrade the failure path: silent return (no toast) when called with ineligible params — the UI gate is now the source of truth, and a toast appearing means a UI bug we'd want to surface as a console warning, not a destructive popup to the user.
- Auction window: before allowing a bid above what mortgage would cover, run `calculateMortgageEligibility` and show the same green/red pre-approval banner used in the estate-agent dialog.
- Portfolio mortgage dialog: same — disable "Apply" button + inline banner.

### Touch list
- `src/components/ui/auction-window.tsx` (or equivalent — verify), `src/components/ui/portfolio-mortgage-dialog.tsx`, any direct `buyProperty` call sites in `property-card.tsx`.
- `src/stores/gameStore.ts`: replace the three `showToast("Mortgage Rejected", …)` calls with `console.warn` + early return.

---

## Open questions before I build

1. **Tenant minimum-condition thresholds** — happy with `premium 75 / standard 55 / budget 35 / risky 15`? Or want them tighter?
2. **Decay budget** — target ~6–10 pts/yr (a refurb lasts ≈ 8–10 years before it needs another bar top-up) sound right, or should it churn faster for game pacing?
3. **Concern-resolve lift size** — `+3 to +6 pts` per resolved concern, or smaller (e.g. `+1 to +3`) so it's a nudge not a substitute for top-ups?
