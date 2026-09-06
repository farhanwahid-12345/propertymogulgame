/**
 * Quick win #1 — auto-management toggles.
 *
 * Small settings dialog reachable from the header. Each switch flips an opt-in
 * flag in `settings`, honoured by the auto-management pass that runs right
 * after month end (and, for offers, where offers are generated).
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { DEFAULT_GAME_SETTINGS, type GameSettings } from "@/types/game";

const TOGGLES: Array<{ key: keyof GameSettings; label: string; help: string }> = [
  {
    key: "autoAcceptOffersWithin5Percent",
    label: "Auto-accept close offers",
    help: "Sale offers within 5% of your asking price are accepted automatically.",
  },
  {
    key: "autoRenewCommercialIfRentIncreaseGte3",
    label: "Auto-renew commercial leases",
    help: "Sitting commercial tenants are re-signed on a fresh 5-year term at a 3% rent uplift.",
  },
  {
    key: "autoPayDamagesUnder500",
    label: "Auto-pay small repairs",
    help: "Repair bills under £500 are paid from cash as soon as they land.",
  },
];

export function SettingsInlineButton() {
  const [open, setOpen] = useState(false);
  const settings = useGameStore((s: any) => s.settings) as GameSettings | undefined;
  const updateSettings = useGameStore((s: any) => s.updateSettings) as (p: Partial<GameSettings>) => void;
  const current = { ...DEFAULT_GAME_SETTINGS, ...(settings || {}) };
  const activeCount = TOGGLES.filter(t => current[t.key]).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full h-8 w-8 p-0 relative"
          aria-label="Automation settings"
          title="Automation settings"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
          {activeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-primary text-[8px] font-bold text-primary-foreground flex items-center justify-center leading-none">
              {activeCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg glass border-white/10 bg-background/95">
        <DialogHeader>
          <DialogTitle>⚙️ Automation</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-foreground/60 -mt-2">
          Hand routine decisions to your team. Everything stays manual until you switch it on.
        </p>
        <div className="space-y-2 mt-2">
          {TOGGLES.map(t => (
            <div
              key={t.key}
              className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-[11px] text-foreground/60 mt-0.5">{t.help}</div>
              </div>
              <Switch
                checked={!!current[t.key]}
                onCheckedChange={(v) => updateSettings({ [t.key]: v } as Partial<GameSettings>)}
                aria-label={t.label}
              />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
