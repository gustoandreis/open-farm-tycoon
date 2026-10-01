export function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return v < min ? min : v > max ? max : v;
}

export function round(v: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** Guarantees a finite number (protects money/stock against NaN/Infinity). */
export function finite(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function sum(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

/** Fixed-payment (Price table) installment. rate is per period. */
export function annuityPayment(principal: number, ratePerPeriod: number, periods: number): number {
  if (periods <= 0) return principal;
  if (ratePerPeriod <= 0) return principal / periods;
  const f = Math.pow(1 + ratePerPeriod, periods);
  return (principal * ratePerPeriod * f) / (f - 1);
}
