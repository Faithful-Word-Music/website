/**
 * How AI usage figures are written on a page: dollars, tokens, durations.
 * Pure, so the page and the tests share it.
 */

/**
 * Dollars. One request costs a fraction of a cent, so anything under a cent
 * keeps four decimals ("$0.0042") rather than rounding to "$0.00".
 */
export function formatUsd(amount: number): string {
  const digits = amount > 0 && amount < 0.01 ? 4 : 2;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatTokens(tokens: number): string {
  return tokens.toLocaleString("en-US");
}

/** "850 ms", "2.4 s", "1 min 5 s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** A share of the budget as a whole percentage: 0.126 -> "13%". Under 1% of something reads "<1%". */
export function formatShare(used: number): string {
  if (used > 0 && used < 0.01) return "<1%";
  return `${Math.round(used * 100)}%`;
}
