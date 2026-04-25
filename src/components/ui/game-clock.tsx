import { Clock } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { cn } from "@/lib/utils";

interface GameClockProps {
  monthsPlayed: number;
  timeUntilNextMonth: number;
  inline?: boolean;
}

const SPEED_OPTIONS = [
  { value: 0.5, label: "0.5×" },
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
  { value: 4, label: "4×" },
];

function SpeedSelector({ compact = false }: { compact?: boolean }) {
  const gameSpeed = useGameStore((s) => s.gameSpeed);
  const setGameSpeed = useGameStore((s) => s.setGameSpeed);

  return (
    <div className={cn(
      "inline-flex items-center gap-0.5 rounded-full border border-border/50 bg-muted/50 p-0.5",
      compact ? "scale-90" : ""
    )}>
      {SPEED_OPTIONS.map((opt) => {
        const active = Math.abs(gameSpeed - opt.value) < 0.01;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setGameSpeed(opt.value)}
            aria-pressed={active}
            aria-label={`Set game speed to ${opt.label}`}
            className={cn(
              "px-2 py-0.5 text-[10px] font-semibold rounded-full transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function GameClock({ monthsPlayed, timeUntilNextMonth, inline = false }: GameClockProps) {
  const year = Math.floor(monthsPlayed / 12) + 2024;
  const month = (monthsPlayed % 12) + 1;
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const progress = ((180 - timeUntilNextMonth) / 180) * 100;

  if (inline) {
    return (
      <div className="flex items-center gap-3 w-full">
        <Clock className="h-4 w-4 text-primary shrink-0" />
        <span className="font-semibold text-sm text-foreground">
          📅 {monthNames[month - 1]} {year}
        </span>
        <div className="flex-1 bg-muted rounded-full h-2 min-w-[60px]">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-1000 animate-pulse-glow"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {Math.ceil(timeUntilNextMonth)}s
        </span>
        <SpeedSelector compact />
      </div>
    );
  }

  return (
    <div className="glass p-4">
      <div className="flex items-center gap-3">
        <Clock className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-lg">
              📅 {monthNames[month - 1]} {year}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {Math.ceil(timeUntilNextMonth)}s until next month
              </span>
              <SpeedSelector />
            </div>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-1000 animate-pulse-glow"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
