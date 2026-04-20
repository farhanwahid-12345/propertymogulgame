

# Plan: Tenant Concerns, Conversion Renovations, Property Sizing, Realistic Value Trends

Four mechanic-level upgrades pulled from the annotations.

---

## 1. Tenant Concerns Feed

A live feed where tenants raise issues (boiler broken, mould, late repair, noisy neighbour). Players resolve them to protect satisfaction; ignoring decays it.

### Data model — `src/types/game.ts`
New type:
```ts
export type ConcernCategory = 'maintenance' | 'noise' | 'mould' | 'appliance' | 'safety';
export interface TenantConcern {
  id: string;
  propertyId: string;
  tenantProfile: 'premium'|'standard'|'budget'|'risky';
  category: ConcernCategory;
  description: string;          // "Boiler not heating properly"
  raisedMonth: number;
  resolveCost: number;          // pennies — cost to fix
  satisfactionPenaltyIfIgnored: number; // -X per month unresolved
  resolvedMonth?: number;
}
```
Add `tenantConcerns: TenantConcern[]` to `GameState` + bump `SAVE_VERSION`.

### Generation — `gameStore.ts processMonthEnd`
- For each tenanted property, ~6% chance/month to raise a concern (higher if condition=dilapidated, lower if premium).
- Picks a category + cost band based on property value (£200–£3,000).
- Premium tenants raise concerns sooner & expect faster resolution (penalty −4/mo); risky tenants rarely complain but cause damage instead.

### Resolution actions — store
- `resolveTenantConcern(id)` → debits cash, marks resolved, **+8 satisfaction**, removes from feed.
- `dismissTenantConcern(id)` → keeps in feed; each unresolved month subtracts `satisfactionPenaltyIfIgnored` from the tenant's satisfaction (already wired into existing satisfaction loop).
- Auto-applied: if condition is upgraded or relevant renovation completes (e.g. central heating fixes "boiler" concerns) auto-resolve matching concerns.

### UI — new `src/components/ui/tenant-concerns-feed.tsx`
Glass panel mounted in `Index.tsx` next to tenant satisfaction summary:
- One row per active concern: 🔧 icon · property name · concern text · cost · "Resolve £X" / "Snooze" buttons
- Empty state: "No concerns — tenants are happy 😊"
- Auto-collapses if zero items.

Also surface a small concern count chip on `PropertyCard` next to the satisfaction bar (e.g. red `2!` badge).

---

## 2. Renovations: Conversions, Realistic ROI, Loss Risk

### 2a. New conversion-tier renovations — `src/components/ui/renovation-dialog.tsx`
Add a new `category: "conversion"` with realistic UK options:
| Conversion | Cost | Rent + | Value + | Duration | Notes |
|---|---|---|---|---|---|
| House → HMO (4-bed) | £18,000 | +£600/mo | +£8,000 | 60d | Requires `residential`, value > £80k |
| House → HMO (6-bed) | £35,000 | +£1,100/mo | +£15,000 | 90d | Requires bedrooms ≥ 3 (use sqft proxy, see 2c) |
| Convert to Flats (2 units) | £55,000 | +£900/mo | +£40,000 | 120d | Type changes to `residential` multi-let flag |
| Commercial → Residential | £40,000 | depends | varies | 90d | Only on `commercial` |
| Loft → Bedroom | already exists — keep |

Type changes are reflected by a new `subtype?: 'standard'|'hmo'|'flats'|'multi-let'` field on `Property`.

### 2b. Realistic ROI variability — `gameStore.ts` renovation completion (line ~688)
Right now value/rent uplift is deterministic. Replace with a **realism roll** at completion:
```ts
// Outcome distribution
//  60% — full uplift  (value+ × 1.0, rent+ × 1.0)
//  25% — minor under-delivery (× 0.7) — "ran over budget / underwhelming spec"
//  10% — break-even        (× 0.3) — "market didn't reward upgrade"
//   5% — net loss          (× 0.0 to value, refund rent+) — "issues found, abandoned"
```
Show a result toast describing the outcome ("Over budget — only £8k value gained vs £12k expected").

Players see expected range in the dialog: `+£8,400–£12,000 value (typical: £10,800)`.

### 2c. Square footage on every property
Extend `Property` with:
```ts
internalSqft: number;   // e.g. 750
plotSqft: number;       // e.g. 2,400 (residential) — defines extension headroom
```
- Generated in `market.ts` based on type + value:
  - residential: 500–1,800 sqft internal, 1,500–6,000 plot
  - commercial: 800–4,000 internal, plot ≈ 1.2× internal
  - luxury: 1,500–5,000 internal, 5,000–20,000 plot
- Display on `PropertyCard` as: `📐 850 sqft int · 3,200 sqft plot`
- **Gates extensions**: `loft_conversion`/`rear_extension`/`HMO 6-bed` require minimum sqft.

---

## 3. Property Card Uniform Sizing

Screenshot shows cards squashed/tight. The card already uses `flex flex-col h-full` but content within `CardContent` overflows on tight rows.

**Fix in `src/components/ui/property-card.tsx`:**
- Make the metrics grid use `min-w-0` with `truncate` on numeric values to prevent layout shifts.
- Standardise card height by reserving slots: always render Market Value/Profit/Loss rows for owned (already does) + add `min-h-[72px]` reservation for the renovation/tenant action footer.
- Ensure parent grid container in `Index.tsx` uses `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr` so all cards in a row match the tallest card.

---

## 4. Property Values Should Trend Upward (Middlesbrough realism)

**Problem:** All owned properties currently show big losses immediately after purchase because:
- `value` is set to `price` (purchase price), so any **stamp duty + £600 solicitor + 1% mortgage fee** appears as instant negative profit when compared against `marketValue` (only set if bought below asking).
- Annual growth is 2–4%, but Middlesbrough actually averaged ~5–7%/yr over 10y with occasional dips.

**Fix — `src/stores/gameStore.ts` `buyProperty` completion path (line ~917) + market.ts:**

### 4a. Stop showing fees as a paper loss
- On purchase completion, set `marketValue = max(originalListedValue, purchasePrice)`. If player paid *at* market, marketValue equals price → Profit/Loss starts at £0, not negative. Fees are tracked in `taxRecords`/cashflow — not in property valuation.
- Update `PropertyCard` "Profit/Loss" to read `marketValue - purchasePrice` only (already does), but clamp to ≥ £0 for first 3 months ("settling-in period").

### 4b. Improve appreciation curve — `gameStore.ts` line 542
Replace simple yearly bump with monthly drift + occasional dip:
```ts
// Monthly drift: base +0.45%, σ 0.20% (≈ +5.5%/yr nominal)
// 1.5%/mo chance of small dip (-0.5 to -1.5%)
// Macro recession event already exists — keep its -10% snap
const monthlyDrift = 0.0045 + (Math.random() - 0.5) * 0.004;
const isDip = Math.random() < 0.015;
const change = isDip ? -(0.005 + Math.random() * 0.01) : monthlyDrift;
property.value = Math.round(property.value * (1 + change));
property.marketValue = Math.round((property.marketValue || property.value) * (1 + change));
```
Remove the once-yearly 2-4% block (now superseded by monthly drift). Keep the once-yearly **rent** bump (+3%) on its own schedule.

Result: long-run ~5–6% appreciation with realistic monthly volatility, matching Middlesbrough's 10-year trajectory and ensuring values almost never fall below purchase except when player overpaid or a recession event hits.

---

## Files Modified / Created

| File | Change |
|---|---|
| `src/types/game.ts` | `TenantConcern` type, `tenantConcerns` state, `internalSqft`/`plotSqft`/`subtype` on Property; bump `SAVE_VERSION` to 4 |
| `src/stores/gameStore.ts` | Concern generation/resolution; conversion renovations wiring; ROI roll at completion; new monthly appreciation curve; settling-in marketValue fix |
| `src/lib/engine/market.ts` | Generate `internalSqft`/`plotSqft` on every property |
| `src/components/ui/renovation-dialog.tsx` | New `conversion` category options, sqft requirement gating, expected-range display |
| `src/components/ui/tenant-concerns-feed.tsx` *(new)* | Feed UI with Resolve/Snooze actions |
| `src/components/ui/property-card.tsx` | Sqft chip, concern count badge, uniform sizing, settling-in profit clamp |
| `src/pages/Index.tsx` | Mount concerns feed; pass concerns + handlers; grid `auto-rows-fr` |
| `mem://game-mechanics/property-management/annual-appreciation` | Update — monthly drift ~5.5%/yr with dips, replaces fixed 2-4%/yr |
| `mem://game-mechanics/property-management/renovation-and-depreciation` | Add conversion tier + ROI variability note |

