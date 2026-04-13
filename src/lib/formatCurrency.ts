// All monetary values are stored as integers (pennies).
// Use these helpers at the rendering boundary.

/** Convert pounds (float) to pennies (integer). */
export function toPennies(pounds: number): number {
  return Math.round(pounds * 100);
}

/** Convert pennies (integer) to pounds (float). */
export function fromPennies(pennies: number): number {
  return pennies / 100;
}

/** Format pennies as a GBP string, e.g. "£250,000". */
export function formatPounds(pennies: number): string {
  const pounds = pennies / 100;
  return `£${pounds.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

/** Format pennies as a GBP string with pence, e.g. "£1,234.56". */
export function formatPoundsPence(pennies: number): string {
  const pounds = pennies / 100;
  return `£${pounds.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
