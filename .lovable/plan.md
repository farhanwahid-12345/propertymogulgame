# Lovable Improvements 1 — Execution Plan

Two UI-only changes from the document. Both touch presentation code only; no game logic, store, or types changes.

## Phase 1 — Portfolio header layout

**Item 1: Move the "Sort properties" dropdown up into the Your Empire header row**

File: `src/components/sections/PortfolioGrid.tsx`

- Remove the standalone sort row (currently lines ~96–115, the `<div className="flex items-center gap-2 mb-2">` block containing the `Sort` label and `<Select>`).
- Move the same `Sort` label + `<Select>` into the existing header `<div className="flex items-center justify-between gap-3 mb-2 flex-wrap">` (line 62), placed inline next to the "Your Empire 🏰" title and the pending-pill badge — so it sits on the same line as "Your Empire" and "1 (+1 pending)".
- Keep the conditional render (`gameState.ownedProperties.length > 0`) so the Sort control only appears when the player owns properties.
- Slightly tighten the trigger styling so it fits inline (e.g. keep `h-7 w-[180px] text-xs`).

No changes to sort logic, options, or `useMemo` — only DOM placement.

## Phase 2 — Compact top information UI

**Item 2: Shorten the `GameStats` tile row to roughly the height of the hero header strip**

File: `src/components/game/game-stats.tsx`

Goal: the Net Worth / Cash Flow / Portfolio strip should read as a single slim bar (similar height to the sticky hero) rather than three tall tiles. All three stats stay visible and informative — only vertical density changes.

- Reduce wrapper padding: `glass p-3` → `glass px-3 py-1.5`.
- Replace the `grid grid-cols-1 md:grid-cols-3 gap-4` with a single horizontal flex row on md+: `flex flex-col md:flex-row md:items-center md:gap-6` (keep stacked layout on mobile so nothing overflows).
- For each of the three stat blocks (Net Worth, Cash Flow, Portfolio):
  - Drop the `pl-3` left-border block into an inline pill: keep the colored left border (`border-l-4 border-[hsl(var(--stat-*))]`) but shrink to `pl-2` and put label + value on the **same line** instead of stacked.
  - Render as: `<icon> Label: <bold value> · <secondary metadata>` — e.g. `💰 Net Worth £97,206 · Cash £9,636`.
  - Use `text-sm font-semibold` for the headline number (was `text-xl lg:text-2xl`).
  - Keep the existing Info popovers (Net Worth breakdown, Cash Flow breakdown) — just trigger them from the smaller inline `Info` button already in place.
- Keep the `border-l-4` accent colors so the three sections remain visually distinguishable.
- Preserve all data, popover contents, DTI/credit chips, and ARIA labels.

Result: a single-line stats strip on desktop with roughly the same vertical footprint as the hero bar's title region, while remaining a vertical stack on mobile.

## Out of scope

- No store, hook, type, or game-logic changes.
- No changes to other pages, Bank/Accounts panels, or the hero header itself.

## Verification

After implementation:
- Load the preview at `/`, confirm the Sort dropdown sits inline with "Your Empire" and the pending badge.
- Confirm the Net Worth / Cash Flow / Portfolio strip renders as one slim row on desktop, breakdown popovers still open, and the layout still stacks cleanly on mobile widths.
