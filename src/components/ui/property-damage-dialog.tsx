import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

interface PropertyDamageDialogProps {
  open: boolean;
  propertyName: string;
  repairCost: number;
  playerCash: number;
  onPayCash: () => void;
  onTakeLoan: () => void;
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
  const hasEnoughCash = playerCash >= repairCost;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-warning" />
            <AlertDialogTitle>Property Damage</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-2">
            <p>
              Your tenant has caused damage to <strong>{propertyName}</strong>.
            </p>
            <p className="text-lg font-semibold text-foreground">
              Repair Cost: £{repairCost.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">
              Your available cash: £{playerCash.toLocaleString()}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {hasEnoughCash ? (
            <>
              <AlertDialogCancel onClick={onCancel}>Dismiss</AlertDialogCancel>
              <AlertDialogAction onClick={onPayCash}>
                Pay £{repairCost.toLocaleString()}
              </AlertDialogAction>
            </>
          ) : (
            <>
              <AlertDialogCancel onClick={onCancel}>Dismiss</AlertDialogCancel>
              <AlertDialogAction onClick={onTakeLoan}>
                Take Bank Loan
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}