import { useGameStore } from "@/stores/gameStore";
import { CourtProgressDialog } from "./court-progress-dialog";
import type { DebtRecoveryCase } from "@/types/game";

/**
 * Phase 5 #13 — auto-popup for the most recently resolved court case.
 * Queue is processed one at a time.
 */
export function CourtResolutionModal() {
  const pending = (useGameStore((s: any) => s.pendingCourtResolutions) || []) as string[];
  const cases = (useGameStore((s: any) => s.debtRecoveryCases) || []) as DebtRecoveryCase[];
  const currentMonth = useGameStore((s: any) => s.monthsPlayed) as number;
  const dismiss = useGameStore((s: any) => s.dismissCourtResolution);

  const nextId = pending[0];
  if (!nextId) return null;
  const caseRecord = cases.find((c) => c.id === nextId);
  if (!caseRecord) {
    // Stale id — drop it.
    dismiss(nextId);
    return null;
  }

  return (
    <CourtProgressDialog
      open={true}
      onOpenChange={(o) => { if (!o) dismiss(nextId); }}
      caseRecord={caseRecord}
      currentMonth={currentMonth}
    />
  );
}
