/**
 * Phase 4 (v5) — Achievements registry + evaluator.
 *
 * Achievements are stored as `Record<AchievementId, number>` (id → unlock month).
 * The evaluator is pure: given current state + monthsPlayed + netWorth, it
 * returns the (possibly extended) unlocked map plus any newly-unlocked ids so
 * the caller can fire toasts.
 *
 * All evaluation is state-derivable — no hooks needed inside individual action
 * slices. The month-end pass calls `evaluateAchievements` once per tick.
 */
import type { GameState } from '@/types/game';

export type AchievementId =
  | 'first_property'
  | 'portfolio_3'
  | 'portfolio_5'
  | 'portfolio_10'
  | 'portfolio_12'
  | 'net_worth_100k'
  | 'net_worth_500k'
  | 'net_worth_1m'
  | 'first_renovation'
  | 'first_eviction'
  | 'first_planning_approval'
  | 'first_hmo_licence'
  | 'first_letting_agent'
  | 'first_rent_guarantee'
  | 'goal_achieved'
  | 'debt_free'
  | 'multi_city'
  | 'perfect_landlord'
  | 'court_win'
  | 'title_splitter';

export interface AchievementDef {
  id: AchievementId;
  title: string;
  description: string;
  icon: string;
  /** Returns true when the criterion is satisfied for the given state snapshot. */
  test: (ctx: { state: Partial<GameState>; netWorth: number }) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_property', title: 'On the Ladder', description: 'Complete your first property purchase.', icon: '🏠',
    test: ({ state }) => (state.ownedProperties?.length || 0) >= 1 },
  { id: 'portfolio_3', title: 'Building Out', description: 'Own 3 properties simultaneously.', icon: '🏘️',
    test: ({ state }) => (state.ownedProperties?.length || 0) >= 3 },
  { id: 'portfolio_5', title: 'Mini-Mogul', description: 'Own 5 properties simultaneously.', icon: '🏢',
    test: ({ state }) => (state.ownedProperties?.length || 0) >= 5 },
  { id: 'portfolio_10', title: 'Tycoon', description: 'Own 10 properties simultaneously.', icon: '🏙️',
    test: ({ state }) => (state.ownedProperties?.length || 0) >= 10 },
  { id: 'portfolio_12', title: 'Portfolio Mogul', description: 'Own 12 properties simultaneously.', icon: '🏰',
    test: ({ state }) => (state.ownedProperties?.length || 0) >= 12 },
  { id: 'net_worth_100k', title: 'Six Figures', description: 'Reach £100,000 net worth.', icon: '💷',
    test: ({ netWorth }) => netWorth >= 100_000 * 100 },
  { id: 'net_worth_500k', title: 'Half a Million', description: 'Reach £500,000 net worth.', icon: '💰',
    test: ({ netWorth }) => netWorth >= 500_000 * 100 },
  { id: 'net_worth_1m', title: 'Millionaire', description: 'Reach £1,000,000 net worth.', icon: '🏆',
    test: ({ netWorth }) => netWorth >= 1_000_000 * 100 },
  { id: 'first_renovation', title: 'Hands-On', description: 'Complete your first renovation.', icon: '🔨',
    test: ({ state }) => (state.ownedProperties || []).some((p: any) => (p?.completedRenovationIds?.length || 0) > 0) },
  { id: 'first_eviction', title: 'Section 8', description: 'Complete your first eviction.', icon: '⚖️',
    test: ({ state }) => (state.tenantHistory || []).some((h: any) => h?.reason === 'eviction_completed') },
  { id: 'first_planning_approval', title: 'Permission Granted', description: 'Get a planning application approved.', icon: '📄',
    test: ({ state }) => (state.planningApplications || []).some((a: any) => a?.status === 'approved') },
  { id: 'first_hmo_licence', title: 'Fully Licensed', description: 'Receive your first HMO licence.', icon: '🪪',
    test: ({ state }) => (state.ownedProperties || []).some((p: any) => p?.hmoLicenceStatus === 'licensed') },
  { id: 'first_letting_agent', title: 'Hands Off', description: 'Hire your first letting agent.', icon: '🧑‍💼',
    test: ({ state }) => (state.ownedProperties || []).some((p: any) => p?.isManaged) },
  { id: 'first_rent_guarantee', title: 'Insured', description: 'Take out rent guarantee insurance.', icon: '🛡️',
    test: ({ state }) => (state.ownedProperties || []).some((p: any) => p?.hasRentGuarantee) },
  { id: 'goal_achieved', title: 'Goal Reached', description: 'Hit your configured net-worth goal.', icon: '🎯',
    test: ({ state }) => typeof (state as any).goalAchievedAt === 'number' && (state as any).goalAchievedAt > 0 },
  { id: 'debt_free', title: 'Debt Free', description: 'Pay off a mortgage in full.', icon: '✂️',
    test: ({ state }) => ((state as any).reputationLog || []).some((e: any) => typeof e?.reason === 'string' && e.reason.startsWith('Paid off mortgage')) },
  { id: 'multi_city', title: 'Multi-City', description: 'Own properties in 3 different cities simultaneously.', icon: '🗺️',
    test: ({ state }) => new Set((state.ownedProperties || []).map((p: any) => p?.city || 'middlesbrough')).size >= 3 },
  { id: 'perfect_landlord', title: 'Perfect Landlord', description: 'Reach 90 or above in landlord reputation.', icon: '⭐',
    test: ({ state }) => ((state as any).landlordReputation || 0) >= 90 },
  { id: 'court_win', title: 'Court Win', description: 'Win an eviction tribunal.', icon: '⚖️',
    test: ({ state }) => ((state as any).reputationLog || []).some((e: any) => e?.reason === 'Tribunal sided with landlord' || e?.reason === 'Eviction tribunal upheld') },
  { id: 'title_splitter', title: 'Title Splitter', description: 'Complete your first flat title split.', icon: '📐',
    test: ({ state }) => (state.ownedProperties || []).some((p: any) => !!p?.titleSplitOf) },
];

export interface EvaluateResult {
  unlocked: Record<string, number>;
  newlyUnlockedIds: AchievementId[];
}

export function evaluateAchievements(
  prevUnlocked: Record<string, number> | undefined,
  state: Partial<GameState>,
  monthsPlayed: number,
  netWorth: number,
): EvaluateResult {
  const unlocked: Record<string, number> = { ...(prevUnlocked || {}) };
  const newly: AchievementId[] = [];
  for (const def of ACHIEVEMENTS) {
    if (unlocked[def.id] != null) continue;
    try {
      if (def.test({ state, netWorth })) {
        unlocked[def.id] = monthsPlayed;
        newly.push(def.id);
      }
    } catch {
      // ignore — defensive against malformed state during migrations
    }
  }
  return { unlocked, newlyUnlockedIds: newly };
}

/**
 * Convenience helper for action slices: evaluates achievements against a
 * partial state snapshot and surfaces toasts for newly-unlocked ids. Returns
 * the updated `achievements` map so the caller can merge it into `set()`.
 * Net-worth-dependent achievements are still resolved at month end.
 */
export function checkAndUnlockAchievements(
  state: Partial<GameState> & { achievements?: Record<string, number>; monthsPlayed?: number },
  netWorth = 0,
): EvaluateResult {
  return evaluateAchievements(
    state.achievements,
    state,
    state.monthsPlayed ?? 0,
    netWorth,
  );
}
