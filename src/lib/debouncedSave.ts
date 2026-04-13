import type { StateStorage } from 'zustand/middleware';

/**
 * A Zustand-compatible storage adapter that debounces writes
 * to prevent blocking the main thread on every state update.
 */
export function createDebouncedStorage(delayMs: number = 2000): StateStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: string | null = null;

  return {
    getItem(name: string): string | null {
      return localStorage.getItem(name);
    },
    setItem(name: string, value: string): void {
      pendingValue = value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (pendingValue !== null) {
          localStorage.setItem(name, pendingValue);
          pendingValue = null;
        }
      }, delayMs);
    },
    removeItem(name: string): void {
      if (timer) clearTimeout(timer);
      pendingValue = null;
      localStorage.removeItem(name);
    },
  };
}
