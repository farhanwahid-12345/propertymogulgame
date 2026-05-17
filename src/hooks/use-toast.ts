import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"
import { pushNotification, type NotificationSeverity } from "@/lib/notifications"
import {
  playWarning,
  playCoinChime,
  playLevelUp,
  playConcernChime,
  playPaper,
  playGavel,
  isSoundEnabled,
} from "@/lib/sound"

function severityFromVariant(variant?: string): NotificationSeverity {
  if (variant === "destructive") return "destructive";
  if (variant === "success") return "success";
  return "info";
}

// Tiny heuristic — pick a chime by toast variant / title keywords.
// Skips firing when the caller already played its own sound this tick.
let lastChimeTs = 0;
function chimeForToast(variant: string | undefined, title: string | undefined) {
  if (!isSoundEnabled()) return;
  const now = Date.now();
  if (now - lastChimeTs < 250) return; // collapse rapid bursts
  lastChimeTs = now;
  const t = (title || "").toLowerCase();
  // Specific intents first
  if (/walk|leaving|low satisfaction|critical/.test(t)) { playWarning(); return; }
  if (/concern|repair|leak|mould|boiler|appliance|safety/.test(t)) { playConcernChime(); return; }
  if (/eviction|notice|planning|tax|fixed-rate/.test(t)) { playPaper(); return; }
  if (/sold|auction|completion|complete/.test(t)) { playGavel(); return; }
  if (/level|approved|paid off|milestone/.test(t)) { playLevelUp(); return; }
  if (/rent collected|income|deposit refunded|cashback/.test(t)) { playCoinChime(); return; }
  // Variant fallback
  if (variant === "destructive") { playWarning(); return; }
  if (variant === "success") { playCoinChime(); return; }
}

// One-shot AudioContext arming on first user gesture (browsers suspend
// audio until a real input event). Without this no chimes ever fire
// before the player has clicked something.
if (typeof window !== "undefined" && !(window as any).__pmAudioArmed) {
  (window as any).__pmAudioArmed = true;
  const arm = () => {
    try {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        // Immediately discard — getCtx() in sound.ts caches its own instance.
        try { ctx.close(); } catch { /* noop */ }
      }
    } catch { /* noop */ }
    window.removeEventListener("pointerdown", arm, true);
    window.removeEventListener("keydown", arm, true);
  };
  window.addEventListener("pointerdown", arm, true);
  window.addEventListener("keydown", arm, true);
}

function plainText(node: React.ReactNode): string | undefined {
  if (node == null || typeof node === "boolean") return undefined;
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).filter(Boolean).join(" ");
  // ReactElement — best-effort
  const props = (node as any)?.props;
  if (props && "children" in props) return plainText(props.children);
  return undefined;
}

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 4000

if (typeof window !== "undefined" && !(window as any).__pmToastDismissBound) {
  (window as any).__pmToastDismissBound = true;
  const handler = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    // Dismiss on any interaction inside dialogs / sheets / popovers / menus / drawers
    if (t.closest('[role="dialog"], [role="menu"], [role="alertdialog"], [data-radix-popper-content-wrapper], [data-state="open"][data-side]')) {
      dispatch({ type: "DISMISS_TOAST" });
    }
  };
  window.addEventListener("pointerdown", handler, true);
}

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  // Mirror to persistent notification log so the bell icon stays in sync.
  const title = plainText(props.title) || "Notification";
  const description = plainText(props.description);
  pushNotification({
    title,
    description,
    severity: severityFromVariant((props as any).variant),
  });
  // Auto chime based on variant + title hint.
  chimeForToast((props as any).variant, title);

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
