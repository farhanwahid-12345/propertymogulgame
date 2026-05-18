## Goal
Work through the 18 improvements in `Lovable_Improvements.pdf`, grouped by area so related code is touched once.

## Grouped work

### A. Tenant behaviour & arrears (items 2, 9)
- Surface non-payment / anti-social events as **toasts + Operations badge** (not just silent feed entries) and trigger them at a realistic cadence (max 1 event per tenant per ~2–3 months).
- Track arrears per tenant: deduct missed rent from owed balance, expose `arrearsMonths` and `arrearsAmount` on property card (red pill with £ owed and # months).
- Auto-prompt eviction eligibility (2+ months arrears = Section 8 ground 8) with a CTA in the Operations centre + Action Required panel.
- Fix the arrears engine: only put the player into arrears when **cash + overdraft headroom** cannot cover the shortfall. Today it ignores cash on hand for the in-progress month.
- Overdraft auto-repay: only repay when cash > total balance + buffer **and** the user has opted in. Default: never auto-repay. Add a toggle in Bank → Credit & Banking.

### B. Operations button polish (items 3, 11)
- Flash/ping on **any** new operation event: renovation complete, conveyancing complete, planning decision, tenant concern, eviction eligible.
- Stop the false flash: clear `hasUnseenConcerns` when the panel opens AND when the underlying concern list is empty. Today it stays "dirty" because the flag isn't reset after auto-resolution.

### C. Mortgages & loans (items 4, 6)
- **Partial loan payments**: add a "Pay amount" input next to "Pay off in full" on each active loan and on mortgage settlement; recompute amortisation/term.
- **Portfolio remortgage**: when a property is already inside an existing portfolio mortgage and the user opens Portfolio Mortgage, allow it to be selected. On confirm, settle the previous portfolio facility and roll those properties into the new one (no "already secured" rejection).
- **Portfolio selection bug (18)**: remove the silent filter that hides properties already used as collateral. Show all owned properties; explain inline if any are conflicted, but still selectable when remortgaging.

### D. Tax (item 5)
- Implement UK loss carry-forward: track `unusedLosses` per entity, offset against future rental profits (sole trader: future property income only; LTD: future trading profits). Surface in Tax breakdown ("Losses brought forward: £X, used £Y").

### E. Reputation (item 1)
- Replace static reputation with dynamic score driven by: evictions served, won/lost tribunal cases, deposit disputes lost, tenant satisfaction average, length of tenancies, S13 outcomes, maintenance response time. Decays back to neutral over time. Display as a trend (▲/▼) with breakdown tooltip.

### F. Planning & renovations (items 7, 13, 14, 15, 16)
- **7**: Allow planning applications on tenanted properties for extensions/loft conversions. Keep the block only for **unit-count-changing conversions** (HMO/flats), and even then offer "Apply now, build after vacancy" instead of a hard refusal.
- **13**: Scale renovation cost AND uplift with property value & sqft properly; rebalance ROI so high-end refurbs remain marginally profitable (target 10–25% ROI band regardless of tier). Fix the prediction so headline ROI matches actual booked uplift.
- **14**: Raise base planning approval rate (~80% straightforward extension, ~65% conversion) and reduce neighbour-objection penalty.
- **15**: Extensions add sqft (single-storey: +X based on plot size; HMO: +1 room scaling sqft; conversion-to-flats: split sqft into N units). Display "+Y sqft / +N units" inside the renovation submenu before confirming. Cap by plot size (derive plot from current sqft × multiplier).
- **16**: Add "Double-height extension" option — ~1.8× cost of single-storey, ~1.9× sqft, slightly lower approval odds.

### G. Section 13 dialog (item 17)
- Audit `Current rent` and `Local market` values: ensure current rent = tenant's actual paid rent (not headline listing), and `Local market` = engine's per-property market rate (today they can be reversed when market rent < current rent, as in screenshot). Add an explicit "Below market" / "Above market" indicator.

### H. UI / layout polish (items 8, 10, 12)
- **8 (macro events)**: Show macro events as a **modal popup** when they fire (dismissable), and continue listing in the activity feed. Replace the inline yellow banner.
- **10**: Lock the Action-Required / portfolio summary row position; it currently reflows when the alert badge appears/disappears. Use stable min-height containers.
- **12**: Move the "Cash Flow / Debt / Month" compact stats from the inline hero strip into the top header (next to the clock). Shrink hero on desktop accordingly.

## Technical notes
- Engine changes land in `src/lib/engine/` (taxation, financials, renovation, planning) — keep pure.
- Store: add `unusedLosses`, `overdraftAutoRepay`, per-tenant `arrearsMonths`, `reputationScore` & breakdown to `gameStore` slices.
- UI: new components for arrears pill (in `property-card.tsx`), macro-event modal, partial loan/mortgage payment inputs, dynamic reputation tooltip.
- Operations flash: refactor `useOperationsAlerts` hook to a single derived signal `{flash: boolean, reason}` reset on panel open.
- Save migration bump (current version + 1) with safe defaults for new fields.

## Order of execution
1. Bug fixes first (9 arrears/overdraft, 11 false flash, 10 layout shift, 17 S13 values, 18 portfolio selection) — quick wins, prevent further confusion.
2. Mechanic upgrades (2 arrears UX, 3 ops flash, 4 partial payments, 6 portfolio remortgage, 7 planning on tenanted).
3. Economy rebalance (13 reno scaling, 14 approval rates, 15 sqft, 16 double-height, 5 loss carry-forward).
4. Polish (1 reputation, 8 macro popup, 12 header compaction).

## Out of scope
- No auth/backend changes. No new third-party libs.
