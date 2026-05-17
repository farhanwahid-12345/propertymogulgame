## Goal
Put Operations, Loans, Tax and the four mortgage buttons (Pay Mortgage, Manage Mortgages, Credit & Banking, Portfolio Mortgage) on the same horizontal row as the Market / Bank toggle, instead of stacking them below.

## Changes

### `src/pages/Index.tsx` — tab header row
Restructure the row containing `TabsList` so it becomes a single wrap-friendly flex row holding, in order:

1. Market / Bank toggle (unchanged `TabsList`).
2. When `activeTab === 'market'`: `PropertyMarketActions` (Estate Agent + Auction House).
3. When `activeTab === 'bank'`:
   - The four mortgage buttons rendered via `BankingPanelActions` (Pay Mortgage, Manage Mortgages, Credit & Banking, Portfolio Mortgage).
   - Three compact trigger buttons that open Operations, Loans, Tax in modal dialogs (since the full collapsible sections won't fit inline). Each shows the icon + label + the same summary badge currently shown on the collapsible (e.g. "All quiet", "No active loans", "Paid £0 to date").

The row uses `flex flex-wrap gap-2 items-center` so it gracefully wraps on the 1001px viewport.

### `src/components/sections/BankingPanel.tsx`
- Keep `BankingPanelActions` exporting the four mortgage buttons (used inline from Index).
- Remove the in-panel toolbar render and the three `CollapsibleSection`s for Operations / Loans / Tax from the default `BankingPanel`.
- Export three new lightweight components consumed by Index:
  - `OperationsInlineButton` → opens a Dialog containing `<OperationsCenter …>`.
  - `LoansInlineButton` → opens a Dialog containing `<LoansPanel />`.
  - `TaxInlineButton` → opens a Dialog containing `<TaxBreakdown …>`.
  Each button shows its emoji + label and the dynamic summary text currently used as the `summary` prop on the collapsibles.
- `BankingPanel` itself becomes a thin wrapper that renders nothing on the Bank tab body (since everything moved into the header row); the `TabsContent value="bank"` in Index can be removed or left empty.

### Out of scope
- No changes to mortgage logic, Operations/Loans/Tax internals, onboarding tour anchors, or Market actions behavior.
- No styling overhaul beyond what's required to keep the row readable when it wraps.

## Technical notes
- Dialogs use the existing shadcn `Dialog` primitive already used elsewhere in the app.
- Tour anchors (`tour-ops`, etc.) move with the inline buttons so the onboarding still highlights them under the Bank tab.
- Summary badges read from the same `gameState` fields the collapsibles use today.
