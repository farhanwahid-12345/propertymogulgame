/**
 * Named probability / chance constants (Phase 6 / item #17).
 *
 * The store still uses many inline `Math.random() < 0.XX` checks. New code
 * should pull from this module so designers can tune odds in one place and
 * tests can assert against named values rather than magic numbers.
 *
 * All values are decimal probabilities (0 = never, 1 = always) unless suffixed.
 */

// ─── Tenants ─────────────────────────────────────────────────────────────
/** Monthly chance an at-risk tenant (sat 0-15) walks out unannounced. */
export const TENANT_WALKOUT_RISK_PROB = 0.05;
/** Monthly chance a tenant in arrears reports something is broken (concern roll). */
export const TENANT_DAMAGE_BASE_PROB = 0.04;

// ─── Evictions ────────────────────────────────────────────────────────────
/** Tribunal upholds the landlord's eviction ground. */
export const EVICTION_UPHELD_PROB = 0.60;
/** Tribunal overturns / refuses the eviction. */
export const EVICTION_OVERTURNED_PROB = 1 - EVICTION_UPHELD_PROB;

// ─── Conveyancing ────────────────────────────────────────────────────────
/** Monthly chance the chain collapses during a buy/sell. */
export const CHAIN_COLLAPSE_PROB = 0.04;
/** Commercial-conversion class roll: chance of awkward sui-generis vs Class E. */
export const SUI_GENERIS_PROB = 0.15;

// ─── Macro market drift ──────────────────────────────────────────────────
/** Monthly chance a property hits a price dip (vs slow drift). */
export const MARKET_DIP_PROB = 0.04;
/** Per-tick clamp on price change (±). */
export const PRICE_TICK_CLAMP = 0.06;

// ─── Yields ───────────────────────────────────────────────────────────────
/** Default yield jitter range applied to reconstructed legacy properties. */
export const DEFAULT_YIELD_MIN_PCT = 6;
export const DEFAULT_YIELD_MAX_PCT = 15;
