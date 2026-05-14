import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface InfoTipProps {
  /** Short explanatory text shown on hover/tap. */
  text: string;
  /** Optional aria label override. */
  label?: string;
  className?: string;
  /** Icon size in px (default 12). */
  size?: number;
}

/**
 * Tiny `?`/info icon that renders a one-line explainer in a tooltip.
 * Use next to acronyms like LTV / DTI / ICR / Section 13 to demystify game mechanics.
 */
export function InfoTip({ text, label, className, size = 12 }: InfoTipProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label ?? "More info"}
            className={cn(
              "inline-flex items-center justify-center align-middle text-muted-foreground/70 hover:text-foreground transition-colors cursor-help",
              className,
            )}
          >
            <Info style={{ width: size, height: size }} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs leading-snug">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Canonical short explainers for game-mechanics jargon. */
export const TIP_TEXTS = {
  LTV: "Loan-to-Value: total mortgage debt as a % of property value. Most lenders cap BTL at 75%.",
  DTI: "Debt-to-Income: monthly debt payments vs rental income. Above 80% = high stress risk.",
  ICR: "Interest Coverage Ratio: rent ÷ mortgage interest. Lenders require ≥125% (145% for higher-rate taxpayers).",
  SECTION_13: "Section 13 of the Housing Act: the only legal route to raise rent on a sitting tenant. Capped at 3% under the new rules.",
  SECTION_24: "Section 24 of the Finance Act: restricts mortgage interest relief for individual landlords to a 20% basic-rate credit. LTD companies are exempt.",
  PLANNING_PERMISSION: "Major works (extensions, conversions) need Local Planning Authority approval. £400 fee + 2-3 month wait, ~70% chance of approval.",
  CGT: "Capital Gains Tax: 18% (basic) or 24% (higher) on profit from selling property, after £3,000 annual allowance and acquisition costs.",
  CREDIT_SCORE: "Affects mortgage rates and LTV caps. Below 600 = subprime, 750+ = best rates.",
} as const;
