/**
 * Phase 4 (v5) — Achievements dialog.
 *
 * Inline dialog launched from the dashboard. Shows all 14 achievement tiles
 * with locked/unlocked state. Unlock month sourced from the store's
 * `achievements: Record<id, month>` map.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGameStore } from "@/stores/gameStore";
import { ACHIEVEMENTS } from "@/lib/achievements";

export function AchievementsInlineButton() {
  const [open, setOpen] = useState(false);
  const unlocked = useGameStore((s: any) => s.achievements || {}) as Record<string, number>;
  const unlockedCount = Object.keys(unlocked).length;
  const total = ACHIEVEMENTS.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="glass border-0 bg-white/[0.06] h-9 px-3 text-xs">
          🏅 Achievements
          <Badge variant="secondary" className="ml-2 text-[10px]">{unlockedCount}/{total}</Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl glass border-white/10 bg-background/95">
        <DialogHeader>
          <DialogTitle>🏅 Achievements ({unlockedCount}/{total})</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {ACHIEVEMENTS.map((a) => {
            const unlockMonth = unlocked[a.id];
            const isUnlocked = unlockMonth != null;
            return (
              <div
                key={a.id}
                className={`rounded-xl border p-3 flex items-start gap-3 transition-colors ${
                  isUnlocked
                    ? "border-primary/40 bg-primary/10"
                    : "border-white/10 bg-white/[0.03] opacity-60"
                }`}
              >
                <div className={`text-2xl ${isUnlocked ? "" : "grayscale"}`}>{a.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm truncate">{a.title}</h4>
                    {isUnlocked && (
                      <Badge variant="secondary" className="text-[9px] shrink-0">
                        Mo {unlockMonth}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-foreground/70 mt-0.5">{a.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
