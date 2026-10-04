import { useEffect, useRef, useState } from "react";
import { projectCashflow, type ForecastMonth } from "@/lib/engine/forecast";

type Args = Parameters<typeof projectCashflow>[0];

/**
 * Computes the forecast in a Web Worker; falls back to the main thread when
 * workers are unavailable. Pass null to skip computation.
 */
export function useForecastWorker(args: Args | null): { data: ForecastMonth[]; loading: boolean } {
  const [data, setData] = useState<ForecastMonth[]>([]);
  const [loading, setLoading] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);

  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);

  useEffect(() => {
    if (!args) return;
    const id = ++reqId.current;
    if (!workerRef.current && typeof Worker !== "undefined") {
      try {
        workerRef.current = new Worker(new URL("../workers/forecast.worker.ts", import.meta.url), { type: "module" });
      } catch { workerRef.current = null; }
    }
    const w = workerRef.current;
    if (!w) { setData(projectCashflow(args)); return; }
    setLoading(true);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.id !== id) return;
      w.removeEventListener("message", onMsg);
      setData(e.data.error ? projectCashflow(args) : e.data.result);
      setLoading(false);
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, args });
    return () => w.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args]);

  return { data, loading };
}
