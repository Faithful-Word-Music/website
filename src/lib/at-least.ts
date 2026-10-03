/**
 * Waits for `work`, but never returns sooner than `ms`. A save that takes
 * 40ms would otherwise flash "Saving…" too briefly to read.
 */
export async function atLeast<T>(work: Promise<T>, ms: number): Promise<T> {
  const [value] = await Promise.all([work, new Promise((resolve) => setTimeout(resolve, ms))]);
  return value;
}
