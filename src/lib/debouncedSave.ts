/**
 * Debounced storage adapter for Zustand persist middleware.
 * Uses the StorageValue format that Zustand v4 persist expects.
 */
export function createDebouncedStorage(delayMs: number = 2000) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: string | null = null;

  return {
    getItem(name: string) {
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    setItem(name: string, value: any): void {
      const serialized = JSON.stringify(value);
      pendingValue = serialized;
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
