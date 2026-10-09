/**
 * Phase 3 (v5) — PWA service-worker registration guard + auto-update handler.
 *
 * Only registers the SW on production hostnames that are NOT the Lovable
 * preview iframe (which uses ephemeral subdomains and breaks under SW caching).
 * Also skipped in dev to avoid stale-bundle whiplash with HMR.
 *
 * Auto-update behaviour:
 * - Checks for a new SW immediately and then every 60s while the tab is open.
 * - When a new SW takes control (controllerchange), the page reloads once so
 *   players always run the latest published build — no manual hard refresh.
 * - On preview/dev hosts, any stale SW registration is unregistered so the
 *   preview always serves live code.
 */

const isPreviewHost = (host: string) =>
  host.includes("id-preview--") ||
  host.includes("preview--") ||
  host.endsWith(".sandbox.lovable.dev") ||
  host === "lovableproject.com" ||
  host.endsWith(".lovableproject.com") ||
  host.endsWith(".lovableproject-dev.com") ||
  host.endsWith(".beta.lovable.dev");

const inIframe = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

/** Remove any stale app service-worker registrations (preview/dev cleanup). */
async function unregisterStaleServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(regs.map((r) => r.unregister()));
  } catch {
    /* best-effort */
  }
}

export function registerPwa() {
  if (typeof window === "undefined") return;

  const host = window.location.hostname;
  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";

  // Never run a service worker in dev, in the Lovable preview iframe, on
  // preview hosts, or when explicitly disabled via ?sw=off. Clean up any
  // stale registration so these contexts always serve live code.
  if (import.meta.env.DEV || isPreviewHost(host) || inIframe() || killSwitch) {
    void unregisterStaleServiceWorkers();
    return;
  }

  // Reload once when a new service worker takes control, so the open tab
  // picks up the freshly published build automatically.
  if ("serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  // Dynamic import so the virtual module isn't pulled into the dev graph.
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onRegisteredSW(_swUrl, registration) {
          if (!registration) return;
          // Poll for updates while the tab is open (every 60s).
          setInterval(() => {
            registration.update().catch(() => {
              /* offline or transient — ignore */
            });
          }, 60_000);
        },
        onNeedRefresh() {
          // With skipWaiting + clientsClaim the new SW activates on its own;
          // the controllerchange listener above performs the reload.
        },
      });
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
