/**
 * Debounced storage adapter for Zustand persist middleware.
 * Uses the StorageValue format that Zustand v4 persist expects.
 * Flushes pending writes on page unload to prevent data loss.
 */
export function createDebouncedStorage(delayMs: number = 2000) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingName: string | null = null;
  let pendingValue: string | null = null;

  function flush() {
    if (timer) clearTimeout(timer);
    if (pendingName !== null && pendingValue !== null) {
      try {
        localStorage.setItem(pendingName, pendingValue);
      } catch {
        // localStorage full or unavailable — silently fail
      }
      pendingName = null;
      pendingValue = null;
    }
  }

  // Flush on page unload so saves are never lost
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush);
  }

  return {
    getItem(name: string): string | null {
      // Flush any pending write for this key first so reads are consistent
      if (pendingName === name && pendingValue !== null) {
        flush();
      }
      return localStorage.getItem(name);
    },
    setItem(name: string, value: string): void {
      pendingName = name;
      pendingValue = value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    removeItem(name: string): void {
      if (timer) clearTimeout(timer);
      pendingName = null;
      pendingValue = null;
      localStorage.removeItem(name);
    },
  };
}
