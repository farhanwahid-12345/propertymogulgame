## Plan

1. Restore the top action row layout
   - Keep the Market / Bank tab switcher on the left.
   - Show Operations in the same row for both Market and Bank.
   - On Market, show: Estate Agent, Auction House, Operations.
   - On Bank, show: Pay Mortgage, Manage Mortgages, Credit & Banking, Portfolio Mortgage, Operations, Loans, Tax.
   - Keep the existing dialogs/components; only change placement and visibility.

2. Make Operations visibly demand attention
   - Add an attention state to the Operations button when there is active work: tenant concerns, conveyancing, renovations, or pending planning.
   - Use a stronger flashing/pulse treatment for new or unresolved tenant concerns.
   - Keep the count/summary on the button so the player can immediately see what needs attention.

3. Chime when Operations needs attention
   - Reuse the existing sound system and concern chime.
   - Ensure tenant concerns trigger the chime when they are created, without double-playing from multiple UI components.
   - Respect the existing sound toggle.

4. Fix the tour properly
   - Use one name consistently: Tour.
   - Remove the broken interaction between local dismissed state, localStorage, and the legacy “heal” effect that currently prevents replay.
   - Make Replay tour work even after an entity has already been chosen.
   - Keep first-time onboarding safe: new players still choose entity first, then continue into the tour.
   - Ensure Skip tour, Got it, the close button, and Replay tour all update the same source of truth.

5. Update tour targets
   - Point the Operations tour step at the always-visible Operations button, not only the Bank-only version.
   - Keep Market and Bank tour steps switching tabs correctly.
   - Avoid invisible overlays or body pointer-lock after the welcome dialog closes.

6. Verify the fixes
   - Confirm Market row buttons open: Estate Agent, Auction House, Operations.
   - Confirm Bank row buttons open: all mortgage buttons, Operations, Loans, Tax.
   - Confirm Operations flashes/chimes for new tenant concerns.
   - Confirm first-time tour works and Replay tour works from the header menu.