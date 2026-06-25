import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTutorialStore } from "@/stores/tutorialStore";

interface Props {
  /** Optional: tab switcher so step.tab can navigate the page underneath. */
  setActiveTab?: (tab: string) => void;
  /** Called when the tutorial finishes (last step, skip, or X). */
  onFinish?: () => void;
}

const PADDING = 6;
const TOOLTIP_MAX_W = 320;
const TOOLTIP_GAP = 14;

export function TutorialEngine({ setActiveTab, onFinish }: Props) {
  const active = useTutorialStore((s) => s.active);
  const steps = useTutorialStore((s) => s.steps);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  const targetRect = useTutorialStore((s) => s.targetRect);
  const setRect = useTutorialStore((s) => s.setRect);
  const setStatus = useTutorialStore((s) => s.setStatus);
  const stop = useTutorialStore((s) => s.stop);
  const next = useTutorialStore((s) => s.next);
  const prev = useTutorialStore((s) => s.prev);

  const step = steps[stepIndex];
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Mount portal target once.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Switch tab when a step requests it.
  useEffect(() => {
    if (!active || !step) return;
    if (step.tab && setActiveTab) setActiveTab(step.tab);
  }, [active, step, setActiveTab]);

  // Track the target element rect — observe size/scroll/resize.
  useLayoutEffect(() => {
    if (!active || !step) return;
    if (!step.selector) {
      setRect(null);
      return;
    }

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let lastEl: Element | null = null;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(step.selector!);
      if (!el) {
        // Element not yet in DOM — poll via RAF until it appears.
        rafRef.current = requestAnimationFrame(measure);
        return;
      }
      if (el !== lastEl) {
        lastEl = el;
        try {
          el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        } catch {
          /* noop */
        }
        if (observer) observer.disconnect();
        observer = new ResizeObserver(() => {
          rafRef.current = requestAnimationFrame(() => {
            const r = el.getBoundingClientRect();
            setRect(r);
          });
        });
        observer.observe(el);
      }
      const r = el.getBoundingClientRect();
      setRect(r);
    };

    measure();

    const onScrollOrResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (lastEl) setRect(lastEl.getBoundingClientRect());
        else measure();
      });
    };

    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (observer) observer.disconnect();
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [active, step, setRect]);

  // waitForAction: auto-advance on awaitEvent.
  useEffect(() => {
    if (!active || !step || !step.waitForAction || !step.awaitEvent) return;
    setStatus("waiting");
    const handler = () => {
      setStatus("done");
      next();
    };
    window.addEventListener(step.awaitEvent, handler);
    return () => window.removeEventListener(step.awaitEvent!, handler);
  }, [active, step, next, setStatus]);

  const handleFinish = () => {
    stop();
    onFinish?.();
  };

  const tooltipPosition = useMemo(() => {
    if (!targetRect) {
      // Centered fallback.
      return {
        top: typeof window !== "undefined" ? window.innerHeight / 2 - 100 : 200,
        left:
          typeof window !== "undefined"
            ? Math.max(12, window.innerWidth / 2 - TOOLTIP_MAX_W / 2)
            : 12,
        placement: "center" as const,
        arrowStyle: { display: "none" } as React.CSSProperties,
      };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - targetRect.bottom;
    const spaceAbove = targetRect.top;
    const placeBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;

    const top = placeBelow
      ? targetRect.bottom + TOOLTIP_GAP
      : Math.max(12, targetRect.top - TOOLTIP_GAP - 180);

    // Horizontal alignment: try to center on target, clamp to viewport.
    const targetCenter = targetRect.left + targetRect.width / 2;
    const isMobile = vw < 640;
    const width = isMobile ? Math.min(vw - 24, TOOLTIP_MAX_W) : TOOLTIP_MAX_W;
    let left = targetCenter - width / 2;
    left = Math.max(12, Math.min(left, vw - width - 12));

    // Arrow horizontal position relative to tooltip.
    const arrowLeft = Math.max(16, Math.min(width - 16, targetCenter - left));

    const arrowStyle: React.CSSProperties = placeBelow
      ? {
          position: "absolute",
          top: -6,
          left: arrowLeft - 6,
          width: 12,
          height: 12,
          transform: "rotate(45deg)",
          background: "hsl(var(--background))",
          borderTop: "1px solid hsl(var(--border))",
          borderLeft: "1px solid hsl(var(--border))",
        }
      : {
          position: "absolute",
          bottom: -6,
          left: arrowLeft - 6,
          width: 12,
          height: 12,
          transform: "rotate(45deg)",
          background: "hsl(var(--background))",
          borderBottom: "1px solid hsl(var(--border))",
          borderRight: "1px solid hsl(var(--border))",
        };

    return {
      top,
      left,
      width,
      placement: placeBelow ? ("below" as const) : ("above" as const),
      arrowStyle,
    };
  }, [targetRect]);

  if (!mounted || !active || !step) return null;

  const isLast = stepIndex >= steps.length - 1;
  const isWait = !!step.waitForAction;

  const spotlightStyle: React.CSSProperties = targetRect
    ? {
        position: "fixed",
        top: targetRect.top - PADDING,
        left: targetRect.left - PADDING,
        width: targetRect.width + PADDING * 2,
        height: targetRect.height + PADDING * 2,
        borderRadius: 10,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
        transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)",
        pointerEvents: "none",
        zIndex: 60,
      }
    : {
        // No target — render a full dim layer using the same technique by
        // placing the "hole" off-screen at zero size.
        position: "fixed",
        top: -20,
        left: -20,
        width: 0,
        height: 0,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
        pointerEvents: "none",
        zIndex: 60,
      };

  const tooltipStyle: React.CSSProperties = {
    position: "fixed",
    top: tooltipPosition.top,
    left: tooltipPosition.left,
    width: tooltipPosition.width,
    maxWidth: "calc(100vw - 24px)",
    zIndex: 61,
    pointerEvents: "auto",
  };

  const triggerAction = () => {
    if (step.actionEvent) {
      try {
        window.dispatchEvent(new CustomEvent(step.actionEvent));
      } catch {
        /* noop */
      }
    }
  };

  return createPortal(
    <>
      {/* Spotlight cutout */}
      <div aria-hidden style={spotlightStyle} />

      {/* Always-visible skip button */}
      <div
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 62,
          pointerEvents: "auto",
        }}
      >
        {!confirmSkip ? (
          <Button
            variant="ghost"
            size="sm"
            className="bg-background/80 backdrop-blur border border-white/10 hover:bg-background"
            onClick={() => setConfirmSkip(true)}
          >
            <X className="h-4 w-4 mr-1.5" />
            Skip tutorial
          </Button>
        ) : (
          <div className="glass rounded-xl border border-white/10 bg-background/90 backdrop-blur-xl px-3 py-2 flex items-center gap-2 shadow-2xl">
            <span className="text-xs text-muted-foreground">
              Are you sure? You can restart from Settings.
            </span>
            <Button size="sm" variant="ghost" onClick={() => setConfirmSkip(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleFinish}>
              Confirm
            </Button>
          </div>
        )}
      </div>

      {/* Tooltip card */}
      <div
        key={step.id}
        role="dialog"
        aria-label={step.title}
        style={tooltipStyle}
        className={cn(
          "animate-in fade-in slide-in-from-bottom-1 duration-300",
        )}
      >
        <div className="relative glass rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl p-4">
          {tooltipPosition.placement !== "center" && <div style={tooltipPosition.arrowStyle} />}

          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-base">{step.title}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {stepIndex + 1} / {steps.length}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>

          <div className="flex gap-1.5 my-3">
            {steps.map((s, i) => (
              <div
                key={s.id}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= stepIndex ? "bg-primary" : "bg-white/10",
                )}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              {stepIndex > 0 && (
                <Button variant="ghost" size="sm" onClick={prev}>
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {step.actionLabel && step.actionEvent && (
                <Button size="sm" onClick={triggerAction}>
                  {step.actionLabel}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {!isWait && (
                <Button
                  size="sm"
                  onClick={() => {
                    if (isLast) handleFinish();
                    else next();
                  }}
                >
                  {isLast ? (
                    <>
                      Got it <Check className="h-4 w-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Next <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {isWait && (
            <p className="text-[11px] text-muted-foreground/80 mt-2 text-right italic">
              Waiting for you to complete the highlighted action…
            </p>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
