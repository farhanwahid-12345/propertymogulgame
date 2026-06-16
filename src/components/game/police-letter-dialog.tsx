import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Siren } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import type { PoliceLetter } from "@/types/game";

const CITY_COUNCILS: Record<string, string> = {
  middlesbrough: "Middlesbrough Borough Council",
  leeds: "Leeds City Council",
  manchester: "Manchester City Council",
  london: "Greater London Authority",
};

/**
 * Phase 5 #12 — Official ASB letter pop-up.
 * One letter per concern; the player either acknowledges or jumps straight
 * into eviction proceedings.
 */
export function PoliceLetterDialog() {
  const letters = (useGameStore((s: any) => s.pendingPoliceLetters) || []) as PoliceLetter[];
  const dismiss = useGameStore((s: any) => s.dismissPoliceLetter);
  const evictTenant = useGameStore((s: any) => s.evictTenant);
  const letter = letters[0];

  if (!letter) return null;

  const council = CITY_COUNCILS[letter.city ?? "middlesbrough"] ?? "Local Borough Council";

  const handleBeginEviction = () => {
    evictTenant?.(letter.propertyId, "antisocial_behaviour", 0);
    dismiss(letter.id);
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) dismiss(letter.id); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <Siren className="h-5 w-5" />
            Notice of Antisocial Behaviour Complaint
          </DialogTitle>
        </DialogHeader>

        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 space-y-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {council} — Community Safety Unit
            </div>
            <p>
              Dear Landlord,
            </p>
            <p>
              A formal complaint of antisocial behaviour has been received in relation to your
              property at <span className="font-semibold text-foreground">{letter.propertyName}</span>,
              currently occupied by{" "}
              <span className="font-semibold text-foreground">{letter.tenantName}</span>.
            </p>
            <p className="text-muted-foreground italic">
              "{letter.description}"
            </p>
            <p>
              Under the Antisocial Behaviour, Crime and Policing Act 2014, landlords are expected
              to take reasonable steps to address ongoing concerns. Continued breaches may result
              in enforcement action against the property.
            </p>
            <p className="text-xs text-muted-foreground">
              Reference: ASB/{letter.month}/{letter.propertyId.slice(-4).toUpperCase()}
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => dismiss(letter.id)}>
            Acknowledge
          </Button>
          <Button variant="destructive" onClick={handleBeginEviction}>
            Begin Eviction Proceedings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
