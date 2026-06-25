import { create } from "zustand";

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector for the target element. If omitted, tooltip centers on screen. */
  selector?: string;
  /** Tab to switch to before showing this step. */
  tab?: string;
  /** When true, advance only when awaitEvent fires (not on Next click). */
  waitForAction?: boolean;
  /** Custom-event name that auto-advances a waitForAction step. */
  awaitEvent?: string;
  /** Optional CTA button label shown alongside the step. */
  actionLabel?: string;
  /** Custom-event dispatched when the CTA is clicked. */
  actionEvent?: string;
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
