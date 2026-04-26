## Problem

The renovation dialog shows e.g. "Loft Conversion 45d", but in practice it takes vastly longer than 45 in-game days. Two compounding bugs:

1. **Wall-clock, not game-clock.** `completionDate = Date.now() + duration * 60 * 1000` treats `duration` (a "days" number) as **wall-clock minutes**. At 1× game speed (180s = 1 month), 45 "days" = 45 wall-clock minutes ≈ **15 in-game months**.
2. **`gameSpeed` ignored.** Even at 2× / 4× speed, the renovation completion target stays anchored to wall-clock time, so the rest of the game advances faster while renovations don't.
3. **Dialog times are also too short for realism.** Per the user, even the headline numbers (e.g. 45d for a loft conversion) should be roughly doubled to better reflect real UK renovation timelines.

## Fix

### 1. Double the dialog durations (realism pass) — `src/components/ui/renovation-dialog.tsx`

Update the `duration` field in `RENOVATION_OPTIONS` to ~2× current values (rounded to clean numbers):

| Renovation | Old | New |
|---|---|---|
| Basic Repairs | 7 | 14 |
| Full Redecoration | 14 | 28 |
| Kitchen Upgrade | 21 | 42 |
| Bathroom Renovation | 18 | 35 |
| Central Heating | 10 | 21 |
| Double Glazing | 12 | 21 |
| Loft Conversion | 45 | 90 |
| Single-Story Extension | 60 | 120 |
| Conservatory | 30 | 60 |
| Convert to HMO (4-bed) | 60 | 120 |
| Convert to HMO (6-bed) | 90 | 180 |
| Convert to Flats (2 units) | 120 | 240 |
| Commercial → Residential | 90 | 180 |

These are now realistic UK timelines (e.g. a loft conversion ≈ 3 months, an extension ≈ 4 months, a flat conversion ≈ 8 months).

### 2. Make actual completion match the dialog — `src/stores/gameStore.ts` (`startRenovation`)

Switch from wall-clock to **in-game months** so the displayed duration is what the player actually waits, and so `gameSpeed` correctly speeds renovations up.

- Add a new field `completionMonth: number` to the `Renovation` type (`src/types/game.ts`), mirroring the conveyancing pattern.
- In `startRenovation`, compute:
  ```ts
  const monthsToComplete = Math.max(1, Math.round(renovationType.duration / 30));
  const completionMonth = prev.monthsPlayed + monthsToComplete;
  ```
- Keep `completionDate` for backward-compat with old saves but stop using it as the source of truth — derive a fallback only when `completionMonth` is missing.

### 3. Use `completionMonth` for completion + progress

- `processMonthEnd` (around line 1243): replace `currentTime >= r.completionDate` with `monthsPlayed >= r.completionMonth`. Active list uses the inverse.
- `src/components/ui/renovation-tracker.tsx`: compute progress and remaining time from in-game months:
  ```ts
  const startMonth = r.startMonth ?? (r.completionMonth - monthsToComplete);
  const total = Math.max(1, r.completionMonth - startMonth);
  const elapsed = Math.max(0, Math.min(total, monthsPlayed - startMonth));
  const monthsRemaining = Math.max(0, r.completionMonth - monthsPlayed);
  const progress = (elapsed / total) * 100;
  ```
  Add `startMonth` to the `Renovation` type and set it in `startRenovation`. Pass `monthsPlayed` from `useGameState` into the tracker.

### 4. Save migration

In `migrateState` / `sanitizeRenovation` (around line 182):
- For legacy renovations with no `completionMonth`/`startMonth`, derive them from the wall-clock fields by mapping `(completionDate - now)` to in-game months at the current `gameSpeed`, with a sensible floor of 1 month.

### 5. Dialog progress badge

The "In Progress" placeholder in `renovation-dialog.tsx` currently hard-codes `50%`. Pipe `monthsPlayed` and the renovation record through so the dialog mirrors the tracker's real progress.

## Files Modified

- `src/types/game.ts` — add `completionMonth`, `startMonth` to `Renovation`.
- `src/stores/gameStore.ts` — `startRenovation`, `processMonthEnd` completion check, `sanitizeRenovation` migration.
- `src/components/ui/renovation-dialog.tsx` — doubled `duration` values; real progress display.
- `src/components/ui/renovation-tracker.tsx` — game-month based progress.
- `src/hooks/useGameState.ts` — expose `monthsPlayed` to tracker if not already.

## Memory

- Update `mem://game-mechanics/property-management/renovation-and-depreciation` to note durations are in-game days (≈30/month), tied to `monthsPlayed` and respect `gameSpeed`.
