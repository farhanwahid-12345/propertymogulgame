/**
 * Phase 3 (v5) — PWA service-worker registration guard.
 *
 * Only registers the SW on production hostnames that are NOT the Lovable
 * preview iframe (which uses ephemeral subdomains and breaks under SW caching).
 * Also skipped in dev to avoid stale-bundle whiplash with HMR.
 */
export function registerPwa() {
  if (typeof window === "undefined") return;
  if (import.meta.env.DEV) return;
  const host = window.location.hostname;
  // Skip Lovable preview hosts; allow custom domains + propertymogulgame.lovable.app.
  if (host.includes("id-preview--") || host.endsWith(".sandbox.lovable.dev")) return;

  // Dynamic import so the virtual module isn't pulled into the dev graph.
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      /* registration is best-effort */
    });
}

/** Track session count for the install-prompt banner heuristic. */
export function bumpSessionCount(): number {
  try {
    const key = "pm_session_count";
    const cur = parseInt(localStorage.getItem(key) || "0", 10) || 0;
    const next = cur + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return 1;
  }
}
