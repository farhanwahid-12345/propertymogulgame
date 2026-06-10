# Property Mogul v5 — Phased Execution Plan

11 tasks grouped into 5 phases. Each phase ends at a stable, test-green checkpoint. Stop for review after every phase.

---

## Phase 1 — Data Cleanup (low risk, prerequisite)

**Task 1 — Remove Property.image field**
- `src/types/game.ts`: delete `image: string` from `Property`.
- `src/lib/engine/constants.ts`: strip `image: "..."` from every entry in `AVAILABLE_PROPERTIES`.
- `src/lib/engine/market.ts`: remove the Unsplash URL line in the generated property factory.
- `src/stores/sanitizers.ts`: drop `image: asString(property?.image)`.
- `src/stores/slices/conveyancingActions.ts`: drop `image: ''` from the inline literal.
- Fix any remaining TS references. No UI/rendering changes.
- Checkpoint: `tsc` clean, 194/194 tests pass.

---

## Phase 2 — Gameplay Mechanics (state + engine + property card UI)

Grouped because all four touch `Property`, monthly engine pass, persisted shape, and property card.

**Task 2 — Letting Agent**
- Property fields: `isManaged: boolean`, `managingAgentFee?: number` (pennies), `agentTier: 'standard' | 'premium'`, `agentFeePct: number` (0.08–0.15).
- Engine: in `monthEndActions`, deduct fee from rent; auto-resolve open concerns at 1.2× standard cost; suppress manual resolve when managed; reduce void-period sampling by ~30%.
- UI: Hire/Dismiss toggle + "Agent managed" badge + fee line in income breakdown on `property-card.tsx`.

**Task 3 — Portfolio Performance Chart**
- New persisted slice `performanceSlice` with `monthlySnapshots: Snapshot[]` (cap 60, drop oldest).
- Snapshot recorded at end of `processMonthEnd`: net worth, cashflow, rental income, mortgage payments, property count.
- New `PerformanceChart` component (Recharts, already installed) inside Bank panel as a new inline dialog button: line chart with toggle (net worth / cashflow / rental income) + current-month summary stats.

**Task 4 — Rent Guarantee Insurance**
- Property fields: `hasRentGuarantee: boolean`, `rentGuaranteeStartMonth?: number` (30-day waiting period → 1 month).
- Engine: bill 3% of monthly rent as expense when active; if arrears on insured property, payout missed rent (cap 6 mo per tenancy); on void, pay 80% of expected rent for up to 3 mo; emit toast + activity-feed entry on payout.
- UI: toggle on property card, shield badge, cost/coverage tooltip.

**Task 5 — HMO Licensing**
- Property fields (HMO only): `hmoLicenceStatus`, `hmoLicenceAppliedMonth`, `hmoLicenceExpiresMonth`.
- City constants: licence cost £500–£1,500.
- Engine: 3-month grace from purchase; after grace + unlicensed → monthly £500 fine + −2 reputation; 2-month-before-expiry reminder notification; auto-mark expired.
- UI: status badge (Licensed · Expires Mo X / Unlicensed warning) + "Apply for licence" button on HMO cards.
- Persisted-shape migration bump (single step adding the new optional fields with safe defaults).

Checkpoint: targeted vitest suites for engine + 194 baseline tests pass.

---

## Phase 3 — Mobile & Platform

**Task 6 — Mobile responsive layout**
- Add `sm:`/`md:` breakpoints across `HeroHeader`, `Index.tsx` tab layout, `PortfolioGrid`, property cards, dialogs.
- Below 768px: single-column stack; HeroHeader → 2×2 grid; tab bar → fixed bottom nav (Portfolio · Market · Bank · Operations).
- Dialogs → bottom sheets on mobile via `responsive-dialog` (already present).
- Min tap target 44×44; no font under 13px.
- Manual QA at 375 / 390 / 430 px.

**Task 7 — PWA support**
- Add `vite-plugin-pwa` (dev dep) and configure in `vite.config.ts` (autoUpdate, runtimeCaching for app shell).
- `public/manifest.webmanifest` (name, short_name "Property Mogul", theme, bg, standalone, icons).
- 192/512 PNG icons in `public/`.
- Service worker registration in `main.tsx`.
- Lightweight install-prompt banner shown after second session (track `pm_session_count` in localStorage).

Checkpoint: app installable; mobile preview verified.

---

## Phase 4 — Retention Features

**Task 8 — Achievements**
- New persisted slice `achievementsSlice` with `unlocked: Record<string, number>` (id → unlock month).
- Engine hooks: evaluate after `processMonthEnd` and after key actions (buy, evict, renovate, planning approved, title split, mortgage settled, tribunal win).
- 14 achievements per spec.
- Toast on unlock; new "Achievements" inline dialog (grid of locked/unlocked tiles).

**Task 9 — Multiple Save Slots**
- Three Zustand persist instances keyed `pm_save_0..2`; separate `pm_active_slot` key.
- Slot selection screen at startup (auto-loads last active slot); main-menu button to switch.
- Each slot tile: editable name, net worth, property count, time played.
- Delete with confirm; Rename inline.
- Migration: existing single save → slot 0 on first run.

Checkpoint: switching slots reloads cleanly; achievements scoped per slot.

---

## Phase 5 — Polish

**Task 10 — Accessibility**
- All dialogs: `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap (Radix already handles most — audit + fill gaps).
- `aria-label` on every icon-only button.
- Toasts: `role="status"` / `role="alert"`.
- Pause/speed: keyboard shortcuts + labels.
- Interactive property cards: `role="button"`, `tabIndex={0}`, Enter/Space handlers.
- Progress bars: `aria-valuenow/min/max/label`.
- Form inputs: associated `<label>` or `aria-label`.
- Run axe-core in dev; resolve violations.

**Task 11 — Improved Onboarding**
- Replace single intro with 7-step spotlight tutorial (Welcome → Estate Agent → Buying → Waiting → First Tenant → Month End → Done).
- New `TutorialOverlay` component: dimmed backdrop with cut-out around target element + tooltip bubble; non-blocking (target remains interactive).
- Step state machine in `onboardingSlice`; auto-trigger when `onboardingCompleted === false`; Skip button on every step; never re-show after dismissal/completion.

Checkpoint: full a11y audit clean; new player flow verified end-to-end.

---

## Technical Notes
- Persisted-shape migrations bumped once per phase that adds fields (Phase 2, Phase 4), via existing `migrationSteps` registry in `src/lib/migrations.ts`.
- All money in pennies; UI converts at boundary (project core rule).
- New slices follow existing `createXxxActions(set, get)` factory pattern and compose into `gameStore.ts`.
- No backend changes; everything client-side + localStorage.

Awaiting approval before starting Phase 1.