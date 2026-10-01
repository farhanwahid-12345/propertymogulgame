import { decodeSave } from './saveCodec';
/**
 * Phase 4 (v5) — Multiple save slots.
 *
 * Three independent save slots (0, 1, 2). Each maps to its own localStorage key
 * `propertyTycoonSave_{N}`. The currently-active slot is recorded under
 * `pm_active_slot`, and per-slot display metadata (custom name) under
 * `pm_slot_meta_{N}`.
 *
 * The Zustand persist storage is reused unchanged — it asks for the logical
 * name `propertyTycoonSave` and the storage adapter rewrites that to include
 * the active slot suffix. Switching slots calls `useGameStore.persist.rehydrate()`
 * so the new slot loads cleanly without a page reload.
 *
 * Migration: on first read of slot 0, if `propertyTycoonSave_0` is missing but
 * the legacy single-key save `propertyTycoonSave` exists, it is copied over so
 * existing players land in slot 0 with their save intact.
 */

export const SLOT_COUNT = 3;
export type SlotIndex = 0 | 1 | 2;
export const LEGACY_SAVE_KEY = 'propertyTycoonSave';
export const ACTIVE_SLOT_KEY = 'pm_active_slot';

export function slotKey(slot: SlotIndex): string {
  return `${LEGACY_SAVE_KEY}_${slot}`;
}
export function slotMetaKey(slot: SlotIndex): string {
  return `pm_slot_meta_${slot}`;
}

export function getActiveSlot(): SlotIndex {
  if (typeof localStorage === 'undefined') return 0;
  const raw = localStorage.getItem(ACTIVE_SLOT_KEY);
  const n = Number(raw);
  if (n === 0 || n === 1 || n === 2) return n as SlotIndex;
  return 0;
}

export function setActiveSlot(slot: SlotIndex) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ACTIVE_SLOT_KEY, String(slot));
}

/** One-time migration: copy legacy single-key save into slot 0 if slot 0 is empty. */
export function migrateLegacySaveIntoSlot0() {
  if (typeof localStorage === 'undefined') return;
  const slot0 = slotKey(0);
  if (localStorage.getItem(slot0)) return;
  const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
  if (legacy) {
    try { localStorage.setItem(slot0, legacy); } catch { /* noop */ }
  }
}

export interface SlotMeta {
  name?: string;
}

export function readSlotMeta(slot: SlotIndex): SlotMeta {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(slotMetaKey(slot));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeSlotMeta(slot: SlotIndex, meta: SlotMeta) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(slotMetaKey(slot), JSON.stringify(meta)); } catch { /* noop */ }
}

export interface SlotSummary {
  slot: SlotIndex;
  name: string;
  empty: boolean;
  netWorth?: number;
  cash?: number;
  propertyCount?: number;
  monthsPlayed?: number;
  lastSavedAt?: number;
  cities?: string[];
}

/** Cheap peek into a slot's persisted state for the slot picker UI. */
export function readSlotSummary(slot: SlotIndex): SlotSummary {
  const meta = readSlotMeta(slot);
  const fallbackName = meta.name || `Save ${slot + 1}`;
  if (typeof localStorage === 'undefined') {
    return { slot, name: fallbackName, empty: true };
  }
  const raw = decodeSave(localStorage.getItem(slotKey(slot)));
  if (!raw) return { slot, name: fallbackName, empty: true };
  try {
    const parsed = JSON.parse(raw);
    const s = parsed?.state ?? parsed; // Zustand wraps as { state, version }
    const owned = Array.isArray(s?.ownedProperties) ? s.ownedProperties : [];
    return {
      slot,
      name: fallbackName,
      empty: false,
      cash: typeof s?.cash === 'number' ? s.cash : 0,
      propertyCount: owned.length,
      lastSavedAt: typeof s?.lastSavedAt === 'number' ? s.lastSavedAt : undefined,
      cities: Array.from(new Set(owned.map((p: any) => p?.city || "middlesbrough").filter(Boolean))) as string[],
      monthsPlayed: typeof s?.monthsPlayed === 'number' ? s.monthsPlayed : 0,
      netWorth: typeof s?.cash === 'number'
        ? s.cash + owned.reduce((acc: number, p: any) => acc + (p?.marketValue || p?.value || 0), 0)
            - (Array.isArray(s?.mortgages) ? s.mortgages.reduce((a: number, m: any) => a + (m?.remainingBalance || 0), 0) : 0)
        : undefined,
    };
  } catch {
    return { slot, name: fallbackName, empty: true };
  }
}

export function deleteSlot(slot: SlotIndex) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(slotKey(slot));
    localStorage.removeItem(slotMetaKey(slot));
  } catch { /* noop */ }
}

/** Copy one slot's save (and name) into another slot. */
export function duplicateSlot(from: SlotIndex, to: SlotIndex) {
  if (typeof localStorage === 'undefined') return;
  const raw = localStorage.getItem(slotKey(from));
  if (!raw) return;
  try {
    localStorage.setItem(slotKey(to), raw);
    const meta = readSlotMeta(from);
    writeSlotMeta(to, { name: `${meta.name || `Save ${from + 1}`} (copy)` });
  } catch { /* noop */ }
}
