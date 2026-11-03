/**
 * How long each of the Dashboard's reads takes, for measuring - logged only
 * with DASHBOARD_TIMING=1 (local or preview), as
 * "[dashboard:timing] music 212ms". Off, it just runs the work.
 */

const enabled = () => process.env.DASHBOARD_TIMING === "1";

export async function timed<T>(label: string, work: Promise<T> | (() => Promise<T>)): Promise<T> {
  if (!enabled()) return typeof work === "function" ? work() : work;
  const started = performance.now();
  try {
    return await (typeof work === "function" ? work() : work);
  } finally {
    console.log(`[dashboard:timing] ${label} ${Math.round(performance.now() - started)}ms`);
  }
}
