import transporterBridgeHero from "@/assets/transporter-bridge-hero.jpg";
import { GameClock } from "@/components/ui/game-clock";

interface HeroHeaderProps {
  monthsPlayed: number;
  timeUntilNextMonth: number;
}

export function HeroHeader({ monthsPlayed, timeUntilNextMonth }: HeroHeaderProps) {
  return (
    <div
      className="relative h-[120px] md:h-[160px] bg-cover bg-center flex items-end"
      style={{ backgroundImage: `url(${transporterBridgeHero})` }}
    >
      <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
      <div className="relative w-full px-4 pb-3 pt-6 md:pt-8">
        <div className="container mx-auto">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight gradient-text">
                Property Tycoon 🏘️
              </h1>
              <p className="hidden md:block text-sm text-muted-foreground mt-0.5">
                Build your empire, one house at a time!
              </p>
            </div>
            <div className="flex-1 min-w-[200px] max-w-sm">
              <GameClock
                monthsPlayed={monthsPlayed}
                timeUntilNextMonth={timeUntilNextMonth}
                inline
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
