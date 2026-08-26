# Execution Plan — Lovable Improvements #7

Audit result first: of the 14 items in the document, only two are already in place (item 9b per-room Section 13 restriction, item 10a EPC concern auto-resolve — both landed in earlier phases). Everything else still needs work, including several "I've tried to fix this" items where the previous fix was partial (popover layering, cheap listings at higher levels, HMO/apartment rents).

Decisions taken from your answers: apartment rents £300–800 **per unit**, skewed to the lower median; investments use lock-ins/settlement; the Listed Properties panel is removed from the dashboard entirely; the plot-size rules are applied retroactively via a save migration.

---

## Phase 1 — Rent realism (items 3, 9a)

**1.1 Apartment (flats) rents**
- In the LHA rent generator, derive each flat's rent from its own size/value band and city, then clamp per unit to £300–800 for Middlesbrough (scaled by city). Distribution skews low: most units land £350–550, with the top of the band reserved for large, high-value, good-condition units.
- Block rent = sum of per-unit rents, so a 4-flat block reads as a realistic total instead of one inflated figure.

**1.2 HMO room rents −30%**
- Reduce the HMO per-room rate by a further 30% in both the generator and the live rent calculator, keeping the two paths in sync so an existing HMO doesn't jump when a room re-lets.
- Same reduction flows into the per-unit rent ceiling so Section 13 can't push a room back above the new realistic level.

---

## Phase 2 — Commercial letting overhaul (items 2, 4, 4a, 4b)

**2.1 Interactive lettings agent**
- Add an agent Q&A panel to the commercial letting tab: "How long will this take?", "Can we find better tenants?", "How much more could we get?". Each returns a concrete, data-driven answer (expected months to let, probability of a stronger covenant appearing, realistic rent uplift range) drawn from the actual applicant pipeline, not canned text.

**2.2 Negotiable heads of terms**
- Extend the heads of terms dialog so rent, lease length, break clause and rent-review pattern are each individually negotiable, with the tenant counter-offering per line item based on covenant strength. Stronger covenants push back harder on rent but accept longer terms; weaker ones accept rent but demand break clauses.

**2.3 Lease costs corrected**
- Replace the current tiered solicitor fee (£1,500–£3,500) and agent fee with: agent = 10% of annual rent, solicitor = flat £750. Land registry stays as-is where legally applicable.

**2.4 Early re-letting window**
- Unlock the tenant search 6 months before lease expiry or a mutual break date, so the player can market the unit while it's still occupied.

**2.5 Faster search + better comms**
- Speed up the applicant drip (fewer empty months, more applicants per tick) and add regular monthly updates: viewings booked, applicant profiles, the current chance of a better-paying or stronger-covenant tenant arriving, and a nudge when a good offer is on the table.

---

## Phase 3 — Estate agent & auction feedback loop (items 5, 5a, 1a)

**3.1 Faster offers, even when overpriced**
- Rework the offer generator so overpriced listings still produce low offers within 1–2 months rather than going silent. Well-priced listings get offers faster than today.

**3.2 Move Listed Properties into the Estate Agent**
- Remove the Listed Properties panel from the dashboard entirely; it lives only inside the Estate Agent window.
- Compensate with pop-up dialogs for every new offer, counter-offer, acceptance and completion, plus sound cues across both estate agent and auction flows.

**3.3 Evictions consolidated into Operations (item 1a)**
- Remove the eviction dialog from property cards and multi-unit slots; property cards keep only a button that deep-links into Operations → Evictions, where the full serve/appeal/forfeit flow lives.

---

## Phase 4 — Bank investments (item 7)

New "Invest" section in the Bank tab with four products, valued monthly:

- **Savings account** — BoE base rate + 0.5%. Withdrawal notice period.
- **Premium bonds** — ~5%/yr, low volatility, hard £50,000 cap.
- **S&P 500** — 5–12%/yr with a 9.5% median, inversely linked to the BoE rate (low rates → higher returns). One-month settlement on sells.
- **Risky stocks & crypto** — each month rolls roughly a third big gain / a third big loss / a third flat, so value swings hard month to month. One-month settlement on sells.

Holdings and pending settlements count into net worth, with an "Investments" line in the net worth breakdown. Monthly performance shows in the activity feed.

---

## Phase 5 — HMO licensing lifecycle (item 8)

- Allow the HMO licence application as soon as planning permission is granted, rather than after renovation completion.
- Prompt for renewal 3 months before expiry, with a clear "Renew licence" action.
- On expiry, do not silently remove tenants: raise a blocking warning and a grace period with the renewal option still available; only enforce letting restrictions after the grace period lapses.

---

## Phase 6 — Property sizing & listing variety (item 12)

**6.1 Footprint rules**
- Newly generated properties start at roughly 35% of plot size; the maximum achievable internal size (after extensions) caps at roughly 70% of plot. Extension renovations respect this ceiling.
- Retroactive migration: existing properties are rescaled to fit the 35–70% envelope, preserving relative size ordering. Values are left untouched so no one's net worth moves.

**6.2 Listing variety**
- Generated listings sometimes arrive already extended, converted or renovated (a mix of pre-improved and untouched stock), so the market isn't uniformly blank-slate.

---

## Phase 7 — UI/display fixes (items 6a, 11a, 13a, 14a)

**7.1 Cash / LTV / DTI pop-ups behind the header (item 6a)**
- The current fix relies on `isolation: isolate` plus collision padding, which still loses to the sticky header's stacking context. Proper fix: give the header and the popover layer explicit, non-conflicting z-index tiers in the design tokens, render popover content in a top-level portal above the header tier, and remove the stacking-context isolation that traps it. Verified by driving the actual UI and screenshotting each popover.

**7.2 Cheap properties appearing at higher levels (item 11a)**
- Trace where sub-level stock leaks through: the market inventory generator can mint below-range properties, and the level range floor may be too low. Fix at generation time so the inventory itself is level-appropriate, and keep the display filter as a backstop.

**7.3 Net worth breakdown accuracy (item 13a)**
- Make the breakdown read from the single canonical net-worth function so property values in the panel always match the actual portfolio, including when the player is in overdraft. Remove any independent value summation in the panel.

**7.4 Remove the shade on the Market / Bank / Accounts panel (item 14a)**
- Drop the gradient/overlay running through the middle of the nav panel so labels read cleanly.

---

## Technical Notes

- All money stays in integer pennies; conversion only at the UI boundary.
- Two save-shape changes need a version bump and migration: investment holdings/settlements, and the retroactive sqft/plot rescale.
- Rent changes touch both the generator and the live rent calculator — both are updated together to avoid drift on re-let.
- Each phase ends with a typecheck plus a targeted test run on the touched engine modules; Phase 7.1 additionally gets a browser verification pass.
- No visual redesign: reuse existing glass/section styling.

## Out of Scope

- No changes to the tutorial engine, achievements or save-slot system.
- No new macro event types.
- No theme or typography changes.
