import { create } from "zustand";

/**
 * Phase 2 tutorial step contract — strictly scripted scenario.
 *
 *  • `advance: 'button'` → user clicks Next.
 *  • `advance: 'event'`  → auto-advances when `advanceEvent` fires on window.
 *  • `beforeStep`        → side effect (switch tab, open dialog) when step activates.
 *  • `isFinal`           → render full-overlay centered congratulations card (no spotlight).
 */
export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  targetSelector: string;            // empty string allowed on the final step
  tooltipSide: "top" | "bottom" | "left" | "right";
  advance: "button" | "event";
  advanceEvent?: string;
  beforeStep?: () => void;
  isFinal?: boolean;
}

export type StepStatus = "idle" | "waiting" | "done";

interface TutorialState {
  active: boolean;
  steps: TutorialStep[];
  stepIndex: number;
  stepStatus: StepStatus;
  targetRect: DOMRect | null;
  start: (steps: TutorialStep[]) => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  setRect: (rect: DOMRect | null) => void;
  setStatus: (status: StepStatus) => void;
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  active: false,
  steps: [],
  stepIndex: 0,
  stepStatus: "idle",
  targetRect: null,
  start: (steps) =>
    set({ active: true, steps, stepIndex: 0, stepStatus: "idle", targetRect: null }),
  stop: () =>
    set({ active: false, steps: [], stepIndex: 0, stepStatus: "idle", targetRect: null }),
  next: () => {
    const { stepIndex, steps } = get();
    if (stepIndex >= steps.length - 1) {
      set({ active: false, steps: [], stepIndex: 0, stepStatus: "idle", targetRect: null });
    } else {
      set({ stepIndex: stepIndex + 1, stepStatus: "idle", targetRect: null });
    }
  },
  prev: () => {
    const { stepIndex } = get();
    if (stepIndex > 0) set({ stepIndex: stepIndex - 1, stepStatus: "idle", targetRect: null });
  },
  goTo: (index) => set({ stepIndex: index, stepStatus: "idle", targetRect: null }),
  setRect: (rect) => set({ targetRect: rect }),
  setStatus: (status) => set({ stepStatus: status }),
}));
