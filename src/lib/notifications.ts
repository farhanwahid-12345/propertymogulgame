/**
 * In-memory notification log shared across the app.
 *
 * Toast pings (use-toast) push into this log automatically so the
 * notification centre and the toast stack stay in lock-step — every
 * ping fired produces an entry, and every entry corresponds to a real
 * ping that fired (no orphans on either side).
 */
import * as React from "react";

export type NotificationSeverity = "info" | "success" | "warning" | "destructive";

export interface AppNotification {
  id: string;
  title: string;
  description?: string;
  severity: NotificationSeverity;
  ts: number;
  /** monthsPlayed snapshot at fire time, when available. */
  month?: number;
}

const LIMIT = 100;
const STORAGE_KEY = "pm_notifications_v1";
const READ_KEY = "pm_notifications_read_ts";

let memory: AppNotification[] = load();
const listeners = new Set<(items: AppNotification[]) => void>();

function load(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory.slice(0, LIMIT)));
  } catch {
    /* quota — ignore */
  }
}

function emit() {
  for (const l of listeners) l(memory);
}

export function pushNotification(n: Omit<AppNotification, "id" | "ts"> & { ts?: number }): AppNotification {
  const item: AppNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: n.ts ?? Date.now(),
    ...n,
  };
  memory = [item, ...memory].slice(0, LIMIT);
  persist();
  emit();
  return item;
}

export function getNotifications(): AppNotification[] {
  return memory;
}

export function clearNotifications() {
  memory = [];
  persist();
  emit();
}

export function getReadTs(): number {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(READ_KEY) || 0);
}

export function markAllRead() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(READ_KEY, String(Date.now()));
  emit();
}

export function useNotifications(): { items: AppNotification[]; unread: number } {
  const [items, setItems] = React.useState<AppNotification[]>(memory);
  const [readTs, setReadTs] = React.useState<number>(getReadTs());
  React.useEffect(() => {
    const l = (next: AppNotification[]) => {
      setItems(next);
      setReadTs(getReadTs());
    };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const unread = items.filter(i => i.ts > readTs).length;
  return { items, unread };
}
