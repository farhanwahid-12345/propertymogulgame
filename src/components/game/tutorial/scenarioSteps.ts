import type { TutorialStep } from "@/stores/tutorialStore";

/**
 * Tutorial helper — request the page-level Tabs to switch via a window event
 * that Index.tsx listens for. Keeps `beforeStep: () => void` signature clean.
 */
function setTab(tab: "market" | "bank" | "accounts") {
  try {
    window.dispatchEvent(new CustomEvent("pm:set-active-tab", { detail: { tab } }));
  } catch {
    /* noop */
  }
}

/**
 * Phase 2 scripted 14-step tutorial scenario. The first 6 steps are interactive
 * (auto-advance on real game state changes); steps 7-12 are explanatory clicks
 * forward; step 13 is a centered congratulations modal.
 */
export const SCENARIO_STEPS: TutorialStep[] = [
  {
    id: "estate-agent-intro",
    title: "Step 1 · Estate Agent",
    body:
      "Your first move is to buy a property. Click Estate Agent to see what's available.",
    targetSelector: '[data-tutorial="estate-agent-btn"]',
    tooltipSide: "bottom",
    advance: "event",
    advanceEvent: "pm:estate-agent-opened",
    beforeStep: () => setTab("market"),
  },
  {
    id: "pick-property",
    title: "Step 2 · Pick a property",
    body:
      "Each listing shows the price, average yield, city, and type. Click any property to see the full purchase details.",
    targetSelector: '[data-tutorial="ea-first-card"]',
    tooltipSide: "right",
    advance: "event",
    advanceEvent: "pm:estate-agent-property-selected",
  },
  {
    id: "ltv-and-costs",
    title: "Step 3 · LTV and costs",
    body:
      "Stamp duty and solicitor fees are charged on completion — not shown in the price. The LTV slider sets your mortgage size: lower LTV means less borrowed but more cash upfront. Click Buy when ready.",
    targetSelector: '[data-tutorial="ea-cost-breakdown"]',
    tooltipSide: "left",
    advance: "event",
    advanceEvent: "pm:purchase-initiated",
  },
  {
    id: "conveyancing",
    title: "Step 4 · Conveyancing in progress",
    body:
      "Your purchase is now in conveyancing — typically 6-12 weeks. The clock runs automatically. Speed it up using the 4× button above.",
    targetSelector: '[data-tutorial="ops-conveyancing"]',
    tooltipSide: "top",
    advance: "event",
    advanceEvent: "pm:conveyancing-complete",
    beforeStep: () => {
      setTab("bank");
      try {
        window.dispatchEvent(
          new CustomEvent("pm:open-operations", { detail: { tab: "conveyancing" } }),
        );
      } catch {
        /* noop */
      }
    },
  },
  {
    id: "select-tenant",
    title: "Step 5 · Select a tenant",
    body:
      "Your property is ready. Select a tenant from your applicants — each has a rental offer range. Run reference checks first to see credit history and right-to-rent status.",
    targetSelector: '[data-tutorial="select-tenant-btn"]',
    tooltipSide: "top",
    advance: "event",
    advanceEvent: "pm:tenant-selected",
  },
  {
    id: "rent-incoming",
    title: "Step 6 · Rent incoming",
    body:
      "Rent arrives at every month end. Expenses — mortgage, council tax, insurance — are deducted at the same time. Speed up time to collect your first payment.",
    targetSelector: '[data-tutorial="property-rent-display"]',
    tooltipSide: "right",
    advance: "event",
    advanceEvent: "pm:month-end-completed",
  },
  {
    id: "cashflow-stat",
    title: "Step 7 · Cash Flow",
    body:
      "Your monthly cashflow updates here. 'In' is all rent received, 'Out' is all expenses. Keep this positive or your overdraft kicks in.",
    targetSelector: '[data-tutorial="cashflow-stat"]',
    tooltipSide: "bottom",
    advance: "button",
  },
  {
    id: "concerns",
    title: "Step 8 · Concerns and satisfaction",
    body:
      "Tenants raise concerns when repairs are needed. Ignoring them tanks satisfaction. Below 40%, they may leave mid-tenancy. Respond within 1 month.",
    targetSelector: '[data-tutorial="ops-concerns"]',
    tooltipSide: "top",
    advance: "button",
    beforeStep: () => {
      setTab("bank");
      try {
        window.dispatchEvent(
          new CustomEvent("pm:open-operations", { detail: { tab: "concerns" } }),
        );
      } catch {
        /* noop */
      }
    },
  },
  {
    id: "epc",
    title: "Step 9 · EPC rating",
    body:
      "Every property has an EPC rating A-G. From 2030 (month 72 in game), properties rated D or below cannot be re-let legally. Renovate to improve — insulation, central heating, and double glazing all help.",
    targetSelector: '[data-tutorial="property-epc-badge"]',
    tooltipSide: "right",
    advance: "button",
  },
  {
    id: "renovate",
    title: "Step 10 · Renovation",
    body:
      "Open Renovate to add value, improve EPC, extend, or convert. Extensions and conversions need planning permission first — submit then wait for approval.",
    targetSelector: '[data-tutorial="renovate-btn"]',
    tooltipSide: "top",
    advance: "button",
  },
  {
    id: "bank",
    title: "Step 11 · Bank and refinancing",
    body:
      "As your property rises in value, refinance with a larger mortgage to pull out equity as cash — your deposit for the next purchase. This is the engine of portfolio growth.",
    targetSelector: '[data-tutorial="bank-tab"]',
    tooltipSide: "bottom",
    advance: "button",
    beforeStep: () => setTab("bank"),
  },
  {
    id: "tax",
    title: "Step 12 · Tax",
    body:
      "Every April your tax bill is calculated. As a sole trader, Section 24 limits mortgage interest relief to a 20% credit. As a limited company, interest is fully deductible. Check the Accounts tab each April.",
    targetSelector: '[data-tutorial="accounts-tab"]',
    tooltipSide: "bottom",
    advance: "button",
    beforeStep: () => setTab("accounts"),
  },
  {
    id: "commercial-arrears",
    title: "Step 13 · Commercial rent arrears",
    body:
      "Commercial tenants sit outside the Renters' Rights Act. At 21 days (1 month) unpaid you can forfeit the lease by peaceable re-entry — instant, but roughly 1 in 3 tenants win relief from forfeiture. At 2+ months you can instead take the court route: 1 month formal demand, then a 2-5 month possession backlog, but far harder to overturn. Both are served from Operations → Evictions, and possession ends the lease so the unit goes vacant and re-marketing starts.",
    targetSelector: '[data-tutorial="ops-evictions"]',
    tooltipSide: "bottom",
    advance: "button",
    beforeStep: () => setTab("market"),
  },
  {
    id: "done",
    title: "You're ready 🏘️",
    body:
      "You're ready to build your empire. Buy more properties, place tenants, manage concerns, and grow your net worth to £500,000. Good luck.",
    targetSelector: "",
    tooltipSide: "bottom",
    advance: "button",
    isFinal: true,
  },
];
