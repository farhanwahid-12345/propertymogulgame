

# Plan: Fix blank-screen crash on game load

## Root cause

After bumping `SAVE_VERSION` to 4 and adding `tenantConcerns` to state, **existing saves crash on read** because:

1. The `migrate()` function only runs when `version < 4`. Saves already at version 4 (created during the previous in-progress build *before* `tenantConcerns: []` was added to `createInitialState`) skip migration entirely → `state.tenantConcerns` is `undefined`.
2. Multiple call sites then do `prev.tenantConcerns.filter(...)` / `.find(...)` / `[...prev.tenantConcerns, ...]` which throws `TypeError: Cannot read properties of undefined (reading 'filter')`. React unmounts the whole tree → blank dark-blue page (the `bg-gradient-city` background is all that remains).

The session replay shows the page DOES render for users whose saves were just created fresh; the screenshot user has a stale localStorage payload that bypasses migration.

## Fix (one file: `src/stores/gameStore.ts`)

### 1. Always backfill `tenantConcerns` regardless of version
Move the backfill out of the `if (persisted._version < 4)` branch. Either:
- Add `persisted.tenantConcerns = persisted.tenantConcerns || []` unconditionally near the bottom of `migrateState`, **and** force migration on any version mismatch by changing the `migrate` callback to always run `migrateState` (so version-4 saves missing the field are repaired).

### 2. Make all `tenantConcerns` reads defensive
In `processMonthEnd` (around lines 546, 588, 609), `resolveTenantConcern` (line 1748), and any other access:
```ts
const concerns = prev.tenantConcerns || [];
```
Guards against any future schema drift and stops a single missing field from blanking the app.

### 3. Bump `SAVE_VERSION` to 5
Force every existing client through `migrateState` once. The migration is idempotent — safe to re-run.

### 4. Wrap store-action toast import in try/catch (defensive)
The `showToast` helper does a dynamic import — if it throws during early render it can also blank the page. Wrap in `.catch(() => {})`.

## Files modified

| File | Change |
|---|---|
| `src/stores/gameStore.ts` | Bump version to 5; unconditional `tenantConcerns` backfill in `migrateState`; defensive `?? []` reads in `processMonthEnd` and `resolveTenantConcern`; safer `showToast` |

No UI / no other files touched. After this, existing players see their saved game restored; new players continue working unchanged.

