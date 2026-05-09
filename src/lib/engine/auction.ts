/**
 * Pure auction-sale simulator (seller side).
 *
 * Models a small pool of bidders with private valuations around fair value.
 * Bidders only show up if the reserve looks reasonable vs fair value, and
 * the lot fails to sell when even the highest valuation is below reserve.
 */

export interface SimulateAuctionInput {
  /** Player's pre-auction "fair value" in pounds. */
  fairValue: number;
  /** Reserve price set by seller, pounds. */
  reservePrice: number;
  /** Guide price advertised, pounds (currently informational). */
  guidePrice?: number;
}

export interface SimulateAuctionResult {
  /** True if the lot sold (top bidder met reserve). */
  sold: boolean;
  /** Hammer price in pounds if sold, else 0. */
  hammerPrice: number;
  /** Number of bidders who turned up. */
  bidderCount: number;
  /** Top valuation in the pool (informational, even if below reserve). */
  topValuation: number;
}

/** Random integer in [min, max] inclusive. */
function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function simulateAuctionSale(input: SimulateAuctionInput): SimulateAuctionResult {
  const fair = Math.max(1, input.fairValue);
  const reserve = Math.max(0, input.reservePrice);
  const ratio = reserve / fair;

  // Bidder pool size scales with how reasonable the reserve looks.
  let bidderCount: number;
  if (ratio < 0.85) bidderCount = randInt(6, 10);          // hot
  else if (ratio < 1.05) bidderCount = randInt(3, 6);      // normal
  else if (ratio < 1.20) bidderCount = randInt(1, 3);      // cool
  else bidderCount = randInt(0, 1);                         // cold

  if (bidderCount === 0) {
    return { sold: false, hammerPrice: 0, bidderCount: 0, topValuation: 0 };
  }

  // Each bidder has a private valuation centered on fair value.
  const valuations: number[] = [];
  for (let i = 0; i < bidderCount; i++) {
    const mult = 0.9 + Math.random() * 0.25; // 0.9× – 1.15×
    valuations.push(Math.round(fair * mult));
  }
  valuations.sort((a, b) => b - a);
  const topValuation = valuations[0];
  const secondValuation = valuations[1] ?? Math.round(topValuation * 0.92);

  if (topValuation < reserve) {
    return { sold: false, hammerPrice: 0, bidderCount, topValuation };
  }

  // Ascending auction: winner pays max(reserve, second-highest + small increment).
  const increment = Math.max(500, Math.round(fair * 0.005));
  const hammer = Math.max(reserve, Math.min(topValuation, secondValuation + increment));
  return { sold: true, hammerPrice: hammer, bidderCount, topValuation };
}
