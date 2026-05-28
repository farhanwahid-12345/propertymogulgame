/**
 * Save migration registry (Phase 6 / item #23).
 *
 * The active migration ladder lives inline in `gameStore.ts::migrateState()` —
 * extracted here as a typed, ordered registry for future moves. The runner
 * accepts a persisted blob of unknown shape, walks any version below the
 * current target through each registered step, and stamps the final version.
 *
 * Adding a new migration:
 *   1. Bump `CURRENT_VERSION`.
 *   2. Append a step with `from: CURRENT_VERSION - 1, to: CURRENT_VERSION` and the mutator.
 *   3. Add a fixture-based test in `migrations.test.ts` that loads a save at
 *      `from` and asserts the post-migration shape.
 */

export const CURRENT_VERSION = 14;

export type Migration = {
  from: number;
  to: number;
  describe: string;
  /** Mutates `persisted` in place. Returning a value is ignored. */
  apply: (persisted: any) => void;
};

/** Run every registered step where `step.from >= persisted._version`. */
export function runMigrations(
  persisted: any,
  steps: ReadonlyArray<Migration>,
  targetVersion: number = CURRENT_VERSION,
): any {
  if (!persisted || typeof persisted !== 'object') return persisted;
  if (typeof persisted._version !== 'number') persisted._version = 0;

  for (const step of steps) {
    if (persisted._version < step.to && persisted._version <= step.from + 1) {
      // Tolerate gaps: only run if this step is the next contiguous one or fills a gap.
      step.apply(persisted);
      persisted._version = Math.max(persisted._version, step.to);
    }
  }

  if (persisted._version < targetVersion) {
    persisted._version = targetVersion;
  }
  return persisted;
}
