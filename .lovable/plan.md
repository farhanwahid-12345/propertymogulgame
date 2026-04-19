

# Plan: Bug Fixes & UX Polish

Fix 7 issues from the screenshots: notification persistence, owned-property duplicates, tenant rent mismatch + dialog stuck, card sizing, mortgage repayment display, portfolio-wide stress test, and inline mortgage rejection.

---

## 1. Notifications (Sonner) — auto-dismiss faster + always closable
**File:** `src/components/ui/sonner.tsx`
- Add `duration={4000}` (default is 6000+) and `closeButton` so users can dismiss with one click.
- Add `position="top-right"` styling and visible × on hover.

---

## 2. Owned properties showing up at Estate Agent
**File:** `src/stores/gameStore.ts` (`replenishMarket`)
- Build `excludedIds = ownedIds ∪ conveyancingIds ∪ listingIds`.
- Filter `auctions` and `estate` arrays to remove any property whose id is in `excludedIds` (currently only filtered when *adding* new ones).
- Also when `buyProperty`/`buyPropertyAtPrice` succeed (entering conveyancing): immediately remove that property from `estateAgentProperties` and `auctionProperties` so it disappears from the listings during the 1–3 month conveyancing window.

---

## 3a. Tenant rent mismatch (preview ≠ actual paid)
**Files:** `src/components/ui/tenant-selector.tsx`, `src/stores/gameStore.ts` (`selectTenant`)
- **Root cause:** preview uses `tenant.rentMultiplier` (random 0.75–1.35); actual store uses fixed profile band (premium 1.10 / standard 1.0 / budget 0.90 / risky 1.05) × condition multiplier.
- **Fix:** Make a single shared helper `calcTenantRent(baseRent, tenant, condition)` and call it from both the preview card and `selectTenant`. Show the breakdown in the preview ("Base £X × Premium 1.10 × ✨ Premium condition 1.25 = £Y/mo").

## 3b. £0/mo shown for some tenants & sub-menu won't close
**Files:** `src/components/ui/tenant-selector.tsx`, `src/components/ui/property-card.tsx`
- `baseRent` falls back to `property.monthlyIncome`, but during a void/default month `monthlyIncome` may be reduced. Use `property.baseRent ?? property.monthlyIncome` and when both are 0, derive from `value × yield/12` as last resort.
- **Dialog close:** wrap `setIsOpen` callbacks in `useCallback`, ensure `onOpenChange={setIsOpen}` properly handles the overlay click. The dialog likely gets stuck because a background tick re-renders the property-card and unmounts the Dialog mid-interaction. Hoist `isOpen` state to a `useRef`-guarded controlled dialog, or memoize the parent props passed to PropertyCard so it doesn't re-mount.

---

## 4. Property card sizes not uniform
**File:** `src/components/ui/property-card.tsx`
- Add `flex flex-col h-full` to the `Card`, make `CardContent` use `flex-1 flex flex-col`, and push the action buttons to the bottom with `mt-auto`.
- Ensure parent grid uses `grid-rows-[auto]` items-stretch (already does via grid). All cards in a row will then match the tallest sibling.

---

## 5. Display monthly repayment & total payable when choosing mortgage
**File:** `src/components/ui/property-card.tsx` (mortgage panel)
- Below the provider list, when a provider is selected show a summary block:
  - `Monthly Payment: £X/mo`
  - `Total Payable: £X` (= monthly × term × 12 for repayment, or interest×term + principal for interest-only)
  - `Total Interest: £X`
- Already calculating `estimatedMonthly` per provider — just surface the chosen one in a prominent panel.

---

## 6. Portfolio-wide stress test once 3+ properties owned
**Already implemented** in `src/lib/mortgageEligibility.ts` (lines 122–148: switches to portfolio 125% ICR when `ownedPropertyCount >= 3`).
**File:** `src/components/ui/mortgage-refinance.tsx` — the screenshot shows it still doing per-property check.
- Update the inline stress test display in refinance UI to use the same `calculateMortgageEligibility` call (with `ownedPropertyCount`, `totalRentalIncome`, `existingMonthlyMortgagePayments`) instead of computing rent ÷ payment locally.
- Show "Portfolio Stress Test (125%)" vs "Property Stress Test (100%)" label based on count.

---

## 7. Inline mortgage rejection (no popup blocking purchase flow)
**Files:** `src/components/ui/property-card.tsx`, `src/components/ui/estate-agent-window.tsx`
- Currently the rejection toast appears and the dialog/sub-menu stays open but user has no inline feedback.
- Add a per-provider inline error tag: when the selected provider fails eligibility, show a red banner *inside* the mortgage panel: "❌ Mortgage Denied: <reason>" with the slider/term/provider still editable so user can immediately tweak (lower LTV, change provider, etc.) without re-opening the dialog.
- Run `calculateMortgageEligibility` reactively in the property card whenever LTV/provider/term changes — disable the Buy button + show inline reason if not eligible, instead of waiting for the store action toast.

---

## Files Modified

| File | Changes |
|---|---|
| `src/components/ui/sonner.tsx` | Shorter duration, close button |
| `src/stores/gameStore.ts` | Exclude owned/conveyancing from market; remove from listings on buy; share rent formula |
| `src/components/ui/tenant-selector.tsx` | Shared rent calc, baseRent fallback, dialog close fix |
| `src/components/ui/property-card.tsx` | Uniform sizing (flex-col h-full), mortgage summary panel, inline eligibility check, memoized callbacks |
| `src/components/ui/mortgage-refinance.tsx` | Use centralized `calculateMortgageEligibility` (portfolio-aware) |
| `src/lib/tenantRent.ts` *(new, tiny)* | Shared `calcTenantRent(baseRent, tenant, condition)` helper |

