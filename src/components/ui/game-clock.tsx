import { Clock } from "lucide-react";

interface GameClockProps {
  monthsPlayed: number;
  timeUntilNextMonth: number;
  inline?: boolean;
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
        <div className="flex-1 bg-muted rounded-full h-2 min-w-[80px]">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-1000 animate-pulse-glow"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {Math.ceil(timeUntilNextMonth)}s
        </span>
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
            <span className="text-sm text-muted-foreground">
              {Math.ceil(timeUntilNextMonth)}s until next month
            </span>
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
