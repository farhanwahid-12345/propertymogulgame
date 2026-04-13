/**
 * Debounced storage adapter for Zustand persist middleware.
 * Implements PersistStorage<S> — getItem returns StorageValue (parsed),
 * setItem receives StorageValue (pre-parsed by Zustand).
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
        // localStorage full or unavailable
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
    getItem(name: string) {
      // Flush pending write for this key first so reads are consistent
      if (pendingName === name && pendingValue !== null) {
        flush();
      }
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
      pendingName = name;
      pendingValue = serialized;
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
