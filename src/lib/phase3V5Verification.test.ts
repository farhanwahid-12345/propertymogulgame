import { describe, it, expect } from 'vitest';
import { CURRENT_VERSION, runMigrations } from '@/lib/migrations';

describe('Phase 3 — landlord reputation, goal target, EPC tutorial', () => {
  it('CURRENT_VERSION advanced to 16', () => {
    expect(CURRENT_VERSION).toBe(18);
  });

  it('v15→v16 migration backfills goalTarget and seenEpcTutorial', async () => {
    const { migrationSteps } = await import('@/stores/gameStore') as any;
    const persisted: any = { _version: 15 };
    runMigrations(persisted, migrationSteps, CURRENT_VERSION);
    expect(persisted.goalTarget).toBe(500_000 * 100);
    expect(persisted.seenEpcTutorial).toBe(false);
    expect(persisted._version).toBe(18);
  });

  it('v15→v16 migration preserves existing goalTarget', async () => {
    const { migrationSteps } = await import('@/stores/gameStore') as any;
    const persisted: any = { _version: 15, goalTarget: 1_000_000_00, seenEpcTutorial: true };
    runMigrations(persisted, migrationSteps, CURRENT_VERSION);
    expect(persisted.goalTarget).toBe(1_000_000_00);
    expect(persisted.seenEpcTutorial).toBe(true);
  });

  it('investor loan rate scales inversely with reputation (50→neutral, 100→cheaper, 0→pricier)', () => {
    const compute = (rep: number) =>
      Math.max(-0.05, Math.min(0.06, (60 - rep) * 0.002));
    // Rep 30 → +0.06% costlier; Rep 100 → -0.05% cheaper (clamped).
    expect(compute(50)).toBeCloseTo(0.02, 5);
    expect(compute(60)).toBeCloseTo(0, 5);
    expect(compute(100)).toBeCloseTo(-0.05, 5); // clamped
    expect(compute(10)).toBeCloseTo(0.06, 5);   // clamped
  });
});
