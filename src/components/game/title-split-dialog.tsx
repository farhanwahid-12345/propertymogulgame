import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

/**
 * Phase 4 #2 — Title-split picker.
 * Replaces the legacy window.confirm() prompt with a proper dialog so
 * players can pick the ground-rent regime before splitting a flat.
 */
interface Props {
  propertyId: string;
  propertyName: string;
  slotIndex: number;
  unitValuePounds?: number;
  onConfirm: (
    propertyId: string,
    slotIndex: number,
    groundRentMode: "peppercorn" | "percent"
  ) => void;
  /** Replaces the default trigger button. */
  trigger?: React.ReactNode;
}

export function TitleSplitDialog({
  propertyId,
  propertyName,
  slotIndex,
  unitValuePounds,
  onConfirm,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"peppercorn" | "percent">("peppercorn");

  const annualPercentPounds =
    unitValuePounds && unitValuePounds > 0
      ? Math.round(unitValuePounds * 0.005)
      : null;

  const handleConfirm = () => {
    onConfirm(propertyId, slotIndex, mode);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-[10px] h-6"
          >
            Title-split this flat
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Title-split Flat {slotIndex + 1}</DialogTitle>
          <DialogDescription>
            Splits "{propertyName}" Flat {slotIndex + 1} into its own
            leasehold property. Solicitor fee £600. Service charge is set
            automatically (2–5% of value/yr).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Ground rent
          </Label>
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as "peppercorn" | "percent")}
            className="space-y-2"
          >
            <label
              htmlFor="gr-peppercorn"
              className="flex items-start gap-3 rounded-md border border-border/60 p-3 cursor-pointer hover:bg-muted/30"
            >
              <RadioGroupItem id="gr-peppercorn" value="peppercorn" />
              <div className="flex-1">
                <div className="text-sm font-medium">Peppercorn — £10/yr</div>
                <div className="text-xs text-muted-foreground">
                  Standard modern lease. Tenant-friendly, easier to resell.
                </div>
              </div>
            </label>
            <label
              htmlFor="gr-percent"
              className="flex items-start gap-3 rounded-md border border-border/60 p-3 cursor-pointer hover:bg-muted/30"
            >
              <RadioGroupItem id="gr-percent" value="percent" />
              <div className="flex-1">
                <div className="text-sm font-medium">
                  0.5% of value / yr
                  {annualPercentPounds !== null && (
                    <span className="ml-2 text-muted-foreground">
                      (~£{annualPercentPounds.toLocaleString()}/yr)
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Higher income, but flagged as onerous on resale.
                </div>
              </div>
            </label>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Split flat (£600)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
