

# Make Tenants More Realistic and Dynamic

## Current Problems
1. **Every tenant in a tier has the same description** -- all premium tenants say "High-income professional with excellent credit history", all standard say "Stable employment with good references", etc.
2. **Stats within a tier barely vary** -- a premium tenant is always credit 720-800, income £6500-9500. There's no overlap or surprise between tiers.
3. **No personality or quirks** -- tenants are just stat blocks. Real tenants have traits that affect how they behave (neat vs messy, quiet vs noisy, long-term vs short-term).
4. **Tenant pool is static per dialog open** -- the same pool persists for the life of the component. No sense of "these tenants are available right now" changing over time.
5. **Redundant stats shown** -- both "Rent Multiplier" and "Potential Rent" are displayed; the multiplier is confusing and game-y.

## Changes

### 1. Add Personality Traits (`tenant-selector.tsx`)
Each tenant gets 1-2 randomly assigned traits that have gameplay effects:
- **Meticulous** -- 50% less damage risk, but demands quick repairs (or leaves)
- **Long-term** -- unlikely to leave early, +5% rent after 12 months
- **Pet Owner** -- +15% damage risk, pays 5% rent premium
- **Smoker** -- +20% damage risk on exit (redecoration needed)
- **Quiet Professional** -- no noise complaints, slightly lower default risk
- **DIY Enthusiast** -- sometimes fixes minor issues themselves (-30% damage risk)
- **Late Payer** -- pays eventually but often 1-2 weeks late (+10% default risk)
- **Young Couple** -- may outgrow property and leave after 18-24 months
- **Retiree** -- very long-term, very low damage, but negotiates 5% lower rent
- **Student** -- high turnover (leaves after 12 months), higher damage, pays on time via guarantor

### 2. Wider Stat Variance with Tier Overlap
Allow stats to overlap between tiers so players actually have to read each tenant:
- Standard tenant could have credit score 580-720 (overlaps with budget high-end and premium low-end)
- A budget tenant with great references might have lower default risk than a careless standard tenant
- Risky tenants get more variance: some are genuinely recovering (low damage, moderate default) vs chaotic (high everything)

### 3. Unique Descriptions Per Tenant
Replace the single static description per tier with a pool of 8-10 descriptions per tier, randomly assigned. Examples:
- Premium: "Recently promoted surgeon, relocating from London" / "Tech founder, prefers quiet neighbourhoods"
- Standard: "Primary school teacher, been renting 5 years" / "Couple both working in the NHS"
- Budget: "Single parent working two part-time jobs" / "Recent graduate starting first proper job"
- Risky: "Self-employed tradesman between contracts" / "Recently divorced, rebuilding credit"

### 4. Refresh Tenant Pool Each Time Dialog Opens
Regenerate the tenant pool every time the dialog opens instead of persisting it in state. This creates a sense of "the market is moving" -- if you close and reopen, different tenants are available.

### 5. Cleaner Card Display
- Remove the "Rent Multiplier" row (redundant with Potential Rent)
- Show traits as small colored badges below the description
- Replace raw "Default Risk: 23%" with friendlier labels: "Reliability: ⭐⭐⭐⭐" (4/5 stars) derived from the risk value
- Replace raw "Damage Risk" with "Property Care: ⭐⭐⭐" rating

---

## Technical Details

### File: `src/components/ui/tenant-selector.tsx`

- Add a `traits` field to the `Tenant` interface: `traits: string[]`
- Create a trait pool with effects mapped to stat modifiers
- Expand description pools per tier (8-10 each)
- Widen stat ranges with overlaps between tiers
- Change `useState(() => generate())` to regenerate on dialog open via `useEffect` on `isOpen`
- Update card UI: trait badges, star ratings instead of raw percentages, remove multiplier row

### File: `src/hooks/useGameState.ts`

- Read tenant traits when processing monthly events (e.g., "Long-term" trait gives rent bonus after 12 months, "Pet Owner" increases damage check probability)
- Store traits on the `PropertyTenant` record so they persist

