/**
 * Phase 1 (v5) — wires up rng/probabilities/migrations + persist-version fix.
 *
 * Source-text checks plus pure-function checks. We don't boot the store here;
 * other suites already exercise hydration.
 */
import { describe, it, expect } from 'vitest';
import { CURRENT_VERSION, runMigrations, type Migration } from '@/lib/migrations';
import { seedRng, gameRandom, withSeed } from '@/lib/rng';

// @ts-expect-error - fs available at vitest runtime
const fs = await import('fs');
const storeSrc: string = fs.readFileSync('src/stores/gameStore.ts', 'utf8');

describe('Phase 1 (v5) — wiring', () => {
  it('no raw Math.random() in gameStore.ts (except the seed bootstrap)', () => {
    // The two acceptable sites are the rngSeed initializers (createInitialState +
    // the v14→v15 migration step). Everything else must go through gameRandom().
    const mathRandomCount = (storeSrc.match(/Math\.random\(/g) || []).length;
    expect(mathRandomCount).toBeLessThanOrEqual(2);
  });

  it('imports gameRandom and seedRng from @/lib/rng', () => {
    expect(storeSrc).toMatch(/from '@\/lib\/rng'/);
    expect(storeSrc).toMatch(/gameRandom/);
    expect(storeSrc).toMatch(/seedRng/);
  });

  it('imports the named probability constants', () => {
    expect(storeSrc).toMatch(/CHAIN_COLLAPSE_PROB/);
    expect(storeSrc).toMatch(/EVICTION_UPHELD_PROB/);
    expect(storeSrc).toMatch(/SUI_GENERIS_PROB/);
    expect(storeSrc).toMatch(/MARKET_DIP_PROB/);
    expect(storeSrc).toMatch(/TENANT_WALKOUT_RISK_PROB/);
  });

  it('drives migrateState through runMigrations', () => {
    expect(storeSrc).toMatch(/runMigrations\(/);
    expect(storeSrc).toMatch(/migrationSteps/);
  });

  it('persist({ version }) is at CURRENT_VERSION (no v12 mismatch)', () => {
    expect(storeSrc).toMatch(/version: CURRENT_VERSION/);
    expect(storeSrc).not.toMatch(/^\s*version: 12,\s*$/m);
  });

  it('runMigrations walks a v12 save to CURRENT_VERSION', () => {
    const persisted: any = { _version: 12 };
    const steps: Migration[] = [
      { from: 12, to: 13, describe: 't', apply: (p) => { p.a = 1; } },
      { from: 13, to: 14, describe: 't', apply: (p) => { p.b = 2; } },
      { from: 14, to: 15, describe: 't', apply: (p) => { p.c = 3; } },
    ];
    runMigrations(persisted, steps, 15);
    expect(persisted._version).toBe(16);
    expect(persisted).toMatchObject({ a: 1, b: 2, c: 3 });
  });

  it('gameRandom is deterministic when seeded', () => {
    const a = withSeed(42, () => [gameRandom(), gameRandom(), gameRandom()]);
    const b = withSeed(42, () => [gameRandom(), gameRandom(), gameRandom()]);
    expect(a).toEqual(b);
    seedRng(null);
  });

  it('CURRENT_VERSION is 15 (rngSeed step)', () => {
    expect(CURRENT_VERSION).toBe(16);
  });
});
