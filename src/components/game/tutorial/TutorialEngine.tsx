import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTutorialStore } from "@/stores/tutorialStore";

interface Props {
  /** Called when the tutorial finishes (last step, skip, or X). */
  onFinish?: () => void;
}

const PADDING = 6;
const TOOLTIP_MAX_W = 320;
const TOOLTIP_GAP = 14;

export function TutorialEngine({ onFinish }: Props) {
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

  useEffect(() => {
    setMounted(true);
  }, []);

  // Run beforeStep side-effect when a step activates.
  useEffect(() => {
    if (!active || !step) return;
    try {
      step.beforeStep?.();
    } catch {
      /* noop */
    }
  }, [active, step]);

  // Track the target element rect — observe size/scroll/resize.
  useLayoutEffect(() => {
    if (!active || !step) return;
    if (!step.targetSelector || step.isFinal) {
      setRect(null);
      return;
    }

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let lastEl: Element | null = null;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(step.targetSelector);
      if (!el) {
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
          rafRef.current = requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
        });
        observer.observe(el);
      }
      setRect(el.getBoundingClientRect());
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

  // 'event' advance: listen for the named custom event and auto-advance.
  useEffect(() => {
    if (!active || !step) return;
    if (step.advance !== "event" || !step.advanceEvent) return;
    setStatus("waiting");
    const handler = () => {
      setStatus("done");
      next();
    };
    window.addEventListener(step.advanceEvent, handler);
    return () => window.removeEventListener(step.advanceEvent!, handler);
  }, [active, step, next, setStatus]);

  const handleFinish = () => {
    stop();
    onFinish?.();
  };

  /**
   * Tooltip positioning honours `tooltipSide` as a hint, but flips/clamps when
   * the chosen side has insufficient room.
   */
  const tooltipPosition = useMemo(() => {
    if (!targetRect || !step || step.isFinal) {
      return null;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < 640;
    const width = isMobile ? Math.min(vw - 24, TOOLTIP_MAX_W) : TOOLTIP_MAX_W;
    const estHeight = 220;

    const spaceBelow = vh - targetRect.bottom;
    const spaceAbove = targetRect.top;
    const spaceRight = vw - targetRect.right;
    const spaceLeft = targetRect.left;

    let side = step.tooltipSide;
    // Flip if requested side has no room.
    if (side === "bottom" && spaceBelow < estHeight && spaceAbove > spaceBelow) side = "top";
    else if (side === "top" && spaceAbove < estHeight && spaceBelow > spaceAbove) side = "bottom";
    else if (side === "right" && spaceRight < width + 20 && spaceLeft > spaceRight) side = "left";
    else if (side === "left" && spaceLeft < width + 20 && spaceRight > spaceLeft) side = "right";

    let top = 0;
    let left = 0;

    if (side === "bottom") {
      top = targetRect.bottom + TOOLTIP_GAP;
      left = targetRect.left + targetRect.width / 2 - width / 2;
    } else if (side === "top") {
      top = Math.max(12, targetRect.top - TOOLTIP_GAP - estHeight);
      left = targetRect.left + targetRect.width / 2 - width / 2;
    } else if (side === "right") {
      top = targetRect.top + targetRect.height / 2 - estHeight / 2;
      left = targetRect.right + TOOLTIP_GAP;
    } else {
      // left
      top = targetRect.top + targetRect.height / 2 - estHeight / 2;
      left = targetRect.left - TOOLTIP_GAP - width;
    }

    left = Math.max(12, Math.min(left, vw - width - 12));
    top = Math.max(12, Math.min(top, vh - 60));

    // Arrow position
    const arrowBase: React.CSSProperties = {
      position: "absolute",
      width: 12,
      height: 12,
      transform: "rotate(45deg)",
      background: "hsl(var(--background))",
    };
    let arrowStyle: React.CSSProperties = arrowBase;
    if (side === "bottom") {
      const tc = targetRect.left + targetRect.width / 2;
      const ax = Math.max(16, Math.min(width - 16, tc - left));
      arrowStyle = {
        ...arrowBase,
        top: -6,
        left: ax - 6,
        borderTop: "1px solid hsl(var(--border))",
        borderLeft: "1px solid hsl(var(--border))",
      };
    } else if (side === "top") {
      const tc = targetRect.left + targetRect.width / 2;
      const ax = Math.max(16, Math.min(width - 16, tc - left));
      arrowStyle = {
        ...arrowBase,
        bottom: -6,
        left: ax - 6,
        borderBottom: "1px solid hsl(var(--border))",
        borderRight: "1px solid hsl(var(--border))",
      };
    } else if (side === "right") {
      const tc = targetRect.top + targetRect.height / 2;
      const ay = Math.max(16, Math.min(estHeight - 16, tc - top));
      arrowStyle = {
        ...arrowBase,
        left: -6,
        top: ay - 6,
        borderBottom: "1px solid hsl(var(--border))",
        borderLeft: "1px solid hsl(var(--border))",
      };
    } else {
      const tc = targetRect.top + targetRect.height / 2;
      const ay = Math.max(16, Math.min(estHeight - 16, tc - top));
      arrowStyle = {
        ...arrowBase,
        right: -6,
        top: ay - 6,
        borderTop: "1px solid hsl(var(--border))",
        borderRight: "1px solid hsl(var(--border))",
      };
    }

    return { top, left, width, side, arrowStyle };
  }, [targetRect, step]);

  if (!mounted || !active || !step) return null;

  const isLast = stepIndex >= steps.length - 1;
  const isWait = step.advance === "event";

  // ── Final step: full overlay congratulations modal, no spotlight. ──
  if (step.isFinal) {
    return createPortal(
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.72)" }}
      >
        <div
          role="dialog"
          aria-label={step.title}
          className="glass rounded-2xl border border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl p-6 max-w-md w-full text-center animate-in fade-in zoom-in-95 duration-300"
        >
          <div className="text-5xl mb-3">🏘️</div>
          <h2 className="text-xl font-semibold mb-2">{step.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">{step.body}</p>
          <Button size="lg" className="w-full" onClick={handleFinish}>
            Let's go 🏘️
          </Button>
        </div>
      </div>,
      document.body,
    );
  }

  // ── Spotlight + tooltip steps. ──
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
        position: "fixed",
        top: -20,
        left: -20,
        width: 0,
        height: 0,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
        pointerEvents: "none",
        zIndex: 60,
      };

  const tooltipStyle: React.CSSProperties = tooltipPosition
    ? {
        position: "fixed",
        top: tooltipPosition.top,
        left: tooltipPosition.left,
        width: tooltipPosition.width,
        maxWidth: "calc(100vw - 24px)",
        zIndex: 61,
        pointerEvents: "auto",
      }
    : {
        position: "fixed",
        top: typeof window !== "undefined" ? window.innerHeight / 2 - 100 : 200,
        left:
          typeof window !== "undefined"
            ? Math.max(12, window.innerWidth / 2 - TOOLTIP_MAX_W / 2)
            : 12,
        width: TOOLTIP_MAX_W,
        maxWidth: "calc(100vw - 24px)",
        zIndex: 61,
        pointerEvents: "auto",
      };

  return createPortal(
    <>
      <div aria-hidden style={spotlightStyle} />

      {/* Always-visible skip button */}
      <div
        style={{ position: "fixed", top: 12, right: 12, zIndex: 62, pointerEvents: "auto" }}
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

      {/* Tooltip */}
      <div
        key={step.id}
        role="dialog"
        aria-label={step.title}
        style={tooltipStyle}
        className={cn("animate-in fade-in slide-in-from-bottom-1 duration-300")}
      >
        <div className="relative glass rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl p-4">
          {tooltipPosition && <div style={tooltipPosition.arrowStyle} />}

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
              <Button
                size="sm"
                variant={isWait ? "outline" : "default"}
                onClick={() => {
                  if (isLast) handleFinish();
                  else next();
                }}
              >
                {isLast ? (
                  <>
                    Got it <Check className="h-4 w-4 ml-2" />
                  </>
                ) : isWait ? (
                  <>
                    Skip ahead <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                ) : (
                  <>
                    Next <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
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
