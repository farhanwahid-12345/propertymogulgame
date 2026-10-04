/** Runs the pure 12-month cash-flow projection off the main thread. */
import { projectCashflow } from "@/lib/engine/forecast";

self.addEventListener("message", (e: MessageEvent) => {
  const { id, args } = e.data as { id: number; args: Parameters<typeof projectCashflow>[0] };
  try {
    (self as unknown as Worker).postMessage({ id, result: projectCashflow(args) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
});

export {};
