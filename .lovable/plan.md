# Phase 2 — Condensed cards + Ex-Tenant Debt in Operations

## Goal
Strip noisy eviction/listing detail off property cards (replace with compact deep-link badges), and move the full UI into the Operations panel. Add a brand-new Ex-Tenant Debt recovery flow so arrears don't silently vanish when a tenant leaves.

## 1. Types (`src/types/game.ts`)
Add `ExTenantDebt` interface and `exTenantDebts: ExTenantDebt[]` to `GameState`. Fields exactly as spec'd. Bump store version + migration to seed `[]`.

## 2. Store — capture debt when tenant exits
Find every place a tenant record is removed with outstanding `arrearsPennies > 0`:
- `evictTenant` completion (in `tenantActions.ts` / monthEnd processing of `pendingEvictions`)
- Voluntary departure / walkout paths in `monthEndActions.ts`
- Lease expiry (commercial + AST)

For each, build an `ExTenantDebt { status: 'chasing', remainingDebtPennies: arrearsPennies, totalRecoveredPennies: 0, vacatedMonth: monthsPlayed }` and push to `exTenantDebts`. Don't double-create if one already exists for that propertyId+tenantName+vacatedMonth.

## 3. MonthEnd processing
In `monthEndActions.ts`, after rent collection:
- For each `exTenantDebt` with `status === 'monthly_recovery'`: credit `min(monthlyRecoveryPennies, remainingDebtPennies)` to cash, decrement remaining, push activity-feed entry. When `remainingDebtPennies <= 0` → `status = 'settled'`.
- For each `status === 'ccj_filed'`: 60% roll → transition to `monthly_recovery`, set `monthlyRecoveryPennies` scaled to original debt (£50 for <£500, £100 for £500–£2k, £150 for >£2k). 40% → stay filed; player can re-file after 6mo.

## 4. New store actions (`tenantActions.ts`)
- `fileExTenantCCJ(debtId)` — debits £100, sets `status='ccj_filed'`, `ccjFiledMonth=monthsPlayed`.
- `negotiateExTenantSettlement(debtId, pct)` — credits `remainingDebt * pct` (clamped 0.4–0.7), `status='settled'`.
- `writeOffExTenantDebt(debtId)` — `status='written_off'`, +2 credit score (small reputation gain).
- `refileExTenantCCJ(debtId)` — only if previously `ccj_filed` and ≥6mo since `ccjFiledMonth`; re-debits £100, resets clock.

## 5. Property card slimming (`src/components/game/property-card.tsx`)
Replace the multi-line eviction timeline block with one compact badge:
- Active eviction → `🔴 Eviction in progress` (button, dispatches `pm:open-operations` with `{ tab: 'evictions', propertyId }`)
- Active sale listing → `🏷️ On market — N offers` (deep-links to `{ tab: 'listings', propertyId }`)
- Remove inline marketing/estate-agency status block entirely
- Remove arrears badge if no current tenant record exists for that property and an `ExTenantDebt` exists for it (parent passes a boolean flag).

PortfolioGrid: pass `hasExTenantDebt` per property and stop showing arrearsCount/pennies when there's no current tenant.

## 6. Operations panel (`src/components/sections/BankingPanel.tsx`)
Add three collapsible sub-sections matching the existing court-proceedings card style:
- **Evictions** — list every pending eviction with grounds, served month, effective month, countdown, Cancel / Send to court buttons (the detail removed from cards).
- **Property Listings** — listing detail (asking price, days on market, offers list with Accept/Counter/Reject), the bits removed from cards.
- **Ex-Tenant Debts** — one row per record: tenant + property, original owed, recovered so far, status pill, action buttons (File CCJ / Negotiate / Write off / Re-file) gated by status.

Listen for `pm:open-operations` to auto-scroll to + flash the requested sub-section and propertyId row.

## Out of scope
- No new visual design language — reuse glass/sectioning that already exists.
- No changes to rent collection or arrears accrual while a tenant is in place.

## Technical notes
- All money in pennies in state; convert at UI boundary via `fromPennies`.
- Version bump + migration seeds `exTenantDebts: []` to keep old saves loadable.
- Court CCJ filing for *current* tenants (`sendArrearsToCourt`) is unrelated and untouched — this flow is strictly post-tenancy.
- Event channel reuses existing `window.dispatchEvent` pattern from Phase 5 onboarding (`pm:open-operations`).
