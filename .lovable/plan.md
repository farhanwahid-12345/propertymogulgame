# Quality of Life, UX and Performance Upgrade

Covers the three lists you shared: quick wins, UI/UX quality of life, and technical foundations. Grouped into phases that can ship independently, quick wins first.

## What exists today (checked)
- `opsFlashAt` already flags the Operations centre, but Operations has no severity grouping.
- Save slot logic exists (`src/lib/saveSlots.ts`) and there is already a Save Slots dialog — it needs metadata previews, not a rebuild.
- A Web Worker already drives the game clock (`src/hooks/useGameEngine.ts`); month-end maths still runs on the main thread.
- `InfoTip` component exists and can back the glossary tooltips.
- No settings panel for auto-management flags and no save compression today.

## Phase 1 — Quick wins
1. **Auto-management toggles**: new `settings` object in game state with `autoAcceptOffersWithin5Percent`, `autoRenewCommercialIfRentIncreaseGte3`, `autoPayDamagesUnder500`. A small Settings dialog (gear in the header) with switches; month-end honours each flag and logs what it did to the activity feed.
2. **Notification triage**: split Operations alerts into three tabs — Urgent (court dates, eviction deadlines, possession hearings), Financial (tax due, fix ending, arrears, negative cashflow), Opportunities (below-market auctions, tenant offers, refinance headroom). Counts shown per tab; `opsFlashAt` targets the highest-severity tab.
3. **Days-remaining badges**: colour-coded badge on property cards for commercial lease expiry/break clause and fixed-rate mortgage end (green > 12 months, amber < 6, red < 3).

## Phase 2 — UI/UX quality of life
4. **"What-if" calculator**: modal with LTV / term / fixed-years sliders shown before confirming a purchase, mortgage or remortgage, with live monthly cashflow, total interest and ROI.
5. **Predictive 12-month cashflow chart**: line chart on the Bank panel projecting rent, fixed costs, fix expiries reverting to SVR, and scheduled tax bills, with a warning band when projected cash goes negative.
6. **Interactive portfolio map**: grid/list view of owned properties, colour-coded by a selectable metric (negative cashflow, EPC below C, tenant satisfaction); clicking opens the property sheet.
7. **Bulk actions**: checkbox selection on the portfolio with "List all for sale", "Upgrade all to EPC C", "Assign letting agent to all HMOs", each with a confirmation summary of total cost.
8. **Glossary tooltips**: reuse `InfoTip` with a shared jargon dictionary (FRI lease, Section 21, Section 24, yield, LTV, ICR, CGT, MEES) and place it next to those terms.

## Phase 3 — Technical foundations
9. **Offload heavy maths to a Web Worker**: move month-end processing, portfolio valuation and tax projection into a worker, keeping the pure engine functions as the shared code; UI shows a brief "processing month end" state instead of dropping frames.
10. **Save compression**: compress persisted state with `lz-string` before writing to localStorage, with transparent decompression and a fallback for existing uncompressed saves.
11. **Save slot metadata**: extend the existing slots UI with net worth, months played, city and last-saved date per slot, plus rename/duplicate/delete.

## Technical notes
- Any new state fields are optional with safe defaults, plus a migration step in `gameStore.ts` and a `CURRENT_VERSION` bump so existing saves keep working.
- Monetary values stay in pennies; all randomness uses `gameRandom()`; probabilities come from named constants.
- Worker migration keeps `processMonthEnd` logic in pure engine modules so existing regression tests continue to cover it, with new tests for the auto-management toggles, badge thresholds and compression round-trip.
