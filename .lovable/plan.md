# Property Card & Sales UX Improvements

Four related polish items from the screenshots. All frontend/presentation work plus a small tweak to how listing prices and AI offers are generated.

---

## 1. Remove "List for Sale" from the property card

**File:** `src/components/ui/property-card.tsx` (~line 682–689)

- Delete the red `List for Sale` button at the bottom of the owned-property card.
- Keep `onSell` prop (still used for auction routing elsewhere) but no longer wire it here.
- Selling is reached via **Bank → Estate Agent → Sell Properties** tab (already exists) and the Auction House. Add a tiny inline hint under the action row: *"Sell via Estate Agent or Auction House"* so users aren't lost.

## 2. Listed-Properties panel — contrast, position, and accurate listing price

**File:** `src/components/ui/listed-properties.tsx`, plus listing creation path.

Visual:
- Replace `bg-white/95 backdrop-blur-sm` with the project's `glass` token so it matches the dark theme. Remove the inner white nested `Card`s — use the same `glass p-4` block style as `PortfolioGrid` for each row.
- Tighten vertical rhythm: drop `CardHeader` padding, shrink title to `text-lg`, remove the redundant outer `Card` wrapper. Goal: each listing row is ~96px instead of ~200px.
- Render the panel **above** the Empire grid (it already is in `Index.tsx`) but remove the surrounding free space by collapsing the section padding in `CollapsibleSection` when empty isn't the case — verify no large gap between Action-Required and the listing block.

Pricing accuracy (item 2b):
- Today the panel shows `property.value` (market value). When a user lists at a higher asking price it isn't stored.
- Extend the listing record with `askingPricePennies` (set at list time from the user's chosen price, fallback to `value`). Surface it via the store's listing creation action.
- Display "Listed price: £X" prominently and a smaller "Market value: £Y" below with a Δ% badge (green/amber/red) so the gap is obvious.

## 3. More dynamic sale offers (item 2c, 2d)

**File:** `src/components/ui/property-offers.tsx` + store offer-generation path.

Today: offers are generated client-side on dialog open from `property.value` with a flat 0.85–1.05 band; the user can never counter, and offers never come back after declining.

Changes:
- Move offer generation into the engine (already partially there via `propertyListings.offers`). When the user declines, mark that offer as `declined` and after 1–2 in-game weeks roll a **counter-offer** at a slightly higher price (e.g. +2–4%) with a configurable cap.
- Introduce variance based on `askingPricePennies` vs `marketValue`:
  - Asking ≤ market: offers cluster 92–102% of asking, occasional bidding war (>105%).
  - Asking 5–15% over market: offers cluster 88–98% of asking; lower volume.
  - Asking >15% over market: stalling — offer count drops sharply, occasional lowball at 75–82%.
- Add a **Counter** button to each offer in `PropertyOffers` (next to Accept) that opens a small price input. Counter dispatches to the store, marks the offer pending, then resolves after 1 week with accept/reject/new-counter (60/30/10 split, weighted by gap to market).
- For auctions: widen the random outcome distribution. Today reserve + AI bidding lands close to value. Update `src/lib/engine/auction.ts` AI bid curve to occasionally cap out early (sells at 60–80% of value) and occasionally over-heat (sells at 115–140% of value) to mimic real auction variance.

## 4. Tighten Empire dead-space (image 3)

**File:** `src/components/sections/PortfolioGrid.tsx` and `src/pages/Index.tsx`.

- Remove the large `glass p-5` wrapper padding → `p-4`, and drop the 3-stat row's `mb-5` to `mb-3`.
- Collapse the heading row spacing: `mb-4` → `mb-2`, smaller `h2` (`text-lg`).
- Move the 3-stat summary (Total Value / Monthly Income / Avg Yield) into a single horizontal strip *above* the heading, removing the second stack of stats that currently doubles up with `GameStats`.
- In `Index.tsx` reduce `space-y-5` → `space-y-3` for the main container so all sections sit tighter.

---

## Technical notes

- New listing field `askingPricePennies` requires a save-migration bump (default to existing `value * 100` for legacy saves).
- New offer field `status: 'pending' | 'declined' | 'countered'` and `expiresAtMonth` for counter timing.
- Auction tuning lives in `src/lib/engine/auction.ts`; expose a tunable `AUCTION_VOLATILITY` constant in `src/lib/engine/constants.ts`.
- All visual changes must use existing semantic tokens (`glass`, `text-foreground`, `text-success`, `text-danger`, etc.). No raw hex.
- Keep `onSell` prop on `PropertyCard` for backward compatibility; just unused at render. Sell entry point lives in `EstateAgentWindow` already.

## Out of scope

- No backend/store schema changes beyond the two listing fields above.
- No new dependencies.
- Reputation, taxation, planning, mortgages — already complete in prior batches.
