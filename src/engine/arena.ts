import { wilsonRange } from './patterns';

export { wilsonRange };

/**
 * Break-even win rate for a given binary payout percentage.
 * breakEven(payoutPct) = 1 / (1 + payoutPct/100).
 */
export function breakEven(payoutPct: number): number {
  return 1 / (1 + payoutPct / 100);
}

/**
 * High-precision Lanczos approximation for log-gamma (ln(Gamma(x))).
 */
function logGamma(x: number): number {
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let base = c[0];
  for (let i = 1; i < 9; i++) {
    base += c[i] / (x + i);
  }
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(base);
}

/**
 * P(X >= wins) for X ~ Binomial(n, p0), summed in log space.
 * Exact for n up to 200,000 without overflow.
 * Return 1 if wins <= 0, 0 if wins > n.
 */
export function exactUpperP(wins: number, n: number, p0: number): number {
  if (wins <= 0) return 1;
  if (wins > n) return 0;
  if (n <= 0) return 0;
  if (p0 <= 0) return 0;
  if (p0 >= 1) return wins <= n ? 1 : 0;

  // Tail mode in [wins, n]
  const mode = Math.floor((n + 1) * p0);
  const kMax = Math.max(wins, Math.min(n, mode));

  const logP_max =
    logGamma(n + 1) -
    logGamma(kMax + 1) -
    logGamma(n - kMax + 1) +
    kMax * Math.log(p0) +
    (n - kMax) * Math.log(1 - p0);

  let sum = 1.0;

  // Sum downwards from kMax to wins
  let term = 1.0;
  for (let k = kMax; k > wins; k--) {
    term *= (k / (n - k + 1)) * ((1 - p0) / p0);
    sum += term;
    if (term < 1e-16) break;
  }

  // Sum upwards from kMax to n
  term = 1.0;
  for (let k = kMax; k < n; k++) {
    term *= ((n - k) / (k + 1)) * (p0 / (1 - p0));
    sum += term;
    if (term < 1e-16) break;
  }

  const pVal = sum * Math.exp(logP_max);
  return Math.min(1, Math.max(0, pVal));
}

/**
 * Inverse standard normal CDF (Acklam algorithm).
 * Full double-precision accuracy across entire [0, 1] range.
 */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.38357751867269e2,
    -3.066479806614716e1,
    2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838e0,
    -2.549732539343734e0,
    4.374664141464968e0,
    2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996e0,
    3.754408661907416e0,
  ];

  const p_low = 0.02425;
  const p_high = 1 - p_low;

  let q: number;
  let r: number;

  if (p < p_low) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  } else if (p <= p_high) {
    q = p - 0.5;
    r = q * q;
    return (
      (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
      q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}

/**
 * Calculates effective sample size neff and design effect DE.
 * Batch key = floor(t/86400000) (daily) or floor(t/604800000) if weekly.
 * Only batches with at least 5 bets count; if fewer than 20 such batches, neff=null.
 */
export function effectiveN(
  outcomes: number[], // 1 win, 0 loss in chronological order
  entryTimes: number[],
  weekly: boolean
): { n: number; neff: number | null; de: number | null } {
  const n = outcomes.length;
  if (n === 0) {
    return { n: 0, neff: null, de: null };
  }

  const intervalMs = weekly ? 604800000 : 86400000;
  const batches = new Map<number, number[]>();

  for (let i = 0; i < n; i++) {
    const key = Math.floor(entryTimes[i] / intervalMs);
    let b = batches.get(key);
    if (!b) {
      b = [];
      batches.set(key, b);
    }
    b.push(outcomes[i]);
  }

  // Only batches with at least 5 bets count; if fewer than 20 such batches, neff=null
  const qualifyingBatches = Array.from(batches.values()).filter((b) => b.length >= 5);
  if (qualifyingBatches.length < 20) {
    return { n, neff: null, de: null };
  }

  const totalWins = outcomes.reduce((acc, v) => acc + v, 0);
  const pHat = totalWins / n;

  // Mean batch size
  const meanBatchSize =
    qualifyingBatches.reduce((acc, b) => acc + b.length, 0) / qualifyingBatches.length;

  // Batch win rates and sample variance
  const batchWinRates = qualifyingBatches.map((b) => b.reduce((acc, v) => acc + v, 0) / b.length);
  const M = batchWinRates.length;
  const meanW = batchWinRates.reduce((acc, v) => acc + v, 0) / M;
  const sampleVariance = batchWinRates.reduce((acc, v) => acc + (v - meanW) ** 2, 0) / (M - 1);

  let DE_batch = 1;
  if (pHat > 0 && pHat < 1) {
    const de_raw = (meanBatchSize * sampleVariance) / (pHat * (1 - pHat));
    DE_batch = Math.max(1, de_raw);
  }

  let DE_acf = 1;
  if (n >= 50) {
    const mu = pHat;
    let c0 = 0;
    for (let i = 0; i < n; i++) {
      c0 += (outcomes[i] - mu) ** 2;
    }
    if (c0 > 0) {
      let acfSum = 0;
      for (let k = 1; k <= 10; k++) {
        let ck = 0;
        for (let i = 0; i < n - k; i++) {
          ck += (outcomes[i] - mu) * (outcomes[i + k] - mu);
        }
        const rho_k = ck / c0;
        acfSum += (1 - k / 11) * rho_k;
      }
      DE_acf = Math.max(1, 1 + 2 * acfSum);
    }
  }

  const DE = Math.max(DE_batch, DE_acf);
  const neff = n / DE;

  return { n, neff, de: DE };
}

/**
 * Status labels (exact, first match wins):
 * - N < 30: 'TOO EARLY'
 * - neff is null or neff < 300: 'COLLECTING'
 * - bound < 0: 'NO EDGE FOUND'
 * - neff >= 3000 and pValue <= 0.05 and thirdsAbove >= 2: 'CANDIDATE (unconfirmed)'
 * - Otherwise: 'NOT PROVEN'
 */
export function trialStatus(
  N: number,
  neff: number | null,
  bound: number,
  pValue: number,
  thirdsAbove: number
): string {
  if (N < 30) return 'TOO EARLY';
  if (neff === null || neff < 300) return 'COLLECTING';
  if (bound < 0) return 'NO EDGE FOUND';
  if (neff >= 3000 && pValue <= 0.05 && thirdsAbove >= 2) return 'CANDIDATE (unconfirmed)';
  return 'NOT PROVEN';
}
