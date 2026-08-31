# Lovable_Improvements-8 — completion audit and remaining work

## Already done (verified in code)

1. Eviction serving moved into Operations, with deep-links from property cards.
2. Commercial lettings agent Q&A + negotiable Heads of Terms (per-item/package).
3. Middlesbrough flat rents clamped to realistic bands (~£300–800/unit).
4. Commercial lease costs = 10% of annual rent agent fee + £750 solicitor; 6-month pre-marketing before lease end/break; faster applicant drip with comms in the Operations "Comm. Letting" tab.
5. Daily offer checks, faster offers, low-ball range on overpriced listings, sale milestone sounds, offer/counter pop-ups, dashboard "Listed Properties" removed.
9a. HMO/multi-let room rents cut a further 30% (`HMO_ROOM_RENT_DISCOUNT = 0.35`).
9b. Per-room rent raises pass `slotIndex` — one room no longer raises all rooms.
10. EPC/MEES concerns auto-resolve after an EPC upgrade completes.

## Remaining work

### Phase 1 — Investments aligned to the spec (item 7)

Current products don't match the requested instruments. Rework `src/lib/engine/investments.ts` + panel:

- **Instant-access savings**: BoE base rate **+ 0.5%** (currently BoE − 0.6%).
- **Premium Bonds** (replaces 3-year government bonds): ~5% per annum, stable, **£50,000 holding cap** enforced at deposit.
- **S&P 500**: 5–12% per year, 9.5% median, inversely tied to BoE rate (low rate → higher return).
- **Risky stocks**: monthly thirds model — 33% big gain / 33% big loss / 33% flat.
- **Crypto** (new product): same thirds model with wider swings.
- Update `investments-panel.tsx` blurbs/rates and the ledger notes accordingly.

### Phase 2 — HMO licence lifecycle polish (item 8)

- Licence application is already ungated (can apply as soon as planning is granted — keep).
- Move renewal reminder from 2 months to **3 months** before expiry, plus a second reminder at 1 month.
- Add a "Renew licence" action on expired/expiring properties (re-uses `applyForHmoLicence`, allowed for `expired` and `licensed` within the renewal window).
- Verify no code path removes tenants on licence expiry (none found — confirm with a test) and add a regression test.

### Phase 3 — Property sizing and listing variety (item 12)

- Generation: properties without extensions start at **~35% plot coverage** (`plotSqft ≈ internalSqft / 0.35`); cap maximum possible internal size at **~70% of plot** (extensions stop at the cap).
- Update `deriveSqft` legacy backfill to the same 35% ratio.
- Ensure estate-agent/auction listings sometimes spawn with renovations/extensions/conversions already done (extend the existing premium-reno roll in `market.ts`), priced accordingly.

### Phase 4 — Auction level filtering (item 11)

- Estate agent already filters by level range; **auction house does not**. Apply `getLevelRange(level)` to auction inventory generation/display so sub-level cheap properties stop appearing at higher levels.

### Phase 5 — UI fixes (items 6, 14)

- **Stat popovers vs header**: popovers already portal at `z-[70]` with `collisionPadding.top = 60` over the `z-30` sticky header — verify in the live preview that Net Worth/Cash/LTV/DTI popovers are fully visible; if still clipped, raise to `z-[100]` and drop the header's `backdrop-blur` stacking context.
- **Nav shade**: remove the `glass bg-white/[0.06]` shading from the Market/Bank/Accounts `TabsList` so the row renders flat/clear.

### Phase 6 — Net worth audit (item 13)

- `computeNetWorthPennies` is canonical and includes cash, investments, in-flight purchase capital, renovation WIP, furniture, property values, minus mortgages/loans/overdraft. Audit the two call sites (`useGameState`, annual accounts) to confirm both pass **all** owned properties (including listed-for-sale and in-conveyancing) and that overdraft is always subtracted; fix any gap and add a regression test.

## Technical notes

- All money values stay in integer pennies; new caps (e.g. £50k premium bonds) enforced in `investmentActions.ts`.
- Auction filtering lives in `auction-house.tsx` / its inventory generator.
- Plot-coverage change touches `generateProperty`/`deriveSqft` in `src/lib/engine/market.ts`; extension renovation logic must respect the 70% cap.
- Verify with `bunx tsgo --noEmit`, the existing Vitest suite, and a Playwright smoke pass (investments panel, auction at level 3+, EPC popover visibility).
