export const SL_FINDERS = ['coin', 'mom5', 'rev5', 'flow10'] as const;
export const SL_HORIZONS = [5, 15, 30] as const;
export const SL_VERSION = 'v1';
export const SL_MAX_DELAY_MS = 2000;

export function slTrialId(finderId: string, sym: string, h: number): string {
  return finderId + '|v1|binance|' + sym + '|h' + h;
}

export function slBreakEven(payoutPct: number): number {
  return 1 / (1 + payoutPct / 100);
}

export function slExactUpperP(wins: number, n: number, p0: number): number {
  if (wins <= 0) return 1;
  if (wins > n) return 0;
  if (p0 <= 0) return 0;
  if (p0 >= 1) return 1;

  const logFact = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) {
    logFact[i] = logFact[i - 1] + Math.log(i);
  }

  const lp = Math.log(p0);
  const lq = Math.log(1 - p0);

  let maxL = -Infinity;
  const count = n - wins + 1;
  const lprobs = new Float64Array(count);

  for (let k = wins; k <= n; k++) {
    const lpk = logFact[n] - logFact[k] - logFact[n - k] + k * lp + (n - k) * lq;
    lprobs[k - wins] = lpk;
    if (lpk > maxL) maxL = lpk;
  }

  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += Math.exp(lprobs[i] - maxL);
  }

  const pVal = sum * Math.exp(maxL);
  return Math.min(1, Math.max(0, pVal));
}

export function slNormalQuantile(p: number): number {
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

export function slEffective(
  wins01: number[],
  times: number[]
): { n: number; neff: number | null; de: number | null } {
  const n = wins01.length;
  if (n === 0) {
    return { n: 0, neff: null, de: null };
  }

  const batches = new Map<number, { wins: number; total: number }>();
  for (let i = 0; i < n; i++) {
    const batchKey = Math.floor(times[i] / 3600000);
    const b = batches.get(batchKey) || { wins: 0, total: 0 };
    b.total += 1;
    if (wins01[i] === 1) b.wins += 1;
    batches.set(batchKey, b);
  }

  const validBatches: { wins: number; total: number }[] = [];
  for (const b of batches.values()) {
    if (b.total >= 20) {
      validBatches.push(b);
    }
  }

  if (validBatches.length < 24) {
    return { n, neff: null, de: null };
  }

  const meanBatchSize =
    validBatches.reduce((acc, b) => acc + b.total, 0) / validBatches.length;

  const rates = validBatches.map((b) => b.wins / b.total);
  const meanRate = rates.reduce((acc, r) => acc + r, 0) / rates.length;
  const sampleVar =
    rates.reduce((acc, r) => acc + Math.pow(r - meanRate, 2), 0) /
    (rates.length - 1);

  let totalWins = 0;
  for (let i = 0; i < n; i++) {
    if (wins01[i] === 1) totalWins++;
  }
  const pHat = totalWins / n;

  let de: number;
  if (pHat === 0 || pHat === 1) {
    de = 1;
  } else {
    de = Math.max(1, (meanBatchSize * sampleVar) / (pHat * (1 - pHat)));
  }

  const neff = n / de;
  return { n, neff, de };
}

export function slStatus(
  n: number,
  neff: number | null,
  bound: number,
  pValue: number,
  thirdsAbove: number
): 'TOO EARLY' | 'COLLECTING' | 'NO EDGE FOUND' | 'CANDIDATE (unconfirmed)' | 'NOT PROVEN' {
  if (n < 30) return 'TOO EARLY';
  if (neff === null || neff < 300) return 'COLLECTING';
  if (bound < 0) return 'NO EDGE FOUND';
  if (neff >= 3000 && pValue <= 0.05 && thirdsAbove >= 2) return 'CANDIDATE (unconfirmed)';
  return 'NOT PROVEN';
}
