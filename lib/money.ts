/**
 * Money helpers. All arithmetic is done in integer cents so totals are exact.
 * The database (numeric(12,2)) is the source of truth for placed orders; these
 * functions mirror its rounding so the chat preview always matches the invoice.
 */

export function toCents(value: number | string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${value}`);
  return Math.round(n * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Round half away from zero, same as Postgres round(numeric, 2). */
export function percentOfCents(cents: number, ratePercent: number): number {
  // rate has at most 2 decimals -> work in basis points to stay in integers
  const bps = Math.round(ratePercent * 100);
  const raw = cents * bps; // cents * (rate*100)
  const q = raw / 10000;
  return Math.sign(q) * Math.round(Math.abs(q));
}

export function formatMoney(amount: number | string, currency = "USD"): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
