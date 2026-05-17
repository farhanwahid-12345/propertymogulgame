## Plan

1. Fix the tutorial dismissal path
- Update the onboarding gate so it uses both the Zustand `onboardingCompleted` flag and the `pm_onboarding_done` localStorage fallback when deciding whether to show the tutorial.
- Keep `Got it`, `Skip tour`, and the close button routed through the shared `dismissTour()` helper so all exits persist the completed state.
- Remove the stale tour reference to `section-ops` being under the Market tab, since Operations was moved into Bank.

2. Restore the Market purchase experience
- Put the actual `PropertyMarket` content back inside the Market tab, not just the action toolbar.
- Keep the compact Estate Agent and Auction action buttons inline with the tab header, but make sure their dialogs still expose the purchase/bid flow.
- Add a visible `section-market` anchor so mobile navigation and tour scrolling can target the Market area correctly.

3. Restore Bank, mortgage, loans, tax, and operations visibility
- Keep Bank actions inline, but render the full `BankingPanel` content under the Bank tab.
- Ensure Operations lives under Bank after the previous approved move, and update the tour/mobile nav to switch to Bank before scrolling to Operations.
- Ensure mortgage controls remain available: settle mortgage, manage mortgages/refinance, overdraft, and portfolio mortgage.

4. Fix the tab/header layout regression
- Replace the current duplicated `TabsContent` header setup with one stable tab header above the tab contents.
- Use a responsive layout that keeps Market/Bank triggers visible and wraps action buttons instead of clipping them at the 1001px viewport.
- Avoid horizontal clipping/hidden overflow around the action buttons.

5. Validate the fix
- Use the preview at the reported 1001px width to confirm: `Got it` closes the tutorial, Market shows purchase entry points, Bank shows mortgage/banking controls, and the Bank tab content is accessible.