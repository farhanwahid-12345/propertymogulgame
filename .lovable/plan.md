# UX, Tenant System & Analytics Improvements

Three independent batches. Pick any to skip — each is self-contained.

---

## Batch 1 — User Experience

### 1a. Tutorial / onboarding
Replace `EntityOnboardingDialog` with a **2-screen onboarding flow** for first-time players (no save yet):

1. **Welcome** — 4 illustrated cards explaining: Buy → Tenant → Maintain → Profit. Includes the £100k starting cash hook.
2. **Entity choice** — existing sole trader vs LTD picker (kept).

Store `onboardingCompleted: boolean` in game state, version-bump persist to 14.

### 1b. Tooltips for complex mechanics
Add `<Tooltip>` (already in shadcn) wrappers with one-line explanations on every occurrence of:

- **LTV** — "Loan-to-Value: debt as % of property value. Lenders cap this."
- **DTI** — "Debt-to-Income: monthly debt vs rental income."
- **ICR** — "Interest Coverage Ratio: rent ÷ interest (≥125% required)."
- **Section 13** / **planning permission** / **Section 24** — short legal context.

Implementation: introduce `src/components/ui/info-tip.tsx` (small `?` icon + tooltip) and drop it next to labels in `game-stats.tsx`, `property-card.tsx`, `mortgage-provider-selector.tsx`, `tax-breakdown.tsx`.

### 1c. Notifications Centre (replaces toast spam)
- New `notifications` slice in store: `Notification[]` with `{id, month, severity, title, body, category, read}`.
- `enqueueNotification()` is called everywhere `showToast()` currently fires *except* truly transient feedback (rate-change confirmations, manual button results).
- New `<NotificationCentre>` bell in the header showing unread count + drawer with grouped feed (financial / tenant / planning / market). Mark-all-read + clear.
- **Toasts are kept only for active user actions** (purchase confirmed, eviction served). Background tick events (rent collected, concerns raised, mortgage paid off) flow into the centre.
- Updates the existing **Activity Feed** to read from `notifications` so we have one source of truth.

### 1d. Pause function
- Add `isPaused: boolean` to store + `togglePause()` action.
- `useGameEngine` worker tick checks `isPaused` and short-circuits.
- Add ⏸/▶ button next to the existing speed picker in `GameClock`.
- Auto-pause when any modal opens (eviction dialog, rent negotiation) — optional toggle in settings.

### 1e. Upcoming events panel + commercial / fixed-term mortgages
Two pieces:

**Upcoming events panel** — new `<UpcomingEvents>` card on the Bank tab:
- Next mortgage rate review (5 / 10 / 15-year fix expiry)
- Next Section-13 rent review window per occupied property (annual)
- Next CGT / income tax / corporation tax due date
- Pending planning decisions
Computed live from existing state — no new persisted fields except mortgage `fixedTermYears` and `fixedUntilMonth`.

**Mortgage term variants**:
- Extend `Mortgage` with `fixedTermYears: 2 | 5 | 10 | 15` and `fixedUntilMonth: number`.
- Different spreads per fix: shorter = lower rate but more frequent shocks.
- On expiry, mortgage rolls to the provider's current variable rate (with a notification prompting refinance).
- Update `MortgageProviderSelector` UI to expose the choice.

**Commercial rent reviews**:
- Commercial properties get an additional 3-yearly **rent review** (not Section 13). Auto-bump tied to a new `nextCommercialReviewMonth` field; player can decline (tenant may leave).

### 1f. UI reconfiguration — single-screen dashboard
Currently the dashboard requires lots of scroll. Reflow:

- Convert top hero into a **sticky compact header** (collapses to 56px on scroll) carrying: cash, net worth, clock, speed, pause, notifications bell.
- `GameStats` card collapses to a single row of mini-stats above the tabs.
- Move "Operations", "Action Required", "Listed Properties" from stacked collapsibles into a **right-hand sidebar drawer** on desktop (≥1280px) that's pinned-open by default but toggleable. On mobile they stay in the bottom-nav drawer.
- Tabs (Market / Bank) take centre column with the portfolio grid below.
- Result: cash, clock, alerts, ops, market and portfolio all reachable from a single viewport at 1280×800.

### 1g. Sound effects
Extend existing `src/lib/sound.ts` with named cues:
- `playCoinChime()` — rent collected
- `playGavel()` — sale completed / auction won
- `playPaper()` — eviction / tax filed
- `playWarning()` — concern raised, mortgage shock
- `playLevelUp()` — level up
Each maps to a different short WebAudio waveform so we keep zero asset bundle. Add a **Sound** toggle in the new sticky header (already-persisted `pm_sound_enabled`).

### 1h. Activity ticker cleanup + auto-clear
- **Remove the horizontal `ActivityTicker`** entirely (the screenshot shows it's the offending strip).
- Replace with the Notifications Centre bell (1c).
- "Clear" button in the centre, plus auto-mark-read for items older than 4 newer notifications (the "every fourth notification" rule from the brief).

---

## Batch 2 — Tenant System

Extend `Tenant` (already has `creditScore`, `monthlyIncome`, `employmentStatus`, `traits`) with:

### 2a. Tenant reviews / reputation
- Add `landlordReputation: number` (0–100) to game state. Starts at 50.
- Each completed tenancy emits a review:
  - Properties kept in good condition + concerns resolved promptly → +1 to +3.
  - Unresolved concerns at move-out → −2 to −5.
  - Eviction (any ground except antisocial) → −3.
- Reputation gates **tenant pool quality**: high reputation surfaces more premium tenants in `TenantSelector` and reduces void periods. Show as a 5-star badge in the header.

### 2b. Screening tools (paid)
In the tenant selector dialog, add three optional pre-let checks (pay then reveal):
- **Credit check (£35)** — reveals exact `creditScore` (currently always shown — flip default to hidden with a "Run check" button).
- **Reference check (£50)** — reveals previous-landlord remark and `defaultRisk` numerically.
- **Right-to-rent check (£25)** — required by law; without it, accepting tenant triggers a small fine risk monthly.
Costs paid via `debit()`; outcomes stored on the tenant record so screening persists across reopens of the dialog.

### 2c. Furnishing options
Add `furnishingTier: 'unfurnished' | 'part_furnished' | 'fully_furnished'` to `Property` (default `unfurnished`).
- Upgrade options in the property card: "Furnish" button → modal with three tiers, each with a one-off cost scaled by sqft.
- Effects:
  - `unfurnished` — base rent, broader tenant pool.
  - `part_furnished` — +5% rent, mild quality boost.
  - `fully_furnished` — +12% rent, premium-tenant access boost, +20% damage risk (insurance covers most).
- Furnishings depreciate: 60 months → reverts to unfurnished unless refreshed.

---

## Batch 3 — Analytics

Lightweight, **local-only** event tracking — no external services.

- New `analyticsEvents: AnalyticsEvent[]` slice; capped at ~500 events (FIFO).
- `trackEvent(name, payload)` helper called from key actions:
  - `property_purchased`, `property_sold`, `mortgage_taken`, `renovation_completed`, `tenant_selected`, `tenant_evicted`, `level_up`, `concern_resolved`, `concern_decayed`.
- New **Insights** tab (Bank tab → sub-tab) with:
  - Renovation ROI: avg value-uplift ÷ cost per category.
  - Tenant choice mix: pie of profiles selected vs available.
  - Purchase pattern: avg yield bought, avg LTV taken, time-on-market before listing.
  - Cashflow chart (already partial in `tax-breakdown.tsx`) extended to a 24-month sparkline.

Charts use existing `recharts` (already in deps — `chart.tsx`).

---

## Files

**New (≈14)**:
- `src/components/ui/info-tip.tsx`
- `src/components/ui/notification-centre.tsx`
- `src/components/sections/StickyHeader.tsx`
- `src/components/sections/RightSidebar.tsx`
- `src/components/sections/UpcomingEvents.tsx`
- `src/components/ui/onboarding-flow.tsx`
- `src/components/ui/furnishing-dialog.tsx`
- `src/components/ui/screening-checks.tsx`
- `src/components/ui/insights-panel.tsx`
- `src/lib/engine/analytics.ts`
- `src/lib/engine/notifications.ts`
- `src/lib/engine/upcomingEvents.ts`
- `src/hooks/usePauseGuard.ts`
- `src/hooks/useNotifications.ts`

**Modified**: `gameStore.ts` (notifications/pause/analytics slices, mortgage fixed-term, furnishing, reputation), `Index.tsx` (new layout), `game-clock.tsx` (pause button + sticky), `tenant-selector.tsx` (gated screening), `property-card.tsx` (furnishing button + tooltips), `mortgage-provider-selector.tsx` (term picker), `useGameEngine.ts` (pause check), `sound.ts` (named cues), `types/game.ts`, persist version → 14 with migrators.

## Phasing

Phase 1 — UX foundations: 1c (notifications), 1d (pause), 1g (sound), 1h (remove ticker). Quick wins, low risk.
Phase 2 — UI reflow: 1f (sticky header + sidebar), 1b (tooltips).
Phase 3 — Game depth: 1a (onboarding), 1e (upcoming events + mortgage terms + commercial reviews), Batch 2 (tenants).
Phase 4 — Batch 3 (analytics + insights).

## Out of scope

- Server-side analytics / external SDK.
- Reworking macro-economic event system.
- Multiplayer / leaderboards.
- Voice/video tutorial; onboarding stays text + illustrations.
