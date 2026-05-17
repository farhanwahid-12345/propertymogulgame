## Plan

Move the four Bank action buttons (Pay Mortgage, Manage Mortgages, Credit & Banking, Portfolio Mortgage) out of the tab header row and into the Bank tab content area, sitting above the Operations / Loans / Tax sections.

### Changes

1. `src/components/sections/BankingPanel.tsx`
   - Render the `BankingPanelActions` toolbar at the top of the `BankingPanel` content (above the Operations CollapsibleSection), inside a glass container styled to match the other rows.
   - Keep the same props wiring; no logic changes.

2. `src/pages/Index.tsx`
   - In the tab header row, stop rendering `BankingPanelActions` when the Bank tab is active (since it now lives in the panel body).
   - Keep `PropertyMarketActions` inline on the Market tab unchanged.
   - Result: when on Bank, the header row shows only the Market/Bank toggle; when on Market, it still shows Estate Agent + Auction House inline.

### Out of scope
- No changes to Market actions, Operations/Loans/Tax internals, mortgage logic, or onboarding.