import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Wrench, RefreshCw, Hammer } from "lucide-react";

interface PropertyDamageDialogProps {
  open: boolean;
  propertyName: string;
  repairCost: number;
  playerCash: number;
  onPayCash: (cost: number) => void;
  onTakeLoan: (cost: number) => void;
  onCancel: () => void;
}

export function PropertyDamageDialog({
  open,
  propertyName,
  repairCost,
  playerCash,
  onPayCash,
  onTakeLoan,
  onCancel
}: PropertyDamageDialogProps) {
  // Calculate different repair level costs
  const quickFixCost = Math.floor(repairCost * 0.5);
  const reconditionCost = Math.floor(repairCost * 0.75);
  const fullReplacementCost = repairCost;

  const handleRepairChoice = (cost: number) => {
    if (playerCash >= cost) {
      onPayCash(cost);
    } else {
      onTakeLoan(cost);
    }
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-warning" />
            <AlertDialogTitle>Property Damage at {propertyName}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-4">
            <p>
              Your tenant has caused damage requiring repairs. Choose your repair option:
            </p>
            <p className="text-sm text-muted-foreground">
              Available cash: £{playerCash.toLocaleString()}
            </p>

            {/* Repair Options */}
            <div className="grid gap-3 mt-4">
              {/* Quick Fix */}
              <Card className="p-4 hover:border-primary transition-colors cursor-pointer" 
                    onClick={() => handleRepairChoice(quickFixCost)}>
                <div className="flex items-start gap-3">
                  <Wrench className="h-5 w-5 text-orange-500 mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold">Quick Fix</h4>
                      <span className="text-lg font-bold">£{quickFixCost.toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Basic repairs to make it functional. Budget-friendly but temporary solution.
                    </p>
                    <div className="mt-2 text-xs text-muted-foreground">
                      ⚠️ May need attention again sooner
                    </div>
                  </div>
                </div>
              </Card>

              {/* Recondition */}
              <Card className="p-4 hover:border-primary transition-colors cursor-pointer border-primary/50" 
                    onClick={() => handleRepairChoice(reconditionCost)}>
                <div className="flex items-start gap-3">
                  <RefreshCw className="h-5 w-5 text-blue-500 mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold">Recondition</h4>
                      <span className="text-lg font-bold">£{reconditionCost.toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Professional refurbishment. Good quality repairs that restore functionality.
                    </p>
                    <div className="mt-2 text-xs text-green-600">
                      ✓ Recommended - Best value for money
                    </div>
                  </div>
                </div>
              </Card>

              {/* Full Replacement */}
              <Card className="p-4 hover:border-primary transition-colors cursor-pointer" 
                    onClick={() => handleRepairChoice(fullReplacementCost)}>
                <div className="flex items-start gap-3">
                  <Hammer className="h-5 w-5 text-purple-500 mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold">Full Replacement</h4>
                      <span className="text-lg font-bold">£{fullReplacementCost.toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Complete rebuild with new materials. Premium quality like-new condition.
                    </p>
                    <div className="mt-2 text-xs text-purple-600">
                      ✨ Premium - Highest quality and longevity
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Decide Later
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}