## Plan

1. **Make the tutorial dismiss reliably**
   - Fix the onboarding completion flow so **Got it**, **Skip tour**, **X**, and intro dismissal update the same source of truth.
   - Remove the current legacy “heal” behavior that can leave the onboarding UI and saved state fighting each other.
   - Ensure dismissing the final coach card immediately removes it and persists that state.

2. **Stop the tutorial from blocking page buttons**
   - Keep the coach card visible only while it is genuinely active.
   - Ensure it does not leave a Radix dialog/body pointer-lock or invisible overlay behind after closing.

3. **Restore the main action buttons in the row you asked for**
   - Keep **Market / Bank** as the left tab switcher.
   - On **Market**, keep **Estate Agent** and **Auction House** inline with that row.
   - On **Bank**, show **Pay Mortgage**, **Manage Mortgages**, **Credit & Banking**, **Portfolio Mortgage**, **Operations**, **Loans**, and **Tax** inline with the Bank/Market row.

4. **Fix the bank inline button wrappers**
   - Keep Operations / Loans / Tax opening dialogs from their header-row buttons.
   - Leave the mortgage components’ existing dialogs intact, only changing placement/wrapping where necessary.

5. **Verify the actual clicks**
   - Test that **Got it** removes the tutorial.
   - Test **Estate Agent** and **Auction House** open.
   - Test switching to **Bank** and opening the mortgage/Operations/Loans/Tax buttons.