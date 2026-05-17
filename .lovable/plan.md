## Problem

The 4-step intro tour ("Market → Bank → Operations → Action Required") feels broken:

1. **"Got it" doesn't close the dialog reliably.** `Index.tsx` writes `onboardingCompleted: true` directly via `useGameStore.setState`, but the older `useEffect` hook (lines 44–48 with `[]` deps) and the entity-pick re-render path race against it, and there's no `onOpenChange` wired to the Dialog — so on some flows the modal stays mounted.
2. **Skip tour / Back / Next look inert.** None of the buttons cause any visible change on the page behind the modal, so the user thinks they're broken even when state updates.
3. **Tour content lies about the UI.** It tells the user to "switch to the Market tab", "Bank tab", "Operations tab", and "Action Required tab" — but the page only has two real tabs (`market`, `bank`). Operations and Action Required are `CollapsibleSection` blocks lower on the page. So "Next" never demonstrates the thing it just described.

## Fix

Turn the tour into a real guided walkthrough that drives the page behind it, and centralize the close path so "Got it" always works.

### 1. Single source of truth for closing the tour

- Delete the legacy heal-effect in `Index.tsx` (lines 44–48). Replace with a one-shot selector inside `OnboardingGate` that calls `setState({ onboardingCompleted: true })` when `entityChosen && !onboardingCompleted` *and* the user has explicitly skipped/finished — never silently.
- Wire `onOpenChange` on the underlying Dialog/Drawer in `OnboardingFlow` so any close attempt funnels through `onFinish`. Today the dialog is rendered controlled but ignores all dismiss intents.
- Add a defensive fallback: `onFinish` also writes a `pm_onboarding_done` localStorage flag, and `OnboardingGate` treats that flag as equivalent to `onboardingCompleted=true` so a stuck zustand write can never re-open the modal.

### 2. Make the buttons demonstrably do something

- Lift `activeTab` + a `scrollToId` callback up so `OnboardingFlow` can call them on every step transition.
- Each tour step gets a `target` describing what to do when entering it:
  - `tour-market`   → `setActiveTab('market')`, scroll to the market listings.
  - `tour-bank`     → `setActiveTab('bank')`, scroll to `BankingPanel`.
  - `tour-ops`      → `setActiveTab('market')`, scroll to `#section-operations` (the Operations `CollapsibleSection`, which needs an `id`).
  - `tour-alerts`   → scroll to `#section-alerts` (already has the id).
- On entering each step, also apply a transient `ring-2 ring-primary/60` outline to the target node for ~2.5s via a `data-tour-highlight` attribute toggled from `OnboardingFlow`. Removed on step change or unmount.
- Reposition the dialog so the highlighted target is visible: switch desktop layout to a small bottom-right `Dialog` (`max-w-sm`, `bottom-6 right-6`) and keep the existing centred Drawer on mobile. This stops the modal from covering the very thing it's pointing at.

### 3. Honest tour copy

- Rewrite `TOUR_STEPS` so the descriptions match the real UI:
  - Market step: estate agent + auction house listings on the Market tab.
  - Bank step: mortgages, overdraft, loans, tax bill on the Bank tab.
  - Operations step: conveyancing / renovations / planning *section* (not tab) on the Market tab.
  - Action Required step: evictions + deposit disputes *section* near the bottom of the page.
- Update icons to match (`Store`, `Landmark`, `ClipboardList`, `Bell` — already correct).

### 4. "Come on at the start"

- Confirm the gate triggers for the actual first-run condition: `entityChosen === false` from initial store state. The Replay-tour button in settings continues to call `setState({ onboardingCompleted: false })` and rely on `skipEntity={true}`.
- Add a `aria-modal="false"` + non-blocking overlay variant so the page underneath stays interactive during the tour (matches "actually do something" — user can poke the highlighted tab while reading the tip).

## Technical Details

**Files touched:**

```text
src/pages/Index.tsx
  - drop legacy heal useEffect
  - add id="section-operations" and id="section-alerts" to the right CollapsibleSections
  - pass {activeTab, setActiveTab, scrollToId} into <OnboardingGate />

src/components/ui/onboarding-flow.tsx
  - new props: activeTab, setActiveTab, scrollToId
  - new useEffect on `stage` change: runs target.action() + highlights node
  - rewrite TOUR_STEPS copy + add `target: { tab, scrollId }` field
  - wire onOpenChange on the Dialog/Drawer → onFinish
  - desktop: render as bottom-right floating panel (non-modal) instead of centred modal
  - mobile: keep current Drawer

src/index.css
  - .tour-highlight { @apply ring-2 ring-primary/60 ring-offset-2 transition-shadow; }
```

**Edge cases handled:**

- Highlighted node not yet mounted (target tab not active) → first set tab, then `requestAnimationFrame` to scroll/highlight after the tab content paints.
- Mobile: skip the bottom-right repositioning; keep Drawer; still drive tab + scroll.
- Replay tour from settings: `skipEntity` already true, gate uses `onboardingCompleted=false` to reopen, all behaviour identical.

## Out of Scope

- No changes to entity-pick UX (Sole Trader vs LTD) — already working.
- No changes to `EntityOnboardingDialog` (separate post-bankruptcy flow).
- No mortgage / EPC / tenant-risk work — last loop's items remain shipped.
