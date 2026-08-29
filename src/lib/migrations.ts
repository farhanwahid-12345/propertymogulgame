/**
 * Save migration registry (Phase 6 / item #23).
 *
 * Wired up in Lovable v5 / Phase 1: `gameStore.ts::migrateState()` now drives
 * the per-version ladder through this registry instead of an inline if-chain.
 * The runner accepts a persisted blob, walks any version below `CURRENT_VERSION`
 * through every registered step, and stamps the final version.
 *
 * Adding a new migration:
 *   1. Bump `CURRENT_VERSION`.
 *   2. Append a step with `from: CURRENT_VERSION - 1, to: CURRENT_VERSION`.
 *   3. Make sure the matching block in `gameStore.ts`'s `migrationSteps` array
 *      mutates the persisted blob in place.
 */

export const CURRENT_VERSION = 24;

export type Migration = {
  from: number;
  to: number;
  describe: string;
  /** Mutates `persisted` in place. Return value is ignored. */
  apply: (persisted: any) => void;
};

/** Walk `persisted` through every registered step whose target version is newer. */
export function runMigrations(
  persisted: any,
  steps: ReadonlyArray<Migration>,
  targetVersion: number = CURRENT_VERSION,
): any {
  if (!persisted || typeof persisted !== 'object') return persisted;
  if (typeof persisted._version !== 'number') persisted._version = 0;

  // Apply steps in ascending order of `to`.
  const ordered = [...steps].sort((a, b) => a.to - b.to);
  for (const step of ordered) {
    if (persisted._version < step.to) {
      step.apply(persisted);
      persisted._version = step.to;
    }
  }

  if (persisted._version < targetVersion) {
    persisted._version = targetVersion;
  }
  return persisted;
}
