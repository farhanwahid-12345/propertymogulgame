/**
 * Zustand slice selectors (item #16).
 *
 * The root `useGameStore` (in `../gameStore.ts`) remains a single composed store
 * so that the persisted shape is unchanged — no migration required. These slice
 * files group selectors and action-bundles by domain so consumers can subscribe
 * with narrow selectors (via `useGameStore(selector, shallow)`) instead of
 * reaching into the entire state tree.
 *
 * Domains:
 *   portfolio     — properties, listings, renovations, conveyancing
 *   banking       — mortgages, overdraft, credit, loans
 *   market        — estate-agent / auction inventory, macro events, rates
 *   tenant        — tenants, concerns, evictions, deposit disputes
 *   tax           — tax records, lifetime totals, loss carry-forward
 *   time          — clock / month / speed / pause
 *   notifications — toast/feed orchestration helpers
 */

export * from './portfolioSlice';
export * from './bankingSlice';
export * from './marketSlice';
export * from './tenantSlice';
export * from './taxSlice';
export * from './timeSlice';
export * from './notificationsSlice';
