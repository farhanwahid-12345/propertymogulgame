/**
 * Phase 4 (v5) — Save slot picker dialog.
 *
 * Lets the player switch between three independent save slots, rename them,
 * or delete an unwanted save. Switching slots flushes the current persist
 * timer, updates `pm_active_slot`, then rehydrates the Zustand store so the
 * new slot loads in place without a page reload.
 */
import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useGameStore } from "@/stores/gameStore";
import {
  SLOT_COUNT, type SlotIndex,
  readSlotSummary, writeSlotMeta, readSlotMeta, deleteSlot,
  getActiveSlot, setActiveSlot,
} from "@/lib/saveSlots";
import { flushPersistedSave } from "@/lib/debouncedSave";
import { fromPennies } from "@/lib/formatCurrency";

function formatMoney(p?: number) {
  if (typeof p !== 'number') return '—';
  return `£${Math.round(fromPennies(p)).toLocaleString()}`;
}

export function SaveSlotsInlineButton() {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<SlotIndex | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Active slot is read on each open (snapshot) — local refresh nonce forces re-render
  const [refresh, setRefresh] = useState(0);
  const active = getActiveSlot();

  const slots = useMemo(() => {
    const _ = refresh; // re-evaluate on rename/delete
    void _;
    return Array.from({ length: SLOT_COUNT }, (_, i) => readSlotSummary(i as SlotIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, open]);

  function switchSlot(slot: SlotIndex) {
    if (slot === active) { setOpen(false); return; }
    // Persist current state first so we don't lose anything in the active slot.
    flushPersistedSave();
    setActiveSlot(slot);
    // Rehydrate the store from the new slot's key. If empty, persist's merge()
    // falls back to current state — but we want a clean game, so reset first.
    const summary = readSlotSummary(slot);
    if (summary.empty) {
      // Reset to a fresh game and immediately flush so the new slot has a save.
      const reset = (useGameStore.getState() as any).resetGame;
      if (typeof reset === 'function') reset();
      flushPersistedSave();
    } else {
      const rehydrate = (useGameStore as any).persist?.rehydrate;
      if (typeof rehydrate === 'function') rehydrate();
    }
    setOpen(false);
    // Force a soft reload to ensure all subscribed components pick up cleanly.
    setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 50);
  }

  function startRename(slot: SlotIndex) {
    const meta = readSlotMeta(slot);
    setRenameValue(meta.name || `Save ${slot + 1}`);
    setRenaming(slot);
  }
  function commitRename() {
    if (renaming == null) return;
    writeSlotMeta(renaming, { name: renameValue.trim() || `Save ${renaming + 1}` });
    setRenaming(null);
    setRefresh(n => n + 1);
  }

  function confirmDelete(slot: SlotIndex) {
    deleteSlot(slot);
    setRefresh(n => n + 1);
    // If we deleted the active slot, also clear it from the store and rehydrate
    if (slot === active) {
      const reset = (useGameStore.getState() as any).resetGame;
      if (typeof reset === 'function') reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="glass border-0 bg-white/[0.06] h-9 px-3 text-xs">
          💾 Saves
          <Badge variant="secondary" className="ml-2 text-[10px]">Slot {active + 1}</Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl glass border-white/10 bg-background/95">
        <DialogHeader>
          <DialogTitle>💾 Save Slots</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {slots.map((s) => {
            const isActive = s.slot === active;
            return (
              <div
                key={s.slot}
                className={`rounded-xl border p-3 ${
                  isActive ? "border-primary/50 bg-primary/10" : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  {renaming === s.slot ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                        autoFocus
                        className="h-8 text-sm"
                        aria-label="Save slot name"
                      />
                      <Button size="sm" onClick={commitRename}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm truncate">{s.name}</h4>
                          {isActive && <Badge variant="secondary" className="text-[9px]">Active</Badge>}
                          {s.empty && <Badge variant="outline" className="text-[9px]">Empty</Badge>}
                        </div>
                        {!s.empty && (
                          <div className="text-xs text-foreground/70 mt-0.5">
                            Net worth: <strong>{formatMoney(s.netWorth)}</strong>
                            {" · "}
                            {s.propertyCount} prop{s.propertyCount === 1 ? '' : 's'}
                            {" · "}
                            Month {s.monthsPlayed}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isActive && (
                          <Button size="sm" onClick={() => switchSlot(s.slot)}>
                            {s.empty ? "New" : "Load"}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => startRename(s.slot)}>
                          Rename
                        </Button>
                        {!s.empty && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive">
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {s.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This permanently removes the save in slot {s.slot + 1}. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => confirmDelete(s.slot)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-foreground/50 mt-2">
          Switching slots reloads the page so all panels rehydrate cleanly.
        </p>
      </DialogContent>
    </Dialog>
  );
}
