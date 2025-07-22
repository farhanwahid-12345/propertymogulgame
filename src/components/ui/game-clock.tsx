import { Clock } from "lucide-react";
import { Card } from "./card";

interface GameClockProps {
  monthsPlayed: number;
  timeUntilNextMonth: number; // seconds until next month
}

export function GameClock({ monthsPlayed, timeUntilNextMonth }: GameClockProps) {
  const year = Math.floor(monthsPlayed / 12) + 2024;
  const month = (monthsPlayed % 12) + 1;
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const progress = ((180 - timeUntilNextMonth) / 180) * 100; // 3 minutes = 180 seconds

  return (
    <Card className="p-4 bg-gradient-to-r from-background to-muted/50">
      <div className="flex items-center gap-3">
        <Clock className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-lg">
              {monthNames[month - 1]} {year}
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.ceil(timeUntilNextMonth)}s until next month
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}